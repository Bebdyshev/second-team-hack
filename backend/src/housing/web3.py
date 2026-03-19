from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────

def _env(key: str, default: str = "") -> str:
    from dotenv import dotenv_values
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
    cached = dotenv_values(env_path)
    return os.getenv(key) or cached.get(key) or default


def get_rpc_url() -> str:
    return _env("WEB3_RPC_URL")


def get_private_key() -> str:
    return _env("WEB3_PRIVATE_KEY")


def get_chain_id() -> int:
    try:
        return int(_env("WEB3_CHAIN_ID", "80002"))
    except ValueError:
        return 80002


def get_contract_address() -> str:
    return _env("WEB3_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000")


def get_explorer_base_url() -> str:
    return _env("WEB3_EXPLORER_BASE_URL", "https://amoy.polygonscan.com")


# ── JSON-RPC helpers ───────────────────────────────────────────────────────────

def _rpc(method: str, params: list) -> object:
    rpc_url = get_rpc_url()
    if not rpc_url:
        raise RuntimeError("WEB3_RPC_URL not configured")
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    response = httpx.post(rpc_url, json=payload, timeout=15)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data["result"]


def _get_nonce(address: str) -> int:
    result = _rpc("eth_getTransactionCount", [address, "latest"])
    return int(result, 16)  # type: ignore[arg-type]


def _get_gas_price() -> int:
    result = _rpc("eth_gasPrice", [])
    return int(result, 16)  # type: ignore[arg-type]


def _send_raw_tx(raw_hex: str) -> str:
    result = _rpc("eth_sendRawTransaction", [raw_hex])
    return result  # type: ignore[return-value]


# ── Real on-chain anchor ───────────────────────────────────────────────────────

def _send_anchor_tx(data_hex: str) -> str:
    """Sign and broadcast a 0-value self-transfer with data_hex in the data field."""
    from eth_account import Account
    from eth_account.signers.local import LocalAccount

    private_key = get_private_key()
    if not private_key:
        raise RuntimeError("WEB3_PRIVATE_KEY not configured")

    account: LocalAccount = Account.from_key(private_key)
    address = account.address
    chain_id = get_chain_id()

    nonce = _get_nonce(address)
    gas_price = _get_gas_price()
    # Add 20% buffer to gas price to ensure inclusion
    gas_price = int(gas_price * 1.2)

    tx = {
        "nonce": nonce,
        "gasPrice": gas_price,
        "gas": 50000,
        "to": address,          # self-transfer
        "value": 0,
        "data": data_hex,
        "chainId": chain_id,
    }

    signed = account.sign_transaction(tx)
    raw_hex = signed.raw_transaction.hex()
    if not raw_hex.startswith("0x"):
        raw_hex = "0x" + raw_hex
    tx_hash = _send_raw_tx(raw_hex)
    return tx_hash


# ── Public API ─────────────────────────────────────────────────────────────────

def _build_report_hash(payload: dict) -> str:
    seed = str(sorted(payload.items()))
    return "0x" + hashlib.sha256(seed.encode()).hexdigest()


def defer_anchor(operation: str, payload: dict) -> dict:
    """Attempt a real on-chain anchor; fall back to mock if keys are missing."""
    explorer = get_explorer_base_url().rstrip("/")
    chain_id = get_chain_id()
    contract_address = get_contract_address()

    report_hash = _build_report_hash({"operation": operation, **payload})
    # Encode the report hash as hex data for the transaction
    data_hex = "0x" + report_hash.replace("0x", "")

    rpc_url = get_rpc_url()
    private_key = get_private_key()

    if not rpc_url or not private_key:
        logger.warning("web3_real_tx_skipped reason=missing_rpc_or_key, falling back to mock")
        return _mock_anchor(operation, payload, explorer, chain_id, contract_address)

    try:
        logger.info("web3_tx_sending operation=%s report_hash=%s", operation, report_hash[:16])
        tx_hash = _send_anchor_tx(data_hex)
        logger.info("web3_tx_sent tx_hash=%s", tx_hash)
        return {
            "status": "confirmed",
            "tx_hash": tx_hash,
            "block_number": 0,
            "explorer_url": f"{explorer}/tx/{tx_hash}",
            "error_message": "",
            "chain_id": chain_id,
            "contract_address": contract_address,
        }
    except Exception as exc:
        logger.error("web3_tx_failed error=%s", exc)
        return {
            "status": "failed",
            "tx_hash": report_hash,
            "block_number": 0,
            "explorer_url": "",
            "error_message": str(exc),
            "chain_id": chain_id,
            "contract_address": contract_address,
        }


def _mock_anchor(operation: str, payload: dict, explorer: str, chain_id: int, contract_address: str) -> dict:
    now = datetime.now(timezone.utc)
    tx_hash = "0x" + hashlib.sha256(f"{operation}:{payload}:{now.isoformat()}".encode()).hexdigest()
    return {
        "status": "confirmed",
        "tx_hash": tx_hash,
        "block_number": 0,
        "explorer_url": f"{explorer}/tx/{tx_hash}" if explorer else "",
        "error_message": "",
        "chain_id": chain_id,
        "contract_address": contract_address,
    }
