from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import requests


attendance_router = APIRouter(
    prefix="/attendance",
    tags=["attendance"]
)


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")


def supabase_request(method, path, **kwargs):
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase configuration is missing"
        )

    headers = kwargs.pop("headers", {})

    headers.update({
        "apikey": SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
    })

    response = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path.lstrip('/')}",
        headers=headers,
        timeout=20,
        **kwargs
    )

    if not response.ok:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Supabase error: {response.text[:500]}"
        )

    if response.text:
        return response.json()

    return None


class AttendanceRecord(BaseModel):
    app_student_id: str
    app_class_id: str
    date: str
    status: str


class AttendanceBulkIn(BaseModel):
    records: List[AttendanceRecord]


@attendance_router.get("")
def list_attendance(
    date: str,
    app_class_id: Optional[str] = None
):
    params = {
        "select": "*",
        "date": f"eq.{date}",
        "order": "created_at.asc",
    }

    if app_class_id:
        params["app_class_id"] = f"eq.{app_class_id}"

    return supabase_request(
        "GET",
        "attendance",
        params=params
    )


@attendance_router.post("/bulk")
def save_attendance(payload: AttendanceBulkIn):

    if not payload.records:
        raise HTTPException(
            status_code=400,
            detail="No attendance records supplied"
        )

    saved_records = []

    for record in payload.records:

        # Check whether attendance already exists
        check_params = {
            "select": "id",
            "app_student_id": f"eq.{record.app_student_id}",
            "app_class_id": f"eq.{record.app_class_id}",
            "date": f"eq.{record.date}",
            "limit": "1",
        }

        existing = supabase_request(
            "GET",
            "attendance",
            params=check_params
        )

        data = {
            "app_student_id": record.app_student_id,
            "app_class_id": record.app_class_id,
            "date": record.date,
            "status": record.status,
        }

        if existing:

            attendance_id = existing[0]["id"]

            updated = supabase_request(
                "PATCH",
                "attendance",
                params={
                    "id": f"eq.{attendance_id}"
                },
                json=data
            )

            saved_records.append({
                "id": attendance_id,
                **data
            })

        else:

            created = supabase_request(
                "POST",
                "attendance",
                headers={
                    "Prefer": "return=representation"
                },
                json=data
            )

            if created:
                saved_records.extend(created)

    return {
        "success": True,
        "count": len(saved_records),
        "records": saved_records
    }


@attendance_router.delete("/{attendance_id}")
def delete_attendance(attendance_id: int):

    supabase_request(
        "DELETE",
        "attendance",
        params={
            "id": f"eq.{attendance_id}"
        }
    )

    return {
        "success": True,
        "id": attendance_id
    }
