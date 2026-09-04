(() => {
  const params = new URLSearchParams(window.location.search);
  const startTaskId = params.get("start");
  const directRoomUrl = params.get("roomUrl");
  const directToken = params.get("token");
  const inviteUrl = params.get("inviteUrl");
  const inviteRoomId = params.get("room");
  const inviteAccessToken = params.get("access");
  const title = params.get("title") || "Video workroom";

  const titleEl = document.getElementById("workroom-title");
  const startingScreen = document.getElementById("starting-screen");
  const startingNote = document.getElementById("starting-note");
  const startingErrorBox = document.getElementById("starting-error");
  const startingErrorText = document.getElementById("starting-error-text");
  const joinScreen = document.getElementById("join-screen");
  const roomScreen = document.getElementById("room-screen");
  const errorEl = document.getElementById("join-error");
  const copyInviteButton = document.getElementById("copy-invite-btn-floating");

  titleEl.textContent = title;

  function showStartingError(message) {
    startingNote.classList.add("hidden");
    startingScreen.querySelector(".fa-spinner")?.classList.replace("fa-spin", "");
    startingErrorText.textContent = message;
    startingErrorBox.classList.remove("hidden");
  }

  // Host flow: this tab was opened directly from a task with only a task
  // id, no room details yet. This tab does the actual "start" API call
  // itself and shows a real, visible loading/error state here - the old
  // approach opened a blank tab from dashboard.js and closed it again on
  // failure, which looked like "nothing happened."
  if (startTaskId) {
    startingScreen.classList.remove("hidden");
    (async () => {
      // supabase-client.js defines `supabaseClient`; this new tab shares
      // localStorage with the Boardly tab it was opened from, so the
      // existing session should hydrate here too.
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        showStartingError("You're not signed in to Boardly in this tab. Sign in, then try starting the workroom again.");
        return;
      }
      try {
        const { data, error } = await supabaseClient.functions.invoke("video-workroom", {
          body: { action: "start", taskId: startTaskId },
          // Explicitly attach the "prove it's really you" header ourselves
          // instead of trusting the library to do it automatically. In a
          // freshly-opened tab like this one, the library doesn't always
          // finish wiring the signed-in session into its default headers
          // before this call goes out, which silently strips this header
          // and gets the request turned away at Supabase's front gate
          // before it ever reaches our own code (confirmed from the HAR
          // capture: the request had no Authorization header on it at all).
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error || !data?.roomUrl || !data?.token) {
          throw new Error(data?.error || error?.message || "Couldn't start the workroom.");
        }
        if (data.title) titleEl.textContent = data.title;
        startingScreen.classList.add("hidden");
        openRoom(data.roomUrl, data.token, data.expiresAt);
        if (data.inviteUrl) {
          copyInviteButton.classList.remove("hidden");
          copyInviteButton.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(data.inviteUrl);
              copyInviteButton.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>Invite copied';
              setTimeout(() => { copyInviteButton.innerHTML = '<i class="fa-solid fa-link mr-1.5"></i>Copy invite'; }, 1600);
            } catch {
              window.prompt("Copy this private invitation:", data.inviteUrl);
            }
          });
        }
      } catch (error) {
        showStartingError(error.message || "Couldn't start the workroom. Please try again.");
      }
    })();
    return;
  }

  joinScreen.classList.remove("hidden");

  function isDailyRoomUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && /(^|\.)daily\.co$/i.test(parsed.hostname);
    } catch { return false; }
  }

  function openRoom(roomUrl, token, expiresAt) {
    if (!isDailyRoomUrl(roomUrl) || !token) {
      errorEl.textContent = "This workroom link is invalid.";
      errorEl.classList.remove("hidden");
      return;
    }
    const dailyUrl = new URL(roomUrl);
    dailyUrl.searchParams.set("t", token);
    document.getElementById("workroom-frame").src = dailyUrl.toString();
    joinScreen.classList.add("hidden");
    roomScreen.classList.remove("hidden");
    if (expiresAt) {
      const expiry = new Date(expiresAt);
      document.getElementById("expiry-note").textContent = Number.isNaN(expiry.valueOf()) ? "" : `This private workroom closes ${expiry.toLocaleString()}.`;
    }
  }

  if (directRoomUrl && directToken) {
    openRoom(directRoomUrl, directToken, params.get("expiresAt"));
    if (inviteUrl) {
      copyInviteButton.classList.remove("hidden");
      copyInviteButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copyInviteButton.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>Invite copied';
          setTimeout(() => { copyInviteButton.innerHTML = '<i class="fa-solid fa-link mr-1.5"></i>Copy invite'; }, 1600);
        } catch {
          window.prompt("Copy this private invitation:", inviteUrl);
        }
      });
    }
    return;
  }

  if (!inviteRoomId || !inviteAccessToken) {
    errorEl.textContent = "This workroom invitation is incomplete.";
    errorEl.classList.remove("hidden");
    document.getElementById("join-form").classList.add("hidden");
    return;
  }

  document.getElementById("join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    const name = document.getElementById("guest-name").value.trim();
    if (!name) return;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Joining';
    errorEl.classList.add("hidden");
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/video-workroom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "join", roomId: inviteRoomId, accessToken: inviteAccessToken, name }),
      });
      const data = await response.json();
      if (!response.ok || !data.roomUrl || !data.token) throw new Error(data.error || "Couldn't join this workroom.");
      openRoom(data.roomUrl, data.token, data.expiresAt);
    } catch (error) {
      errorEl.textContent = error.message || "Couldn't join this workroom.";
      errorEl.classList.remove("hidden");
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1.5"></i>Join call';
    }
  });
})();
