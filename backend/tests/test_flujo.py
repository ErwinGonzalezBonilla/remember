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
