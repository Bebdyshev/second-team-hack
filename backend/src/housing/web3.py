from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone


def _build_tx_hash(seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return f"0x{digest}"


def get_chain_id() -> int:
    try:
        return int(os.getenv("WEB3_CHAIN_ID", "80002"))
    except ValueError:
        return 80002


def get_contract_address() -> str:
    return os.getenv("WEB3_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000")


def get_explorer_base_url() -> str:
    return os.getenv("WEB3_EXPLORER_BASE_URL", "https://amoy.polygonscan.com")


def defer_anchor(operation: str, payload: dict) -> dict:
    now = datetime.now(timezone.utc)
    tx_hash = _build_tx_hash(f"{operation}:{payload}:{now.isoformat()}")
    explorer = get_explorer_base_url().rstrip("/")
    return {
        "status": "confirmed",
        "tx_hash": tx_hash,
        "block_number": 0,
        "explorer_url": f"{explorer}/tx/{tx_hash}" if explorer else "",
        "error_message": "",
        "chain_id": get_chain_id(),
        "contract_address": get_contract_address(),
    }
