"""Geo lookup helpers – Google Places API (primary) + Overpass/Nominatim (fallback)."""

from __future__ import annotations

import logging
import math
import os
import re
import time
from typing import Any

import httpx
from dotenv import dotenv_values

logger = logging.getLogger(__name__)

_env = dotenv_values(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
GOOGLE_API_KEY: str = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GEMINI_API_KEY") or _env.get("GOOGLE_PLACES_API_KEY", "") or _env.get("GEMINI_API_KEY", "")

GOOGLE_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "ResMonitorGeo/1.0 (housing-escalation)"
CACHE_TTL_SECONDS = 3600

_address_cache: dict[str, tuple[float, tuple[float, float] | None]] = {}
_nearby_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def clear_nearby_cache() -> None:
    _nearby_cache.clear()


# ── Google Places type mapping ────────────────────────────────────────────────

_GOOGLE_PLACE_TYPES: dict[str, list[str]] = {
    "police": ["police"],
    "local_authority": ["local_government_office", "city_hall"],
    "housing_office": ["local_government_office"],
    "plumber": ["plumber"],
    "electrician": ["electrician"],
    "water_utility": ["local_government_office"],
    "power_company": ["local_government_office"],
}

# ── Overpass / OSM mappings (fallback) ────────────────────────────────────────

_SERVICE_QUERY_MAP: dict[str, list[tuple[str, str]]] = {
    "police": [("amenity", "police")],
    "local_authority": [("office", "government"), ("amenity", "townhall")],
    "housing_office": [("office", "association"), ("building", "apartments")],
    "plumber": [("craft", "plumber")],
    "electrician": [("craft", "electrician")],
    "water_utility": [("man_made", "water_works"), ("utility", "water")],
    "power_company": [("power", "substation"), ("office", "energy_supplier")],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_cache_valid(timestamp: float) -> bool:
    return (time.time() - timestamp) < CACHE_TTL_SECONDS


def _haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    radius = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(round(radius * c))


def _normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^+\d]", "", raw)
    if not cleaned:
        return None
    if cleaned.startswith("00"):
        cleaned = f"+{cleaned[2:]}"
    return cleaned


def _to_whatsapp_url(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"[^\d]", "", phone)
    return f"https://wa.me/{digits}" if digits else None


def _to_maps_url_place_id(place_id: str) -> str:
    return f"https://www.google.com/maps/place/?q=place_id:{place_id}"


def _to_maps_url(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps?q={lat},{lon}&z=17"


# ── Geocoding (Nominatim) ────────────────────────────────────────────────────

def geocode_address(address: str) -> tuple[float, float] | None:
    if not address.strip():
        return None

    cache_key = address.strip().lower()
    cached = _address_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0]):
        return cached[1]

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(
                NOMINATIM_SEARCH_URL,
                params={"q": address, "format": "json", "limit": 1, "addressdetails": 1},
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        _address_cache[cache_key] = (time.time(), None)
        return None

    if not data:
        _address_cache[cache_key] = (time.time(), None)
        return None

    try:
        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])
    except (KeyError, ValueError, TypeError):
        _address_cache[cache_key] = (time.time(), None)
        return None

    coords = (lat, lon)
    _address_cache[cache_key] = (time.time(), coords)
    return coords


# ── Google Places Nearby Search (primary) ────────────────────────────────────

def _find_with_google_places(lat: float, lon: float, service_type: str, radius_m: int) -> list[dict[str, Any]]:
    if not GOOGLE_API_KEY:
        logger.warning("geo_google_skip reason=no_api_key")
        return []

    included_types = _GOOGLE_PLACE_TYPES.get(service_type)
    if not included_types:
        logger.warning("geo_google_no_type_mapping service_type=%s", service_type)
        return []

    body = {
        "includedTypes": included_types,
        "maxResultCount": 5,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": float(radius_m),
            }
        },
        "languageCode": "ru",
    }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.googleMapsUri,places.id",
    }

    logger.info("geo_google_places_start service_type=%s types=%s lat=%.5f lon=%.5f radius=%d", service_type, included_types, lat, lon, radius_m)

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(GOOGLE_NEARBY_URL, json=body, headers=headers)
    except Exception as exc:
        logger.error("geo_google_places_request_error service_type=%s error=%s", service_type, exc)
        return []

    if response.status_code >= 400:
        logger.warning("geo_google_places_http_error service_type=%s status=%d body=%.300s", service_type, response.status_code, response.text)
        return []

    data = response.json()
    places = data.get("places") or []
    logger.info("geo_google_places_found service_type=%s count=%d", service_type, len(places))

    items: list[dict[str, Any]] = []
    for place in places:
        location = place.get("location") or {}
        p_lat = location.get("latitude")
        p_lon = location.get("longitude")
        if p_lat is None or p_lon is None:
            continue

        name = (place.get("displayName") or {}).get("text") or service_type.replace("_", " ").title()
        phone = _normalize_phone(place.get("internationalPhoneNumber"))
        distance_m = _haversine_distance_m(lat, lon, p_lat, p_lon)
        maps_uri = place.get("googleMapsUri") or _to_maps_url(p_lat, p_lon)
        address = place.get("formattedAddress")

        logger.info(
            "geo_google_places_result service_type=%s name=%r address=%r distance_m=%d phone=%s",
            service_type, name, address, distance_m, phone,
        )

        items.append({
            "name": name,
            "service_type": service_type,
            "phone": phone,
            "distance_m": distance_m,
            "address": address,
            "maps_url": maps_uri,
            "whatsapp_url": _to_whatsapp_url(phone),
        })

    items.sort(key=lambda x: x.get("distance_m") or 999999)
    return items[:5]


# ── Overpass fallback ─────────────────────────────────────────────────────────

def _overpass_query(lat: float, lon: float, key: str, value: str, radius_m: int) -> str:
    return f"""
[out:json][timeout:25];
(
  node(around:{radius_m},{lat},{lon})["{key}"="{value}"];
  way(around:{radius_m},{lat},{lon})["{key}"="{value}"];
  relation(around:{radius_m},{lat},{lon})["{key}"="{value}"];
);
out center tags 20;
""".strip()


def _extract_point(item: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in item and "lon" in item:
        return float(item["lat"]), float(item["lon"])
    center = item.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _extract_service_name(item: dict[str, Any], fallback: str) -> str:
    tags = item.get("tags") or {}
    return tags.get("name") or tags.get("name:ru") or tags.get("name:kk") or tags.get("operator") or fallback.replace("_", " ").title()


def _extract_address_osm(tags: dict[str, Any]) -> str | None:
    street = tags.get("addr:street") or ""
    house = tags.get("addr:housenumber") or ""
    city = tags.get("addr:city") or ""
    parts = [p for p in [street, house, city] if p]
    return ", ".join(parts) if parts else None


def _extract_phone(tags: dict[str, Any]) -> str | None:
    return _normalize_phone(
        tags.get("phone") or tags.get("contact:phone") or tags.get("mobile") or tags.get("contact:mobile")
    )


def _find_with_overpass(lat: float, lon: float, service_type: str, radius_m: int) -> list[dict[str, Any]]:
    pairs = _SERVICE_QUERY_MAP.get(service_type, [])
    if not pairs:
        return []

    logger.info("geo_overpass_start service_type=%s lat=%.5f lon=%.5f radius_m=%d", service_type, lat, lon, radius_m)
    items: list[dict[str, Any]] = []
    with httpx.Client(timeout=20.0) as client:
        for key, value in pairs:
            query = _overpass_query(lat, lon, key, value, radius_m)
            try:
                response = client.post(OVERPASS_API_URL, data={"data": query}, headers={"User-Agent": USER_AGENT})
            except Exception as exc:
                logger.error("geo_overpass_error service_type=%s key=%s error=%s", service_type, key, exc)
                continue
            if response.status_code >= 400:
                logger.warning("geo_overpass_http_error service_type=%s status=%d", service_type, response.status_code)
                continue

            elements = response.json().get("elements") or []
            logger.info("geo_overpass_elements service_type=%s key=%s count=%d", service_type, key, len(elements))

            for element in elements:
                point = _extract_point(element)
                if not point:
                    continue
                s_lat, s_lon = point
                tags = element.get("tags") or {}
                name = _extract_service_name(element, service_type)
                phone = _extract_phone(tags)
                distance_m = _haversine_distance_m(lat, lon, s_lat, s_lon)
                items.append({
                    "name": name,
                    "service_type": service_type,
                    "phone": phone,
                    "distance_m": distance_m,
                    "address": _extract_address_osm(tags),
                    "maps_url": _to_maps_url(s_lat, s_lon),
                    "whatsapp_url": _to_whatsapp_url(phone),
                })

    items.sort(key=lambda x: x.get("distance_m") or 999999)
    return items[:5]


# ── Main entry point ─────────────────────────────────────────────────────────

def find_nearby(lat: float, lon: float, service_types: list[str], radius_m: int = 2500) -> list[dict[str, Any]]:
    normalized_types = [s for s in dict.fromkeys(service_types) if s]
    if not normalized_types:
        return []

    logger.info("geo_find_nearby lat=%.5f lon=%.5f types=%s radius=%d google_key=%s",
                lat, lon, normalized_types, radius_m,
                "present" if GOOGLE_API_KEY else "MISSING")

    cache_key = f"{round(lat, 4)}:{round(lon, 4)}:{','.join(normalized_types)}:{radius_m}"
    cached = _nearby_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0]):
        logger.info("geo_find_nearby_cache_hit count=%d", len(cached[1]))
        return cached[1]

    aggregated: list[dict[str, Any]] = []
    for stype in normalized_types:
        # 1) Try Google Places
        results = _find_with_google_places(lat, lon, stype, radius_m)

        # 2) Fallback to Overpass
        if not results:
            logger.info("geo_google_empty_fallback_overpass service_type=%s", stype)
            results = _find_with_overpass(lat, lon, stype, radius_m)

        if not results:
            logger.warning("geo_no_results service_type=%s", stype)

        aggregated.extend(results)

    aggregated.sort(key=lambda x: (x.get("distance_m") is None, x.get("distance_m") or 999999))

    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in aggregated:
        key = item.get("name", "").lower().strip()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    logger.info("geo_find_nearby_done total=%d", len(deduped))
    _nearby_cache[cache_key] = (time.time(), deduped)
    return deduped
