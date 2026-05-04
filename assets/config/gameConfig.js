// =====================================================
// MATCHY MATCHY — Game Configuration
// =====================================================

const GAME_CONFIG = {
  // Round definitions (title shown on wall, duration in seconds)
  rounds: [
    {
      id: "intro",
      title: "HI 👋",
      subtitle: "Say hello! Don't show your face yet.",
      duration: 120,        // 2 min
      wallColor: "#1a1a2e",
      accentColor: "#e94560",
      wallEmoji: "👋"
    },
    {
      id: "lifestyle",
      title: "LIFESTYLE ☀️",
      subtitle: "Talk about your daily life & passions.",
      duration: 180,        // 3 min
      wallColor: "#0f3460",
      accentColor: "#f5a623",
      wallEmoji: "☀️"
    },
    {
      id: "redflags",
      title: "RED FLAGS 🚩",
      subtitle: "Time to be honest. What are your deal-breakers?",
      duration: 180,        // 3 min
      wallColor: "#16213e",
      accentColor: "#e94560",
      wallEmoji: "🚩"
    },
    {
      id: "wedding",
      title: "DREAM LIFE 💍",
      subtitle: "What does your perfect life look like?",
      duration: 120,        // 2 min
      wallColor: "#0d1b2a",
      accentColor: "#c77dff",
      wallEmoji: "💍"
    },
    {
      id: "final",
      title: "FINAL REVEAL ✨",
      subtitle: "The wall comes down. Ready?",
      duration: 0,
      wallColor: "#10002b",
      accentColor: "#e0aaff",
      wallEmoji: "✨"
    }
  ],

  // Reveal countdown duration (seconds)
  revealCountdown: 5,

  // Wall opacity fade start (seconds before round end)
  wallFadeStart: 10,

  // Max players per room
  maxPlayers: 2,

  // Reactions available
  reactions: [
    { id: "heart",   emoji: "❤️",  label: "Love it"  },
    { id: "flower",  emoji: "🌸",  label: "Sweet"    },
    { id: "redflag", emoji: "🚩",  label: "Red flag" },
    { id: "clap",    emoji: "👏",  label: "Agree"    }
  ]
};

if (typeof module !== "undefined") module.exports = GAME_CONFIG;
