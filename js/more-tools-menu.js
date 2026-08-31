/* ==========================================================================
   BOARDLY - more-tools-menu.js  ("More tools" menu)
   --------------------------------------------------------------------------
   The toolbar had grown to 49 individual buttons - past the point where
   anyone could scan it and know what's there. This groups the less
   frequently reached-for ones (Waiting on, Commitments, Decisions, Idea
   Vault, Templates, Timesheet, Milestones, and a few more) into a single
   dropdown, the same way "Views" already worked for the vertical
   dashboards.

   IMPORTANT: this file only changes WHERE these buttons live in the page,
   not what they do. Every button kept its original id, so every other
   file's own `document.getElementById("...-btn")?.addEventListener(...)`
   wiring for opening its modal keeps working completely unchanged.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const menu = document.getElementById("more-tools-menu");

  document.getElementById("more-tools-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu?.classList.toggle("hidden");
    if (!menu?.classList.contains("hidden") && typeof clampDropdownToViewport === "function") clampDropdownToViewport(menu);
  });
  document.addEventListener("click", () => menu?.classList.add("hidden"));

  // Picking any tool inside closes the dropdown right before that tool's
  // own modal opens - same interaction as the "Views" menu.
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("button")) menu.classList.add("hidden");
  });
});
