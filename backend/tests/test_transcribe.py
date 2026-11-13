def test_transcribes_audio(client, auth_headers):
    r = client.post("/v1/transcribe", headers=auth_headers, data={"language": "es"},
                    files={"audio": ("memo.m4a", b"\x00" * 2048, "audio/m4a")})
    assert r.status_code == 200
    assert "200 amperios" in r.json()["transcript"]


def test_rejects_non_audio(client, auth_headers):
    r = client.post("/v1/transcribe", headers=auth_headers, files={"audio": ("x.txt", b"hello" * 50, "text/plain")})
    assert r.status_code == 400 and r.json()["error"] == "audio_invalid"


def test_rejects_empty_audio(client, auth_headers):
    r = client.post("/v1/transcribe", headers=auth_headers, files={"audio": ("m.m4a", b"", "audio/m4a")})
    assert r.status_code == 400


def test_requires_sign_in(client):
    r = client.post("/v1/transcribe", files={"audio": ("m.m4a", b"\x00" * 2048, "audio/m4a")})
    assert r.status_code == 401
