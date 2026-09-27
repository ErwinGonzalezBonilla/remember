from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash, generate_password_hash
from .. import db
from ..models import User

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/register")
def register():
    data = request.get_json() or {}
    email = data.get("email", "").lower().strip()
    password = data.get("password", "")
    name = data.get("name", "").strip()
    if not email or not password or not name:
        return jsonify({"message": "name, email and password are required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409
    user = User(email=email, name=name, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "message": "User created"}), 201

@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    user = User.query.filter_by(email=data.get("email", "").lower().strip()).first()
    if not user or not check_password_hash(user.password_hash, data.get("password", "")):
        return jsonify({"message": "Invalid credentials"}), 401
    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}})

@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    return jsonify({"id": user.id, "name": user.name, "email": user.email})
