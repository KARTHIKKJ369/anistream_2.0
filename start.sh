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

# Check for node
if ! command -v node >/dev/null 2>&1; then
  echo "  ❌ Node.js is not installed."
  echo "  💡 Install Node.js (Ubuntu/Debian):"
  echo "     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "     sudo apt-get install -y nodejs"
  echo ""
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "  📦 Installing dependencies via npm..."
    npm install --silent
    echo "  ✅ Dependencies installed"
    echo ""
  else
    echo "  ⚠️ npm command not found. Please install npm (e.g. sudo apt install npm or install Node.js via nodesource)."
    echo ""
  fi
fi

# Ensure Python curl-cffi is available for Cloudflare bypass on datacenter IPs
if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c "import curl_cffi" >/dev/null 2>&1; then
    echo "  🔧 Setting up curl-cffi Cloudflare bypass engine..."
    if ! command -v pip3 >/dev/null 2>&1 && ! command -v pip >/dev/null 2>&1; then
      if command -v sudo >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq python3-pip >/dev/null 2>&1 || true
      fi
    fi
    pip3 install --user --break-system-packages curl-cffi >/dev/null 2>&1 || pip3 install --user curl-cffi >/dev/null 2>&1 || pip install --user curl-cffi >/dev/null 2>&1 || true
  fi
  if python3 -c "import curl_cffi" >/dev/null 2>&1; then
    echo "  🛡️ Cloudflare bypass engine: Active (curl-cffi Chrome 124)"
  else
    echo "  ⚠️ Cloudflare bypass warning: Run 'sudo apt install python3-pip && pip3 install curl-cffi' if video streams get blocked."
  fi
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
