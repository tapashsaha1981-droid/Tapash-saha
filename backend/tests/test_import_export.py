"""Import/Export regression tests for TAPASH SIR fee-management app (iteration 2)."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# DESTRUCTIVE MODULE: these tests wipe the database (reset + seed + import).
# The DB now holds the user's REAL imported data (16 batches / 629 students /
# 2088 payments). Skipped unless explicitly enabled AND a snapshot/restore is done.
pytestmark = pytest.mark.skipif(
    os.environ.get("ALLOW_DESTRUCTIVE_TESTS") != "1",
    reason="Destructive (reset/seed/import) - set ALLOW_DESTRUCTIVE_TESTS=1 to run; wipes real user data",
)


@pytest.fixture(scope="module", autouse=True)
def clean_state(client):
    """Snapshot real data, run on a seeded DB, then restore the snapshot."""
    snapshot = client.get(f"{BASE_URL}/api/export", timeout=60).json()
    client.post(f"{BASE_URL}/api/reset", timeout=30)
    client.post(f"{BASE_URL}/api/seed", timeout=60)
    yield
    client.post(f"{BASE_URL}/api/import", json={
        "batches": snapshot.get("batches") or [],
        "students": snapshot.get("students") or [],
        "payments": snapshot.get("payments") or [],
        "events": snapshot.get("events") or [],
        "activities": snapshot.get("activities") or [],
        "settings": snapshot.get("settings"),
    }, timeout=180)


# ---------- GET /api/export ----------
class TestExport:
    def test_export_shape(self, client):
        r = client.get(f"{BASE_URL}/api/export", timeout=30)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        for key in ("exported_at", "batches", "students", "payments", "events"):
            assert key in d, f"missing {key}"
        assert isinstance(d["batches"], list) and isinstance(d["students"], list)
        assert len(d["batches"]) == 6
        assert len(d["students"]) == 12
        assert len(d["payments"]) > 0
        # no mongo _id leakage
        for coll in ("batches", "students", "payments", "events"):
            for item in d[coll]:
                assert "_id" not in item


# ---------- POST /api/import ----------
class TestImport:
    def test_import_valid_roundtrip(self, client):
        exported = client.get(f"{BASE_URL}/api/export", timeout=30).json()
        payload = {
            "batches": exported["batches"],
            "students": exported["students"],
            "payments": exported["payments"],
        }
        r = client.post(f"{BASE_URL}/api/import", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["ok"]
        assert d["counts"]["batches"] == len(payload["batches"])
        assert d["counts"]["students"] == len(payload["students"])
        assert d["counts"]["payments"] == len(payload["payments"])
        assert d["counts"]["events"] == 0
        # verify persistence
        after = client.get(f"{BASE_URL}/api/export", timeout=30).json()
        assert len(after["batches"]) == len(payload["batches"])
        assert len(after["students"]) == len(payload["students"])
        assert len(after["payments"]) == len(payload["payments"])
        assert {b["id"] for b in after["batches"]} == {b["id"] for b in payload["batches"]}

    def test_import_malformed_types_sanitized(self, client):
        """payments as dict, events as number -> 200 with sanitized counts (no 422)."""
        bid = str(uuid.uuid4())
        payload = {
            "batches": [{"id": bid, "name": "TEST_B", "subject": "Math", "class_time": "5 PM", "monthly_fee": 500}],
            "students": [{"id": str(uuid.uuid4()), "name": "TEST_S", "batch_id": bid}, "junkstring", None],
            "payments": {"bad": "dict"},
            "events": 5,
        }
        r = client.post(f"{BASE_URL}/api/import", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:400]
        c = r.json()["counts"]
        assert c == {"batches": 1, "students": 1, "payments": 0, "events": 0}, c
        after = client.get(f"{BASE_URL}/api/export", timeout=30).json()
        assert len(after["batches"]) == 1 and len(after["students"]) == 1
        assert after["payments"] == [] and after["events"] == []

    def test_import_strips_mongo_id(self, client):
        bid = str(uuid.uuid4())
        payload = {"batches": [{"_id": "abc", "id": bid, "name": "TEST_B2", "monthly_fee": 100}],
                   "students": [], "payments": []}
        r = client.post(f"{BASE_URL}/api/import", json=payload, timeout=60)
        assert r.status_code == 200
        after = client.get(f"{BASE_URL}/api/export", timeout=30).json()
        assert len(after["batches"]) == 1
        assert "_id" not in after["batches"][0]
        assert after["batches"][0]["id"] == bid

    def test_import_empty_payload(self, client):
        r = client.post(f"{BASE_URL}/api/import", json={}, timeout=60)
        assert r.status_code == 200, r.text[:400]
        assert r.json()["counts"] == {"batches": 0, "students": 0, "payments": 0, "events": 0}

    def test_import_non_object_body(self, client):
        r = client.post(f"{BASE_URL}/api/import", data="not json", timeout=30)
        assert r.status_code in (400, 422), f"got {r.status_code}"


# ---------- Core list endpoints regression ----------
class TestCoreEndpoints:
    @pytest.mark.parametrize("path", ["/api/batches", "/api/students", "/api/payments", "/api/events"])
    def test_list_endpoints(self, client, path):
        r = client.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)
