/* ==========================================================================
   BOARDLY - settings.js
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const user = session.user;
  document.getElementById("email-field").value = user.email;
  document.getElementById("email-display").textContent = user.email;
  document.getElementById("name-field").value = user.user_metadata?.full_name || "";
  document.getElementById("user-initial").textContent = (user.user_metadata?.full_name || user.email).charAt(0).toUpperCase();

  const displayName = user.user_metadata?.full_name || user.email;
  document.getElementById("user-name-m")?.replaceChildren(document.createTextNode(displayName));
  const initialM = document.getElementById("user-initial-m");
  if (initialM) initialM.textContent = displayName.charAt(0).toUpperCase();
  document.getElementById("logout-btn-mobile")?.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });

  // ---- profile form ----
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = document.getElementById("profile-save-btn");
    const name = document.getElementById("name-field").value.trim();
    button.textContent = "Saving…";
    button.disabled = true;

    const { error } = await supabaseClient.auth.updateUser({ data: { full_name: name } });

    button.textContent = "Save changes";
    button.disabled = false;
    showBanner(error ? "Couldn't save: " + error.message : "Profile updated.", !error);
  });

  // ---- password form ----
  document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = document.getElementById("password-save-btn");
    const pw = document.getElementById("new-password").value;
    if (pw.length < 6) {
      showBanner("Password must be at least 6 characters.", false);
      return;
    }
    button.textContent = "Updating…";
    button.disabled = true;

    const { error } = await supabaseClient.auth.updateUser({ password: pw });

    button.textContent = "Update password";
    button.disabled = false;
    document.getElementById("new-password").value = "";
    showBanner(error ? "Couldn't update: " + error.message : "Password updated.", !error);
    if (!error) logSecurityEvent("password_changed", "Changed account password");
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });

  // ---- Google Calendar ----
  // Shows a message left over from a redirect back from Google (see
  // google-oauth-callback), and reflects whether a connection already exists.
  (async function initGoogleCalendar() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("calendar")) {
      const ok = params.get("calendar") === "connected";
      showBanner(params.get("msg") || (ok ? "Connected." : "Something went wrong."), ok);
      window.history.replaceState({}, "", window.location.pathname); // tidy the URL, don't leave ?calendar=... sitting there
    }

    const { data: connection } = await supabaseClient
      .from("calendar_connections")
      .select("connected_at")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    const statusEl = document.getElementById("google-calendar-status");
    const connectBtn = document.getElementById("google-calendar-connect-btn");
    const disconnectBtn = document.getElementById("google-calendar-disconnect-btn");
    if (!statusEl || !connectBtn || !disconnectBtn) return; // calendar_connections table doesn't exist yet on an older install - see GOOGLE_CALENDAR_SETUP.md

    if (connection) {
      statusEl.textContent = `Connected ${new Date(connection.connected_at).toLocaleDateString()}`;
      connectBtn.classList.add("hidden");
      disconnectBtn.classList.remove("hidden");
    }

    connectBtn.addEventListener("click", () => {
      // GOOGLE_CLIENT_ID is not a secret - it's meant to be visible in
      // the browser, the same way it's visible in the URL bar of every
      // "Sign in with Google" button on the web. Only GOOGLE_CLIENT_SECRET
      // (used in the two Edge Functions, never sent to the browser) needs
      // to stay private. Set this from Google Cloud Console - see
      // GOOGLE_CALENDAR_SETUP.md.
      const clientId = "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
      const redirectUri = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar.events",
        access_type: "offline", // needed to get a refresh_token back, not just a short-lived access token
        prompt: "consent", // forces Google to hand out a refresh_token even on a re-connect
        state: user.id, // carries who's connecting through the redirect - see google-oauth-callback's comment on why
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    });

    disconnectBtn.addEventListener("click", async () => {
      const { error } = await supabaseClient.from("calendar_connections").delete().eq("user_id", user.id).eq("provider", "google");
      showBanner(error ? "Couldn't disconnect: " + error.message : "Google Calendar disconnected.", !error);
      if (!error) {
        statusEl.textContent = "Not connected";
        connectBtn.classList.remove("hidden");
        disconnectBtn.classList.add("hidden");
      }
    });
  })();

  // ---- Slack ----
  (async function initSlack() {
    const webhookInput = document.getElementById("slack-webhook-input");
    const userIdInput = document.getElementById("slack-user-id-input");
    const saveBtn = document.getElementById("slack-save-btn");
    if (!webhookInput || !userIdInput || !saveBtn) return; // slack_webhook_url column doesn't exist yet on an older install - see SLACK_SETUP.md

    const { data: existing } = await supabaseClient.from("user_settings").select("slack_webhook_url, slack_user_id").eq("user_id", user.id).maybeSingle();
    if (existing?.slack_webhook_url) webhookInput.value = existing.slack_webhook_url;
    if (existing?.slack_user_id) userIdInput.value = existing.slack_user_id;

    saveBtn.addEventListener("click", async () => {
      const { error } = await supabaseClient
        .from("user_settings")
        .upsert({ user_id: user.id, slack_webhook_url: webhookInput.value.trim() || null, slack_user_id: userIdInput.value.trim() || null }, { onConflict: "user_id" });
      showBanner(error ? "Couldn't save Slack settings: " + error.message : "Slack settings saved.", !error);
    });
  })();

  // ---- Zapier ----
  (async function initZapier() {
    const keyDisplay = document.getElementById("zapier-api-key-display");
    const generateBtn = document.getElementById("zapier-generate-key-btn");
    const outboundInput = document.getElementById("zapier-outbound-input");
    const saveBtn = document.getElementById("zapier-save-btn");
    if (!keyDisplay || !generateBtn || !outboundInput || !saveBtn) return; // api_key column doesn't exist yet on an older install

    const { data: existing } = await supabaseClient.from("user_settings").select("api_key, zapier_outbound_webhook_url").eq("user_id", user.id).maybeSingle();
    if (existing?.api_key) keyDisplay.value = existing.api_key;
    if (existing?.zapier_outbound_webhook_url) outboundInput.value = existing.zapier_outbound_webhook_url;

    generateBtn.addEventListener("click", async () => {
      if (keyDisplay.value !== "Not generated yet" && keyDisplay.value) {
        // showConfirmModal (a styled modal) only exists in dashboard.js,
        // which this page doesn't load - a plain browser confirm is the
        // right tool here, same as other simple settings confirmations.
        if (!window.confirm("Generate a new key? Any Zap already using the old one will stop working until you update it there too.")) return;
      }
      const newKey = "bk_" + crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabaseClient.from("user_settings").upsert({ user_id: user.id, api_key: newKey }, { onConflict: "user_id" });
      if (error) { showBanner("Couldn't generate a key: " + error.message, false); return; }
      keyDisplay.value = newKey;
      showBanner("New API key generated.", true);
    });

    saveBtn.addEventListener("click", async () => {
      const { error } = await supabaseClient
        .from("user_settings")
        .upsert({ user_id: user.id, zapier_outbound_webhook_url: outboundInput.value.trim() || null }, { onConflict: "user_id" });
      showBanner(error ? "Couldn't save: " + error.message : "Zapier settings saved.", !error);
    });
  })();

  // ---- notifications ----
  // notify_channel comes from schema_v15_notify_channel.sql; notify_phone
  // already existed (schema_v5_timely_plus.sql) but previously had no
  // settings UI at all - the only way to set it was a browser prompt()
  // the first time a critical alert would have fired.
  const { data: existingSettings, error: settingsReadError } = await supabaseClient
    .from("user_settings")
    .select("notify_phone, notify_channel, quiet_hours_start, quiet_hours_end")
    .eq("user_id", user.id)
    .maybeSingle();
  const notifyChannelSelect = document.getElementById("notify-channel");
  const notifyPhoneInput = document.getElementById("notify-phone");
  const quietStartInput = document.getElementById("quiet-hours-start");
  const quietEndInput = document.getElementById("quiet-hours-end");
  if (settingsReadError && /column .*notify_channel.* does not exist/i.test(settingsReadError.message || "")) {
    document.getElementById("notify-not-ready")?.classList.remove("hidden");
  }
  if (existingSettings?.notify_channel) notifyChannelSelect.value = existingSettings.notify_channel;
  if (existingSettings?.notify_phone) notifyPhoneInput.value = existingSettings.notify_phone;
  if (existingSettings?.quiet_hours_start) quietStartInput.value = existingSettings.quiet_hours_start;
  if (existingSettings?.quiet_hours_end) quietEndInput.value = existingSettings.quiet_hours_end;

  document.getElementById("notify-save-btn")?.addEventListener("click", async () => {
    const button = document.getElementById("notify-save-btn");
    const channel = notifyChannelSelect.value;
    const phone = notifyPhoneInput.value.trim();
    if ((channel === "sms" || channel === "both") && !phone) {
      showBanner("Add a phone number, or switch the channel to Email only.", false);
      return;
    }
    button.textContent = "Saving…";
    button.disabled = true;
    const { error } = await supabaseClient
      .from("user_settings")
      .upsert({
        user_id: user.id, notify_channel: channel, notify_phone: phone || null,
        quiet_hours_start: quietStartInput.value || null, quiet_hours_end: quietEndInput.value || null,
      });
    button.textContent = "Save notification settings";
    button.disabled = false;
    showBanner(error ? "Couldn't save: " + error.message : "Notification settings saved.", !error);
  });

  // ---- delete account ----
  // Calls the delete-account Edge Function (service role key never
  // touches the browser - see supabase/functions/delete-account/index.ts
  // for why this can't just be a client-side supabase call).
  const deleteModal = document.getElementById("delete-account-modal");
  const deleteConfirmInput = document.getElementById("delete-account-confirm-input");
  const deleteConfirmBtn = document.getElementById("delete-account-confirm-btn");

  const closeDeleteModal = () => {
    deleteModal.classList.add("hidden");
    deleteConfirmInput.value = "";
    deleteConfirmBtn.disabled = true;
  };
  document.getElementById("delete-account-open-btn")?.addEventListener("click", () => deleteModal.classList.remove("hidden"));
  deleteModal?.querySelectorAll("[data-close-delete-modal]").forEach((el) => el.addEventListener("click", closeDeleteModal));
  deleteConfirmInput?.addEventListener("input", () => {
    deleteConfirmBtn.disabled = deleteConfirmInput.value.trim() !== "DELETE";
  });
  deleteConfirmBtn?.addEventListener("click", async () => {
    deleteConfirmBtn.textContent = "Deleting…";
    deleteConfirmBtn.disabled = true;
    try {
      const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      window.location.href = "index.html";
    } catch (err) {
      deleteConfirmBtn.textContent = "Delete permanently";
      showBanner("Couldn't delete account: " + err.message, false);
      closeDeleteModal();
    }
  });

  // ---- app lock ----
  function refreshAppLockUI() {
    const has = !!localStorage.getItem("boardly-app-lock-hash");
    document.getElementById("app-lock-off")?.classList.toggle("hidden", has);
    document.getElementById("app-lock-set-btn")?.classList.toggle("hidden", has);
    document.getElementById("app-lock-on")?.classList.toggle("hidden", !has);
  }
  refreshAppLockUI();

  document.getElementById("app-lock-set-btn")?.addEventListener("click", async () => {
    const a = document.getElementById("app-lock-new").value.trim();
    const b = document.getElementById("app-lock-confirm").value.trim();
    if (!/^\d{4}$/.test(a)) { showBanner("Passcode must be exactly 4 digits.", false); return; }
    if (a !== b) { showBanner("Passcodes don't match.", false); return; }
    localStorage.setItem("boardly-app-lock-hash", await sha256Hex(a));
    sessionStorage.setItem("boardly-app-lock-unlocked", "1"); // don't lock yourself out mid-setup
    document.getElementById("app-lock-new").value = "";
    document.getElementById("app-lock-confirm").value = "";
    refreshAppLockUI();
    showBanner("Passcode set for this device.", true);
  });

  document.getElementById("app-lock-remove-btn")?.addEventListener("click", () => {
    localStorage.removeItem("boardly-app-lock-hash");
    sessionStorage.removeItem("boardly-app-lock-unlocked");
    refreshAppLockUI();
    showBanner("Passcode turned off.", true);
  });

  // ---- security center ----
  document.getElementById("signout-others-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Signing out others…";
    const { error } = await supabaseClient.auth.signOut({ scope: "others" });
    btn.disabled = false;
    btn.textContent = "Sign out others";
    showBanner(error ? "Couldn't sign out other devices: " + error.message : "Signed out of every other device.", !error);
    if (!error) logSecurityEvent("signed_out_others", "Signed out of all other devices");
  });

  await loadSecurityEvents();
});

// One tiny, dependency-free "3m ago" / "2h ago" / "5d ago" formatter -
// this page doesn't load dashboard.js/visual.js, so it can't reuse the
// board's own version of this.
function formatEventAge(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const SECURITY_EVENT_ICONS = {
  sign_in: "fa-right-to-bracket",
  password_changed: "fa-key",
  signed_out_others: "fa-lock",
  board_deleted: "fa-trash",
  member_invited: "fa-user-plus",
  member_removed: "fa-user-minus",
};

async function loadSecurityEvents() {
  const list = document.getElementById("security-events-list");
  const emptyEl = document.getElementById("security-events-empty");
  const notReadyEl = document.getElementById("security-events-not-ready");
  if (!list) return;
  const { data, error } = await supabaseClient
    .from("security_events")
    .select("event_type, description, created_at")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    // Most likely cause: schema_v35_security_center.sql hasn't been run
    // on this project yet - not an error worth alarming over, just a
    // one-time setup step still pending.
    notReadyEl?.classList.remove("hidden");
    return;
  }
  if (!data || data.length === 0) {
    emptyEl?.classList.remove("hidden");
    return;
  }
  list.innerHTML = data.map((ev) => `
    <li class="flex items-start gap-2.5 py-1.5">
      <i class="fa-solid ${SECURITY_EVENT_ICONS[ev.event_type] || "fa-circle-info"} text-ink-soft text-xs mt-1 w-4 text-center"></i>
      <span class="flex-1">${escapeHTML(ev.description)}</span>
      <span class="text-xs text-ink-soft shrink-0">${formatEventAge(ev.created_at)}</span>
    </li>
  `).join("");
}

function showBanner(message, ok) {
  const banner = document.getElementById("settings-banner");
  banner.textContent = message;
  banner.classList.remove("hidden", "text-teal-700", "text-orange-700");
  banner.classList.add(ok ? "text-teal-700" : "text-orange-700");
  setTimeout(() => banner.classList.add("hidden"), 3500);
}
