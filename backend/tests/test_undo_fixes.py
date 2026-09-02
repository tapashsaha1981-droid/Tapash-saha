"""Iteration 8: id-passthrough on create + 404 on delete-unknown-id (non-destructive)."""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- DELETE unknown id -> 404 ----------
@pytest.mark.parametrize("coll", ["batches", "students", "payments", "events"])
def test_delete_unknown_id_returns_404(client, coll):
    r = client.delete(f"{BASE_URL}/api/{coll}/{uuid.uuid4()}")
    assert r.status_code == 404, f"{coll}: {r.status_code} {r.text[:200]}"


# ---------- id passthrough + auto-generate ----------
def test_batch_id_passthrough_and_autogen(client):
    forced = f"TESTQA-{uuid.uuid4()}"
    r = client.post(f"{BASE_URL}/api/batches", json={
        "id": forced, "created_at": "2020-01-01T00:00:00+00:00",
        "name": "TEST_QA_pass", "subject": "QA", "monthly_fee": 100})
    assert r.status_code == 200, r.text[:300]
    assert r.json()["id"] == forced
    assert r.json()["created_at"] == "2020-01-01T00:00:00+00:00"
    got = client.get(f"{BASE_URL}/api/batches").json()
    assert any(b["id"] == forced for b in got)

    r2 = client.post(f"{BASE_URL}/api/batches", json={"name": "TEST_QA_auto", "monthly_fee": 0})
    assert r2.status_code == 200, r2.text[:300]
    auto_id = r2.json()["id"]
    assert uuid.UUID(auto_id)

    for bid in (forced, auto_id):
        assert client.delete(f"{BASE_URL}/api/batches/{bid}").status_code == 200
    got = client.get(f"{BASE_URL}/api/batches").json()
    assert not any(b["id"] in (forced, auto_id) for b in got)


def test_student_payment_id_passthrough(client):
    b = client.post(f"{BASE_URL}/api/batches", json={"name": "TEST_QA_sp", "monthly_fee": 500}).json()
    sid = f"TESTQA-{uuid.uuid4()}"
    pid = f"TESTQA-{uuid.uuid4()}"
    try:
        rs = client.post(f"{BASE_URL}/api/students", json={
            "id": sid, "created_at": "2019-05-05T00:00:00+00:00",
            "name": "TEST_QA_stu", "batch_id": b["id"], "monthly_fee": 500, "join_month": "2026-09"})
        assert rs.status_code == 200, rs.text[:300]
        assert rs.json()["id"] == sid
        assert rs.json()["batch_id"] == b["id"]

        rp = client.post(f"{BASE_URL}/api/payments", json={
            "id": pid, "student_id": sid, "month": "2026-09", "amount": 500, "fee_snapshot": 500})
        assert rp.status_code == 200, rp.text[:300]
        assert rp.json()["id"] == pid
        assert rp.json()["student_id"] == sid

        # auto-generate still works
        rp2 = client.post(f"{BASE_URL}/api/payments", json={
            "student_id": sid, "month": "2026-08", "amount": 10})
        assert rp2.status_code == 200
        auto_pid = rp2.json()["id"]
        assert uuid.UUID(auto_pid)
        assert client.delete(f"{BASE_URL}/api/payments/{auto_pid}").status_code == 200

        rs2 = client.post(f"{BASE_URL}/api/students", json={
            "name": "TEST_QA_stu2", "batch_id": b["id"], "monthly_fee": 1})
        assert rs2.status_code == 200
        auto_sid = rs2.json()["id"]
        assert uuid.UUID(auto_sid)
        assert client.delete(f"{BASE_URL}/api/students/{auto_sid}").status_code == 200
    finally:
        client.delete(f"{BASE_URL}/api/payments/{pid}")
        client.delete(f"{BASE_URL}/api/students/{sid}")
        client.delete(f"{BASE_URL}/api/batches/{b['id']}")


# ---------- baseline / orphan integrity ----------
def test_no_orphan_payments_and_baseline(client):
    students = client.get(f"{BASE_URL}/api/students").json()
    payments = client.get(f"{BASE_URL}/api/payments").json()
    batches = client.get(f"{BASE_URL}/api/batches").json()
    sids = {s["id"] for s in students}
    orphans = [p["id"] for p in payments if p["student_id"] not in sids]
    assert orphans == [], f"orphan payments: {orphans[:10]}"
    bids = {b["id"] for b in batches}
    assert [s["id"] for s in students if s["batch_id"] not in bids] == []
    print(f"counts: {len(batches)} batches / {len(students)} students / {len(payments)} payments")
