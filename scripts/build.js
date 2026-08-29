'use strict';

const fs = require('fs');
const path = require('path');

// Auto-load local .env if building locally
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  try {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2] ? match[2].trim().replace(/^['"]|['"]$/g, '') : '';
      }
    });
  } catch (_) {}
}

const authId = process.env.AUTH_ID;
const authPassword = process.env.AUTH_PASSWORD;
const authToken = process.env.AUTH_TOKEN;

if (authId && authPassword) {
  console.log('[build] Injecting environment credentials into worker bundle...');
  const workerPath = path.join(__dirname, '../cloudflare-worker/worker.js');
  let content = fs.readFileSync(workerPath, 'utf8');

  content = content.replace(
    /const AUTH_CONFIG = \{[\s\S]*?\};/,
    `const AUTH_CONFIG = {
  id: ${JSON.stringify(authId.trim())},
  password: ${JSON.stringify(authPassword.trim())},
  token: ${JSON.stringify((authToken || 'anistream_auth_token').trim())}
};`
  );

  fs.writeFileSync(workerPath, content, 'utf8');
  console.log('[build] Credentials successfully injected for deployment!');
} else {
  console.log('[build] No build-time AUTH_ID/AUTH_PASSWORD found; using runtime env bindings.');
}
