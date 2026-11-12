"""Un día como hoy: recuerdos de años anteriores con el mismo día y mes que hoy.

La fecha del recuerdo es `happened_on` si la tiene y, si no, el día en que se guardó (`created_at`).
Los del 29 de febrero se muestran el 28 de febrero en los años que no son bisiestos.
"""
import calendar
import logging
from datetime import date, datetime, timezone

from sqlalchemy import and_, extract, or_, select
from sqlalchemy.orm import Session

from .deps import visible_to
from .models import Memory, PushSubscription, User
from .push import send_push

log = logging.getLogger("rehomi.on_this_day")


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _days(today: date) -> list[tuple[int, int]]:
    """(mes, día) que cuentan como "hoy"."""
    days = [(today.month, today.day)]
    if today.month == 2 and today.day == 28 and not calendar.isleap(today.year):
        days.append((2, 29))
    return days


def _same_day(col, today: date):
    return and_(extract("year", col) < today.year,
                or_(*[and_(extract("month", col) == m, extract("day", col) == d) for m, d in _days(today)]))


def memory_day(m: Memory) -> date:
    return m.happened_on or m.created_at.date()


def on_this_day(user: User, today: date):
    """Consulta: los recuerdos que `user` puede ver y que ocurrieron un día como hoy en años anteriores."""
    return select(Memory).where(
        visible_to(user),
        or_(and_(Memory.happened_on.is_not(None), _same_day(Memory.happened_on, today)),
            and_(Memory.happened_on.is_(None), _same_day(Memory.created_at, today))),
    )


def years_ago(m: Memory, today: date) -> int:
    return today.year - memory_day(m).year


def notify_on_this_day(db: Session, today: date | None = None) -> int:
    """Un aviso al móvil por usuario con recuerdos de un día como hoy. Devuelve cuántos se entregaron."""
    today = today or utc_today()
    sent = 0
    user_ids = db.scalars(select(PushSubscription.user_id).distinct()).all()
    for uid in user_ids:
        user = db.get(User, uid)
        if not user:
            continue
        memories = sorted(db.scalars(on_this_day(user, today)).all(), key=memory_day)
        if not memories:
            continue
        first = memories[0]
        n = years_ago(first, today)
        body = f"Hace {n} {'año' if n == 1 else 'años'}: «{first.title}»"
        if len(memories) > 1:
            more = len(memories) - 1
            body += f" y {more} {'recuerdo' if more == 1 else 'recuerdos'} más"
        if send_push(db, [user.id], "Un día como hoy 💛", body, "/", tag=f"on-this-day-{today.isoformat()}"):
            sent += 1
    return sent
