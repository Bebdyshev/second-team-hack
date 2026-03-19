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
# Use GOOGLE_PLACES_API_KEY if you have Places API (New) enabled in Google Cloud. Falls back to GEMINI_API_KEY.
GOOGLE_API_KEY: str = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GEMINI_API_KEY") or _env.get("GOOGLE_PLACES_API_KEY", "") or _env.get("GEMINI_API_KEY", "")

GOOGLE_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_FALLBACK_URL = "https://overpass.kumi.systems/api/interpreter"
USER_AGENT = "ResMonitorGeo/1.0 (housing-escalation)"
CACHE_TTL_SECONDS = 3600

_address_cache: dict[str, tuple[float, tuple[float, float] | None]] = {}
_reverse_cache: dict[str, tuple[float, str | None]] = {}
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


def _to_2gis_maps_url(lon: float, lat: float, zoom: int = 17) -> str:
    """2GIS map URL at coordinates. Use 2gis.kz for Kazakhstan."""
    domain = "2gis.kz" if (41 <= lat <= 56 and 46 <= lon <= 88) else "2gis.ru"
    return f"https://{domain}/maps?m={lon:.6f}/{lat:.6f}/{zoom}"


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


def _reverse_geocode(lat: float, lon: float) -> str | None:
    """Get city/town name from coordinates for search context."""
    cache_key = f"rev:{round(lat, 4)}:{round(lon, 4)}"
    cached = _reverse_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0]):
        return cached[1]
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                NOMINATIM_REVERSE_URL,
                params={"lat": lat, "lon": lon, "format": "json", "addressdetails": 1},
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        _reverse_cache[cache_key] = (time.time(), None)
        return None
    addr = data.get("address") or {}
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or addr.get("state")
    _reverse_cache[cache_key] = (time.time(), city)
    return city


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
            "lat": p_lat,
            "lon": p_lon,
            "maps_url": maps_uri,
            "maps_2gis_url": _to_2gis_maps_url(p_lon, p_lat),
            "whatsapp_url": _to_whatsapp_url(phone),
        })

    items.sort(key=lambda x: x.get("distance_m") or 999999)
    return items[:5]


# ── Google Places Text Search (problem-based) ─────────────────────────────────

# Map service_type to Google Places includedType for strict filtering (avoids car repair shops etc)
_SERVICE_TO_PLACE_TYPE: dict[str, str] = {
    "plumber": "plumber",
    "water_utility": "plumber",
    "electrician": "electrician",
    "power_company": "electrician",
    "police": "police",
    "local_authority": "local_government_office",
    "housing_office": "local_government_office",
}


def _viewport_from_circle(lat: float, lon: float, radius_m: int) -> dict[str, Any]:
    """Build a rectangle viewport that contains the circle. LocationRestriction uses rectangle only."""
    deg_per_m_lat = 1.0 / 111_000
    deg_per_m_lon = 1.0 / (111_000 * max(0.3, math.cos(math.radians(lat))))
    delta_lat = radius_m * deg_per_m_lat
    delta_lon = radius_m * deg_per_m_lon
    return {
        "rectangle": {
            "low": {"latitude": lat - delta_lat, "longitude": lon - delta_lon},
            "high": {"latitude": lat + delta_lat, "longitude": lon + delta_lon},
        }
    }


def _find_with_google_places_text(
    lat: float, lon: float, text_query: str, radius_m: int, service_type: str = "service"
) -> list[dict[str, Any]]:
    """Search places by text query. Uses locationRestriction (strict) to avoid results outside area."""
    if not GOOGLE_API_KEY:
        logger.warning("geo_google_text_skip reason=no_api_key")
        return []

    place_type = _SERVICE_TO_PLACE_TYPE.get(service_type)
    max_distance_m = radius_m * 2
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.googleMapsUri,places.id",
    }

    def _parse_places(places: list[dict[str, Any]]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for place in places:
            loc = place.get("location") or {}
            p_lat, p_lon = loc.get("latitude"), loc.get("longitude")
            if p_lat is None or p_lon is None:
                continue
            dist = _haversine_distance_m(lat, lon, p_lat, p_lon)
            if dist > max_distance_m:
                continue
            name = (place.get("displayName") or {}).get("text") or text_query
            phone = _normalize_phone(place.get("internationalPhoneNumber"))
            items.append({
                "name": name,
                "service_type": service_type,
                "phone": phone,
                "distance_m": dist,
                "address": place.get("formattedAddress"),
                "lat": p_lat,
                "lon": p_lon,
                "maps_url": place.get("googleMapsUri") or _to_maps_url(p_lat, p_lon),
                "maps_2gis_url": _to_2gis_maps_url(p_lon, p_lat),
                "whatsapp_url": _to_whatsapp_url(phone),
            })
        items.sort(key=lambda x: x.get("distance_m") or 999999)
        return items[:5]

    for use_strict in (True, False):
        body: dict[str, Any] = {
            "textQuery": text_query.strip()[:100],
            "locationRestriction": _viewport_from_circle(lat, lon, radius_m),
            "pageSize": 10,
            "languageCode": "ru",
            "rankPreference": "DISTANCE",
        }
        if place_type and use_strict:
            body["includedType"] = place_type
            body["strictTypeFiltering"] = True
        if 41 <= lat <= 56 and 46 <= lon <= 88:
            body["regionCode"] = "KZ"

        logger.info("geo_google_text_start query=%r lat=%.5f lon=%.5f radius=%d strict=%s", text_query, lat, lon, radius_m, use_strict)
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(GOOGLE_SEARCH_TEXT_URL, json=body, headers=headers)
        except Exception as exc:
            logger.error("geo_google_text_request_error query=%r error=%s", text_query, exc)
            return []
        if resp.status_code >= 400:
            logger.warning("geo_google_text_http_error query=%r status=%d", text_query, resp.status_code)
            return []
        places = resp.json().get("places") or []
        items = _parse_places(places)
        if items:
            logger.info("geo_google_text_found query=%r count=%d", text_query, len(items))
            return items
        if not use_strict:
            break

    return []


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
    with httpx.Client(timeout=25.0) as client:
        for key, value in pairs:
            query = _overpass_query(lat, lon, key, value, radius_m)
            response = None
            for api_url in [OVERPASS_API_URL, OVERPASS_FALLBACK_URL]:
                try:
                    response = _overpass_post(client, query, api_url)
                    if response.status_code < 400:
                        break
                    if response.status_code == 504:
                        logger.warning("geo_overpass_timeout url=%s trying_fallback", api_url)
                        continue
                    break
                except Exception as exc:
                    logger.warning("geo_overpass_error service_type=%s url=%s error=%s", service_type, api_url, exc)
            if response is None or response.status_code >= 400:
                if response:
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
                    "lat": s_lat,
                    "lon": s_lon,
                    "maps_url": _to_maps_url(s_lat, s_lon),
                    "maps_2gis_url": _to_2gis_maps_url(s_lon, s_lat),
                    "whatsapp_url": _to_whatsapp_url(phone),
                })

    items.sort(key=lambda x: x.get("distance_m") or 999999)
    return items[:5]


def _overpass_post(client: httpx.Client, query: str, url: str = OVERPASS_API_URL) -> httpx.Response:
    return client.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT})


# ── Nominatim search fallback ────────────────────────────────────────────────

_SERVICE_TO_NOMINATIM_QUERY: dict[str, list[str]] = {
    "plumber": ["сантехник", "водопроводчик", "plumber"],
    "water_utility": ["водоканал", "water utility"],
    "electrician": ["электрик", "electrician"],
    "power_company": ["электросеть", "power company"],
    "police": ["полиция", "police"],
    "local_authority": ["администрация", "housing office"],
    "housing_office": ["ЖКХ", "управляющая компания"],
}


def _find_with_nominatim(lat: float, lon: float, queries: list[str], radius_m: int, service_type: str = "service") -> list[dict[str, Any]]:
    """Fallback: search Nominatim when Google/Overpass return nothing."""
    delta = max(0.02, radius_m / 111000)
    lat1, lat2 = lat - delta, lat + delta
    lon1, lon2 = lon - delta, lon + delta
    viewbox = f"{lon1},{lat2},{lon2},{lat1}"  # minlon, maxlat, maxlon, minlat
    city = _reverse_geocode(lat, lon) or ""
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    with httpx.Client(timeout=12.0) as client:
        for q in queries[:3]:
            search_q = f"{q} {city}".strip() if city else q
            try:
                resp = client.get(
                    NOMINATIM_SEARCH_URL,
                    params={"q": search_q, "format": "json", "limit": 5, "viewbox": viewbox, "bounded": 1},
                    headers={"User-Agent": USER_AGENT},
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.warning("geo_nominatim_error query=%r error=%s", search_q, exc)
                continue
            if not isinstance(data, list):
                continue
            for place in data:
                try:
                    p_lat = float(place["lat"])
                    p_lon = float(place["lon"])
                except (KeyError, ValueError, TypeError):
                    continue
                name = place.get("display_name") or place.get("name") or q
                name_short = (place.get("name") or name.split(",")[0] or q).strip()
                if name_short.lower() in seen:
                    continue
                seen.add(name_short.lower())
                distance_m = _haversine_distance_m(lat, lon, p_lat, p_lon)
                items.append({
                    "name": name_short,
                    "service_type": service_type,
                    "phone": None,
                    "distance_m": distance_m,
                    "address": place.get("display_name"),
                    "lat": p_lat,
                    "lon": p_lon,
                    "maps_url": _to_maps_url(p_lat, p_lon),
                    "maps_2gis_url": _to_2gis_maps_url(p_lon, p_lat),
                    "whatsapp_url": None,
                })
                if len(items) >= 5:
                    break
            if len(items) >= 5:
                break
    items.sort(key=lambda x: x.get("distance_m") or 999999)
    return items[:5]


# ── Main entry point ─────────────────────────────────────────────────────────

def find_nearby(
    lat: float,
    lon: float,
    service_types: list[str],
    radius_m: int = 2500,
    text_queries: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Find nearby services. Uses text_queries (from Gemini) with Places searchText when provided; else service_types with searchNearby/Overpass."""
    text_queries = [q.strip() for q in (text_queries or []) if q.strip()]
    normalized_types = [s for s in dict.fromkeys(service_types) if s]

    if not text_queries and not normalized_types:
        return []

    cache_key = f"{round(lat, 4)}:{round(lon, 4)}:{','.join(text_queries or normalized_types)}:{radius_m}"
    cached = _nearby_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0]):
        logger.info("geo_find_nearby_cache_hit count=%d", len(cached[1]))
        return cached[1]

    logger.info("geo_find_nearby lat=%.5f lon=%.5f text_queries=%s types=%s radius=%d google_key=%s",
                lat, lon, text_queries or [], normalized_types, radius_m,
                "present" if GOOGLE_API_KEY else "MISSING")

    aggregated: list[dict[str, Any]] = []

    # 1) Gemini text queries drive the search – no type filter, query is the intent
    if text_queries and GOOGLE_API_KEY:
        for q in text_queries[:3]:
            results = _find_with_google_places_text(lat, lon, q, radius_m, service_type="service")
            aggregated.extend(results)
        if aggregated:
            aggregated.sort(key=lambda x: (x.get("distance_m") is None, x.get("distance_m") or 999999))
            deduped = _dedupe_services(aggregated)
            logger.info("geo_find_nearby_text_done total=%d", len(deduped))
            _nearby_cache[cache_key] = (time.time(), deduped)
            return deduped

    # 2) Fallback: service_types with searchNearby + Overpass
    for stype in normalized_types:
        results = _find_with_google_places(lat, lon, stype, radius_m)
        if not results:
            logger.info("geo_google_empty_fallback_overpass service_type=%s", stype)
            results = _find_with_overpass(lat, lon, stype, radius_m)
        if not results:
            logger.warning("geo_no_results service_type=%s", stype)
        aggregated.extend(results)

    # 3) Last resort: Nominatim search when nothing found
    if not aggregated and (text_queries or normalized_types):
        nom_queries: list[str] = []
        if text_queries:
            nom_queries = text_queries[:3]
        else:
            for stype in normalized_types[:2]:
                nom_queries.extend(_SERVICE_TO_NOMINATIM_QUERY.get(stype, [stype.replace("_", " ")]))
        for i, q in enumerate(nom_queries[:3]):
            stype = normalized_types[i] if i < len(normalized_types) else "service"
            results = _find_with_nominatim(lat, lon, [q], radius_m, service_type=stype)
            if results:
                logger.info("geo_nominatim_found query=%r count=%d", q, len(results))
                aggregated.extend(results)
                break

    aggregated.sort(key=lambda x: (x.get("distance_m") is None, x.get("distance_m") or 999999))
    deduped = _dedupe_services(aggregated)
    logger.info("geo_find_nearby_done total=%d", len(deduped))
    _nearby_cache[cache_key] = (time.time(), deduped)
    return deduped


def _dedupe_services(aggregated: list[dict[str, Any]], max_distance_m: int = 50_000) -> list[dict[str, Any]]:
    """Dedupe and filter out results that are unreasonably far (e.g. wrong country)."""
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in aggregated:
        dist = item.get("distance_m")
        if dist is not None and dist > max_distance_m:
            continue
        key = item.get("name", "").lower().strip()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped
