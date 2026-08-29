#!/bin/bash
# Deploy AniStream Cloudflare Worker Proxy
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/cloudflare-worker"

echo ""
echo "  🚀 AniStream Cloudflare Worker Deployer"
echo "  ========================================"
echo ""

if ! command -v npx >/dev/null 2>&1; then
  echo "  ❌ npx is required to deploy Cloudflare Workers."
  exit 1
fi

cd "$WORKER_DIR"

echo "  📦 Deploying worker via Wrangler..."
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "  🔑 Loading environment variables from .env..."
  npx wrangler deploy --env-file "$SCRIPT_DIR/.env" --keep-vars
else
  npx wrangler deploy --keep-vars
fi
echo "  ✅ Deployment complete!"
echo "  🌐 Your Full-Stack AniStream app is live on Cloudflare Workers!"
echo "     Access it at your workers.dev URL or bind your custom domain in the Cloudflare Dashboard."
echo ""
