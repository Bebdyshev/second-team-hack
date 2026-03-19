"""SQLAlchemy models for housing tasks and tickets (PostgreSQL)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class HousingTaskModel(Base):
    __tablename__ = "housing_tasks"

    id = Column(String(64), primary_key=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, default="")
    building = Column(String(128), nullable=False)
    house_id = Column(String(64), nullable=False)
    category = Column(String(32), nullable=False)
    priority = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)
    due_time = Column(String(16), nullable=False)
    apartment = Column(String(64), nullable=True)
    ai_comment = Column(Text, nullable=True)
    source_ticket_id = Column(String(64), nullable=True)
    complaint_type = Column(String(32), nullable=True)
    created_at = Column(String(16), nullable=False)


class HousingTicketModel(Base):
    __tablename__ = "housing_tickets"

    id = Column(String(64), primary_key=True)
    house_id = Column(String(64), nullable=False)
    resident_id = Column(String(64), nullable=False)
    resident_name = Column(String(256), nullable=False)
    resident_email = Column(String(256), nullable=False)
    apartment_id = Column(String(64), nullable=False)
    subject = Column(String(256), nullable=False)
    description = Column(Text, nullable=False)
    incident_date = Column(String(32), nullable=False)
    incident_time = Column(String(16), nullable=False)
    attachments = Column(JSON, default=list)  # list of {name, url}
    status = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    viewed_at = Column(DateTime(timezone=True), nullable=True)
    decision = Column(Text, nullable=True)
    complaint_type = Column(String(32), nullable=True)

    follow_ups = relationship("HousingTicketFollowUpModel", back_populates="ticket", order_by="HousingTicketFollowUpModel.created_at")


class HousingTicketFollowUpModel(Base):
    __tablename__ = "housing_ticket_follow_ups"

    id = Column(String(64), primary_key=True)
    ticket_id = Column(String(64), ForeignKey("housing_tickets.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    author_id = Column(String(64), nullable=False)
    author_name = Column(String(256), nullable=False)
    author_role = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    ticket = relationship("HousingTicketModel", back_populates="follow_ups")
