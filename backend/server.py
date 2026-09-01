from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class Batch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    subject: str = ""
    class_time: str = ""
    monthly_fee: float = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BatchIn(BaseModel):
    name: str
    subject: Optional[str] = ""
    class_time: Optional[str] = ""
    monthly_fee: Optional[float] = 0


class Student(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str = ""
    batch_id: str
    monthly_fee: float = 0
    parent_name: str = ""
    notes: str = ""
    join_month: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m"))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class StudentIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    batch_id: str
    monthly_fee: Optional[float] = 0
    parent_name: Optional[str] = ""
    notes: Optional[str] = ""
    join_month: Optional[str] = None


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    batch_id: Optional[str] = None
    monthly_fee: Optional[float] = None
    parent_name: Optional[str] = None
    notes: Optional[str] = None


class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    month: str  # YYYY-MM
    amount: float
    fee_snapshot: float = 0
    note: str = ""
    payment_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).date().isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PaymentIn(BaseModel):
    student_id: str
    month: str
    amount: float
    fee_snapshot: Optional[float] = 0
    note: Optional[str] = ""
    payment_date: Optional[str] = None


class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD
    title: str
    type: str = "note"  # note | due | received | class
    color: str = "indigo"


class CalendarEventIn(BaseModel):
    date: str
    title: str
    type: Optional[str] = "note"
    color: Optional[str] = "indigo"


class MoveIn(BaseModel):
    batch_id: str


class ImportPayload(BaseModel):
    batches: Optional[Any] = None
    students: Optional[Any] = None
    payments: Optional[Any] = None
    events: Optional[Any] = None


# ---------- Helpers ----------
def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


# ---------- Batch routes ----------
@api_router.get("/batches")
async def list_batches():
    docs = await db.batches.find({}, {"_id": 0}).to_list(1000)
    return docs


@api_router.post("/batches")
async def create_batch(payload: BatchIn):
    batch = Batch(**payload.model_dump())
    await db.batches.insert_one(batch.model_dump())
    return batch.model_dump()


@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, payload: BatchIn):
    result = await db.batches.update_one({"id": batch_id}, {"$set": payload.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(404, "Batch not found")
    doc = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    return doc


@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str):
    students = await db.students.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    student_ids = [s["id"] for s in students]
    await db.batches.delete_one({"id": batch_id})
    await db.students.delete_many({"batch_id": batch_id})
    if student_ids:
        await db.payments.delete_many({"student_id": {"$in": student_ids}})
    return {"ok": True, "removed_students": len(student_ids)}


# ---------- Student routes ----------
@api_router.get("/students")
async def list_students():
    docs = await db.students.find({}, {"_id": 0}).to_list(10000)
    return docs


@api_router.post("/students")
async def create_student(payload: StudentIn):
    data = payload.model_dump()
    if not data.get("join_month"):
        data["join_month"] = datetime.now(timezone.utc).strftime("%Y-%m")
    student = Student(**data)
    await db.students.insert_one(student.model_dump())
    return student.model_dump()


@api_router.put("/students/{student_id}")
async def update_student(student_id: str, payload: StudentUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        doc = await db.students.find_one({"id": student_id}, {"_id": 0})
        return doc
    result = await db.students.update_one({"id": student_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Student not found")
    return await db.students.find_one({"id": student_id}, {"_id": 0})


@api_router.post("/students/{student_id}/move")
async def move_student(student_id: str, payload: MoveIn):
    result = await db.students.update_one({"id": student_id}, {"$set": {"batch_id": payload.batch_id}})
    if result.matched_count == 0:
        raise HTTPException(404, "Student not found")
    return await db.students.find_one({"id": student_id}, {"_id": 0})


@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str):
    await db.students.delete_one({"id": student_id})
    await db.payments.delete_many({"student_id": student_id})
    return {"ok": True}


# ---------- Payment routes ----------
@api_router.get("/payments")
async def list_payments(student_id: Optional[str] = None, month: Optional[str] = None):
    q = {}
    if student_id:
        q["student_id"] = student_id
    if month:
        q["month"] = month
    docs = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(50000)
    return docs


@api_router.post("/payments")
async def create_payment(payload: PaymentIn):
    data = payload.model_dump()
    if not data.get("payment_date"):
        data["payment_date"] = datetime.now(timezone.utc).date().isoformat()
    payment = Payment(**data)
    await db.payments.insert_one(payment.model_dump())
    return payment.model_dump()


@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str):
    await db.payments.delete_one({"id": payment_id})
    return {"ok": True}


# ---------- Calendar routes ----------
@api_router.get("/events")
async def list_events():
    docs = await db.events.find({}, {"_id": 0}).to_list(10000)
    return docs


@api_router.post("/events")
async def create_event(payload: CalendarEventIn):
    ev = CalendarEvent(**payload.model_dump())
    await db.events.insert_one(ev.model_dump())
    return ev.model_dump()


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    await db.events.delete_one({"id": event_id})
    return {"ok": True}


# ---------- Export / Import ----------
@api_router.get("/export")
async def export_all():
    batches = await db.batches.find({}, {"_id": 0}).to_list(10000)
    students = await db.students.find({}, {"_id": 0}).to_list(10000)
    payments = await db.payments.find({}, {"_id": 0}).to_list(100000)
    events = await db.events.find({}, {"_id": 0}).to_list(10000)
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "batches": batches,
        "students": students,
        "payments": payments,
        "events": events,
    }


@api_router.post("/import")
async def import_all(payload: ImportPayload):
    def sanitize(items):
        if not isinstance(items, list):
            return []
        return [{k: v for k, v in it.items() if k != "_id"} for it in items if isinstance(it, dict)]

    batches = sanitize(payload.batches)
    students = sanitize(payload.students)
    payments = sanitize(payload.payments)
    events = sanitize(payload.events)

    await db.batches.delete_many({})
    await db.students.delete_many({})
    await db.payments.delete_many({})
    await db.events.delete_many({})
    if batches:
        await db.batches.insert_many(batches)
    if students:
        await db.students.insert_many(students)
    if payments:
        await db.payments.insert_many(payments)
    if events:
        await db.events.insert_many(events)
    return {"ok": True, "counts": {"batches": len(batches), "students": len(students), "payments": len(payments), "events": len(events)}}


# ---------- Reset / Seed ----------
@api_router.post("/reset")
async def reset_all():
    await db.batches.delete_many({})
    await db.students.delete_many({})
    await db.payments.delete_many({})
    await db.events.delete_many({})
    return {"ok": True}


def _prev_month(m, back):
    y, mo = int(m[:4]), int(m[5:7])
    mo -= back
    while mo <= 0:
        mo += 12
        y -= 1
    return f"{y:04d}-{mo:02d}"


def _seed_batch_docs():
    batches_seed = [
        {"name": "CLASS 7", "subject": "English", "class_time": "7:00 PM", "monthly_fee": 600},
        {"name": "CLASS 8", "subject": "Math", "class_time": "6:30 PM", "monthly_fee": 700},
        {"name": "CLASS 10 MORNING", "subject": "Science", "class_time": "8:00 AM", "monthly_fee": 900},
        {"name": "CLASS 10 EVENING", "subject": "Science", "class_time": "5:30 PM", "monthly_fee": 900},
        {"name": "CLASS 12 EVENING", "subject": "Physics", "class_time": "5:00 PM", "monthly_fee": 1100},
        {"name": "CLASS 12 NIGHT", "subject": "Physics", "class_time": "8:30 PM", "monthly_fee": 1100},
    ]
    return [Batch(**b).model_dump() for b in batches_seed]


SKIP_LAST_MONTH = ("Adrika", "Trisha", "Anchal", "Kabir", "Vivaan")


def _seed_payment_amount(name, fee, k):
    if k == 2 and name == "Digbijoy":
        return fee / 2  # partial
    return fee


def _seed_student_docs(batch_docs, now_month):
    students_seed = [
        ("Sejati", "8256910921", 0, 700, 5),
        ("Adrika", "9612909009", 0, 700, 6),
        ("Digbijoy", "8974829643", 1, 700, 4),
        ("Trisha", "9863554596", 1, 700, 5),
        ("Anchal", "6909647702", 2, 900, 4),
        ("Rohan", "9812345670", 2, 900, 3),
        ("Priya", "9812345671", 3, 900, 2),
        ("Kabir", "9812345672", 4, 1100, 5),
        ("Meera", "9812345673", 5, 1100, 3),
        ("Aarav", "9812345674", 0, 700, 2),
        ("Isha", "9812345675", 3, 900, 4),
        ("Vivaan", "9812345676", 5, 1100, 6),
    ]
    student_docs = []
    payment_docs = []
    for name, phone, bidx, fee, months_back in students_seed:
        batch_id = batch_docs[bidx]["id"]
        join = _prev_month(now_month, months_back)
        st = Student(name=name, phone=phone, batch_id=batch_id, monthly_fee=fee, join_month=join)
        student_docs.append(st.model_dump())
        for k in range(months_back, 0, -1):
            if k == 1 and name in SKIP_LAST_MONTH:
                continue
            m = _prev_month(now_month, k)
            amt = _seed_payment_amount(name, fee, k)
            payment_docs.append(Payment(student_id=st.id, month=m, amount=amt, fee_snapshot=fee).model_dump())
    return student_docs, payment_docs


@api_router.post("/seed")
async def seed():
    existing = await db.batches.count_documents({})
    if existing > 0:
        return {"ok": True, "seeded": False, "reason": "data exists"}

    now_month = datetime.now(timezone.utc).strftime("%Y-%m")
    batch_docs = _seed_batch_docs()
    await db.batches.insert_many(batch_docs)

    student_docs, payment_docs = _seed_student_docs(batch_docs, now_month)
    await db.students.insert_many(student_docs)
    if payment_docs:
        await db.payments.insert_many(payment_docs)

    return {"ok": True, "seeded": True, "batches": len(batch_docs), "students": len(student_docs)}


@api_router.get("/")
async def root():
    return {"message": "TAPASH SIR API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
