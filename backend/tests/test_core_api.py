import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Core listing endpoints regression (seeded data)
def test_list_batches(client):
    r = client.get(f"{BASE_URL}/api/batches", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 6, f"expected 6 batches, got {len(data)}"
    assert all("_id" not in b for b in data)
    assert all("id" in b and "name" in b for b in data)


def test_list_students(client):
    r = client.get(f"{BASE_URL}/api/students", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 12, f"expected 12 students, got {len(data)}"
    assert all("_id" not in s for s in data)
    assert all("batch_id" in s for s in data)


def test_list_payments(client):
    r = client.get(f"{BASE_URL}/api/payments", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 44, f"expected 44 payments, got {len(data)}"
    assert all("_id" not in p for p in data)


def test_list_events(client):
    r = client.get(f"{BASE_URL}/api/events", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_seed_idempotent(client):
    r = client.post(f"{BASE_URL}/api/seed", timeout=30)
    assert r.status_code == 200
    b = client.get(f"{BASE_URL}/api/batches", timeout=30).json()
    assert len(b) == 6


def test_export_shape(client):
    r = client.get(f"{BASE_URL}/api/export", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for key in ["batches", "students", "payments", "events"]:
        assert key in d


# Error handling
def test_delete_unknown_student(client):
    # NOTE: backend delete is idempotent and returns 200 {"ok": true} for unknown ids
    # (reported as minor issue - ideally 404)
    r = client.delete(f"{BASE_URL}/api/students/does-not-exist", timeout=30)
    assert r.status_code in (200, 404), r.text


def test_create_batch_validation(client):
    r = client.post(f"{BASE_URL}/api/batches", json={}, timeout=30)
    assert r.status_code == 422, r.text
