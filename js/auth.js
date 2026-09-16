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
  { key: "social_media", label: "Social media", icon: "fa-hashtag" },
  { key: "software", label: "Software / web dev", icon: "fa-code" },
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
    document.getElementById("signup-step-2")?.classList.add("hidden");
    document.getElementById("signup-step-3")?.classList.remove("hidden");
    renderGoalChoices();
  }, { once: true });
}

// The second, optional onboarding question (brief Section 62's "what
// do you want Boardly to help with"). Multi-select, so clicking a
// choice just toggles it (a Set, keyed by the button element) rather
// than immediately navigating away like step 2 does, Continue is what
// actually moves on.
const GOAL_CHOICES = [
  { key: "find_clients", label: "Find clients", icon: "fa-magnifying-glass" },
  { key: "manage_work", label: "Manage work", icon: "fa-list-check" },
  { key: "get_paid", label: "Get paid", icon: "fa-money-bill" },
  { key: "manage_team", label: "Manage my team", icon: "fa-people-group" },
  { key: "track_money", label: "Track money", icon: "fa-chart-line" },
  { key: "run_operations", label: "Run day to day operations", icon: "fa-gears" },
];

const selectedGoals = new Set();

function renderGoalChoices() {
  const wrap = document.getElementById("goal-choices");
  if (!wrap || wrap.dataset.rendered) return;
  wrap.dataset.rendered = "true";
  wrap.innerHTML = GOAL_CHOICES.map((g) => `
    <button type="button" data-goal="${g.key}" class="btn-pop ticket p-3.5 text-left flex flex-col items-start gap-2 hover:border-orange" data-active="false">
      <span class="icon-badge icon-badge-orange"><i class="fa-solid ${g.icon}"></i></span>
      <span class="text-sm font-semibold">${g.label}</span>
    </button>`).join("");
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goal]");
    if (!btn) return;
    const key = btn.dataset.goal;
    if (selectedGoals.has(key)) {
      selectedGoals.delete(key);
      btn.dataset.active = "false";
      btn.classList.remove("border-orange");
    } else {
      selectedGoals.add(key);
      btn.dataset.active = "true";
      btn.classList.add("border-orange");
    }
  });
}

function finishGoalsStep() {
  if (selectedGoals.size) localStorage.setItem("boardly-signup-goals", JSON.stringify(Array.from(selectedGoals)));
  window.location.href = "home.html";
}

document.addEventListener("DOMContentLoaded", () => {
  redirectIfLoggedIn();
  renderWorkTypeChoices();
  document.getElementById("goals-continue-btn")?.addEventListener("click", finishGoalsStep);
  document.getElementById("goals-skip-btn")?.addEventListener("click", () => { window.location.href = "home.html"; });

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
      logSecurityEvent("sign_in", "Signed in to Boardly");

      window.location.href = "home.html";
    });
  }
});
