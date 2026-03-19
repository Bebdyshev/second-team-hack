#!/bin/bash
cd "$(dirname "$0")"
echo "Starting ResMonitor backend..."
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -n "$IP" ]; then
  echo ""
  echo ">>> On your phone, set API server to: $IP"
  echo ">>> (or use: http://$IP:8000)"
  echo ""
fi
echo "Keep this window open."
echo ""
source .venv/bin/activate 2>/dev/null || true
uvicorn src.app:app --reload --port 8000 --host 0.0.0.0
