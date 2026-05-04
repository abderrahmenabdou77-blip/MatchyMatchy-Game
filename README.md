# MatchyMatchy-Game
#Real-time blind-date game with WebRTC video, round-based challenges, and a final reveal moment. Built with Node.js + Socket.io.

# 🎭 Matchy Matchy

> A real-time blind-date game where two strangers connect voice & video behind a virtual wall, complete personality-based rounds, and decide whether to reveal themselves at the end.

---

## 💡 How It Works

Two players join a room — they can hear and talk to each other, but their cameras stay hidden behind a wall. They go through a series of timed rounds designed to spark real conversation. Only at the very end, if both players agree, the wall drops and they finally see each other.

---

## 🎮 Game Rounds

| Round | Duration | Topic |
|-------|----------|-------|
| 👋 Hi | 2 min | Say hello — no faces yet |
| ☀️ Lifestyle | 3 min | Daily life & passions |
| 🚩 Red Flags | 3 min | Deal-breakers & honesty |
| 💍 Dream Life | 2 min | Your idea of a perfect life |
| ✨ Final Reveal | — | The wall drops — like or pass |

---

## ✨ Features

- 🎥 **WebRTC video & audio** — peer-to-peer, real-time
- 🧱 **Virtual wall** — camera hidden until the final reveal
- 🏠 **Room system** — create a private room or join a public one
- ⚡ **Quick Match** — get paired instantly with a stranger
- 💬 **Live reactions** — send ❤️ 🌸 🚩 👏 during the conversation
- 🔊 **Voice activity indicator** — see when your partner is speaking
- 💘 **Match result** — both players vote independently (like / pass)
- 🔄 **Auto-reconnect** — handles page transitions without losing the room

---

## 🛠️ Tech Stack

- **Backend** — Node.js, Express, Socket.io
- **Frontend** — Vanilla JS, HTML/CSS
- **Real-time communication** — WebRTC (with STUN + TURN support)
- **Signaling** — Socket.io (offer / answer / ICE candidate relay)

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm

### Install & Run

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/matchy-matchy.git
cd matchy-matchy

# Install dependencies
npm install

# Start the server
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### Run with ngrok (for remote play)

```bash
# In a separate terminal
ngrok http 3000
```

Share the **https** ngrok URL with your friend — camera/mic require a secure context (HTTPS).

---

## 📁 Project Structure

```
matchy-matchy/
├── server.js              # Express + Socket.io server
├── lobby.html             # Room browser & matchmaking UI
├── index.html             # Main game screen
├── src/
│   ├── main.js            # WebRTC + game logic
│   └── lobby.js           # Lobby logic
└── assets/
    └── config/
        └── gameConfig.js  # Rounds, timers, reactions config
```

---

## ⚙️ Configuration

Edit `assets/config/gameConfig.js` to customize rounds, durations, and reactions:

```js
const GAME_CONFIG = {
  rounds: [
    { id: "intro", title: "HI 👋", duration: 120, ... },
    // add or remove rounds here
  ],
  revealCountdown: 5,   // seconds before cameras reveal
  reactions: [ ... ]
};
```

---

## 🌐 WebRTC & TURN Server

By default the app uses [openrelay.metered.ca](https://openrelay.metered.ca) as a free TURN server, which allows the video/audio to work between players on **different networks** (not just the same Wi-Fi).

For production use, register a free account at [dashboard.metered.ca](https://dashboard.metered.ca) and replace the credentials in `src/main.js`:

```js
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:YOUR_TURN_SERVER",
    username: "YOUR_USERNAME",
    credential: "YOUR_CREDENTIAL"
  }
];
```

---

## 📄 License

MIT
