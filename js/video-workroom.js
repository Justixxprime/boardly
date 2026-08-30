(() => {
  const params = new URLSearchParams(window.location.search);
  const directRoomUrl = params.get("roomUrl");
  const directToken = params.get("token");
  const inviteUrl = params.get("inviteUrl");
  const inviteRoomId = params.get("room");
  const inviteAccessToken = params.get("access");
  const title = params.get("title") || "Video workroom";

  const titleEl = document.getElementById("workroom-title");
  const joinScreen = document.getElementById("join-screen");
  const roomScreen = document.getElementById("room-screen");
  const errorEl = document.getElementById("join-error");
  const copyInviteButton = document.getElementById("copy-invite-btn");

  titleEl.textContent = title;

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
