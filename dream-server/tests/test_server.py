"""Basic tests for dream-server endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from dream_server.server import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "device" in data


def test_list_models(client: TestClient) -> None:
    resp = client.get("/api/models")
    assert resp.status_code == 200
    models = resp.json()
    assert isinstance(models, list)
    assert len(models) >= 1
    assert models[0]["id"] == "mobilenet_v2"


def test_model_info(client: TestClient) -> None:
    resp = client.get("/api/model-info/mobilenet_v2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_id"] == "mobilenet_v2"
    assert "layers" in data
    assert isinstance(data["layers"], list)


def test_model_info_unknown(client: TestClient) -> None:
    resp = client.get("/api/model-info/nonexistent")
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
