const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "lobby.html"));
});

// ===== Room Management =====
let rooms = {};
let waitingQueue = []; // for quick match

function generateRoomId() {
  return "room-" + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function broadcastRooms() {
  // Send only joinable rooms (public, not full, not started)
  const publicRooms = {};
  for (const [id, room] of Object.entries(rooms)) {
    // Count __pending__ as occupied — don't let strangers steal the slot
    const occupiedSlots = room.players.length; // includes __pending__
    if (room.isPublic && occupiedSlots < 2 && !room.gameStarted) {
      publicRooms[id] = {
        players: occupiedSlots,
        host: room.host
      };
    }
  }
  io.emit("updateRooms", publicRooms);
}

function handlePlayerLeave(socket, isPageTransition = false) {
  const roomId = socket.roomId;
  if (!roomId || !rooms[roomId]) return;

  const room = rooms[roomId];

  // Mark this socket as leaving but don't remove immediately
  // The player might just be navigating to the game page (page transition)
  console.log(`👋 Player ${socket.id} left room ${roomId}`);

  socket.roomId = null;

  if (isPageTransition) {
    // Give the client time to reconnect with a new socket on the next page
    // Replace the disconnected socket id with a placeholder
    const idx = room.players.indexOf(socket.id);
    if (idx !== -1) room.players[idx] = "__pending__";

    setTimeout(() => {
      if (!rooms[roomId]) return;
      // If still pending (no one rejoined), clean up
      if (room.players.includes("__pending__")) {
        room.players = room.players.filter(id => id !== "__pending__");
        if (room.players.length === 0) {
          delete rooms[roomId];
          console.log(`🗑️ Room ${roomId} deleted (no rejoin)`);
        } else {
          room.gameStarted = false;
          socket.to(roomId).emit("partnerLeft");
        }
        broadcastRooms();
      }
    }, 30000); // 30 seconds window for page transition
  } else {
    // Intentional leave — remove immediately
    room.players = room.players.filter(id => id !== socket.id);
    socket.to(roomId).emit("partnerLeft");

    if (room.players.length === 0) {
      delete rooms[roomId];
      console.log(`🗑️ Room ${roomId} deleted`);
    } else {
      room.gameStarted = false;
    }
    broadcastRooms();
  }
}

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  socket.emit("updateRooms", (() => {
    const publicRooms = {};
    for (const [id, room] of Object.entries(rooms)) {
      if (room.isPublic && room.players.length < 2 && !room.gameStarted) {
        publicRooms[id] = { players: room.players.length, host: room.host };
      }
    }
    return publicRooms;
  })());

  // ── Rejoin Room (after page navigation) ──────────────
  socket.on("rejoinRoom", (roomId) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomNotFound");
      return;
    }

    // Case 1: Replace __pending__ placeholder with the new socket id
    const pendingIdx = room.players.indexOf("__pending__");
    if (pendingIdx !== -1) {
      const wasHost = (pendingIdx === 0); // host is always players[0]
      room.players[pendingIdx] = socket.id;
      socket.join(roomId);
      socket.roomId = roomId;
      if (wasHost) room.host = socket.id; // update host to new socket id
      console.log(`🔄 ${socket.id} rejoined ${roomId} (replaced pending${wasHost ? ", is host" : ""}, ${room.players.length}/2)`);
    }
    // Case 2: Not in room yet (second player navigating from lobby)
    else if (!room.players.includes(socket.id) && room.players.length < 2) {
      room.players.push(socket.id);
      socket.join(roomId);
      socket.roomId = roomId;
      console.log(`🔄 ${socket.id} rejoined ${roomId} (new slot, ${room.players.length}/2)`);
    }
    // Case 3: Already registered (same socket reconnecting)
    else if (room.players.includes(socket.id)) {
      socket.join(roomId);
      socket.roomId = roomId;
      console.log(`🔄 ${socket.id} already in ${roomId}`);
    }
    // Case 4: Room is full with real players
    else {
      socket.emit("roomFull");
      return;
    }

    socket.emit("roomRejoined", { roomId, playerCount: room.players.length });
    io.to(roomId).emit("playerUpdate", room.players.length);
    broadcastRooms();

    // Count only REAL players (not pending placeholders)
    const realPlayers = room.players.filter(id => id !== "__pending__");

    // Start game when 2 real players are on the game page
    if (realPlayers.length === 2 && !room.gameStarted) {
      room.gameStarted = true;
      setTimeout(() => {
        io.to(roomId).emit("startGame", { hostId: room.host });
        console.log(`🎮 Game started in ${roomId}, host: ${room.host}`);
      }, 1500);
    }
  });

  // ── Create Room ──────────────────────────────────────
  socket.on("createRoom", ({ roomId, isPublic }) => {
    if (rooms[roomId]) {
      socket.emit("error", "Room already exists");
      return;
    }
    rooms[roomId] = {
      players: [socket.id],
      gameStarted: false,
      isPublic: isPublic !== false,
      host: socket.id,
      reactions: {}
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit("roomCreated", roomId);
    io.to(roomId).emit("playerUpdate", 1);
    broadcastRooms();
    console.log(`🏠 Room ${roomId} created by ${socket.id}`);
  });

  // ── Join Room ─────────────────────────────────────────
  socket.on("joinRoom", (roomId) => {
    const room = rooms[roomId];

    if (!room) {
      socket.emit("roomNotFound");
      return;
    }
    if (room.players.length >= 2) {
      socket.emit("roomFull");
      return;
    }
    if (room.players.includes(socket.id)) return;

    room.players.push(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`👤 ${socket.id} joined ${roomId}`);
    io.to(roomId).emit("playerUpdate", room.players.length);
    socket.emit("roomJoined", roomId);
    broadcastRooms();

    // Do NOT start game here — wait for both players to rejoin via index.html
    // The game will start once both sockets call rejoinRoom from the game page
  });

  // ── Quick Match ───────────────────────────────────────
  socket.on("quickMatch", () => {
    // Check if there's someone waiting
    if (waitingQueue.length > 0 && waitingQueue[0] !== socket.id) {
      const partnerId = waitingQueue.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        const roomId = generateRoomId();
        rooms[roomId] = {
          players: [partnerId, socket.id],
          gameStarted: true,
          isPublic: false,
          host: partnerId,
          reactions: {}
        };
        partnerSocket.join(roomId);
        socket.join(roomId);
        partnerSocket.roomId = roomId;
        socket.roomId = roomId;
        io.to(roomId).emit("quickMatchFound", roomId);
        setTimeout(() => {
          io.to(roomId).emit("startGame", { hostId: partnerId });
        }, 2000);
        console.log(`⚡ Quick match: ${roomId}`);
        return;
      }
    }
    waitingQueue.push(socket.id);
    socket.emit("waitingForMatch");
    console.log(`⏳ ${socket.id} waiting for match`);
  });

  socket.on("cancelQuickMatch", () => {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    socket.emit("matchCancelled");
  });

  // ── Disconnect ────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    if (socket.roomId) handlePlayerLeave(socket, true); // treat as possible page transition
  });

  // ── Leave Room ────────────────────────────────────────
  socket.on("leaveRoom", () => {
    handlePlayerLeave(socket, false); // intentional leave
  });

  // ── WebRTC Signaling ──────────────────────────────────
  socket.on("offer", ({ offer, to }) => {
    socket.to(to).emit("offer", { offer, from: socket.id });
  });
  socket.on("answer", ({ answer, to }) => {
    socket.to(to).emit("answer", { answer, from: socket.id });
  });
  socket.on("iceCandidate", ({ candidate, to }) => {
    socket.to(to).emit("iceCandidate", { candidate, from: socket.id });
  });
  socket.on("requestOffer", () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const partner = room.players.find(id => id !== socket.id && id !== "__pending__");
      if (partner) {
        socket.to(partner).emit("makeOffer", socket.id);
        console.log(`📞 Offer requested: ${socket.id} → ${partner}`);
      }
    }
  });

  // ── Reactions ─────────────────────────────────────────
  socket.on("sendReaction", ({ type }) => {
    if (socket.roomId) {
      const room = rooms[socket.roomId];
      if (!room) return;
      if (!room.reactions[socket.id]) room.reactions[socket.id] = {};
      room.reactions[socket.id][type] = (room.reactions[socket.id][type] || 0) + 1;
      socket.to(socket.roomId).emit("partnerReaction", { type });
    }
  });

  // ── Round Sync ────────────────────────────────────────
  socket.on("roundComplete", ({ round }) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("roundComplete", { round });
    }
  });

  // ── Final Reveal ──────────────────────────────────────
  socket.on("revealReady", () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      if (!room.revealReady) {
        room.revealReady = [socket.id];
      } else {
        room.revealReady.push(socket.id);
      }
      if (room.revealReady.length >= 2) {
        io.to(socket.roomId).emit("startReveal");
        room.revealReady = [];
      } else {
        socket.to(socket.roomId).emit("partnerRevealReady");
      }
    }
  });

  // ── Match Result ──────────────────────────────────────
  socket.on("matchDecision", ({ decision }) => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      if (!room.decisions) room.decisions = {};
      room.decisions[socket.id] = decision;

      const players = room.players;
      if (room.decisions[players[0]] && room.decisions[players[1]]) {
        const bothLike =
          room.decisions[players[0]] === "like" &&
          room.decisions[players[1]] === "like";
        io.to(socket.roomId).emit("matchResult", {
          isMatch: bothLike,
          decisions: room.decisions
        });
        room.decisions = {};
      }
    }
  });

});

server.listen(PORT, () => {
  console.log(`🚀 Matchy Matchy running on http://localhost:${PORT}`);
});