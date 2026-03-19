"""Gemini API client for classifying resident tickets into task categories."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import httpx

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Use gemma-3-1b-it for higher free-tier quota (30 RPM); gemini-2.0-flash has stricter limits
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-3-1b-it")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

VALID_TAGS = frozenset({"neighbors", "water", "electricity", "schedule", "general", "recommendation"})

SYSTEM_PROMPT = """You classify resident tickets for a building management system.

Given the resident's subject and description, analyze the text and assign 1–3 relevant tags. Pick only tags that clearly apply.

Available tags:
- neighbors: noise, loud music, screaming, party, smoking, conflict with other residents, apartment above/below/next door
- water: leaks, low pressure, dirty water, plumbing, pipes, flooding, no hot water
- electricity: power outage, flickering lights, breakers, no power, outlets
- schedule: heating schedule, cleaning schedule, maintenance timing, when services run
- recommendation: suggestion, improvement idea, proposal (not a complaint)
- general: overall dissatisfaction, unclear, or none of the above fit

Rules:
- Use 1–3 tags. No more than 3.
- Order by relevance (most relevant first).
- Be precise: only add a tag if the text clearly supports it.
- If unsure, use "general" as fallback.
- Copy title and description exactly from the input.
- ai_comment: one short actionable tip for the manager.

Priority (use real-life urgency; when in doubt, lean medium):
- critical: immediate danger or major damage. Examples: active water leak/flooding, no power in unit, gas smell, fire risk, serious safety hazard, someone injured or trapped.
- high: needs same-day attention. Examples: no hot water, partial power outage, significant leak starting, broken heating in winter, persistent loud noise at night.
- medium: should be addressed within a few days. Examples: noisy neighbors during day, minor leak, flickering lights, low water pressure, schedule complaint.
- low: can wait. Examples: general feedback, minor inconvenience, recommendation, cosmetic issue, non-urgent request.
"""

USER_PROMPT_TEMPLATE = """Classify this ticket:

Subject: {subject}
Description: {description}
Date: {incident_date}
Time: {incident_time}
Apartment: {apartment_id}
Building: {building_name}

Respond with valid JSON only (no markdown):
{{
  "title": "<exact subject>",
  "description": "<exact description>",
  "category": "complaint",
  "priority": "low" | "medium" | "high" | "critical",
  "building": "<building name>",
  "apartment": "<apartment id or null>",
  "due_time": "<HH:MM>",
  "ai_comment": "<short tip for manager>",
  "tags": ["tag1", "tag2", "tag3"]
}}

tags: 1–3 items from: neighbors, water, electricity, schedule, general, recommendation
priority: critical (immediate danger) | high (same-day) | medium (few days) | low (can wait)
"""


def _extract_text(data: dict[str, Any]) -> str:
    cands = data.get("candidates") or [{}]
    content = (cands[0] or {}).get("content") or {}
    parts = content.get("parts") or [{}]
    return (parts[0] or {}).get("text", "")


def _call_gemini(prompt: str, api_key: str, max_retries: int = 3) -> str:
    url = GEMINI_API_URL.format(model=GEMINI_MODEL)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 512,
        },
    }
    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    url,
                    params={"key": api_key},
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
            if resp.status_code == 429:
                retry_after = min(int(resp.headers.get("Retry-After", 5)), 30)
                if attempt < max_retries - 1:
                    logger.warning(
                        "gemini_rate_limit model=%s attempt=%d retry_after=%ds",
                        GEMINI_MODEL, attempt + 1, retry_after,
                    )
                    time.sleep(retry_after)
                    continue
            resp.raise_for_status()
            return _extract_text(resp.json())
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and attempt < max_retries - 1:
                retry_after = min(int(e.response.headers.get("Retry-After", 5)), 30)
                logger.warning(
                    "gemini_rate_limit model=%s attempt=%d retry_after=%ds",
                    GEMINI_MODEL, attempt + 1, retry_after,
                )
                time.sleep(retry_after)
                continue
            raise


def transform_ticket_to_task(
    subject: str,
    description: str,
    incident_date: str,
    incident_time: str,
    apartment_id: str,
    building_name: str,
) -> dict[str, Any] | None:
    """Classify ticket via Gemini and return task structure."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("ticket_classification_skip reason=missing_GEMINI_API_KEY")
        return None

    prompt = f"{SYSTEM_PROMPT}\n\n{USER_PROMPT_TEMPLATE.format(**locals())}"

    try:
        logger.info("ticket_classification_start subject=%r", subject[:80])
        content = _call_gemini(prompt, api_key)
    except Exception as e:
        logger.exception("ticket_classification_error error=%s", e)
        return None

    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    content = content.strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("ticket_classification_parse_error raw=%r", content[:300])
        return None

    tags_raw = parsed.get("tags") or parsed.get("complaint_type")
    if isinstance(tags_raw, str):
        tags_raw = [tags_raw]
    tags = []
    for t in (tags_raw or [])[:3]:
        t = str(t).lower().strip()
        if t in VALID_TAGS and t not in tags:
            tags.append(t)
    if not tags:
        tags = ["general"]

    category = parsed.get("category", "complaint")
    if category not in ("inspection", "repair", "meter", "complaint", "report"):
        category = "complaint"

    priority = parsed.get("priority", "medium")
    if priority not in ("low", "medium", "high", "critical"):
        priority = "medium"

    complaint_type = tags[0]
    complaint_types_str = ",".join(tags)

    logger.info(
        "ticket_classification_done tags=%s category=%s priority=%s",
        tags,
        category,
        priority,
    )

    return {
        "title": str(parsed.get("title", subject))[:200],
        "description": str(parsed.get("description", description))[:2000],
        "category": category,
        "priority": priority,
        "building": str(parsed.get("building", building_name))[:100],
        "apartment": parsed.get("apartment") or apartment_id or None,
        "due_time": str(parsed.get("due_time", incident_time or "12:00"))[:10],
        "ai_comment": (parsed.get("ai_comment") or "")[:500] or None,
        "complaint_type": complaint_type,
        "complaint_types": complaint_types_str,
    }
