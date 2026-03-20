"""SQLAlchemy models for housing tasks and tickets (PostgreSQL)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Column, DateTime, ForeignKey, Integer, String, Text
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
    complaint_type = Column(String(64), nullable=True)  # comma-separated tags
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
    complaint_type = Column(String(64), nullable=True)  # comma-separated tags

    follow_ups = relationship("HousingTicketFollowUpModel", back_populates="ticket", order_by="HousingTicketFollowUpModel.created_at")


class EcoQuestCompletionModel(Base):
    __tablename__ = "eco_quest_completions"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False)
    quest_id = Column(String(32), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=False)
    photo_data = Column(Text, nullable=True)


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


class ReportAnchorModel(Base):
    __tablename__ = "report_anchors"

    id = Column(String(64), primary_key=True)
    house_id = Column(String(64), nullable=False, index=True)
    period = Column(String(16), nullable=False)
    metadata_uri = Column(String(512), nullable=False, default="")
    report_hash = Column(String(128), nullable=False)
    triggered_by = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False)
    tx_hash = Column(String(128), nullable=False)
    block_number = Column(BigInteger, nullable=False, default=0)
    chain_id = Column(Integer, nullable=False, default=80002)
    contract_address = Column(String(128), nullable=False, default="")
    explorer_url = Column(String(512), nullable=False, default="")
    error_message = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
