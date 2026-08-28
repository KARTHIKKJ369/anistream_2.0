#!/bin/bash
# AniStream 2.0 — Stop Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=${PORT:-7474}
PID_FILE="$SCRIPT_DIR/.server.pid"

STOPPED=false

# 1. Stop via PID file if present
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 $PID 2>/dev/null; then
    kill -9 $PID 2>/dev/null || true
    echo "  🛑 Stopped AniStream server (PID $PID)"
    STOPPED=true
  fi
  rm -f "$PID_FILE"
fi

# 2. Stop any remaining processes on port 7474
PORT_PID=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  kill -9 $PORT_PID 2>/dev/null || true
  echo "  🛑 Reclaimed port $PORT (PID $PORT_PID)"
  STOPPED=true
fi

if [ "$STOPPED" = true ]; then
  echo "  ✅ AniStream server stopped successfully."
else
  echo "  ℹ️  No running AniStream server found on port $PORT."
fi
