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
npx wrangler deploy

echo ""
echo "  ✅ Deployment complete!"
echo "  📋 Copy the deployed Worker URL (e.g. https://anistream-proxy.<your-subdomain>.workers.dev)"
echo "     and add it to your .env file on both Mac and Azure VM:"
echo "     CF_WORKER_URL=https://anistream-proxy.<your-subdomain>.workers.dev"
echo ""
