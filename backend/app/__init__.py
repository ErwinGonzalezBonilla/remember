from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from werkzeug.security import generate_password_hash, check_password_hash
import os

db = SQLAlchemy()
jwt = JWTManager()

def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///remember.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")

    CORS(app)
    db.init_app(app)
    jwt.init_app(app)

    from .routes.auth import auth_bp
    from .routes.memories import memories_bp
    from .routes.connections import connections_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(memories_bp, url_prefix="/api/memories")
    app.register_blueprint(connections_bp, url_prefix="/api/connections")

    with app.app_context():
        from .models import User
        db.create_all()
        if not User.query.filter_by(email="felix@remember.app").first():
            user = User(
                email="felix@remember.app",
                password_hash=generate_password_hash("remember123"),
                name="Felix González"
            )
            db.session.add(user)
            db.session.commit()

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "remember-api"})

    return app
