# Tests for back-dated / previous-month payment recording (new feature).
# NON-DESTRUCTIVE: creates one payment for a synthetic TEST_ student and deletes it afterwards.
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


@pytest.fixture(scope="module")
def temp_student(client):
    """Create a throwaway TEST_ student; delete it (and its payments) at teardown."""
    batches = client.get(f"{BASE_URL}/api/batches", timeout=30).json()
    assert len(batches) > 0, "no batches present"
    payload = {
        "name": "TEST_Backdate QA",
        "phone": "9876543210",
        "batch_id": batches[0]["id"],
        "monthly_fee": 500,
        "join_month": "2026-05",
        "notes": "temp qa",
    }
    r = client.post(f"{BASE_URL}/api/students", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    st = r.json()
    yield st
    client.delete(f"{BASE_URL}/api/students/{st['id']}", timeout=30)


class TestPreviousMonthPayment:
    def test_post_payment_stores_month_and_date_as_sent(self, client, temp_student):
        payload = {
            "student_id": temp_student["id"],
            "month": "2026-06",          # PREVIOUS month
            "amount": 500,
            "fee_snapshot": 500,
            "note": "TEST_backdated",
            "payment_date": "2026-09-15",  # paid today (different from fee month)
        }
        r = client.post(f"{BASE_URL}/api/payments", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert "_id" not in p
        assert p["month"] == "2026-06"
        assert p["payment_date"] == "2026-09-15"
        assert p["amount"] == 500
        assert p["fee_snapshot"] == 500
        assert isinstance(p["id"], str) and p["id"]

        # GET verifies persistence + student_id filter
        g = client.get(f"{BASE_URL}/api/payments", params={"student_id": temp_student["id"]}, timeout=30)
        assert g.status_code == 200
        rows = g.json()
        assert all(x["student_id"] == temp_student["id"] for x in rows)
        match = [x for x in rows if x["id"] == p["id"]]
        assert len(match) == 1
        assert match[0]["month"] == "2026-06"
        assert match[0]["payment_date"] == "2026-09-15"

        # month filter
        g2 = client.get(
            f"{BASE_URL}/api/payments",
            params={"student_id": temp_student["id"], "month": "2026-06"},
            timeout=30,
        )
        assert g2.status_code == 200
        assert [x["id"] for x in g2.json()] == [p["id"]]

        # wrong-month filter returns nothing for this student
        g3 = client.get(
            f"{BASE_URL}/api/payments",
            params={"student_id": temp_student["id"], "month": "2026-07"},
            timeout=30,
        )
        assert g3.status_code == 200
        assert g3.json() == []

        # cleanup payment explicitly + verify removal
        d = client.delete(f"{BASE_URL}/api/payments/{p['id']}", timeout=30)
        assert d.status_code == 200
        after = client.get(
            f"{BASE_URL}/api/payments", params={"student_id": temp_student["id"], "month": "2026-06"}, timeout=30
        ).json()
        assert after == []

    def test_payment_date_defaults_when_omitted(self, client, temp_student):
        payload = {
            "student_id": temp_student["id"],
            "month": "2026-07",
            "amount": 250,
            "fee_snapshot": 500,
        }
        r = client.post(f"{BASE_URL}/api/payments", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["payment_date"], "payment_date should be auto-filled"
        assert len(p["payment_date"]) == 10
        client.delete(f"{BASE_URL}/api/payments/{p['id']}", timeout=30)

    def test_invalid_payment_payload_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/payments", json={"amount": 100}, timeout=30)
        assert r.status_code == 422, f"expected validation error, got {r.status_code}"


class TestDataIntegrity:
    """Existing real data must still be intact."""

    def test_batches_and_students_counts(self, client):
        b = client.get(f"{BASE_URL}/api/batches", timeout=30).json()
        s = client.get(f"{BASE_URL}/api/students", timeout=60).json()
        assert len(b) >= 16, f"expected >=16 batches, got {len(b)}"
        assert len(s) >= 600, f"expected ~629 students, got {len(s)}"
        assert all("_id" not in x for x in b[:5])
        assert all("_id" not in x for x in s[:5])

    def test_payments_bulk_present(self, client):
        p = client.get(f"{BASE_URL}/api/payments", timeout=60).json()
        assert len(p) >= 2000, f"expected ~2088 payments, got {len(p)}"
        assert all("_id" not in x for x in p[:5])
        assert all(x.get("month") for x in p[:50])

    def test_settings_and_activities(self, client):
        s = client.get(f"{BASE_URL}/api/settings", timeout=30)
        assert s.status_code == 200
        assert "org_name" in s.json()
        a = client.get(f"{BASE_URL}/api/activities", timeout=30)
        assert a.status_code == 200
        assert isinstance(a.json(), list)
