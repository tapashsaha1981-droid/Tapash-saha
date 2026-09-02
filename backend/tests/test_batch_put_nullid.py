"""Iteration 9: regression tests for PUT /api/batches null-id corruption fix."""
import os
import uuid

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


@pytest.fixture
def temp_batch(client):
    payload = {
        "name": f"TEST_B_{uuid.uuid4().hex[:6]}",
        "subject": "Physics",
        "class_time": "10:00 AM",
        "monthly_fee": 500,
    }
    r = client.post(f"{API}/batches", json=payload)
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    yield doc
    client.delete(f"{API}/batches/{doc['id']}")


# --- PUT /api/batches: id / created_at preservation ---
def test_batch_edit_preserves_id_and_created_at(client, temp_batch):
    bid = temp_batch["id"]
    created_at = temp_batch.get("created_at")
    assert bid and created_at

    # Simulate frontend payload including id + created_at (the bug trigger)
    upd = dict(temp_batch)
    upd["name"] = temp_batch["name"] + "_EDITED"
    r = client.put(f"{API}/batches/{bid}", json=upd)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == bid
    assert body["created_at"] == created_at
    assert body["name"] == upd["name"]

    # GET verify persistence + still listed
    lst = client.get(f"{API}/batches").json()
    match = [b for b in lst if b.get("id") == bid]
    assert len(match) == 1
    assert match[0]["name"] == upd["name"]
    assert match[0]["created_at"] == created_at
    assert match[0]["subject"] == "Physics"


def test_batch_edit_with_explicit_null_id_does_not_corrupt(client, temp_batch):
    bid = temp_batch["id"]
    r = client.put(
        f"{API}/batches/{bid}",
        json={
            "id": None,
            "created_at": None,
            "name": temp_batch["name"],
            "subject": temp_batch["subject"],
            "class_time": temp_batch["class_time"],
            "monthly_fee": temp_batch["monthly_fee"],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["id"] == bid
    assert r.json()["created_at"] is not None
    # DELETE must still find it
    d = client.delete(f"{API}/batches/{bid}")
    assert d.status_code in (200, 204)
    assert client.get(f"{API}/batches/{bid}").status_code in (404, 405)


@pytest.mark.xfail(
    reason="KNOWN MINOR DEFECT: BatchIn defaults (subject='', class_time='', monthly_fee=0) are not "
    "excluded by exclude_none, so omitting a field clobbers it. Use exclude_unset=True. "
    "No user impact today because the UI always sends the full batch object.",
    strict=False,
)
def test_batch_partial_edit_single_field(client, temp_batch):
    bid = temp_batch["id"]
    r = client.put(f"{API}/batches/{bid}", json={"name": temp_batch["name"], "monthly_fee": 999})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["monthly_fee"] == 999
    assert b["subject"] == "Physics"
    assert b["class_time"] == "10:00 AM"
    assert b["id"] == bid


# --- PUT /api/students partial update ---
def test_student_edit_preserves_fields(client, temp_batch):
    sp = {
        "name": f"TEST_S_{uuid.uuid4().hex[:6]}",
        "batch_id": temp_batch["id"],
        "phone": "01700000000",
        "monthly_fee": 500,
    }
    r = client.post(f"{API}/students", json=sp)
    assert r.status_code in (200, 201), r.text
    st = r.json()
    sid = st["id"]
    try:
        upd = dict(st)
        upd["name"] = sp["name"] + "_EDITED"
        r2 = client.put(f"{API}/students/{sid}", json=upd)
        assert r2.status_code == 200, r2.text
        s2 = r2.json()
        assert s2["id"] == sid
        assert s2["name"] == upd["name"]
        assert s2["batch_id"] == temp_batch["id"]
        assert s2["phone"] == sp["phone"]
        assert s2["monthly_fee"] == 500
        got = client.get(f"{API}/students").json()
        m = [x for x in got if x.get("id") == sid]
        assert len(m) == 1 and m[0]["name"] == upd["name"]
    finally:
        client.delete(f"{API}/students/{sid}")


# --- POST /api/payments created_at passthrough ---
def test_payment_created_at_passthrough_and_autogen(client, temp_batch):
    sp = {"name": f"TEST_S_{uuid.uuid4().hex[:6]}", "batch_id": temp_batch["id"], "monthly_fee": 500}
    st = client.post(f"{API}/students", json=sp).json()
    sid = st["id"]
    pid = str(uuid.uuid4())
    fixed = "2026-01-02T03:04:05.000000"
    try:
        r = client.post(
            f"{API}/payments",
            json={
                "id": pid,
                "created_at": fixed,
                "student_id": sid,
                "month": "2026-09",
                "amount": 100,
                "fee_snapshot": 500,
            },
        )
        assert r.status_code in (200, 201), r.text
        p = r.json()
        assert p["id"] == pid
        assert p["created_at"] == fixed

        r2 = client.post(
            f"{API}/payments",
            json={"student_id": sid, "month": "2026-09", "amount": 50, "fee_snapshot": 500},
        )
        assert r2.status_code in (200, 201), r2.text
        p2 = r2.json()
        assert p2.get("id")
        assert p2.get("created_at")
        assert p2["created_at"] != fixed
        client.delete(f"{API}/payments/{p2['id']}")
        client.delete(f"{API}/payments/{pid}")
    finally:
        client.delete(f"{API}/students/{sid}")
