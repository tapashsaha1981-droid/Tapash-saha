import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    out = {}
    for coll in ["batches", "students", "payments", "events"]:
        out[coll] = await db[coll].count_documents({})
        out[f"{coll}_null_or_missing_id"] = await db[coll].count_documents(
            {"$or": [{"id": None}, {"id": {"$exists": False}}]}
        )
    out["batches_null_created_at"] = await db.batches.count_documents(
        {"$or": [{"created_at": None}, {"created_at": {"$exists": False}}]}
    )
    batch_ids = set(await db.batches.distinct("id"))
    student_ids = set(await db.students.distinct("id"))
    orphan_students = await db.students.count_documents({"batch_id": {"$nin": list(batch_ids)}})
    orphan_payments = await db.payments.count_documents({"student_id": {"$nin": list(student_ids)}})
    out["orphan_students"] = orphan_students
    out["orphan_payments"] = orphan_payments
    out["TEST_batches"] = await db.batches.count_documents({"name": {"$regex": "^TEST_"}})
    out["TEST_students"] = await db.students.count_documents({"name": {"$regex": "^TEST_"}})
    for k, v in out.items():
        print(f"{k}: {v}")


asyncio.run(main())
