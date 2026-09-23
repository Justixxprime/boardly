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
  // Confirming an email address (data.session is null at signup time
  // when Supabase's "Confirm email" setting is on, see the signUp()
  // handler below) lands the visitor back here with a real session
  // already established, but redirectIfLoggedIn() would otherwise
  // bounce them straight to home.html before they ever saw the two
  // onboarding questions, they'd end up "logged in" with no workspace
  // type or goals set at all. The signUp() call below points
  // Supabase's confirmation link back to signup.html with this exact
  // marker for that reason.
  const justConfirmedEmail = new URLSearchParams(location.search).get("confirmed") === "1";
  if (justConfirmedEmail) {
    document.getElementById("signup-step-1")?.classList.add("hidden");
    document.getElementById("signup-step-2")?.classList.remove("hidden");
  } else {
    redirectIfLoggedIn();
  }
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
        options: {
          data: { full_name: name },
          // Without this, Supabase falls back to the project's own
          // Site URL setting (Dashboard, Authentication, URL
          // Configuration), which is a project-level setting this
          // code can't see or control, and if that setting is ever
          // wrong (e.g. still pointing at a local development
          // address), the confirmation link sends a real signup
          // nowhere useful. Being explicit here means it always comes
          // back to this exact page regardless of that setting.
          emailRedirectTo: `${location.origin}${location.pathname}?confirmed=1`,
        },
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

    // Finishes the login after both steps (password, and MFA code if
    // the account has it turned on) are done - the one place that
    // actually redirects to the dashboard.
    function completeLogin(rememberMe) {
      localStorage.setItem("boardly-remember-me", rememberMe ? "1" : "0");
      sessionStorage.setItem("boardly-session-active", "1");
      logSecurityEvent("sign_in", "Signed in to Boardly");
      window.location.href = "home.html";
    }

    let pendingRememberMe = true;
    let pendingFactorId = null;

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      pendingRememberMe = document.getElementById("remember-me")?.checked ?? true;
      const button = document.getElementById("login-button");

      setButtonLoading(button, true, "Signing in…");

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        setButtonLoading(button, false);
        showFormError(error.message);
        return;
      }

      // A password match alone does not mean the login is finished - an
      // account with two-factor on is only at aal1 right now, and needs
      // one more step before it reaches aal2. currentLevel !== nextLevel
      // is how Supabase Auth signals "there's a factor to challenge".
      const { currentLevel, nextLevel } = await mfaGetLevel();
      setButtonLoading(button, false);

      if (nextLevel === "aal2" && currentLevel !== "aal2") {
        const { factor, error: factorError } = await mfaGetVerifiedFactor();
        if (factorError || !factor) {
          // Shouldn't happen (nextLevel said aal2 is available), but
          // fail toward "let them in" rather than locking someone out
          // over a listing glitch - the database-side policy is the
          // real gate either way.
          completeLogin(pendingRememberMe);
          return;
        }
        pendingFactorId = factor.id;
        loginForm.classList.add("hidden");
        document.getElementById("login-signup-link")?.classList.add("hidden");
        document.getElementById("form-error")?.classList.add("hidden");
        document.getElementById("mfa-challenge-form")?.classList.remove("hidden");
        document.getElementById("mfa-challenge-code")?.focus();
        return;
      }

      completeLogin(pendingRememberMe);
    });

    const mfaChallengeForm = document.getElementById("mfa-challenge-form");
    if (mfaChallengeForm) {
      mfaChallengeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const code = document.getElementById("mfa-challenge-code").value;
        const button = document.getElementById("mfa-challenge-button");
        if (!pendingFactorId || code.trim().length < 6) {
          showFormError("Enter the 6-digit code from your authenticator app.");
          return;
        }
        setButtonLoading(button, true, "Verifying…");
        const { error } = await mfaChallengeAndVerify(pendingFactorId, code);
        setButtonLoading(button, false);
        if (error) {
          showFormError("That code isn't right, or it's expired. Try the next one your app shows.");
          document.getElementById("mfa-challenge-code").value = "";
          document.getElementById("mfa-challenge-code").focus();
          return;
        }
        logSecurityEvent("mfa_challenge_passed", "Verified with two-factor code");
        completeLogin(pendingRememberMe);
      });

      document.getElementById("mfa-challenge-cancel")?.addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
      });
    }
  }
});
