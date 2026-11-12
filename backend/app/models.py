"""Modelo de REHOMI: el recuerdo es lo primero.

- User: quien tiene cuenta.
- Person: alguien de tu vida, con o sin cuenta (tu bebé, tu pareja, tu mejor amigo).
  Cada usuario tiene su propia lista. Todo lo etiquetado con una persona forma su "cofre".
  `linked_user_id` se rellena cuando esa persona crea su cuenta y aceptas la conexión (parte 2):
  en ese momento el cofre se abre para ella.
- Memory: foto, video, audio o nota. Pertenece a quien la crea y se etiqueta con 0..n personas.
- TimeCapsule: mensaje, fotos, videos y audios para una persona, sellados hasta una fecha.
  Borrador (sealed_at vacío) → Sellada → Abierta (cuando llega open_at).
"""
from datetime import date, datetime, timezone

from sqlalchemy import Integer, JSON, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    # @usuario público para que te encuentren (parte 2). Opcional en cuentas antiguas.
    username: Mapped[str | None] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(String(160))
    birth_date: Mapped[date | None] = mapped_column(Date)
    # Tu familia (todo opcional): solo lo ven las personas conectadas contigo
    relationship_status: Mapped[str | None] = mapped_column(String(20))  # soltero · relacion · comprometido · casado
    partner_name: Mapped[str | None] = mapped_column(String(80))
    partner_person_id: Mapped[int | None] = mapped_column(Integer)        # su cofre en tu lista, si lo enlazas
    # {"parents": [{"name": "Rosa", "person_id": 3}, ...], "siblings": [...], "children": [...]}
    family: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    people: Mapped[list["Person"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", foreign_keys="Person.owner_id")


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    relation: Mapped[str] = mapped_column(String(30))
    relation_label: Mapped[str | None] = mapped_column(String(40))  # texto libre cuando relation = "otro"
    nickname: Mapped[str | None] = mapped_column(String(40))        # apodo cariñoso: "el Orejón"
    nickname_emoji: Mapped[str | None] = mapped_column(String(16))  # 😂
    photo_url: Mapped[str | None] = mapped_column(String(500))
    birth_date: Mapped[date | None] = mapped_column(Date)
    special_date: Mapped[date | None] = mapped_column(Date)       # aniversario, el día que os conocisteis…
    special_label: Mapped[str | None] = mapped_column(String(60))
    note: Mapped[str | None] = mapped_column(String(300))
    linked_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    owner: Mapped[User] = relationship(back_populates="people", foreign_keys=[owner_id])
    tags: Mapped[list["MemoryTag"]] = relationship(back_populates="person", cascade="all, delete-orphan")


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # photo | video | audio | text
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(160))
    happened_on: Mapped[date | None] = mapped_column(Date)
    milestone: Mapped[str | None] = mapped_column(String(40))  # hito: "Primeros pasos", "Primer diente"…
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    author: Mapped[User] = relationship()
    tags: Mapped[list["MemoryTag"]] = relationship(back_populates="memory", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(cascade="all, delete-orphan", order_by="Comment.created_at")
    reactions: Mapped[list["Reaction"]] = relationship(cascade="all, delete-orphan")


class MemoryTag(Base):
    """Etiqueta: 'este recuerdo es con esta persona'."""
    __tablename__ = "memory_tags"
    __table_args__ = (UniqueConstraint("memory_id", "person_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    memory_id: Mapped[int] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)

    memory: Mapped[Memory] = relationship(back_populates="tags")
    person: Mapped[Person] = relationship(back_populates="tags")


class ConnectionRequest(Base):
    """Solicitud de conexión: 'Allison (from) dice que Félix (to) es su padre'.
    Al aceptarla, Félix vincula a Allison con una persona de su lista y se abre su cofre."""
    __tablename__ = "connection_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    relation: Mapped[str] = mapped_column(String(30))            # quién es 'to' para 'from'
    from_person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"))
    message: Mapped[str | None] = mapped_column(String(120))     # dedicatoria opcional de quien la envía
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | accepted | rejected
    seen_by_sender: Mapped[bool] = mapped_column(default=False)  # ya vio "tu cofre se ha abierto"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    from_user: Mapped[User] = relationship(foreign_keys=[from_user_id])
    to_user: Mapped[User] = relationship(foreign_keys=[to_user_id])


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    memory_id: Mapped[int] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    author: Mapped[User] = relationship()


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("memory_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    memory_id: Mapped[int] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(8))


class TimeCapsule(Base):
    """Cápsula del tiempo. Quien la crea la ve siempre; la persona destinataria (si tiene cuenta y está
    conectada) ve solo la portada y la cuenta atrás hasta `open_at`; después, todo el contenido."""
    __tablename__ = "time_capsules"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(String(500))
    open_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Madrid")  # para mostrar la fecha en los correos
    sealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    open_notified: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    author: Mapped[User] = relationship()
    person: Mapped[Person | None] = relationship()
    items: Mapped[list["CapsuleItem"]] = relationship(cascade="all, delete-orphan", order_by="CapsuleItem.id")
    comments: Mapped[list["CapsuleComment"]] = relationship(cascade="all, delete-orphan",
                                                            order_by="CapsuleComment.created_at")
    reactions: Mapped[list["CapsuleReaction"]] = relationship(cascade="all, delete-orphan")


class CapsuleItem(Base):
    __tablename__ = "capsule_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    capsule_id: Mapped[int] = mapped_column(ForeignKey("time_capsules.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # photo | video | audio
    media_url: Mapped[str] = mapped_column(String(500))


class CapsuleComment(Base):
    __tablename__ = "capsule_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    capsule_id: Mapped[int] = mapped_column(ForeignKey("time_capsules.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    author: Mapped[User] = relationship()


class CapsuleReaction(Base):
    __tablename__ = "capsule_reactions"
    __table_args__ = (UniqueConstraint("capsule_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    capsule_id: Mapped[int] = mapped_column(ForeignKey("time_capsules.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(8))


class Notification(Base):
    """Aviso para un usuario: alguien le etiquetó en un recuerdo o comentó en uno que comparten."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))          # memory_tag | comment
    memory_id: Mapped[int] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    actor: Mapped[User] = relationship(foreign_keys=[actor_id])
    memory: Mapped[Memory] = relationship()


class PushSubscription(Base):
    """Un móvil o navegador donde el usuario activó los avisos (Web Push)."""
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(800), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AppSetting(Base):
    """Ajustes internos guardados en la base de datos (p. ej. las claves VAPID de los avisos)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
