/* ==========================================================================
   BOARDLY - charts.js
   Hand-built SVG charts, no chart library. Every function takes a
   container element and draws directly into it. See GUIDE.md "How the
   insights charts work" for the plain-language walkthrough.
   ========================================================================== */

/**
 * Animated counter: counts up from 0 to `target` over `duration` ms.
 */
function animateCounter(el, target, duration = 900, formatter = (n) => Math.round(n).toLocaleString()) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Donut chart: one ring, one percentage. `data` is an array of
 * {label, value, color} - segments are drawn in order, each one a slice
 * of the ring's circumference proportional to its share of the total.
 */
function renderDonut(containerEl, data) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const r = 60, circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total > 0 ? d.value / total : 0;
      const dash = fraction * circumference;
      const seg = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${d.color}" stroke-width="16"
        stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"
        stroke-linecap="butt" class="donut-seg"></circle>`;
      offset += dash;
      return seg;
    })
    .join("");
  containerEl.innerHTML = `
    <svg viewBox="0 0 140 140" class="w-full h-full block">
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--line)" stroke-width="16"></circle>
      ${segments}
    </svg>`;
}

/**
 * Bar chart: `data` is an array of {label, value, color}. The container
 * must have an explicit CSS height (inline style or a fixed-height
 * class) - bars are sized as a percentage of THAT height, not of the
 * SVG's own intrinsic size, which is what makes this safe to drop into
 * any fixed-height card without the bars overflowing it.
 */
function renderBarChart(containerEl, data) {
  const max = Math.max(1, ...data.map((d) => d.value));
  containerEl.innerHTML = `
    <div class="flex items-end gap-2 h-full">
      ${data
        .map((d) => {
          const pct = Math.max(2, (d.value / max) * 100);
          return `
          <div class="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
            <span class="font-mono text-[10px] text-ink-soft">${d.value}</span>
            <div class="w-full rounded-t-md bar-fill" style="height:${pct}%; background:${d.color || "var(--orange)"}" title="${d.label}: ${d.value}"></div>
            <span class="font-mono text-[9px] text-ink-soft uppercase">${d.label}</span>
          </div>`;
        })
        .join("")}
    </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => containerEl.classList.add("bars-ready")));
}

/**
 * Weekly activity heatmap: `cells` is an array of {date, count}, most
 * recent last. Renders as a GitHub-style grid, darker = more activity
 * that day. `weeks` controls how many 7-day columns to show.
 */
function renderHeatmap(containerEl, cells, weeks = 12) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const byWeek = [];
  for (let i = 0; i < cells.length; i += 7) byWeek.push(cells.slice(i, i + 7));
  containerEl.innerHTML = `
    <div class="flex gap-1">
      ${byWeek
        .slice(-weeks)
        .map(
          (week) => `
        <div class="flex flex-col gap-1">
          ${week
            .map((c) => {
              const intensity = c.count === 0 ? 0 : Math.min(1, 0.25 + (c.count / max) * 0.75);
              return `<div class="heatmap-cell" style="background:color-mix(in srgb, var(--teal) ${(intensity * 100).toFixed(0)}%, var(--line) ${(100 - intensity * 100).toFixed(0)}%)" title="${c.date}: ${c.count} task${c.count === 1 ? "" : "s"}"></div>`;
            })
            .join("")}
        </div>`
        )
        .join("")}
    </div>`;
}
