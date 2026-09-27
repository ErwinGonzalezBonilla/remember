from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from .. import db
from ..models import Memory
from datetime import date

memories_bp = Blueprint("memories", __name__)

@memories_bp.get("")
@jwt_required()
def list_memories():
    user_id = int(get_jwt_identity())
    items = Memory.query.filter_by(user_id=user_id).order_by(Memory.created_at.desc()).all()
    return jsonify([serialize(x) for x in items])

@memories_bp.post("")
@jwt_required()
def create_memory():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    item = Memory(
        user_id=user_id,
        connection_id=data.get("connection_id"),
        title=data.get("title", "Untitled memory"),
        note=data.get("note", ""),
        media_url=data.get("media_url"),
        media_type=data.get("media_type", "photo"),
        location=data.get("location"),
        memory_date=date.fromisoformat(data["memory_date"]) if data.get("memory_date") else None,
        is_capsule=bool(data.get("is_capsule", False)),
        unlock_date=date.fromisoformat(data["unlock_date"]) if data.get("unlock_date") else None
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(serialize(item)), 201

def serialize(x):
    return {
        "id": x.id, "title": x.title, "note": x.note, "media_url": x.media_url,
        "media_type": x.media_type, "location": x.location,
        "memory_date": x.memory_date.isoformat() if x.memory_date else None,
        "is_capsule": x.is_capsule,
        "unlock_date": x.unlock_date.isoformat() if x.unlock_date else None
    }
