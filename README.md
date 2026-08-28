# AniStream 2.0 — Otaku Cinema Anime Streaming

An obsidian-black anime streaming platform built on glassmorphic dark charcoal surfaces, modern display typography, vermilion-crimson accents, and high-performance video streaming powered by ani-cli and AniList GraphQL.

---

## Key Features

- **Otaku Cinema Video Player**:
  - Native HLS.js adaptive bitrate player (1080p, 720p, 480p, 360p).
  - In-player SUB / DUB audio track switcher without losing playback position.
  - Interactive pointer drag scrubber with live hover time preview and buffer indicators.
  - **Auto-Play Next Episode**: Cancelable countdown overlay upon episode completion.
  - **Exact Resume**: Stores playback timestamp in seconds to resume where you left off.
  - **1000+ Episode Support**: Tabbed range selector (1-100, 101-200, ..., 1101+), latest episode jump, and reverse order toggle.

- **Live Dynamic Homepage & Spotlight Carousel**:
  - Auto-cycling **Spotlight Hero Billboard** with high-resolution banner artwork, studio metadata, community scores, and quick watch buttons.
  - **Live Multi-Row Showcase**: Real-time Trending Now, Popular Anime, and Top Rated Masterpieces.
  - **Interactive Genre Filter**: Filter galleries dynamically across 10+ genres (Action, Fantasy, Sci-Fi, Romance, etc.).
  - **16:9 Landscape Continue Watching**: Visual thumbnail cards with progress bars and 1-tap delete.

- **Mobile-First Experience**:
  - Pinned glassmorphic Mobile Bottom Navigation Bar (Cinema, Search, Library, Shortcuts).
  - Auto-responsive 2-to-3 column poster grid with touch-friendly tap targets.
  - Full touch scrubber and gesture-friendly playback controls.

- **Ultra-Fast Hybrid Search**:
  - Debounced autocomplete dropdown (<200ms) with keyboard arrow selection.
  - Rich anime metadata powered by AniList GraphQL + Kitsu fallback.

- **Full Keyboard Shortcuts**:
  - Complete hotkeys matching professional media players (`Space`, `F`, `M`, `Left`/`Right`, `Up`/`Down`, `N`/`P`, `0`-`9`, `?`).

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Space / K | Toggle Play / Pause |
| F | Toggle Fullscreen |
| M | Toggle Mute |
| Left / J | Seek Backward 10 seconds |
| Right / L | Seek Forward 10 seconds |
| Up / Down | Volume Up / Down (10% steps) |
| N | Next Episode |
| P | Previous Episode |
| 0 – 9 | Jump to 0% – 90% of duration |
| ? | Open Shortcuts Modal |
| Esc | Exit Fullscreen / Close Player / Modals |

---

## Quick Start

### Option 1: Standard Development Mode (Interactive)

```bash
# Clone repository
git clone https://github.com/KARTHIKKJ369/anistream_2.0.git
cd anistream_2.0

# Install dependencies
npm install

# Run with live logs & auto-reload
npm run dev
```

- Opens on **http://localhost:7474**
- Watch mode automatically reloads when files change (`node --watch`).
- Stop anytime with `Ctrl + C`.

---

### Option 2: Background Daemon Mode (Detached)

```bash
# Start server in the background
./start.sh
```

- Runs detached in the background so you can close your terminal window.
- View live logs: `tail -f server.log`
- Stop anytime: `./stop.sh`

---

## Project Structure

```text
anistream_2.0/
├── public/
│   ├── index.html          # Otaku Cinema SPA Layout, Billboard Hero & Video Player UI
│   ├── style.css           # Design system (Obsidian / Crimson / Hairlines / Mobile)
│   ├── app.js              # Client Engine: Hash Router, HLS Player, Carousel, Shortcuts
│   ├── logo.svg            # Vector Brand Logo Asset
│   └── favicon.svg         # High-Res Vector Favicon
├── server/
│   ├── index.js            # Express Server & Safe HLS Stream Relay
│   ├── anidb.js            # Multi-tier Scraper & AniList/Kitsu Live Metadata Engine
│   └── history.js          # ani-cli ani-hsts & ani-progress.json Sync Store
├── start.sh                # Background Daemon Launcher
├── stop.sh                 # Clean Process Stopper
├── .env.example            # Environment Variable Template
└── README.md               # Documentation
```

---

## Design System Tokens

- **Canvas**: `#0a0a0c` (Abyssal Obsidian)
- **Surfaces**: `#131318` (Surface 1), `#1a1a22` (Surface 2), `#242430` (Surface 3)
- **Accent**: `#e11d48` (Vermilion Crimson), Hover: `#f43f5e`
- **Typography**: `Outfit` (Display/Headings), `Plus Jakarta Sans` (UI/Body), `JetBrains Mono` (Tech/Hotkeys)
- **Border**: `rgba(255, 255, 255, 0.08)` (1px Razor Hairline)

---

## License

MIT License • Powered by [ani-cli](https://github.com/pystardust/ani-cli) & [AniList GraphQL](https://anilist.gitbook.io/anilist-apiv2-docs/).
