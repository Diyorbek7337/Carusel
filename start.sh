#!/usr/bin/env bash
# Linux / macOS uchun
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js o'rnating: https://nodejs.org"; exit 1; }
[ -f .env ] || { cp .env.example .env; echo ".env yaratildi — BOT_TOKEN ni yozing va qayta ishga tushiring."; exit 1; }
npm install --no-fund --no-audit
exec node src/index.js
