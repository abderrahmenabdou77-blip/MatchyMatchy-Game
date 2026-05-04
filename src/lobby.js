// =====================================================
// MATCHY MATCHY — Lobby Logic
// =====================================================

const socket = io();

// ── DOM References ────────────────────────────────────
const btnQuickMatch  = document.getElementById("btnQuickMatch");
const btnCreateRoom  = document.getElementById("btnCreateRoom");
const btnJoinById    = document.getElementById("btnJoinById");
const roomList       = document.getElementById("roomList");
const onlineCountEl  = document.getElementById("onlineCount");

// Modals
const modalWaiting   = document.getElementById("modalWaiting");
const modalCreate    = document.getElementById("modalCreate");
const modalJoin      = document.getElementById("modalJoin");
const btnCancelMatch = document.getElementById("btnCancelMatch");
const generatedCode  = document.getElementById("generatedCode");
const btnCopyCode    = document.getElementById("btnCopyCode");
const togglePublic   = document.getElementById("togglePublic");
const btnEnterRoom   = document.getElementById("btnEnterRoom");
const btnCloseCreate = document.getElementById("btnCloseCreate");
const joinInput      = document.getElementById("joinInput");
const btnConfirmJoin = document.getElementById("btnConfirmJoin");
const btnCloseJoin   = document.getElementById("btnCloseJoin");
const joinError      = document.getElementById("joinError");

let pendingRoomId = null;
let onlineCount = 0;

// ── Generate Room ID ──────────────────────────────────
function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "ROOM-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── Navigate to Game ──────────────────────────────────
function goToGame(roomId) {
  sessionStorage.setItem("roomId", roomId);
  window.location.href = "index.html";
}

// ── Quick Match ───────────────────────────────────────
btnQuickMatch.addEventListener("click", () => {
  socket.emit("quickMatch");
  modalWaiting.hidden = false;
});

btnCancelMatch.addEventListener("click", () => {
  socket.emit("cancelQuickMatch");
  modalWaiting.hidden = true;
});

// ── Create Room ───────────────────────────────────────
btnCreateRoom.addEventListener("click", () => {
  pendingRoomId = generateRoomId();
  generatedCode.textContent = pendingRoomId;
  modalCreate.hidden = false;
});

btnCopyCode.addEventListener("click", () => {
  navigator.clipboard.writeText(pendingRoomId).then(() => {
    btnCopyCode.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => btnCopyCode.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
  });
});

btnEnterRoom.addEventListener("click", () => {
  if (!pendingRoomId) return;
  const isPublic = togglePublic.checked;
  socket.emit("createRoom", { roomId: pendingRoomId, isPublic });
  modalCreate.hidden = true;
});

btnCloseCreate.addEventListener("click", () => {
  modalCreate.hidden = true;
  pendingRoomId = null;
});

// ── Join by ID ────────────────────────────────────────
btnJoinById.addEventListener("click", () => {
  modalJoin.hidden = false;
  joinInput.value = "";
  joinError.textContent = "";
  setTimeout(() => joinInput.focus(), 100);
});

btnConfirmJoin.addEventListener("click", () => {
  const id = joinInput.value.trim().toUpperCase();
  if (!id) { joinError.textContent = "Please enter a room code."; return; }
  joinError.textContent = "";
  socket.emit("joinRoom", id);
});

joinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnConfirmJoin.click();
});

btnCloseJoin.addEventListener("click", () => {
  modalJoin.hidden = true;
  joinError.textContent = "";
});

// ── Socket Events ─────────────────────────────────────

socket.on("updateRooms", (rooms) => {
  renderRoomList(rooms);
  onlineCount = Object.values(rooms).reduce((acc, r) => acc + r.players, 0);
  onlineCountEl.textContent = onlineCount > 0 ? onlineCount : "–";
});

socket.on("roomCreated", (roomId) => {
  // Room created — wait in it
  sessionStorage.setItem("roomId", roomId);
  window.location.href = "index.html";
});

socket.on("roomJoined", (roomId) => {
  sessionStorage.setItem("roomId", roomId);
  window.location.href = "index.html";
});

socket.on("quickMatchFound", (roomId) => {
  modalWaiting.hidden = true;
  sessionStorage.setItem("roomId", roomId);
  window.location.href = "index.html";
});

socket.on("waitingForMatch", () => {
  // already showing modal
});

socket.on("matchCancelled", () => {
  modalWaiting.hidden = true;
});

socket.on("roomFull", () => {
  modalJoin.hidden = false;
  joinError.textContent = "❌ This room is full.";
});

socket.on("roomNotFound", () => {
  modalJoin.hidden = false;
  joinError.textContent = "❌ Room not found. Check the code.";
});

// ── Render Room List ──────────────────────────────────
function renderRoomList(rooms) {
  roomList.innerHTML = "";
  const entries = Object.entries(rooms);

  if (entries.length === 0) {
    roomList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-heart-crack"></i>
        <p>No open rooms yet.<br/>Be the first to create one!</p>
      </div>`;
    return;
  }

  entries.forEach(([id, room]) => {
    const isFull = room.players >= 2;
    const card = document.createElement("div");
    card.className = `room-card${isFull ? " full" : ""}`;
    card.innerHTML = `
      <div>
        <div class="room-card-id">${id}</div>
        <div class="room-card-meta">${room.players}/2 players</div>
      </div>
      <div class="room-card-badge">${isFull ? "Full" : "Join →"}</div>`;

    if (!isFull) {
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        socket.emit("joinRoom", id);
      });
    }
    roomList.appendChild(card);
  });
}

// ── Background Particles ──────────────────────────────
(function createParticles() {
  const container = document.getElementById("bgParticles");
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("div");
    const size = Math.random() * 3 + 1;
    p.style.cssText = `
      position:absolute;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:rgba(${Math.random() > 0.5 ? "233,69,96" : "199,125,255"},${Math.random() * 0.4 + 0.1});
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      animation: floatParticle ${8 + Math.random() * 12}s ease-in-out infinite;
      animation-delay: ${-Math.random() * 10}s;
    `;
    container.appendChild(p);
  }

  const style = document.createElement("style");
  style.textContent = `
    @keyframes floatParticle {
      0%, 100% { transform: translateY(0) translateX(0); opacity: 0.6; }
      33% { transform: translateY(-30px) translateX(15px); opacity: 1; }
      66% { transform: translateY(20px) translateX(-10px); opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
})();
