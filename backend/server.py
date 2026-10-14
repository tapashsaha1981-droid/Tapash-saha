from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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
             "mode": 1, "order_id": 1, "status": 1, "reservation_token": 1},
        )
        if claim:
            existing_claims.append(claim)

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
        if len(existing_claims) == len(months) and same_owner and len(claim_order_ids) == 1 and None not in claim_order_ids:
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
        # Existing claim but not a proven reusable matching order: fail closed.
        raise HTTPException(409, "A previous Razorpay order still reserves the selected month. Do not pay again; administrator reconciliation is required.")

    reservation_token = str(uuid.uuid4())
    await _reserve_razorpay_months(
        student_id=student["id"], profile_id=profile_id, months=months,
        mode=mode, reservation_token=reservation_token,
        key_id=key_id, key_secret=key_secret,
    )
    try:
        rz = razorpay.Client(auth=(key_id, key_secret))
        order = await run_in_threadpool(
            rz.order.create,
            {"amount": total_paise, "currency": "INR", "receipt": "edu_" + uuid.uuid4().hex[:24],
             "payment_capture": 1,
             "notes": {"edunotes_profile_id": profile_id, "tuition_student_id": student["id"], "months": ",".join(months)}},
        )
        await db.razorpay_student_orders.insert_one({
            "order_id": order["id"], "profile_id": profile_id, "student_id": student["id"],
            "amount_paise": total_paise, "currency": "INR", "breakdown": breakdown,
            "status": "created", "mode": mode, "reservation_token": reservation_token,
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
                    {"$set": {"status": "reconciliation_required", "expires_at": None}},
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


# ---------- Register routers ----------
app.include_router(public_router)
app.include_router(api_router)


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
