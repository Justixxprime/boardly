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

function isOverdueTask(dateStr, status) {
  if (!dateStr || status === "done") return false;
  const due = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function renderStats(tasks) {
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
  document.getElementById("skeleton-layer").classList.add("hidden");
  document.getElementById("real-content").classList.remove("hidden");
});
