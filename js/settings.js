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
      const clientId = "254543073709-ig6m7sdeb14lv049ft0ds7rep3j1hqj9.apps.googleusercontent.com";
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

  // ---- notifications ----
  // notify_channel comes from schema_v15_notify_channel.sql; notify_phone
  // already existed (schema_v5_timely_plus.sql) but previously had no
  // settings UI at all - the only way to set it was a browser prompt()
  // the first time a critical alert would have fired.
  const { data: existingSettings, error: settingsReadError } = await supabaseClient
    .from("user_settings")
    .select("notify_phone, notify_channel")
    .eq("user_id", user.id)
    .maybeSingle();
  const notifyChannelSelect = document.getElementById("notify-channel");
  const notifyPhoneInput = document.getElementById("notify-phone");
  if (settingsReadError && /column .*notify_channel.* does not exist/i.test(settingsReadError.message || "")) {
    document.getElementById("notify-not-ready")?.classList.remove("hidden");
  }
  if (existingSettings?.notify_channel) notifyChannelSelect.value = existingSettings.notify_channel;
  if (existingSettings?.notify_phone) notifyPhoneInput.value = existingSettings.notify_phone;

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
      .upsert({ user_id: user.id, notify_channel: channel, notify_phone: phone || null });
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
});

function showBanner(message, ok) {
  const banner = document.getElementById("settings-banner");
  banner.textContent = message;
  banner.classList.remove("hidden", "text-teal-700", "text-orange-700");
  banner.classList.add(ok ? "text-teal-700" : "text-orange-700");
  setTimeout(() => banner.classList.add("hidden"), 3500);
}
