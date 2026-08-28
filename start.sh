#!/bin/bash
# AniStream — Start Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  🎌 AniStream — Anime Streaming UI"
echo "  Powered by ani-cli & anidb.app"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "  📦 Installing dependencies..."
  npm install --silent
  echo "  ✅ Dependencies installed"
  echo ""
fi

echo "  🚀 Starting server..."
echo "  Open http://localhost:7474 in your browser"
echo ""
node server/index.js
