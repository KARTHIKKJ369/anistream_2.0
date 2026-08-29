<div align="center">

<img src="./public/logo.svg" alt="AniStream Logo" width="280" />

# AniStream 2.0

*A high-performance anime streaming platform and media player built with pure vanilla web technologies, adaptive HLS playback, and dual runtime support for Node.js and Cloudflare Workers.*

[![Node.js](https://img.shields.io/badge/Node.js->=20.0.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Ready-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![AniList GraphQL](https://img.shields.io/badge/AniList-GraphQL_API-02A9FF?style=flat-square&logo=anilist&logoColor=white)](https://anilist.gitbook.io/anilist-apiv2-docs/)
[![HLS.js](https://img.shields.io/badge/Player-HLS.js-FF6B6B?style=flat-square)](https://github.com/video-dev/hls.js)
[![Style](https://img.shields.io/badge/Design_System-Otaku_Cinema-E11D48?style=flat-square)](MASTER.md)

[Overview](#overview) • [Features](#features) • [Quick Start](#quick-start) • [Deployment](#deployment) • [Configuration](#configuration) • [Keyboard Shortcuts](#keyboard-shortcuts) • [API Reference](#api-reference) • [Project Structure](#project-structure)

</div>

---

## Overview

**AniStream 2.0** is an anime streaming web application engineered around the *Otaku Cinema* design system: an obsidian-dark interface (`#0a0a0c`), vermilion-crimson accents (`#e11d48`), modern display typography, and zero decorative fluff. 

Under the hood, AniStream combines a lightweight single-page frontend with an intelligent multi-tier scraping engine and proxy relay. It can run as a local/VPS Node.js daemon or deploy serverlessly across Cloudflare's global edge network.

> [!NOTE]
> AniStream integrates directly with AniList GraphQL and Kitsu to fetch high-resolution banner artwork, studio credits, episode counts, scores, and broadcast schedules in real time.

---

## Features

- **Otaku Cinema Video Player**:
  - Native [HLS.js](https://github.com/video-dev/hls.js) adaptive bitrate streaming (1080p, 720p, 480p, 360p).
  - Seamless in-player **SUB / DUB** audio track switcher preserving current playback position.
  - Interactive pointer-drag scrubber with real-time hover time preview and buffer indicators.
  - **Auto-Play Next Episode** with a cancelable countdown overlay.
  - **Exact Resume Playback** saving per-second progress locally and server-side.
  - **Pagination for Long Series**: Tabbed episode chunks (`1-100`, `101-200`, ..., `1101+`), reverse order toggle, and instant jump to latest.

- **Dynamic Homepage & Spotlight Hero**:
  - Auto-cycling billboard hero showcasing high-res banners, studio metadata, community ratings, and quick-launch actions.
  - Real-time catalog rows: *Trending Now*, *Popular Series*, and *Top Rated*.
  - 10+ genre filters (Action, Fantasy, Sci-Fi, Romance, Shounen, etc.) for instant catalog refinement.
  - 16:9 landscape *Continue Watching* carousel with progress bars and one-click removal.

- **Smart Scraping & Stream Proxy**:
  - Multi-tier provider fallback system ensuring high stream availability.
  - Automated Cloudflare challenge bypass via TLS fingerprint impersonation (`curl-cffi`).
  - Safe proxy stream relay with SSRF protection, loopback guards, and process cleanup.

- **Dual-Runtime Architecture**:
  - **Node.js / Express**: Traditional server with background daemon scripts (`start.sh`, `stop.sh`).
  - **Cloudflare Workers**: Edge-native deployment bundled with static asset bindings (`wrangler.jsonc`).

- **Private Access Control**:
  - Built-in session security with configurable credentials (`AUTH_ID`, `AUTH_PASSWORD`, `AUTH_TOKEN`) via cookies and Bearer headers.

- **Mobile & Desktop Optimized**:
  - Glassmorphic bottom navigation bar for mobile devices.
  - Comprehensive hotkeys matching desktop media players.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) >= 20.0.0
- `npm` (bundled with Node.js)
- *Optional:* Python 3 with `pip` (automatically installs `curl-cffi` on Linux/macOS for enhanced scraping reliability)

### Installation

```bash
# Clone the repository
git clone https://github.com/KARTHIKKJ369/anistream_2.0.git
cd anistream_2.0

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### Option 1: Interactive Development Mode

Run the server with automatic reload on file changes:

```bash
npm run dev
```

The application will be accessible at `http://localhost:7474`.

### Option 2: Background Daemon Mode

Launch AniStream detached in the background (ideal for home servers, VPS, or headless machines):

```bash
# Start background daemon
./start.sh

# Monitor live server logs
tail -f server.log

# Stop the daemon
./stop.sh
```

> [!TIP]
> The `./start.sh` script automatically checks and installs dependencies, configures `curl-cffi` if Python is available, and manages process PID files cleanly.

---

## Deployment

### Cloudflare Workers (Edge Deployment)

AniStream is fully compatible with Cloudflare Workers using static asset bindings.

1. Authenticate with Wrangler:
   ```bash
   npx wrangler login
   ```

2. Build and deploy using the automated deployment script:
   ```bash
   ./deploy_worker.sh
   ```

   Or execute manually:
   ```bash
   npm run build
   npm run deploy
   ```

> [!IMPORTANT]
> Running `npm run build` injects credentials defined in `.env` into the worker configuration before deployment. Ensure your `.env` contains secure values before deploying to production.

---

## Configuration

Configure the application by creating or editing the `.env` file in the project root:

```ini
# Port for local Node.js server (Default: 7474)
PORT=7474

# Authentication Credentials
AUTH_ID=admin
AUTH_PASSWORD=your_secure_password
AUTH_TOKEN=anistream_auth_token_change_me
```

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | `number` | `7474` | Local server port for the Node.js Express backend. |
| `AUTH_ID` | `string` | `admin` | Username required to log into the private instance. |
| `AUTH_PASSWORD` | `string` | `password` | Password required to authenticate the session. |
| `AUTH_TOKEN` | `string` | `anistream_auth_token` | Secret token used for cookie and Bearer header validation. |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> / <kbd>K</kbd> | Toggle Play / Pause |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>←</kbd> / <kbd>J</kbd> | Seek backward 10 seconds |
| <kbd>→</kbd> / <kbd>L</kbd> | Seek forward 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume up / down (10% increments) |
| <kbd>N</kbd> | Play next episode |
| <kbd>P</kbd> | Play previous episode |
| <kbd>0</kbd> – <kbd>9</kbd> | Jump to 0% – 90% of video duration |
| <kbd>?</kbd> | Open keyboard shortcuts modal |
| <kbd>Esc</kbd> | Close video player / dismiss modals |

---

## API Reference

All data endpoints (except `/api/auth/login`) require authentication via session cookie (`anistream_auth`), `Authorization: Bearer <TOKEN>` header, or `?auth=<TOKEN>` query parameter.

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/login` | `POST` | Authenticates credentials and returns session token. |
| `/api/auth/verify` | `GET` | Verifies current session token validity. |
| `/api/auth/logout` | `POST` | Clears authentication cookie. |
| `/api/featured` | `GET` | Returns spotlight, trending, popular, and top-rated anime. |
| `/api/suggestions?q=:query` | `GET` | Fast autocomplete search suggestions (<200ms). |
| `/api/search?q=:query` | `GET` | Full catalog search with AniList metadata enrichment. |
| `/api/anime/:animeId` | `GET` | Detailed metadata, synopses, characters, and episode list. |
| `/api/episodes/:animeId` | `GET` | Fetches available episodes for an anime series. |
| `/api/stream/:episodeId` | `GET` | Extracts HLS video stream sources (`?lang=sub` or `?lang=dub`). |
| `/api/history` | `GET`, `POST`, `DELETE` | Retrieves, updates, or clears watch history. |
| `/api/progress` | `GET`, `POST` | Manages exact video timestamp playback progress. |
| `/proxy/stream?url=:url` | `GET` | Secure proxy stream relay and M3U8 manifest rewriter. |

---

## Project Structure

```text
anistream_2.0/
├── cloudflare-worker/
│   ├── worker.js            # Cloudflare Worker API & proxy edge handler
│   └── wrangler.jsonc       # Cloudflare Workers configuration
├── public/
│   ├── app.js               # Client application (SPA router, player, UI engine)
│   ├── favicon.svg          # Favicon vector asset
│   ├── index.html           # Single-page application entry point
│   ├── logo.svg             # Vector brand logo
│   └── style.css            # Otaku Cinema design system & CSS variables
├── scripts/
│   └── build.js             # Deployment pre-build & credential injector
├── server/
│   ├── anidb.js             # Multi-tier scrapers & AniList/Kitsu GraphQL client
│   ├── history.js           # Local playback history & progress persistence
│   └── index.js             # Express application & safe HLS stream proxy
├── .env.example             # Template for environment variables
├── deploy_worker.sh         # Cloudflare Worker deployment script
├── package.json             # Project dependencies and npm scripts
├── start.sh                 # Background daemon launcher script
└── stop.sh                  # Process termination script
```
