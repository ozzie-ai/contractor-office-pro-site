import pytest

from .conftest import OTHER_KEY, USER_WITHOUT_BUSINESS, make_token

BODY = {"description": "Cambiar el panel de 100 a 200 amperios"}


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer not-a-jwt"])
def test_missing_or_malformed_token_is_denied(client, header):
    headers = {"Authorization": header} if header is not None else {}
    r = client.post("/v1/interpret", json=BODY, headers=headers)
    assert r.status_code == 401
    assert r.json() == {"error": "access_denied", "message": "Sign in again."}


@pytest.mark.parametrize("token", [
    make_token(USER_WITHOUT_BUSINESS, key=OTHER_KEY),                   # signed by someone else
    make_token(USER_WITHOUT_BUSINESS, issuer="https://evil.example"),  # wrong issuer
    make_token(USER_WITHOUT_BUSINESS, expires_in=-60),                  # expired
])
def test_forged_or_expired_tokens_are_denied(client, token):
    r = client.post("/v1/interpret", json=BODY, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_valid_user_without_business_gets_403(client):
    r = client.post("/v1/interpret", json=BODY, headers={"Authorization": f"Bearer {make_token(USER_WITHOUT_BUSINESS)}"})
    assert r.status_code == 403
    assert r.json()["error"] == "no_business"
