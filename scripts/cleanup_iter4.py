"""Cleanup of test artifacts created during iteration 4 testing."""
import asyncio
import os

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
benv = dotenv_values("/app/backend/.env")


async def main():
    # 1. delete UI-test payment (Nabajit, 2026-09, created by testing agent)
    pays = requests.get(f"{BASE}/api/payments", params={"month": "2026-09"}, timeout=60).json()
    students = {s["id"]: s["name"] for s in requests.get(f"{BASE}/api/students", timeout=60).json()}
    removed = 0
    for p in pays:
        if students.get(p["student_id"]) == "Nabajit" and not str(p["id"]).endswith("-p"):
            r = requests.delete(f"{BASE}/api/payments/{p['id']}", timeout=30)
            print("deleted payment", p["id"], r.status_code)
            removed += 1
    print("payments removed:", removed)

    # 2. remove test activity entries
    client = AsyncIOMotorClient(benv["MONGO_URL"])
    db = client[benv["DB_NAME"]]
    res = await db.activities.delete_many({"msg": {"$regex": "TEST_|Marked paid: Nabajit"}})
    print("activities removed:", res.deleted_count)
    print("remaining activities:", await db.activities.count_documents({}))
    client.close()


asyncio.run(main())
