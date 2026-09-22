from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
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
    batch_id: Optional[str] = None
    monthly_fee: Optional[float] = None
    parent_name: Optional[str] = None
    admission_date: Optional[str] = None
    whatsapp_group_link: Optional[str] = None
    notes: Optional[str] = None


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
    Synchronize the COMPLETE tuition-payment
    history of one Tuition Manager student
    with EduNotes Pro.

    This function never interrupts normal
    Tuition Manager payment operations.
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
                "phone": 1,
                "monthly_fee": 1,
                "join_month": 1,
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
        # Normalize Tuition Manager phone
        # ----------------------------------------------------

        phone = _normalise_phone(
            student.get("phone")
        )

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
        # Find EduNotes student
        #
        # We fetch student profiles and compare the
        # normalized 10-digit Indian mobile number.
        #
        # This handles:
        # 9876543210
        # 919876543210
        # 09876543210
        # ----------------------------------------------------

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


        if not profile_id:

            logger.warning(
                "Supabase payment sync skipped: "
                "no EduNotes profile found for "
                "normalized phone %s",
                phone
            )

            return False


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
        # If old payments exist before join_month,
        # include those months too.
        # ----------------------------------------------------

        if valid_payment_months:

            earliest_payment = min(
                valid_payment_months
            )

            if earliest_payment < start_month:

                start_month = earliest_payment


        # ----------------------------------------------------
        # Create month list
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
        # Synchronize EVERY month
        # ----------------------------------------------------

        for month in months:

            amount_paid = float(
                payments_by_month.get(
                    month,
                    0
                )
            )


            # Use the historical fee snapshot
            # when available.
            #
            # Otherwise use current monthly fee.

            amount_due = float(
                fee_by_month.get(
                    month,
                    default_fee
                )
            )


            # ------------------------------------------------
            # Supabase allowed statuses:
            #
            # paid
            # partial
            # pending
            #
            # DO NOT use "unpaid".
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
            # Check whether month already exists
            # ------------------------------------------------

            existing_response = _supabase_request(
                "GET",
                f"{base}/tuition_fee_records",
                headers=headers,
                params={

                    "select": "id",

                    "profile_id": (
                        f"eq.{quote(profile_id)}"
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
                            f"eq.{quote(record_id)}"
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


        # ----------------------------------------------------
        # Finished
        # ----------------------------------------------------

        logger.info(
            "Supabase tuition history sync successful: "
            "profile=%s months=%s through=%s",
            profile_id,
            len(months),
            current_month,
        )

        return True


    except Exception:

        logger.exception(
            "Supabase payment history sync failed: "
            "student=%s",
            student_id,
        )

        # ----------------------------------------------------
        # IMPORTANT:
        # Never break Tuition Manager because
        # EduNotes/Supabase synchronization failed.
        # ----------------------------------------------------

        return False
# ============================================================
# AUTOMATIC EDUNOTES STUDENT REGISTRATION
# ============================================================

async def ensure_edunotes_student(student):
    """
    Automatically create a new Tuition Manager student
    in EduNotes Pro.

    This is intentionally non-blocking:
    failure here must NEVER prevent the student from
    being created successfully in Tuition Manager.
    """

    try:
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
                "EduNotes registration skipped: "
                "Supabase credentials not configured"
            )
            return False

        phone = _normalise_phone(
            student.get("phone")
        )

        if not phone or len(phone) != 10:
            logger.warning(
                "EduNotes registration skipped: "
                "invalid phone for student %s",
                student.get("name")
            )
            return False

        base = f"{supabase_url}/rest/v1"
        headers = _supabase_headers()

        # ----------------------------------------------------
        # 1. Check whether the student already exists
        # ----------------------------------------------------

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

        existing_profile = None

        for profile in profiles:
            if (
                _normalise_phone(
                    profile.get("phone")
                )
                == phone
            ):
                existing_profile = profile
                break

        # ----------------------------------------------------
        # Existing EduNotes student:
        # do NOT modify the profile.
        # ----------------------------------------------------

        if existing_profile:
            logger.info(
                "EduNotes student already exists: %s",
                phone
            )
            return True

        # ----------------------------------------------------
        # 2. Create Supabase Auth account
        # ----------------------------------------------------

        student_email = (
            f"{phone}@students.edunotespro.local"
        )

        auth_response = requests.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": supabase_key,
                "Authorization": (
                    f"Bearer {supabase_key}"
                ),
                "Content-Type": "application/json",
            },
            json={
                "email": student_email,
                "password": phone,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": student.get(
                        "name",
                        ""
                    ),
                    "phone": phone,
                },
            },
            timeout=15,
        )

        if auth_response.status_code >= 400:
            raise RuntimeError(
                "Supabase Auth user creation failed "
                f"({auth_response.status_code}): "
                f"{auth_response.text[:500]}"
            )

        auth_user = auth_response.json()

        auth_user_id = auth_user.get("id")

        if not auth_user_id:
            raise RuntimeError(
                "Supabase Auth did not return a user id"
            )

        # ----------------------------------------------------
        # 3. Create EduNotes profile
        # ----------------------------------------------------

        profile_payload = {
            "id": auth_user_id,
            "full_name": student.get(
                "name",
                ""
            ),
            "username": phone,
            "phone": phone,
            "role": "student",
            "active": True,
        }

        _supabase_request(
            "POST",
            f"{base}/profiles",
            headers=headers,
            json=profile_payload,
        )

        logger.info(
            "New EduNotes student registered automatically: "
            "%s (%s)",
            student.get("name"),
            phone,
        )

        return True

    except Exception:
        logger.exception(
            "Automatic EduNotes student registration failed "
            "for student=%s",
            student.get("name"),
        )

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

    # --------------------------------------------------------
    # EXISTING TUITION MANAGER BEHAVIOUR
    # --------------------------------------------------------
    # The student is saved to MongoDB FIRST.
    # Nothing related to EduNotes can prevent registration.
    # --------------------------------------------------------

    await db.students.insert_one(
        student.model_dump()
    )

    await log_activity(
        f"Added student: {student.name}"
    )

    # --------------------------------------------------------
    # NEW: AUTOMATIC EDUNOTES REGISTRATION
    # --------------------------------------------------------
    # This is deliberately non-blocking.
    # If Supabase/EduNotes fails, the Tuition Manager
    # student has already been successfully created.
    # --------------------------------------------------------

    try:
        edunotes_created = await ensure_edunotes_student(
            student.model_dump()
        )

        if edunotes_created:
            await sync_payment_for_student(
                student.id
            )

    except Exception:
        logger.exception(
            "EduNotes automatic registration/sync failed "
            "for student=%s",
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

    return await db.students.find_one(
        {"id": student_id},
        {"_id": 0}
    )


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

    return doc


@api_router.delete("/students/{student_id}")
async def delete_student(
    student_id: str
):
    # ---------------------------------------------------------
    # Get the Tuition Manager student BEFORE deletion
    # ---------------------------------------------------------
    st = await db.students.find_one(
        {"id": student_id},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "phone": 1
        }
    )

    if not st:
        raise HTTPException(
            404,
            "Student not found"
        )

    # ---------------------------------------------------------
    # Synchronise deletion with EduNotes Pro
    #
    # IMPORTANT:
    # We identify the EduNotes student by phone number.
    # The phone number is normalised first so that:
    # 9876543210
    # +91 9876543210
    # +919876543210
    # are treated as the same number.
    # ---------------------------------------------------------
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

                # -------------------------------------------------
                # Find the EduNotes student profile by phone
                # -------------------------------------------------
                profile_response = _supabase_request(
                    "GET",
                    f"{base}/profiles",
                    headers=headers,
                    params={
                        "select": "id,phone",
                        "role": "eq.student"
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

                # -------------------------------------------------
                # If matching EduNotes profile exists,
                # delete its tuition records FIRST.
                # -------------------------------------------------
                if profile_id:

                    _supabase_request(
                        "DELETE",
                        f"{base}/tuition_fee_records",
                        headers=headers,
                        params={
                            "profile_id": f"eq.{profile_id}"
                        }
                    )

                    # -------------------------------------------------
                    # Now delete the actual EduNotes student profile.
                    #
                    # THIS is the important part that was missing.
                    # -------------------------------------------------
                    _supabase_request(
                        "DELETE",
                        f"{base}/profiles",
                        headers=headers,
                        params={
                            "id": f"eq.{profile_id}"
                        }
                    )

                    logger.info(
                        "Removed EduNotes profile and tuition history "
                        "for deleted student: %s",
                        st["name"]
                    )

    except Exception:
        # ---------------------------------------------------------
        # Do not stop Tuition Manager deletion if EduNotes cleanup
        # encounters an error. The error is recorded in the logs.
        # ---------------------------------------------------------
        logger.exception(
            "EduNotes cleanup failed for deleted student: %s",
            st["name"]
        )

    # ---------------------------------------------------------
    # Delete Tuition Manager student
    # ---------------------------------------------------------
    await db.students.delete_one(
        {"id": student_id}
    )

    # ---------------------------------------------------------
    # Delete Tuition Manager payments
    # ---------------------------------------------------------
    await db.payments.delete_many(
        {"student_id": student_id}
    )

    # ---------------------------------------------------------
    # Activity log
    # ---------------------------------------------------------
    await log_activity(
        f"Deleted student: {st['name']}"
    )

    return {
        "ok": True
    }

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
