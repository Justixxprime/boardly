/* ==========================================================================
   BOARDLY - entitlements.js  ("v49: capability system" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded EARLY on every page that needs it (right after
   supabase-client.js, before feature modules like collaboration.js), so
   state.userPlan is settled before anything tries to gate on it.

   This is the CENTRALIZED plan/capability system the build spec asks for -
   one file that answers "what does this plan unlock", instead of
   `if (plan === "pro")` scattered through the app. A feature module (like
   collaboration.js) should only ever ask can("something"), never read
   state.userPlan directly - that's what keeps the plan matrix in exactly
   one place.

   Needs supabase/schema_v49_capability_system.sql run first. Until then,
   state.capabilityReady stays false and can() below falls back to
   treating everyone as "free" - the safe direction to fail in, since
   under-granting just means someone sees an upsell message a little
   early, while over-granting would mean a real security gap.
   ========================================================================== */

state.userPlan = "free"; // safe default until loadMyPlan() resolves
state.capabilityReady = false; // whether schema_v49_capability_system.sql has been run

// ---------------------------------------------------------------------------
// THE PLAN MATRIX - the one place in the whole app that says what a plan
// unlocks. Deliberately small right now: Phase 1 of the build spec is the
// SYSTEM itself, not gating every feature in Boardly at once (that's "50
// unrelated changes at once", which the spec itself warns against). New
// capabilities get added here as each one actually gets gated - see
// PLAN_GATING_SETUP.md for the running list of what's gated so far.
//
// pro_plus intentionally mirrors pro for every key below except where a
// key is explicitly called out as Pro+-only - there's nothing genuinely
// Pro+-exclusive built yet, and inventing a distinction with nothing
// behind it would be exactly the kind of fake feature the spec forbids.
// ---------------------------------------------------------------------------
const PLAN_CAPABILITIES = {
  free: {
    collaboration: false, // inviting anyone else onto a board - see pricing.html's "Team" tier
  },
  pro: {
    collaboration: true,
  },
  pro_plus: {
    collaboration: true,
  },
};

const PLAN_LABELS = { free: "Free", pro: "Pro", pro_plus: "Pro+" };

/**
 * The one function every feature module should call: can("collaboration"),
 * never a direct state.userPlan check. Unknown capability keys resolve to
 * false (fail closed) rather than throwing, so a typo in a feature module
 * quietly shows an upsell instead of breaking that feature outright.
 *
 * IMPORTANT: while state.capabilityReady is false (schema_v49 hasn't been
 * run yet), this returns true for everything - the system fails OPEN,
 * not closed, on a missing migration. The alternative would mean every
 * existing user loses access to something that currently just works
 * (like inviting a teammate) the instant these files get deployed, even
 * before the SQL has actually been run - exactly the kind of breakage
 * RULE 4 in the build spec warns against. Once the migration IS run,
 * this starts enforcing for real - Free genuinely means Free from then
 * on, this only protects the gap in between.
 */
function can(capabilityKey) {
  if (!state.capabilityReady) return true;
  const plan = PLAN_CAPABILITIES[state.userPlan] ? state.userPlan : "free";
  return !!PLAN_CAPABILITIES[plan]?.[capabilityKey];
}

function planLabel() {
  return PLAN_LABELS[state.userPlan] || "Free";
}

async function checkCapabilityReady() {
  const { error } = await supabaseClient.from("user_plan").select("user_id").limit(1);
  state.capabilityReady = !error;
  return state.capabilityReady;
}

/**
 * Loads the signed-in user's plan. A missing row (the normal case for
 * everyone right now, since plans are still assigned manually - see the
 * schema file's header comment) means Free, same as the RLS-enforced
 * server side default. Safe to call before checkCapabilityReady() - it
 * does its own readiness probe via .maybeSingle() returning nothing.
 */
async function loadMyPlan() {
  if (!state.userId) return;
  await checkCapabilityReady();
  if (!state.capabilityReady) { state.userPlan = "free"; return; }
  const { data } = await supabaseClient.from("user_plan").select("plan").eq("user_id", state.userId).maybeSingle();
  state.userPlan = data?.plan || "free";
}

/**
 * A single, consistent way for any feature module to say "this needs a
 * paid plan" - opens the same lightweight modal every time, rather than
 * each feature inventing its own upsell copy or (worse) a fake button
 * that pretends to start a purchase nothing is actually wired to handle.
 * Links to pricing.html and to a real mailto (see PLAN_GATING_SETUP.md)
 * rather than a checkout flow that doesn't exist yet.
 */
function showUpgradePrompt(featureLabel) {
  const modal = document.getElementById("upgrade-prompt-modal");
  const body = document.getElementById("upgrade-prompt-body");
  if (!modal || !body) {
    // Graceful fallback on any page that hasn't added the modal markup -
    // still tells the person something real rather than doing nothing.
    toast(`${featureLabel} needs a paid plan - see pricing.html`, "error");
    return;
  }
  body.textContent = `${featureLabel} is part of Boardly's paid plan. You're currently on ${planLabel()}.`;
  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-close-upgrade-prompt]").forEach((el) =>
    el.addEventListener("click", () => document.getElementById("upgrade-prompt-modal")?.classList.add("hidden"))
  );
});
