import json
import asyncio
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, BackgroundTasks, Request, Query
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import hashlib
import jwt
import hmac
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import requests
from pymongo import UpdateOne


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


# Attendance router
# Imported AFTER environment variables are loaded
from backend.attendance import attendance_router


mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# ---------- Authentication ----------
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
TOKEN_DAYS = 30


async def require_auth(authorization: Optional[str] = Header(None)):
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")

    token = authorization[7:].strip()

    if not token:
        raise HTTPException(401, "Authentication required")

    try:
        jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired session")

    return True


app = FastAPI()


# ---------- Public health check ----------
# Render can probe this endpoint without authentication.
@app.get("/")
async def health_check():
    return {"status": "ok"}


# Public routes - login only
public_router = APIRouter(prefix="/api")


# All normal application API routes require authentication
api_router = APIRouter(
    prefix="/api",
    dependencies=[Depends(require_auth)]
)


# ---------- Authentication Models ----------
class LoginIn(BaseModel):
    password: str


def create_access_token():
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=TOKEN_DAYS)

    payload = {
        "sub": "tapash-sir",
        "iat": now,
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


@public_router.post("/auth/login")
async def login(payload: LoginIn):
    if not APP_PASSWORD:
        raise HTTPException(
            500,
            "APP_PASSWORD is not configured"
        )

    if not hmac.compare_digest(
        payload.password,
        APP_PASSWORD
    ):
        raise HTTPException(
            401,
            "Incorrect password"
        )

    token = create_access_token()

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": TOKEN_DAYS * 24 * 60 * 60,
    }


# ---------- Models ----------
class Batch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    name: str
    subject: str = ""
    class_time: str = ""
    monthly_fee: float = 0
    whatsapp_group_link: str = ""

    created_at: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        ).isoformat()
    )


class BatchIn(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    name: str
    subject: Optional[str] = ""
    class_time: Optional[str] = ""
    monthly_fee: Optional[float] = 0
    whatsapp_group_link: Optional[str] = ""


class Student(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    name: str
    phone: str = ""
    parent_phone: str = ""
    board: str = ""
    batch_id: str
    monthly_fee: float = 0
    parent_name: str = ""
    admission_date: str = ""
    whatsapp_group_link: str = ""
    notes: str = ""

    join_month: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        ).strftime("%Y-%m")
    )

    created_at: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        ).isoformat()
    )


class StudentIn(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None

    name: str
    phone: Optional[str] = ""
    parent_phone: Optional[str] = ""
    board: Optional[str] = ""

    batch_id: str

    monthly_fee: Optional[float] = 0
    parent_name: Optional[str] = ""
    admission_date: Optional[str] = ""
    whatsapp_group_link: Optional[str] = ""
    notes: Optional[str] = ""
    join_month: Optional[str] = None


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    board: Optional[str] = None
    batch_id: Optional[str] = None
    monthly_fee: Optional[float] = None
    parent_name: Optional[str] = None
    admission_date: Optional[str] = None
    whatsapp_group_link: Optional[str] = None
    notes: Optional[str] = None


class BoardImportRow(BaseModel):
    name: str
    phone: str
    class_name: Optional[str] = ""
    batch: Optional[str] = ""
    board: str


class BoardImportPayload(BaseModel):
    rows: List[BoardImportRow]


class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    student_id: str
    month: str
    amount: float
    fee_snapshot: float = 0
    note: str = ""

    payment_date: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        ).date().isoformat()
    )

    created_at: str = Field(
        default_factory=lambda: datetime.now(
            timezone.utc
        ).isoformat()
    )


class PaymentIn(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None

    student_id: str
    month: str
    amount: float
    fee_snapshot: Optional[float] = 0
    note: Optional[str] = ""
    payment_date: Optional[str] = None


class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    date: str
    title: str
    type: str = "note"
    color: str = "indigo"


class CalendarEventIn(BaseModel):
    date: str
    title: str
    type: Optional[str] = "note"
    color: Optional[str] = "indigo"


class MoveIn(BaseModel):
    batch_id: str


class SettingsIn(BaseModel):
    org_name: Optional[str] = None
    auto_advance_day: Optional[int] = None


DEFAULT_SETTINGS = {
    "id": "settings",
    "org_name": "TAPASH SIR",
    "auto_advance_day": None
}


class ImportPayload(BaseModel):
    batches: Optional[Any] = None
    students: Optional[Any] = None
    payments: Optional[Any] = None
    events: Optional[Any] = None
    activities: Optional[Any] = None
    settings: Optional[Any] = None


# ---------- Helpers ----------
def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)

    return doc


# ============================================================
# ============================================================
# SUPABASE TUITION PAYMENT SYNC
# ============================================================

def _normalise_phone(phone):
    digits = "".join(
        ch for ch in str(phone or "")
        if ch.isdigit()
    )

    if len(digits) == 10:
        return digits

    if len(digits) == 12 and digits.startswith("91"):
        return digits[2:]

    if len(digits) == 11 and digits.startswith("0"):
        return digits[1:]

    return digits


def _month_label(month_key):
    try:
        return datetime.strptime(
            month_key,
            "%Y-%m"
        ).strftime("%B %Y")
    except ValueError:
        return month_key


def _month_range(start_key, end_key):
    try:
        sy, sm = map(int, start_key.split("-"))
        ey, em = map(int, end_key.split("-"))
    except Exception:
        return []

    months = []

    y = sy
    m = sm

    while (y, m) <= (ey, em):

        months.append(
            f"{y:04d}-{m:02d}"
        )

        m += 1

        if m > 12:
            m = 1
            y += 1

    return months


def _supabase_headers():
    key = os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY",
        ""
    ).strip()

    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _supabase_request(
    method,
    url,
    **kwargs
):
    response = requests.request(
        method,
        url,
        timeout=15,
        **kwargs
    )

    if response.status_code >= 400:
        raise RuntimeError(
            "Supabase request failed "
            f"({response.status_code}): "
            f"{response.text[:500]}"
        )

    return response


async def sync_payment_for_student(
    student_id,
    month_key=None
):
    """
    Synchronize the COMPLETE tuition-payment history of one
    Tuition Manager student with EduNotes Pro.

    Matching priority:
    1. Use the permanent edunotes_profile_id mapping only when
       the mapped EduNotes profile has the same normalized phone.
    2. Otherwise match by normalized phone number only.
    3. Never match by name.
    4. Never match by username.
    5. If multiple EduNotes profiles have the same phone, stop safely
       instead of choosing one.

    Existing EduNotes fee records are updated and missing months
    are created, so an incomplete history can be repaired.
    """

    try:

        # ----------------------------------------------------
        # Supabase credentials
        # ----------------------------------------------------

        supabase_url = os.environ.get(
            "SUPABASE_URL",
            ""
        ).rstrip("/")

        supabase_key = os.environ.get(
            "SUPABASE_SERVICE_ROLE_KEY",
            ""
        ).strip()

        if not supabase_url or not supabase_key:

            logger.warning(
                "Supabase payment sync skipped: "
                "credentials not configured"
            )

            return False


        # ----------------------------------------------------
        # Find Tuition Manager student
        # ----------------------------------------------------

        student = await db.students.find_one(
            {
                "id": student_id
            },
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "phone": 1,
                "monthly_fee": 1,
                "join_month": 1,
                "edunotes_profile_id": 1,
            }
        )

        if not student:

            logger.warning(
                "Supabase payment sync skipped: "
                "student %s not found",
                student_id
            )

            return False


        # ----------------------------------------------------
        # Normalize Tuition Manager student information
        # ----------------------------------------------------

        phone = _normalise_phone(
            student.get("phone")
        )

        student_name = str(
            student.get("name") or ""
        ).strip()

        if not phone:

            logger.warning(
                "Supabase payment sync skipped: "
                "student %s has no phone",
                student_id
            )

            return False


        base = f"{supabase_url}/rest/v1"

        headers = _supabase_headers()


        # ----------------------------------------------------
        # Find the correct EduNotes student.
        #
        # IMPORTANT:
        # Phone number is the ONLY identity used here.
        #
        # Existing password, username/login and device binding
        # are not changed by payment synchronization.
        # ----------------------------------------------------

        profile_id = student.get(
            "edunotes_profile_id"
        )

        # ----------------------------------------------------
        # First use the permanent mapping only if the mapped
        # EduNotes profile still has the SAME phone number.
        # ----------------------------------------------------

        if profile_id:

            mapped_response = _supabase_request(
                "GET",
                f"{base}/profiles",
                headers=headers,
                params={
                    "select": "id,phone,full_name,role",
                    "id": (
                        f"eq.{quote(str(profile_id))}"
                    ),
                    "role": "eq.student",
                    "limit": "1",
                }
            )

            mapped_profiles = (
                mapped_response.json()
            )

            if mapped_profiles:

                mapped_profile = mapped_profiles[0]

                mapped_phone = _normalise_phone(
                    mapped_profile.get("phone")
                )

                if mapped_phone == phone:

                    logger.info(
                        "Using permanent EduNotes profile mapping "
                        "for student=%s phone=%s profile=%s",
                        student_id,
                        phone,
                        profile_id,
                    )

                else:

                    logger.warning(
                        "Stored EduNotes mapping has a different "
                        "phone for student=%s. Ignoring mapping "
                        "and searching by phone only.",
                        student_id,
                    )

                    profile_id = None

            else:

                logger.warning(
                    "Stored EduNotes profile mapping is invalid: "
                    "student=%s profile=%s. Searching by phone only.",
                    student_id,
                    profile_id,
                )

                profile_id = None


        # ----------------------------------------------------
        # No valid permanent mapping:
        # search EduNotes student profiles by PHONE ONLY.
        #
        # No name matching.
        # No username matching.
        #
        # Exactly one phone match -> reuse that account.
        # Multiple phone matches -> stop safely.
        # No phone match -> payment sync stops; account creation
        # remains the responsibility of ensure_edunotes_student().
        # ----------------------------------------------------

        if not profile_id:

            profile_response = _supabase_request(
                "GET",
                f"{base}/profiles",
                headers=headers,
                params={
                    "select": "id,phone,full_name,role",
                    "role": "eq.student",
                }
            )

            profiles = profile_response.json()

            phone_matching_profiles = []

            for profile in profiles:

                profile_phone = _normalise_phone(
                    profile.get("phone")
                )

                if profile_phone == phone:

                    phone_matching_profiles.append(
                        profile
                    )


            if len(phone_matching_profiles) == 1:

                profile_id = (
                    phone_matching_profiles[0].get("id")
                )

                logger.info(
                    "Found EduNotes profile by phone only: "
                    "student=%s phone=%s profile=%s",
                    student_id,
                    phone,
                    profile_id,
                )

            elif len(phone_matching_profiles) > 1:

                logger.error(
                    "Supabase payment sync skipped: "
                    "multiple EduNotes profiles matched "
                    "phone=%s for student=%s. "
                    "No name or username matching will be used.",
                    phone,
                    student_id,
                )

                return False

            else:

                logger.warning(
                    "Supabase payment sync skipped: "
                    "no EduNotes profile found for "
                    "student=%s phone=%s. "
                    "Account creation remains the responsibility "
                    "of ensure_edunotes_student().",
                    student_id,
                    phone,
                )

                return False


            # Save permanent TM -> EduNotes mapping.
            if profile_id:

                await db.students.update_one(
                    {
                        "id": student_id
                    },
                    {
                        "$set": {
                            "edunotes_profile_id":
                                profile_id
                        }
                    }
                )


        # ----------------------------------------------------
        # Get ALL Tuition Manager payments
        # ----------------------------------------------------

        payment_docs = await db.payments.find(
            {
                "student_id": student_id
            },
            {
                "_id": 0,
                "month": 1,
                "amount": 1,
                "fee_snapshot": 1,
            }
        ).to_list(50000)


        # ----------------------------------------------------
        # Group payments by month
        # ----------------------------------------------------

        payments_by_month = {}

        fee_by_month = {}

        for payment in payment_docs:

            month = payment.get("month")

            if not month:
                continue

            amount = float(
                payment.get("amount") or 0
            )

            payments_by_month[month] = (
                payments_by_month.get(
                    month,
                    0
                )
                + amount
            )

            fee_snapshot = float(
                payment.get("fee_snapshot") or 0
            )

            if fee_snapshot > 0:

                fee_by_month[month] = (
                    fee_snapshot
                )


        # ----------------------------------------------------
        # Current month
        # ----------------------------------------------------

        current_month = datetime.now(
            timezone.utc
        ).strftime("%Y-%m")


        # ----------------------------------------------------
        # Determine starting month
        # ----------------------------------------------------

        join_month = student.get(
            "join_month"
        )

        valid_payment_months = [

            m

            for m in payments_by_month

            if (
                isinstance(m, str)
                and len(m) == 7
                and m[4] == "-"
            )

        ]

        if (
            isinstance(join_month, str)
            and len(join_month) == 7
            and join_month[4] == "-"
        ):

            start_month = join_month

        elif valid_payment_months:

            start_month = min(
                valid_payment_months
            )

        else:

            start_month = current_month


        # ----------------------------------------------------
        # Include earlier payment months if they exist.
        # ----------------------------------------------------

        if valid_payment_months:

            earliest_payment = min(
                valid_payment_months
            )

            if earliest_payment < start_month:

                start_month = earliest_payment


        # ----------------------------------------------------
        # Create complete month list
        # ----------------------------------------------------

        months = _month_range(
            start_month,
            current_month
        )


        # ----------------------------------------------------
        # Current/default monthly fee
        # ----------------------------------------------------

        default_fee = float(
            student.get("monthly_fee") or 0
        )


        # ----------------------------------------------------
        # Synchronize EVERY month.
        #
        # Existing records are updated.
        # Missing records are created.
        #
        # IMPORTANT:
        # Do NOT stop just because one fee record already exists.
        # ----------------------------------------------------

        for month in months:

            amount_paid = float(
                payments_by_month.get(
                    month,
                    0
                )
            )

            amount_due = float(
                fee_by_month.get(
                    month,
                    default_fee
                )
            )


            # ------------------------------------------------
            # Determine status
            # ------------------------------------------------

            if (
                amount_paid >= amount_due
                and amount_due > 0
            ):

                status = "paid"

            elif amount_paid > 0:

                status = "partial"

            else:

                status = "pending"


            # ------------------------------------------------
            # Data sent to EduNotes
            # ------------------------------------------------

            payload = {

                "profile_id": profile_id,

                "month_key": month,

                "month_label": _month_label(
                    month
                ),

                "amount_due": amount_due,

                "amount_paid": amount_paid,

                "status": status,
            }


            # ------------------------------------------------
            # Check whether this month already exists
            # ------------------------------------------------

            existing_response = _supabase_request(
                "GET",
                f"{base}/tuition_fee_records",
                headers=headers,
                params={

                    "select": "id",

                    "profile_id": (
                        f"eq.{quote(str(profile_id))}"
                    ),

                    "month_key": (
                        f"eq.{quote(month)}"
                    ),

                    "limit": "1",
                }
            )

            existing = (
                existing_response.json()
            )


            # ------------------------------------------------
            # Update existing month
            # ------------------------------------------------

            if existing:

                record_id = (
                    existing[0]["id"]
                )

                _supabase_request(
                    "PATCH",
                    f"{base}/tuition_fee_records",

                    headers=headers,

                    params={
                        "id": (
                            f"eq.{quote(str(record_id))}"
                        )
                    },

                    json=payload,
                )


            # ------------------------------------------------
            # Create missing month
            # ------------------------------------------------

            else:

                _supabase_request(
                    "POST",
                    f"{base}/tuition_fee_records",

                    headers=headers,

                    json=payload,
                )


        logger.info(
            "Supabase tuition history sync successful: "
            "student=%s profile=%s months=%s start=%s current=%s",
            student_id,
            profile_id,
            len(months),
            start_month,
            current_month,
        )

        return True


    except Exception:

        logger.exception(
            "Supabase payment history sync failed: "
            "student=%s",
            student_id,
        )

        # Never break Tuition Manager because
        # EduNotes/Supabase synchronization failed.

        return False

# ---------- EduNotes student synchronization hook ----------
# render_entry.py replaces this with the full Supabase implementation.
# Keeping a safe no-op here allows backend.server to remain importable on its own.
async def ensure_edunotes_student(student):
    return False


# ---------- Batch routes ----------
@api_router.get("/batches")
async def list_batches():
    docs = await db.batches.find(
        {},
        {"_id": 0}
    ).to_list(1000)

    return docs


@api_router.post("/batches")
async def create_batch(payload: BatchIn):
    batch = Batch(
        **payload.model_dump(
            exclude_none=True
        )
    )

    await db.batches.insert_one(
        batch.model_dump()
    )

    await log_activity(
        f"Added batch: {batch.name}"
    )

    return batch.model_dump()


@api_router.put("/batches/{batch_id}")
async def update_batch(
    batch_id: str,
    payload: BatchIn
):
    result = await db.batches.update_one(
        {"id": batch_id},
        {
            "$set": payload.model_dump(
                exclude_unset=True,
                exclude_none=True,
                exclude={"id", "created_at"}
            )
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            404,
            "Batch not found"
        )

    doc = await db.batches.find_one(
        {"id": batch_id},
        {"_id": 0}
    )

    return doc


@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str):
    batch = await db.batches.find_one(
        {"id": batch_id},
        {"_id": 0, "name": 1}
    )

    if not batch:
        raise HTTPException(
            404,
            "Batch not found"
        )

    students = await db.students.find(
        {"batch_id": batch_id},
        {"_id": 0}
    ).to_list(10000)

    student_ids = [
        s["id"]
        for s in students
    ]

    await db.batches.delete_one(
        {"id": batch_id}
    )

    await db.students.delete_many(
        {"batch_id": batch_id}
    )

    if student_ids:
        await db.payments.delete_many(
            {
                "student_id": {
                    "$in": student_ids
                }
            }
        )

    await log_activity(
        f"Deleted batch: {batch['name']}"
    )

    return {
        "ok": True,
        "removed_students": len(student_ids)
    }


# ---------- Student routes ----------
@api_router.get("/students")
async def list_students():
    docs = await db.students.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    return docs


@api_router.post("/students")
async def create_student(
    payload: StudentIn
):
    data = payload.model_dump(
        exclude_none=True
    )

    if not data.get("join_month"):
        data["join_month"] = datetime.now(
            timezone.utc
        ).strftime("%Y-%m")

    student = Student(**data)

    await db.students.insert_one(
        student.model_dump()
    )

    await log_activity(
        f"Added student: {student.name}"
    )

    # Automatically register/synchronize the student in EduNotes Pro.
    # The render_entry.py wrapper provides the actual EduNotes sync function.
    try:
        await ensure_edunotes_student(student.model_dump())
    except Exception:
        logger.exception(
            "Automatic EduNotes sync failed after adding student: %s",
            student.name,
        )

    return student.model_dump()


@api_router.put("/students/{student_id}")
async def update_student(
    student_id: str,
    payload: StudentUpdate
):
    updates = payload.model_dump(
        exclude_unset=True,
        exclude_none=True
    )

    if not updates:
        doc = await db.students.find_one(
            {"id": student_id},
            {"_id": 0}
        )

        return doc

    result = await db.students.update_one(
        {"id": student_id},
        {"$set": updates}
    )

    if result.matched_count == 0:
        raise HTTPException(
            404,
            "Student not found"
        )

    updated_student = await db.students.find_one(
        {"id": student_id},
        {"_id": 0}
    )

    # Keep the corresponding EduNotes profile synchronized after edits.
    try:
        await ensure_edunotes_student(updated_student)
    except Exception:
        logger.exception(
            "Automatic EduNotes sync failed after editing student: %s",
            student_id,
        )

    return updated_student


@api_router.post("/students/{student_id}/sync-edunotes-fees")
async def sync_student_edunotes_fees(
    student_id: str
):
    """
    One-student, manual Tuition Manager -> EduNotes fee-history sync.

    This is an isolated test/repair operation. It does not create,
    delete, reset, or otherwise modify the student's EduNotes account.
    It only runs the existing complete payment-history synchronizer.
    """

    student = await db.students.find_one(
        {"id": student_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    )

    if not student:
        raise HTTPException(
            404,
            "Student not found"
        )

    synced = await sync_payment_for_student(
        student_id
    )

    if not synced:
        raise HTTPException(
            409,
            "EduNotes fee synchronization could not be completed for this student"
        )

    return {
        "ok": True,
        "student_id": student_id,
        "student_name": student.get("name"),
        "message": "Complete EduNotes fee history synchronized successfully"
    }


# ---------- Background batch synchronization ----------
# The browser starts this job and receives an immediate response.
# The actual synchronization then continues on the server, so the
# browser/iPad screen can be locked without cancelling the request.
async def _run_batch_sync_job(
    job_id: str,
    batch_id: str,
):
    await db.sync_jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    try:
        result = await sync_batch_edunotes_fees(batch_id)

        await db.sync_jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "result": result,
                }
            },
        )

    except Exception as exc:
        logging.exception(
            "Background EduNotes batch sync failed: job=%s batch=%s",
            job_id,
            batch_id,
        )

        await db.sync_jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error": str(exc),
                }
            },
        )


@api_router.post("/students/batch/{batch_id}/sync-edunotes-fees/background")
async def start_background_batch_sync(
    batch_id: str,
    background_tasks: BackgroundTasks,
):
    batch = await db.batches.find_one(
        {"id": batch_id},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
        },
    )

    if not batch:
        raise HTTPException(
            404,
            "Batch not found",
        )

    # Do not start the same batch twice while a previous job is active.
    active = await db.sync_jobs.find_one(
        {
            "batch_id": batch_id,
            "status": {
                "$in": ["queued", "running"],
            },
        },
        {
            "_id": 0,
            "id": 1,
            "batch_id": 1,
            "batch_name": 1,
            "status": 1,
        },
    )

    if active:
        return {
            "ok": True,
            "already_running": True,
            "job_id": active.get("id"),
            "batch_id": batch_id,
            "batch_name": batch.get("name"),
            "status": active.get("status"),
            "message": "A synchronization job is already running for this batch",
        }

    job_id = str(uuid.uuid4())

    await db.sync_jobs.insert_one(
        {
            "id": job_id,
            "batch_id": batch_id,
            "batch_name": batch.get("name"),
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    background_tasks.add_task(
        _run_batch_sync_job,
        job_id,
        batch_id,
    )

    return {
        "ok": True,
        "job_id": job_id,
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "status": "queued",
        "message": "Batch synchronization started in the background",
    }


@api_router.get("/students/batch-sync/jobs/{job_id}")
async def get_background_batch_sync_status(
    job_id: str,
):
    job = await db.sync_jobs.find_one(
        {"id": job_id},
        {"_id": 0},
    )

    if not job:
        raise HTTPException(
            404,
            "Synchronization job not found",
        )

    return job


@api_router.post("/students/batch/{batch_id}/sync-edunotes-fees")
async def sync_batch_edunotes_fees(
    batch_id: str
):
    """
    One-batch Tuition Manager -> EduNotes reconciliation.

    For every student in the selected batch:

    1. Use the existing EduNotes registration/synchronization logic.
    2. Create the EduNotes student when the account/profile is genuinely
       missing.
    3. Reuse an existing EduNotes account/profile when available.
    4. Preserve existing login/password/device-binding information.
    5. Synchronize the complete Tuition Manager fee history.
    6. Never intentionally create a duplicate for a student that is
       already mapped to an EduNotes profile.

    Tuition Manager remains the master.
    """

    batch = await db.batches.find_one(
        {"id": batch_id},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
        }
    )

    if not batch:
        raise HTTPException(
            404,
            "Batch not found"
        )

    # Get the complete student documents because the existing
    # EduNotes registration logic needs phone, name, batch,
    # monthly fee, join month, mapping, etc.
    students = await db.students.find(
        {"batch_id": batch_id},
        {
            "_id": 0,
        }
    ).sort(
        "name",
        1
    ).to_list(50000)

    if not students:
        return {
            "ok": True,
            "batch_id": batch_id,
            "batch_name": batch.get("name"),
            "total": 0,
            "synced": 0,
            "failed": 0,
            "failures": [],
            "message": "No students found in this batch",
        }

    synced = 0
    failures = []

    for student in students:

        student_id = student.get("id")
        student_name = student.get("name")

        try:
            # ----------------------------------------------------
            # STEP 1:
            # Run the existing EduNotes registration/synchronization
            # logic.
            #
            # In the Render deployment, render_entry.py replaces
            # this safe hook with the full EduNotes implementation.
            # ----------------------------------------------------

            registration_result = (
                await ensure_edunotes_student(
                    student
                )
            )

            if not registration_result:

                failures.append({
                    "student_id": student_id,
                    "student_name": student_name,
                    "reason": (
                        "EduNotes account/profile could not be "
                        "created or synchronized"
                    ),
                })

                continue

            # ----------------------------------------------------
            # STEP 2:
            # Refresh the Tuition Manager student so we use the
            # permanent EduNotes profile mapping that the
            # registration logic may have just created.
            # ----------------------------------------------------

            refreshed_student = await db.students.find_one(
                {"id": student_id},
                {
                    "_id": 0,
                    "id": 1,
                    "name": 1,
                    "edunotes_profile_id": 1,
                }
            )

            if not refreshed_student:
                failures.append({
                    "student_id": student_id,
                    "student_name": student_name,
                    "reason": (
                        "Student could not be reloaded after "
                        "EduNotes synchronization"
                    ),
                })

                continue

            if not refreshed_student.get(
                "edunotes_profile_id"
            ):
                failures.append({
                    "student_id": student_id,
                    "student_name": student_name,
                    "reason": (
                        "EduNotes profile was not mapped back "
                        "to Tuition Manager"
                    ),
                })

                continue

            # ----------------------------------------------------
            # STEP 3:
            # Synchronize the COMPLETE fee history.
            #
            # This is intentionally called after registration so
            # newly created EduNotes students also receive all
            # previous months from Tuition Manager.
            # ----------------------------------------------------

            fee_sync_result = (
                await sync_payment_for_student(
                    student_id
                )
            )

            if not fee_sync_result:

                failures.append({
                    "student_id": student_id,
                    "student_name": student_name,
                    "reason": (
                        "EduNotes account was synchronized, "
                        "but fee history synchronization failed"
                    ),
                })

                continue

            synced += 1

        except Exception as error:

            logger.exception(
                "Batch EduNotes reconciliation failed "
                "for student: %s",
                student_id,
            )

            failures.append({
                "student_id": student_id,
                "student_name": student_name,
                "reason": str(error)[:300],
            })

    return {
        "ok": True,
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "total": len(students),
        "synced": synced,
        "failed": len(failures),
        "failures": failures,
        "message": (
            "Batch EduNotes account reconciliation and "
            "complete fee synchronization completed"
        ),
    }


@api_router.post("/students/import-board")
async def import_student_boards(payload: BoardImportPayload):
    """
    Safe bulk Board import.

    IMPORTANT:
    - Updates ONLY the board field.
    - Never creates students.
    - Never deletes students.
    - Never changes fees, payments, batches, or other student fields.
    - A phone number must match exactly one Tuition Manager student.
    - Duplicate phone numbers are reported as mismatches.
    - Name and batch are checked before any Board update.
    """

    students = await db.students.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    def normalise(value):
        return str(value or "").strip().lower()

    phone_index = {}

    for student in students:
        phone = _normalise_phone(student.get("phone"))

        if not phone:
            continue

        phone_index.setdefault(phone, []).append(student)

    # Build the batch-name map once so the import does not repeatedly
    # query the batches collection for every CSV row.
    batch_docs = await db.batches.find(
        {},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(10000)

    batch_name_by_id = {
        batch.get("id"): batch.get("name", "")
        for batch in batch_docs
        if batch.get("id")
    }

    results = []
    mismatches = []
    unchanged = 0
    update_operations = []

    # Pre-scan phone numbers so EVERY row belonging to a duplicate
    # phone group is reported as a mismatch. No duplicate row is
    # partially imported.
    csv_phone_rows = {}

    for row in payload.rows:
        phone = _normalise_phone(row.phone)

        if phone:
            csv_phone_rows.setdefault(phone, []).append(row)

    duplicate_csv_phones = {
        phone
        for phone, rows in csv_phone_rows.items()
        if len(rows) > 1
    }

    for row in payload.rows:
        phone = _normalise_phone(row.phone)
        board = normalise(row.board)

        base_mismatch = {
            "name": row.name,
            "phone": row.phone,
            "class": row.class_name,
            "batch": row.batch,
            "board": row.board
        }

        if board not in {"cbse", "tbse"}:
            mismatches.append({
                **base_mismatch,
                "reason": "Invalid Board. Must be CBSE or TBSE."
            })
            continue

        if not phone:
            mismatches.append({
                **base_mismatch,
                "reason": "Phone number is missing or invalid."
            })
            continue

        if phone in duplicate_csv_phones:
            mismatches.append({
                **base_mismatch,
                "reason": "Duplicate phone number in uploaded CSV."
            })
            continue

        matches = phone_index.get(phone, [])

        if len(matches) == 0:
            mismatches.append({
                **base_mismatch,
                "reason": "No matching student found in Tuition Manager."
            })
            continue

        if len(matches) > 1:
            mismatches.append({
                **base_mismatch,
                "reason": (
                    "Multiple Tuition Manager students have "
                    "the same phone number."
                ),
                "matched_accounts": [
                    {
                        "id": student.get("id"),
                        "name": student.get("name"),
                        "phone": student.get("phone"),
                        "batch_id": student.get("batch_id"),
                        "board": student.get("board", "")
                    }
                    for student in matches
                ]
            })
            continue

        student = matches[0]

        current_batch = batch_name_by_id.get(
            student.get("batch_id"),
            ""
        )

        # Batch is checked whenever it is present in the CSV.
        if (
            row.batch
            and normalise(row.batch) != normalise(current_batch)
        ):
            mismatches.append({
                **base_mismatch,
                "reason": "Batch does not match Tuition Manager.",
                "matched_student": student.get("name"),
                "current_batch": current_batch
            })
            continue

        # Name is checked whenever it is present in the CSV.
        if (
            row.name
            and normalise(row.name) != normalise(student.get("name"))
        ):
            mismatches.append({
                **base_mismatch,
                "reason": "Student name does not match.",
                "matched_student": student.get("name"),
                "current_batch": current_batch
            })
            continue

        new_board = board.upper()
        old_board = str(student.get("board") or "").upper()

        # Only the Board field is ever changed.
        # Queue the update and execute all Board changes in ONE MongoDB
        # bulk operation after validation. This prevents a large CSV from
        # timing out because of hundreds of individual database requests.
        update_operations.append(
            UpdateOne(
                {"id": student["id"]},
                {"$set": {"board": new_board}}
            )
        )

        results.append({
            "student_id": student["id"],
            "name": student.get("name"),
            "phone": student.get("phone"),
            "old_board": old_board,
            "new_board": new_board,
            "changed": old_board != new_board
        })

    # Execute all validated Board updates in one database call.
    updated = 0
    if update_operations:
        bulk_result = await db.students.bulk_write(
            update_operations,
            ordered=False
        )
        updated = bulk_result.modified_count

    unchanged = sum(
        1
        for item in results
        if not item["changed"]
    )

    return {
        "ok": True,
        "checked": len(payload.rows),
        "updated": updated,
        "unchanged": unchanged,
        "mismatches": len(mismatches),
        "results": results,
        "mismatch_accounts": mismatches
    }


@api_router.post("/students/{student_id}/move")
async def move_student(
    student_id: str,
    payload: MoveIn
):
    result = await db.students.update_one(
        {"id": student_id},
        {
            "$set": {
                "batch_id": payload.batch_id
            }
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            404,
            "Student not found"
        )

    doc = await db.students.find_one(
        {"id": student_id},
        {"_id": 0}
    )

    await log_activity(
        f"Moved student: {doc['name']}"
    )

    # Keep EduNotes class assignment synchronized after a batch move.
    try:
        await ensure_edunotes_student(doc)
    except Exception:
        logger.exception(
            "Automatic EduNotes sync failed after moving student: %s",
            student_id,
        )

    return doc


@api_router.delete("/students/{student_id}")
async def delete_student(
    student_id: str
):
    st = await db.students.find_one(
        {"id": student_id},
        {
            "_id": 0,
            "name": 1,
            "phone": 1
        }
    )

    if not st:
        raise HTTPException(
            404,
            "Student not found"
        )

    # ----------------------------------------------------
    # Remove this student's tuition history from EduNotes
    # ----------------------------------------------------
    try:
        supabase_url = os.environ.get(
            "SUPABASE_URL",
            ""
        ).rstrip("/")

        supabase_key = os.environ.get(
            "SUPABASE_SERVICE_ROLE_KEY",
            ""
        ).strip()

        if supabase_url and supabase_key:

            phone = _normalise_phone(
                st.get("phone")
            )

            if phone:

                base = f"{supabase_url}/rest/v1"
                headers = _supabase_headers()

                profile_response = _supabase_request(
                    "GET",
                    f"{base}/profiles",
                    headers=headers,
                    params={
                        "select": "id,phone",
                        "role": "eq.student",
                    }
                )

                profiles = profile_response.json()

                profile_id = None

                for profile in profiles:
                    profile_phone = _normalise_phone(
                        profile.get("phone")
                    )

                    if profile_phone == phone:
                        profile_id = profile.get("id")
                        break

                if profile_id:

                    _supabase_request(
                        "DELETE",
                        f"{base}/tuition_fee_records",
                        headers=headers,
                        params={
                            "profile_id": (
                                f"eq.{quote(profile_id)}"
                            )
                        }
                    )

                    logger.info(
                        "Removed EduNotes tuition history "
                        "for deleted student: %s",
                        st["name"]
                    )

    except Exception:
        logger.exception(
            "EduNotes tuition cleanup failed "
            "for deleted student: %s",
            st["name"]
        )

    # ----------------------------------------------------
    # Delete Tuition Manager student and payments
    # ----------------------------------------------------

    await db.students.delete_one(
        {"id": student_id}
    )

    await db.payments.delete_many(
        {"student_id": student_id}
    )

    await log_activity(
        f"Deleted student: {st['name']}"
    )

    return {"ok": True}



# ---------- Razorpay mode configuration ----------
def _razorpay_mode_and_credentials():
    """Return validated mode and matching credentials; default safely to Test Mode."""
    mode = os.environ.get("RAZORPAY_MODE", "test").strip().lower()
    key_id = os.environ.get("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if mode not in {"test", "live"}:
        raise HTTPException(503, "RAZORPAY_MODE must be set to test or live")
    expected_prefix = "rzp_test_" if mode == "test" else "rzp_live_"
    if not key_id.startswith(expected_prefix) or not key_secret:
        raise HTTPException(503, f"Razorpay {mode.title()} Mode credentials are not configured correctly")
    return mode, key_id, key_secret


# ---------- Student Razorpay checkout (Test or Live Mode) ----------
# Student identity is verified against Supabase Auth; client-supplied student IDs
# are never trusted. Amounts are derived only from the Tuition Manager ledger.
class StudentRazorpayOrderIn(BaseModel):
    months: List[str] = Field(min_length=1, max_length=24)


class StudentRazorpayVerifyIn(BaseModel):
    order_id: str
    payment_id: str
    signature: str


async def _verified_edunotes_student(authorization: Optional[str]):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in to EduNotes Pro first")
    token = authorization[7:].strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise HTTPException(503, "Student identity verification is not configured")
    from fastapi.concurrency import run_in_threadpool
    try:
        response = await run_in_threadpool(
            requests.get,
            supabase_url + "/auth/v1/user",
            headers={"apikey": service_key, "Authorization": "Bearer " + token},
            timeout=10,
        )
    except Exception:
        raise HTTPException(502, "Could not verify your student session")
    if response.status_code != 200:
        raise HTTPException(401, "Your student session is invalid or expired")
    user = response.json()
    profile_id = str(user.get("id") or "")
    if not profile_id:
        raise HTTPException(401, "Student profile could not be verified")
    try:
        profile_response = await run_in_threadpool(
            requests.get,
            supabase_url + "/rest/v1/profiles",
            params={"select": "id,role,active", "id": "eq." + profile_id, "limit": "1"},
            headers={"apikey": service_key, "Authorization": "Bearer " + service_key},
            timeout=10,
        )
    except Exception:
        raise HTTPException(502, "Could not verify your student profile")
    if profile_response.status_code != 200:
        raise HTTPException(502, "Could not verify your student profile")
    profiles = profile_response.json()
    if not profiles or profiles[0].get("role") != "student" or profiles[0].get("active") is False:
        raise HTTPException(403, "This active student account is not allowed to make payments")
    tuition_student = await db.students.find_one(
        {"edunotes_profile_id": profile_id},
        {"_id": 0, "id": 1, "name": 1, "monthly_fee": 1, "edunotes_profile_id": 1},
    )
    if not tuition_student:
        raise HTTPException(409, "Your EduNotes profile is not linked to Tuition Manager yet. Please contact the administrator.")
    return profile_id, tuition_student


async def _release_razorpay_month_claims(reservation_token: str):
    """Release only claims owned by a checkout that failed before order creation."""
    await db.razorpay_student_month_claims.delete_many({
        "reservation_token": reservation_token,
        "status": "reserving",
    })


async def _reserve_razorpay_months(
    *, student_id: str, profile_id: str, months: list, mode: str,
    reservation_token: str, key_id: str, key_secret: str,
):
    """Atomically reserve each student/month across different Razorpay orders.

    Expired reservations are reclaimed only when Razorpay confirms that the old
    order has no payments. If status cannot be confirmed, fail closed.
    """
    import razorpay
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    expires_iso = (now + timedelta(minutes=20)).isoformat()
    client = razorpay.Client(auth=(key_id, key_secret))
    reserved_ids = []
    try:
        for month in months:
            claim_id = f"{student_id}:{month}"
            claim = {
                "_id": claim_id,
                "student_id": student_id,
                "profile_id": profile_id,
                "month": month,
                "mode": mode,
                "reservation_token": reservation_token,
                "order_id": None,
                "status": "reserving",
                "created_at": now_iso,
                "expires_at": expires_iso,
            }
            try:
                await db.razorpay_student_month_claims.insert_one(claim)
                reserved_ids.append(claim_id)
                continue
            except Exception:
                existing = await db.razorpay_student_month_claims.find_one(
                    {"_id": claim_id}, {"_id": 0}
                )
                if not existing:
                    raise

            # An unexpired or reconciliation claim always blocks another order.
            if existing.get("status") == "reconciliation_required":
                raise HTTPException(409, f"The fee for {month} needs administrator reconciliation. Do not pay again.")
            if not existing.get("expires_at") or existing["expires_at"] >= now_iso:
                raise HTTPException(409, f"A payment for {month} is already in progress. Do not start another payment.")

            old_order_id = existing.get("order_id")
            if old_order_id:
                # Razorpay orders may remain payable after this local lease expires.
                # Never release a claim for an order that reached Razorpay: an old
                # checkout could still be completed later and cause a second charge.
                raise HTTPException(409, f"A previous Razorpay order still reserves {month}. Do not pay again; administrator reconciliation is required.")

            # Only a reservation that never received a Razorpay order ID can be
            # safely reclaimed after expiry.
            # Delete only the exact expired claim observed above, then acquire it.
            deleted = await db.razorpay_student_month_claims.delete_one({
                "_id": claim_id,
                "reservation_token": existing.get("reservation_token"),
                "expires_at": existing.get("expires_at"),
            })
            if deleted.deleted_count != 1:
                raise HTTPException(409, f"A payment for {month} is being processed. Do not pay again.")
            await db.razorpay_student_month_claims.insert_one(claim)
            reserved_ids.append(claim_id)
    except Exception:
        if reserved_ids:
            await db.razorpay_student_month_claims.delete_many({
                "_id": {"$in": reserved_ids},
                "reservation_token": reservation_token,
                "status": "reserving",
            })
        raise


async def _student_month_balance(student_id: str, month: str, monthly_fee):
    from decimal import Decimal, InvalidOperation
    try:
        fee = Decimal(str(monthly_fee or 0))
        payments = await db.payments.find(
            {"student_id": student_id, "month": month}, {"_id": 0, "amount": 1}
        ).to_list(10000)
        paid = sum((Decimal(str(p.get("amount") or 0)) for p in payments), Decimal("0"))
        balance = fee - paid
        if not fee.is_finite() or not paid.is_finite():
            raise ValueError("non-finite")
        return max(balance, Decimal("0"))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(500, "Could not safely calculate your fee balance")


@public_router.post("/student-payments/razorpay/order")
async def create_student_razorpay_order(
    payload: StudentRazorpayOrderIn,
    authorization: Optional[str] = Header(None),
):
    mode, key_id, key_secret = _razorpay_mode_and_credentials()
    profile_id, student = await _verified_edunotes_student(authorization)
    import re
    months = sorted(set(str(m).strip() for m in payload.months))
    if len(months) != len(payload.months) or any(not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", m) for m in months):
        raise HTTPException(400, "Select valid, unique fee months")
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    if any(m > current_month for m in months):
        raise HTTPException(400, "Future months cannot be paid in advance through this checkout")
    from decimal import Decimal, ROUND_HALF_UP
    breakdown = []
    total = Decimal("0")
    for month in months:
        balance = await _student_month_balance(student["id"], month, student.get("monthly_fee"))
        if balance <= 0:
            raise HTTPException(409, "A selected month has no outstanding balance. Refresh your fee history and try again.")
        paise = int((balance * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if paise < 100:
            raise HTTPException(400, "The outstanding amount must be at least ₹1")
        breakdown.append({"month": month, "amount_paise": paise})
        total += Decimal(paise) / Decimal(100)
    total_paise = sum(x["amount_paise"] for x in breakdown)
    from fastapi.concurrency import run_in_threadpool
    import razorpay
    # Safe retry path: if the same student/months already have a Razorpay
    # order, reuse that order when Razorpay confirms it is not paid. Never
    # create a second order while an older order may still be payable.
    from fastapi.concurrency import run_in_threadpool
    import razorpay
    existing_claims = []
    for month in months:
        claim = await db.razorpay_student_month_claims.find_one(
            {"_id": f"{student['id']}:{month}"},
            {"_id": 0, "student_id": 1, "profile_id": 1, "month": 1,
             "mode": 1, "order_id": 1, "status": 1, "reservation_token": 1,
             "receipt": 1, "amount_paise": 1, "currency": 1, "breakdown": 1},
        )
        if claim:
            existing_claims.append(claim)

    # Recover the narrow failure window where Razorpay accepted order.create but
    # MongoDB failed before the returned order ID was attached to the reservation.
    # The receipt and immutable checkout details are written to the claims BEFORE
    # calling Razorpay, so a retry can find and validate the original order.
    if existing_claims and all(not c.get("order_id") for c in existing_claims):
        receipts = {c.get("receipt") for c in existing_claims if c.get("receipt")}
        if receipts:
            if (len(receipts) != 1 or len(existing_claims) != len(months)
                    or any(c.get("student_id") != student["id"]
                           or c.get("profile_id") != profile_id
                           or c.get("mode") != mode for c in existing_claims)):
                raise HTTPException(409, "A previous payment reservation needs administrator reconciliation. Do not pay again.")
            recovery_receipt = next(iter(receipts))
            related = await db.razorpay_student_month_claims.find(
                {"receipt": recovery_receipt},
                {"_id": 0, "student_id": 1, "profile_id": 1, "month": 1,
                 "mode": 1, "reservation_token": 1, "receipt": 1,
                 "amount_paise": 1, "currency": 1, "breakdown": 1, "order_id": 1},
            ).to_list(length=100)
            if (not related or any(
                c.get("student_id") != student["id"]
                or c.get("profile_id") != profile_id
                or c.get("mode") != mode
                or c.get("receipt") != recovery_receipt
                for c in related
            )):
                raise HTTPException(409, "A previous payment reservation could not be safely verified. Do not pay again.")
            saved_breakdowns = [c.get("breakdown") for c in related if c.get("breakdown")]
            saved_amounts = {int(c.get("amount_paise") or 0) for c in related}
            saved_currencies = {str(c.get("currency") or "") for c in related}
            saved_months = sorted(str(c.get("month") or "") for c in related)
            if (not saved_breakdowns or len(saved_amounts) != 1 or len(saved_currencies) != 1
                    or saved_currencies != {"INR"} or len(saved_months) != len(set(saved_months))):
                raise HTTPException(409, "A previous payment reservation has incomplete recovery details. Do not pay again.")
            saved_breakdown = saved_breakdowns[0]
            expected_months = sorted(str(x.get("month") or "") for x in saved_breakdown)
            expected_amount = sum(int(x.get("amount_paise") or 0) for x in saved_breakdown)
            if (saved_months != expected_months or expected_amount not in saved_amounts):
                raise HTTPException(409, "A previous payment reservation does not match its saved checkout details. Do not pay again.")
            try:
                recovery_client = razorpay.Client(auth=(key_id, key_secret))
                response = await run_in_threadpool(
                    recovery_client.order.all, {"receipt": recovery_receipt, "count": 100}
                )
            except Exception:
                logging.exception("Could not search Razorpay by saved checkout receipt")
                raise HTTPException(503, "Could not verify the previous checkout. Do not pay again; contact the administrator.")
            remote_items = response.get("items", []) if isinstance(response, dict) else []
            matches = [o for o in remote_items if o.get("receipt") == recovery_receipt]
            if len(matches) != 1:
                # A missing result is NOT proof the remote order was never created.
                raise HTTPException(409, "The previous checkout is still being reconciled. Do not pay again; contact the administrator.")
            recovered = matches[0]
            remote_notes = recovered.get("notes") or {}
            remote_months = sorted(
                m.strip() for m in str(remote_notes.get("months") or "").split(",") if m.strip()
            )
            if (not recovered.get("id")
                    or remote_notes.get("edunotes_profile_id") != profile_id
                    or str(remote_notes.get("tuition_student_id")) != str(student["id"])
                    or remote_months != expected_months
                    or int(recovered.get("amount") or 0) != expected_amount
                    or str(recovered.get("currency") or "").upper() != "INR"):
                raise HTTPException(409, "The previous checkout could not be matched safely. Do not pay again; contact the administrator.")
            recovered_status = str(recovered.get("status") or "").lower()
            local_status = "created" if recovered_status in {"created", "attempted"} else "reconciliation_required"
            await db.razorpay_student_orders.update_one(
                {"order_id": recovered["id"]},
                {"$setOnInsert": {
                    "order_id": recovered["id"], "profile_id": profile_id,
                    "student_id": student["id"], "amount_paise": expected_amount,
                    "currency": "INR", "breakdown": saved_breakdown,
                    "status": local_status, "mode": mode,
                    "reservation_token": related[0].get("reservation_token"),
                    "receipt": recovery_receipt,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
            await db.razorpay_student_month_claims.update_many(
                {"receipt": recovery_receipt, "student_id": student["id"],
                 "profile_id": profile_id, "mode": mode},
                {"$set": {"order_id": recovered["id"], "status": local_status,
                          "expires_at": None if local_status == "reconciliation_required" else (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()}},
            )
            existing_claims = []
            for month in months:
                claim = await db.razorpay_student_month_claims.find_one(
                    {"_id": f"{student['id']}:{month}"},
                    {"_id": 0, "student_id": 1, "profile_id": 1, "month": 1,
                     "mode": 1, "order_id": 1, "status": 1, "reservation_token": 1},
                )
                if claim:
                    existing_claims.append(claim)

    if existing_claims:
        # Safe reconciliation for failed legacy orders. Razorpay support confirmed
        # these failed order IDs cannot be reused for another payment. We still
        # independently verify every attempt through Razorpay before releasing any
        # month claim; any unknown/pending/captured state blocks checkout.
        claim_order_ids = {c.get("order_id") for c in existing_claims if c.get("order_id")}
        if claim_order_ids:
            rz_reconcile = razorpay.Client(auth=(key_id, key_secret))
            reconciled_orders = []
            all_failed = True
            for old_order_id in sorted(claim_order_ids):
                # First verify the reservation's ownership. This is needed for
                # legacy claims whose order metadata was saved but whose local
                # order document was not persisted successfully.
                related_claims = await db.razorpay_student_month_claims.find(
                    {"order_id": old_order_id}, {"_id": 0, "student_id": 1,
                     "profile_id": 1, "mode": 1, "month": 1}
                ).to_list(length=100)
                if (not related_claims or any(
                    c.get("student_id") != student["id"]
                    or c.get("profile_id") != profile_id
                    or c.get("mode") != mode
                    for c in related_claims
                )):
                    all_failed = False
                    break

                old_doc = await db.razorpay_student_orders.find_one(
                    {"order_id": old_order_id, "profile_id": profile_id,
                     "student_id": student["id"], "mode": mode}, {"_id": 0}
                )
                if old_doc and old_doc.get("status") == "recorded":
                    all_failed = False
                    break
                # Existing fee ledger rows mean this order has already affected
                # accounting, so never release its reservation automatically.
                ledger_row = await db.payments.find_one(
                    {"razorpay_order_id": old_order_id}, {"_id": 0, "id": 1}
                )
                if ledger_row:
                    all_failed = False
                    break
                try:
                    remote_order = await run_in_threadpool(rz_reconcile.order.fetch, old_order_id)
                    remote_payments = await run_in_threadpool(
                        rz_reconcile.payment.all, {"order_id": old_order_id}
                    )
                except Exception:
                    logging.exception("Could not verify old Razorpay order before reconciliation")
                    raise HTTPException(503, "Could not verify the previous payment attempts. Do not pay again; contact the administrator.")
                remote_status = str(remote_order.get("status") or "").lower()
                attempts = remote_payments.get("items", []) if isinstance(remote_payments, dict) else []
                notes = remote_order.get("notes") or {}
                # If the local order document is missing (legacy interrupted
                # write), require Razorpay's own notes, amount, currency, and
                # month claims to prove this order belongs to this student.
                if not old_doc:
                    claimed_months = sorted(
                        str(c.get("month")) for c in related_claims if c.get("month")
                    )
                    remote_months = sorted(
                        m.strip() for m in str(notes.get("months") or "").split(",") if m.strip()
                    )
                    # Validate a legacy order against the months reserved by THAT
                    # order, not the months the student is selecting in this retry.
                    # A retry may select September + October while the stale order
                    # only reserved October; comparing with total_paise would block
                    # safe reconciliation forever.
                    claimed_total_paise = 0
                    try:
                        for claimed_month in claimed_months:
                            claimed_balance = await _student_month_balance(
                                student["id"], claimed_month, student.get("monthly_fee")
                            )
                            claimed_total_paise += int(
                                (claimed_balance * 100).quantize(
                                    Decimal("1"), rounding=ROUND_HALF_UP
                                )
                            )
                    except Exception:
                        logging.exception(
                            "Could not calculate legacy Razorpay order amount for reconciliation"
                        )
                        all_failed = False
                        break

                    if (notes.get("edunotes_profile_id") != profile_id
                            or str(notes.get("tuition_student_id")) != str(student["id"])
                            or remote_months != claimed_months
                            or int(remote_order.get("amount") or 0) != claimed_total_paise
                            or str(remote_order.get("currency") or "").upper() != "INR"):
                        logging.warning(
                            "Razorpay legacy order reconciliation blocked: metadata/amount mismatch "
                            "(order_id=%s, months_match=%s, expected_paise=%s, remote_paise=%s, currency=%s)",
                            old_order_id, remote_months == claimed_months, claimed_total_paise,
                            remote_order.get("amount"), remote_order.get("currency")
                        )
                        all_failed = False
                        break
                # Require at least one attempt and every attempt explicitly failed.
                # Empty, pending, authorized, captured, paid, or unknown states
                # never release a reservation.
                if (remote_order.get("id") != old_order_id or remote_status == "paid"
                        or not attempts or any(
                            str(a.get("status") or "").lower() != "failed"
                            or a.get("captured") is True
                            for a in attempts
                        )):
                    all_failed = False
                    break
                reconciled_orders.append(old_order_id)

            # IMPORTANT: failed payment attempts do NOT make a Razorpay order
            # unpayable. An order in created/attempted state can still be paid,
            # so never delete its month claim merely because all attempts failed.
            # The safe path below reuses that order when it exactly matches the
            # selected months. If different months belong to different orders,
            # this endpoint cannot combine them into one checkout; keep claims and
            # return an actionable response rather than risk duplicate charges.
            if all_failed and reconciled_orders and len(reconciled_orders) == len(claim_order_ids):
                logging.info(
                    "Razorpay order has only failed attempts but reservation retained; "
                    "order may still be payable (student_id=%s, order_ids=%s)",
                    student["id"], sorted(reconciled_orders),
                )

    if existing_claims:
        # Reuse only when every selected month belongs to the same existing
        # order and the stored order exactly matches this student's selection.
        claim_order_ids = {c.get("order_id") for c in existing_claims}
        same_owner = all(
            c.get("student_id") == student["id"]
            and c.get("profile_id") == profile_id
            and c.get("mode") == mode
            for c in existing_claims
        )
        # A prior multi-month checkout can leave only some month-claims in the
        # collection (for example, October is reserved but September's claim row
        # was never persisted). If the existing local order proves that it covers
        # the EXACT selection and amount, we may safely reuse it and repair missing
        # claim rows. Do not require one claim document per selected month here.
        if existing_claims and same_owner and len(claim_order_ids) == 1 and None not in claim_order_ids:
            old_order_id = next(iter(claim_order_ids))
            old_doc = await db.razorpay_student_orders.find_one(
                {"order_id": old_order_id, "profile_id": profile_id, "student_id": student["id"], "mode": mode},
                {"_id": 0},
            )
            if old_doc:
                old_months = sorted(x.get("month") for x in old_doc.get("breakdown", []) if x.get("month"))
                old_amount = int(old_doc.get("amount_paise") or 0)
                if old_months == months and old_amount == total_paise:
                    rz = razorpay.Client(auth=(key_id, key_secret))
                    try:
                        remote_order = await run_in_threadpool(rz.order.fetch, old_order_id)
                    except Exception:
                        logging.exception("Could not confirm existing Razorpay order status")
                        raise HTTPException(503, "Could not confirm the previous payment status. Do not pay again; please contact the administrator.")
                    remote_status = str(remote_order.get("status") or "").lower()
                    if remote_status == "paid":
                        await db.razorpay_student_month_claims.update_many(
                            {"order_id": old_order_id},
                            {"$set": {"status": "reconciliation_required", "expires_at": None}},
                        )
                        raise HTTPException(409, "This order is already paid or awaiting fee reconciliation. Do not pay again.")
                    if remote_status in {"created", "attempted"}:
                        # Repair any missing month-claim rows only after the saved
                        # order and Razorpay status have been matched to this exact
                        # student, mode, month selection and total. Never overwrite
                        # a claim that points at a different order.
                        reservation_token_for_repair = (
                            old_doc.get("reservation_token")
                            or existing_claims[0].get("reservation_token")
                        )
                        for selected_month in months:
                            month_claim_id = f"{student['id']}:{selected_month}"
                            month_claim = await db.razorpay_student_month_claims.find_one(
                                {"_id": month_claim_id}, {"_id": 0, "order_id": 1,
                                 "student_id": 1, "profile_id": 1, "mode": 1}
                            )
                            if month_claim:
                                if (month_claim.get("student_id") != student["id"]
                                        or month_claim.get("profile_id") != profile_id
                                        or month_claim.get("mode") != mode
                                        or month_claim.get("order_id") != old_order_id):
                                    raise HTTPException(
                                        409,
                                        "A selected month is reserved by a different payment order. Do not pay again; contact the administrator."
                                    )
                                continue
                            await db.razorpay_student_month_claims.update_one(
                                {"_id": month_claim_id},
                                {"$setOnInsert": {
                                    "_id": month_claim_id,
                                    "student_id": student["id"],
                                    "profile_id": profile_id,
                                    "month": selected_month,
                                    "mode": mode,
                                    "reservation_token": reservation_token_for_repair,
                                    "order_id": old_order_id,
                                    "status": remote_status,
                                    "created_at": datetime.now(timezone.utc).isoformat(),
                                    "expires_at": None,
                                    "receipt": old_doc.get("receipt"),
                                    "amount_paise": old_amount,
                                    "currency": old_doc.get("currency") or "INR",
                                    "breakdown": old_doc.get("breakdown", []),
                                }},
                                upsert=True,
                            )
                        # Return the original order, never create a second one.
                        return {
                            "order_id": old_order_id,
                            "key_id": key_id,
                            "amount": old_amount,
                            "currency": old_doc.get("currency") or "INR",
                            "name": str(student.get("name") or "EduNotes Pro Student"),
                            "test_mode": mode == "test",
                        }
                    raise HTTPException(409, "The previous Razorpay order is not safely reusable. Please contact the administrator before paying again.")
            else:
                # Repair a legacy/interrupted write where the month claims have the
                # Razorpay order ID but the local order document was never saved.
                # Reuse is allowed only after Razorpay independently confirms that
                # this exact order belongs to this student, covers exactly these
                # months, has the exact current total, and remains unpaid/payable.
                # Never release claims or create a replacement order in this path.
                try:
                    rz = razorpay.Client(auth=(key_id, key_secret))
                    remote_order = await run_in_threadpool(rz.order.fetch, old_order_id)
                except Exception:
                    logging.exception("Could not verify legacy Razorpay order missing from local order collection")
                    raise HTTPException(503, "Could not verify the previous payment order. Do not pay again; please contact the administrator.")

                remote_status = str(remote_order.get("status") or "").lower()
                remote_notes = remote_order.get("notes") or {}
                remote_months = sorted(
                    m.strip() for m in str(remote_notes.get("months") or "").split(",") if m.strip()
                )
                related_claims = await db.razorpay_student_month_claims.find(
                    {"order_id": old_order_id},
                    {"_id": 0, "student_id": 1, "profile_id": 1, "mode": 1, "month": 1},
                ).to_list(length=100)
                claimed_months = sorted(str(c.get("month") or "") for c in related_claims if c.get("month"))
                claims_owned = bool(related_claims) and all(
                    c.get("student_id") == student["id"]
                    and c.get("profile_id") == profile_id
                    and c.get("mode") == mode
                    for c in related_claims
                )
                remote_matches = (
                    remote_order.get("id") == old_order_id
                    and remote_notes.get("edunotes_profile_id") == profile_id
                    and str(remote_notes.get("tuition_student_id")) == str(student["id"])
                    and remote_months == months
                    and claimed_months == months
                    and int(remote_order.get("amount") or 0) == total_paise
                    and str(remote_order.get("currency") or "").upper() == "INR"
                    and claims_owned
                )
                if remote_status == "paid":
                    await db.razorpay_student_month_claims.update_many(
                        {"order_id": old_order_id},
                        {"$set": {"status": "reconciliation_required", "expires_at": None}},
                    )
                    raise HTTPException(409, "This previous order is already paid or awaiting fee reconciliation. Do not pay again.")
                if not remote_matches or remote_status not in {"created", "attempted"}:
                    raise HTTPException(409, "The previous order could not be safely reused. Do not pay again; contact the administrator for reconciliation.")

                repaired_order_doc = {
                    "order_id": old_order_id,
                    "profile_id": profile_id,
                    "student_id": student["id"],
                    "amount_paise": total_paise,
                    "currency": "INR",
                    "breakdown": breakdown,
                    "status": remote_status,
                    "mode": mode,
                    "reservation_token": existing_claims[0].get("reservation_token"),
                    "receipt": remote_order.get("receipt"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.razorpay_student_orders.update_one(
                    {"order_id": old_order_id}, {"$setOnInsert": repaired_order_doc}, upsert=True
                )
                await db.razorpay_student_month_claims.update_many(
                    {"order_id": old_order_id, "student_id": student["id"],
                     "profile_id": profile_id, "mode": mode},
                    {"$set": {"status": remote_status, "expires_at": None}},
                )
                return {
                    "order_id": old_order_id,
                    "key_id": key_id,
                    "amount": total_paise,
                    "currency": "INR",
                    "name": str(student.get("name") or "EduNotes Pro Student"),
                    "test_mode": mode == "test",
                }
        # A single checkout response can contain only one Razorpay order. If the
        # selected months are already attached to different orders, do not merge
        # or replace them: ask the student to retry one month at a time. This is
        # actionable and preserves the old orders' ability to be paid safely.
        claim_order_ids = {c.get("order_id") for c in existing_claims if c.get("order_id")}
        if len(claim_order_ids) > 1:
            raise HTTPException(
                409,
                "These fee months belong to different existing payment orders. "
                "To avoid duplicate charges, go back and pay one month at a time, "
                "starting with the month shown as already in progress. If it still "
                "fails, contact the administrator with the month and order ID."
            )
        raise HTTPException(
            409,
            "A previous payment order still reserves this month and could still be payable. "
            "Refresh fee history and retry the same month to reuse its order; if the issue "
            "continues, contact the administrator. Do not create another payment."
        )

    reservation_token = str(uuid.uuid4())
    receipt = "edu_" + uuid.uuid4().hex[:24]
    await _reserve_razorpay_months(
        student_id=student["id"], profile_id=profile_id, months=months,
        mode=mode, reservation_token=reservation_token,
        key_id=key_id, key_secret=key_secret,
    )
    # Persist the remote idempotency/recovery key and exact checkout payload before
    # the network call. If the process crashes or Mongo write fails after Razorpay
    # creates the order, a retry can recover the same order rather than orphaning
    # a permanent reservation or creating a second payable order.
    await db.razorpay_student_month_claims.update_many(
        {"reservation_token": reservation_token, "status": "reserving"},
        {"$set": {"receipt": receipt, "amount_paise": total_paise,
                  "currency": "INR", "breakdown": breakdown}},
    )
    try:
        rz = razorpay.Client(auth=(key_id, key_secret))
        order = await run_in_threadpool(
            rz.order.create,
            {"amount": total_paise, "currency": "INR", "receipt": receipt,
             "payment_capture": 1,
             "notes": {"edunotes_profile_id": profile_id, "tuition_student_id": student["id"], "months": ",".join(months)}},
        )
        await db.razorpay_student_orders.insert_one({
            "order_id": order["id"], "profile_id": profile_id, "student_id": student["id"],
            "amount_paise": total_paise, "currency": "INR", "breakdown": breakdown,
            "status": "created", "mode": mode, "reservation_token": reservation_token,
            "receipt": receipt,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.razorpay_student_month_claims.update_many(
            {"reservation_token": reservation_token},
            {"$set": {"order_id": order["id"], "status": "created"}},
        )
    except HTTPException:
        await _release_razorpay_month_claims(reservation_token)
        raise
    except Exception:
        logging.exception("Student Razorpay order creation failed")
        # If Razorpay created an order but persistence failed, keep the claims
        # rather than risk a second charge for the same months.
        existing_order = await db.razorpay_student_orders.find_one({"reservation_token": reservation_token})
        if existing_order:
            # The Razorpay order may exist even if attaching its ID to the claims
            # failed. Repair the local reservation to fail closed.
            await db.razorpay_student_month_claims.update_many(
                {"reservation_token": reservation_token},
                {"$set": {"order_id": existing_order.get("order_id"),
                          "status": "reconciliation_required", "expires_at": None}},
            )
        else:
            claims = await db.razorpay_student_month_claims.find(
                {"reservation_token": reservation_token}, {"_id": 1}
            ).to_list(24)
            if claims:
                # If order creation or persistence had an ambiguous result, do not
                # expire the reservation and risk a second charge.
                await db.razorpay_student_month_claims.update_many(
                    {"reservation_token": reservation_token},
                    {"$set": {"status": "reconciliation_required", "expires_at": None,
                              "receipt": receipt, "amount_paise": total_paise,
                              "currency": "INR", "breakdown": breakdown}},
                )
        raise HTTPException(502, "Could not safely finish payment setup. Do not retry payment until the administrator checks the order.")
    return {"order_id": order["id"], "key_id": key_id, "amount": total_paise,
            "currency": "INR", "name": str(student.get("name") or "EduNotes Pro Student"), "test_mode": mode == "test"}


@public_router.post("/student-payments/razorpay/verify")
async def verify_student_razorpay_payment(
    payload: StudentRazorpayVerifyIn,
    authorization: Optional[str] = Header(None),
):
    mode, key_id, key_secret = _razorpay_mode_and_credentials()
    profile_id, student = await _verified_edunotes_student(authorization)
    order_doc = await db.razorpay_student_orders.find_one(
        {"order_id": payload.order_id, "profile_id": profile_id, "student_id": student["id"]},
        {"_id": 0},
    )
    if not order_doc:
        raise HTTPException(404, "Payment order not found for this student")
    if order_doc.get("mode") != mode:
        raise HTTPException(409, "This payment order was created in a different Razorpay mode. Do not pay again; contact the administrator.")
    # Check HMAC using the server-held secret; never trust the browser callback alone.
    expected = hmac.new(key_secret.encode(), (payload.order_id + "|" + payload.payment_id).encode(), "sha256").hexdigest()
    if not hmac.compare_digest(expected, payload.signature):
        raise HTTPException(400, "Payment signature could not be verified")
    from fastapi.concurrency import run_in_threadpool
    import razorpay
    try:
        rz = razorpay.Client(auth=(key_id, key_secret))
        payment = await run_in_threadpool(rz.payment.fetch, payload.payment_id)
        remote_order = await run_in_threadpool(rz.order.fetch, payload.order_id)
    except Exception:
        logging.exception("Razorpay payment status lookup failed")
        raise HTTPException(502, "Could not confirm payment status. Refresh and retry verification.")
    if payment.get("order_id") != payload.order_id or remote_order.get("id") != payload.order_id:
        raise HTTPException(400, "Payment does not match the order")
    if payment.get("status") != "captured" or payment.get("captured") is not True:
        raise HTTPException(409, "Razorpay has not confirmed a captured payment yet")
    if int(payment.get("amount") or 0) != int(order_doc.get("amount_paise") or -1) or int(remote_order.get("amount") or 0) != int(order_doc.get("amount_paise") or -1):
        raise HTTPException(400, "The captured amount does not match the fee order")
    if str(payment.get("currency") or "") != "INR":
        raise HTTPException(400, "Unexpected payment currency")

    # Idempotent success must be checked before recreating month claims. The
    # successful path deletes claims; recreating them on a repeat callback would
    # incorrectly block the student's next checkout forever.
    already = await db.razorpay_student_orders.find_one(
        {"order_id": payload.order_id, "profile_id": profile_id,
         "status": "recorded", "payment_id": payload.payment_id},
        {"_id": 0, "order_id": 1},
    )
    if already:
        return {"ok": True, "already_recorded": True, "message": "Payment is already recorded"}

    # A second captured payment for the same student/month must never create a
    # second online ledger credit, even if it has a different payment ID.
    # Checkout reservations serialize new orders; this check also protects orders
    # that were created before reservations were introduced.
    for item in order_doc.get("breakdown", []):
        competing = await db.payments.find_one({
            "student_id": student["id"], "month": item["month"],
            "razorpay_payment_id": {"$type": "string", "$ne": payload.payment_id},
        }, {"_id": 0, "razorpay_payment_id": 1})
        if competing:
            await db.razorpay_student_orders.update_one(
                {"order_id": payload.order_id},
                {"$set": {"status": "reconciliation_required", "payment_id": payload.payment_id}},
            )
            await db.razorpay_student_month_claims.update_many(
                {"_id": {"$in": [f"{student['id']}:{x['month']}" for x in order_doc.get("breakdown", [])]}},
                {"$set": {"status": "reconciliation_required", "expires_at": None}},
            )
            raise HTTPException(409, "Payment was captured but this month already has another online payment. Do not pay again; administrator reconciliation is required.")

    # Re-establish/verify claims for orders created before the reservation patch.
    # A different order's claim is never taken over after a payment is captured.
    for item in order_doc.get("breakdown", []):
        claim_id = f"{student['id']}:{item['month']}"
        claim_doc = await db.razorpay_student_month_claims.find_one({"_id": claim_id}, {"_id": 0, "order_id": 1, "status": 1})
        if claim_doc and claim_doc.get("order_id") not in (None, payload.order_id):
            await db.razorpay_student_orders.update_one(
                {"order_id": payload.order_id},
                {"$set": {"status": "reconciliation_required", "payment_id": payload.payment_id}},
            )
            raise HTTPException(409, "Payment was captured but another order owns this fee-month reservation. Do not pay again; administrator reconciliation is required.")
        if not claim_doc:
            try:
                await db.razorpay_student_month_claims.insert_one({
                    "_id": claim_id, "student_id": student["id"], "profile_id": profile_id,
                    "month": item["month"], "mode": mode, "reservation_token": order_doc.get("reservation_token", payload.order_id),
                    "order_id": payload.order_id, "status": "verifying", "expires_at": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                claim_doc = await db.razorpay_student_month_claims.find_one({"_id": claim_id}, {"_id": 0, "order_id": 1})
                if not claim_doc or claim_doc.get("order_id") != payload.order_id:
                    await db.razorpay_student_orders.update_one(
                        {"order_id": payload.order_id},
                        {"$set": {"status": "reconciliation_required", "payment_id": payload.payment_id}},
                    )
                    raise HTTPException(409, "Payment was captured but the fee-month reservation could not be secured. Do not pay again; administrator reconciliation is required.")
        else:
            await db.razorpay_student_month_claims.update_one(
                {"_id": claim_id, "order_id": {"$in": [None, payload.order_id]}},
                {"$set": {"order_id": payload.order_id, "status": "verifying", "expires_at": None}},
            )

    # One payment ID may create one ledger row per month, but never twice for the same month.
    try:
        await db.payments.create_index(
            [("razorpay_payment_id", 1), ("month", 1)], unique=True,
            partialFilterExpression={"razorpay_payment_id": {"$type": "string"}},
            name="uniq_razorpay_payment_month",
        )
    except Exception:
        logging.exception("Could not ensure Razorpay idempotency index")
        raise HTTPException(500, "Payment safety check is unavailable; no fee record was changed")
    # Return immediately for a fully recorded payment. This makes repeat callbacks idempotent.
    already = await db.razorpay_student_orders.find_one(
        {"order_id": payload.order_id, "profile_id": profile_id, "status": "recorded", "payment_id": payload.payment_id},
        {"_id": 0, "order_id": 1},
    )
    if already:
        return {"ok": True, "already_recorded": True, "message": "Payment is already recorded"}

    # Never let a second payment replace the payment already associated with this order.
    if order_doc.get("payment_id") and order_doc.get("payment_id") != payload.payment_id:
        raise HTTPException(409, "A different payment is already attached to this order")

    # Claim atomically. A verified payment that previously failed during ledger or
    # Supabase synchronization may be retried from reconciliation_required. Also
    # recover a process that crashed while status was "verifying", but only after
    # a 15-minute lease expires. This avoids leaving a captured payment stuck forever
    # while not allowing an immediate second request to take over active work.
    # The unique payment/month index below prevents duplicate ledger rows.
    stale_verification_before = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    claim = await db.razorpay_student_orders.update_one(
        {
            "order_id": payload.order_id,
            "profile_id": profile_id,
            "student_id": student["id"],
            "$and": [
                {
                    "$or": [
                        {"status": {"$in": ["created", "reconciliation_required"]}},
                        {"status": "verifying", "verified_at": {"$lt": stale_verification_before}},
                    ]
                },
                {
                    "$or": [
                        {"payment_id": {"$exists": False}},
                        {"payment_id": None},
                        {"payment_id": payload.payment_id},
                    ]
                },
            ],
        },
        {"$set": {"status": "verifying", "payment_id": payload.payment_id, "verified_at": datetime.now(timezone.utc).isoformat()}},
    )
    if claim.matched_count == 0:
        # Another request may have completed while this request was checking.
        already = await db.razorpay_student_orders.find_one(
            {"order_id": payload.order_id, "profile_id": profile_id, "status": "recorded", "payment_id": payload.payment_id},
            {"_id": 0, "order_id": 1},
        )
        if already:
            return {"ok": True, "already_recorded": True, "message": "Payment is already recorded"}
        raise HTTPException(409, "This order is already being processed or cannot be retried safely. Do not pay again.")
    try:
        breakdown = order_doc.get("breakdown", [])
        for item in breakdown:
            month = item["month"]
            existing = await db.payments.find_one({"razorpay_payment_id": payload.payment_id, "month": month}, {"_id": 0, "id": 1})
            if existing:
                continue
            balance = await _student_month_balance(student["id"], month, student.get("monthly_fee"))
            amount = int(item["amount_paise"]) / 100
            if balance <= 0 or abs(float(balance) - amount) > 0.01:
                raise RuntimeError("The fee balance changed after checkout was started; administrator reconciliation is required.")
        for item in breakdown:
            month = item["month"]
            existing = await db.payments.find_one({"razorpay_payment_id": payload.payment_id, "month": month}, {"_id": 0, "id": 1})
            if existing:
                continue
            amount = int(item["amount_paise"]) / 100
            record = {
                "id": str(uuid.uuid4()), "student_id": student["id"], "month": month,
                "amount": amount, "fee_snapshot": float(student.get("monthly_fee") or 0),
                "note": "Razorpay " + mode.title() + " Mode payment " + payload.payment_id,
                "payment_date": datetime.now(timezone.utc).date().isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "razorpay_payment_id": payload.payment_id, "razorpay_order_id": payload.order_id,
                "payment_method": "razorpay_live" if mode == "live" else "razorpay_test",
            }
            await db.payments.insert_one(record)
        sync_ok = await sync_payment_for_student(student["id"])
        if sync_ok is not True:
            raise RuntimeError(
                "EduNotes Pro fee-history synchronization did not confirm success."
            )
        await db.razorpay_student_orders.update_one(
            {"order_id": payload.order_id},
            {"$set": {"status": "recorded", "synced_at": datetime.now(timezone.utc).isoformat(), "recorded_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.razorpay_student_month_claims.delete_many({"order_id": payload.order_id})
    except Exception:
        logging.exception("Verified Razorpay payment needs reconciliation")
        await db.razorpay_student_orders.update_one(
            {"order_id": payload.order_id},
            {"$set": {"status": "reconciliation_required", "payment_id": payload.payment_id}},
        )
        await db.razorpay_student_month_claims.update_many(
            {"order_id": payload.order_id},
            {"$set": {"status": "reconciliation_required", "expires_at": None}},
        )
        raise HTTPException(500, "Payment was captured, but fee recording needs administrator reconciliation. Do not pay again; contact the administrator.")
    return {"ok": True, "already_recorded": False, "message": "Payment verified and fee history synchronized"}


# ---------- Razorpay Test Mode preparation ----------
# These teacher-authenticated endpoints are intentionally limited to order
# preparation. They do not expose student checkout, record payments, or
# modify the existing manual fee collection process.
class RazorpayTestOrderIn(BaseModel):
    student_id: str
    month: str


@api_router.post("/razorpay/test-order")
async def create_razorpay_test_order(payload: RazorpayTestOrderIn):
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id.startswith("rzp_test_") or not key_secret:
        raise HTTPException(503, "Razorpay Test Mode is not configured")

    student = await db.students.find_one(
        {"id": payload.student_id},
        {"_id": 0, "id": 1, "monthly_fee": 1},
    )
    if not student:
        raise HTTPException(404, "Student not found")

    # Never accept an amount from the browser. Derive it from the ledger.
    from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
    try:
        fee = Decimal(str(student.get("monthly_fee") or 0))
        if not fee.is_finite() or fee <= 0:
            raise ValueError("Invalid fee")
    except (InvalidOperation, ValueError):
        raise HTTPException(400, "Student monthly fee is invalid")

    month = payload.month.strip()
    import re
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(400, "Month must be YYYY-MM")

    previous = await db.payments.find(
        {"student_id": payload.student_id, "month": month},
        {"_id": 0, "amount": 1},
    ).to_list(10000)
    try:
        paid = sum((Decimal(str(p.get("amount") or 0)) for p in previous), Decimal("0"))
    except InvalidOperation:
        raise HTTPException(500, "Existing payment ledger contains invalid amounts")
    due = fee - paid
    paise = int((due * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if paise < 100:
        raise HTTPException(400, "No payable balance for this month")

    import razorpay
    from fastapi.concurrency import run_in_threadpool
    try:
        client = razorpay.Client(auth=(key_id, key_secret))
        order = await run_in_threadpool(
            client.order.create,
            {"amount": paise, "currency": "INR", "payment_capture": 1,
             "notes": {"student_id": payload.student_id, "month": month}},
        )
    except Exception:
        logging.exception("Razorpay test order creation failed")
        raise HTTPException(502, "Could not create Razorpay test order")

    await db.razorpay_test_orders.insert_one({
        "order_id": order["id"], "student_id": payload.student_id,
        "month": month, "amount_paise": paise, "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"order_id": order["id"], "key_id": key_id,
            "amount_paise": paise, "currency": "INR", "test_mode": True}


# ---------- Payment routes ----------
@api_router.get("/payments")
async def list_payments(
    student_id: Optional[str] = None,
    month: Optional[str] = None
):
    q = {}

    if student_id:
        q["student_id"] = student_id

    if month:
        q["month"] = month

    docs = await db.payments.find(
        q,
        {"_id": 0}
    ).sort(
        "created_at",
        -1
    ).to_list(50000)

    return docs


@api_router.post("/payments")
async def create_payment(
    payload: PaymentIn
):
    data = payload.model_dump(
        exclude_none=True
    )

    if not data.get("payment_date"):
        data["payment_date"] = datetime.now(
            timezone.utc
        ).date().isoformat()

    payment = Payment(**data)

    # --------------------------------------------------------
    # EXISTING TUITION MANAGER PAYMENT BEHAVIOUR
    # --------------------------------------------------------
    await db.payments.insert_one(
        payment.model_dump()
    )

    st = await db.students.find_one(
        {"id": payment.student_id},
        {
            "_id": 0,
            "name": 1,
            "monthly_fee": 1
        }
    )

    if st:
        month_pays = await db.payments.find(
            {
                "student_id": payment.student_id,
                "month": payment.month
            },
            {
                "_id": 0,
                "amount": 1
            }
        ).to_list(1000)

        month_total = sum(
            p.get("amount", 0)
            for p in month_pays
        )

        if month_total >= (
            st.get("monthly_fee") or 0
        ):
            await log_activity(
                f"Marked paid: {st['name']}"
            )
        else:
            await log_activity(
                f"Partial payment ₹{int(payment.amount)}: "
                f"{st['name']}"
            )

    # --------------------------------------------------------
    # NEW: SYNC TO EDUNOTES PRO
    # --------------------------------------------------------
    await sync_payment_for_student(
        payment.student_id,
        payment.month
    )

    # WhatsApp confirmation is best-effort and only runs after the
    # payment record has been inserted successfully. Configure an
    # approved template in WHATSAPP_PAYMENT_TEMPLATE_NAME to enable it.
    try:
        student_for_confirmation = await db.students.find_one(
            {"id": payment.student_id},
            {"_id": 0, "name": 1, "phone": 1, "parent_phone": 1}
        )
        if student_for_confirmation and _whatsapp_env("WHATSAPP_PAYMENT_TEMPLATE_NAME"):
            recipient = (student_for_confirmation.get("parent_phone") or
                         student_for_confirmation.get("phone") or "").strip()
            if recipient:
                await _send_whatsapp_template_internal(
                    to=recipient,
                    template_name=_whatsapp_env("WHATSAPP_PAYMENT_TEMPLATE_NAME"),
                    body_parameters=[
                        str(student_for_confirmation.get("name") or "Student"),
                        str(payment.amount),
                        _month_label(payment.month),
                    ],
                )
    except Exception:
        # Never undo a successfully recorded payment because WhatsApp failed.
        logging.getLogger(__name__).exception(
            "WhatsApp payment confirmation failed for payment_id=%s", payment.id
        )

    # Existing response remains unchanged
    return payment.model_dump()


@api_router.delete("/payments/{payment_id}")
async def delete_payment(
    payment_id: str
):
    # --------------------------------------------------------
    # Capture payment information BEFORE deletion
    # --------------------------------------------------------
    payment = await db.payments.find_one(
        {"id": payment_id},
        {
            "_id": 0,
            "student_id": 1,
            "month": 1,
        }
    )

    if not payment:
        raise HTTPException(
            404,
            "Payment not found"
        )

    student_id = payment.get("student_id")
    month_key = payment.get("month")

    # --------------------------------------------------------
    # EXISTING TUITION MANAGER DELETE BEHAVIOUR
    # --------------------------------------------------------
    result = await db.payments.delete_one(
        {"id": payment_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            404,
            "Payment not found"
        )

    # --------------------------------------------------------
    # NEW: SYNC REMAINING MONTHLY TOTAL TO EDUNOTES PRO
    # --------------------------------------------------------
    if student_id and month_key:
        await sync_payment_for_student(
            student_id,
            month_key
        )

    return {"ok": True}


# ---------- Calendar routes ----------
@api_router.get("/events")
async def list_events():
    docs = await db.events.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    return docs


@api_router.post("/events")
async def create_event(
    payload: CalendarEventIn
):
    ev = CalendarEvent(
        **payload.model_dump()
    )

    await db.events.insert_one(
        ev.model_dump()
    )

    return ev.model_dump()


@api_router.delete("/events/{event_id}")
async def delete_event(
    event_id: str
):
    result = await db.events.delete_one(
        {"id": event_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            404,
            "Event not found"
        )

    return {"ok": True}


# ---------- Settings & Activity ----------
async def log_activity(msg):
    await db.activities.insert_one(
        {
            "id": str(uuid.uuid4()),
            "msg": msg,
            "time": datetime.now(
                timezone.utc
            ).isoformat()
        }
    )


@api_router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one(
        {"id": "settings"},
        {"_id": 0}
    )

    if not doc:
        await db.settings.insert_one(
            dict(DEFAULT_SETTINGS)
        )

        return dict(DEFAULT_SETTINGS)

    return doc


@api_router.put("/settings")
async def update_settings(
    payload: SettingsIn
):
    updates = payload.model_dump(
        exclude_none=True
    )

    if updates:
        await db.settings.update_one(
            {"id": "settings"},
            {"$set": updates},
            upsert=True
        )

    return await get_settings()


@api_router.get("/activities")
async def list_activities():
    docs = await db.activities.find(
        {},
        {"_id": 0}
    ).sort(
        "time",
        -1
    ).to_list(50)

    return docs


# ---------- Export / Import ----------
@api_router.get("/export")
async def export_all():
    batches = await db.batches.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    students = await db.students.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    payments = await db.payments.find(
        {},
        {"_id": 0}
    ).to_list(100000)

    events = await db.events.find(
        {},
        {"_id": 0}
    ).to_list(10000)

    activities = await db.activities.find(
        {},
        {"_id": 0}
    ).sort(
        "time",
        -1
    ).to_list(200)

    settings = await db.settings.find_one(
        {"id": "settings"},
        {"_id": 0}
    )

    return {
        "exported_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "batches": batches,
        "students": students,
        "payments": payments,
        "events": events,
        "activities": activities,
        "settings": settings or dict(
            DEFAULT_SETTINGS
        ),
    }


async def _replace_collection(
    name,
    docs
):
    await db[name].delete_many({})

    if docs:
        await db[name].insert_many(docs)


@api_router.post("/import")
async def import_all(
    payload: ImportPayload
):
    def sanitize(items):
        if not isinstance(items, list):
            return []

        return [
            {
                k: v
                for k, v in it.items()
                if k != "_id"
            }
            for it in items
            if isinstance(it, dict)
        ]

    batches = sanitize(payload.batches)
    students = sanitize(payload.students)
    payments = sanitize(payload.payments)
    events = sanitize(payload.events)
    activities = sanitize(payload.activities)

    settings = (
        payload.settings
        if isinstance(
            payload.settings,
            dict
        )
        else None
    )

    await _replace_collection(
        "batches",
        batches
    )

    await _replace_collection(
        "students",
        students
    )

    await _replace_collection(
        "payments",
        payments
    )

    await _replace_collection(
        "events",
        events
    )

    await _replace_collection(
        "activities",
        activities
    )

    if settings:
        settings.pop("_id", None)
        settings["id"] = "settings"

        await db.settings.replace_one(
            {"id": "settings"},
            settings,
            upsert=True
        )

    return {
        "ok": True,
        "counts": {
            "batches": len(batches),
            "students": len(students),
            "payments": len(payments),
            "events": len(events),
            "activities": len(activities)
        }
    }


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
        {
            "name": "CLASS 7",
            "subject": "English",
            "class_time": "7:00 PM",
            "monthly_fee": 600
        },
        {
            "name": "CLASS 8",
            "subject": "Math",
            "class_time": "6:30 PM",
            "monthly_fee": 700
        },
        {
            "name": "CLASS 10 MORNING",
            "subject": "Science",
            "class_time": "8:00 AM",
            "monthly_fee": 900
        },
        {
            "name": "CLASS 10 EVENING",
            "subject": "Science",
            "class_time": "5:30 PM",
            "monthly_fee": 900
        },
        {
            "name": "CLASS 12 EVENING",
            "subject": "Physics",
            "class_time": "5:00 PM",
            "monthly_fee": 1100
        },
        {
            "name": "CLASS 12 NIGHT",
            "subject": "Physics",
            "class_time": "8:30 PM",
            "monthly_fee": 1100
        },
    ]

    return [
        Batch(**b).model_dump()
        for b in batches_seed
    ]


SKIP_LAST_MONTH = (
    "Adrika",
    "Trisha",
    "Anchal",
    "Kabir",
    "Vivaan"
)


def _seed_payment_amount(
    name,
    fee,
    k
):
    if k == 2 and name == "Digbijoy":
        return fee / 2

    return fee


def _seed_student_docs(
    batch_docs,
    now_month
):
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

    for (
        name,
        phone,
        bidx,
        fee,
        months_back
    ) in students_seed:

        batch_id = batch_docs[bidx]["id"]

        join = _prev_month(
            now_month,
            months_back
        )

        st = Student(
            name=name,
            phone=phone,
            batch_id=batch_id,
            monthly_fee=fee,
            join_month=join
        )

        student_docs.append(
            st.model_dump()
        )

        for k in range(
            months_back,
            0,
            -1
        ):

            if (
                k == 1
                and name in SKIP_LAST_MONTH
            ):
                continue

            m = _prev_month(
                now_month,
                k
            )

            amt = _seed_payment_amount(
                name,
                fee,
                k
            )

            payment_docs.append(
                Payment(
                    student_id=st.id,
                    month=m,
                    amount=amt,
                    fee_snapshot=fee
                ).model_dump()
            )

    return (
        student_docs,
        payment_docs
    )


@api_router.post("/seed")
async def seed():
    existing = await db.batches.count_documents({})

    if existing > 0:
        return {
            "ok": True,
            "seeded": False,
            "reason": "data exists"
        }

    now_month = datetime.now(
        timezone.utc
    ).strftime("%Y-%m")

    batch_docs = _seed_batch_docs()

    await db.batches.insert_many(
        batch_docs
    )

    student_docs, payment_docs = _seed_student_docs(
        batch_docs,
        now_month
    )

    await db.students.insert_many(
        student_docs
    )

    if payment_docs:
        await db.payments.insert_many(
            payment_docs
        )

    return {
        "ok": True,
        "seeded": True,
        "batches": len(batch_docs),
        "students": len(student_docs)
    }


@api_router.get("/")
async def root():
    return {
        "message": "TAPASH SIR API"
    }




# ---------- WhatsApp Cloud API ----------
# Separate routes; existing app APIs and payment logic are left unchanged.
# Public status endpoint exposes only boolean configuration flags, never secrets.
whatsapp_status_router = APIRouter(
    prefix="/api/whatsapp",
    tags=["WhatsApp"],
)
# Sending messages remains protected by the existing app authentication.
whatsapp_router = APIRouter(
    prefix="/api/whatsapp",
    tags=["WhatsApp"],
    dependencies=[Depends(require_auth)],
)
whatsapp_webhook_router = APIRouter(
    prefix="/webhooks/whatsapp",
    tags=["WhatsApp webhook"],
)


class WhatsAppTemplateMessage(BaseModel):
    to: str
    template_name: Optional[str] = None
    language_code: Optional[str] = None
    body_parameters: List[str] = Field(default_factory=list)


def _whatsapp_env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _normalize_whatsapp_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    # Indian student numbers may be stored as 10 digits.
    if len(digits) == 10:
        digits = "91" + digits
    if not 8 <= len(digits) <= 15:
        raise HTTPException(status_code=422, detail="Invalid recipient phone number")
    return digits


def _send_whatsapp_template_internal(
    to: str,
    template_name: str,
    body_parameters: Optional[List[str]] = None,
    language_code: Optional[str] = None,
):
    """Send one Meta-approved WhatsApp template; returns Meta message ID."""
    token = _whatsapp_env("WHATSAPP_ACCESS_TOKEN")
    phone_id = _whatsapp_env("WHATSAPP_PHONE_NUMBER_ID")
    version = _whatsapp_env("WHATSAPP_API_VERSION")
    language = language_code or _whatsapp_env("WHATSAPP_TEMPLATE_LANGUAGE") or "en"
    if not all([token, phone_id, version, template_name]):
        raise RuntimeError("WhatsApp credentials or approved template are missing")
    if not re.fullmatch(r"v\d+\.\d+", version):
        raise RuntimeError("Invalid WHATSAPP_API_VERSION")
    recipient = _normalize_whatsapp_phone(to)
    template_payload = {"name": template_name, "language": {"code": language}}
    if body_parameters:
        template_payload["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(v)} for v in body_parameters],
        }]
    response = requests.post(
        f"https://graph.facebook.com/{version}/{phone_id}/messages",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"messaging_product": "whatsapp", "to": recipient,
              "type": "template", "template": template_payload},
        timeout=20,
    )
    try:
        result = response.json()
    except ValueError:
        result = {}

    # Diagnostic logging only: do not log access tokens or recipient phone numbers.
    error = result.get("error", {}) if isinstance(result, dict) else {}
    if not isinstance(error, dict):
        error = {}
    messages = result.get("messages", []) if isinstance(result, dict) else []
    if not isinstance(messages, list):
        messages = []
    first_message = messages[0] if messages and isinstance(messages[0], dict) else {}
    message_id = first_message.get("id")
    logger.info(
        "WhatsApp Meta send result: http_status=%s template=%s message_id=%s error_code=%s error_subcode=%s error_message=%s",
        response.status_code,
        template_name,
        message_id,
        error.get("code"),
        error.get("error_subcode"),
        error.get("message"),
    )

    if not response.ok:
        raise RuntimeError(f"Meta WhatsApp error ({response.status_code}): {error.get('message', 'send failed')}")
    if not message_id:
        logger.error("WhatsApp Meta returned success without a message ID; template=%s", template_name)
        raise RuntimeError("Meta returned no WhatsApp message ID")
    return message_id


@whatsapp_status_router.get("/status")
async def whatsapp_status():
    return {
        "configured": all([
            _whatsapp_env("WHATSAPP_ACCESS_TOKEN"),
            _whatsapp_env("WHATSAPP_PHONE_NUMBER_ID"),
            _whatsapp_env("WHATSAPP_API_VERSION"),
        ]),
        "template_configured": bool(_whatsapp_env("WHATSAPP_FEE_TEMPLATE_NAME")),
        "payment_template_configured": bool(_whatsapp_env("WHATSAPP_PAYMENT_TEMPLATE_NAME")),
        "automatic_reminders_enabled": bool(_whatsapp_env("WHATSAPP_FEE_TEMPLATE_NAME")),
        "webhook_verify_token_configured": bool(_whatsapp_env("WHATSAPP_VERIFY_TOKEN")),
        "webhook_app_secret_configured": bool(_whatsapp_env("WHATSAPP_APP_SECRET")),
    }


class WhatsAppFeeReminderRequest(BaseModel):
    month: str
    student_ids: List[str] = Field(default_factory=list)


@whatsapp_router.post("/send-fee-reminders")
async def whatsapp_send_fee_reminders(data: WhatsAppFeeReminderRequest):
    """Send selected students' fee reminders concurrently with a bounded limit."""
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", data.month):
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
    if not data.student_ids:
        raise HTTPException(status_code=422, detail="Select at least one student")
    if len(data.student_ids) > 200:
        raise HTTPException(status_code=422, detail="Maximum 200 students per request")

    template = _whatsapp_env("WHATSAPP_FEE_TEMPLATE_NAME")
    if not template:
        raise HTTPException(status_code=503, detail="WHATSAPP_FEE_TEMPLATE_NAME is not configured")

    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    semaphore = asyncio.Semaphore(8)

    async def process_student(sid):
        async with semaphore:
            try:
                student = await db.students.find_one(
                    {"id": sid},
                    {"_id": 0, "id": 1, "name": 1, "phone": 1,
                     "parent_phone": 1, "monthly_fee": 1, "join_month": 1},
                )
                if not student:
                    return "skipped", {"student_id": sid, "reason": "student_not_found"}

                # Prefer parent number; fall back to student's number only if blank.
                phone = str(student.get("parent_phone") or "").strip() or str(student.get("phone") or "").strip()
                if not phone:
                    return "skipped", {"student_id": sid, "reason": "no_parent_or_student_phone"}

                start_month = str(student.get("join_month") or current_month)[:7]
                if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", start_month):
                    start_month = current_month
                if start_month > current_month:
                    return "skipped", {"student_id": sid, "reason": "join_month_in_future"}

                payment_docs = await db.payments.find(
                    {"student_id": sid, "month": {"$gte": start_month, "$lte": current_month}},
                    {"_id": 0, "month": 1, "amount": 1, "fee_snapshot": 1},
                ).to_list(50000)

                paid_by_month = {}
                fee_by_month = {}
                for payment in payment_docs:
                    payment_month = str(payment.get("month") or "")[:7]
                    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", payment_month):
                        continue
                    paid_by_month[payment_month] = paid_by_month.get(payment_month, 0.0) + float(payment.get("amount") or 0)
                    fee_snapshot = float(payment.get("fee_snapshot") or 0)
                    if fee_snapshot > 0:
                        fee_by_month[payment_month] = fee_snapshot

                monthly_fee = float(student.get("monthly_fee") or 0)
                outstanding_months = []
                total_due = 0.0
                for month_key in _month_range(start_month, current_month):
                    fee = fee_by_month.get(month_key, monthly_fee)
                    paid = paid_by_month.get(month_key, 0.0)
                    due = max(0.0, fee - paid)
                    if due > 0:
                        total_due += due
                        outstanding_months.append(_month_label(month_key))

                if total_due <= 0:
                    return "skipped", {"student_id": sid, "reason": "no_outstanding_balance"}

                # Run blocking requests.post off the event loop so concurrent sends can progress.
                message_id = await asyncio.to_thread(
                    _send_whatsapp_template_internal,
                    phone,
                    template,
                    [str(student.get("name") or "Student"), f"{total_due:.2f}", ", ".join(outstanding_months)],
                )
                return "sent", {
                    "student_id": sid,
                    "message_id": message_id,
                    "amount": round(total_due, 2),
                    "months": outstanding_months,
                }
            except Exception as exc:
                logging.getLogger(__name__).exception("Fee reminder failed for student_id=%s", sid)
                return "failed", {"student_id": sid, "error": str(exc)[:250]}

    # De-duplicate IDs and preserve their first-seen order. Do not auto-retry failures:
    # a network timeout can occur after Meta has accepted a message.
    unique_ids = list(dict.fromkeys(data.student_ids))
    results = await asyncio.gather(*(process_student(sid) for sid in unique_ids))
    sent = [item for status, item in results if status == "sent"]
    skipped = [item for status, item in results if status == "skipped"]
    failed = [item for status, item in results if status == "failed"]

    return {
        "success": len(failed) == 0,
        "through_month": current_month,
        "sent": sent,
        "skipped": skipped,
        "failed": failed,
    }

@whatsapp_router.post("/send-template")
async def whatsapp_send_template(data: WhatsAppTemplateMessage):
    token = _whatsapp_env("WHATSAPP_ACCESS_TOKEN")
    phone_id = _whatsapp_env("WHATSAPP_PHONE_NUMBER_ID")
    version = _whatsapp_env("WHATSAPP_API_VERSION")
    template = data.template_name or _whatsapp_env("WHATSAPP_FEE_TEMPLATE_NAME")
    language = data.language_code or _whatsapp_env("WHATSAPP_TEMPLATE_LANGUAGE") or "en"

    if not all([token, phone_id, version, template]):
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials or approved template are missing",
        )
    if not re.fullmatch(r"v\d+\.\d+", version):
        raise HTTPException(status_code=503, detail="Invalid WHATSAPP_API_VERSION")

    payload = {
        "messaging_product": "whatsapp",
        "to": _normalize_whatsapp_phone(data.to),
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": language},
        },
    }
    if data.body_parameters:
        payload["template"]["components"] = [{
            "type": "body",
            "parameters": [
                {"type": "text", "text": str(value)}
                for value in data.body_parameters
            ],
        }]

    try:
        response = requests.post(
            f"https://graph.facebook.com/{version}/{phone_id}/messages",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
    except requests.RequestException:
        logging.getLogger(__name__).exception("WhatsApp API connection failed")
        raise HTTPException(status_code=502, detail="WhatsApp API connection failed")

    try:
        result = response.json()
    except ValueError:
        result = {}

    error = result.get("error", {}) if isinstance(result, dict) else {}
    if not isinstance(error, dict):
        error = {}
    messages = result.get("messages", []) if isinstance(result, dict) else []
    if not isinstance(messages, list):
        messages = []
    first_message = messages[0] if messages and isinstance(messages[0], dict) else {}
    message_id = first_message.get("id")
    logging.getLogger(__name__).info(
        "WhatsApp Meta test-send result: http_status=%s template=%s message_id=%s error_code=%s error_subcode=%s error_message=%s",
        response.status_code,
        template,
        message_id,
        error.get("code"),
        error.get("error_subcode"),
        error.get("message"),
    )

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail={
                "message": error.get("message", "WhatsApp message failed"),
                "meta_code": error.get("code"),
            },
        )

    return {
        "success": bool(message_id),
        "message_id": message_id,
        "status": "accepted_by_meta" if message_id else "meta_response_missing_message_id",
    }


@whatsapp_webhook_router.get("")
async def whatsapp_verify_webhook(
    mode: Optional[str] = Query(None, alias="hub.mode"),
    verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    expected = _whatsapp_env("WHATSAPP_VERIFY_TOKEN")
    if (
        mode == "subscribe"
        and expected
        and verify_token
        and hmac.compare_digest(verify_token, expected)
        and challenge is not None
    ):
        return PlainTextResponse(challenge)
    raise HTTPException(status_code=403, detail="Webhook verification failed")


@whatsapp_webhook_router.post("")
async def whatsapp_receive_webhook(request: Request):
    """Receive WhatsApp Cloud API callbacks and log delivery status safely."""
    logger = logging.getLogger(__name__)
    logger.info("WhatsApp webhook POST received")
    app_secret = _whatsapp_env("WHATSAPP_APP_SECRET")
    if not app_secret:
        logger.error("WhatsApp webhook callback received but WHATSAPP_APP_SECRET is not configured")
        raise HTTPException(status_code=503, detail="WhatsApp app secret is not configured")

    raw = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(signature, expected):
        logger.warning("WhatsApp webhook rejected: missing or invalid signature")
        raise HTTPException(status_code=401, detail="Invalid WhatsApp webhook signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("WhatsApp webhook rejected: invalid JSON payload")
        raise HTTPException(status_code=400, detail="Invalid webhook JSON")

    event_count = 0
    for entry in payload.get("entry", []) if isinstance(payload, dict) else []:
        for change in entry.get("changes", []) if isinstance(entry, dict) else []:
            value = change.get("value", {}) if isinstance(change, dict) else {}
            field = change.get("field", "unknown") if isinstance(change, dict) else "unknown"
            for message in value.get("messages", []) if isinstance(value, dict) else []:
                event_count += 1
                sender = re.sub(r"\D", "", str(message.get("from", "")))
                logger.info("WhatsApp webhook incoming message: field=%s type=%s sender_suffix=%s message_id=%s", field, message.get("type", "unknown"), sender[-4:] if sender else "unknown", message.get("id", "unknown"))
            for status in value.get("statuses", []) if isinstance(value, dict) else []:
                event_count += 1
                recipient = re.sub(r"\D", "", str(status.get("recipient_id", "")))
                errors = []
                for error in status.get("errors", []) or []:
                    error_data = error.get("error_data", {}) or {}
                    errors.append({"code": error.get("code"), "title": error.get("title"), "message": error.get("message"), "details": error_data.get("details")})
                logger.info("WhatsApp delivery status: status=%s message_id=%s recipient_suffix=%s timestamp=%s errors=%s", status.get("status", "unknown"), status.get("id", "unknown"), recipient[-4:] if recipient else "unknown", status.get("timestamp"), json.dumps(errors, ensure_ascii=False))
    logger.info("Verified WhatsApp webhook processed: event_count=%s", event_count)
    return {"status": "received"}



# ---------- Register routers ----------
app.include_router(public_router)
app.include_router(api_router)
app.include_router(whatsapp_status_router)
app.include_router(whatsapp_router)
app.include_router(whatsapp_webhook_router)


# ---------- Attendance API ----------
# Attendance endpoints:
# GET    /api/attendance
# POST   /api/attendance/bulk
# DELETE /api/attendance/{attendance_id}
#
# Protected by the same authentication
# used by the main application.

app.include_router(
    attendance_router,
    prefix="/api",
    dependencies=[Depends(require_auth)]
)


# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get(
        'CORS_ORIGINS',
        '*'
    ).split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


# ---------- Shutdown ----------
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
