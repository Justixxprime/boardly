/* ==========================================================================
   BOARDLY - views-menu.js  ("Views" menu)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER control-tower.js, classroom.js,
   dispatch.js, care-rounds.js, content-calendar.js and client-work.js
   on dashboard.html - that load order matters, see below.

   THE PROBLEM THIS SOLVES: each of those six files hides or shows its
   own toolbar button depending on whether its vertical is relevant to
   the current board (schema_v28_task_type_override.sql's
   effectiveWorkType() means more than one can now be relevant at
   once, on a genuinely mixed board). Showing all six as separate,
   always-present-but-sometimes-hidden buttons directly in the toolbar
   was fine when at most one ever showed at a time - but a mixed board
   can now show several simultaneously, which would clutter the
   toolbar exactly the same way the Done column used to clutter before
   Done Archive existed.

   THE FIX: those six buttons now live inside one collapsed dropdown,
   opened by a single "Views" button - see dashboard.html, where
   they've been moved from top-level toolbar-btn elements into
   menu-item elements inside #views-menu. Nothing about their own
   logic changed even slightly - each file still toggles its own
   button's "hidden" class exactly as before, still opens its own
   modal on click, still wraps applyTerminology/renderBoard exactly as
   before. This file only adds ONE more thing on top: a single button
   that shows itself whenever at least one of the six is currently
   visible, and the open/closed toggling for the dropdown itself
   (same interaction pattern as the existing Board type menu).

   WHY LOAD ORDER MATTERS: this file wraps applyTerminology and
   renderBoard too, same 2g pattern as all six of the others - but it
   needs to be the LAST one to wrap them, so that by the time its own
   check runs, all six buttons have already had their own visibility
   freshly updated by the five files (er, six) that wrapped before it.
   That's why its <script> tag comes after theirs in dashboard.html.
   ========================================================================== */

function anyVerticalViewActive() {
  return ["control-tower-btn", "classroom-btn", "dispatch-btn", "care-rounds-btn", "content-calendar-btn", "client-work-btn"]
    .some((id) => !document.getElementById(id)?.classList.contains("hidden"));
}

function updateViewsMenuButtonVisibility() {
  document.getElementById("views-menu-btn")?.classList.toggle("hidden", !anyVerticalViewActive());
}

const _originalApplyTerminologyForViewsMenu = window.applyTerminology;
if (typeof _originalApplyTerminologyForViewsMenu === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForViewsMenu.apply(this, args);
    updateViewsMenuButtonVisibility();
    return result;
  };
}

const _originalRenderBoardForViewsMenu = window.renderBoard;
if (typeof _originalRenderBoardForViewsMenu === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForViewsMenu.apply(this, args);
    updateViewsMenuButtonVisibility();
    return result;
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const viewsMenu = document.getElementById("views-menu");

  // Same open/close interaction as the existing Board type menu:
  // click the button to toggle, click anywhere else to close.
  document.getElementById("views-menu-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    viewsMenu?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => viewsMenu?.classList.add("hidden"));

  // Picking any view inside the dropdown should also close the dropdown
  // itself, right before that view's own modal opens.
  viewsMenu?.addEventListener("click", (e) => {
    if (e.target.closest("button")) viewsMenu.classList.add("hidden");
  });

  updateViewsMenuButtonVisibility();
});
