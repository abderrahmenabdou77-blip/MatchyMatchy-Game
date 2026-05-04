// =====================================================
// MATCHY MATCHY — Main Game Logic v2.0
// Full WebRTC + Socket.io + Round System
// =====================================================

const socket = io();

// ── DOM References ─────────────────────────────────────
const screenWaiting  = document.getElementById("screenWaiting");
const screenGame     = document.getElementById("screenGame");
const screenReveal   = document.getElementById("screenReveal");
const screenResult   = document.getElementById("screenResult");
const waitingRoomId  = document.getElementById("waitingRoomId");
const timerText      = document.getElementById("timerText");
const timerDisplay   = document.getElementById("timerDisplay");
const roundLabel     = document.getElementById("roundLabel");
const stageStrip     = document.getElementById("stageStrip");
const wall           = document.getElementById("wall");
const wallContainer  = document.getElementById("wallContainer");
const wallEmoji      = document.getElementById("wallEmoji");
const wallRoundTitle = document.getElementById("wallRoundTitle");
const wallSubtitle   = document.getElementById("wallSubtitle");
const gameBg         = document.getElementById("gameBg");
const btnExit        = document.getElementById("btnExit");
const btnMic         = document.getElementById("btnMic");
const btnCam         = document.getElementById("btnCam");
const myVideoEl      = document.getElementById("myVideo");
const partnerVideoEl = document.getElementById("partnerVideo");
const revealMyVideo  = document.getElementById("revealMyVideo");
const revealPartner  = document.getElementById("revealPartnerVideo");
const partnerMask    = document.getElementById("partnerMask");
const myMask         = document.getElementById("myMask");
const reactionOverlay= document.getElementById("reactionOverlay");
const countdownNum   = document.getElementById("countdownNum");
const decisionRow    = document.getElementById("decisionRow");
const waitingDecision= document.getElementById("waitingDecision");
const resultBox      = document.getElementById("resultBox");
const mySpeaking     = document.getElementById("mySpeaking");
const partnerSpeaking= document.getElementById("partnerSpeaking");

// ── State ──────────────────────────────────────────────
const roomId = sessionStorage.getItem("roomId");
let myStream = null;
let remoteStream = null;
let peerConnection = null;
let partnerId = null;
let currentRound = -1;
let timerInterval = null;
let micEnabled = true;
let myDecision = null;
let voiceDetector = null;

// ── Rounds (from config) ───────────────────────────────
const ROUNDS = GAME_CONFIG.rounds;

// ── Init ───────────────────────────────────────────────
if (!roomId) {
  alert("⚠️ No room found. Redirecting…");
  window.location.href = "lobby.html";
} else {
  waitingRoomId.textContent = roomId;
  initMedia();
  buildStageStrip();
}

// ── Socket: Rejoin Room ────────────────────────────────
socket.on("roomRejoined", ({ roomId: rid, playerCount }) => {
  console.log(`🔄 Rejoined room ${rid} (${playerCount}/2)`);
  waitingRoomId.textContent = rid;
  // Stay on waiting screen until startGame is received
  // WebRTC is initiated inside startGame handler
});

socket.on("roomNotFound", () => {
  alert("⚠️ Room expired or not found. Redirecting…");
  sessionStorage.removeItem("roomId");
  window.location.href = "lobby.html";
});

// ── Build Stage Indicators ─────────────────────────────
function buildStageStrip() {
  const playableRounds = ROUNDS.filter(r => r.id !== "final");
  playableRounds.forEach((r, i) => {
    const dot = document.createElement("div");
    dot.className = "stage-dot";
    dot.id = `stage-${i}`;
    dot.title = r.title;
    stageStrip.appendChild(dot);
  });
}

function updateStageStrip(roundIndex) {
  const dots = stageStrip.querySelectorAll(".stage-dot");
  dots.forEach((d, i) => {
    d.classList.remove("active", "done");
    if (i < roundIndex) d.classList.add("done");
    if (i === roundIndex) d.classList.add("active");
  });
}

// ── Media Setup ────────────────────────────────────────
async function initMedia() {
  try {
    // getUserMedia must be called in response to page load (user already clicked a button in lobby)
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    myVideoEl.srcObject = myStream;
    revealMyVideo.srcObject = myStream;
    setupVoiceActivity();
    console.log("📷 Media ready");
  } catch (err) {
    console.error("Media error:", err.name, err.message);
    myStream = null;
    // Show a visible warning to the user
    const warn = document.createElement("div");
    warn.style.cssText = "position:fixed;top:0;left:0;right:0;background:#e94560;color:#fff;text-align:center;padding:10px;font-size:14px;z-index:9999;";
    warn.textContent = "⚠️ Camera/Mic access denied. Please allow permissions and refresh.";
    document.body.prepend(warn);
  }
  // Always rejoin after media setup (success or fail)
  socket.emit("rejoinRoom", roomId);
}

// ── Voice Activity Detection ───────────────────────────
function setupVoiceActivity() {
  if (!myStream) return;
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(myStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function detect() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      mySpeaking.classList.toggle("active", avg > 15);
      voiceDetector = requestAnimationFrame(detect);
    }
    detect();
  } catch(e) { /* no audio ctx */ }
}

// ── Socket Events ──────────────────────────────────────
socket.on("playerUpdate", (count) => {
  console.log(`👥 Players: ${count}`);
});

socket.on("startGame", ({ hostId }) => {
  console.log("🎮 Game starting! Host:", hostId, "Me:", socket.id);
  showScreen(screenGame);
  setTimeout(() => startRound(0), 800);

  // Only the host initiates the WebRTC offer to avoid collision
  // Give extra delay so both sides are ready
  if (socket.id === hostId) {
    setTimeout(() => {
      console.log("📞 I am host, sending requestOffer");
      socket.emit("requestOffer");
    }, 1000);
  } else {
    console.log("⏳ I am guest, waiting for offer");
  }
});

socket.on("makeOffer", async (targetId) => {
  partnerId = targetId;
  await createPeerConnection(targetId);
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { offer, to: targetId });
});

socket.on("offer", async ({ offer, from }) => {
  partnerId = from;
  await createPeerConnection(from);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  // Flush buffered ICE candidates
  for (const c of iceCandidateBuffer) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
  }
  iceCandidateBuffer = [];
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { answer, to: from });
});

socket.on("answer", async ({ answer }) => {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    // Flush buffered ICE candidates
    for (const c of iceCandidateBuffer) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
    }
    iceCandidateBuffer = [];
  }
});

socket.on("iceCandidate", async ({ candidate }) => {
  if (!peerConnection) return;
  if (candidate) {
    if (peerConnection.remoteDescription) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch(e) { console.warn("ICE candidate error:", e); }
    } else {
      // Buffer until remoteDescription is set
      iceCandidateBuffer.push(candidate);
    }
  }
});

socket.on("partnerReaction", ({ type }) => {
  const map = { heart: "❤️", flower: "🌸", clap: "👏", redflag: "🚩" };
  spawnReaction(map[type] || "❓", "partner");
  partnerSpeaking.classList.add("active");
  setTimeout(() => partnerSpeaking.classList.remove("active"), 1000);
});

socket.on("partnerLeft", () => {
  alert("⚠️ Your match left the room.");
  cleanup();
  window.location.href = "lobby.html";
});

socket.on("partnerRevealReady", () => {
  // Partner clicked reveal — show countdown
});

socket.on("startReveal", () => {
  beginCountdown();
});

socket.on("matchResult", ({ isMatch, decisions }) => {
  showResult(isMatch);
});

// ── WebRTC ─────────────────────────────────────────────
let iceCandidateBuffer = []; // buffer candidates that arrive before remoteDescription is set

// ══════════════════════════════════════════════════════
// ICE SERVERS CONFIG
// ──────────────────────────────────────────────────────
// STUN فقط → يعمل على نفس الشبكة، يفشل عبر الإنترنت
// TURN مطلوب → يمرر الصوت/الفيديو عبر سيرفر وسيط
//
// للحصول على بيانات TURN الخاصة بك (مجاناً):
//   https://dashboard.metered.ca  ← أنشئ حساباً واحصل على username/credential
//
// الحالي: openrelay.metered.ca (مجاني للتجربة، بدون تسجيل)
// ══════════════════════════════════════════════════════
const ICE_SERVERS = [
  // STUN — لاكتشاف العنوان العام
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },

  // TURN عبر UDP (أسرع)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  // TURN عبر TCP (يخترق جدران الحماية الصارمة)
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  // TURNS عبر TLS (الأكثر توافقاً مع شبكات الشركات والجامعات)
  {
    urls: "turns:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

async function createPeerConnection(targetId) {
  // Close any existing connection first
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  iceCandidateBuffer = [];

  peerConnection = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10 // pre-gather candidates للتسريع
  });

  // Add local tracks
  if (myStream) {
    myStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, myStream);
    });
  }

  // Receive remote stream — attach to both video elements
  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) {
      remoteStream = stream;
      partnerVideoEl.srcObject = stream;
      revealPartner.srcObject = stream;
      partnerVideoEl.play().catch(() => {});
      revealPartner.play().catch(() => {});
      console.log("📡 Remote stream received, tracks:", stream.getTracks().map(t => t.kind));
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("iceCandidate", { candidate: event.candidate, to: targetId });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("WebRTC state:", peerConnection.connectionState);

    // إذا فشل الاتصال، أعد المحاولة تلقائياً
    if (peerConnection.connectionState === "failed") {
      console.warn("⚠️ WebRTC connection failed — retrying via TURN...");
      peerConnection.restartIce();
    }
  };

  peerConnection.onicegatheringstatechange = () => {
    console.log("ICE gathering:", peerConnection.iceGatheringState);
  };

  // تسجيل نوع المرشح المستخدم (للتشخيص)
  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
  };
}

// ── Round System ───────────────────────────────────────
function startRound(index) {
  currentRound = index;
  const round = ROUNDS[index];

  if (round.id === "final") {
    showFinalReveal();
    return;
  }

  // Show round transition
  showRoundTransition(round, () => {
    // Update UI
    roundLabel.textContent = round.title;
    wallEmoji.textContent = round.wallEmoji;
    wallRoundTitle.textContent = round.title;
    wallSubtitle.textContent = round.subtitle;

    // Update stage strip
    const playableIndex = ROUNDS.filter(r => r.id !== "final").findIndex(r => r.id === round.id);
    updateStageStrip(playableIndex);

    // Update background accent
    gameBg.style.background = `
      radial-gradient(ellipse 70% 60% at 15% 85%, ${round.accentColor}18 0%, transparent 60%),
      radial-gradient(ellipse 50% 70% at 85% 15%, rgba(199,125,255,0.07) 0%, transparent 60%)`;

    // Wall reset
    wall.style.opacity = "1";
    wall.style.transform = "scaleX(1)";
    partnerMask.style.opacity = "1";

    // Start timer
    startTimer(round.duration, () => {
      endRound(index);
    });
  });
}

function showRoundTransition(round, callback) {
  const overlay = document.createElement("div");
  overlay.className = "round-transition";
  overlay.innerHTML = `
    <div class="transition-emoji">${round.wallEmoji}</div>
    <div class="transition-title">${round.title}</div>
    <div class="transition-sub">${round.subtitle}</div>
    <div class="transition-progress"><div class="transition-bar"></div></div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.5s";
    setTimeout(() => { overlay.remove(); callback && callback(); }, 500);
  }, 3000);
}

function startTimer(duration, onComplete) {
  clearInterval(timerInterval);
  let timeLeft = duration;
  updateTimerDisplay(timeLeft, duration);

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timeLeft, duration);

    // Fade wall in last 10 seconds
    if (timeLeft <= 10 && timeLeft > 0) {
      const ratio = timeLeft / 10;
      wall.style.opacity = ratio.toString();
      partnerMask.style.opacity = ratio.toString();
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      onComplete && onComplete();
    }
  }, 1000);
}

function updateTimerDisplay(timeLeft, total) {
  const min = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const sec = String(timeLeft % 60).padStart(2, "0");
  timerText.textContent = `${min}:${sec}`;
  timerDisplay.classList.toggle("urgent", timeLeft <= 30 && timeLeft > 0);
}

function endRound(index) {
  if (index + 1 < ROUNDS.length) {
    startRound(index + 1);
  }
}

// ── Final Reveal ───────────────────────────────────────
function showFinalReveal() {
  clearInterval(timerInterval);
  showScreen(screenReveal);
  roundLabel.textContent = "FINAL REVEAL ✨";
  timerText.textContent = "REVEAL";

  // Attach streams
  if (myStream) {
    revealMyVideo.srcObject = myStream;
    revealMyVideo.play().catch(() => {});
  }
  if (remoteStream) {
    revealPartner.srcObject = remoteStream;
    revealPartner.play().catch(() => {});
  } else if (partnerVideoEl.srcObject) {
    revealPartner.srcObject = partnerVideoEl.srcObject;
    revealPartner.play().catch(() => {});
  }

  // Decision button handlers
  document.getElementById("btnLike").addEventListener("click", () => handleDecision("like"), { once: true });
  document.getElementById("btnPass").addEventListener("click", () => handleDecision("pass"), { once: true });

  // Tell server this player is ready
  socket.emit("revealReady");
}

function beginCountdown() {
  let count = GAME_CONFIG.revealCountdown;
  const display = document.getElementById("countdownDisplay");
  countdownNum.textContent = count;
  display.style.display = "flex";

  const cd = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNum.textContent = count;
    } else {
      clearInterval(cd);
      display.style.display = "none";
      decisionRow.hidden = false;
    }
  }, 1000);
}

// ── Decisions ──────────────────────────────────────────
function handleDecision(decision) {
  myDecision = decision;
  decisionRow.hidden = true;
  waitingDecision.hidden = false;
  socket.emit("matchDecision", { decision });
}

function showResult(isMatch) {
  showScreen(screenResult);

  if (isMatch) {
    spawnConfetti();
    resultBox.innerHTML = `
      <div class="result-match">💘</div>
      <div class="result-title">It's a Match!</div>
      <p class="result-sub">You both felt the connection. Time to move from behind the wall to real life.</p>
      <div class="result-actions">
        <button class="btn-result primary" onclick="window.location.href='lobby.html'">Play Again</button>
        <button class="btn-result ghost" onclick="cleanup(); window.location.href='lobby.html'">Back to Lobby</button>
      </div>
    `;
  } else {
    resultBox.innerHTML = `
      <div class="result-match">💔</div>
      <div class="result-title">No Match This Time</div>
      <p class="result-sub">It wasn't meant to be — but another match is just a room away.</p>
      <div class="result-actions">
        <button class="btn-result primary" onclick="cleanup(); window.location.href='lobby.html'">Try Again</button>
        <button class="btn-result ghost" onclick="cleanup(); window.location.href='lobby.html'">Back to Lobby</button>
      </div>
    `;
  }
}

// ── Reactions ──────────────────────────────────────────
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.reaction;
    socket.emit("sendReaction", { type });
    const map = { heart: "❤️", flower: "🌸", clap: "👏", redflag: "🚩" };
    spawnReaction(map[type], "me");
  });
});

function spawnReaction(emoji, side) {
  const el = document.createElement("div");
  el.className = "floating-reaction";
  el.textContent = emoji;
  el.style.left = side === "me"
    ? `${65 + Math.random() * 20}%`
    : `${10 + Math.random() * 20}%`;
  el.style.bottom = "120px";
  reactionOverlay.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Controls ───────────────────────────────────────────
btnMic.addEventListener("click", () => {
  micEnabled = !micEnabled;
  if (myStream) {
    myStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  }
  btnMic.classList.toggle("muted", !micEnabled);
  btnMic.innerHTML = micEnabled
    ? '<i class="fa-solid fa-microphone"></i><span>Mic</span>'
    : '<i class="fa-solid fa-microphone-slash"></i><span>Muted</span>';
});

btnExit.addEventListener("click", () => {
  if (confirm("Leave the room?")) {
    socket.emit("leaveRoom");
    cleanup();
    window.location.href = "lobby.html";
  }
});

// ── Screen Manager ─────────────────────────────────────
function showScreen(target) {
  [screenWaiting, screenGame, screenReveal, screenResult].forEach(s => {
    s.hidden = s !== target;
  });
}

// ── Confetti ───────────────────────────────────────────
function spawnConfetti() {
  const wrap = document.createElement("div");
  wrap.className = "confetti-wrap";
  document.body.appendChild(wrap);
  const colors = ["#e94560", "#c77dff", "#f5a623", "#4ade80", "#60a5fa", "#fbbf24"];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? "50%" : "0"};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 1}s;
      transform: rotate(${Math.random() * 360}deg);
    `;
    wrap.appendChild(p);
  }
  setTimeout(() => wrap.remove(), 4000);
}

// ── Cleanup ────────────────────────────────────────────
function cleanup() {
  clearInterval(timerInterval);
  if (myStream) myStream.getTracks().forEach(t => t.stop());
  if (peerConnection) peerConnection.close();
  if (voiceDetector) cancelAnimationFrame(voiceDetector);
  sessionStorage.removeItem("roomId");
}

window.addEventListener("beforeunload", () => {
  socket.emit("leaveRoom");
  cleanup();
});