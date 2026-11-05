from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import PushSubscription, User
from ..push import public_key

router = APIRouter(prefix="/api/push", tags=["avisos en el móvil"])


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=800)
    keys: Keys


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=800)


@router.get("/key")
def key(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"public_key": public_key(db)}


@router.post("/subscribe", status_code=204)
def subscribe(data: SubscriptionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Guarda este móvil. Si ya existía (p. ej. otra cuenta en el mismo móvil), pasa a ser de este usuario."""
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    if sub:
        sub.user_id, sub.p256dh, sub.auth = user.id, data.keys.p256dh, data.keys.auth
    else:
        db.add(PushSubscription(user_id=user.id, endpoint=data.endpoint, p256dh=data.keys.p256dh, auth=data.keys.auth))
    db.commit()


@router.post("/unsubscribe", status_code=204)
def unsubscribe(data: EndpointIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(PushSubscription).where(PushSubscription.endpoint == data.endpoint,
                                              PushSubscription.user_id == user.id))
    db.commit()
