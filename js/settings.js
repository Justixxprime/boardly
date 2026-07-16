/* ==========================================================================
   BOARDLY — settings.js
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const user = session.user;
  document.getElementById("email-field").value = user.email;
  document.getElementById("email-display").textContent = user.email;
  document.getElementById("name-field").value = user.user_metadata?.full_name || "";
  document.getElementById("user-initial").textContent = (user.user_metadata?.full_name || user.email).charAt(0).toUpperCase();

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
});

function showBanner(message, ok) {
  const banner = document.getElementById("settings-banner");
  banner.textContent = message;
  banner.classList.remove("hidden", "text-teal-700", "text-orange-700");
  banner.classList.add(ok ? "text-teal-700" : "text-orange-700");
  setTimeout(() => banner.classList.add("hidden"), 3500);
}
