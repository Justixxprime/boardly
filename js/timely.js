/* ==========================================================================
   BOARDLY - timely.js  ("v4: Timely" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/timely.js" defer></script>

   It reads the same `state`, `supabaseClient`, `moveTask`, `toast`, and
   `renderBoard` that dashboard.js already defines at the top level of the
   page - classic <script> tags on one page share a global scope, so no
   imports are needed. Everything here is defensive (checks typeof) so an
   older dashboard.js without the v4 SQL run yet won't throw.

   What this file adds:
     1. TIMEZONE-CORRECT SCHEDULING - reminders/auto-move times are stored
        against a real IANA timezone, converted to the right UTC instant
        (DST included) instead of silently using whatever zone the
        browser happens to be in.
     2. REAL ALERTS - a loud in-app siren + vibration + full-screen
        takeover when a reminder fires while the tab is open, plus Web
        Push registration so the server (send-push edge function) can
        wake the browser even when the tab is closed.
     3. AUTO-ADVANCE - tickets move todo -> inprogress -> done on their
        own once auto_start_at / auto_done_at (or a duration) passes,
        both instantly client-side and via the auto-advance edge
        function server-side so it still happens if the app is closed.
     4. Snooze, a "you missed this" catch-up banner, and small
        multi-timezone badges on cards with a reminder set.

   See TIMELY_SETUP.md for the one-time setup this depends on:
   schema_v4_timely.sql, VAPID keys, and the two new edge functions.
   ========================================================================== */

(function () {
  const HAS_STATE = typeof state !== "undefined";
  const HAS_SUPABASE = typeof supabaseClient !== "undefined";
  if (!HAS_STATE || !HAS_SUPABASE) return; // not on dashboard.html, nothing to do

  // Fill this in from TIMELY_SETUP.md (step "Generate VAPID keys").
  const VAPID_PUBLIC_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";

  const ALARM_SOUNDS = {
    siren: [880, 660, 880, 660],
    chime: [523, 659, 784],
    pulse: [440, 440, 440, 440, 440, 440],
  };

  const COMMON_ZONES = [
    "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "America/Sao_Paulo", "UTC", "Europe/London", "Europe/Paris", "Europe/Moscow",
    "Africa/Lagos", "Africa/Nairobi", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok",
    "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
  ];

  const TZ_LIST = (typeof Intl.supportedValuesOf === "function")
    ? Intl.supportedValuesOf("timeZone")
    : COMMON_ZONES;

  const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // -------------------------------------------------------------------------
  // TIMEZONE MATH
  // -------------------------------------------------------------------------

  /**
   * Turns a "wall clock" date+time typed in a specific IANA zone into the
   * one true UTC instant it refers to, DST included.
   * localDateTimeStr looks like "2026-08-10T00:30" (no offset - that's the
   * whole point, we're supplying the offset via timeZone).
   */
  function zonedTimeToUtc(localDateTimeStr, timeZone) {
    if (!localDateTimeStr) return null;
    const naiveUtc = new Date(localDateTimeStr + ":00Z".replace("::00Z", ":00Z"));
    // Re-render that instant as if viewed from the target zone and from
    // UTC, and use the difference as the zone's current offset (handles
    // DST because it's evaluated at that specific date, not "now").
    const asTz = new Date(naiveUtc.toLocaleString("en-US", { timeZone }));
    const asUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
    const offsetMs = asUtc.getTime() - asTz.getTime();
    return new Date(naiveUtc.getTime() + offsetMs);
  }

  /** Formats a UTC instant as a short local time string in a given zone. */
  function formatInZone(utcIso, timeZone) {
    if (!utcIso) return "";
    try {
      return new Date(utcIso).toLocaleTimeString("en-US", {
        timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });
    } catch (err) {
      return new Date(utcIso).toLocaleTimeString();
    }
  }

  /**
   * Next occurrence of a recurring "every weekday" / "every day" reminder,
   * evaluated in the task's own timezone rather than the browser's, so
   * "wake me at 12:30am USA time every weekday" keeps meaning 12:30am
   * Eastern (or whichever zone was chosen) no matter where you open the
   * app from, and correctly skips Sat/Sun in that zone.
   */
  function nextZonedOccurrence(currentUtcIso, timeZone, recurrence) {
    const tz = timeZone || BROWSER_TZ;
    const current = new Date(currentUtcIso);
    const hh = current.toLocaleString("en-US", { timeZone: tz, hour12: false, hour: "2-digit" }).padStart(2, "0");
    const mm = current.toLocaleString("en-US", { timeZone: tz, minute: "2-digit" }).padStart(2, "0");

    let cursor = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    for (let i = 0; i < 8; i++) {
      const y = cursor.toLocaleString("en-US", { timeZone: tz, year: "numeric" });
      const m = cursor.toLocaleString("en-US", { timeZone: tz, month: "2-digit" });
      const d = cursor.toLocaleString("en-US", { timeZone: tz, day: "2-digit" });
      const dow = new Date(`${y}-${m}-${d}T12:00:00Z`).getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      if (recurrence !== "weekdays" || !isWeekend) {
        return zonedTimeToUtc(`${y}-${m}-${d}T${hh}:${mm}`, tz);
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return null;
  }

  window.Timely = window.Timely || {};
  Object.assign(window.Timely, { zonedTimeToUtc, formatInZone, nextZonedOccurrence, TZ_LIST, BROWSER_TZ });

  // -------------------------------------------------------------------------
  // LOUD IN-APP ALARM (tab open)
  // -------------------------------------------------------------------------

  let audioCtx = null;
  let alarmStopFn = null;

  // iOS Safari (and Chrome's autoplay policy generally) refuses to make
  // sound from an AudioContext that wasn't started inside a direct tap -
  // an alarm firing from a background setTimeout doesn't count as one, so
  // without this it would show the alarm screen completely silently on
  // an iPhone. Any real tap anywhere in the app creates/resumes the
  // context ahead of time, so it's already unlocked by the time an
  // alarm actually needs to play.
  function unlockAudio() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  document.addEventListener("touchend", unlockAudio, { once: true, passive: true });
  document.addEventListener("click", unlockAudio, { once: true });

  function playSiren(pattern) {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    let stopped = false;
    let i = 0;
    function beep() {
      if (stopped) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = pattern[i % pattern.length];
      osc.type = "square";
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
      i++;
      if (!stopped) setTimeout(beep, 420);
    }
    beep();
    return () => { stopped = true; };
  }

  function showAlarmOverlay(task) {
    document.getElementById("timely-alarm-overlay")?.remove();
    const sound = ALARM_SOUNDS[soundForTask(task)] || ALARM_SOUNDS.siren;
    alarmStopFn?.();
    alarmStopFn = playSiren(sound);
    startEscalation(task);
    if (navigator.vibrate) {
      const pattern = [];
      for (let n = 0; n < 10; n++) pattern.push(400, 200);
      navigator.vibrate(pattern);
    }

    const overlay = document.createElement("div");
    overlay.id = "timely-alarm-overlay";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:9999",
      "background:rgba(10,8,20,0.96)", "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center", "color:#fff", "text-align:center",
      "padding:max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
      "box-sizing:border-box", "animation:timely-pulse 1s infinite", "touch-action:none",
    ].join(";");
    overlay.innerHTML = `
      <style>
        @keyframes timely-pulse{0%,100%{background:rgba(10,8,20,0.96)}50%{background:rgba(60,10,30,0.96)}}
        #timely-alarm-overlay button{ min-height:48px; touch-action:manipulation; }
        @media (max-width:420px){
          #timely-alarm-overlay .timely-title{ font-size:clamp(20px,6vw,26px) !important; }
          #timely-alarm-overlay .timely-btns{ flex-direction:column !important; width:100%; }
          #timely-alarm-overlay .timely-btns button{ width:100%; }
        }
      </style>
      <div style="font-size:13px;letter-spacing:.2em;opacity:.7;margin-bottom:10px">BOARDLY ALARM</div>
      <div class="timely-title" style="font-size:26px;font-weight:700;max-width:min(320px,88vw);margin-bottom:28px;word-break:break-word">${escapeForOverlay(task.title)}</div>
      <div class="timely-btns" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:360px">
        <button id="timely-snooze-btn" style="padding:14px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-size:15px">Snooze 10 min</button>
        <button id="timely-dismiss-btn" style="padding:14px 26px;border-radius:999px;border:none;background:#fff;color:#111;font-weight:700;font-size:15px">I'm up - stop</button>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById("timely-dismiss-btn").addEventListener("click", () => {
      stopAlarm();
      acknowledgeReminder(task.id);
    });
    document.getElementById("timely-snooze-btn").addEventListener("click", () => {
      stopAlarm();
      snoozeReminder(task.id, 10);
    });
  }

  function escapeForOverlay(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function stopAlarm() {
    alarmStopFn?.();
    alarmStopFn = null;
    stopEscalation();
    if (navigator.vibrate) navigator.vibrate(0);
    document.getElementById("timely-alarm-overlay")?.remove();
  }

  async function acknowledgeReminder(taskId) {
    await supabaseClient.from("tasks").update({
      reminder_acked_at: new Date().toISOString(), reminder_missed: false, reminder_push_count: 0,
    }).eq("id", taskId);
  }

  async function snoozeReminder(taskId, minutes) {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    const { error } = await supabaseClient.from("tasks").update({
      reminder_snoozed_until: until, reminder_push_sent_at: null, reminder_push_count: 0, reminder_acked_at: null,
    }).eq("id", taskId);
    if (!error) {
      const t = state.tasks.find((x) => x.id === taskId);
      if (t) { t.reminder_snoozed_until = until; t.reminder_push_sent_at = null; t.reminder_push_count = 0; }
      typeof toast === "function" && toast(`Snoozed ${minutes} min`, "ok");
      scheduleAllReminders();
    }
  }

  // -------------------------------------------------------------------------
  // CLIENT-SIDE TIMER LOOP (immediate feedback while tab open; the edge
  // functions are the real safety net for when it's closed)
  // -------------------------------------------------------------------------

  const reminderTimers = new Map();

  function scheduleAllReminders() {
    reminderTimers.forEach((t) => clearTimeout(t));
    reminderTimers.clear();
    (state.tasks || []).forEach((task) => {
      if (!task.reminder_at || task.status === "done") return;
      const snoozeMs = task.reminder_snoozed_until ? new Date(task.reminder_snoozed_until).getTime() - Date.now() : -1;
      const dueAt = snoozeMs > 0 ? new Date(task.reminder_snoozed_until).getTime() : new Date(task.reminder_at).getTime();
      const delay = dueAt - Date.now();
      if (delay < -60000 || delay > 24 * 60 * 60 * 1000) return; // too old or too far out - the timer loop is for "soon"
      const fire = Math.max(delay, 0);
      const timer = setTimeout(() => {
        const current = state.tasks.find((t) => t.id === task.id);
        if (!current || current.status === "done") return;
        showAlarmOverlay(current);
      }, fire);
      reminderTimers.set(task.id, timer);
    });
  }

  // -------------------------------------------------------------------------
  // AUTO-ADVANCE (client mirror of the auto-advance edge function)
  // -------------------------------------------------------------------------

  async function runAutoAdvanceTick() {
    const now = Date.now();
    const autoStartOnDue = localStorage.getItem("boardly-auto-start-on-due") === "1";
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const task of state.tasks || []) {
      if (task.status === "todo" && task.auto_start_at && new Date(task.auto_start_at).getTime() <= now) {
        if (typeof moveTask === "function") await moveTask(task.id, "inprogress", typeof nextPositionFor === "function" ? nextPositionFor("inprogress") : 0);
        if (task.auto_duration_minutes) {
          const doneAt = new Date(now + task.auto_duration_minutes * 60000).toISOString();
          await supabaseClient.from("tasks").update({ auto_done_at: doneAt }).eq("id", task.id);
          task.auto_done_at = doneAt;
        }
      } else if (
        autoStartOnDue && task.status === "todo" && !task.auto_start_at &&
        task.due_date && task.due_date <= todayStr
      ) {
        // Opt-in: a plain due date (no explicit auto-move time set) also
        // starts the ticket once that date arrives, instead of just
        // marking it overdue and leaving it sitting in To do.
        if (typeof moveTask === "function") await moveTask(task.id, "inprogress", typeof nextPositionFor === "function" ? nextPositionFor("inprogress") : 0);
      } else if (task.status === "inprogress" && task.auto_done_at && new Date(task.auto_done_at).getTime() <= now) {
        if (typeof moveTask === "function") await moveTask(task.id, "done", typeof nextPositionFor === "function" ? nextPositionFor("done") : 0);
      }
    }
  }

  // -------------------------------------------------------------------------
  // MISSED-ALARM CATCH-UP BANNER
  // -------------------------------------------------------------------------

  function showMissedBanner(tasks) {
    if (!tasks.length) return;
    document.getElementById("timely-missed-banner")?.remove();
    const bar = document.createElement("div");
    bar.id = "timely-missed-banner";
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9998;background:#f43f5e;color:#fff;padding:max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left));font-size:13px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;box-sizing:border-box";
    bar.innerHTML = `<span style="max-width:min(480px,80vw)">You missed ${tasks.length} reminder${tasks.length > 1 ? "s" : ""} while away, incl. "${escapeForOverlay(tasks[0].title)}"</span>
      <button id="timely-missed-ack" style="background:#fff;color:#f43f5e;border:none;border-radius:999px;padding:6px 14px;font-weight:700;min-height:32px;touch-action:manipulation">OK</button>`;
    document.body.appendChild(bar);
    document.getElementById("timely-missed-ack").addEventListener("click", async () => {
      bar.remove();
      for (const t of tasks) await acknowledgeReminder(t.id);
    });
  }

  function checkMissedReminders() {
    const now = Date.now();
    const missed = (state.tasks || []).filter((t) =>
      t.reminder_at && t.status !== "done" && !t.reminder_acked_at &&
      new Date(t.reminder_at).getTime() < now - 5 * 60000 &&
      new Date(t.reminder_at).getTime() > now - 24 * 60 * 60000
    );
    if (missed.length) showMissedBanner(missed);
    logMissed(missed);
  }

  // -------------------------------------------------------------------------
  // WEB PUSH REGISTRATION (real alerts when the tab is closed)
  // -------------------------------------------------------------------------

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function registerPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (VAPID_PUBLIC_KEY.startsWith("PASTE_")) return; // not configured yet, see TIMELY_SETUP.md
    if (Notification.permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      await supabaseClient.from("push_subscriptions").upsert({
        user_id: state.userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, { onConflict: "endpoint" });
    } catch (err) {
      console.warn("Timely: push registration failed", err);
    }
  }

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "boardly-snooze" && event.data.taskId) snoozeReminder(event.data.taskId, 10);
      if (event.data?.type === "boardly-alarm-open" && event.data.taskId) {
        const t = state.tasks.find((x) => x.id === event.data.taskId);
        if (t) showAlarmOverlay(t);
      }
    });
  }

  // -------------------------------------------------------------------------
  // MULTI-TIMEZONE BADGE - small helper other code can call when rendering
  // a card that has a reminder set, to show it in 2-3 zones at a glance.
  // -------------------------------------------------------------------------

  function multiZoneBadgeHtml(utcIso, ownerZone) {
    if (!utcIso) return "";
    const zones = [ownerZone || BROWSER_TZ, BROWSER_TZ, "UTC"].filter((z, i, arr) => arr.indexOf(z) === i);
    return zones.map((z) => `<span title="${z}">${formatInZone(utcIso, z)}</span>`).join(" · ");
  }
  Timely.multiZoneBadgeHtml = multiZoneBadgeHtml;

  // -------------------------------------------------------------------------
  // EDIT-MODAL FIELDS (timezone, auto-move, alarm sound, push opt-in)
  // Injected into the existing edit modal rather than requiring a manual
  // HTML edit, so this file is a true drop-in. Watches #edit-modal for the
  // "hidden" class coming off (dashboard.js's openEditModal does that as
  // its very last step, once state.editingId + all the built-in fields are
  // already set) to know when to populate, and saves on a capture-phase
  // submit listener so it reads state.editingId before dashboard.js's own
  // handler clears it.
  // -------------------------------------------------------------------------

  function injectTimelyEditFields() {
    if (document.getElementById("timely-edit-fields")) return;
    const anchor = document.getElementById("edit-reminder-field");
    if (!anchor) return;

    const zoneOptions = TZ_LIST.map((z) => `<option value="${z}">${z.replace(/_/g, " ")}</option>`).join("");
    const wrap = document.createElement("div");
    wrap.id = "timely-edit-fields";
    wrap.className = "hidden";
    wrap.innerHTML = `
      <label class="block text-xs text-ink-soft mb-1.5">Timezone (for the reminder above, and auto-move below)</label>
      <select id="timely-timezone" class="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-card focus:border-orange outline-none mb-4">
        ${zoneOptions}
      </select>

      <label class="block text-xs text-ink-soft mb-1.5">Alarm sound</label>
      <select id="timely-alarm-sound" class="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-card focus:border-orange outline-none mb-4">
        <option value="siren">Siren (loudest)</option>
        <option value="pulse">Pulse</option>
        <option value="chime">Chime (gentlest)</option>
      </select>

      <label class="block text-xs text-ink-soft mb-1.5">Auto-move to In progress at</label>
      <div class="flex items-center gap-2 mb-4">
        <input id="timely-auto-start" type="datetime-local" class="flex-1 border border-line rounded-lg px-3.5 py-2.5 text-sm bg-card focus:border-orange outline-none">
        <button type="button" id="timely-clear-auto-start" title="Clear" class="h-9 w-9 shrink-0 rounded-lg border border-line flex items-center justify-center text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark text-xs"></i></button>
      </div>

      <label class="block text-xs text-ink-soft mb-1.5">Then auto-move to Done...</label>
      <div class="flex items-center gap-2 mb-1">
        <select id="timely-auto-done-mode" class="border border-line rounded-lg px-2 py-2.5 text-sm bg-card focus:border-orange outline-none">
          <option value="">Never (manual)</option>
          <option value="duration">After a duration</option>
          <option value="fixed">At a fixed time</option>
        </select>
        <input id="timely-auto-duration" type="number" min="1" placeholder="minutes" class="hidden w-24 border border-line rounded-lg px-3 py-2.5 text-sm bg-card focus:border-orange outline-none">
        <input id="timely-auto-done-at" type="datetime-local" class="hidden flex-1 border border-line rounded-lg px-3.5 py-2.5 text-sm bg-card focus:border-orange outline-none">
      </div>
      <p class="text-[11px] text-ink-soft mb-4">Runs even if Boardly's closed - a server job checks every minute.</p>

      <button type="button" id="timely-enable-push" class="w-full text-left text-xs text-ink-soft hover:text-orange flex items-center gap-1.5 mb-3">
        <i class="fa-solid fa-bell w-3.5"></i><span id="timely-push-label">Turn on real alerts for this device</span>
      </button>

      <label class="flex items-center gap-2 text-xs text-ink-soft mb-3">
        <input id="timely-critical" type="checkbox" class="rounded border-line">
        Critical - also text me if I miss it
      </label>

      <div class="flex items-center gap-2">
        <button type="button" id="timely-download-ics" class="flex-1 toolbar-btn justify-center text-xs"><i class="fa-regular fa-calendar-plus mr-1"></i>Add to Calendar</button>
        <button type="button" id="timely-save-recurring-template" class="flex-1 toolbar-btn justify-center text-xs"><i class="fa-solid fa-repeat mr-1"></i>Save as template</button>
      </div>`;
    anchor.insertAdjacentElement("afterend", wrap);

    document.getElementById("timely-auto-done-mode").addEventListener("change", (e) => {
      document.getElementById("timely-auto-duration").classList.toggle("hidden", e.target.value !== "duration");
      document.getElementById("timely-auto-done-at").classList.toggle("hidden", e.target.value !== "fixed");
    });
    document.getElementById("timely-clear-auto-start").addEventListener("click", () => {
      document.getElementById("timely-auto-start").value = "";
    });
    document.getElementById("timely-enable-push").addEventListener("click", async () => {
      if (!("Notification" in window)) return;
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        await registerPush();
        document.getElementById("timely-push-label").textContent = "Real alerts are on for this device";
      } else {
        document.getElementById("timely-push-label").textContent = "Alerts blocked - enable in browser settings";
      }
    });
    document.getElementById("timely-critical").addEventListener("change", async (e) => {
      if (e.target.checked) {
        const phone = await ensureNotifyPhone();
        if (!phone) e.target.checked = false;
      }
    });
    document.getElementById("timely-download-ics").addEventListener("click", () => {
      const task = state.tasks.find((t) => t.id === state.editingId);
      if (task && task.reminder_at) downloadIcs(task);
      else typeof toast === "function" && toast("Set a reminder time first", "error");
    });
    document.getElementById("timely-save-recurring-template").addEventListener("click", () => {
      const task = state.tasks.find((t) => t.id === state.editingId);
      if (task) saveRecurringTemplate(task);
    });

    updatePushLabel();
  }

  function updatePushLabel() {
    const el = document.getElementById("timely-push-label");
    if (!el || !("Notification" in window)) return;
    el.textContent = Notification.permission === "granted"
      ? "Real alerts are on for this device"
      : "Turn on real alerts for this device";
  }

  function populateTimelyEditFields(task) {
    const wrap = document.getElementById("timely-edit-fields");
    if (!wrap) return;
    wrap.classList.toggle("hidden", !state.remindersReady && !task.auto_start_at);
    document.getElementById("timely-timezone").value = task.timezone || BROWSER_TZ;
    document.getElementById("timely-alarm-sound").value = task.alarm_sound || "siren";
    document.getElementById("timely-auto-start").value = task.auto_start_at ? toLocalInputValue(task.auto_start_at) : "";
    const mode = task.auto_duration_minutes ? "duration" : task.auto_done_at ? "fixed" : "";
    document.getElementById("timely-auto-done-mode").value = mode;
    document.getElementById("timely-auto-duration").value = task.auto_duration_minutes || "";
    document.getElementById("timely-auto-done-at").value = task.auto_done_at ? toLocalInputValue(task.auto_done_at) : "";
    document.getElementById("timely-auto-duration").classList.toggle("hidden", mode !== "duration");
    document.getElementById("timely-auto-done-at").classList.toggle("hidden", mode !== "fixed");
    document.getElementById("timely-critical").checked = !!task.critical;
    updatePushLabel();
  }

  function toLocalInputValue(utcIso) {
    const d = new Date(utcIso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function saveTimelyFields(taskId) {
    const timezone = document.getElementById("timely-timezone")?.value || BROWSER_TZ;
    const alarm_sound = document.getElementById("timely-alarm-sound")?.value || "siren";
    const startVal = document.getElementById("timely-auto-start")?.value || "";
    const mode = document.getElementById("timely-auto-done-mode")?.value || "";
    const durationVal = document.getElementById("timely-auto-duration")?.value || "";
    const doneVal = document.getElementById("timely-auto-done-at")?.value || "";

    const patch = {
      timezone,
      alarm_sound,
      auto_start_at: startVal ? zonedTimeToUtc(startVal, timezone).toISOString() : null,
      auto_duration_minutes: mode === "duration" && durationVal ? Number(durationVal) : null,
      auto_done_at: mode === "fixed" && doneVal ? zonedTimeToUtc(doneVal, timezone).toISOString() : null,
      critical: document.getElementById("timely-critical")?.checked || false,
    };

    // Also correct the plain reminder_at dashboard.js just saved in the
    // browser's local time - re-derive it against the chosen timezone
    // instead, so "12:30am" means 12:30am in that zone, not wherever the
    // browser happens to be sitting.
    const reminderInput = document.getElementById("edit-reminder-at")?.value;
    if (reminderInput) patch.reminder_at = zonedTimeToUtc(reminderInput, timezone).toISOString();

    const task = state.tasks.find((t) => t.id === taskId);
    if (task) Object.assign(task, patch);
    const { error } = await supabaseClient.from("tasks").update(patch).eq("id", taskId);
    if (error) {
      console.warn("Timely: couldn't save timezone/auto-move fields", error.message);
    } else {
      scheduleAllReminders();
      typeof renderBoard === "function" && renderBoard();
    }
  }

  function watchEditModal() {
    const modal = document.getElementById("edit-modal");
    if (!modal) return;
    injectTimelyEditFields();
    const observer = new MutationObserver(() => {
      if (!modal.classList.contains("hidden") && state.editingId) {
        const task = state.tasks.find((t) => t.id === state.editingId);
        if (task) populateTimelyEditFields(task);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });

    document.getElementById("edit-form")?.addEventListener(
      "submit",
      () => {
        const id = state.editingId; // captured here, before dashboard.js's own (bubble-phase) handler clears it
        if (id) saveTimelyFields(id);
      },
      true // capture phase - runs before dashboard.js's bubble-phase listener
    );
  }

  // -------------------------------------------------------------------------
  // AUTO-EXPANDING TEXT BOXES
  // quick-add, ticket title, and the AI message box used to be single-line
  // <input>s, so anything longer than the visible width just scrolled
  // sideways inside the box while you typed - hard to review before
  // sending. They're now <textarea rows="1">s in the HTML; this is what
  // grows them taller as you type (up to a cap, then it scrolls inside
  // itself) and shrinks them back down when cleared. Enter still submits
  // like a normal input did - Shift+Enter makes a new line instead.
  // -------------------------------------------------------------------------

  const AUTO_GROW_IDS = ["quick-add-input", "edit-title", "ai-input", "prompt-input"];
  // Grows but doesn't intercept Enter - these already have their own Enter
  // handling in dashboard.js (add a subtask, not submit the whole form
  // they happen to sit inside), so the generic submit-on-Enter behavior
  // below would wrongly submit that surrounding form instead.
  const AUTO_GROW_ONLY_IDS = ["edit-subtask-input"];

  function autoGrowResize(el) {
    const max = parseInt(el.style.maxHeight, 10) || 160;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, max);
    el.style.height = next + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }

  function setupAutoGrow() {
    AUTO_GROW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.tagName !== "TEXTAREA") return;
      autoGrowResize(el);
      el.addEventListener("input", () => autoGrowResize(el));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          const form = el.closest("form");
          if (form) {
            if (form.requestSubmit) form.requestSubmit();
            else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }
        }
      });
    });
    AUTO_GROW_ONLY_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.tagName !== "TEXTAREA") return;
      autoGrowResize(el);
      el.addEventListener("input", () => autoGrowResize(el));
    });
    // dashboard.js clears these fields programmatically in several places
    // (after a successful add, closing the edit modal, etc) via
    // `el.value = ""`, which doesn't fire an "input" event - this catches
    // those and shrinks the box back down without needing to touch every
    // one of those spots individually.
    setInterval(() => {
      [...AUTO_GROW_IDS, ...AUTO_GROW_ONLY_IDS].forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.tagName === "TEXTAREA" && el.scrollHeight !== el.clientHeight) autoGrowResize(el);
      });
    }, 400);
  }

  // -------------------------------------------------------------------------
  // 1. ESCALATING ALERTS (client mirror) - the server (send-push) already
  //    re-sends every 5 min up to 5 times; while the tab is actually open
  //    and the alarm's already showing, this just keeps it re-sounding on
  //    the same cadence instead of playing once and going quiet.
  // -------------------------------------------------------------------------

  let escalationTimer = null;
  function startEscalation(task) {
    stopEscalation();
    let n = 0;
    escalationTimer = setInterval(() => {
      n++;
      if (n >= 5 || !document.getElementById("timely-alarm-overlay")) { stopEscalation(); return; }
      alarmStopFn?.();
      alarmStopFn = playSiren((ALARM_SOUNDS[task.alarm_sound] || ALARM_SOUNDS.siren));
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    }, 5 * 60000);
  }
  function stopEscalation() {
    clearInterval(escalationTimer);
    escalationTimer = null;
  }

  // -------------------------------------------------------------------------
  // 2. ICS EXPORT - lets a reminder also land in your phone's native
  //    Calendar app, which (unlike a website) genuinely can alert through
  //    silent mode/DND, because the OS treats it as a first-party alarm.
  // -------------------------------------------------------------------------

  function icsEscape(str) {
    return String(str || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  }
  function toIcsUtc(date) {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }
  function buildIcs(task) {
    const start = new Date(task.reminder_at);
    const end = new Date(start.getTime() + 30 * 60000);
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boardly//Timely//EN",
      "BEGIN:VEVENT",
      `UID:${task.id}@boardly`,
      `DTSTAMP:${toIcsUtc(new Date())}`,
      `DTSTART:${toIcsUtc(start)}`,
      `DTEND:${toIcsUtc(end)}`,
      `SUMMARY:${icsEscape(task.title)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(task.title)}`, "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ];
    return lines.join("\r\n");
  }
  function downloadIcs(task) {
    if (!task.reminder_at) return;
    const blob = new Blob([buildIcs(task)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(task.title || "reminder").slice(0, 40).replace(/[^\w\- ]/g, "")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // -------------------------------------------------------------------------
  // 3. RECURRING TEMPLATES - a template that also remembers "starts at
  //    this time of day, runs for this long, in this timezone" so using it
  //    creates a ticket that's already wired up to auto-move and alarm,
  //    not just pre-filled text.
  // -------------------------------------------------------------------------

  function readRecurringTemplates() {
    try { return JSON.parse(localStorage.getItem("boardly-recurring-templates") || "[]"); }
    catch { return []; }
  }
  function writeRecurringTemplates(list) {
    localStorage.setItem("boardly-recurring-templates", JSON.stringify(list.slice(0, 12)));
  }

  function saveRecurringTemplate(task) {
    if (!task.auto_start_at) {
      typeof toast === "function" && toast("Set an auto-move start time first", "error");
      return;
    }
    const tz = task.timezone || BROWSER_TZ;
    const startTime = new Date(task.auto_start_at).toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
    const list = readRecurringTemplates();
    list.unshift({
      title: task.title, category: task.category, timezone: tz, startTime,
      durationMinutes: task.auto_duration_minutes || null, alarmSound: task.alarm_sound || "siren",
    });
    writeRecurringTemplates(list);
    renderRecurringTemplatesMenu();
    typeof toast === "function" && toast("Saved as recurring template", "ok");
  }

  async function useRecurringTemplate(tpl) {
    const [hh, mm] = tpl.startTime.split(":");
    const now = new Date();
    let candidate = zonedTimeToUtc(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${hh}:${mm}`,
      tpl.timezone
    );
    if (candidate.getTime() < Date.now()) candidate = new Date(candidate.getTime() + 24 * 60 * 60000); // already passed today - use tomorrow

    if (typeof addTask === "function") await addTask(tpl.title, tpl.category, null);
    const created = state.tasks.slice().sort((a, b) => (b.position || 0) - (a.position || 0))
      .find((t) => t.title === tpl.title && t.status === "todo");
    if (!created) return;
    const patch = {
      timezone: tpl.timezone, alarm_sound: tpl.alarmSound, auto_start_at: candidate.toISOString(),
      auto_duration_minutes: tpl.durationMinutes || null,
    };
    Object.assign(created, patch);
    await supabaseClient.from("tasks").update(patch).eq("id", created.id);
    scheduleAllReminders();
  }

  function renderRecurringTemplatesMenu() {
    const list = document.getElementById("timely-recurring-templates-list");
    if (!list) return;
    const templates = readRecurringTemplates();
    list.innerHTML = templates.length
      ? templates.map((t, i) => `
        <div class="flex items-center gap-1 group">
          <button type="button" data-use-recurring-template="${i}" class="flex-1 text-left truncate" title="Starts ${t.startTime} ${t.timezone}">${escapeForOverlay(t.title)} <span class="text-ink-soft font-mono">${t.startTime}</span></button>
          <button type="button" data-remove-recurring-template="${i}" class="text-ink-soft hover:text-orange opacity-0 group-hover:opacity-100"><i class="fa-solid fa-xmark text-xs"></i></button>
        </div>`).join("")
      : `<p class="px-1 py-1 text-xs text-ink-soft">None yet - open a ticket with auto-move set, then "Save as recurring template".</p>`;
  }

  // -------------------------------------------------------------------------
  // 4. MISSED-ALARM HISTORY LOG - the on-open banner only covers "since
  //    last time you looked"; this keeps a running record so you can see
  //    everything you've slept through, not just the latest batch.
  // -------------------------------------------------------------------------

  function readMissedLog() {
    try { return JSON.parse(localStorage.getItem("boardly-missed-log") || "[]"); }
    catch { return []; }
  }
  function logMissed(tasks) {
    const log = readMissedLog();
    const seen = new Set(log.map((e) => e.taskId + "|" + e.reminderAt));
    let changed = false;
    tasks.forEach((t) => {
      const key = t.id + "|" + t.reminder_at;
      if (!seen.has(key)) {
        log.unshift({ taskId: t.id, title: t.title, reminderAt: t.reminder_at, missedAt: new Date().toISOString() });
        changed = true;
      }
    });
    if (changed) localStorage.setItem("boardly-missed-log", JSON.stringify(log.slice(0, 50)));
  }

  function showMissedLogPanel() {
    document.getElementById("timely-panel-overlay")?.remove();
    const log = readMissedLog();
    const rows = log.length
      ? log.slice(0, 30).map((e) => `<div class="flex items-center justify-between gap-2 py-2 border-b border-line text-sm">
          <span class="truncate">${escapeForOverlay(e.title)}</span>
          <span class="text-ink-soft text-xs font-mono shrink-0">${new Date(e.reminderAt).toLocaleString()}</span>
        </div>`).join("")
      : `<p class="text-sm text-ink-soft py-4 text-center">No missed alerts logged. Good sign.</p>`;
    renderTimelyPanel("Missed alerts", `<div class="max-h-80 overflow-y-auto">${rows}</div>
      ${log.length ? `<button type="button" id="timely-clear-missed-log" class="w-full mt-3 toolbar-btn justify-center">Clear log</button>` : ""}`);
    document.getElementById("timely-clear-missed-log")?.addEventListener("click", () => {
      localStorage.removeItem("boardly-missed-log");
      showMissedLogPanel();
    });
  }

  // -------------------------------------------------------------------------
  // 5. ALARM SOUND DEFAULTS BY CATEGORY - a per-device preference so, say,
  //    every "urgent" ticket gets the siren and everything else gets the
  //    gentle chime, without setting it on each ticket individually. A
  //    ticket's own explicit alarm_sound (set in the edit modal) always
  //    wins over this default.
  // -------------------------------------------------------------------------

  function readCategorySoundMap() {
    try { return JSON.parse(localStorage.getItem("boardly-category-sound-map") || "{}"); }
    catch { return {}; }
  }
  function soundForTask(task) {
    if (task.alarm_sound && task.alarm_sound !== "siren") return task.alarm_sound; // explicit non-default choice
    const map = readCategorySoundMap();
    return map[task.category] || task.alarm_sound || "siren";
  }

  function showCategorySoundPanel() {
    document.getElementById("timely-panel-overlay")?.remove();
    const categories = [...new Set((state.tasks || []).map((t) => t.category).filter(Boolean))];
    if (!categories.length) categories.push("general", "work", "personal", "urgent");
    const map = readCategorySoundMap();
    const rows = categories.map((c) => `
      <div class="flex items-center justify-between gap-2 py-2">
        <span class="text-sm capitalize">${escapeForOverlay(c)}</span>
        <select data-category-sound="${escapeForOverlay(c)}" class="border border-line rounded-lg px-2 py-1.5 text-xs bg-card focus:border-orange outline-none">
          <option value="siren" ${!map[c] || map[c] === "siren" ? "selected" : ""}>Siren</option>
          <option value="pulse" ${map[c] === "pulse" ? "selected" : ""}>Pulse</option>
          <option value="chime" ${map[c] === "chime" ? "selected" : ""}>Chime</option>
        </select>
      </div>`).join("");
    renderTimelyPanel("Alarm sound by category", `<p class="text-xs text-ink-soft mb-2">Used when a ticket doesn't set its own sound.</p>${rows}`);
    document.querySelectorAll("[data-category-sound]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const m = readCategorySoundMap();
        m[sel.dataset.categorySound] = sel.value;
        localStorage.setItem("boardly-category-sound-map", JSON.stringify(m));
      });
    });
  }

  // -------------------------------------------------------------------------
  // 6. CRITICAL + SMS FALLBACK - "critical" plus a saved phone number is
  //    what the send-critical-sms edge function checks before texting.
  // -------------------------------------------------------------------------

  async function ensureNotifyPhone() {
    const { data } = await supabaseClient.from("user_settings").select("notify_phone").eq("user_id", state.userId).maybeSingle();
    if (data?.notify_phone) return data.notify_phone;
    const phone = prompt("Phone number for critical-ticket text alerts (include country code, e.g. +15551234567):");
    if (!phone) return null;
    await supabaseClient.from("user_settings").upsert({ user_id: state.userId, notify_phone: phone });
    return phone;
  }

  // -------------------------------------------------------------------------
  // Shared small popup panel used by #4 and #5 above.
  // -------------------------------------------------------------------------

  function renderTimelyPanel(title, bodyHtml) {
    const overlay = document.createElement("div");
    overlay.id = "timely-panel-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9997;background:rgba(10,10,15,.5);display:flex;align-items:center;justify-content:center;padding:16px";
    overlay.innerHTML = `<div class="ticket p-4 w-full" style="max-width:380px;max-height:80vh;overflow-y:auto">
      <div class="flex items-center justify-between mb-3">
        <p class="font-display font-semibold">${title}</p>
        <button type="button" id="timely-panel-close" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${bodyHtml}
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("timely-panel-close").addEventListener("click", () => overlay.remove());
  }

  function injectMoreMenuItems() {
    const anchor = document.getElementById("replay-tour-btn");
    if (!anchor || document.getElementById("timely-missed-log-btn")) return;
    const wrap = document.createElement("div");
    wrap.className = "space-y-1.5";
    wrap.innerHTML = `
      <button id="timely-missed-log-btn" type="button" class="w-full text-left text-xs text-ink-soft hover:text-orange flex items-center gap-1.5"><i class="fa-solid fa-clock-rotate-left w-3.5"></i>Missed alerts</button>
      <button id="timely-category-sounds-btn" type="button" class="w-full text-left text-xs text-ink-soft hover:text-orange flex items-center gap-1.5"><i class="fa-solid fa-volume-high w-3.5"></i>Alarm sound by category</button>
      <label class="w-full flex items-center gap-1.5 text-xs text-ink-soft hover:text-orange cursor-pointer">
        <input id="timely-auto-start-on-due" type="checkbox" class="rounded border-line">Auto-start tickets when due
      </label>`;
    anchor.insertAdjacentElement("afterend", wrap);

    document.getElementById("timely-missed-log-btn").addEventListener("click", () => {
      document.getElementById("more-menu")?.classList.add("hidden");
      showMissedLogPanel();
    });
    document.getElementById("timely-category-sounds-btn").addEventListener("click", () => {
      document.getElementById("more-menu")?.classList.add("hidden");
      showCategorySoundPanel();
    });
    const autoStartToggle = document.getElementById("timely-auto-start-on-due");
    autoStartToggle.checked = localStorage.getItem("boardly-auto-start-on-due") === "1";
    autoStartToggle.addEventListener("change", async (e) => {
      localStorage.setItem("boardly-auto-start-on-due", e.target.checked ? "1" : "0");
      // Also mirrored server-side so the closed-app cron job honors it too,
      // not just this device while the tab's open.
      await supabaseClient.from("user_settings").upsert({ user_id: state.userId, auto_start_on_due: e.target.checked });
    });
  }

  function injectRecurringTemplatesSection() {
    if (document.getElementById("timely-recurring-templates-list")) return;
    const anchor = document.getElementById("templates-list");
    if (!anchor) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="border-t border-line mt-1 pt-1 px-3">
      <p class="text-[10px] uppercase tracking-wide text-ink-soft mb-1">Recurring</p>
      <div id="timely-recurring-templates-list" class="space-y-1 pb-1"></div>
    </div>`;
    anchor.insertAdjacentElement("afterend", wrap.firstElementChild);
    renderRecurringTemplatesMenu();

    document.getElementById("templates-menu")?.addEventListener("click", (e) => {
      const useBtn = e.target.closest("[data-use-recurring-template]");
      if (useBtn) { useRecurringTemplate(readRecurringTemplates()[Number(useBtn.dataset.useRecurringTemplate)]); return; }
      const removeBtn = e.target.closest("[data-remove-recurring-template]");
      if (removeBtn) {
        const list = readRecurringTemplates();
        list.splice(Number(removeBtn.dataset.removeRecurringTemplate), 1);
        writeRecurringTemplates(list);
        renderRecurringTemplatesMenu();
      }
    });
  }

  function boot() {
    scheduleAllReminders();
    checkMissedReminders();
    runAutoAdvanceTick();
    setInterval(runAutoAdvanceTick, 30000);
    setInterval(scheduleAllReminders, 5 * 60000); // re-sync in case tasks changed
    watchEditModal();
    setupAutoGrow();
    injectMoreMenuItems();
    injectRecurringTemplatesSection();

    if ("Notification" in window && Notification.permission === "granted") {
      registerPush();
    }
  }

  // dashboard.js sets state.loaded after its own initial fetch; poll briefly
  // for it instead of assuming a fixed load order between the two scripts.
  const bootPoll = setInterval(() => {
    if (state.loaded) {
      clearInterval(bootPoll);
      boot();
    }
  }, 200);
  setTimeout(() => clearInterval(bootPoll), 15000);
})();
