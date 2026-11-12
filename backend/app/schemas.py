import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .security import password_problems

Relation = Literal["pareja", "hijo/a", "padre/madre", "hermano/a", "abuelo/a", "familia",
                   "amistad", "compañero/a", "otro"]


def _check_password(v: str) -> str:
    problems = password_problems(v)
    if problems:
        raise ValueError("La contraseña debe tener " + ", ".join(problems) + ".")
    return v


Password = Annotated[str, AfterValidator(_check_password)]


# ---------- Auth ----------
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: Password
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes aceptar los términos y condiciones.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: Password


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: Password


RelationshipStatus = Literal["soltero", "relacion", "comprometido", "casado"]
class FamilyMember(BaseModel):
    """Un familiar: su nombre y, si quieres, el cofre de tu lista que le corresponde."""
    name: Annotated[str, AfterValidator(lambda v: v.strip()), Field(min_length=1, max_length=60)]
    person_id: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _from_text(cls, v):
        return {"name": v} if isinstance(v, str) else v   # versión anterior: solo nombres


class Family(BaseModel):
    parents: list[FamilyMember] = Field(default_factory=list, max_length=4)
    siblings: list[FamilyMember] = Field(default_factory=list, max_length=15)
    children: list[FamilyMember] = Field(default_factory=list, max_length=15)


class AboutMember(BaseModel):
    """Un familiar visto por otra persona: enlaza a SU propio cofre de esa persona, si lo tiene."""
    name: str
    person_id: int | None = None     # id en la lista de quien mira (nunca el del dueño del perfil)
    is_you: bool = False             # el familiar eres tú


class AboutFamily(BaseModel):
    parents: list[AboutMember] = []
    siblings: list[AboutMember] = []
    children: list[AboutMember] = []


class AboutOut(BaseModel):
    """Lo que ve de ti una persona conectada contigo."""
    full_name: str
    username: str | None = None
    avatar_url: str | None = None
    birth_date: date | None = None
    bio: str | None = None
    relationship_status: str | None = None
    partner: AboutMember | None = None
    family: AboutFamily | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    username: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    birth_date: date | None = None
    relationship_status: str | None = None
    partner_name: str | None = None
    partner_person_id: int | None = None
    family: Family | None = None


def _check_username(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip().lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9_.]{3,30}", v):
        raise ValueError("El @usuario debe tener de 3 a 30 caracteres: letras, números, punto o guion bajo.")
    return v


class UserUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: Annotated[str | None, AfterValidator(_check_username)] = None
    bio: str | None = Field(default=None, max_length=160)
    birth_date: date | None = None
    relationship_status: RelationshipStatus | None = None
    partner_name: str | None = Field(default=None, max_length=80)
    partner_person_id: int | None = None
    family: Family | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Personas ----------
class PersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    relation: Relation
    relation_label: str | None = Field(default=None, max_length=40)   # "primo", "mejor amigo"… si es "otro"
    nickname: str | None = Field(default=None, max_length=40)         # apodo cariñoso
    nickname_emoji: str | None = Field(default=None, max_length=16)
    birth_date: date | None = None
    special_date: date | None = None
    special_label: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=300)


class SeenAs(BaseModel):
    """Cómo te tiene guardado la otra persona (solo si estáis conectados)."""
    name: str
    relation: str
    relation_label: str | None
    nickname: str | None
    nickname_emoji: str | None


class PersonOut(BaseModel):
    id: int
    name: str
    relation: str
    relation_label: str | None = None
    nickname: str | None = None
    nickname_emoji: str | None = None
    seen_as: SeenAs | None = None       # solo en el detalle de una persona conectada
    about: AboutOut | None = None       # su perfil (bio y familia), solo si estáis conectados
    photo_url: str | None
    birth_date: date | None
    special_date: date | None
    special_label: str | None
    note: str | None
    is_linked: bool          # ya tiene cuenta y está conectada (parte 2)
    memory_count: int
    last_memory_at: datetime | None
    created_at: datetime


class PersonTag(BaseModel):
    id: int
    name: str
    relation: str
    relation_label: str | None = None
    photo_url: str | None


# ---------- Recuerdos ----------
class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: int
    body: str
    author_id: int
    author_name: str
    author_avatar: str | None = None
    created_at: datetime


class ReactionIn(BaseModel):
    emoji: Literal["❤️", "😀", "😂", "😮", "😢"]


class MemoryOut(BaseModel):
    id: int
    kind: str
    title: str
    description: str | None
    media_url: str | None
    location: str | None
    happened_on: date | None
    created_at: datetime
    author_id: int
    author_name: str
    people: list[PersonTag]
    reactions: dict[str, int]
    my_reaction: str | None
    comment_count: int
    can_edit: bool


class MemoryDetailOut(MemoryOut):
    comments: list[CommentOut]


class MemoryUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = None
    location: str | None = None
    happened_on: date | None = None
    person_ids: list[int] = []


# ---------- Conectar ----------
class PublicUser(BaseModel):
    id: int
    full_name: str
    username: str | None
    avatar_url: str | None


class RequestIn(BaseModel):
    to_user_id: int
    relation: Relation                 # quién es esa persona para mí
    person_id: int | None = None       # si ya la tenía guardada en mi lista
    message: str | None = Field(default=None, max_length=120)  # dedicatoria opcional

    @field_validator("message")
    @classmethod
    def _clean_message(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class AcceptIn(BaseModel):
    relation: Relation                 # quién es para mí quien me lo pide
    person_id: int | None = None       # persona de mi lista a vincular; None = crear una nueva


class RequestOut(BaseModel):
    id: int
    status: str
    relation: str
    created_at: datetime
    from_user: PublicUser
    to_user: PublicUser
    message: str | None = None


class RequestsOut(BaseModel):
    incoming: list[RequestOut]
    outgoing: list[RequestOut]
    opened: list[RequestOut]           # aceptadas que aún no has visto: "tu cofre se ha abierto"


class OpenedOut(BaseModel):
    request: RequestOut
    shared_count: int
    person_id: int | None              # tu persona vinculada con quien te abrió el cofre
    seen_as: SeenAs | None = None      # cómo te tiene guardado quien te abrió el cofre


# ---------- Cápsula del tiempo ----------
class CapsuleIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str | None = Field(default=None, max_length=5000)
    person_id: int
    open_at: datetime                      # con zona horaria (ISO 8601)
    timezone: str = Field(default="Europe/Madrid", max_length=64)

    @field_validator("open_at")
    @classmethod
    def aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("La fecha de apertura debe incluir la zona horaria.")
        return v


class CapsuleItemOut(BaseModel):
    id: int
    kind: str
    media_url: str


class CapsuleOut(BaseModel):
    id: int
    title: str
    status: Literal["draft", "sealed", "open"]
    locked: bool                           # True: el contenido aún no se puede ver (solo destinataria antes de la fecha)
    open_at: datetime
    timezone: str
    sealed_at: datetime | None
    created_at: datetime
    is_author: bool
    author_name: str
    author_avatar: str | None
    person: PersonTag | None               # destinataria (solo la ve quien la creó)
    message: str | None
    cover_url: str | None
    items: list[CapsuleItemOut]
    item_counts: dict[str, int]            # p. ej. {"photo": 3, "audio": 1}: se muestra aunque esté cerrada
    reactions: dict[str, int]
    my_reaction: str | None
    comment_count: int


class CapsuleDetailOut(CapsuleOut):
    comments: list[CommentOut]


class CapsulesOut(BaseModel):
    received: list[CapsuleOut]
    sent: list[CapsuleOut]


# ---------- Avisos ----------
class NotificationOut(BaseModel):
    id: int
    kind: str
    created_at: datetime
    read: bool
    actor_name: str
    actor_avatar: str | None
    memory_id: int
    memory_title: str
    memory_kind: str


class NotificationsOut(BaseModel):
    unread: int
    items: list[NotificationOut]
