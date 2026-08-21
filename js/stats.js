/* ==========================================================================
   BOARDLY - stats.js
   Powers the Insights page. Every number here is computed directly from
   your real tasks (the same `tasks` table dashboard.js reads) - there is
   no separate "analytics" table and nothing is hardcoded. See GUIDE.md
   "How the insights charts work" for the plain-language walkthrough of
   each calculation below.
   ========================================================================== */

const CATEGORY_LABEL = { general: "General", work: "Work", personal: "Personal", urgent: "Urgent" };
const CATEGORY_COLOR = { general: "var(--ink)", work: "var(--orange)", personal: "var(--violet)", urgent: "var(--teal)" };
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let lastRenderedTasks = []; // kept so the Export report button (wired separately, in
                             // DOMContentLoaded below) can reach the same data renderStats used,
                             // without re-fetching from Supabase a second time

function isOverdueTask(dateStr, status) {
  if (!dateStr || status === "done") return false;
  const due = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function renderStats(tasks) {
  lastRenderedTasks = tasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);
  const overdue = tasks.filter((t) => isOverdueTask(t.due_date, t.status)).length;

  animateCounter(document.getElementById("stat-total"), total, 700);
  animateCounter(document.getElementById("stat-done"), done, 700);
  animateCounter(document.getElementById("stat-rate"), rate, 700, (n) => Math.round(n) + "%");
  animateCounter(document.getElementById("stat-overdue"), overdue, 700);

  // ---- category donut ----
  const catCounts = {};
  tasks.forEach((t) => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const catData = Object.keys(CATEGORY_LABEL).map((cat) => ({
    label: CATEGORY_LABEL[cat], value: catCounts[cat] || 0, color: CATEGORY_COLOR[cat],
  }));
  renderDonut(document.getElementById("category-donut"), catData);
  const legend = document.getElementById("category-legend");
  legend.innerHTML = catData.filter((d) => d.value > 0).map((d) => `
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" style="background:${d.color}"></span>${d.label}</span>
      <span class="font-mono text-ink-soft">${d.value}</span>
    </div>`).join("") || `<p class="text-ink-soft">No tasks yet.</p>`;

  // ---- due-date urgency ----
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today); weekFromNow.setDate(weekFromNow.getDate() + 7);
  const urgency = { Overdue: 0, "Due today": 0, "This week": 0, Later: 0, "No date": 0 };
  tasks.forEach((t) => {
    if (t.status === "done") return;
    if (!t.due_date) { urgency["No date"]++; return; }
    const d = new Date(t.due_date + "T00:00:00");
    if (d < today) urgency.Overdue++;
    else if (d.getTime() === today.getTime()) urgency["Due today"]++;
    else if (d < weekFromNow) urgency["This week"]++;
    else urgency.Later++;
  });
  const urgencyColors = { Overdue: "var(--orange)", "Due today": "var(--pink)", "This week": "var(--violet)", Later: "var(--teal)", "No date": "var(--line)" };
  renderBarChart(
    document.getElementById("urgency-chart"),
    Object.keys(urgency).map((k) => ({ label: k, value: urgency[k], color: urgencyColors[k] }))
  );

  // ---- weekday creation pattern ----
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  tasks.forEach((t) => { if (t.created_at) byWeekday[new Date(t.created_at).getDay()]++; });
  renderBarChart(
    document.getElementById("weekday-chart"),
    WEEKDAY_NAMES.map((label, i) => ({ label, value: byWeekday[i], color: "var(--teal)" }))
  );

  // ---- activity heatmap (last 84 days, grouped into weeks) ----
  const dayBuckets = {};
  tasks.forEach((t) => {
    if (!t.created_at) return;
    const key = t.created_at.slice(0, 10);
    dayBuckets[key] = (dayBuckets[key] || 0) + 1;
  });
  const days = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 83);
  for (let i = 0; i < 84; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, count: dayBuckets[key] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  renderHeatmap(document.getElementById("activity-heatmap"), days, 12);

  // ---- weekly content report (only if any task has a platform set - the
  //      schema_v8_social.sql migration adds it, and gracefully hides
  //      itself if you haven't run that yet or don't post to platforms) ----
  const hasPlatformData = tasks.some((t) => t.platform);
  if (hasPlatformData) {
    document.getElementById("content-report-card").classList.remove("hidden");
    const now = new Date();
    const startOfWeek = (d) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      const day = (x.getDay() + 6) % 7; // Monday-based
      x.setDate(x.getDate() - day);
      return x;
    };
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const counts = {}; // platform -> {thisWeek, lastWeek}
    let upcoming = 0;
    tasks.forEach((t) => {
      if (!t.platform) return;
      if (t.status !== "done") { upcoming++; return; }
      const completedAt = new Date(t.updated_at || t.created_at);
      counts[t.platform] = counts[t.platform] || { thisWeek: 0, lastWeek: 0 };
      if (completedAt >= thisWeekStart) counts[t.platform].thisWeek++;
      else if (completedAt >= lastWeekStart) counts[t.platform].lastWeek++;
    });

    const PLATFORM_LABEL = { instagram: "Instagram", facebook: "Facebook", x: "X / Twitter", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", website: "Website", email: "Email" };
    const list = document.getElementById("content-report-list");
    const rows = Object.keys(counts);
    list.innerHTML = rows.length
      ? rows.map((p) => {
          const { thisWeek, lastWeek } = counts[p];
          const diff = thisWeek - lastWeek;
          const diffLabel = diff === 0 ? "steady" : diff > 0 ? `+${diff} vs last week` : `${diff} vs last week`;
          const diffColor = diff > 0 ? "var(--teal)" : diff < 0 ? "var(--orange)" : "var(--ink-soft)";
          return `
        <div class="flex items-center justify-between">
          <span>${PLATFORM_LABEL[p] || p}</span>
          <span class="font-mono text-xs"><span class="font-semibold">${thisWeek}</span> <span style="color:${diffColor}">(${diffLabel})</span></span>
        </div>`;
        }).join("")
      : `<p class="text-ink-soft text-xs">No completed platform posts yet this week or last.</p>`;
    document.getElementById("content-report-upcoming").textContent = upcoming;
  }

  // ---- completion time trend (needs done_at, added by schema_v6_visual.sql -
  //      hides itself gracefully on an older install, same pattern as the
  //      platform content report above) ----
  const doneWithTimes = tasks.filter((t) => t.status === "done" && t.done_at && t.created_at);
  if (doneWithTimes.length) {
    document.getElementById("completion-time-card").classList.remove("hidden");
    const daysToComplete = (t) => (new Date(t.done_at) - new Date(t.created_at)) / 86400000;

    // group into the same weekly buckets the activity heatmap already uses,
    // going back 8 weeks instead of 12 - a shorter window reads clearer as
    // a trend line than a year of noisy weekly averages would.
    const weekStart = (d) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday-based, matches the content report above
      return x;
    };
    const now = new Date();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = weekStart(now); start.setDate(start.getDate() - i * 7);
      weeks.push({ start, label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }), total: 0, count: 0 });
    }
    doneWithTimes.forEach((t) => {
      const ws = weekStart(new Date(t.done_at));
      const bucket = weeks.find((w) => w.start.getTime() === ws.getTime());
      if (bucket) { bucket.total += daysToComplete(t); bucket.count++; }
    });
    renderBarChart(
      document.getElementById("completion-time-chart"),
      weeks.map((w) => ({ label: w.label, value: w.count ? Math.round((w.total / w.count) * 10) / 10 : 0, color: "var(--teal)" }))
    );
    const overallAvg = doneWithTimes.reduce((sum, t) => sum + daysToComplete(t), 0) / doneWithTimes.length;
    document.getElementById("completion-time-overall").textContent =
      overallAvg < 1 ? `${Math.round(overallAvg * 24)} hours` : `${overallAvg.toFixed(1)} days`;
  }

  // ---- bottleneck finder ----
  if (doneWithTimes.length || tasks.some((t) => t.status !== "done")) {
    document.getElementById("bottleneck-card").classList.remove("hidden");
    const list = document.getElementById("bottleneck-list");
    const rows = [];

    if (doneWithTimes.length) {
      const byCategory = {};
      doneWithTimes.forEach((t) => {
        const cat = t.category || "general";
        byCategory[cat] = byCategory[cat] || { total: 0, count: 0 };
        byCategory[cat].total += (new Date(t.done_at) - new Date(t.created_at)) / 86400000;
        byCategory[cat].count++;
      });
      const slowest = Object.entries(byCategory)
        .map(([cat, v]) => ({ cat, avg: v.total / v.count }))
        .sort((a, b) => b.avg - a.avg)[0];
      if (slowest) {
        rows.push(`
          <div class="flex items-center justify-between">
            <span>Slowest category: <span class="font-semibold">${escapeHTML(CATEGORY_LABEL[slowest.cat] || slowest.cat)}</span></span>
            <span class="font-mono text-xs text-ink-soft">${slowest.avg.toFixed(1)} days on average</span>
          </div>`);
      }
    }

    const openTasks = tasks.filter((t) => t.status !== "done" && t.created_at);
    if (openTasks.length) {
      const oldest = [...openTasks].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
      const ageDays = Math.round((new Date() - new Date(oldest.created_at)) / 86400000);
      rows.push(`
        <div class="flex items-center justify-between gap-3">
          <span class="truncate">Longest open: <span class="font-semibold">${escapeHTML(oldest.title)}</span></span>
          <span class="font-mono text-xs text-ink-soft shrink-0">${ageDays} day${ageDays === 1 ? "" : "s"} old</span>
        </div>`);
    }

    list.innerHTML = rows.join("") || `<p class="text-ink-soft text-xs">Not enough finished tasks yet to spot a pattern.</p>`;
  }

  // ---- recent activity ----
  const recent = [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  document.getElementById("recent-list").innerHTML = recent.map((t) => `
    <div class="py-2.5 flex items-center justify-between gap-3">
      <span class="text-sm truncate ${t.status === "done" ? "line-through text-ink-soft" : ""}">${escapeHTML(t.title)}</span>
      <span class="font-mono text-[10px] text-ink-soft shrink-0">${new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
    </div>`).join("") || `<p class="text-sm text-ink-soft py-2">Nothing yet - add your first task from the board.</p>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// EXPORT REPORT (CSV)
//    A plain spreadsheet-friendly file: one row per task, plus a small
//    summary section at the top. Not the same as dashboard.js's board
//    export (that one's a raw task dump for re-importing) - this one
//    reads like a report someone could open in Excel/Sheets and skim.
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportInsightsReport() {
  const tasks = lastRenderedTasks;
  if (!tasks.length) { toast("Nothing to export yet", "error"); return; }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => isOverdueTask(t.due_date, t.status)).length;
  const doneWithTimes = tasks.filter((t) => t.status === "done" && t.done_at && t.created_at);
  const avgDays = doneWithTimes.length
    ? (doneWithTimes.reduce((sum, t) => sum + (new Date(t.done_at) - new Date(t.created_at)) / 86400000, 0) / doneWithTimes.length).toFixed(1)
    : "n/a";

  const lines = [
    "Boardly Insights report",
    `Generated,${new Date().toLocaleString()}`,
    `Total tickets,${total}`,
    `Completed,${done}`,
    `Completion rate,${total ? Math.round((done / total) * 100) : 0}%`,
    `Overdue,${overdue}`,
    `Average days to complete,${avgDays}`,
    "",
    "Title,Category,Status,Due date,Created,Completed",
    ...tasks.map((t) =>
      [t.title, t.category, t.status, t.due_date || "", t.created_at ? t.created_at.slice(0, 10) : "", t.done_at ? t.done_at.slice(0, 10) : ""]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `boardly-insights-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Report downloaded", "ok");
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const name = session.user.user_metadata?.full_name || session.user.email;
  document.getElementById("user-name").textContent = name;
  document.getElementById("user-initial").textContent = name.charAt(0).toUpperCase();
  const nameM = document.getElementById("user-name-m");
  const initialM = document.getElementById("user-initial-m");
  if (nameM) nameM.textContent = name;
  if (initialM) initialM.textContent = name.charAt(0).toUpperCase();

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
  const logoutMobile = document.getElementById("logout-btn-mobile");
  if (logoutMobile) logoutMobile.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });

  const { data, error } = await supabaseClient.from("tasks").select("*");
  if (error) {
    toast("Couldn't load your tasks: " + error.message, "error");
    return;
  }

  renderStats(data || []);
  document.getElementById("export-report-btn")?.addEventListener("click", exportInsightsReport);
  document.getElementById("skeleton-layer").classList.add("hidden");
  document.getElementById("real-content").classList.remove("hidden");
});
