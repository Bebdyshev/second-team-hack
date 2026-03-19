"""AI client for transforming resident tickets into daily tasks."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-3-1b-it")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3-32b")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
logger = logging.getLogger(__name__)

TASK_TRANSFORM_SYSTEM = """You are a building manager assistant. Convert a resident's ticket/request into a structured daily task card.

Output ONLY valid JSON with these exact keys (no markdown, no extra text):
{
  "title": "<keep resident's subject unchanged>",
  "description": "<resident's full description, unchanged>",
  "category": "inspection" | "repair" | "meter" | "complaint" | "report",
  "priority": "low" | "medium" | "high" | "critical",
  "building": "<building name, e.g. Maple Residence>",
  "apartment": "<apartment id if known, e.g. apt-502, or null>",
  "due_time": "<HH:MM from incident_time or sensible default>",
  "ai_comment": "<short 1-2 sentence suggestion on what to do, in English>",
  "complaint_type": "neighbors" | "water" | "electricity" | "schedule" | "general" | "recommendation",
  "classification_reason": "<one short sentence why this complaint_type was selected>"
}

CRITICAL - complaint_type (check this FIRST before other fields):
- neighbors: ANY mention of neighbor(s), noise, loud, screaming, shouting, clapping, music, party, smoking, conflict with other residents, apartment above/below/next door. Examples: "neighbor too loud", "noise at night", "someone screaming", "loud music" -> ALWAYS neighbors
- water: leaks, low pressure, dirty water, water meters, plumbing, pipes
- electricity: outages, flickering lights, breakers, electric meters
- schedule: heating schedule, cleaning schedule, planned works timing
- recommendation: suggestion or improvement idea, not a complaint
- general: ONLY when none of the above fit (e.g. "overall dissatisfied")

Rules:
- title: copy subject exactly
- description: copy resident's description exactly
- category: infer from content (leak/plumbing→repair, meter issue→meter, complaint→complaint, etc.)
- priority: infer urgency (leak/critical→high/critical, minor→low)
- building: use the building name provided
- apartment: use apartment_id if provided (e.g. apt-502)
- ai_comment: brief actionable tip for the manager
- classification_reason: concise explanation based on words/intent in ticket
"""

GEMINI_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING"},
        "description": {"type": "STRING"},
        "category": {"type": "STRING", "enum": ["inspection", "repair", "meter", "complaint", "report"]},
        "priority": {"type": "STRING", "enum": ["low", "medium", "high", "critical"]},
        "building": {"type": "STRING"},
        "apartment": {"type": "STRING", "nullable": True},
        "due_time": {"type": "STRING"},
        "ai_comment": {"type": "STRING"},
        "complaint_type": {"type": "STRING", "enum": ["neighbors", "water", "electricity", "schedule", "general", "recommendation"]},
        "classification_reason": {"type": "STRING"},
    },
    "required": [
        "title",
        "description",
        "category",
        "priority",
        "building",
        "due_time",
        "ai_comment",
        "complaint_type",
        "classification_reason",
    ],
}


def _call_gemini_structured(system_prompt: str, user_prompt: str, api_key: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            GEMINI_API_URL.format(model=GEMINI_MODEL),
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                    "responseSchema": GEMINI_RESPONSE_SCHEMA,
                },
            },
        )
        response.raise_for_status()
        data = response.json()
        return (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text", "")


def _call_groq(system_prompt: str, user_prompt: str, api_key: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "temperature": 0.2,
                "max_tokens": 512,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")


def transform_ticket_to_task(
    subject: str,
    description: str,
    incident_date: str,
    incident_time: str,
    apartment_id: str,
    building_name: str,
) -> dict[str, Any] | None:
    """Call AI model to transform a ticket into a task structure."""
    logger.info(
        "ticket_ai_classification_start subject=%r apartment=%s building=%s",
        subject[:120],
        apartment_id,
        building_name,
    )

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not gemini_api_key and not groq_api_key:
        logger.warning("ticket_ai_classification_skip reason=missing_ai_api_keys expected=GEMINI_API_KEY_or_GROQ_API_KEY")
        return None

    user_content = f"""Ticket:
Subject: {subject}
Description: {description}
Date: {incident_date}
Time: {incident_time}
Apartment: {apartment_id}
Building: {building_name}

Convert to task JSON."""

    try:
        if gemini_api_key:
            logger.info("ticket_ai_provider provider=gemini model=%s structured_output=true", GEMINI_MODEL)
            content = _call_gemini_structured(TASK_TRANSFORM_SYSTEM, user_content, gemini_api_key)
        else:
            logger.info("ticket_ai_provider provider=groq model=%s structured_output=prompt_enforced", GROQ_MODEL)
            content = _call_groq(TASK_TRANSFORM_SYSTEM, user_content, groq_api_key or "")
    except Exception as error:
        logger.exception("ticket_ai_classification_http_error error=%s", error)
        return None

    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    content = content.strip()
    logger.info("ticket_ai_raw_response content=%r", content[:400])

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("ticket_ai_parse_error reason=invalid_json raw=%r", content[:400])
        return None

    category = parsed.get("category", "complaint")
    if category not in ("inspection", "repair", "meter", "complaint", "report"):
        category = "complaint"
    priority = parsed.get("priority", "medium")
    if priority not in ("low", "medium", "high", "critical"):
        priority = "medium"
    complaint_type = parsed.get("complaint_type", "general")
    if complaint_type not in ("neighbors", "water", "electricity", "schedule", "general", "recommendation"):
        logger.warning(
            "ticket_ai_invalid_complaint_type value=%r fallback=general",
            parsed.get("complaint_type"),
        )
        complaint_type = "general"

    # Keyword fallback: if subject/description clearly indicate neighbors, override
    combined = f"{subject} {description}".lower()
    has_neighbor_signal = any(
        k in combined
        for k in ("neighbor", "neighbour", "noise", "loud", "screaming", "shouting", "clapping", "music", "party", "apartment above", "apartment below")
    )
    if has_neighbor_signal:
        logger.info(
            "ticket_ai_keyword_override from=%s to=neighbors reason=neighbor_keyword_match",
            complaint_type,
        )
        complaint_type = "neighbors"

    logger.info(
        "ticket_ai_decision complaint_type=%s category=%s priority=%s reason=%r",
        complaint_type,
        category,
        priority,
        str(parsed.get("classification_reason", ""))[:200],
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
        "classification_reason": str(parsed.get("classification_reason", ""))[:300] or None,
    }
