from . import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(180), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    avatar = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

class Connection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    relationship_type = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(300))
    avatar = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

class Memory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    connection_id = db.Column(db.Integer, db.ForeignKey("connection.id"))
    title = db.Column(db.String(180), nullable=False)
    note = db.Column(db.Text)
    media_url = db.Column(db.String(1000))
    media_type = db.Column(db.String(30), default="photo")
    location = db.Column(db.String(180))
    memory_date = db.Column(db.Date)
    is_capsule = db.Column(db.Boolean, default=False)
    unlock_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
