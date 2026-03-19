"""Groq API client for transforming resident tickets into daily tasks."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3-32b")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

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
  "complaint_type": "neighbors" | "water" | "electricity" | "schedule" | "general" | "recommendation"
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
"""


def transform_ticket_to_task(
    subject: str,
    description: str,
    incident_date: str,
    incident_time: str,
    apartment_id: str,
    building_name: str,
) -> dict[str, Any] | None:
    """Call Groq Qwen3-32B to transform a ticket into a task structure."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
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
                        {"role": "system", "content": TASK_TRANSFORM_SYSTEM},
                        {"role": "user", "content": user_content},
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    except Exception:
        return None

    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    content = content.strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None

    category = parsed.get("category", "complaint")
    if category not in ("inspection", "repair", "meter", "complaint", "report"):
        category = "complaint"
    priority = parsed.get("priority", "medium")
    if priority not in ("low", "medium", "high", "critical"):
        priority = "medium"
    complaint_type = parsed.get("complaint_type", "general")
    if complaint_type not in ("neighbors", "water", "electricity", "schedule", "general", "recommendation"):
        complaint_type = "general"

    # Keyword fallback: if subject/description clearly indicate neighbors, override
    combined = f"{subject} {description}".lower()
    if any(k in combined for k in ("neighbor", "neighbour", "noise", "loud", "screaming", "shouting", "clapping", "music", "party", "apartment above", "apartment below")):
        complaint_type = "neighbors"

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
    }
