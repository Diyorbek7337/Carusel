#!/usr/bin/env bash
# Linux / macOS uchun ishga tushirish skripti
set -e
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo ".env yaratildi — BOT_TOKEN ni yozing va qayta ishga tushiring."; exit 1; }
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -U -r requirements.txt
exec python -m bot.main
