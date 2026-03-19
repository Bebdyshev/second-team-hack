#!/bin/bash
# Run backend so iPhone can connect (--host 0.0.0.0)
cd "$(dirname "$0")"
source .venv/bin/activate 2>/dev/null || true
uvicorn src.app:app --reload --port 8000 --host 0.0.0.0
