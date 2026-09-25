/* ==========================================================================
   BOARDLY 2.0: js/opportunity-radar.js
   --------------------------------------------------------------------------
   Section 18 / Section 30 of the master brief, "Opportunity Radar."

   "Detect opportunities from actual signals... every recommendation
   must cite the signal that caused it... do not invent fake
   opportunities." So every function below is a plain count over data
   that already exists (paid invoices, released marketplace bookings,
   accepted marketplace applications). None of it is AI, none of it
   guesses, and none of it shows up unless a real threshold is met.
   Matches Section 83: "a database query is not AI."

   Lives on stats.html (the Insights hub), loaded after js/stats.js so
   it can reuse the escapeHTML() and requireSession() helpers already
   defined there and in js/supabase-client.js. Runs its own
   DOMContentLoaded, same pattern as project-baseline.js and
   project-health.js already use elsewhere in Boardly, so a page can
   have more than one script quietly doing its own part of the load.

   Every table this reads (invoices, retainers, marketplace_services,
   marketplace_bookings, marketplace_applications,
   marketplace_opportunities) already exists in production, but each
   query below still fails quiet on error, same as every other Insights
   card, rather than breaking the rest of the page over one signal. ---- */

function fmtRadarMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

/* ---- Signal 1: a client who keeps paying, but has no retainer yet -------
   Three or more paid invoices for the same client, with no currently
   active retainer already covering them. The number in the detail line
   is the exact count this ran against, nothing rounded or estimated. */

async function findRepeatClientSignals(userId) {
  const { data: invoices, error } = await supabaseClient
    .from("invoices")
    .select("client_id, client_name, currency")
    .eq("user_id", userId)
    .eq("status", "paid")
    .not("client_id", "is", null);
  if (error || !invoices?.length) return [];

  const byClient = {};
  invoices.forEach((inv) => {
    if (!byClient[inv.client_id]) byClient[inv.client_id] = { name: inv.client_name, count: 0 };
    byClient[inv.client_id].count += 1;
  });

  const repeatIds = Object.keys(byClient).filter((id) => byClient[id].count >= 3);
  if (!repeatIds.length) return [];

  const { data: retainers, error: retainerErr } = await supabaseClient
    .from("retainers")
    .select("client_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("client_id", repeatIds);
  const alreadyOnRetainer = new Set(retainerErr ? [] : (retainers || []).map((r) => r.client_id));

  return repeatIds
    .filter((id) => !alreadyOnRetainer.has(id))
    .map((id) => ({
      icon: "fa-repeat",
      color: "icon-badge-teal",
      label: `Consider a retainer for ${byClient[id].name || "this client"}`,
      detail: `Paid ${byClient[id].count} invoices so far, no retainer set up yet`,
      href: "money.html",
    }));
}

/* ---- Signal 2: a listed service that keeps getting booked and paid ------
   Three or more of your own marketplace bookings, tied to the same
   listed service, with real money attached (paid_held, releasing, or
   released - never a pending or refunded booking). */

async function findHighPerformingServiceSignals(userId) {
  const { data: services, error } = await supabaseClient
    .from("marketplace_services")
    .select("id, title")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error || !services?.length) return [];

  const { data: bookings, error: bookErr } = await supabaseClient
    .from("marketplace_bookings")
    .select("service_id, amount, currency, status")
    .eq("profile_user_id", userId)
    .in("status", ["paid_held", "releasing", "released"])
    .not("service_id", "is", null);
  if (bookErr || !bookings?.length) return [];

  const byService = {};
  bookings.forEach((b) => {
    if (!byService[b.service_id]) byService[b.service_id] = { count: 0, total: 0, currency: b.currency };
    byService[b.service_id].count += 1;
    byService[b.service_id].total += Number(b.amount) || 0;
  });

  return services
    .filter((s) => byService[s.id] && byService[s.id].count >= 3)
    .map((s) => ({
      icon: "fa-star",
      color: "icon-badge-orange",
      label: `${s.title} keeps performing well`,
      detail: `Booked and paid for ${byService[s.id].count} times, ${fmtRadarMoney(byService[s.id].total, byService[s.id].currency)} total`,
      href: "marketplace.html",
    }));
}

/* ---- Signal 3: paid work that never came from a listed service ----------
   Three or more paid bookings with no service_id at all, meaning
   someone paid for custom, one-off work rather than picking something
   off your menu. Boardly does not guess what these have in common,
   the actual descriptions are shown as-is so you can spot the pattern
   yourself, matching Section 30's "distinguish suggestions from
   facts." */

async function findAdHocBookingSignal(userId) {
  const { data: bookings, error } = await supabaseClient
    .from("marketplace_bookings")
    .select("description")
    .eq("profile_user_id", userId)
    .in("status", ["paid_held", "releasing", "released"])
    .is("service_id", null);
  if (error || !bookings || bookings.length < 3) return [];

  const samples = bookings.map((b) => (b.description || "").trim()).filter(Boolean).slice(0, 4);

  return [{
    icon: "fa-list-check",
    color: "icon-badge-violet",
    label: `${bookings.length} paid bookings didn't come from a listed service`,
    detail: "Worth turning one of these into a service others can book directly",
    href: "marketplace.html",
    samples,
  }];
}

/* ---- Signal 4: winning the same kind of job over and over ---------------
   Two or more accepted marketplace applications sharing the same
   opportunity category, meaning you keep applying and winning the same
   type of work instead of just having a service listed for it. */

async function findRepeatCategorySignal(userId) {
  const { data: apps, error } = await supabaseClient
    .from("marketplace_applications")
    .select("opportunity_id")
    .eq("applicant_user_id", userId)
    .eq("status", "accepted");
  if (error || !apps?.length) return [];

  const oppIds = [...new Set(apps.map((a) => a.opportunity_id))];
  const { data: opps, error: oppErr } = await supabaseClient
    .from("marketplace_opportunities")
    .select("id, category")
    .in("id", oppIds);
  if (oppErr || !opps?.length) return [];

  const categoryById = {};
  opps.forEach((o) => { categoryById[o.id] = o.category; });

  const byCategory = {};
  apps.forEach((a) => {
    const cat = categoryById[a.opportunity_id];
    if (!cat) return;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  return Object.keys(byCategory)
    .filter((cat) => byCategory[cat] >= 2)
    .map((cat) => ({
      icon: "fa-bullseye",
      color: "icon-badge-pink",
      label: `Won ${byCategory[cat]} jobs in ${cat}`,
      detail: "Consider listing a service for this instead of applying each time",
      href: "marketplace.html",
    }));
}

/* ---- render --------------------------------------------------------------
   Card stays hidden unless at least one signal actually cleared its
   threshold, matching every other Insights card's "nothing to flag,
   nothing shown" behaviour, and Section 30's ban on inventing an
   opportunity that isn't really there. */

function renderOpportunityRadar(signals) {
  const card = document.getElementById("opportunity-radar-card");
  const list = document.getElementById("opportunity-radar-list");
  if (!card || !list) return;
  if (!signals.length) return;

  card.classList.remove("hidden");
  list.innerHTML = signals.map((s) => `
    <a href="${s.href}" class="flex items-start gap-2.5 p-3 rounded-[var(--radius-lg)] border border-line hover:border-orange transition-colors">
      <span class="icon-badge ${s.color} shrink-0"><i class="fa-solid ${s.icon}"></i></span>
      <span class="min-w-0">
        <span class="block text-sm font-medium">${escapeHTML(s.label)}</span>
        <span class="block text-xs text-ink-soft mt-0.5">${escapeHTML(s.detail)}</span>
        ${s.samples?.length ? `<span class="block text-xs mt-1.5 italic" style="color:var(--ink-faint)">"${escapeHTML(s.samples.join("\", \""))}"</span>` : ""}
      </span>
    </a>`).join("");
}

async function loadOpportunityRadar(userId) {
  try {
    const [repeatClients, highService, adHoc, repeatCategory] = await Promise.all([
      findRepeatClientSignals(userId),
      findHighPerformingServiceSignals(userId),
      findAdHocBookingSignal(userId),
      findRepeatCategorySignal(userId),
    ]);
    renderOpportunityRadar([...repeatClients, ...highService, ...adHoc, ...repeatCategory]);
  } catch (err) {
    // A bonus panel, not core to the page, so a failure here stays
    // quiet instead of breaking the rest of Insights (same reasoning
    // as renderFrictionDetector and the readiness guards elsewhere).
    console.error("Opportunity Radar: couldn't compute signals.", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;
  loadOpportunityRadar(session.user.id);
});
