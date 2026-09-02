"""Non-destructive regression suite for the code-quality refactor iteration.

Covers:
- module: server.py update_student (model_dump(exclude_none=True) partial update)
- module: server.py update_settings (exclude_none)
- module: server.py export_all
- module: all core routers respond (batches/students/payments/events/settings/activities)
NEVER calls POST /api/reset, POST /api/import. All created data is deleted.
"""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def real_batch_id(client):
    r = client.get(f"{API}/batches", timeout=30)
    assert r.status_code == 200
    batches = r.json()
    assert len(batches) > 0, "no batches in DB"
    return batches[0]["id"]


# ---------- endpoint smoke ----------
@pytest.mark.parametrize("path", ["/", "/batches", "/students", "/payments", "/events", "/settings", "/activities", "/export"])
def test_endpoints_respond(client, path):
    r = client.get(f"{API}{path}", timeout=60)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    assert '"_id"' not in r.text[:20000], f"{path} may leak mongo _id"


def test_real_data_counts(client):
    b = client.get(f"{API}/batches", timeout=30).json()
    s = client.get(f"{API}/students", timeout=60).json()
    p = client.get(f"{API}/payments", timeout=120).json()
    assert len(b) >= 16, f"expected >=16 batches, got {len(b)}"
    assert len(s) >= 600, f"expected >=600 students, got {len(s)}"
    assert len(p) >= 1500, f"expected >=1500 payments, got {len(p)}"


def test_export_contains_all_collections(client):
    r = client.get(f"{API}/export", timeout=120)
    assert r.status_code == 200
    data = r.json()
    for key in ["batches", "students", "payments", "events", "activities", "settings", "exported_at"]:
        assert key in data, f"missing {key} in export"
    assert isinstance(data["batches"], list) and len(data["batches"]) >= 16
    assert isinstance(data["students"], list) and len(data["students"]) >= 600
    assert isinstance(data["settings"], dict) and "org_name" in data["settings"]
    assert all("_id" not in d for d in data["batches"])
    assert all("_id" not in d for d in data["students"][:50])


# ---------- update_student partial update (exclude_none) ----------
def test_student_partial_update_preserves_other_fields(client, real_batch_id):
    created = client.post(f"{API}/students", json={
        "name": "TEST_Refactor QA",
        "phone": "9000000001",
        "batch_id": real_batch_id,
        "monthly_fee": 555,
    }, timeout=30)
    assert created.status_code == 200, created.text
    stu = created.json()
    sid = stu["id"]
    try:
        assert stu["name"] == "TEST_Refactor QA"
        assert stu["monthly_fee"] == 555

        # partial update: only phone
        upd = client.put(f"{API}/students/{sid}", json={"phone": "9000000002"}, timeout=30)
        assert upd.status_code == 200, upd.text
        body = upd.json()
        assert body["phone"] == "9000000002"
        assert body["name"] == "TEST_Refactor QA", "name must be unchanged by partial update"
        assert body["monthly_fee"] == 555
        assert body["batch_id"] == real_batch_id

        # GET verifies persistence
        got = client.get(f"{API}/students", timeout=60).json()
        fetched = next(x for x in got if x["id"] == sid)
        assert fetched["phone"] == "9000000002"
        assert fetched["name"] == "TEST_Refactor QA"
        assert fetched["monthly_fee"] == 555

        # empty payload should be a no-op and return the doc
        noop = client.put(f"{API}/students/{sid}", json={}, timeout=30)
        assert noop.status_code == 200
        assert noop.json()["name"] == "TEST_Refactor QA"
    finally:
        d = client.delete(f"{API}/students/{sid}", timeout=30)
        assert d.status_code == 200
        after = client.get(f"{API}/students", timeout=60).json()
        assert all(x["id"] != sid for x in after), "test student not cleaned up"


def test_student_update_unknown_id_404(client):
    r = client.put(f"{API}/students/does-not-exist-xyz", json={"phone": "9"}, timeout=30)
    assert r.status_code == 404, f"expected 404, got {r.status_code}"


# ---------- payment cumulative-total activity wording ----------
def test_payment_cumulative_total_marks_paid(client, real_batch_id):
    created = client.post(f"{API}/students", json={
        "name": "TEST_Cumulative QA", "phone": "9000000003",
        "batch_id": real_batch_id, "monthly_fee": 500,
    }, timeout=30).json()
    sid = created["id"]
    pay_ids = []
    try:
        p1 = client.post(f"{API}/payments", json={
            "student_id": sid, "month": "2026-09", "amount": 200, "fee_snapshot": 500,
        }, timeout=30)
        assert p1.status_code == 200, p1.text
        pay_ids.append(p1.json()["id"])
        acts = client.get(f"{API}/activities", timeout=30).json()
        assert any("Partial payment" in a["msg"] and "TEST_Cumulative QA" in a["msg"] for a in acts), \
            f"expected partial log, got {[a['msg'] for a in acts[:5]]}"

        p2 = client.post(f"{API}/payments", json={
            "student_id": sid, "month": "2026-09", "amount": 300, "fee_snapshot": 500,
        }, timeout=30)
        assert p2.status_code == 200
        pay_ids.append(p2.json()["id"])
        acts = client.get(f"{API}/activities", timeout=30).json()
        assert any(a["msg"] == "Marked paid: TEST_Cumulative QA" for a in acts), \
            f"cumulative top-up should log 'Marked paid', got {[a['msg'] for a in acts[:5]]}"

        # verify persistence via filtered GET
        mine = client.get(f"{API}/payments", params={"student_id": sid, "month": "2026-09"}, timeout=30).json()
        assert len(mine) == 2
        assert sum(x["amount"] for x in mine) == 500
    finally:
        for pid in pay_ids:
            client.delete(f"{API}/payments/{pid}", timeout=30)
        client.delete(f"{API}/students/{sid}", timeout=30)


# ---------- settings exclude_none ----------
def test_settings_partial_update_and_restore(client):
    original = client.get(f"{API}/settings", timeout=30).json()
    assert "org_name" in original
    try:
        r = client.put(f"{API}/settings", json={"org_name": "TEST_ORG_QA"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["org_name"] == "TEST_ORG_QA"
        # other settings untouched
        for k, v in original.items():
            if k not in ("org_name",):
                assert body.get(k) == v, f"setting {k} changed unexpectedly: {v} -> {body.get(k)}"
        # persisted
        again = client.get(f"{API}/settings", timeout=30).json()
        assert again["org_name"] == "TEST_ORG_QA"

        # empty payload no-op
        noop = client.put(f"{API}/settings", json={}, timeout=30)
        assert noop.status_code == 200
        assert noop.json()["org_name"] == "TEST_ORG_QA"
    finally:
        restore = {k: v for k, v in original.items() if k != "id" and v is not None}
        client.put(f"{API}/settings", json=restore, timeout=30)
        assert client.get(f"{API}/settings", timeout=30).json()["org_name"] == original["org_name"]


# ---------- events CRUD (cleaned up) ----------
def test_event_create_and_delete(client):
    r = client.post(f"{API}/events", json={
        "date": "2026-09-15", "title": "TEST_QA Event", "type": "holiday",
    }, timeout=30)
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["title"] == "TEST_QA Event"
    assert ev["date"] == "2026-09-15"
    listed = client.get(f"{API}/events", timeout=30).json()
    assert any(e["id"] == ev["id"] for e in listed)
    d = client.delete(f"{API}/events/{ev['id']}", timeout=30)
    assert d.status_code == 200
    after = client.get(f"{API}/events", timeout=30).json()
    assert all(e["id"] != ev["id"] for e in after)


# ---------- batch CRUD (cleaned up) ----------
def test_batch_crud_lifecycle(client):
    r = client.post(f"{API}/batches", json={
        "name": "TEST_QA Batch", "subject": "Physics", "class_time": "6 PM", "monthly_fee": 700,
    }, timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    bid = b["id"]
    try:
        assert b["name"] == "TEST_QA Batch"
        assert b["monthly_fee"] == 700
        upd = client.put(f"{API}/batches/{bid}", json={
            "name": "TEST_QA Batch2", "subject": "Physics", "class_time": "7 PM", "monthly_fee": 800,
        }, timeout=30)
        assert upd.status_code == 200
        listed = client.get(f"{API}/batches", timeout=30).json()
        found = next(x for x in listed if x["id"] == bid)
        assert found["name"] == "TEST_QA Batch2"
        assert found["monthly_fee"] == 800
    finally:
        client.delete(f"{API}/batches/{bid}", timeout=30)
        after = client.get(f"{API}/batches", timeout=30).json()
        assert all(x["id"] != bid for x in after)
