"""AI client for transforming resident tickets into daily tasks."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-3-1b-it")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3-32b")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
logger = logging.getLogger(__name__)
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
ENV_VALUES = dotenv_values(ENV_FILE)

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
        "apartment": {"type": "STRING"},
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
        "complaint_type",
    ],
}


def _extract_gemini_text(data: dict[str, Any]) -> str:
    return (
        ((data.get("candidates") or [{}])[0].get("content") or {})
        .get("parts") or [{}]
    )[0].get("text", "")


def _call_gemini_structured(system_prompt: str, user_prompt: str, api_key: str) -> str:
    """Try progressively simpler Gemini request variants until one succeeds.

    Attempt order (most capable → most compatible):
    1. system_instruction + responseSchema + json_mime
    2. system_instruction + json_mime (no schema)
    3. merged_prompt + json_mime (no system_instruction)
    4. merged_prompt + plain_text  ← works on gemma-3-1b-it
    """
    merged = f"{system_prompt}\n\n{user_prompt}"

    attempts: list[tuple[str, dict[str, Any]]] = [
        (
            "system_instruction+schema+json_mime",
            {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                    "responseSchema": GEMINI_RESPONSE_SCHEMA,
                },
            },
        ),
        (
            "system_instruction+json_mime",
            {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                },
            },
        ),
        (
            "merged_prompt+json_mime",
            {
                "contents": [{"parts": [{"text": merged}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                },
            },
        ),
        (
            "merged_prompt+plain_text",
            {
                "contents": [{"parts": [{"text": merged}]}],
                "generationConfig": {"temperature": 0.2},
            },
        ),
    ]

    url = GEMINI_API_URL.format(model=GEMINI_MODEL)
    params = {"key": api_key}
    headers = {"Content-Type": "application/json"}

    with httpx.Client(timeout=30.0) as client:
        for label, payload in attempts:
            logger.info("ticket_ai_gemini_attempt attempt=%s", label)
            response = client.post(url, params=params, headers=headers, json=payload)
            if response.status_code < 400:
                logger.info("ticket_ai_gemini_attempt_success attempt=%s", label)
                return _extract_gemini_text(response.json())
            logger.warning(
                "ticket_ai_gemini_attempt_failed attempt=%s status=%s body=%s",
                label,
                response.status_code,
                response.text[:400],
            )

    response.raise_for_status()
    return ""


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

    gemini_api_key = os.getenv("GEMINI_API_KEY") or ENV_VALUES.get("GEMINI_API_KEY")
    groq_api_key = os.getenv("GROQ_API_KEY") or ENV_VALUES.get("GROQ_API_KEY")
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

    # Keyword override: catches cases where small model misclassifies
    combined = f"{subject} {description}".lower()
    _KEYWORD_RULES: list[tuple[str, list[str]]] = [
        ("neighbors", ["neighbor", "neighbour", "noise", "loud", "screaming", "shouting",
                       "clapping", "music", "party", "smoking", "apartment above",
                       "apartment below", "next door", "сосед", "шум", "громк", "кричит",
                       "музыка", "вечеринка", "курит"]),
        ("water",     ["water leak", "leak", "pipe", "plumbing", "flood", "dripping",
                       "low pressure", "no water", "hot water", "протечка", "вода",
                       "труба", "кран", "затопил", "нет воды", "давление воды"]),
        ("electricity", ["electricity", "electric", "power outage", "no power", "blackout",
                         "flickering", "breaker", "fuse", "outlet", "socket",
                         "свет", "электричество", "отключил", "нет света", "мигает",
                         "пробки", "розетка"]),
        ("schedule",  ["schedule", "heating schedule", "no heating", "no heat",
                       "cleaning schedule", "maintenance schedule", "горячее не дают",
                       "расписание", "отопление", "не топят", "уборка по графику"]),
        ("recommendation", ["recommend", "suggest", "proposal", "improvement", "idea",
                            "рекоменд", "предлагаю", "предложение", "улучшение"]),
    ]
    for kw_type, keywords in _KEYWORD_RULES:
        if any(k in combined for k in keywords):
            if complaint_type != kw_type:
                logger.info(
                    "ticket_ai_keyword_override from=%s to=%s reason=keyword_match",
                    complaint_type,
                    kw_type,
                )
                complaint_type = kw_type
            break

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
