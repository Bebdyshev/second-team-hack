from __future__ import annotations

from datetime import datetime
from pathlib import Path
import logging
from uuid import uuid4

import json as _json

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
def house_apartments(house_id: str, user: dict[str, str] = Depends(require_manager)) -> list[Apartment]:
    _assert_house_access(user, house_id)
    return store.list_apartments(house_id)


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
    return store.list_alerts(target_house)


@router.get("/meters", response_model=list[MeterHealth])
def meters(house_id: str | None = Query(default=None), user: dict[str, str] = Depends(get_current_user)) -> list[MeterHealth]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    return store.list_meters(target_house)


@router.post("/houses/{house_id}/reports/anchor", response_model=ReportAnchor)
def anchor_report(
    house_id: str,
    payload: AnchorRequest,
    user: dict[str, str] = Depends(require_manager),
) -> ReportAnchor:
    _assert_house_access(user, house_id)
    period = payload.period or datetime.utcnow().strftime("%Y-%m")
    report_hash = payload.report_hash or store.compute_hash({"house_id": house_id, "period": period, "type": "monthly_report"})
    metadata_uri = payload.metadata_uri or f"report://{house_id}/{period}"

    existing = store.find_report_anchor(house_id, period, report_hash)
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
    return store.add_report_anchor(anchor)


@router.get("/houses/{house_id}/reports/anchors", response_model=list[ReportAnchor])
def report_anchors(house_id: str, user: dict[str, str] = Depends(get_current_user)) -> list[ReportAnchor]:
    _assert_house_access(user, house_id)
    return store.list_report_anchors(house_id)


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
    user: dict[str, str] = Depends(require_manager),
) -> dict:
    _assert_house_access(user, house_id)

    house = store.get_house(house_id)
    if house is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house not found")

    apartments = store.list_apartments(house_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no apartments found")

    # Aggregate hourly data across all apartments
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
    user: dict[str, str] = Depends(require_manager),
) -> StreamingResponse:
    _assert_house_access(user, house_id)

    house = store.get_house(house_id)
    if house is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="house not found")

    apartments = store.list_apartments(house_id)
    if not apartments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no apartments found")

    # If apartment_id is provided, filter to that single apartment
    if apartment_id:
        apartments = [a for a in apartments if a.id == apartment_id]
        if not apartments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="apartment not found")
        scope_name = f"Apartment {apartment_id}"
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
    scope_key = f"{house_id}:{apartment_id or 'all'}"
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
