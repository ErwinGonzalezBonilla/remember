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
    assert me["partner_name"] == "Anabel"
    assert me["family"]["parents"] == [{"name": "Rosa", "person_id": None}, {"name": "José", "person_id": None}]
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
    assert about["relationship_status"] == "casado" and about["partner"]["name"] == "Anabel"
    assert [m["name"] for m in about["family"]["parents"]] == ["Rosa", "José"]
    assert "email" not in about
    assert about["username"] == "erwin_fam" and about["full_name"] == "Erwin Familia"


def _connect(a, a_user, b, relation="familia"):
    """b envía la solicitud a a (por @usuario) y a la acepta."""
    aid = client.get("/api/connect/lookup", headers=b, params={"q": f"@{a_user}"}).json()["id"]
    req = client.post("/api/connect/requests", headers=b, json={"to_user_id": aid, "relation": relation}).json()
    assert client.post(f"/api/connect/requests/{req['id']}/accept", headers=a, json={"relation": relation}).status_code == 200


def test_familia_enlazada_a_cofres():
    erwin = register("Erwin Enlace", "erwinenl@example.com")
    client.patch("/api/me", headers=erwin, json={"full_name": "Erwin Enlace", "username": "erwin_enl"})
    anabel = register("Anabel Enlace", "anabelenl@example.com")
    client.patch("/api/me", headers=anabel, json={"full_name": "Anabel Enlace", "username": "anabel_enl"})
    luis = register("Luis Enlace", "luisenl@example.com")
    client.patch("/api/me", headers=luis, json={"full_name": "Luis Enlace", "username": "luis_enl"})
    ajena = add_person(luis, "Otra", "amistad")
    # Erwin conecta con Anabel y con Luis; Luis también conecta con Anabel
    _connect(erwin, "erwin_enl", anabel, "pareja")
    _connect(erwin, "erwin_enl", luis)
    _connect(anabel, "anabel_enl", luis, "amistad")
    ana_in_erwin = [p for p in client.get("/api/people", headers=erwin).json() if p["name"] == "Anabel Enlace"][0]
    rosa = add_person(erwin, "Rosa", "padre/madre")
    r = client.patch("/api/me", headers=erwin, json={
        "full_name": "Erwin Enlace", "relationship_status": "relacion",
        "partner_name": "Anabel", "partner_person_id": ana_in_erwin["id"],
        "family": {"parents": [{"name": "Rosa", "person_id": rosa["id"]}, "José"],
                   "siblings": [{"name": "Truco", "person_id": ajena["id"]}]}})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["partner_person_id"] == ana_in_erwin["id"]
    assert me["family"]["siblings"][0]["person_id"] is None   # no se puede enlazar un cofre ajeno
    # Luis ve a Erwin: Anabel enlaza a SU cofre de Anabel; Rosa (sin cuenta) no enlaza
    erwin_in_luis = [p for p in client.get("/api/people", headers=luis).json() if p["name"] == "Erwin Enlace"][0]
    about = client.get(f"/api/people/{erwin_in_luis['id']}", headers=luis).json()["about"]
    ana_in_luis = [p for p in client.get("/api/people", headers=luis).json() if p["name"] == "Anabel Enlace"][0]
    assert about["partner"] == {"name": "Anabel", "person_id": ana_in_luis["id"], "is_you": False}
    assert about["family"]["parents"][0] == {"name": "Rosa", "person_id": None, "is_you": False}
    # Anabel ve a Erwin: la pareja es ella
    erwin_in_ana = [p for p in client.get("/api/people", headers=anabel).json() if p["name"] == "Erwin Enlace"][0]
    assert client.get(f"/api/people/{erwin_in_ana['id']}", headers=anabel).json()["about"]["partner"]["is_you"] is True


def test_avisos_al_etiquetar_y_comentar(monkeypatch):
    sent = []
    monkeypatch.setattr("app.routers.notifications.send_email", lambda to, subject, *a, **k: sent.append((to, subject)) or True)
    felix = register("Félix Aviso", "felixav@example.com")
    client.patch("/api/me", headers=felix, json={"full_name": "Félix Aviso", "username": "felix_av"})
    erwin = register("Erwin Aviso", "erwinav@example.com")
    client.patch("/api/me", headers=erwin, json={"full_name": "Erwin Aviso", "username": "erwin_av"})
    _connect(felix, "felix_av", erwin, "amistad")
    erwin_in_felix = [p for p in client.get("/api/people", headers=felix).json() if p["name"] == "Erwin Aviso"][0]
    sin_cuenta = add_person(felix, "Bebé", "hijo/a")
    m = save(felix, "Asado del domingo", people=[erwin_in_felix, sin_cuenta])
    # Erwin recibe aviso y correo; nadie más
    n = client.get("/api/notifications", headers=erwin).json()
    assert n["unread"] == 1 and n["items"][0]["kind"] == "memory_tag"
    assert n["items"][0]["actor_name"] == "Félix Aviso" and n["items"][0]["memory_title"] == "Asado del domingo"
    assert sent == [("erwinav@example.com", "Félix Aviso guardó un recuerdo contigo")]
    assert client.get("/api/notifications", headers=felix).json()["unread"] == 0
    # Volver a guardar el recuerdo sin etiquetas nuevas no repite el aviso
    client.put(f"/api/memories/{m['id']}", headers=felix, json={"title": "Asado", "person_ids": [erwin_in_felix["id"]]})
    assert client.get("/api/notifications", headers=erwin).json()["unread"] == 1 and len(sent) == 1
    # Abrir el recuerdo lo marca como leído
    client.get(f"/api/memories/{m['id']}", headers=erwin)
    assert client.get("/api/notifications", headers=erwin).json()["unread"] == 0
    # Erwin comenta: Félix recibe aviso (sin correo)
    client.post(f"/api/memories/{m['id']}/comments", headers=erwin, json={"body": "¡Qué día!"})
    nf = client.get("/api/notifications", headers=felix).json()
    assert nf["unread"] == 1 and nf["items"][0]["kind"] == "comment" and len(sent) == 1
    client.post("/api/notifications/read", headers=felix)
    assert client.get("/api/notifications", headers=felix).json()["unread"] == 0
    # Si Félix borra el recuerdo, el aviso desaparece
    client.delete(f"/api/memories/{m['id']}", headers=felix)
    assert client.get("/api/notifications", headers=erwin).json()["items"] == []


def test_avisos_en_el_movil(monkeypatch):
    import app.push as push
    from pywebpush import WebPushException

    sent = []
    gone = set()

    class Resp:
        status_code = 410

    def fake_webpush(info, data, **kw):
        if info["endpoint"] in gone:
            raise WebPushException("Gone", response=Resp())
        sent.append((info["endpoint"], __import__("json").loads(data)))

    monkeypatch.setattr(push, "webpush", fake_webpush)
    monkeypatch.setattr("app.routers.notifications.send_email", lambda *a, **k: True)
    ana = register("Ana Push", "anapush@example.com")
    client.patch("/api/me", headers=ana, json={"full_name": "Ana Push", "username": "ana_push"})
    leo = register("Leo Push", "leopush@example.com")
    client.patch("/api/me", headers=leo, json={"full_name": "Leo Push", "username": "leo_push"})
    key = client.get("/api/push/key", headers=leo).json()["public_key"]
    assert len(key) > 80 and client.get("/api/push/key", headers=ana).json()["public_key"] == key
    sub = {"endpoint": "https://push.example/leo-movil", "keys": {"p256dh": "BPk", "auth": "xyz"}}
    assert client.post("/api/push/subscribe", headers=leo, json=sub).status_code == 204
    _connect(ana, "ana_push", leo, "amistad")     # Leo envía la solicitud; al aceptarla Ana, Leo recibe aviso
    assert sent[-1][1]["title"].startswith("¡Ana aceptó tu solicitud")
    leo_in_ana = [p for p in client.get("/api/people", headers=ana).json() if p["name"] == "Leo Push"][0]
    m = save(ana, "Playa", people=[leo_in_ana], kind="photo")
    assert sent[-1] == ("https://push.example/leo-movil",
                        {"title": "Ana guardó una foto contigo", "body": "«Playa»", "url": f"/recuerdo/{m['id']}",
                         "tag": f"memory-{m['id']}"})
    # Un móvil que ya no existe se borra solo
    gone.add(sub["endpoint"])
    client.post(f"/api/memories/{m['id']}/comments", headers=ana, json={"body": "¡Qué día!"})
    from app.database import SessionLocal
    from app.models import PushSubscription
    with SessionLocal() as db:
        assert db.query(PushSubscription).filter_by(endpoint=sub["endpoint"]).count() == 0
    # Darse de baja
    client.post("/api/push/subscribe", headers=leo, json=sub)
    assert client.post("/api/push/unsubscribe", headers=leo, json={"endpoint": sub["endpoint"]}).status_code == 204



def test_edad_en_los_recuerdos():
    """birth_date viaja en `people` para calcular la edad, pero solo al autor o a la propia persona."""
    ana = register("Ana Edad", "anaedad@example.com")
    client.patch("/api/me", headers=ana, json={"full_name": "Ana Edad", "username": "ana_edad"})
    leo = register("Leo Edad", "leoedad@example.com")
    _connect(ana, "ana_edad", leo, "amistad")
    leo_in_ana = [p for p in client.get("/api/people", headers=ana).json() if p["name"] == "Leo Edad"][0]
    client.put(f"/api/people/{leo_in_ana['id']}", headers=ana,
               json={"name": "Leo Edad", "relation": "amistad", "birth_date": "1990-05-04"})
    sobri = add_person(ana, "Allison", "familia", birth_date="2023-02-10")
    m = save(ana, "Primer día de playa", people=[leo_in_ana, sobri], happened_on="2024-05-10")
    mine = next(x for x in client.get("/api/memories", headers=ana).json() if x["id"] == m["id"])
    assert {p["name"]: p["birth_date"] for p in mine["people"]} == {"Leo Edad": "1990-05-04", "Allison": "2023-02-10"}
    # Leo ve su propio cumpleaños, pero no el de Allison
    theirs = next(x for x in client.get("/api/memories", headers=leo).json() if x["id"] == m["id"])
    assert {p["name"]: p["birth_date"] for p in theirs["people"]} == {"Leo Edad": "1990-05-04", "Allison": None}

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



def test_solicitud_con_mensaje():
    a = register("Mara Mensaje", "mara@x.com")
    b = register("Nico Nota", "nico@x.com")
    client.patch("/api/me", headers=b, json={"full_name": "Nico Nota", "username": "niconota"})
    bid = client.get("/api/connect/lookup?q=@niconota", headers=a).json()["id"]
    largo = {"to_user_id": bid, "relation": "amistad", "message": "x" * 121}
    assert client.post("/api/connect/requests", headers=a, json=largo).status_code == 422
    r = client.post("/api/connect/requests", headers=a, json={
        "to_user_id": bid, "relation": "amistad", "message": "   ¡Por fin te encuentro! 💛  "})
    assert r.status_code == 201, r.text
    assert r.json()["message"] == "¡Por fin te encuentro! 💛"
    visto = client.get(f"/api/connect/requests/{r.json()['id']}", headers=b).json()
    assert visto["message"] == "¡Por fin te encuentro! 💛"
    assert client.get("/api/connect/requests", headers=b).json()["incoming"][0]["message"] == "¡Por fin te encuentro! 💛"
    # Solo espacios = sin mensaje
    client.delete(f"/api/connect/requests/{r.json()['id']}", headers=a)
    r2 = client.post("/api/connect/requests", headers=a, json={"to_user_id": bid, "relation": "amistad", "message": "   "})
    assert r2.json()["message"] is None

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
    r = client.get("/api/cron/capsules").json()
    assert (r["pending"], r["sent"]) == (1, 1) and "on_this_day" in r
    assert mails == [("leo@x.com", "¡Tu cápsula del tiempo ya se puede abrir! 🎉")]
    r = client.get("/api/cron/capsules").json()
    assert (r["pending"], r["sent"]) == (0, 0)

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


# ---------- Un día como hoy ----------
def _years_back(d, n):
    """El mismo día y mes de hace n años (el 29 de febrero pasa al 28 si ese año no es bisiesto)."""
    try:
        return d.replace(year=d.year - n)
    except ValueError:
        return d.replace(year=d.year - n, day=28)


def test_un_dia_como_hoy():
    from datetime import timedelta
    from app.on_this_day import utc_today
    from app.database import SessionLocal
    from app.models import Memory

    hoy = utc_today()
    eva = register("Eva Hoy", "evahoy@example.com")
    otro = register("Otro Hoy", "otrohoy@example.com")
    hace2 = save(eva, "Primer día de playa", happened_on=_years_back(hoy, 2).isoformat())
    save(eva, "Hoy mismo", happened_on=hoy.isoformat())
    save(eva, "Otro día", happened_on=_years_back(hoy - timedelta(days=3), 2).isoformat())
    save(otro, "No es mío", happened_on=_years_back(hoy, 2).isoformat())
    sin_fecha = save(eva, "Sin fecha")  # cuenta el día en que se guardó: lo movemos a hace 3 años
    with SessionLocal() as db:
        m = db.get(Memory, sin_fecha["id"])
        m.created_at = m.created_at.replace(year=_years_back(hoy, 3).year, month=_years_back(hoy, 3).month,
                                            day=_years_back(hoy, 3).day)
        db.commit()

    r = client.get("/api/memories/on-this-day", headers=eva)
    assert r.status_code == 200, r.text
    assert [m["title"] for m in r.json()] == ["Sin fecha", "Primer día de playa"]  # del más antiguo al más reciente
    assert r.json()[1]["id"] == hace2["id"] and r.json()[1]["people"] == []
    # La fecha local del móvil se acepta con ±1 día; si no, se usa la del servidor
    assert [m["title"] for m in client.get(f"/api/memories/on-this-day?today={hoy.isoformat()}", headers=eva).json()]         == ["Sin fecha", "Primer día de playa"]
    lejos = (hoy + timedelta(days=10)).isoformat()
    assert len(client.get(f"/api/memories/on-this-day?today={lejos}", headers=eva).json()) == 2
    manana = (hoy + timedelta(days=1)).isoformat()
    assert client.get(f"/api/memories/on-this-day?today={manana}", headers=eva).json() == []
    assert client.get("/api/memories/on-this-day", headers=otro).json()[0]["title"] == "No es mío"


def test_aviso_un_dia_como_hoy(monkeypatch):
    from datetime import date
    import app.push as push
    from app.database import SessionLocal
    from app.on_this_day import notify_on_this_day

    sent = []
    monkeypatch.setattr(push, "webpush", lambda info, data, **kw: sent.append((info["endpoint"], __import__("json").loads(data))))
    flo = register("Flo Hitos", "flohoy@example.com")
    sub = {"endpoint": "https://push.example/flo-movil", "keys": {"p256dh": "BPk", "auth": "xyz"}}
    assert client.post("/api/push/subscribe", headers=flo, json=sub).status_code == 204
    save(flo, "Bisiesto", happened_on="2024-02-29")
    save(flo, "Nieve", happened_on="2025-02-28")
    save(flo, "Marzo", happened_on="2025-03-01")
    # 28 de febrero de 2027 (no bisiesto): también salen los del 29 de febrero
    with SessionLocal() as db:
        assert notify_on_this_day(db, today=date(2027, 2, 28)) == 1
    assert sent == [("https://push.example/flo-movil", {
        "title": "Un día como hoy 💛", "body": "Hace 3 años: «Bisiesto» y 1 recuerdo más", "url": "/",
        "tag": "on-this-day-2027-02-28"})]
    # Un solo recuerdo, sin "y N más"; nada si no hay ninguno
    sent.clear()
    with SessionLocal() as db:
        assert notify_on_this_day(db, today=date(2026, 3, 1)) == 1
        assert notify_on_this_day(db, today=date(2026, 7, 15)) == 0
    assert [s[1]["body"] for s in sent] == ["Hace 1 año: «Marzo»"]
    # En un año bisiesto, el 28 de febrero no incluye los del 29
    sent.clear()
    with SessionLocal() as db:
        notify_on_this_day(db, today=date(2028, 2, 28))
    assert sent[0][1]["body"] == "Hace 3 años: «Nieve»"
    # Va dentro de la tarea diaria, y un fallo ahí no rompe lo de las cápsulas
    def boom(db):
        raise RuntimeError("fallo")
    monkeypatch.setattr("app.routers.capsules.notify_on_this_day", boom)
    r = client.get("/api/cron/capsules")
    assert r.status_code == 200 and r.json()["on_this_day"] == 0
    client.post("/api/push/unsubscribe", headers=flo, json={"endpoint": sub["endpoint"]})


# ---------- Hitos ----------
def test_hitos():
    gus = register("Gus Hitos", "gushitos@example.com")
    m = save(gus, "Sus primeros pasos", milestone="  Primeros pasos  ")
    assert m["milestone"] == "Primeros pasos"
    assert client.get("/api/memories", headers=gus).json()[0]["milestone"] == "Primeros pasos"
    base = {"title": "Sus primeros pasos", "description": "Una nota", "person_ids": []}
    # Editar sin enviar el hito no lo toca
    r = client.put(f"/api/memories/{m['id']}", headers=gus, json=base)
    assert r.status_code == 200 and r.json()["milestone"] == "Primeros pasos"
    r = client.put(f"/api/memories/{m['id']}", headers=gus, json={**base, "milestone": "Primera palabra"})
    assert r.json()["milestone"] == "Primera palabra"
    r = client.put(f"/api/memories/{m['id']}", headers=gus, json={**base, "milestone": None})
    assert r.json()["milestone"] is None
    r = client.put(f"/api/memories/{m['id']}", headers=gus, json={**base, "milestone": "   "})
    assert r.json()["milestone"] is None
    assert client.put(f"/api/memories/{m['id']}", headers=gus, json={**base, "milestone": "x" * 41}).status_code == 422
    r = client.post("/api/memories", headers=gus, data={"kind": "text", "title": "Largo", "description": "a", "milestone": "x" * 41})
    assert r.status_code == 422
    assert save(gus, "Sin hito", milestone="")["milestone"] is None
    assert save(gus, "Justo 40", milestone="y" * 40)["milestone"] == "y" * 40
