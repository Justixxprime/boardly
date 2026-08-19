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
