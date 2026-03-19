from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import uuid4

from src.housing.schemas import (
    Apartment,
    House,
    ManagerActionProof,
    MeterHealth,
    ReportAnchor,
    ResourceAlert,
    RoleName,
    Task,
    UserProfile,
    Organization,
    Membership,
    Ticket,
    TicketAttachment,
    TicketFollowUp,
)
from src.utils.auth_utils import hash_password, verify_password

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


_houses: dict[str, House] = {
    "house-1": House(id="house-1", name="Maple Residence", address="12 Maple Street", units_count=42, occupancy_rate=94, manager="Olivia Smith"),
    "house-2": House(id="house-2", name="River Park", address="88 River Avenue", units_count=60, occupancy_rate=89, manager="Lucas Martin"),
    "house-3": House(id="house-3", name="Oak Gardens", address="31 Oak Lane", units_count=28, occupancy_rate=96, manager="Emma Wilson"),
}

_alerts: list[ResourceAlert] = [
    ResourceAlert(id="a-1", house_id="house-1", house_name="Maple Residence", resource="gas", severity="high", title="Unexpected night-time gas usage spike", detected_at="10:14"),
    ResourceAlert(id="a-2", house_id="house-1", house_name="Maple Residence", resource="water", severity="medium", title="Persistent leak pattern in section B", detected_at="09:02"),
    ResourceAlert(id="a-3", house_id="house-2", house_name="River Park", resource="electricity", severity="low", title="Elevator power draw above baseline", detected_at="07:48"),
]

_meters: list[MeterHealth] = [
    MeterHealth(id="m-1", house_id="house-1", house_name="Maple Residence", resource="electricity", signal_strength="good", last_sync="2 min ago"),
    MeterHealth(id="m-2", house_id="house-1", house_name="Maple Residence", resource="water", signal_strength="weak", last_sync="9 min ago"),
    MeterHealth(id="m-3", house_id="house-2", house_name="River Park", resource="gas", signal_strength="offline", last_sync="53 min ago"),
    MeterHealth(id="m-4", house_id="house-3", house_name="Oak Gardens", resource="heating", signal_strength="good", last_sync="1 min ago"),
]

_apartments: dict[str, Apartment] = {}
_report_anchors: list[ReportAnchor] = []
_manager_action_proofs: list[ManagerActionProof] = []
_tasks: list[Task] = []
_tickets: list[dict] = []


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _status_from_score(score: int) -> str:
    if score >= 80:
        return "good"
    if score >= 60:
        return "watch"
    return "alert"


def _generate_apartment(house_id: str, floor: int, unit: int) -> Apartment:
    seed = floor * 1000 + unit * 37
    rng = random.Random(seed)
    number = f"{floor}{unit:02d}"
    apt_id = f"apt-{number}"

    base_power = rng.uniform(1.4, 2.8)
    base_water = rng.uniform(18, 42)

    electricity_daily = [round(_clamp(base_power + rng.uniform(-0.35, 0.35) + (0.8 if h in {7, 19} else 0), 0.4, 7.5), 2) for h in range(24)]
    water_daily = [round(_clamp(base_water + rng.uniform(-6.5, 6.5) + (8 if h in {7, 20} else 0), 5, 80), 2) for h in range(24)]
    co2_series = [int(_clamp(530 + rng.uniform(-80, 80) + (130 if h in {18, 20} else 0), 420, 1100)) for h in range(24)]
    humidity_series = [int(_clamp(45 + rng.uniform(-8, 8), 30, 68)) for _ in range(24)]

    electricity_monthly = [round(base_power * 20 + rng.uniform(-4, 5), 2) for _ in range(30)]
    water_monthly = [round(base_water * 3.5 + rng.uniform(-8, 9), 2) for _ in range(30)]

    anomalies: list[str] = []
    anomaly_roll = rng.random()
    if anomaly_roll > 0.45:
        anomalies.append("Unusual electricity spike at 19:00")
    if anomaly_roll < 0.55:
        anomalies.append("Possible water leak at 07:00")
    if 0.25 < anomaly_roll < 0.72:
        anomalies.append("CO2 comfort drop detected at 18:00")

    score_value = int(round(100 - sum(electricity_daily) * 0.85 - sum(water_daily) * 0.06 + rng.uniform(8, 16)))
    score = int(_clamp(score_value, 48, 97))

    return Apartment(
        id=apt_id,
        house_id=house_id,
        floor=floor,
        unit=unit,
        number=number,
        score=score,
        status=_status_from_score(score),  # type: ignore[arg-type]
        electricity_daily=electricity_daily,
        water_daily=water_daily,
        electricity_monthly=electricity_monthly,
        water_monthly=water_monthly,
        co2_series=co2_series,
        humidity_series=humidity_series,
        anomalies=anomalies,
        savings=int(rng.uniform(9, 24)),
    )


def _seed_apartments() -> None:
    if _apartments:
        return
    for floor in range(12, 0, -1):
        for unit in range(1, 9):
            apt = _generate_apartment("house-1", floor, unit)
            _apartments[apt.id] = apt


_users_by_email: dict[str, dict[str, str]] = {
    "manager@resmonitor.kz": {
        "id": "user-manager-1",
        "email": "manager@resmonitor.kz",
        "password_hash": hash_password("manager123"),
        "full_name": "Olivia Smith",
        "role": "Manager",
        "house_id": "house-1",
        "apartment_id": "",
        "refresh_token": "",
    },
    "resident@resmonitor.kz": {
        "id": "user-resident-1",
        "email": "resident@resmonitor.kz",
        "password_hash": hash_password("resident123"),
        "full_name": "Alex Johnson",
        "role": "Resident",
        "house_id": "house-1",
        "apartment_id": "apt-804",
        "refresh_token": "",
    },
    "resident2@resmonitor.kz": {
        "id": "user-resident-2",
        "email": "resident2@resmonitor.kz",
        "password_hash": hash_password("resident123"),
        "full_name": "Maria Petrova",
        "role": "Resident",
        "house_id": "house-1",
        "apartment_id": "apt-502",
        "refresh_token": "",
    },
}

_users_by_id: dict[str, dict[str, str]] = {item["id"]: item for item in _users_by_email.values()}


def make_profile(user: dict[str, str]) -> UserProfile:
    house = _houses[user["house_id"]]
    apt_id = user.get("apartment_id") or None
    if apt_id == "":
        apt_id = None
    return UserProfile(
        id=user["id"],
        email=user["email"],
        full_name=user["full_name"],
        organizations=[Organization(id=house.id, name=house.name)],
        memberships=[Membership(organization_id=house.id, organization_name=house.name, role=user["role"])],
        apartment_id=apt_id,
    )


def get_user_by_email(email: str) -> dict[str, str] | None:
    return _users_by_email.get(email.lower().strip())


def get_user_by_id(user_id: str) -> dict[str, str] | None:
    return _users_by_id.get(user_id)


def create_user(email: str, password: str, full_name: str, role: RoleName) -> dict[str, str]:
    normalized = email.lower().strip()
    if normalized in _users_by_email:
        raise ValueError("email already registered")

    new_user = {
        "id": f"user-{uuid4().hex[:12]}",
        "email": normalized,
        "password_hash": hash_password(password),
        "full_name": full_name.strip(),
        "role": role,
        "house_id": "house-1",
        "apartment_id": "apt-801" if role == "Resident" else "",
        "refresh_token": "",
    }
    _users_by_email[normalized] = new_user
    _users_by_id[new_user["id"]] = new_user
    return new_user


def verify_user_password(user: dict[str, str], password: str) -> bool:
    return verify_password(password, user["password_hash"])


def set_refresh_token(user_id: str, refresh_token: str) -> None:
    user = _users_by_id[user_id]
    user["refresh_token"] = refresh_token


def get_houses_for_user(user: dict[str, str]) -> list[House]:
    house = _houses.get(user["house_id"])
    return [house] if house else []


def get_house(house_id: str) -> House | None:
    return _houses.get(house_id)


def get_apartment(apartment_id: str) -> Apartment | None:
    _seed_apartments()
    return _apartments.get(apartment_id)


def list_apartments(house_id: str) -> list[Apartment]:
    _seed_apartments()
    items = [item for item in _apartments.values() if item.house_id == house_id]
    return sorted(items, key=lambda item: (-item.floor, -item.unit))


def list_alerts(house_id: str) -> list[ResourceAlert]:
    return [item for item in _alerts if item.house_id == house_id]


def list_meters(house_id: str) -> list[MeterHealth]:
    return [item for item in _meters if item.house_id == house_id]


def compute_hash(payload: dict) -> str:
    digest = hashlib.sha256(str(payload).encode("utf-8")).hexdigest()
    return f"0x{digest}"


def find_report_anchor(house_id: str, period: str, report_hash: str) -> ReportAnchor | None:
    for item in _report_anchors:
        if item.house_id == house_id and item.period == period and item.report_hash == report_hash:
            return item
    return None


def add_report_anchor(anchor: ReportAnchor) -> ReportAnchor:
    _report_anchors.append(anchor)
    return anchor


def list_report_anchors(house_id: str) -> list[ReportAnchor]:
    return sorted([item for item in _report_anchors if item.house_id == house_id], key=lambda item: item.created_at, reverse=True)


def find_action_proof(house_id: str, action_hash: str) -> ManagerActionProof | None:
    for item in _manager_action_proofs:
        if item.house_id == house_id and item.action_hash == action_hash:
            return item
    return None


def add_action_proof(proof: ManagerActionProof) -> ManagerActionProof:
    _manager_action_proofs.append(proof)
    return proof


def list_action_proofs(house_id: str) -> list[ManagerActionProof]:
    return sorted([item for item in _manager_action_proofs if item.house_id == house_id], key=lambda item: item.created_at, reverse=True)


def _resolve_house_id(building: str) -> str:
    for house in _houses.values():
        if house.name == building:
            return house.id
    return "house-1"


def _seed_tasks() -> None:
    if _tasks:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    seed_data = [
        ("t-1", "Morning meter readings check", "Verify all electricity and water meters.", "Maple Residence", "meter", "high", "todo", "09:00"),
        ("t-2", "Inspect gas valve — Section C", "Scheduled inspection of gas collector valve.", "River Park", "inspection", "critical", "todo", "10:30"),
        ("t-3", "Respond to water leak complaint", "Apt 502 reported damp spots. Coordinate plumber.", "Maple Residence", "complaint", "high", "todo", "11:00"),
        ("t-4", "Replace water meter — Block B", "The water meter m-2 has weak signal. Replace.", "Maple Residence", "repair", "medium", "in_progress", "13:00"),
        ("t-5", "Calibrate heating sensors", "Annual calibration of heating sensor array.", "Oak Gardens", "meter", "medium", "in_progress", "14:00"),
        ("t-6", "Review weekly consumption report", "Compile and review aggregated consumption data.", "All buildings", "report", "low", "todo", "16:00"),
        ("t-7", "Upload daily manager summary", "Publish short daily summary.", "Maple Residence", "report", "medium", "todo", "15:00"),
        ("t-8", "Update elevator power baseline", "Recalculate after last week's alert.", "Oak Gardens", "report", "low", "done", "08:00"),
        ("t-9", "Morning building walkthrough", "Visual inspection of common areas.", "River Park", "inspection", "low", "done", "07:30"),
    ]
    for tid, title, desc, building, cat, prio, st, due in seed_data:
        hid = "all" if building == "All buildings" else _resolve_house_id(building)
        apt = "apt-502" if "502" in desc else None
        _tasks.append(Task(
            id=tid,
            title=title,
            description=desc,
            building=building,
            house_id=hid,
            category=cat,
            priority=prio,
            status=st,
            due_time=due,
            apartment=apt,
            ai_comment=None,
            source_ticket_id=None,
            complaint_type="water" if "water" in desc.lower() else None,
            created_at=today,
        ))


def list_tasks(house_id: str, db: "Session | None" = None) -> list[Task]:
    if db is not None:
        from src.housing import store_db
        return store_db.list_tasks_db(db, house_id)
    _seed_tasks()
    return [t for t in _tasks if t.house_id == house_id or t.house_id == "all"]


def get_task(task_id: str, db: "Session | None" = None) -> Task | None:
    if db is not None:
        from src.housing import store_db
        return store_db.get_task_db(db, task_id)
    _seed_tasks()
    for t in _tasks:
        if t.id == task_id:
            return t
    return None


def create_task(
    title: str,
    description: str,
    building: str,
    category: str,
    priority: str,
    due_time: str,
    house_id: str,
    apartment: str | None = None,
    ai_comment: str | None = None,
    source_ticket_id: str | None = None,
    complaint_type: str | None = None,
    db: "Session | None" = None,
) -> Task:
    if db is not None:
        from src.housing import store_db
        hid = house_id or _resolve_house_id(building)
        if building == "All buildings":
            hid = "all"
        return store_db.create_task_db(
            db, title, description, building, category, priority, due_time, hid,
            apartment=apartment, ai_comment=ai_comment, source_ticket_id=source_ticket_id, complaint_type=complaint_type,
        )
    _seed_tasks()
    hid = house_id or _resolve_house_id(building)
    if building == "All buildings":
        hid = "all"
    task = Task(
        id=f"t-{uuid4().hex[:8]}",
        title=title,
        description=description,
        building=building,
        house_id=hid,
        category=category,
        priority=priority,
        status="todo",
        due_time=due_time,
        apartment=apartment,
        ai_comment=ai_comment,
        source_ticket_id=source_ticket_id,
        complaint_type=complaint_type,
        created_at=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    _tasks.append(task)
    return task


def update_task(
    task_id: str,
    *,
    status: str | None = None,
    title: str | None = None,
    description: str | None = None,
    db: "Session | None" = None,
) -> Task | None:
    if db is not None:
        from src.housing import store_db
        return store_db.update_task_db(db, task_id, status=status, title=title, description=description)
    task = get_task(task_id)
    if not task:
        return None
    idx = next((i for i, t in enumerate(_tasks) if t.id == task_id), None)
    if idx is None:
        return None
    data = task.model_dump()
    if status is not None:
        data["status"] = status
    if title is not None:
        data["title"] = title
    if description is not None:
        data["description"] = description
    _tasks[idx] = Task(**data)
    return _tasks[idx]


def delete_task(task_id: str, db: "Session | None" = None) -> bool:
    if db is not None:
        from src.housing import store_db
        return store_db.delete_task_db(db, task_id)
    global _tasks
    _seed_tasks()
    for i, t in enumerate(_tasks):
        if t.id == task_id:
            _tasks.pop(i)
            return True
    return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── Tickets ───────────────────────────────────────────────────────────────────
def create_ticket(
    house_id: str,
    resident_id: str,
    resident_name: str,
    resident_email: str,
    apartment_id: str,
    subject: str,
    description: str,
    incident_date: str,
    incident_time: str,
    attachments: list[TicketAttachment],
    complaint_type: str | None = None,
    db: "Session | None" = None,
) -> Ticket:
    if db is not None:
        from src.housing import store_db
        return store_db.create_ticket_db(
            db, house_id, resident_id, resident_name, resident_email, apartment_id,
            subject, description, incident_date, incident_time, attachments, complaint_type=complaint_type,
        )
    now = now_utc()
    ticket_id = f"ticket-{uuid4().hex[:12]}"
    ticket = {
        "id": ticket_id,
        "house_id": house_id,
        "resident_id": resident_id,
        "resident_name": resident_name,
        "resident_email": resident_email,
        "apartment_id": apartment_id,
        "subject": subject,
        "description": description,
        "incident_date": incident_date,
        "incident_time": incident_time,
        "attachments": [a.model_dump() for a in attachments],
        "status": "sent",
        "follow_ups": [],
        "created_at": now,
        "updated_at": now,
        "viewed_at": None,
        "decision": None,
        "complaint_type": complaint_type,
    }
    _tickets.append(ticket)
    return Ticket(**ticket)


def get_ticket(ticket_id: str, db: "Session | None" = None) -> Ticket | None:
    if db is not None:
        from src.housing import store_db
        return store_db.get_ticket_db(db, ticket_id)
    for t in _tickets:
        if t["id"] == ticket_id:
            return Ticket(**t)
    return None


def list_tickets_for_resident(resident_id: str, db: "Session | None" = None) -> list[Ticket]:
    if db is not None:
        from src.housing import store_db
        return store_db.list_tickets_for_resident_db(db, resident_id)
    items = [t for t in _tickets if t["resident_id"] == resident_id]
    return sorted([Ticket(**t) for t in items], key=lambda x: x.updated_at, reverse=True)


def list_tickets_for_manager(house_id: str, db: "Session | None" = None) -> list[Ticket]:
    if db is not None:
        from src.housing import store_db
        return store_db.list_tickets_for_manager_db(db, house_id)
    items = [t for t in _tickets if t["house_id"] == house_id]
    return sorted([Ticket(**t) for t in items], key=lambda x: x.updated_at, reverse=True)


def add_follow_up(
    ticket_id: str,
    author_id: str,
    author_name: str,
    author_role: str,
    text: str,
    db: "Session | None" = None,
) -> Ticket | None:
    if db is not None:
        from src.housing import store_db
        return store_db.add_follow_up_db(db, ticket_id, author_id, author_name, author_role, text)
    for t in _tickets:
        if t["id"] == ticket_id:
            now = now_utc()
            fu = {
                "id": f"fu-{uuid4().hex[:8]}",
                "text": text,
                "author_id": author_id,
                "author_name": author_name,
                "author_role": author_role,
                "created_at": now,
            }
            t["follow_ups"].append(fu)
            t["updated_at"] = now
            return Ticket(**t)
    return None


def update_ticket_status(
    ticket_id: str,
    status: str,
    viewed_at: datetime | None = None,
    decision: str | None = None,
    db: "Session | None" = None,
) -> Ticket | None:
    if db is not None:
        from src.housing import store_db
        return store_db.update_ticket_status_db(db, ticket_id, status, viewed_at=viewed_at, decision=decision)
    for t in _tickets:
        if t["id"] == ticket_id:
            t["status"] = status
            t["updated_at"] = now_utc()
            if viewed_at is not None:
                t["viewed_at"] = viewed_at
            if decision is not None:
                t["decision"] = decision
            return Ticket(**t)
    return None
