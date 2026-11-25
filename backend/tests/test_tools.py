import base64

from app.errors import ApiError

IMG = {"content_type": "image/jpeg", "data_base64": base64.b64encode(b"\xff\xd8" + b"0" * 400).decode()}


def test_identifies_tools_and_cleans_output(client, auth_headers):
    r = client.post("/v1/tools/identify", json={"images": [IMG, IMG], "language": "es"}, headers=auth_headers)
    assert r.status_code == 200
    tools = r.json()["result"]["tools"]
    assert [t["name_en"] for t in tools] == ["Cordless drill", "Tape measure"], "bad photo index and blank names dropped"
    assert tools[0]["brand"] == "DeWalt" and tools[0]["serial_number"] is None, "blank serial becomes null"
    assert tools[1]["quantity"] == 1, "quantity is at least 1"


def test_tools_requires_sign_in_and_images(client, auth_headers):
    assert client.post("/v1/tools/identify", json={"images": [IMG]}).status_code == 401
    assert client.post("/v1/tools/identify", json={"images": []}, headers=auth_headers).status_code == 400
    too_many = client.post("/v1/tools/identify", json={"images": [IMG] * 11}, headers=auth_headers)
    assert too_many.status_code == 400


def test_tools_rejects_bad_images_and_hides_provider_errors(client, auth_headers, fakes):
    bad = client.post("/v1/tools/identify", json={"images": [{**IMG, "data_base64": "!" * 200}]}, headers=auth_headers)
    assert bad.status_code == 400 and bad.json()["error"] == "image_invalid"
    fakes["interpreter"].error = ApiError(502, "ai_provider_failed", "The AI service had a problem. Try again.")
    r = client.post("/v1/tools/identify", json={"images": [IMG]}, headers=auth_headers)
    assert r.status_code == 502 and r.json() == {"error": "ai_provider_failed", "message": "The AI service had a problem. Try again."}
