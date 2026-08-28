#!/bin/bash
# AniStream 2.0 — Start Script (Background Daemon)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=${PORT:-7474}
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"

echo ""
echo "  🎌 AniStream 2.0 — Otaku Cinema Anime Streaming"
echo "  Powered by ani-cli & AniList"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "  📦 Installing dependencies..."
  npm install --silent
  echo "  ✅ Dependencies installed"
  echo ""
fi

# Stop any running instance on this port
EXISTING_PID=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "  🔄 Stopping existing instance on port $PORT (PID $EXISTING_PID)..."
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 0.5
fi

# Launch server in background detached from terminal
nohup node server/index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
disown $SERVER_PID 2>/dev/null || true

sleep 1

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "  🚀 AniStream is running in the background (PID: $SERVER_PID)"
  echo "  🌐 URL: http://localhost:$PORT"
  echo "  📄 Logs: tail -f $LOG_FILE"
  echo "  🛑 To stop: ./stop.sh"
  echo ""
  echo "  You can safely close this terminal window now! ✨"
  echo ""
else
  echo "  ❌ Failed to start AniStream server. Check $LOG_FILE for details."
  cat "$LOG_FILE"
  exit 1
fi
