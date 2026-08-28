# 🎌 AniStream 2.0 — Otaku Cinema Anime Streaming

> An abyssal obsidian-black interface built on raw dark charcoal surfaces, high-contrast display typography, vermilion-crimson accents, and high-performance video streaming powered by **ani-cli** and **AniList**.

---

## ✨ Features

- 🎬 **Otaku Cinema Video Player**:
  - Native HLS.js adaptive bitrate player (1080p, 720p, 480p, 360p).
  - In-player **SUB / DUB** track switching without losing current playback position.
  - Interactive pointer drag scrubber with live hover time preview and buffer indicators.
  - **Auto-Play Next Episode**: Cancelable 5-second countdown overlay on episode completion.
  - **Exact Resume**: Remembers exact seconds watched so you pick up right where you left off.
- ⚡ **Ultra-Fast Hybrid Search**:
  - Debounced instant autocomplete dropdown (<200ms) with arrow key navigation.
  - Rich anime metadata powered by AniList GraphQL: HD cover art, banners, synopsis, ratings, studio, air date, and cast avatars.
- 🔄 **`ani-cli` Bidirectional History Sync**:
  - Seamlessly syncs with your native terminal `ani-cli` history file (`~/.local/state/ani-cli/ani-hsts`).
  - Intelligent title sanitization that cleans episode tags and resolves CLI shorthand (`1P` ➔ *One Piece*, `AOT` ➔ *Attack on Titan*, `SL` ➔ *Solo Leveling*).
- ⌨️ **Full Keyboard Shortcuts**:
  - Complete keyboard navigation matching modern cinema players (`Space`, `F`, `M`, `←`/`→`, `↑`/`↓`, `N`/`P`, `0`-`9`, `?`).
- 🛡️ **Safe Stream Proxy**:
  - Edge-to-edge HLS stream proxy with client lifecycle management (kills orphaned `curl` processes on seek/close).
  - SSRF protection against private IP access.
- 🚀 **Background Daemon Support**:
  - Run `./start.sh` and safely close your terminal window — AniStream stays alive in the background.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> / <kbd>K</kbd> | Toggle Play / Pause |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>←</kbd> / <kbd>J</kbd> | Seek Backward 10 seconds |
| <kbd>→</kbd> / <kbd>L</kbd> | Seek Forward 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume Up / Down (10% steps) |
| <kbd>N</kbd> | Next Episode |
| <kbd>P</kbd> | Previous Episode |
| <kbd>0</kbd> – <kbd>9</kbd> | Jump to 0% – 90% of duration |
| <kbd>?</kbd> | Open Shortcuts Cheatsheet Modal |
| <kbd>Esc</kbd> | Exit Fullscreen / Close Player / Modals |

---

## 🚀 Quick Start

### 📋 Prerequisites & Installation (Linux / Ubuntu / macOS)

If running on a fresh Linux / Ubuntu VM (e.g. Azure / AWS / DigitalOcean):

```bash
# 1. Install Node.js (v20+ recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install dependencies
npm install
```

### 1. Launch in Background (Daemon Mode)

```bash
./start.sh
```

- Server starts in the background on **http://localhost:7474**
- You can **safely close your terminal** window after starting!
- View live logs anytime with: `tail -f server.log`

### 2. Stop Server

```bash
./stop.sh
```

---

## 🏗️ Project Architecture

```text
anistream_2.0/
├── public/
│   ├── index.html       # Otaku Cinema SPA Layout & Video Player UI
│   ├── style.css        # MASTER design system (Obsidian / Crimson / Hairlines)
│   └── app.js           # Client Engine: Hash Router, HLS Player, Keyboard Hotkeys
├── server/
│   ├── index.js         # Express Server & Safe HLS Stream Proxy
│   ├── anidb.js         # Hybrid Scraper & AniList GraphQL Metadata Engine
│   └── history.js       # ani-cli ani-hsts & ani-progress.json Sync Store
├── start.sh             # Background Daemon Launcher
├── stop.sh              # Clean Process Stopper
├── MASTER.md            # Design System Specification
└── README.md            # Documentation
```

---

## 🎨 Design System Tokens

- **Canvas**: `#0a0a0c` (Abyssal Obsidian)
- **Surfaces**: `#141419` (Surface 1), `#1c1c24` (Surface 2), `#262632` (Surface 3)
- **Accent**: `#e11d48` (Vermilion Crimson), Hover: `#f43f5e`
- **Typography**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (Tight `-0.025em` tracking)
- **Border**: `rgba(255, 255, 255, 0.08)` (1px Razor Hairline)

---

## 📜 License

MIT License • Powered by [ani-cli](https://github.com/pystardust/ani-cli) & [AniList GraphQL](https://anilist.gitbook.io/anilist-apiv2-docs/).
