"""PostgreSQL-backed store operations for tasks and tickets."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from src.housing.models_db import HousingTaskModel, HousingTicketFollowUpModel, HousingTicketModel
from src.housing.schemas import Task, Ticket, TicketAttachment, TicketFollowUp, _parse_complaint_types


def _task_from_row(m: HousingTaskModel) -> Task:
    tags = _parse_complaint_types(m.complaint_type)
    primary = tags[0] if tags else None
    return Task(
        id=m.id,
        title=m.title,
        description=m.description,
        building=m.building,
        house_id=m.house_id,
        category=m.category,
        priority=m.priority,
        status=m.status,
        due_time=m.due_time,
        apartment=m.apartment,
        ai_comment=m.ai_comment,
        source_ticket_id=m.source_ticket_id,
        complaint_type=primary,
        complaint_types=tags,
        created_at=m.created_at,
    )


def _ticket_from_row(m: HousingTicketModel) -> Ticket:
    follow_ups = [
        TicketFollowUp(
            id=fu.id,
            text=fu.text,
            author_id=fu.author_id,
            author_name=fu.author_name,
            author_role=fu.author_role,
            created_at=fu.created_at,
        )
        for fu in m.follow_ups
    ]
    attachments = [TicketAttachment(name=a.get("name", ""), url=a.get("url")) for a in (m.attachments or [])]
    tags = _parse_complaint_types(m.complaint_type)
    primary = tags[0] if tags else None
    return Ticket(
        id=m.id,
        house_id=m.house_id,
        resident_id=m.resident_id,
        resident_name=m.resident_name,
        resident_email=m.resident_email,
        apartment_id=m.apartment_id,
        subject=m.subject,
        description=m.description,
        incident_date=m.incident_date,
        incident_time=m.incident_time,
        attachments=attachments,
        status=m.status,
        follow_ups=follow_ups,
        created_at=m.created_at,
        updated_at=m.updated_at,
        viewed_at=m.viewed_at,
        decision=m.decision,
        complaint_type=primary,
        complaint_types=tags,
    )


def list_tasks_db(db: Session, house_id: str) -> list[Task]:
    rows = db.query(HousingTaskModel).filter(
        (HousingTaskModel.house_id == house_id) | (HousingTaskModel.house_id == "all")
    ).all()
    return [_task_from_row(r) for r in rows]


def get_task_db(db: Session, task_id: str) -> Task | None:
    row = db.query(HousingTaskModel).filter(HousingTaskModel.id == task_id).first()
    return _task_from_row(row) if row else None


def get_task_by_source_ticket_id_db(db: Session, source_ticket_id: str) -> Task | None:
    row = db.query(HousingTaskModel).filter(HousingTaskModel.source_ticket_id == source_ticket_id).first()
    return _task_from_row(row) if row else None


def create_task_db(
    db: Session,
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
) -> Task:
    task_id = f"t-{uuid4().hex[:8]}"
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = HousingTaskModel(
        id=task_id,
        title=title,
        description=description,
        building=building,
        house_id=house_id,
        category=category,
        priority=priority,
        status="todo",
        due_time=due_time,
        apartment=apartment,
        ai_comment=ai_comment,
        source_ticket_id=source_ticket_id,
        complaint_type=complaint_type,
        created_at=created_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _task_from_row(row)


def update_task_db(
    db: Session,
    task_id: str,
    *,
    status: str | None = None,
    title: str | None = None,
    description: str | None = None,
) -> Task | None:
    row = db.query(HousingTaskModel).filter(HousingTaskModel.id == task_id).first()
    if not row:
        return None
    if status is not None:
        row.status = status
    if title is not None:
        row.title = title
    if description is not None:
        row.description = description
    db.commit()
    db.refresh(row)
    return _task_from_row(row)


def delete_task_db(db: Session, task_id: str) -> bool:
    row = db.query(HousingTaskModel).filter(HousingTaskModel.id == task_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def create_ticket_db(
    db: Session,
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
) -> Ticket:
    now = datetime.now(timezone.utc)
    ticket_id = f"ticket-{uuid4().hex[:12]}"
    att_data = [{"name": a.name, "url": a.url} for a in attachments]
    row = HousingTicketModel(
        id=ticket_id,
        house_id=house_id,
        resident_id=resident_id,
        resident_name=resident_name,
        resident_email=resident_email,
        apartment_id=apartment_id,
        subject=subject,
        description=description,
        incident_date=incident_date,
        incident_time=incident_time,
        attachments=att_data,
        status="sent",
        created_at=now,
        updated_at=now,
        viewed_at=None,
        decision=None,
        complaint_type=complaint_type,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _ticket_from_row(row)


def get_ticket_db(db: Session, ticket_id: str) -> Ticket | None:
    row = db.query(HousingTicketModel).filter(HousingTicketModel.id == ticket_id).first()
    return _ticket_from_row(row) if row else None


def list_tickets_for_resident_db(db: Session, resident_id: str) -> list[Ticket]:
    rows = db.query(HousingTicketModel).filter(HousingTicketModel.resident_id == resident_id).order_by(
        HousingTicketModel.updated_at.desc()
    ).all()
    return [_ticket_from_row(r) for r in rows]


def list_tickets_for_manager_db(db: Session, house_id: str) -> list[Ticket]:
    rows = db.query(HousingTicketModel).filter(HousingTicketModel.house_id == house_id).order_by(
        HousingTicketModel.updated_at.desc()
    ).all()
    return [_ticket_from_row(r) for r in rows]


def add_follow_up_db(
    db: Session,
    ticket_id: str,
    author_id: str,
    author_name: str,
    author_role: str,
    text: str,
) -> Ticket | None:
    row = db.query(HousingTicketModel).filter(HousingTicketModel.id == ticket_id).first()
    if not row:
        return None
    now = datetime.now(timezone.utc)
    fu = HousingTicketFollowUpModel(
        id=f"fu-{uuid4().hex[:8]}",
        ticket_id=ticket_id,
        text=text,
        author_id=author_id,
        author_name=author_name,
        author_role=author_role,
        created_at=now,
    )
    db.add(fu)
    row.updated_at = now
    db.commit()
    db.refresh(row)
    return _ticket_from_row(row)


def update_ticket_status_db(
    db: Session,
    ticket_id: str,
    status: str,
    viewed_at: datetime | None = None,
    decision: str | None = None,
) -> Ticket | None:
    row = db.query(HousingTicketModel).filter(HousingTicketModel.id == ticket_id).first()
    if not row:
        return None
    row.status = status
    row.updated_at = datetime.now(timezone.utc)
    if viewed_at is not None:
        row.viewed_at = viewed_at
    if decision is not None:
        row.decision = decision
    db.commit()
    db.refresh(row)
    return _ticket_from_row(row)


def delete_ticket_db(db: Session, ticket_id: str) -> bool:
    row = db.query(HousingTicketModel).filter(HousingTicketModel.id == ticket_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
