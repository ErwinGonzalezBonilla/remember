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
