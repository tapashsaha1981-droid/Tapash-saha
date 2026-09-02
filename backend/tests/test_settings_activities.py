"""Tests for new settings + activities features (iteration 4).

NOTE: Destructive endpoints (/api/reset, /api/seed, /api/import) are intentionally
NOT exercised - the DB holds real user data (16 batches / 629 students / 2088 payments).
"""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup(client):
    created = {"students": [], "batches": []}
    yield created
    for sid in created["students"]:
        client.delete(f"{API}/students/{sid}")
    for bid in created["batches"]:
        client.delete(f"{API}/batches/{bid}")


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_shape(self, client):
        r = client.get(f"{API}/settings")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("id", "org_name", "auto_advance_day"):
            assert k in d, f"missing key {k} in {d}"
        assert "_id" not in d

    def test_put_settings_upsert_and_persist(self, client):
        original = client.get(f"{API}/settings").json()
        try:
            r = client.put(f"{API}/settings", json={"org_name": "TEST_ORG", "auto_advance_day": 1})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["org_name"] == "TEST_ORG"
            assert d["auto_advance_day"] == 1
            g = client.get(f"{API}/settings").json()
            assert g["org_name"] == "TEST_ORG"
            assert g["auto_advance_day"] == 1
        finally:
            client.put(f"{API}/settings", json={
                "org_name": original.get("org_name") or "TAPASH SIR",
                "auto_advance_day": original.get("auto_advance_day"),
            })

    def test_partial_update_does_not_clobber(self, client):
        original = client.get(f"{API}/settings").json()
        try:
            client.put(f"{API}/settings", json={"org_name": "TEST_ORG2", "auto_advance_day": 5})
            r = client.put(f"{API}/settings", json={"org_name": "TEST_ORG3"})
            assert r.status_code == 200
            d = r.json()
            assert d["org_name"] == "TEST_ORG3"
            assert d["auto_advance_day"] == 5, "partial PUT clobbered auto_advance_day"
        finally:
            client.put(f"{API}/settings", json={
                "org_name": original.get("org_name") or "TAPASH SIR",
                "auto_advance_day": original.get("auto_advance_day"),
            })

    def test_invalid_auto_advance_day_type(self, client):
        r = client.put(f"{API}/settings", json={"auto_advance_day": "abc"})
        assert r.status_code == 422, f"expected validation error, got {r.status_code}"


# ---------- Activities ----------
class TestActivities:
    def test_list_activities(self, client):
        r = client.get(f"{API}/activities")
        assert r.status_code == 200, r.text
        acts = r.json()
        assert isinstance(acts, list)
        assert len(acts) <= 50
        if acts:
            a = acts[0]
            assert set(("id", "msg", "time")).issubset(a.keys())
            assert "_id" not in a
            times = [x["time"] for x in acts]
            assert times == sorted(times, reverse=True), "activities not sorted desc"

    def test_activity_logged_for_batch_student_payment(self, client, cleanup):
        # batch
        rb = client.post(f"{API}/batches", json={
            "name": "TEST_BATCH_ACT", "subject": "QA", "class_time": "9:00 PM", "monthly_fee": 500})
        assert rb.status_code in (200, 201), rb.text
        bid = rb.json()["id"]
        cleanup["batches"].append(bid)
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Added batch: TEST_BATCH_ACT" in msgs

        # student
        rs = client.post(f"{API}/students", json={
            "name": "TEST_STU_ACT", "phone": "9000000001", "batch_id": bid,
            "monthly_fee": 500, "join_month": "2026-07"})
        assert rs.status_code in (200, 201), rs.text
        sid = rs.json()["id"]
        cleanup["students"].append(sid)
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Added student: TEST_STU_ACT" in msgs
        assert "Added student: TEST_STU_ACT" in msgs[:10], "newest activity not near the top"

        # partial payment
        rp = client.post(f"{API}/payments", json={
            "student_id": sid, "month": "2026-07", "amount": 200, "fee_snapshot": 500})
        assert rp.status_code in (200, 201), rp.text
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Partial payment ₹200: TEST_STU_ACT" in msgs, msgs[:5]

        # full payment (single payment >= monthly_fee) in another month
        rp2 = client.post(f"{API}/payments", json={
            "student_id": sid, "month": "2026-08", "amount": 500, "fee_snapshot": 500})
        assert rp2.status_code in (200, 201), rp2.text
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Marked paid: TEST_STU_ACT" in msgs, msgs[:5]

    def test_topup_completing_month_is_logged_as_partial(self, client, cleanup):
        """Top-up completing the month must be logged as 'Marked paid' (cumulative total)."""
        rb = client.post(f"{API}/batches", json={
            "name": "TEST_BATCH_TOPUP", "subject": "QA", "class_time": "9:00 PM", "monthly_fee": 500})
        bid = rb.json()["id"]
        cleanup["batches"].append(bid)
        rs = client.post(f"{API}/students", json={
            "name": "TEST_STU_TOPUP", "phone": "9000000002", "batch_id": bid,
            "monthly_fee": 500, "join_month": "2026-07"})
        sid = rs.json()["id"]
        cleanup["students"].append(sid)
        client.post(f"{API}/payments", json={"student_id": sid, "month": "2026-07", "amount": 200, "fee_snapshot": 500})
        client.post(f"{API}/payments", json={"student_id": sid, "month": "2026-07", "amount": 300, "fee_snapshot": 500})
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Marked paid: TEST_STU_TOPUP" in msgs[:10], (
            f"Top-up completing the month should log 'Marked paid'; recent msgs: {msgs[:6]}")
        assert not any(m == "Partial payment ₹300: TEST_STU_TOPUP" for m in msgs[:10]), (
            "Top-up completing the month must not be logged as a partial payment")

        # move
        batches = client.get(f"{API}/batches").json()
        other = next((b for b in batches if b["id"] != bid), None)
        if other:
            rm = client.post(f"{API}/students/{sid}/move", json={"batch_id": other["id"]})
            assert rm.status_code == 200, rm.text
            msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
            assert "Moved student: TEST_STU_TOPUP" in msgs
            # move back
            client.post(f"{API}/students/{sid}/move", json={"batch_id": bid})

        # delete student logs
        rd = client.delete(f"{API}/students/{sid}")
        assert rd.status_code in (200, 204), rd.text
        cleanup["students"].remove(sid)
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Deleted student: TEST_STU_TOPUP" in msgs

        # delete batch logs
        rdb = client.delete(f"{API}/batches/{bid}")
        assert rdb.status_code in (200, 204), rdb.text
        cleanup["batches"].remove(bid)
        msgs = [a["msg"] for a in client.get(f"{API}/activities").json()]
        assert "Deleted batch: TEST_BATCH_TOPUP" in msgs


# ---------- Export ----------
class TestExport:
    def test_export_includes_settings_and_activities(self, client):
        t0 = time.time()
        r = client.get(f"{API}/export")
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("batches", "students", "payments", "events", "activities", "settings"):
            assert k in d, f"export missing key {k}"
        assert isinstance(d["settings"], dict)
        assert "org_name" in d["settings"]
        assert isinstance(d["activities"], list)
        print(f"export elapsed {elapsed:.2f}s, students={len(d['students'])}, payments={len(d['payments'])}")


# ---------- Data volume / perf sanity ----------
class TestDataVolume:
    def test_core_list_endpoints(self, client):
        timings = {}
        counts = {}
        for name in ("batches", "students", "payments", "events"):
            t0 = time.time()
            r = client.get(f"{API}/{name}")
            timings[name] = round(time.time() - t0, 2)
            assert r.status_code == 200, r.text
            data = r.json()
            assert isinstance(data, list)
            counts[name] = len(data)
            assert all("_id" not in x for x in data[:50])
        print(f"counts={counts} timings={timings}")
        assert counts["students"] > 500, f"expected real data, got {counts}"
        assert counts["payments"] > 1000, f"expected real payments, got {counts}"
