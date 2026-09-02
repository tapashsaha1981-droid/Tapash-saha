"""Restore user's real data from /tmp/Now.json (old-app schema) into app schema.

Mirrors the conversion documented in /app/memory: dedupe students by name+phone,
latest month record decides current batch/fee, "Moved" markers excluded,
payments reconstructed from per-month status.
"""
import json
import os
import sys
from collections import Counter, OrderedDict

import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")

raw = json.load(open("/tmp/Now.json"))

statuses = Counter()
for bid, months in raw["students"].items():
    for m, recs in months.items():
        for r in recs:
            statuses[r.get("status")] += 1
print("statuses:", statuses)

batches = []
for b in raw["batches"]:
    batches.append({
        "id": b["id"],
        "name": b["name"],
        "subject": b.get("subject") or "",
        "class_time": str(b.get("time") or ""),
        "monthly_fee": int(float(b.get("fees") or 0)),
    })

students = OrderedDict()  # key -> doc
payments = []


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


for bid, months in raw["students"].items():
    for m in sorted(months.keys()):
        for r in months[m]:
            status = (r.get("status") or "").strip()
            if status.lower() == "moved":
                continue
            key = (r.get("name", "").strip().lower(), (r.get("phone") or "").strip())
            fee = int(num(r.get("fees") or r.get("baseFees")))
            doc = students.get(key)
            if doc is None:
                doc = {
                    "id": r["id"],
                    "name": r.get("name", "").strip(),
                    "phone": (r.get("phone") or "").strip(),
                    "batch_id": bid,
                    "monthly_fee": fee,
                    "join_month": m,
                    "notes": r.get("notes") or "",
                }
                students[key] = doc
            else:
                doc["batch_id"] = bid
                doc["monthly_fee"] = fee
                if m < doc["join_month"]:
                    doc["join_month"] = m
            amount = 0.0
            if status.lower() == "paid":
                amount = fee
            elif status.lower().startswith("partial"):
                amount = num(r.get("partialAmount"))
            if amount > 0:
                payments.append({
                    "id": r["id"] + "-p",
                    "student_id": doc["id"],
                    "month": m,
                    "amount": amount,
                    "fee_snapshot": fee,
                    "note": r.get("notes") or "",
                    "payment_date": (r.get("addedAt") or "")[:10],
                    "created_at": r.get("addedAt"),
                })

students = list(students.values())

# dedupe payments per (student, month) - a student can appear in two batches in
# the same month after a move; keep the last (latest batch) record.
dedup = OrderedDict()
for p in payments:
    dedup[(p["student_id"], p["month"])] = p
payments = list(dedup.values())
activities = [{"id": f"act-{i}", "msg": a["msg"], "time": a["time"]}
              for i, a in enumerate(raw.get("activityLog", []))]
settings = {"id": "settings", "org_name": raw.get("orgName") or "TAPASH SIR", "auto_advance_day": None}

print(f"converted: batches={len(batches)} students={len(students)} payments={len(payments)} activities={len(activities)}")

if "--dry-run" in sys.argv:
    sys.exit(0)

payload = {"batches": batches, "students": students, "payments": payments,
           "events": raw.get("events") or [], "activities": activities, "settings": settings}
r = requests.post(f"{BASE}/api/import", json=payload, timeout=180)
print(r.status_code, r.text[:300])
