/* ==========================================================================
   BOARDLY — dashboard.js
   Everything the kanban board does lives in this one file, split into
   clearly labeled sections so it's easy to find what you're looking for:

     1. STATE           — the single source of truth in memory
     2. RENDERING        — turning state into DOM
     3. DATA (Supabase)  — talking to the database
     4. OPTIMISTIC ACTIONS — add / toggle / delete / move
     5. DRAG AND DROP     — SortableJS wiring
     6. COMMAND PALETTE   — Ctrl+K
     7. BOOT              — runs everything on page load
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. STATE
// ---------------------------------------------------------------------------
const state = {
  userId: null,
  tasks: [],           // flat array of every task, each has {id, title, category, status, due_date, position}
  loaded: false,
};

const COLUMNS = ["todo", "inprogress", "done"];
const CATEGORY_RAIL = {
  general: "rail-ink",
  work: "rail-orange",
  personal: "rail-violet",
  urgent: "rail-teal",
};
const CATEGORY_LABEL = {
  general: "General",
  work: "Work",
  personal: "Personal",
  urgent: "Urgent",
};

// ---------------------------------------------------------------------------
// 2. RENDERING
// ---------------------------------------------------------------------------

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function taskCardHTML(task) {
  const rail = CATEGORY_RAIL[task.category] || "rail-ink";
  const due = formatDueDate(task.due_date);
  const isDone = task.status === "done";
  return `
    <div class="ticket ticket-hover ${rail} p-3.5 mb-3 cursor-grab active:cursor-grabbing" data-id="${task.id}">
      <div class="flex items-start gap-2.5">
        <button class="check-btn mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors" style="border-color:${isDone ? "var(--teal)" : "var(--ink-soft)"}; background:${isDone ? "var(--teal)" : "transparent"}" aria-label="Mark complete" data-id="${task.id}">
          ${isDone ? '<i class="fa-solid fa-check text-[9px] text-white"></i>' : ""}
        </button>
        <div class="min-w-0 flex-1">
          <p class="task-title text-sm leading-snug break-words ${isDone ? "done" : ""}">${escapeHTML(task.title)}</p>
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            <span class="stamp" style="color:var(--${task.category === "general" ? "ink" : task.category === "work" ? "orange" : task.category === "personal" ? "violet" : "teal"})">${CATEGORY_LABEL[task.category] || "General"}</span>
            ${due ? `<span class="font-mono text-[10px] text-ink-soft flex items-center gap-1"><i class="fa-regular fa-clock"></i>${due}</span>` : ""}
          </div>
        </div>
        <button class="delete-btn text-ink-soft hover:text-orange shrink-0" aria-label="Delete task" data-id="${task.id}">
          <i class="fa-regular fa-trash-can text-xs"></i>
        </button>
      </div>
    </div>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function emptyStateHTML(column) {
  const copy = {
    todo: ["No tickets on the desk", "Press", "add your first one"],
    inprogress: ["Nothing in motion", "Drag a ticket here once you start it", ""],
    done: ["Nothing filed yet", "Finished tickets land in this drawer", ""],
  }[column];
  return `
    <div class="empty-state flex flex-col items-center text-center py-8 px-4 text-ink-soft">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" class="mb-3 opacity-70">
        <rect x="8" y="14" width="40" height="30" rx="2" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
        <path d="M8 22h40" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="16" cy="18" r="1.6" fill="currentColor"/>
        <circle cx="22" cy="18" r="1.6" fill="currentColor"/>
      </svg>
      <p class="text-sm font-medium text-ink">${copy[0]}</p>
      <p class="text-xs mt-1 max-w-[180px]">${copy[1]}${column === "todo" ? ' <kbd>Ctrl</kbd>+<kbd>K</kbd> to ' : ''}${copy[2]}</p>
    </div>`;
}

function renderBoard() {
  COLUMNS.forEach((col) => {
    const container = document.getElementById(`col-${col}`);
    const tasksInCol = state.tasks
      .filter((t) => t.status === col)
      .sort((a, b) => a.position - b.position);

    document.getElementById(`count-${col}`).textContent = tasksInCol.length;

    if (tasksInCol.length === 0) {
      container.innerHTML = emptyStateHTML(col);
    } else {
      container.innerHTML = tasksInCol.map(taskCardHTML).join("");
    }
  });
}

function renderSkeleton() {
  const heights = [64, 84, 70];
  COLUMNS.forEach((col) => {
    const container = document.getElementById(`col-${col}`);
    container.innerHTML = heights
      .map((h) => `<div class="skeleton mb-3" style="height:${h}px"></div>`)
      .join("");
  });
}

// ---------------------------------------------------------------------------
// 3. DATA (Supabase)
// ---------------------------------------------------------------------------

async function loadTasks() {
  renderSkeleton();
  const { data, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .order("status", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    toast("Couldn't load tasks: " + error.message, "error");
    COLUMNS.forEach((col) => (document.getElementById(`col-${col}`).innerHTML = emptyStateHTML(col)));
    return;
  }

  state.tasks = data;
  state.loaded = true;
  renderBoard();
}

// ---------------------------------------------------------------------------
// 4. OPTIMISTIC ACTIONS
//    The pattern in every function below is the same:
//    a) change `state.tasks` and re-render IMMEDIATELY (feels instant)
//    b) send the real request to Supabase in the background
//    c) if it fails, roll the change back and show a toast
// ---------------------------------------------------------------------------

function nextPositionFor(status) {
  const inCol = state.tasks.filter((t) => t.status === status);
  return inCol.length ? Math.max(...inCol.map((t) => t.position)) + 1 : 0;
}

async function addTask(title, category, dueDate) {
  const tempId = "temp-" + Date.now();
  const optimisticTask = {
    id: tempId,
    title,
    category: category || "general",
    status: "todo",
    due_date: dueDate || null,
    position: nextPositionFor("todo"),
    user_id: state.userId,
  };

  state.tasks.push(optimisticTask);
  renderBoard();

  const { data, error } = await supabaseClient
    .from("tasks")
    .insert({
      title,
      category: category || "general",
      status: "todo",
      due_date: dueDate || null,
      position: optimisticTask.position,
      user_id: state.userId,
    })
    .select()
    .single();

  if (error) {
    state.tasks = state.tasks.filter((t) => t.id !== tempId);
    renderBoard();
    toast("Couldn't add task: " + error.message, "error");
    return;
  }

  // swap the temporary row for the real one Supabase generated
  const idx = state.tasks.findIndex((t) => t.id === tempId);
  if (idx !== -1) state.tasks[idx] = data;
  renderBoard();
}

async function toggleComplete(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const prevStatus = task.status;
  const newStatus = task.status === "done" ? "todo" : "done";

  task.status = newStatus;
  task.position = nextPositionFor(newStatus);
  renderBoard();

  const { error } = await supabaseClient
    .from("tasks")
    .update({ status: newStatus, position: task.position })
    .eq("id", id);

  if (error) {
    task.status = prevStatus;
    renderBoard();
    toast("Couldn't update task: " + error.message, "error");
  }
}

async function deleteTask(id) {
  const backup = state.tasks;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  renderBoard();

  const { error } = await supabaseClient.from("tasks").delete().eq("id", id);

  if (error) {
    state.tasks = backup;
    renderBoard();
    toast("Couldn't delete task: " + error.message, "error");
  } else {
    toast("Task deleted", "ok");
  }
}

async function moveTask(id, newStatus, newPosition) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.status = newStatus;
  task.position = newPosition;
  // no re-render here — SortableJS has already moved the DOM node for us

  const { error } = await supabaseClient
    .from("tasks")
    .update({ status: newStatus, position: newPosition })
    .eq("id", id);

  if (error) {
    toast("Couldn't save the move: " + error.message, "error");
    await loadTasks(); // reload from source of truth to undo visually
  }
}

// ---------------------------------------------------------------------------
// 5. DRAG AND DROP (SortableJS)
// ---------------------------------------------------------------------------

function initSortable() {
  COLUMNS.forEach((col) => {
    const el = document.getElementById(`col-${col}`);
    new Sortable(el, {
      group: "kanban",
      animation: 150,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      emptyInsertThreshold: 40,
      onAdd: (evt) => syncColumnAfterDrag(evt.to),
      onUpdate: (evt) => syncColumnAfterDrag(evt.to),
    });
  });
}

// After ANY drag finishes, read the new DOM order of that column and
// write matching status/position values back into state + Supabase.
function syncColumnAfterDrag(columnEl) {
  const status = columnEl.id.replace("col-", "");
  const cards = [...columnEl.querySelectorAll("[data-id]")];
  cards.forEach((card, index) => {
    moveTask(card.dataset.id, status, index);
  });
  // update the little counters + swap in an empty-state if a column is
  // now empty (SortableJS moved raw DOM nodes, so counts can be stale)
  COLUMNS.forEach((c) => {
    const container = document.getElementById(`col-${c}`);
    const count = container.querySelectorAll("[data-id]").length;
    document.getElementById(`count-${c}`).textContent = count;
    if (count === 0 && !container.querySelector(".empty-state")) {
      container.innerHTML = emptyStateHTML(c);
    }
  });
}

// ---------------------------------------------------------------------------
// 6. COMMAND PALETTE (Ctrl+K / Cmd+K)
// ---------------------------------------------------------------------------

function openPalette() {
  document.getElementById("cmdk").classList.remove("hidden");
  const input = document.getElementById("cmdk-input");
  input.value = "";
  input.focus();
  renderPaletteResults("");
}
function closePalette() {
  document.getElementById("cmdk").classList.add("hidden");
}

function paletteActions(query) {
  const actions = [
    { label: "Go to Settings", icon: "fa-gear", run: () => (window.location.href = "settings.html") },
    { label: "Log out", icon: "fa-arrow-right-from-bracket", run: () => logout() },
  ];
  if (query.trim()) {
    actions.unshift({
      label: `Add task “${query.trim()}”`,
      icon: "fa-plus",
      run: () => addTask(query.trim(), "general", null),
    });
  }
  return actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()) || a.label.startsWith("Add task"));
}

function renderPaletteResults(query) {
  const list = document.getElementById("cmdk-results");
  const actions = paletteActions(query);
  list.innerHTML = actions
    .map(
      (a, i) => `
      <button data-index="${i}" class="cmdk-item w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--paper-2)] ${i === 0 ? "bg-[var(--paper-2)]" : ""}">
        <i class="fa-solid ${a.icon} w-4 text-ink-soft"></i>${a.label}
      </button>`
    )
    .join("");
  list.querySelectorAll(".cmdk-item").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      actions[i].run();
      closePalette();
    });
  });
}

// ---------------------------------------------------------------------------
// small UI helpers
// ---------------------------------------------------------------------------

function toast(message, kind = "ok") {
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = `toast font-mono text-xs px-3 py-2 rounded shadow border ${
    kind === "error" ? "bg-white border-orange-300 text-orange-700" : "bg-white border-teal-300 text-teal-700"
  }`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ---------------------------------------------------------------------------
// 7. BOOT
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  state.userId = session.user.id;
  const name = session.user.user_metadata?.full_name || session.user.email;
  document.getElementById("user-name").textContent = name;
  document.getElementById("user-initial").textContent = name.charAt(0).toUpperCase();
  const nameM = document.getElementById("user-name-m");
  const initialM = document.getElementById("user-initial-m");
  if (nameM) nameM.textContent = name;
  if (initialM) initialM.textContent = name.charAt(0).toUpperCase();

  initSortable();
  await loadTasks();

  // add-task quick form (top of the To do column)
  document.getElementById("quick-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("quick-add-input");
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    addTask(title, "general", null);
  });

  // event delegation for check + delete buttons (cards re-render often)
  document.getElementById("board").addEventListener("click", (e) => {
    const check = e.target.closest(".check-btn");
    if (check) return toggleComplete(check.dataset.id);
    const del = e.target.closest(".delete-btn");
    if (del) return deleteTask(del.dataset.id);
  });

  document.getElementById("logout-btn").addEventListener("click", logout);
  const logoutMobile = document.getElementById("logout-btn-mobile");
  if (logoutMobile) logoutMobile.addEventListener("click", logout);

  // command palette wiring
  document.getElementById("open-cmdk-btn").addEventListener("click", openPalette);
  const openCmdkMobile = document.getElementById("open-cmdk-btn-mobile");
  if (openCmdkMobile) openCmdkMobile.addEventListener("click", () => {
    document.getElementById("mobile-menu").dataset.open = "false";
    document.body.style.overflow = "";
    openPalette();
  });
  document.getElementById("cmdk-backdrop").addEventListener("click", closePalette);
  document.getElementById("cmdk-input").addEventListener("input", (e) => renderPaletteResults(e.target.value));
  document.getElementById("cmdk-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = document.querySelector(".cmdk-item");
      if (first) first.click();
    }
    if (e.key === "Escape") closePalette();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
  });
});
