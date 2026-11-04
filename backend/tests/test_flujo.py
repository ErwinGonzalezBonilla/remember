"""Flujo del MVP: registro → perfil → personas → recuerdos etiquetados → cofre → reacciones/comentarios → privacidad."""
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
PW = "Secreta123"


def register(name, email):
    r = client.post("/api/auth/register", json={
        "full_name": name, "email": email, "password": PW, "accept_terms": True})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_validaciones_de_registro_y_login():
    r = client.post("/api/auth/register", json={
        "full_name": "Ana", "email": "no-es-correo", "password": PW, "accept_terms": True})
    assert r.status_code == 422 and r.json()["detail"] == "Ingresa un correo electrónico válido."

    r = client.post("/api/auth/register", json={
        "full_name": "Ana", "email": "ana@x.com", "password": "corta", "accept_terms": True})
    assert r.status_code == 422 and "mayúscula" in r.json()["detail"]

    r = client.post("/api/auth/register", json={
        "full_name": "Ana", "email": "ana@x.com", "password": PW, "accept_terms": False})
    assert r.json()["detail"] == "Debes aceptar los términos y condiciones."

    register("Ana", "ana@x.com")
    assert client.post("/api/auth/register", json={
        "full_name": "Ana", "email": "ANA@x.com", "password": PW, "accept_terms": True}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "ana@x.com", "password": "Mala1234"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "Ana@X.com", "password": PW}).status_code == 200


def test_recuperar_contrasena(caplog):
    register("Rosa", "rosa@x.com")
    with caplog.at_level("WARNING"):
        r = client.post("/api/auth/forgot-password", json={"email": "rosa@x.com"})
    assert r.status_code == 200
    token = caplog.text.split("/restablecer/")[1].split()[0]
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "NuevaClave9"})
    assert r.status_code == 200
    # el token no se puede reutilizar
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "OtraClave9"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "rosa@x.com", "password": "NuevaClave9"}).status_code == 200


def add_person(h, name, relation, **extra):
    r = client.post("/api/people", headers=h, json={"name": name, "relation": relation, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def save(h, title, people=(), kind="text", **extra):
    data = {"kind": kind, "title": title, **extra}
    if kind == "text":
        data.setdefault("description", "Una nota")
    if people:
        data["person_ids"] = ",".join(str(p["id"]) for p in people)
    files = {"file": ("a.jpg", b"\xff\xd8\xff fake", "image/jpeg")} if kind == "photo" else None
    r = client.post("/api/memories", headers=h, data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()


def test_personas_recuerdos_y_cofre():
    felix = register("Felix", "felix@x.com")
    allison = add_person(felix, "Allison", "hijo/a", birth_date="2025-03-14")
    sofia = add_person(felix, "Sofía", "pareja", special_date="2016-10-14", special_label="Aniversario")
    assert allison["is_linked"] is False and allison["memory_count"] == 0

    # Recuerdo rápido sin etiquetar, y otros etiquetados
    solo = save(felix, "Solo para mí")
    assert solo["people"] == []
    pasos = save(felix, "Sus primeros pasos", [allison], kind="photo", happened_on="2026-10-18")
    assert pasos["media_url"].startswith("/uploads/u") and pasos["people"][0]["name"] == "Allison"
    cena = save(felix, "Cena los tres", [allison, sofia])

    # El cofre de Allison: solo lo etiquetado con ella
    cofre = client.get(f"/api/memories?person_id={allison['id']}", headers=felix).json()
    assert {m["title"] for m in cofre} == {"Sus primeros pasos", "Cena los tres"}
    assert client.get(f"/api/people/{allison['id']}", headers=felix).json()["memory_count"] == 2
    assert [m["title"] for m in client.get("/api/memories?untagged=true", headers=felix).json()] == ["Solo para mí"]
    assert len(client.get("/api/memories?kind=photo", headers=felix).json()) == 1

    # Re-etiquetar al editar
    r = client.put(f"/api/memories/{solo['id']}", headers=felix,
                   json={"title": "Ahora con Sofía", "description": "nota", "person_ids": [sofia["id"]]})
    assert r.status_code == 200 and [p["name"] for p in r.json()["people"]] == ["Sofía"]

    # Reacciones y comentarios
    r = client.put(f"/api/memories/{pasos['id']}/reaction", headers=felix, json={"emoji": "❤️"})
    assert r.json()["reactions"] == {"❤️": 1} and r.json()["my_reaction"] == "❤️"
    r = client.post(f"/api/memories/{pasos['id']}/comments", headers=felix, json={"body": "¡Qué momento!"})
    assert r.status_code == 201 and r.json()["comments"][0]["author_name"] == "Felix"

    # Borrar una persona no borra sus recuerdos: solo la etiqueta
    assert client.delete(f"/api/people/{sofia['id']}", headers=felix).status_code == 204
    r = client.get(f"/api/memories/{cena['id']}", headers=felix).json()
    assert [p["name"] for p in r["people"]] == ["Allison"]


def test_relacion_personalizada():
    h = register("Rosa", "rosa@example.com")
    p = add_person(h, "Dani", "otro", relation_label="  mejor amigo ")
    assert p["relation"] == "otro" and p["relation_label"] == "mejor amigo"
    # Si deja de ser "otro", el texto libre se borra
    r = client.put(f"/api/people/{p['id']}", headers=h, json={"name": "Dani", "relation": "amistad", "relation_label": "primo"})
    assert r.status_code == 200, r.text
    assert r.json()["relation_label"] is None
    m = save(h, "Cumple", people=[add_person(h, "Leo", "otro", relation_label="primo")])
    assert m["people"][0]["relation_label"] == "primo"


def test_privacidad():
    felix = register("Félix P", "felixp@x.com")
    otro = register("Otro", "otro@x.com")
    allison = add_person(felix, "Allison", "hijo/a")
    m = save(felix, "Privado", [allison], kind="photo")

    # Otro usuario no ve nada (404: ni siquiera sabe que existe)
    assert client.get(f"/api/memories/{m['id']}", headers=otro).status_code == 404
    assert client.get(f"/api/people/{allison['id']}", headers=otro).status_code == 404
    assert client.get("/api/memories", headers=otro).json() == []
    assert client.put(f"/api/memories/{m['id']}/reaction", headers=otro, json={"emoji": "😀"}).status_code == 404
    # No puede etiquetar a personas de otra lista
    r = client.post("/api/memories", headers=otro,
                    data={"kind": "text", "title": "x", "description": "y", "person_ids": str(allison["id"])})
    assert r.status_code == 422
    # Formato de archivo no permitido
    r = client.post("/api/memories", headers=felix, data={"kind": "photo", "title": "x"},
                    files={"file": ("a.exe", b"MZ", "application/x-msdownload")})
    assert r.status_code == 422


def test_eliminar_cuenta():
    a = register("Ana", "a@x.com")
    p = add_person(a, "Beto", "amistad")
    save(a, "hola", [p])
    assert client.delete("/api/me", headers=a).status_code == 204
    assert client.get("/api/me", headers=a).status_code == 401


def test_perfil_y_foto():
    h = register("Erwin", "erwin@x.com")
    r = client.patch("/api/me", headers=h, json={
        "full_name": "Erwin González", "bio": "Me encanta guardar momentos", "birth_date": "1990-05-20"})
    assert r.status_code == 200 and r.json()["bio"] == "Me encanta guardar momentos"
    assert r.json()["birth_date"] == "1990-05-20"

    r = client.post("/api/me/avatar", headers=h, files={"file": ("yo.png", b"\x89PNG fake", "image/png")})
    assert r.status_code == 200 and r.json()["avatar_url"].startswith("/uploads/u")
    assert client.delete("/api/me/avatar", headers=h).json()["avatar_url"] is None
    r = client.patch("/api/me", headers=h, json={"full_name": "Erwin", "bio": "x" * 200})
    assert r.status_code == 422


def test_conectar_y_abrir_cofre():
    """Félix guarda recuerdos para su hija Allison; años después Allison crea su cuenta,
    busca a su padre, le envía la solicitud y, al aceptarla Félix, se abre su cofre."""
    felix = register("Félix Flores", "felix.flores@x.com")
    r = client.patch("/api/me", headers=felix, json={"full_name": "Félix Flores", "username": "@FelixFlores"})
    assert r.status_code == 200 and r.json()["username"] == "felixflores"

    allison_p = add_person(felix, "Allison", "hijo/a")
    sofia_p = add_person(felix, "Sofía", "pareja")
    pasos = save(felix, "Sus primeros pasos", [allison_p])
    save(felix, "Cena con Sofía", [sofia_p])
    save(felix, "Solo mío")

    allison = register("Allison Flores", "allison@x.com")
    otro = register("Otra Persona", "otra@x.com")

    # @usuario duplicado
    assert client.patch("/api/me", headers=otro, json={"full_name": "Otra", "username": "felixflores"}).status_code == 409
    assert client.patch("/api/me", headers=otro, json={"full_name": "Otra", "username": "a b"}).status_code == 422

    # Búsqueda exacta por @usuario o correo
    found = client.get("/api/connect/lookup?q=@felixflores", headers=allison).json()
    assert found["full_name"] == "Félix Flores"
    assert client.get("/api/connect/lookup?q=felix.flores@x.com", headers=allison).json()["id"] == found["id"]
    assert client.get("/api/connect/lookup?q=felix", headers=allison).status_code == 404

    # Antes de conectar, Allison no ve nada
    assert client.get("/api/memories", headers=allison).json() == []

    req = client.post("/api/connect/requests", headers=allison,
                      json={"to_user_id": found["id"], "relation": "padre/madre"})
    assert req.status_code == 201
    req = req.json()
    # Duplicada
    assert client.post("/api/connect/requests", headers=allison,
                       json={"to_user_id": found["id"], "relation": "padre/madre"}).status_code == 409

    inbox = client.get("/api/connect/requests", headers=felix).json()
    assert [r["from_user"]["full_name"] for r in inbox["incoming"]] == ["Allison Flores"]
    # Otro no puede aceptarla
    assert client.post(f"/api/connect/requests/{req['id']}/accept", headers=otro,
                       json={"relation": "hijo/a"}).status_code == 404

    # Félix acepta y la vincula con la Allison que ya tenía guardada
    r = client.post(f"/api/connect/requests/{req['id']}/accept", headers=felix,
                    json={"relation": "hijo/a", "person_id": allison_p["id"]})
    assert r.status_code == 200 and r.json()["shared_count"] == 1
    assert client.get(f"/api/people/{allison_p['id']}", headers=felix).json()["is_linked"] is True

    # El cofre se abre: Allison ve SOLO lo etiquetado con ella
    titles = [m["title"] for m in client.get("/api/memories", headers=allison).json()]
    assert titles == ["Sus primeros pasos"]
    assert client.get(f"/api/memories/{pasos['id']}", headers=allison).json()["can_edit"] is False

    pending_reveal = client.get("/api/connect/requests", headers=allison).json()["opened"]
    assert len(pending_reveal) == 1
    reveal = client.get(f"/api/connect/opened/{req['id']}", headers=allison).json()
    assert reveal["shared_count"] == 1
    assert client.get("/api/connect/requests", headers=allison).json()["opened"] == []

    # Allison tiene a Félix en su lista, ya conectado, y su cofre muestra lo compartido
    her_people = client.get("/api/people", headers=allison).json()
    assert her_people[0]["name"] == "Félix Flores" and her_people[0]["relation"] == "padre/madre"
    assert her_people[0]["is_linked"] is True
    chest = client.get(f"/api/memories?person_id={reveal['person_id']}", headers=allison).json()
    assert [m["title"] for m in chest] == ["Sus primeros pasos"]

    # Puede reaccionar y comentar lo que le compartieron
    assert client.put(f"/api/memories/{pasos['id']}/reaction", headers=allison, json={"emoji": "❤️"}).status_code == 200
    assert client.post(f"/api/memories/{pasos['id']}/comments", headers=allison, json={"body": "Gracias papá"}).status_code == 201
    # Pero no editarlo ni borrarlo
    assert client.delete(f"/api/memories/{pasos['id']}", headers=allison).status_code == 403

    # Lo que Allison guarda con su padre también lo ve Félix
    save(allison, "Mi graduación", [her_people[0]])
    felix_chest = client.get(f"/api/memories?person_id={allison_p['id']}", headers=felix).json()
    assert {m["title"] for m in felix_chest} == {"Sus primeros pasos", "Mi graduación"}

    # Ya conectados: no se puede volver a pedir
    assert client.post("/api/connect/requests", headers=allison,
                       json={"to_user_id": found["id"], "relation": "padre/madre"}).status_code == 409

    # Desconectar revoca el acceso en los dos sentidos
    assert client.post(f"/api/people/{allison_p['id']}/unlink", headers=felix).json()["is_linked"] is False
    assert client.get(f"/api/memories/{pasos['id']}", headers=allison).status_code == 404
    assert [m["title"] for m in client.get("/api/memories", headers=allison).json()] == ["Mi graduación"]


def test_apodo_visible_al_conectar():
    erwin = register("Erwin González", "erwin@example.com")
    client.patch("/api/me", headers=erwin, json={"full_name": "Erwin González", "username": "erwin_g"})
    primo = register("Luis Pérez", "luis@example.com")
    client.patch("/api/me", headers=primo, json={"full_name": "Luis Pérez", "username": "luis_p"})
    luis = add_person(erwin, "Luis", "otro", relation_label="primo", nickname=" el Orejón ", nickname_emoji="😂")
    assert luis["nickname"] == "el Orejón" and luis["nickname_emoji"] == "😂"
    # Sin apodo no se guarda el emoji
    otro = add_person(erwin, "Ana", "amistad", nickname_emoji="😂")
    assert otro["nickname_emoji"] is None
    # Antes de conectar, Luis no ve nada
    erwin_id = client.get("/api/connect/lookup", headers=primo, params={"q": "@erwin_g"}).json()["id"]
    req = client.post("/api/connect/requests", headers=primo, json={"to_user_id": erwin_id, "relation": "familia"}).json()
    r = client.post(f"/api/connect/requests/{req['id']}/accept", headers=erwin,
                    json={"relation": "otro", "person_id": luis["id"]})
    assert r.status_code == 200, r.text
    seen = client.get(f"/api/connect/opened/{req['id']}", headers=primo).json()["seen_as"]
    assert seen["name"] == "Erwin González" and seen["nickname"] == "el Orejón" and seen["relation_label"] == "primo"
    erwin_for_luis = [p for p in client.get("/api/people", headers=primo).json() if p["is_linked"]][0]
    detail = client.get(f"/api/people/{erwin_for_luis['id']}", headers=primo).json()
    assert detail["seen_as"]["nickname_emoji"] == "😂"
    # El apodo que Erwin puso no aparece en la lista de Luis como si fuera suyo
    assert erwin_for_luis["nickname"] is None


def test_familia_en_el_perfil():
    a = register("Erwin Familia", "erwinfam@example.com")
    r = client.patch("/api/me", headers=a, json={
        "full_name": "Erwin Familia", "username": "erwin_fam", "relationship_status": "relacion",
        "partner_name": " Anabel ", "family": {"parents": ["Rosa", " José "], "siblings": [], "children": []}})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["partner_name"] == "Anabel" and me["family"] == {"parents": ["Rosa", "José"], "siblings": [], "children": []}
    # La bienvenida no envía la familia: no se borra
    r = client.patch("/api/me", headers=a, json={"full_name": "Erwin Familia", "username": "erwin_fam"})
    assert r.json()["partner_name"] == "Anabel"
    # Soltero/a no guarda pareja
    r = client.patch("/api/me", headers=a, json={"full_name": "Erwin Familia", "relationship_status": "soltero", "partner_name": "X"})
    assert r.json()["partner_name"] is None
    client.patch("/api/me", headers=a, json={"full_name": "Erwin Familia", "relationship_status": "casado", "partner_name": "Anabel"})
    assert client.patch("/api/me", headers=a, json={"full_name": "E F", "relationship_status": "otro"}).status_code == 422
    # Solo lo ve quien está conectado
    b = register("Ana Familia", "anafam@example.com")
    p = add_person(b, "Erwin", "amistad")
    assert client.get(f"/api/people/{p['id']}", headers=b).json()["about"] is None
    eid = client.get("/api/connect/lookup", headers=b, params={"q": "@erwin_fam"}).json()["id"]
    req = client.post("/api/connect/requests", headers=b, json={"to_user_id": eid, "relation": "amistad", "person_id": p["id"]}).json()
    client.post(f"/api/connect/requests/{req['id']}/accept", headers=a, json={"relation": "amistad"})
    about = client.get(f"/api/people/{p['id']}", headers=b).json()["about"]
    assert about["relationship_status"] == "casado" and about["partner_name"] == "Anabel"
    assert about["family"]["parents"] == ["Rosa", "José"]
    assert "email" not in about


def test_rechazar_y_cancelar_solicitud():
    a = register("Ana Uno", "ana1@x.com")
    b = register("Beto Dos", "beto2@x.com")
    client.patch("/api/me", headers=b, json={"full_name": "Beto Dos", "username": "beto2"})
    bid = client.get("/api/connect/lookup?q=@beto2", headers=a).json()["id"]
    assert client.post("/api/connect/requests", headers=a, json={"to_user_id": bid, "relation": "yo"}).status_code == 422
    r1 = client.post("/api/connect/requests", headers=a, json={"to_user_id": bid, "relation": "amistad"}).json()
    assert client.delete(f"/api/connect/requests/{r1['id']}", headers=a).status_code == 204
    r2 = client.post("/api/connect/requests", headers=a, json={"to_user_id": bid, "relation": "amistad"}).json()
    assert client.post(f"/api/connect/requests/{r2['id']}/reject", headers=b).status_code == 204
    assert client.get("/api/connect/requests", headers=b).json()["incoming"] == []
    assert client.get("/api/people", headers=a).json() == []


# ---------- Cápsula del tiempo ----------
def connect_users(a, b, b_person_for_a, relation_a_says="padre/madre", relation_b_says="hijo/a"):
    """`b` (que creó b_person_for_a en su lista) acepta la solicitud de `a`."""
    b_id = client.get("/api/me", headers=b).json()["id"]
    req = client.post("/api/connect/requests", headers=a, json={"to_user_id": b_id, "relation": relation_a_says}).json()
    r = client.post(f"/api/connect/requests/{req['id']}/accept", headers=b,
                    json={"relation": relation_b_says, "person_id": b_person_for_a["id"]})
    assert r.status_code == 200, r.text


def open_now(capsule_id):
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models import TimeCapsule
    with SessionLocal() as db:
        db.get(TimeCapsule, capsule_id).open_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()


def future(days=30):
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def test_capsula_del_tiempo(monkeypatch):
    from app.routers import capsules as cap_router
    mails = []
    monkeypatch.setattr(cap_router, "send_email", lambda to, subject, *a, **k: mails.append((to, subject)) or True)

    mama = register("Marta Ruiz", "marta@x.com")
    hijo_p = add_person(mama, "Leo", "hijo/a")
    otra_p = add_person(mama, "Vecina", "amistad")
    leo = register("Leo Ruiz", "leo@x.com")
    extra = register("Extraño", "extrano@x.com")

    # Validaciones al crear
    base = {"title": "Para tus 18", "person_id": hijo_p["id"], "timezone": "Europe/Madrid"}
    assert client.post("/api/capsules", headers=mama, json={**base, "open_at": "2020-01-01T10:00:00+01:00"}).status_code == 422
    assert client.post("/api/capsules", headers=mama, json={**base, "open_at": "2099-01-01T10:00:00"}).status_code == 422
    assert client.post("/api/capsules", headers=mama, json={**base, "open_at": future(), "timezone": "Marte/Base"}).status_code == 422
    assert client.post("/api/capsules", headers=leo, json={**base, "open_at": future()}).status_code == 404  # persona ajena

    r = client.post("/api/capsules", headers=mama, json={**base, "open_at": future()})
    assert r.status_code == 201 and r.json()["status"] == "draft"
    cid = r.json()["id"]

    # Vacía no se puede sellar
    assert client.post(f"/api/capsules/{cid}/seal", headers=mama).status_code == 422

    # Archivos (uno por petición)
    r = client.post(f"/api/capsules/{cid}/items", headers=mama, data={"kind": "photo"},
                    files={"file": ("a.jpg", b"\xff\xd8\xff fake", "image/jpeg")})
    assert r.status_code == 201, r.text
    item_id = r.json()["items"][0]["id"]
    r = client.post(f"/api/capsules/{cid}/items", headers=mama, data={"kind": "audio"},
                    files={"file": ("b.mp3", b"ID3 fake", "audio/mpeg")})
    assert r.json()["item_counts"] == {"photo": 1, "audio": 1}
    assert client.delete(f"/api/capsules/{cid}/items/{item_id}", headers=mama).json()["item_counts"] == {"audio": 1}

    r = client.put(f"/api/capsules/{cid}", headers=mama, json={**base, "message": "Te quiero mucho", "open_at": future()})
    assert r.status_code == 200 and r.json()["message"] == "Te quiero mucho"

    # Sellar sin destinataria conectada: no hay correo
    r = client.post(f"/api/capsules/{cid}/seal", headers=mama)
    assert r.status_code == 200 and r.json()["status"] == "sealed" and mails == []
    # Sellada: ya no se puede editar
    assert client.put(f"/api/capsules/{cid}", headers=mama, json={**base, "open_at": future()}).status_code == 409
    assert client.post(f"/api/capsules/{cid}/items", headers=mama, data={"kind": "photo"},
                       files={"file": ("c.jpg", b"x", "image/jpeg")}).status_code == 409

    # Antes de conectar, Leo no la ve; un extraño nunca
    assert client.get(f"/api/capsules/{cid}", headers=leo).status_code == 404
    assert client.get("/api/capsules", headers=leo).json()["received"] == []

    connect_users(leo, mama, hijo_p)

    # Conectado pero aún cerrada: ve que existe, no el contenido
    r = client.get(f"/api/capsules/{cid}", headers=leo).json()
    assert r["locked"] is True and r["message"] is None and r["items"] == [] and r["person"] is None
    assert r["item_counts"] == {"audio": 1} and r["author_name"] == "Marta Ruiz"
    assert client.get(f"/api/capsules/{cid}", headers=extra).status_code == 404
    assert client.put(f"/api/capsules/{cid}/reaction", headers=leo, json={"emoji": "❤️"}).status_code == 409
    assert client.post(f"/api/capsules/{cid}/comments", headers=leo, json={"body": "hola"}).status_code == 409
    assert client.delete(f"/api/capsules/{cid}", headers=leo).status_code == 403

    # Una segunda cápsula ya conectada: al sellar, correo a Leo
    c2 = client.post("/api/capsules", headers=mama, json={**base, "title": "Navidad", "message": "🎄", "open_at": future(60)}).json()
    client.post(f"/api/capsules/{c2['id']}/seal", headers=mama)
    assert mails == [("leo@x.com", "Marta Ruiz te dejó una cápsula del tiempo")]
    # Un borrador no aparece a Leo
    client.post("/api/capsules", headers=mama, json={**base, "title": "Borrador", "open_at": future()})
    assert [c["title"] for c in client.get("/api/capsules", headers=leo).json()["received"]] == ["Para tus 18", "Navidad"]
    assert len(client.get("/api/capsules", headers=mama).json()["sent"]) == 3

    # Llega el día
    open_now(cid)
    r = client.get(f"/api/capsules/{cid}", headers=leo).json()
    assert r["status"] == "open" and r["locked"] is False and r["message"] == "Te quiero mucho" and len(r["items"]) == 1
    r = client.put(f"/api/capsules/{cid}/reaction", headers=leo, json={"emoji": "😢"})
    assert r.status_code == 200 and r.json()["my_reaction"] == "😢"
    r = client.post(f"/api/capsules/{cid}/comments", headers=leo, json={"body": "Gracias, mamá"})
    assert r.status_code == 201 and r.json()["comments"][0]["author_name"] == "Leo Ruiz"
    assert client.get(f"/api/capsules/{cid}", headers=mama).json()["reactions"] == {"😢": 1}

    # Aviso diario: solo una vez por cápsula
    mails.clear()
    assert client.get("/api/cron/capsules").json() == {"pending": 1, "sent": 1}
    assert mails == [("leo@x.com", "¡Tu cápsula del tiempo ya se puede abrir! 🎉")]
    assert client.get("/api/cron/capsules").json() == {"pending": 0, "sent": 0}

    # Borrar a la persona: la cápsula queda sin destinataria (Leo deja de verla), no se borra
    tmp = client.post("/api/capsules", headers=mama, json={**base, "person_id": otra_p["id"], "open_at": future()}).json()
    assert client.delete(f"/api/people/{otra_p['id']}", headers=mama).status_code == 204
    r = client.get(f"/api/capsules/{tmp['id']}", headers=mama).json()
    assert r["person"] is None
    assert client.post(f"/api/capsules/{tmp['id']}/seal", headers=mama).status_code == 422

    # Borrar la cápsula
    assert client.delete(f"/api/capsules/{c2['id']}", headers=mama).status_code == 204
    assert client.get(f"/api/capsules/{c2['id']}", headers=leo).status_code == 404

    # Eliminar la cuenta de Marta borra sus cápsulas
    assert client.delete("/api/me", headers=mama).status_code == 204
    assert client.get("/api/capsules", headers=leo).json()["received"] == []


def test_cron_con_secreto(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "cron_secret", "s3creto")
    assert client.get("/api/cron/capsules").status_code == 401
    assert client.get("/api/cron/capsules", headers={"Authorization": "Bearer s3creto"}).status_code == 200
