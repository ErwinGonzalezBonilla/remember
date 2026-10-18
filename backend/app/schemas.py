from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

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


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    avatar_url: str | None = None
    bio: str | None = None
    birth_date: date | None = None


class UserUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=160)
    birth_date: date | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Personas ----------
class PersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    relation: Relation
    birth_date: date | None = None
    special_date: date | None = None
    special_label: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=300)


class PersonOut(BaseModel):
    id: int
    name: str
    relation: str
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
