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

// Kept in sync by hand with TERMINOLOGY in js/dashboard.js (signup.html
// doesn't load dashboard.js, so this small, presentation-only subset -
// label and icon, nothing about column names or fields - is duplicated
// here on purpose rather than pulling in the whole file).
const SIGNUP_WORK_TYPES = [
  { key: "general", label: "General / other", icon: "fa-list-check" },
  { key: "logistics", label: "Logistics", icon: "fa-truck-fast" },
  { key: "teaching", label: "Teaching", icon: "fa-chalkboard-user" },
  { key: "freelance", label: "Freelance", icon: "fa-briefcase" },
  { key: "personal", label: "Personal", icon: "fa-user" },
  { key: "field_service", label: "Field service", icon: "fa-screwdriver-wrench" },
  { key: "healthcare", label: "Healthcare / care", icon: "fa-briefcase-medical" },
];

function renderWorkTypeChoices() {
  const wrap = document.getElementById("work-type-choices");
  if (!wrap) return;
  wrap.innerHTML = SIGNUP_WORK_TYPES.map((t) => `
    <button type="button" data-work-type="${t.key}" class="btn-pop ticket p-3.5 text-left flex flex-col items-start gap-2 hover:border-orange">
      <span class="icon-badge icon-badge-orange"><i class="fa-solid ${t.icon}"></i></span>
      <span class="text-sm font-semibold">${t.label}</span>
    </button>`).join("");
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-work-type]");
    if (!btn) return;
    localStorage.setItem("boardly-signup-work-type", btn.dataset.workType);
    window.location.href = "dashboard.html";
  }, { once: true });
}

document.addEventListener("DOMContentLoaded", () => {
  redirectIfLoggedIn();
  renderWorkTypeChoices();

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
      // straight to the dashboard. Otherwise, one more quick question
      // before the dashboard: what kind of work is this for.
      if (!data.session) {
        window.location.href = "login.html?confirm=1";
      } else {
        document.getElementById("signup-step-1")?.classList.add("hidden");
        document.getElementById("signup-step-2")?.classList.remove("hidden");
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
