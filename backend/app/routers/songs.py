"""Canciones del cofre: enlaces de Spotify, YouTube o Apple Music con una nota ("la de nuestra boda").

Privacidad: igual que los recuerdos del cofre. En el cofre de una persona ves las canciones que tú añadiste para ella y,
si estáis conectados, las que ella añadió para ti. Nadie más. Solo se borran las propias.
El reproductor se arma en el servidor a partir del enlace: el iframe solo puede apuntar a los reproductores oficiales.
"""
import re
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..models import Person, Song, User
from ..push import send_push
from ..schemas import SongIn, SongOut

router = APIRouter(prefix="/api", tags=["canciones"])

YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
SPOTIFY_TYPES = {"track", "album", "playlist", "episode", "show", "artist"}


def embed(url: str) -> tuple[str, str]:
    """(servicio, url del reproductor oficial). 422 si el enlace no es de Spotify, YouTube o Apple Music."""
    try:
        u = urlparse(url.strip())
    except ValueError:
        u = None
    if not u or u.scheme not in ("http", "https") or not u.hostname:
        raise HTTPException(422, "Pega un enlace de Spotify, YouTube o Apple Music.")
    host = u.hostname.lower().removeprefix("www.").removeprefix("m.")
    parts = [p for p in u.path.split("/") if p]

    if host == "open.spotify.com":
        if parts and parts[0].startswith("intl-"):
            parts = parts[1:]
        if len(parts) >= 2 and parts[0] in SPOTIFY_TYPES and re.fullmatch(r"[A-Za-z0-9]{10,40}", parts[1]):
            return "spotify", f"https://open.spotify.com/embed/{parts[0]}/{parts[1]}"
    elif host in ("youtube.com", "music.youtube.com", "youtu.be"):
        vid = None
        if host == "youtu.be" and parts:
            vid = parts[0]
        elif parts[:1] == ["watch"]:
            vid = (parse_qs(u.query).get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live"):
            vid = parts[1]
        if vid and YT_ID.match(vid):
            return "youtube", f"https://www.youtube-nocookie.com/embed/{vid}"
    elif host == "music.apple.com":
        if len(parts) >= 3 and re.fullmatch(r"[a-z]{2}", parts[0]) and parts[1] in ("album", "playlist", "song", "music-video"):
            safe = "/".join(re.sub(r"[^A-Za-z0-9._~-]", "", p) for p in parts)
            query = f"?i={q[0]}" if (q := parse_qs(u.query).get("i")) and q[0].isdigit() else ""
            return "apple", f"https://embed.music.apple.com/{safe}{query}"
    raise HTTPException(422, "Ese enlace no es de una canción de Spotify, YouTube o Apple Music.")


def chest_songs(person: Person, user: User):
    """Las tuyas para esa persona y, si estáis conectados, las suyas para ti."""
    cond = and_(Song.author_id == user.id, Song.person_id == person.id)
    if person.linked_user_id:
        theirs = and_(Song.author_id == person.linked_user_id,
                      Song.person_id.in_(select(Person.id).where(Person.owner_id == person.linked_user_id,
                                                                 Person.linked_user_id == user.id)))
        cond = or_(cond, theirs)
    return cond


def to_out(s: Song, user: User, names: dict[int, str]) -> SongOut:
    service, embed_url = embed(s.url)
    return SongOut(id=s.id, title=s.title, artist=s.artist, url=s.url, note=s.note, service=service, embed_url=embed_url,
                   mine=s.author_id == user.id, author_name=names.get(s.author_id, ""), created_at=s.created_at)


def _names(db: Session, songs) -> dict[int, str]:
    ids = {s.author_id for s in songs}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


@router.get("/people/{person_id}/songs", response_model=list[SongOut])
def list_songs(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    songs = db.scalars(select(Song).where(chest_songs(person, user)).order_by(Song.created_at.desc(), Song.id.desc())).all()
    names = _names(db, songs)
    return [to_out(s, user, names) for s in songs]


@router.post("/people/{person_id}/songs", response_model=SongOut, status_code=201)
def add_song(person_id: int, data: SongIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    embed(data.url)   # valida el enlace antes de guardar
    song = Song(author_id=user.id, person_id=person.id, title=data.title.strip(), url=data.url.strip(),
                artist=(data.artist or "").strip() or None, note=(data.note or "").strip() or None)
    db.add(song)
    db.commit()
    db.refresh(song)
    # Si estáis conectados, la otra persona la verá en su cofre: se le avisa
    if person.linked_user_id:
        theirs = db.scalar(select(Person.id).where(Person.owner_id == person.linked_user_id, Person.linked_user_id == user.id))
        if theirs:
            send_push(db, [person.linked_user_id], f"{user.full_name.split(' ')[0]} añadió una canción a vuestro cofre 🎵",
                      " · ".join(x for x in (song.title, song.artist) if x), f"/personas/{theirs}/canciones",
                      tag=f"song-{user.id}")
    return to_out(song, user, {user.id: user.full_name})


@router.delete("/songs/{song_id}", status_code=204)
def delete_song(song_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    song = db.get(Song, song_id)
    if not song or song.author_id != user.id:
        raise HTTPException(404, "Canción no encontrada.")
    db.delete(song)
    db.commit()
