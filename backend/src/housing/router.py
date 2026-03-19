from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from src.housing import store, web3
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
from src.housing.security import get_current_user, issue_tokens_for_user, require_manager, verify_refresh_token_and_get_user


router = APIRouter()


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
def list_tasks(house_id: str | None = Query(default=None), user: dict[str, str] = Depends(get_current_user)) -> list[Task]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    return store.list_tasks(target_house)


@router.post("/tasks", response_model=Task, status_code=201)
def create_task(payload: CreateTaskRequest, user: dict[str, str] = Depends(require_manager)) -> Task:
    house_id = payload.house_id or user["house_id"]
    _assert_house_access(user, house_id)
    return store.create_task(
        title=payload.title,
        description=payload.description,
        building=payload.building,
        category=payload.category,
        priority=payload.priority,
        due_time=payload.due_time,
        house_id=house_id,
    )


@router.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, payload: UpdateTaskRequest, user: dict[str, str] = Depends(get_current_user)) -> Task:
    task = store.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    if task.house_id != "all" and task.house_id != user["house_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this task")

    updated = store.update_task(
        task_id,
        status=payload.status,
        title=payload.title,
        description=payload.description,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    return updated


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task_route(task_id: str, user: dict[str, str] = Depends(require_manager)) -> Response:
    task = store.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    if task.house_id != "all" and task.house_id != user["house_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden for this task")
    store.delete_task(task_id)
    return Response(status_code=204)


# ── Tickets ───────────────────────────────────────────────────────────────────
@router.post("/tickets", response_model=Ticket, status_code=201)
def create_ticket(payload: TicketCreate, user: dict[str, str] = Depends(get_current_user)) -> Ticket:
    if user["role"] != "Resident":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only residents can create tickets")
    apt_id = user.get("apartment_id") or ""
    if not apt_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resident has no apartment")
    return store.create_ticket(
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
    )


@router.get("/tickets", response_model=list[Ticket])
def list_tickets(
    house_id: str | None = Query(default=None),
    user: dict[str, str] = Depends(get_current_user),
) -> list[Ticket]:
    target_house = house_id or user["house_id"]
    _assert_house_access(user, target_house)
    if user["role"] == "Manager":
        return store.list_tickets_for_manager(target_house)
    return store.list_tickets_for_resident(user["id"])


@router.get("/tickets/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: str, user: dict[str, str] = Depends(get_current_user)) -> Ticket:
    ticket = store.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] == "Resident" and user["id"] != ticket.resident_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return ticket


@router.patch("/tickets/{ticket_id}", response_model=Ticket)
def update_ticket(ticket_id: str, payload: TicketUpdate, user: dict[str, str] = Depends(get_current_user)) -> Ticket:
    ticket = store.get_ticket(ticket_id)
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
    )
    return updated or ticket


@router.post("/tickets/{ticket_id}/view", response_model=Ticket)
def view_ticket(ticket_id: str, user: dict[str, str] = Depends(get_current_user)) -> Ticket:
    ticket = store.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket not found")
    if user["house_id"] != ticket.house_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    if user["role"] != "Manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only manager can mark as viewing")
    updated = store.update_ticket_status(ticket_id, status="viewing", viewed_at=store.now_utc())
    return updated or ticket


@router.post("/tickets/{ticket_id}/follow-ups", response_model=Ticket)
def add_ticket_follow_up(
    ticket_id: str,
    payload: TicketFollowUpCreate,
    user: dict[str, str] = Depends(get_current_user),
) -> Ticket:
    ticket = store.get_ticket(ticket_id)
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
    )
    return updated or ticket
