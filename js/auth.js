/* ==========================================================================
   BOARDLY - auth.js
   Handles the sign-up form (on signup.html) and the log-in form
   (on login.html). Each page only has ONE of these forms in its HTML,
   so we just check which one exists before wiring it up.
   ========================================================================== */

function showFormError(message) {
  const box = document.getElementById("form-error");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.classList.add("opacity-70", "cursor-not-allowed");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove("opacity-70", "cursor-not-allowed");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  redirectIfLoggedIn();

  // ---------------- SIGN UP ----------------
  const signupForm = document.getElementById("signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const button = document.getElementById("signup-button");

      setButtonLoading(button, true, "Creating account…");

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });

      setButtonLoading(button, false);

      if (error) {
        showFormError(error.message);
        return;
      }

      // If email confirmation is turned ON in Supabase, there is no
      // session yet - send the user to check their inbox instead of
      // straight to the dashboard.
      if (!data.session) {
        window.location.href = "login.html?confirm=1";
      } else {
        window.location.href = "dashboard.html";
      }
    });
  }

  // ---------------- LOG IN ----------------
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirm") === "1") {
      const banner = document.getElementById("confirm-banner");
      if (banner) banner.classList.remove("hidden");
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const rememberMe = document.getElementById("remember-me")?.checked ?? true;
      const button = document.getElementById("login-button");

      setButtonLoading(button, true, "Signing in…");

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

      setButtonLoading(button, false);

      if (error) {
        showFormError(error.message);
        return;
      }

      // "Remember me" unchecked: Supabase's client always writes the
      // session to localStorage (there's no per-login switch for that),
      // so this marks the choice and supabase-client.js's requireSession()
      // signs you back out automatically the next time the browser is
      // fully closed and reopened - staying logged in for this browsing
      // session, same as normal, just not forever.
      localStorage.setItem("boardly-remember-me", rememberMe ? "1" : "0");
      sessionStorage.setItem("boardly-session-active", "1");

      window.location.href = "dashboard.html";
    });
  }
});
