from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
import logging
import random
from uuid import uuid4

import json as _json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from fastapi.responses import Response, StreamingResponse

from src.housing import gemini_client, groq_client, store, web3
from src.housing.geo_services import find_nearby, geocode_address
from src.housing.schemas import (
    AnchorRequest,
    Apartment,
    AuthResponse,
    CreateTaskRequest,
    DynamicsPoint,
    DynamicsResponse,
    EcoQuestActivityDay,
    EcoQuestActivityResponse,
    EcoQuestCompleteRequest,
    EcoQuestStatusResponse,
    EcoQuestStreakResponse,
    GenerateReportResponse,
    House,
    HouseSummary,
    LoginRequest,
    ManagerActionProof,
    NearbyService,
    NearbyServicesResponse,
    ProveActionRequest,
    RefreshRequest,
    RegisterRequest,
    ReportAnchor,
    ReportOverview,
    ResourceAlert,
    MeterHealth,
    Task,
    UpdateTaskRequest,
    UserProfile,
    Ticket,
    TicketCreate,
    TicketFollowUpCreate,
    TicketUpdate,
)
from src.housing.db import get_housing_db
from src.housing.security import get_current_user, issue_tokens_for_user, require_manager, verify_refresh_token_and_get_user

router = APIRouter()
logger = logging.getLogger(__name__)
_analytics_reasoning_cache: dict[str, dict[str, object]] = {}
_analytics_cache_file = Path(__file__).resolve().parents[2] / ".analytics_reasoning_cache.json"
_meters_stream_state: dict[str, dict[str, object]] = {}
_meters_stream_state_file = Path(__file__).resolve().parents[2] / ".meters_raw_state.json"


def _load_analytics_cache() -> dict[str, dict[str, object]]:
    try:
        if not _analytics_cache_file.exists():
            return {}
        raw = _analytics_cache_file.read_text(encoding="utf-8")
        parsed = _json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception as exc:
        logger.warning("analytics_cache_load_failed error=%s", exc)
    return {}


def _save_analytics_cache() -> None:
    try:
        _analytics_cache_file.write_text(
            _json.dumps(_analytics_reasoning_cache, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("analytics_cache_save_failed error=%s", exc)


_analytics_reasoning_cache = _load_analytics_cache()


def _load_meters_stream_state() -> dict[str, dict[str, object]]:
    try:
        if not _meters_stream_state_file.exists():
            return {}
        raw = _meters_stream_state_file.read_text(encoding="utf-8")
        parsed = _json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception as exc:
        logger.warning("meters_stream_state_load_failed error=%s", exc)
    return {}


def _save_meters_stream_state() -> None:
    try:
        _meters_stream_state_file.write_text(
            _json.dumps(_meters_stream_state, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("meters_stream_state_save_failed error=%s", exc)


_meters_stream_state = _load_meters_stream_state()


def _assert_house_access(user: dict[str, str], house_id: str) -> None:
    if user["house_id"] != house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this house")


def _assert_apartment_access(user: dict[str, str], apartment: Apartment) -> None:
    if user["house_id"] != apartment.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this apartment")
    if user["role"] == "Manager":
        return
    if user["apartment_id"] != apartment.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this apartment")


def _apartments_for_analytics(
    user: dict[str, str],
    house_id: str,
    apartment_id: str | None,
) -> tuple[list[Apartment], str | None]:
    """Which apartments to aggregate for house analytics.

    Managers: whole house, or one apartment when ``apartment_id`` is set.
    Residents: only their unit; optional ``apartment_id`` must match (or be omitted).
    Returns ``(apartments, effective_apartment_id)`` for cache keys (``None`` = whole house).
    """
    all_apt = store.list_apartments(house_id)
    if not all_apt:
        return [], None

    if user["role"] == "Manager":
        if apartment_id:
            filtered = [a for a in all_apt if a.id == apartment_id]
            return (filtered, apartment_id)
        return (all_apt, None)

    own = (user.get("apartment_id") or "").strip()
    if not own:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="resident has no apartment assigned",
        )
    if apartment_id and apartment_id != own:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="forbidden: cannot view other apartments' analytics",
        )
    eff = apartment_id or own
    filtered = [a for a in all_apt if a.id == eff]
    if not filtered:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="apartment not found")
    return (filtered, eff)


def _is_night_incident(incident_time: str) -> bool:
    try:
        hour = int(incident_time.split(":", 1)[0])
    except (ValueError, IndexError):
        return False
    return hour >= 23 or hour < 7


def _resolve_escalation_services(complaint_tags: list[str], incident_time: str) -> list[str]:
    if not complaint_tags:
        return ["housing_office"]

    if "recommendation" in complaint_tags:
        return []

    if "neighbors" in complaint_tags:
        if _is_night_incident(incident_time):
            return ["police"]
        return ["police", "local_authority"]

    service_types: list[str] = []
    if "water" in complaint_tags:
        service_types.extend(["plumber", "water_utility"])
    if "electricity" in complaint_tags:
        service_types.extend(["electrician", "power_company"])
    if "schedule" in complaint_tags:
        service_types.extend(["local_authority", "housing_office"])
    if "general" in complaint_tags:
        service_types.append("housing_office")

    deduped = [item for item in dict.fromkeys(service_types)]
    return deduped or ["housing_office"]


def _service_type_to_search_query(service_types: list[str]) -> str:
    """Fallback 2GIS query when Gemini returns no text_queries."""
    for st in service_types:
        if st in ("plumber", "water_utility"):
            return "сантехник"
        if st in ("electrician", "power_company"):
            return "электрик"
        if st == "police":
            return "полиция"
    return "ЖКХ"


@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    user = store.get_user_by_email(payload.email)
    if user is None or not store.verify_user_password(user, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    access_token, refresh_token = issue_tokens_for_user(user)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=store.make_profile(user))


@router.post("/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest) -> AuthResponse:
    try:
        user = store.create_user(payload.email, payload.password, payload.full_name, payload.role)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    access_token, refresh_token = issue_tokens_for_user(user)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=store.make_profile(user))


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest) -> AuthResponse:
    user = verify_refresh_token_and_get_user(payload.refresh_token)
    access_token, refresh_token = issue_tokens_for_user(user)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=store.make_profile(user))


@router.get("/auth/me", response_model=UserProfile)
def me(user: dict[str, str] = Depends(get_current_user)) -> UserProfile:
    return store.make_profile(user)


@router.get("/houses", response_model=list[House])
def houses(user: dict[str, str] = Depends(get_current_user)) -> list[House]:
    return store.get_houses_for_user(user)


@router.get("/houses/{house_id}/summary", response_model=HouseSummary)
def house_summary(house_id: str, user: dict[str, str] = Depends(get_current_user)) -> HouseSummary:
    _assert_house_access(user, house_id)
    house = store.get_house(house_id)
    if house is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house not found")

    apartments = store.list_apartments(house_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house has no apartments")

    total_power = sum(sum(item.electricity_daily) for item in apartments)
    total_water = sum(sum(item.water_daily) for item in apartments)
    average_air = round(sum(sum(item.co2_series) / len(item.co2_series) for item in apartments) / len(apartments))
    city_impact = max(18, min(84, round(total_power / 16)))
    alerts_count = len(store.list_alerts(house_id))
    return HouseSummary(
        house=house,
        total_power=round(total_power, 2),
        total_water=round(total_water, 2),
        average_air=average_air,
        city_impact=city_impact,
        alerts_count=alerts_count,
    )


@router.get("/houses/{house_id}/dynamics", response_model=DynamicsResponse)
def house_dynamics(
    house_id: str,
    resource: str = Query("electricity"),
    period: str = Query("24h"),
    user: dict[str, str] = Depends(get_current_user),
) -> DynamicsResponse:
    _assert_house_access(user, house_id)
    apartments = store.list_apartments(house_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house has no apartments")

    points: list[DynamicsPoint] = []
    if period == "24h":
        for hour in range(24):
            if resource == "electricity":
                value = sum(item.electricity_daily[hour] for item in apartments)
            elif resource == "water":
                value = sum(item.water_daily[hour] for item in apartments)
            elif resource == "co2":
                value = sum(item.co2_series[hour] for item in apartments) / len(apartments)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown resource")
            points.append(DynamicsPoint(label=f"{hour:02d}:00", value=round(float(value), 2)))
    elif period == "30d":
        for day in range(30):
            if resource == "electricity":
                value = sum(item.electricity_monthly[day] for item in apartments)
            elif resource == "water":
                value = sum(item.water_monthly[day] for item in apartments)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resource not supported for 30d")
            points.append(DynamicsPoint(label=str(day + 1), value=round(float(value), 2)))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown period")

    return DynamicsResponse(resource=resource, period=period, dynamics=points)


@router.get("/houses/{house_id}/apartments", response_model=list[Apartment])
def house_apartments(house_id: str, user: dict[str, str] = Depends(get_current_user)) -> list[Apartment]:
    _assert_house_access(user, house_id)
    all_apt = store.list_apartments(house_id)
    if user["role"] == "Manager":
        return all_apt
    own = (user.get("apartment_id") or "").strip()
    if not own:
        return []
    return [a for a in all_apt if a.id == own]


@router.get("/apartments/{apartment_id}/summary")
def apartment_summary(apartment_id: str, user: dict[str, str] = Depends(get_current_user)) -> dict:
    apartment = store.get_apartment(apartment_id)
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="apartment not found")
    _assert_apartment_access(user, apartment)

    live_hour = datetime.utcnow().hour % 24
    return {
        "apartment": apartment,
        "live_snapshot": {
            "electricity": round(apartment.electricity_daily[live_hour], 2),
            "water": round(apartment.water_daily[live_hour], 2),
            "co2": apartment.co2_series[live_hour],
            "humidity": apartment.humidity_series[live_hour],
            "savings": apartment.savings,
        },
    }


@router.get("/apartments/{apartment_id}/dynamics", response_model=DynamicsResponse)
def apartment_dynamics(
    apartment_id: str,
    resource: str = Query("electricity"),
    period: str = Query("24h"),
    user: dict[str, str] = Depends(get_current_user),
) -> DynamicsResponse:
    apartment = store.get_apartment(apartment_id)
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="apartment not found")
    _assert_apartment_access(user, apartment)

    points: list[DynamicsPoint] = []
    if period == "24h":
        for hour in range(24):
            if resource == "electricity":
                value = apartment.electricity_daily[hour]
            elif resource == "water":
                value = apartment.water_daily[hour]
            elif resource == "co2":
                value = apartment.co2_series[hour]
            elif resource == "humidity":
                value = apartment.humidity_series[hour]
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown resource")
            points.append(DynamicsPoint(label=f"{hour:02d}:00", value=round(float(value), 2)))
    elif period == "30d":
        if resource not in {"electricity", "water"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resource not supported for 30d")
        for day in range(30):
            value = apartment.electricity_monthly[day] if resource == "electricity" else apartment.water_monthly[day]
            points.append(DynamicsPoint(label=str(day + 1), value=round(float(value), 2)))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown period")
    return DynamicsResponse(resource=resource, period=period, dynamics=points)


@router.get("/alerts", response_model=list[ResourceAlert])
def alerts(house_id: str | None = Query(default=None), user: dict[str, str] = Depends(get_current_user)) -> list[ResourceAlert]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    items = store.list_alerts(target_house)
    if user["role"] == "Resident":
        own = (user.get("apartment_id") or "").strip()
        if not own:
            return []
        items = [a for a in items if a.apartment_id == own]
    return items


@router.get("/meters", response_model=list[MeterHealth])
def meters(house_id: str | None = Query(default=None), user: dict[str, str] = Depends(get_current_user)) -> list[MeterHealth]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    return store.list_meters(target_house)


@router.get("/meters/raw-stream")
async def meters_raw_stream(
    house_id: str | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
) -> StreamingResponse:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    meters_list = store.list_meters(target_house)
    if not meters_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no meters found")

    state = _meters_stream_state.get(target_house)
    if not state:
        state = {
            "last_values": {},
            "history": [],
            "seed": abs(hash(target_house)) % (2**31),
        }
        _meters_stream_state[target_house] = state

    last_values = state.get("last_values")
    history = state.get("history")
    if not isinstance(last_values, dict):
        last_values = {}
        state["last_values"] = last_values
    if not isinstance(history, list):
        history = []
        state["history"] = history

    rng = random.Random(int(state.get("seed", 0)) + int(datetime.utcnow().timestamp()) // 30)

    def _base_for_resource(resource: str) -> float:
        if resource == "electricity":
            return rng.uniform(1.6, 3.8)
        if resource == "water":
            return rng.uniform(14.0, 40.0)
        if resource == "gas":
            return rng.uniform(6.0, 22.0)
        if resource == "heating":
            return rng.uniform(0.8, 2.2)
        return rng.uniform(1.0, 3.0)

    for meter in meters_list:
        if meter.id not in last_values:
            last_values[meter.id] = round(_base_for_resource(meter.resource), 3)

    async def generate():
        if history:
            # Keep continuity after page reload
            yield f"event: snapshot\ndata: {_json.dumps(history[-25:])}\n\n"

        while True:
            meter = rng.choice(meters_list)
            roll = rng.random()
            quality = "ok"
            is_stale = False
            is_dropped = False
            lag_ms = int(rng.uniform(120, 850))
            signal = meter.signal_strength
            previous_value = float(last_values.get(meter.id, _base_for_resource(meter.resource)))

            if roll < 0.12:
                quality = "drop"
                is_dropped = True
                signal = "offline" if rng.random() < 0.7 else "weak"
                payload = {
                    "ts": datetime.utcnow().isoformat(),
                    "meter_id": meter.id,
                    "house_id": meter.house_id,
                    "resource": meter.resource,
                    "signal_strength": signal,
                    "quality": quality,
                    "is_stale": is_stale,
                    "is_dropped": is_dropped,
                    "lag_ms": int(rng.uniform(1200, 6000)),
                    "value": None,
                }
            else:
                if roll < 0.32:
                    quality = "stale"
                    is_stale = True
                    lag_ms = int(rng.uniform(2000, 12000))
                    signal = "weak" if rng.random() < 0.65 else meter.signal_strength
                    value = round(previous_value, 3)
                else:
                    delta = rng.uniform(-0.22, 0.22)
                    value = round(max(0.05, previous_value + delta), 3)
                    last_values[meter.id] = value

                payload = {
                    "ts": datetime.utcnow().isoformat(),
                    "meter_id": meter.id,
                    "house_id": meter.house_id,
                    "resource": meter.resource,
                    "signal_strength": signal,
                    "quality": quality,
                    "is_stale": is_stale,
                    "is_dropped": is_dropped,
                    "lag_ms": lag_ms,
                    "value": value,
                }

            history.append(payload)
            if len(history) > 300:
                del history[: len(history) - 300]
            _save_meters_stream_state()

            yield f"data: {_json.dumps(payload)}\n\n"
            await asyncio.sleep(0.9)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/houses/{house_id}/reports/anchor", response_model=ReportAnchor)
def anchor_report(
    house_id: str,
    payload: AnchorRequest,
    user: dict[str, str] = Depends(require_manager),
    db=Depends(get_housing_db),
) -> ReportAnchor:
    _assert_house_access(user, house_id)
    period = payload.period or datetime.utcnow().strftime("%Y-%m")
    report_hash = payload.report_hash or store.compute_hash({"house_id": house_id, "period": period, "type": "monthly_report"})
    metadata_uri = payload.metadata_uri or f"report://{house_id}/{period}"

    existing = store.find_report_anchor(house_id, period, report_hash, db=db)
    if existing is not None:
        return existing

    tx_meta = web3.defer_anchor("anchor_report", {"house_id": house_id, "period": period, "report_hash": report_hash})
    now = store.now_utc()
    anchor = ReportAnchor(
        id=f"anchor-{uuid4().hex[:12]}",
        house_id=house_id,
        period=period,
        metadata_uri=metadata_uri,
        report_hash=report_hash,
        triggered_by=user["id"],
        status=tx_meta["status"],
        tx_hash=tx_meta["tx_hash"],
        block_number=tx_meta["block_number"],
        chain_id=tx_meta["chain_id"],
        contract_address=tx_meta["contract_address"],
        explorer_url=tx_meta["explorer_url"],
        error_message=tx_meta["error_message"],
        created_at=now,
        updated_at=now,
    )
    return store.add_report_anchor(anchor, db=db)


@router.get("/houses/{house_id}/reports/overview", response_model=ReportOverview)
def report_overview(
    house_id: str,
    user: dict[str, str] = Depends(get_current_user),
) -> ReportOverview:
    _assert_house_access(user, house_id)
    overview = store.build_report_overview(house_id)
    if overview is None:
        raise HTTPException(status_code=404, detail="House not found")
    return overview


@router.get("/houses/{house_id}/reports/anchors", response_model=list[ReportAnchor])
def report_anchors(
    house_id: str,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> list[ReportAnchor]:
    _assert_house_access(user, house_id)
    return store.list_report_anchors(house_id, db=db)


@router.get("/houses/{house_id}/reports/pdf")
def report_pdf(
    house_id: str,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Response:
    """Generate a per-apartment PDF report and return it as an attachment."""
    _assert_house_access(user, house_id)

    try:
        from fpdf import FPDF, XPos, YPos
    except ImportError:
        raise HTTPException(status_code=503, detail="fpdf2 not installed - run: pip install fpdf2")

    def _safe(text: str, max_len: int = 120) -> str:
        """Strip characters outside Latin-1 range so Helvetica doesn't choke."""
        cleaned = text.encode("latin-1", errors="replace").decode("latin-1")
        return cleaned[:max_len]

    overview = store.build_report_overview(house_id)
    if overview is None:
        raise HTTPException(status_code=404, detail="House not found")

    anchors = store.list_report_anchors(house_id, db=db)
    latest_anchor = anchors[0] if anchors else None

    store._seed_apartments()
    apartments = store.list_apartments(house_id)

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    period = datetime.utcnow().strftime("%Y-%m")

    # ── PDF layout ─────────────────────────────────────────────────────────────
    class PDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(100, 100, 100)
            self.cell(0, 6, _safe(f"CONFIDENTIAL  |  {overview.house_name}  |  Generated {now_str}"), align="R")
            self.ln(8)

        def footer(self):
            self.set_y(-14)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(160, 160, 160)
            if latest_anchor:
                self.cell(0, 5, f"On-chain proof: {latest_anchor.report_hash[:24]}...  |  TX: {latest_anchor.tx_hash[:24]}...  |  Polygon Amoy chain {latest_anchor.chain_id}", align="C")
            self.ln(4)
            self.cell(0, 5, f"Page {self.page_no()}", align="C")

    pdf = PDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # ── Cover / title block ────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, _safe(overview.house_name, 60), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(0, 6, f"Apartment Analytics Report  |  Period: {period}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)

    # Provenance line
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 5,
        f"Apartments: {overview.provenance.apartments_measured}  |  "
        f"Meters: {overview.provenance.meters_used}  |  "
        f"Anomalies detected: {len(overview.anomalies)}",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if latest_anchor:
        status_txt = "VERIFIED ON-CHAIN" if latest_anchor.status == "confirmed" else latest_anchor.status.upper()
        pdf.set_text_color(22, 163, 74) if latest_anchor.status == "confirmed" else pdf.set_text_color(220, 38, 38)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(0, 5, f"Blockchain integrity: {status_txt}  |  {latest_anchor.explorer_url or 'N/A'}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ── Separator ──────────────────────────────────────────────────────────────
    pdf.set_draw_color(226, 232, 240)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(5)

    # ── Section 1: Per-apartment table ────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 7, "Per-Apartment Overview", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    col_w = [18, 18, 22, 34, 28, 24, 50, 18, 18]
    headers = ["Floor", "Unit", "Apt ID", "Status", "Elec avg (kWh)", "Water avg (L)", "CO2 avg (ppm)", "Score", "Anomalies"]

    # Header row
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(71, 85, 105)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
    pdf.ln()

    # Data rows
    pdf.set_font("Helvetica", "", 7)
    row_num = 0
    for apt in sorted(apartments, key=lambda a: (a.floor, a.unit)):
        elec_avg = round(sum(apt.electricity_daily) / 24, 2)
        water_avg = round(sum(apt.water_daily) / 24, 1)
        co2_avg = round(sum(apt.co2_series) / 24, 0)

        if apt.status == "alert":
            pdf.set_text_color(185, 28, 28)
        elif apt.status == "watch":
            pdf.set_text_color(161, 98, 7)
        else:
            pdf.set_text_color(21, 128, 61)

        fill = row_num % 2 == 1
        pdf.set_fill_color(248, 250, 252)

        pdf.cell(col_w[0], 6, str(apt.floor), border="B", fill=fill, align="C")
        pdf.cell(col_w[1], 6, str(apt.unit), border="B", fill=fill, align="C")
        pdf.set_text_color(15, 23, 42)
        pdf.cell(col_w[2], 6, apt.id, border="B", fill=fill, align="C")
        # Status badge text
        s_color = {"alert": (185, 28, 28), "watch": (161, 98, 7), "good": (21, 128, 61)}.get(apt.status, (71, 85, 105))
        pdf.set_text_color(*s_color)
        pdf.cell(col_w[3], 6, apt.status.upper(), border="B", fill=fill, align="C")
        pdf.set_text_color(15, 23, 42)
        pdf.cell(col_w[4], 6, f"{elec_avg:.2f}", border="B", fill=fill, align="R")
        pdf.cell(col_w[5], 6, f"{water_avg:.1f}", border="B", fill=fill, align="R")
        pdf.cell(col_w[6], 6, f"{co2_avg:.0f}", border="B", fill=fill, align="R")
        # Score - color coded
        score_color = (21, 128, 61) if apt.score >= 80 else (161, 98, 7) if apt.score >= 60 else (185, 28, 28)
        pdf.set_text_color(*score_color)
        pdf.cell(col_w[7], 6, str(apt.score), border="B", fill=fill, align="C")
        pdf.set_text_color(15, 23, 42)
        pdf.cell(col_w[8], 6, str(len(apt.anomalies)), border="B", fill=fill, align="C")
        pdf.ln()
        row_num += 1

    pdf.ln(6)

    # ── Section 2: Monthly consumption table ──────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 7, "Monthly Consumption Summary", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    m_col_w = [30, 42, 36, 36, 28, 32]
    m_headers = ["Period", "Electricity (kWh)", "Water (L)", "CO2 avg (ppm)", "Anomalies", "Apartments"]

    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(71, 85, 105)
    for i, h in enumerate(m_headers):
        pdf.cell(m_col_w[i], 7, h, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for row_i, row in enumerate(overview.monthly_rows):
        fill = row_i % 2 == 1
        pdf.set_fill_color(248, 250, 252)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(m_col_w[0], 6, row.period, border="B", fill=fill, align="C")
        pdf.cell(m_col_w[1], 6, f"{row.electricity_kwh:,.1f}", border="B", fill=fill, align="R")
        pdf.cell(m_col_w[2], 6, f"{row.water_liters:,.0f}", border="B", fill=fill, align="R")
        pdf.cell(m_col_w[3], 6, f"{row.co2_avg_ppm:.1f}", border="B", fill=fill, align="R")
        anom_color = (185, 28, 28) if row.anomaly_count > 5 else (161, 98, 7) if row.anomaly_count > 0 else (21, 128, 61)
        pdf.set_text_color(*anom_color)
        pdf.cell(m_col_w[4], 6, str(row.anomaly_count), border="B", fill=fill, align="C")
        pdf.set_text_color(15, 23, 42)
        pdf.cell(m_col_w[5], 6, str(row.apartment_count), border="B", fill=fill, align="C")
        pdf.ln()

    pdf.ln(6)

    # ── Section 3: Anomaly log ─────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 7, f"Anomaly Transparency Log  ({len(overview.anomalies)} events)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    if not overview.anomalies:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 6, "No anomalies detected for this period.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    else:
        a_col_w = [18, 30, 24, 170]
        a_headers = ["Severity", "Resource", "Detected at", "Description"]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(71, 85, 105)
        for i, h in enumerate(a_headers):
            pdf.cell(a_col_w[i], 7, h, border=1, fill=True, align="C")
        pdf.ln()
        pdf.set_font("Helvetica", "", 8)
        for row_i, anomaly in enumerate(overview.anomalies):
            fill = row_i % 2 == 1
            pdf.set_fill_color(248, 250, 252)
            sev_color = {"high": (185, 28, 28), "medium": (161, 98, 7), "low": (71, 85, 105)}.get(anomaly.severity, (71, 85, 105))
            pdf.set_text_color(*sev_color)
            pdf.cell(a_col_w[0], 6, anomaly.severity.upper(), border="B", fill=fill, align="C")
            pdf.set_text_color(15, 23, 42)
            pdf.cell(a_col_w[1], 6, _safe(anomaly.resource.capitalize(), 20), border="B", fill=fill)
            pdf.cell(a_col_w[2], 6, _safe(anomaly.detected_at, 16), border="B", fill=fill, align="C")
            pdf.cell(a_col_w[3], 6, _safe(anomaly.title, 80), border="B", fill=fill)
            pdf.ln()

    pdf.ln(6)

    # ── Section 4: On-chain proof ──────────────────────────────────────────────
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 7, "Blockchain Integrity Proof", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)

    if not anchors:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 6, "No on-chain anchors found. Use 'Generate & Anchor' on the Reports page to seal this report.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    else:
        for anchor_item in anchors[:10]:
            pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(15, 23, 42)
            status_color = (21, 128, 61) if anchor_item.status == "confirmed" else (185, 28, 28) if anchor_item.status == "failed" else (161, 98, 7)
            pdf.set_fill_color(240, 253, 244) if anchor_item.status == "confirmed" else pdf.set_fill_color(254, 242, 242)
            pdf.cell(0, 7, f"Period: {anchor_item.period}  |  Status: {anchor_item.status.upper()}  |  {anchor_item.created_at.strftime('%Y-%m-%d %H:%M') if hasattr(anchor_item.created_at, 'strftime') else str(anchor_item.created_at)[:16]}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 7)
            pdf.set_fill_color(248, 250, 252)
            pdf.set_text_color(51, 65, 85)
            pdf.cell(0, 5, _safe(f"Report Hash:  {anchor_item.report_hash}"), fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.cell(0, 5, _safe(f"TX Hash:      {anchor_item.tx_hash}"), fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            if anchor_item.explorer_url:
                pdf.set_text_color(37, 99, 235)
                pdf.cell(0, 5, _safe(f"Explorer:     {anchor_item.explorer_url}", 200), fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                pdf.set_text_color(51, 65, 85)
            pdf.ln(3)

    # ── How to verify box ─────────────────────────────────────────────────────
    pdf.ln(2)
    pdf.set_draw_color(203, 213, 225)
    pdf.set_fill_color(248, 250, 252)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(0, 7, "How to verify report integrity", fill=True, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 8)
    steps = [
        "1. Take the Report Hash shown above.",
        "2. Search for the TX Hash on https://amoy.polygonscan.com",
        "3. In the transaction detail, open the 'Input Data' field (switch to UTF-8 view).",
        "4. The first 66 characters of the data field should match the Report Hash exactly.",
        "5. The block timestamp proves WHEN the report was sealed - it cannot be backdated.",
    ]
    for step in steps:
        pdf.cell(0, 5, step, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf_bytes = pdf.output()

    filename = f"report_{house_id}_{period}.pdf"
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/houses/{house_id}/reports/generate")
def generate_and_anchor_report(
    house_id: str,
    user: dict[str, str] = Depends(require_manager),
    db=Depends(get_housing_db),
) -> StreamingResponse:
    """Generate a monthly report, compute its canonical hash, and anchor it on-chain.

    Streams Server-Sent Events so the browser can show real-time progress:
      event: step   — GenerateReportStep (collecting → hashing → anchoring → done)
      event: result — GenerateReportResponse JSON
      event: error  — { message: str }
    """
    _assert_house_access(user, house_id)

    user_snapshot = dict(user)
    db_snapshot = db  # capture before generator runs

    def _generate():
        # ── Step 1: collect data ───────────────────────────────────────────────
        yield (
            "event: step\n"
            f"data: {_json.dumps({'step': 'collecting', 'message': 'Collecting apartment and meter data…', 'progress': 20})}\n\n"
        )

        overview = store.build_report_overview(house_id)
        if overview is None:
            yield f"event: error\ndata: {_json.dumps({'message': 'House not found'})}\n\n"
            return

        # ── Step 2: compute canonical hash ────────────────────────────────────
        yield (
            "event: step\n"
            f"data: {_json.dumps({'step': 'hashing', 'message': 'Computing canonical SHA-256 hash…', 'progress': 45})}\n\n"
        )

        report_hash = store.compute_overview_hash(overview)
        period = datetime.utcnow().strftime("%Y-%m")

        logger.info("generate_report_hash house_id=%s period=%s hash=%s", house_id, period, report_hash[:18])

        # Idempotency: return existing anchor if same hash was already anchored
        existing = store.find_report_anchor(house_id, period, report_hash, db=db_snapshot)
        if existing is not None:
            logger.info("generate_report_duplicate house_id=%s period=%s", house_id, period)
            yield (
                "event: step\n"
                f"data: {_json.dumps({'step': 'exists', 'message': 'Identical report already anchored — returning cached proof.', 'progress': 100})}\n\n"
            )
            result = GenerateReportResponse(
                overview=overview,
                anchor=existing,
                report_hash=report_hash,
                already_exists=True,
            )
            yield f"event: result\ndata: {_json.dumps(result.model_dump(mode='json'), default=str)}\n\n"
            return

        # ── Step 3: anchor on-chain ────────────────────────────────────────────
        yield (
            "event: step\n"
            f"data: {_json.dumps({'step': 'anchoring', 'message': 'Submitting transaction to Polygon Amoy…', 'progress': 70})}\n\n"
        )

        tx_meta = web3.defer_anchor(
            "generate_report",
            {"house_id": house_id, "period": period, "report_hash": report_hash},
        )

        now = store.now_utc()
        short_hash = report_hash[:18]
        anchor = ReportAnchor(
            id=f"anchor-{uuid4().hex[:12]}",
            house_id=house_id,
            period=period,
            metadata_uri=f"report://{house_id}/{period}",
            report_hash=report_hash,
            triggered_by=user_snapshot["id"],
            status=tx_meta["status"],
            tx_hash=tx_meta["tx_hash"],
            block_number=tx_meta["block_number"],
            chain_id=tx_meta["chain_id"],
            contract_address=tx_meta["contract_address"],
            explorer_url=tx_meta["explorer_url"],
            error_message=tx_meta["error_message"],
            created_at=now,
            updated_at=now,
        )
        store.add_report_anchor(anchor, db=db_snapshot)

        status_label = "Confirmed" if tx_meta["status"] == "confirmed" else "Failed"
        yield (
            "event: step\n"
            f"data: {_json.dumps({'step': 'done', 'message': f'{status_label} · hash {short_hash}…', 'progress': 100})}\n\n"
        )

        result = GenerateReportResponse(
            overview=overview,
            anchor=anchor,
            report_hash=report_hash,
            already_exists=False,
        )
        yield f"event: result\ndata: {_json.dumps(result.model_dump(mode='json'), default=str)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/manager-actions/prove", response_model=ManagerActionProof)
def prove_manager_action(payload: ProveActionRequest, user: dict[str, str] = Depends(require_manager)) -> ManagerActionProof:
    house_id = payload.house_id or user["house_id"]
    _assert_house_access(user, house_id)

    action_hash = store.compute_hash(
        {
            "house_id": house_id,
            "action_type": payload.action_type,
            "actor_id": payload.actor_id or user["id"],
            "payload": payload.payload or {},
        }
    )
    existing = store.find_action_proof(house_id, action_hash)
    if existing is not None:
        return existing

    tx_meta = web3.defer_anchor(
        "manager_action",
        {
            "house_id": house_id,
            "action_type": payload.action_type,
            "action_hash": action_hash,
        },
    )
    now = store.now_utc()
    proof = ManagerActionProof(
        id=f"proof-{uuid4().hex[:12]}",
        house_id=house_id,
        action_type=payload.action_type,
        actor_id=payload.actor_id or user["id"],
        action_hash=action_hash,
        triggered_by=user["id"],
        status=tx_meta["status"],
        tx_hash=tx_meta["tx_hash"],
        block_number=tx_meta["block_number"],
        chain_id=tx_meta["chain_id"],
        contract_address=tx_meta["contract_address"],
        explorer_url=tx_meta["explorer_url"],
        error_message=tx_meta["error_message"],
        created_at=now,
        updated_at=now,
    )
    return store.add_action_proof(proof)


@router.get("/manager-actions/proofs", response_model=list[ManagerActionProof])
def manager_action_proofs(house_id: str | None = Query(default=None), user: dict[str, str] = Depends(get_current_user)) -> list[ManagerActionProof]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    return store.list_action_proofs(target_house)


@router.get("/tasks", response_model=list[Task])
def list_tasks(
    house_id: str | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> list[Task]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    return store.list_tasks(target_house, db=db)


@router.post("/tasks", response_model=Task, status_code=201)
def create_task(
    payload: CreateTaskRequest,
    user: dict[str, str] = Depends(require_manager),
    db=Depends(get_housing_db),
) -> Task:
    house_id = payload.house_id or user["house_id"]
    _assert_house_access(user, house_id)
    return store.create_task(
        title=payload.title,
        description=payload.description,
        building=payload.building,
        category=payload.category,
        priority=payload.priority,
        due_time=payload.due_time,
        complaint_type=payload.complaint_type,
        house_id=house_id,
        db=db,
    )


@router.patch("/tasks/{task_id}", response_model=Task)
def update_task(
    task_id: str,
    payload: UpdateTaskRequest,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Task:
    task = store.get_task(task_id, db=db)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    if task.house_id != "all" and task.house_id != user["house_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this task")

    updated = store.update_task(
        task_id,
        status=payload.status,
        title=payload.title,
        description=payload.description,
        db=db,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")

    # Sync task status → ticket so resident sees manager's progress
    ticket_id = updated.source_ticket_id
    if ticket_id:
        if payload.status == "in_progress":
            store.update_ticket_status(ticket_id, "viewing", viewed_at=store.now_utc(), db=db)
        elif payload.status == "done":
            decision = (payload.decision or "Resolved").strip() or "Resolved"
            store.update_ticket_status(ticket_id, "decision", decision=decision, db=db)

    return updated


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task_route(
    task_id: str,
    user: dict[str, str] = Depends(require_manager),
    db=Depends(get_housing_db),
) -> Response:
    task = store.get_task(task_id, db=db)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    if task.house_id != "all" and task.house_id != user["house_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this task")
    store.delete_task(task_id, db=db)
    return Response(status_code=204)


# ── Tickets ───────────────────────────────────────────────────────────────────
@router.post("/tickets", response_model=Ticket, status_code=201)
def create_ticket(
    payload: TicketCreate,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Ticket:
    if user["role"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only residents can create tickets")
    apt_id = user.get("apartment_id") or ""
    if not apt_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resident has no apartment")

    house = store.get_house(user["house_id"])
    building_name = house.name if house else "Maple Residence"

    # Transform ticket to task via Gemini and add to Daily Tasks
    task_data = gemini_client.transform_ticket_to_task(
        subject=payload.subject,
        description=payload.description,
        incident_date=payload.incident_date,
        incident_time=payload.incident_time,
        apartment_id=apt_id,
        building_name=building_name,
    )
    complaint_types_str = task_data.get("complaint_types", "general") if task_data else "general"
    complaint_type = task_data.get("complaint_type", "general") if task_data else "general"
    logger.info(
        "ticket_classification_result resident_id=%s house_id=%s tags=%s ai_used=%s",
        user["id"],
        user["house_id"],
        complaint_types_str,
        bool(task_data),
    )

    ticket = store.create_ticket(
        house_id=user["house_id"],
        resident_id=user["id"],
        resident_name=user["full_name"],
        resident_email=user["email"],
        apartment_id=apt_id,
        subject=payload.subject,
        description=payload.description,
        incident_date=payload.incident_date,
        incident_time=payload.incident_time,
        attachments=payload.attachments,
        complaint_type=complaint_types_str,
        db=db,
    )

    if task_data:
        store.create_task(
            title=task_data["title"],
            description=task_data["description"],
            building=task_data["building"],
            category=task_data["category"],
            priority=task_data["priority"],
            due_time=task_data["due_time"],
            house_id=user["house_id"],
            apartment=task_data.get("apartment"),
            ai_comment=task_data.get("ai_comment"),
            source_ticket_id=ticket.id,
            complaint_type=complaint_types_str,
            db=db,
        )
    else:
        logger.warning(
            "ticket_classification_fallback resident_id=%s house_id=%s complaint_type=general reason=gemini_unavailable_or_parse_failed",
            user["id"],
            user["house_id"],
        )
        # Fallback if Groq unavailable: create basic task from ticket
        store.create_task(
            title=payload.subject,
            description=payload.description,
            building=building_name,
            category="complaint",
            priority="medium",
            due_time=payload.incident_time or "12:00",
            house_id=user["house_id"],
            apartment=apt_id,
            ai_comment=None,
            source_ticket_id=ticket.id,
            complaint_type="general",
            db=db,
        )

    return ticket


@router.get("/tickets", response_model=list[Ticket])
def list_tickets(
    house_id: str | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> list[Ticket]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    if user["role"] == "Manager":
        return store.list_tickets_for_manager(target_house, db=db)
    return store.list_tickets_for_resident(user["id"], db=db)


@router.delete("/tickets/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: str,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Response:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["role"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only residents can delete their own tickets")
    if user["id"] != ticket.resident_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if ticket.status == "decision":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot delete resolved ticket")

    linked_task = store.get_task_by_source_ticket_id(ticket_id, db=db)
    if linked_task:
        store.delete_task(linked_task.id, db=db)
    store.delete_ticket(ticket_id, db=db)
    return Response(status_code=204)


@router.get("/tickets/{ticket_id}", response_model=Ticket)
def get_ticket(
    ticket_id: str,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Ticket:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] == "Resident" and user["id"] != ticket.resident_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return ticket


@router.get("/houses/{house_id}/analytics/reasoning")
def house_analytics_reasoning(
    house_id: str,
    apartment_id: str | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
) -> dict:
    _assert_house_access(user, house_id)

    house = store.get_house(house_id)
    if house is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house not found")

    apartments, _eff = _apartments_for_analytics(user, house_id, apartment_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no apartments found")

    # Aggregate hourly data across selected apartments
    electricity_24h: list[float] = []
    water_24h: list[float] = []
    co2_24h: list[float] = []

    for h in range(24):
        electricity_24h.append(round(sum(apt.electricity_daily[h] for apt in apartments), 2))
        water_24h.append(round(sum(apt.water_daily[h] for apt in apartments), 2))
        raw_co2 = [apt.co2_series[h] for apt in apartments if apt.co2_series]
        co2_24h.append(round(sum(raw_co2) / len(raw_co2), 1) if raw_co2 else 0.0)

    result = groq_client.analyze_house_resources(
        electricity_24h=electricity_24h,
        water_24h=water_24h,
        co2_24h=co2_24h,
        house_name=house.name,
    )

    if result is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service unavailable")

    return {
        "house_id": house_id,
        "house_name": house.name,
        "electricity_24h": electricity_24h,
        "water_24h": water_24h,
        "co2_24h": co2_24h,
        "reasoning": result,
    }


@router.get("/houses/{house_id}/analytics/reasoning/stream")
def house_analytics_reasoning_stream(
    house_id: str,
    apartment_id: str | None = Query(default=None),
    force_refresh: bool = Query(default=False),
    user: dict[str, str] = Depends(get_current_user),
) -> StreamingResponse:
    _assert_house_access(user, house_id)

    house = store.get_house(house_id)
    if house is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house not found")

    apartments, effective_apt_id = _apartments_for_analytics(user, house_id, apartment_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no apartments found")

    if len(apartments) == 1:
        scope_name = f"Apartment {apartments[0].id}"
    else:
        scope_name = house.name

    electricity_24h: list[float] = []
    water_24h: list[float] = []
    co2_24h: list[float] = []
    for h in range(24):
        electricity_24h.append(round(sum(apt.electricity_daily[h] for apt in apartments), 2))
        water_24h.append(round(sum(apt.water_daily[h] for apt in apartments), 2))
        raw_co2 = [apt.co2_series[h] for apt in apartments if apt.co2_series]
        co2_24h.append(round(sum(raw_co2) / len(raw_co2), 1) if raw_co2 else 0.0)

    api_key = groq_client._load_api_key()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service unavailable")

    # Also send raw metrics as SSE preamble so frontend can draw charts immediately
    metrics_event = (
        "event: metrics\n"
        f"data: {_json.dumps({'electricity_24h': electricity_24h, 'water_24h': water_24h, 'co2_24h': co2_24h})}\n\n"
    )
    scope_key = f"{house_id}:{effective_apt_id or 'all'}"
    metrics_signature = _json.dumps(
        {"electricity_24h": electricity_24h, "water_24h": water_24h, "co2_24h": co2_24h},
        sort_keys=True,
    )

    def generate():
        yield metrics_event
        cached = _analytics_reasoning_cache.get(scope_key)
        cached_reasoning = cached.get("reasoning") if cached else None
        cached_signature = cached.get("metrics_signature") if cached else None
        if (
            cached
            and not force_refresh
            and cached_signature == metrics_signature
            and isinstance(cached_reasoning, dict)
        ):
            logger.info("resource_stream_cache_hit scope=%s", scope_key)
            yield f"event: structured\ndata: {_json.dumps(cached_reasoning)}\n\n"
            yield "data: [DONE]\n\n"
            return

        buf: list[str] = []
        for token in groq_client.stream_resource_analysis(
            electricity_24h=electricity_24h,
            water_24h=water_24h,
            co2_24h=co2_24h,
            scope_name=scope_name,
            api_key=api_key,
        ):
            buf.append(token)
            yield f"data: {_json.dumps({'token': token})}\n\n"
        # After stream ends, try to parse the full JSON and emit structured event
        full_text = "".join(buf)
        cleaned = groq_client._clean_ai_response(full_text)
        try:
            parsed = _json.loads(cleaned)
            _analytics_reasoning_cache[scope_key] = {
                "reasoning": parsed,
                "metrics_signature": metrics_signature,
            }
            _save_analytics_cache()
            yield f"event: structured\ndata: {_json.dumps(parsed)}\n\n"
        except Exception:
            pass
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ---------------------------------------------------------------------------
# Chat stream
# ---------------------------------------------------------------------------

class _ChatMsg(BaseModel):
    role: str
    content: str


class _ChatRequest(BaseModel):
    messages: list[_ChatMsg]
    max_tokens: int = 1024
    temperature: float = 0.7


@router.post("/chat/stream")
def chat_stream(
    payload: _ChatRequest,
    user: dict[str, str] = Depends(get_current_user),
) -> StreamingResponse:
    """Proxy a Groq streaming chat completion through the backend.

    The mobile app cannot use response.body.getReader() (Web Streams not supported in
    React Native fetch). By routing through here we also keep the API key server-side.

    SSE events emitted:
      data: {"token": "..."}
      data: [DONE]
      data: {"error": "..."}
    """
    api_key = groq_client._load_api_key()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI service unavailable")

    import httpx as _httpx

    messages_payload = [{"role": m.role, "content": m.content} for m in payload.messages]

    def _generate():
        try:
            with _httpx.Client(timeout=90.0) as client:
                with client.stream(
                    "POST",
                    groq_client.GROQ_API_URL,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": groq_client.GROQ_MODEL,
                        "messages": messages_payload,
                        "stream": True,
                        "max_tokens": payload.max_tokens,
                        "temperature": payload.temperature,
                    },
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:].strip()
                        if data == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            chunk = _json.loads(data)
                            token = (chunk.get("choices") or [{}])[0].get("delta", {}).get("content", "")
                            if token:
                                yield f"data: {_json.dumps({'token': token})}\n\n"
                        except (ValueError, KeyError):
                            continue
        except Exception as exc:
            logger.error("chat_stream_error user=%s error=%s", user.get("id"), exc)
            yield f"data: {_json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/tickets/{ticket_id}/nearby-services", response_model=NearbyServicesResponse)
def get_ticket_nearby_services(
    ticket_id: str,
    radius_m: int = Query(default=2500, ge=500, le=10000),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> NearbyServicesResponse:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")

    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    if user["role"] == "Resident" and user["id"] != ticket.resident_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    house = store.get_house(ticket.house_id)

    text_queries = gemini_client.resolve_service_search_queries(
        ticket.subject, ticket.description or ""
    )
    complaint_tags = ticket.complaint_types if ticket.complaint_types else ([ticket.complaint_type] if ticket.complaint_type else [])
    service_types = _resolve_escalation_services(complaint_tags, ticket.incident_time) if complaint_tags else []

    if not text_queries and not service_types:
        return NearbyServicesResponse(services=[], search_query="ЖКХ")

    # Use browser-provided coordinates if available, otherwise geocode the building address
    coordinates: tuple[float, float] | None = None
    if lat is not None and lon is not None:
        coordinates = (lat, lon)
        logger.info(
            "ticket_geo_using_client_coords ticket_id=%s lat=%.5f lon=%.5f",
            ticket_id,
            lat,
            lon,
        )
    else:
        if house is None:
            sq = text_queries[0] if text_queries else _service_type_to_search_query(service_types)
            return NearbyServicesResponse(services=[], search_query=sq)
        coordinates = geocode_address(house.address)
        if not coordinates:
            logger.warning(
                "ticket_geo_lookup_failed reason=address_not_geocoded ticket_id=%s house_id=%s address=%r",
                ticket.id,
                ticket.house_id,
                house.address,
            )
            sq = text_queries[0] if text_queries else _service_type_to_search_query(service_types)
            return NearbyServicesResponse(services=[], search_query=sq)

    search_lat, search_lon = coordinates
    try:
        services = find_nearby(
            search_lat, search_lon, service_types, radius_m=radius_m, text_queries=text_queries or None
        )
        search_query = (text_queries[0] if text_queries else None) or _service_type_to_search_query(service_types)
        return NearbyServicesResponse(
            services=[NearbyService(**item) for item in services],
            center_lat=search_lat,
            center_lon=search_lon,
            search_query=search_query,
        )
    except Exception as exc:
        logger.exception("nearby_services_error ticket_id=%s error=%s", ticket_id, exc)
        return NearbyServicesResponse(
            services=[],
            center_lat=search_lat,
            center_lon=search_lon,
            search_query=(text_queries[0] if text_queries else None) or _service_type_to_search_query(service_types),
        )


@router.patch("/tickets/{ticket_id}", response_model=Ticket)
def update_ticket(
    ticket_id: str,
    payload: TicketUpdate,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Ticket:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] != "Manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only manager can update ticket status")
    updated = store.update_ticket_status(
        ticket_id,
        status=payload.status or ticket.status,
        viewed_at=store.now_utc() if payload.status == "viewing" else ticket.viewed_at,
        decision=payload.decision,
        db=db,
    )
    return updated or ticket


@router.post("/tickets/{ticket_id}/view", response_model=Ticket)
def view_ticket(
    ticket_id: str,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Ticket:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] != "Manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only manager can mark as viewing")
    updated = store.update_ticket_status(ticket_id, status="viewing", viewed_at=store.now_utc(), db=db)
    return updated or ticket


@router.post("/tickets/{ticket_id}/follow-ups", response_model=Ticket)
def add_ticket_follow_up(
    ticket_id: str,
    payload: TicketFollowUpCreate,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> Ticket:
    ticket = store.get_ticket(ticket_id, db=db)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] == "Resident" and user["id"] != ticket.resident_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    updated = store.add_follow_up(
        ticket_id,
        author_id=user["id"],
        author_name=user["full_name"],
        author_role=user["role"],
        text=payload.text,
        db=db,
    )
    return updated or ticket


# ── Eco Quests (Resident only) ────────────────────────────────────────────────────

ECO_QUEST_IDS = ["eq-1", "eq-2", "eq-3", "eq-4", "eq-5", "eq-6", "eq-7"]
ECO_QUEST_POINTS = {"eq-1": 10, "eq-2": 15, "eq-3": 20, "eq-4": 12, "eq-5": 25, "eq-6": 12, "eq-7": 18}


def _require_resident(user: dict[str, str]):
    if user.get("role") != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Eco Quests are for residents only")


@router.post("/eco-quests/complete", response_model=EcoQuestStatusResponse)
def eco_quest_complete(
    payload: EcoQuestCompleteRequest,
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> EcoQuestStatusResponse:
    _require_resident(user)
    if db is None:
        raise HTTPException(status_code=503, detail="database unavailable")
    if payload.quest_id not in ECO_QUEST_IDS:
        raise HTTPException(status_code=400, detail="invalid quest_id")

    from src.housing.models_db import EcoQuestCompletionModel

    photo_data = payload.photo_base64
    if photo_data.startswith("data:"):
        photo_data = photo_data.split(",", 1)[-1] if "," in photo_data else ""
    if len(photo_data) > 500_000:
        raise HTTPException(status_code=400, detail="photo too large")

    now = datetime.now(timezone.utc)
    rec = EcoQuestCompletionModel(
        id=str(uuid4()),
        user_id=user["id"],
        quest_id=payload.quest_id,
        completed_at=now,
        photo_data=photo_data,
    )
    db.add(rec)
    db.commit()

    today_str = now.strftime("%Y-%m-%d")
    completions = (
        db.query(EcoQuestCompletionModel)
        .filter(
            EcoQuestCompletionModel.user_id == user["id"],
            EcoQuestCompletionModel.completed_at >= datetime.strptime(today_str, "%Y-%m-%d").replace(tzinfo=timezone.utc),
            EcoQuestCompletionModel.completed_at < datetime.strptime(today_str, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1),
        )
        .all()
    )
    completed_ids = list({c.quest_id for c in completions})
    total_points = sum(ECO_QUEST_POINTS.get(q, 0) for q in completed_ids)
    return EcoQuestStatusResponse(completed=completed_ids, completed_count=len(completed_ids), total_points=total_points)


@router.get("/eco-quests/status", response_model=EcoQuestStatusResponse)
def eco_quest_status(
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> EcoQuestStatusResponse:
    _require_resident(user)
    if db is None:
        return EcoQuestStatusResponse(completed=[], completed_count=0, total_points=0)

    from src.housing.models_db import EcoQuestCompletionModel

    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    completions = (
        db.query(EcoQuestCompletionModel)
        .filter(
            EcoQuestCompletionModel.user_id == user["id"],
            EcoQuestCompletionModel.completed_at >= start,
            EcoQuestCompletionModel.completed_at < end,
        )
        .all()
    )
    completed_ids = list({c.quest_id for c in completions})
    total_points = sum(ECO_QUEST_POINTS.get(q, 0) for q in completed_ids)
    return EcoQuestStatusResponse(completed=completed_ids, completed_count=len(completed_ids), total_points=total_points)


def _first_of_month_n_ago(today, n: int):
    """First day of the month, n months ago."""
    year, month = today.year, today.month
    month -= n
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1, tzinfo=timezone.utc).date()


@router.get("/eco-quests/activity", response_model=EcoQuestActivityResponse)
def eco_quest_activity(
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> EcoQuestActivityResponse:
    _require_resident(user)
    if db is None:
        return EcoQuestActivityResponse(days=[])

    from src.housing.models_db import EcoQuestCompletionModel

    today = datetime.now(timezone.utc).date()
    start = _first_of_month_n_ago(today, 2)
    completions = (
        db.query(EcoQuestCompletionModel.quest_id, EcoQuestCompletionModel.completed_at)
        .filter(
            EcoQuestCompletionModel.user_id == user["id"],
            EcoQuestCompletionModel.completed_at >= datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc),
        )
        .all()
    )
    by_date: dict[str, set[str]] = {}
    for qid, completed_at in completions:
        ds = completed_at.strftime("%Y-%m-%d") if hasattr(completed_at, "strftime") else str(completed_at)[:10]
        if ds not in by_date:
            by_date[ds] = set()
        by_date[ds].add(qid)
    days_list: list[EcoQuestActivityDay] = []
    d = start
    while d <= today:
        ds = d.strftime("%Y-%m-%d")
        cnt = len(by_date.get(ds, set()))
        if cnt == 0:
            level = 0
        elif cnt <= 2:
            level = 1
        elif cnt <= 4:
            level = 2
        elif cnt <= 6:
            level = 3
        else:
            level = 4
        days_list.append(EcoQuestActivityDay(date=ds, level=level))
        d += timedelta(days=1)
    return EcoQuestActivityResponse(days=days_list)


@router.get("/eco-quests/streak", response_model=EcoQuestStreakResponse)
def eco_quest_streak(
    user: dict[str, str] = Depends(get_current_user),
    db=Depends(get_housing_db),
) -> EcoQuestStreakResponse:
    _require_resident(user)
    if db is None:
        return EcoQuestStreakResponse(current_streak=0, last_activity_date=None)

    from src.housing.models_db import EcoQuestCompletionModel

    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today - timedelta(days=364), datetime.min.time()).replace(tzinfo=timezone.utc)
    completions = (
        db.query(EcoQuestCompletionModel.quest_id, EcoQuestCompletionModel.completed_at)
        .filter(
            EcoQuestCompletionModel.user_id == user["id"],
            EcoQuestCompletionModel.completed_at >= start,
        )
        .all()
    )
    by_date: dict[str, set[str]] = {}
    for qid, completed_at in completions:
        ds = completed_at.strftime("%Y-%m-%d") if hasattr(completed_at, "strftime") else str(completed_at)[:10]
        if ds not in by_date:
            by_date[ds] = set()
        by_date[ds].add(qid)

    # Streak = consecutive days (from today backwards) with all 7 tasks done. 1 day skipped = reset.
    streak = 0
    last_date = None
    streak_break_date: str | None = None
    streak_break_count: int | None = None
    for i in range(365):
        d = today - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        cnt = len(by_date.get(ds, set()))
        if cnt >= 7:
            streak += 1
            if last_date is None:
                last_date = ds
        else:
            streak_break_date = ds
            streak_break_count = cnt
            break
    return EcoQuestStreakResponse(
        current_streak=streak,
        last_activity_date=last_date,
        streak_break_date=streak_break_date,
        streak_break_count=streak_break_count,
    )
