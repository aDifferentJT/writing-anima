"""Tests for the settings API endpoints."""
import uuid
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.settings import router
from src.database.settings import Model, Settings


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_make_app())


MOCK_MODEL = Model(
    id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
    name="Test Model",
    provider="openai",
    model="gpt-4o",
    description="A test model",
    base_url="https://api.openai.com/v1",
    api_key_env="OPENAI_API_KEY",
    temperature=0.7,
    max_iterations=5,
)

MOCK_SETTINGS = Settings(models=[MOCK_MODEL])


def test_form_definition_returns_form_type(client: TestClient) -> None:
    with patch("src.api.settings.settings.get", return_value=MOCK_SETTINGS):
        resp = client.get("/api/settings/form-definition")
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FORM_DEFINITION"
    assert body["status"] == 200
    assert "form" in body


def test_form_definition_has_schema_with_defaults(client: TestClient) -> None:
    with patch("src.api.settings.settings.get", return_value=MOCK_SETTINGS):
        resp = client.get("/api/settings/form-definition")
    form = resp.json()["form"]
    assert form["type"] == "object"
    assert "models" in form["properties"]
    defaults = form["properties"]["models"]["default"]
    assert isinstance(defaults, list)
    assert len(defaults) == 1
    assert defaults[0]["name"] == "Test Model"


def test_form_definition_redacts_api_key_env(client: TestClient) -> None:
    with patch("src.api.settings.settings.get", return_value=MOCK_SETTINGS):
        resp = client.get("/api/settings/form-definition")
    defaults = resp.json()["form"]["properties"]["models"]["default"]
    # api_key_env should be replaced with a bool (env var not set in tests)
    assert isinstance(defaults[0]["api_key_env"], bool)


def test_post_form_success(client: TestClient) -> None:
    updated = Settings(models=[])
    with patch("src.api.settings.settings.update", return_value=updated) as mock_update:
        resp = client.post("/api/settings/form", json={"models": []})
        mock_update.assert_called_once_with({"models": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "SUCCESS"
    assert body["status"] == 200
    assert "data" in body


def test_post_form_does_not_overwrite_api_key_env_with_bool(client: TestClient) -> None:
    updated = Settings(models=[])
    with patch("src.api.settings.settings.update", return_value=updated) as mock_update:
        resp = client.post(
            "/api/settings/form",
            json={"models": [{"name": "M", "api_key_env": True}]},
        )
        # api_key_env=True (a redacted bool) must be stripped before update
        called_body = mock_update.call_args[0][0]
        assert called_body["models"][0].get("api_key_env") is None
    assert resp.status_code == 200


def test_post_form_validation_error(client: TestClient) -> None:
    def bad_update(data: Any) -> Any:
        Settings.model_validate({"models": "not-a-list"})

    with patch("src.api.settings.settings.update", side_effect=bad_update):
        resp = client.post("/api/settings/form", json={"models": "not-a-list"})
    assert resp.status_code == 200  # pydantic-forms expects 200 with type=VALIDATION_ERRORS
    body = resp.json()
    assert body["type"] == "VALIDATION_ERRORS"
    assert isinstance(body["validation_errors"], list)
