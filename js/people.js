/* ==========================================================================
   BOARDLY - people.js  ("People" view, Relationship Engine v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js, commitments.js and
   waiting-room.js on dashboard.html:
     <script src="js/people.js" defer></script>

   Needs NOTHING new in Supabase. This is pure presentation over two
   tables you may already have running - commitments
   (schema_v24_commitment_guardian.sql) and waiting_items
   (schema_v23_waiting_room.sql). If you haven't run one or both of
   those yet, this view still opens - it just quietly leaves out
   whichever half it can't read, same "explain, don't break" pattern
   every earlier add-on in this project uses. (The comment inside
   schema_v23 even calls this out by name as "Boardly's future
   Relationship Engine" - this is that.)

   WHAT THIS IS: a promise made TO a person (a commitment) and a thing
   you're waiting ON a person FOR (a waiting item) both already store a
   free-text name - to_whom and who. Nothing before this view ever
   grouped those by the actual person. This does exactly that: for
   each name that shows up in either table, it shows what you owe
   them, what you're waiting on them for, and - once there's enough
   history - a plain, honest "kept on time" track record. Same "no
   data yet, don't fake a number" rule the Execution Score already
   uses on the Insights page.

   Names are matched by trimming and lowercasing only (so "Amaka",
   "amaka " and "AMAKA" are treated as the same person, but "Amaka" and
   "Amaka O." are treated as different people - there's no real
   identity behind these, they're just text someone typed once).
   ========================================================================== */

state.peopleIndex = []; // array of {key, displayName, openCommitments, keptCommitments, missedCommitments, openWaiting, resolvedWaiting}

function normalizePersonKey(name) {
  const trimmed = (name || "").trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Pulls the FULL history (not just open items) of commitments + waiting items,
 *  straight from Supabase, so the track-record math below has everything to work
 *  with. Each read is skipped quietly if that table doesn't exist yet. */
async function loadPeopleData() {
  const [commitmentsRes, waitingRes] = await Promise.all([
    state.commitmentsReady
      ? supabaseClient.from("commitments").select("*")
      : Promise.resolve({ data: [], error: null }),
    state.waitingRoomReady
      ? supabaseClient.from("waiting_items").select("*")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (commitmentsRes.error) console.warn("loadPeopleData (commitments):", commitmentsRes.error.message);
  if (waitingRes.error) console.warn("loadPeopleData (waiting):", waitingRes.error.message);

  state.peopleIndex = buildPeopleIndex(commitmentsRes.data || [], waitingRes.data || []);
}

function buildPeopleIndex(allCommitments, allWaiting) {
  const byKey = new Map();

  function personFor(rawName) {
    const key = normalizePersonKey(rawName);
    if (!key) return null;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        displayName: rawName.trim().replace(/\s+/g, " "),
        openCommitments: [], keptCommitments: [], missedCommitments: [],
        openWaiting: [], resolvedWaiting: [],
      });
    }
    return byKey.get(key);
  }

  for (const c of allCommitments) {
    const person = personFor(c.to_whom);
    if (!person) continue;
    if (!c.completed_at) {
      person.openCommitments.push(c);
    } else if (c.due_date && new Date(c.completed_at) > new Date(c.due_date + "T23:59:59")) {
      person.missedCommitments.push(c); // completed, but after its own due date
    } else {
      person.keptCommitments.push(c);
    }
  }

  for (const w of allWaiting) {
    const person = personFor(w.who);
    if (!person) continue;
    (w.resolved_at ? person.resolvedWaiting : person.openWaiting).push(w);
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const openA = a.openCommitments.length + a.openWaiting.length;
    const openB = b.openCommitments.length + b.openWaiting.length;
    if (openB !== openA) return openB - openA; // people with something open float to the top
    return a.displayName.localeCompare(b.displayName);
  });
}

function personInitial(name) {
  return (name.trim()[0] || "?").toUpperCase();
}

function renderPeopleList() {
  const list = document.getElementById("people-list");
  const empty = document.getElementById("people-empty");
  const notice = document.getElementById("people-setup-notice");
  if (!list) return;

  if (notice) notice.classList.toggle("hidden", state.commitmentsReady || state.waitingRoomReady);

  if (!state.peopleIndex.length) {
    list.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");

  list.innerHTML = state.peopleIndex.map((p) => {
    const totalKeptTrack = p.keptCommitments.length + p.missedCommitments.length;
    const trackLine = totalKeptTrack >= 2
      ? `<span class="text-[11px] text-ink-soft">${p.keptCommitments.length} of ${totalKeptTrack} kept on time</span>`
      : "";
    return `
      <button type="button" data-open-person="${escapeHTML(p.key)}"
        class="w-full text-left ticket p-3 flex items-center gap-3 hover:border-orange transition-colors">
        <div class="member-avatar shrink-0">${escapeHTML(personInitial(p.displayName))}</div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-sm truncate">${escapeHTML(p.displayName)}</p>
          <div class="flex flex-wrap gap-1.5 mt-1">
            ${p.openCommitments.length ? `<span class="meta-chip text-orange"><i class="fa-solid fa-handshake"></i>${p.openCommitments.length} owed</span>` : ""}
            ${p.openWaiting.length ? `<span class="meta-chip text-teal"><i class="fa-solid fa-hourglass-half"></i>${p.openWaiting.length} waiting</span>` : ""}
            ${!p.openCommitments.length && !p.openWaiting.length ? `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-check"></i>All clear</span>` : ""}
          </div>
          ${trackLine ? `<div class="mt-1">${trackLine}</div>` : ""}
        </div>
        <i class="fa-solid fa-chevron-right text-ink-soft text-xs"></i>
      </button>`;
  }).join("");
}

function renderPersonDetail(key) {
  const person = state.peopleIndex.find((p) => p.key === key);
  const wrap = document.getElementById("person-detail");
  if (!wrap || !person) return;

  function itemLine(text, meta, statusClass, statusLabel) {
    return `<div class="ticket p-2.5 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm truncate">${escapeHTML(text)}</p>
        ${meta ? `<p class="text-[11px] text-ink-soft">${escapeHTML(meta)}</p>` : ""}
      </div>
      <span class="meta-chip shrink-0 ${statusClass}">${escapeHTML(statusLabel)}</span>
    </div>`;
  }

  const sections = [];
  if (person.openCommitments.length) {
    sections.push(`<p class="text-xs font-medium text-ink-soft mt-3 mb-1.5">You owe them</p>` +
      person.openCommitments.map((c) => {
        const status = commitmentStatus(c.due_date);
        return itemLine(c.what, c.due_date ? `Due ${c.due_date}` : "No date", COMMITMENT_STATUS_CLASS[status] || "", COMMITMENT_STATUS_LABEL[status] || "");
      }).join("")
    );
  }
  if (person.openWaiting.length) {
    sections.push(`<p class="text-xs font-medium text-ink-soft mt-3 mb-1.5">You're waiting on them</p>` +
      person.openWaiting.map((w) => itemLine(w.what, `Waiting ${daysWaiting(w.created_at)} days`, w.importance === "important" ? "text-orange" : "text-ink-soft", w.importance === "important" ? "Important" : "Normal")).join("")
    );
  }
  const history = [...person.keptCommitments, ...person.missedCommitments];
  if (history.length) {
    sections.push(`<p class="text-xs font-medium text-ink-soft mt-3 mb-1.5">Past commitments</p>` +
      [...person.keptCommitments.map((c) => itemLine(c.what, c.due_date || "", "text-teal", "Kept")),
        ...person.missedCommitments.map((c) => itemLine(c.what, c.due_date || "", "text-critical", "Late"))].join("")
    );
  }
  if (!sections.length) {
    sections.push(`<p class="text-xs text-ink-soft text-center py-4">Nothing on record for ${escapeHTML(person.displayName)} yet.</p>`);
  }

  document.getElementById("person-detail-name").textContent = person.displayName;
  wrap.innerHTML = sections.join("");
}

function openPeopleDetail(key) {
  document.getElementById("people-list-view")?.classList.add("hidden");
  document.getElementById("people-detail-view")?.classList.remove("hidden");
  renderPersonDetail(key);
}

function closePeopleDetail() {
  document.getElementById("people-detail-view")?.classList.add("hidden");
  document.getElementById("people-list-view")?.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("people-modal");

  document.getElementById("people-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    closePeopleDetail();
    await loadPeopleData();
    renderPeopleList();
  });
  document.querySelectorAll("[data-close-people]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("people-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-person]");
    if (btn) openPeopleDetail(btn.dataset.openPerson);
  });
  document.getElementById("person-detail-back")?.addEventListener("click", closePeopleDetail);

  document.getElementById("person-open-commitments")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    document.getElementById("commitments-btn")?.click();
  });
  document.getElementById("person-open-waiting")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    document.getElementById("waiting-room-btn")?.click();
  });
});
