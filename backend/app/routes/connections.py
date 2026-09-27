from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from .. import db
from ..models import Connection

connections_bp = Blueprint("connections", __name__)

@connections_bp.get("")
@jwt_required()
def list_connections():
    user_id = int(get_jwt_identity())
    items = Connection.query.filter_by(owner_id=user_id).all()
    return jsonify([{
        "id": x.id, "name": x.name, "relationship_type": x.relationship_type,
        "description": x.description, "avatar": x.avatar
    } for x in items])

@connections_bp.post("")
@jwt_required()
def create_connection():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    item = Connection(
        owner_id=user_id,
        name=data.get("name", "New connection"),
        relationship_type=data.get("relationship_type", "Family"),
        description=data.get("description", ""),
        avatar=data.get("avatar")
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"id": item.id, "name": item.name}), 201
