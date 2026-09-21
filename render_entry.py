"""Render entrypoint for Tuition Manager -> EduNotes Pro class sync.

This wrapper leaves the existing Tuition Manager API and MongoDB behavior intact.
It patches only the EduNotes student-registration hook before exposing the
existing FastAPI app.
"""

import re
import backend.server as srv


async def ensure_edunotes_student_fixed(student):
    """Create/match EduNotes profile and assign class from Tuition Manager batch."""
    try:
        supabase_url = srv.os.environ.get("SUPABASE_URL", "").rstrip("/")
        supabase_key = srv.os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

        if not supabase_url or not supabase_key:
            srv.logger.warning(
                "EduNotes registration skipped: Supabase credentials not configured"
            )
            return False

        phone = srv._normalise_phone(student.get("phone"))

        if not phone or len(phone) != 10:
            srv.logger.warning(
                "EduNotes registration skipped: invalid phone for student %s",
                student.get("name"),
            )
            return False

        base = f"{supabase_url}/rest/v1"
        headers = srv._supabase_headers()

        # Get the Tuition Manager batch.
        batch = await srv.db.batches.find_one(
            {"id": student.get("batch_id")},
            {"_id": 0, "name": 1},
        )

        batch_name = str((batch or {}).get("name") or "").strip()

        class_id = None
        class_name = None

        # Convert:
        # CLASS 7
        # CLASS 8
        # CLASS 10 MORNING
        # CLASS 12 EVENING
        # into:
        # Class 7
        # Class 8
        # Class 10
        # Class 12
        match = re.search(
            r"\bclass\s*(\d{1,2})\b",
            batch_name,
            re.IGNORECASE,
        )

        if match:
            class_name = f"Class {match.group(1)}"

            class_response = srv._supabase_request(
                "GET",
                f"{base}/classes",
                headers=headers,
                params={
                    "select": "id,name",
                    "name": f"eq.{class_name}",
                    "limit": "1",
                },
            )

            classes = class_response.json()

            if classes:
                class_id = classes[0].get("id")

        if class_id is None:
            srv.logger.warning(
                "EduNotes class mapping skipped for %s: batch=%r",
                student.get("name"),
                batch_name,
            )

        # Find an existing EduNotes student using the normalized phone number.
        profile_response = srv._supabase_request(
            "GET",
            f"{base}/profiles",
            headers=headers,
            params={
                "select": "id,phone,class_id",
                "role": "eq.student",
            },
        )

        profiles = profile_response.json()

        existing_profile = next(
            (
                p
                for p in profiles
                if srv._normalise_phone(p.get("phone")) == phone
            ),
            None,
        )

        # If the student already exists, repair the missing/wrong class.
        if existing_profile:
            profile_id = existing_profile.get("id")

            if (
                class_id is not None
                and existing_profile.get("class_id") != class_id
            ):
                srv._supabase_request(
                    "PATCH",
                    f"{base}/profiles",
                    headers=headers,
                    params={"id": f"eq.{profile_id}"},
                    json={"class_id": class_id},
                )

                srv.logger.info(
                    "EduNotes class synchronized: %s -> %s (%s)",
                    student.get("name"),
                    class_name,
                    class_id,
                )

            return True

        # Create the EduNotes Auth account.
        student_email = f"{phone}@students.edunotespro.local"

        auth_response = srv.requests.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
            },
            json={
                "email": student_email,
                "password": phone,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": student.get("name", ""),
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

        # Create the EduNotes profile.
        profile_payload = {
            "id": auth_user_id,
            "full_name": student.get("name", ""),
            "username": phone,
            "phone": phone,
            "role": "student",
            "active": True,
        }

        # THIS IS THE IMPORTANT FIX:
        # Save the actual EduNotes class_id during creation.
        if class_id is not None:
            profile_payload["class_id"] = class_id

        srv._supabase_request(
            "POST",
            f"{base}/profiles",
            headers=headers,
            json=profile_payload,
        )

        srv.logger.info(
            "New EduNotes student registered: %s (%s), class=%s",
            student.get("name"),
            phone,
            class_name or "unmapped",
        )

        return True

    except Exception:
        srv.logger.exception(
            "Automatic EduNotes student registration failed for student=%s",
            student.get("name"),
        )
        return False


# Replace the existing EduNotes registration hook.
srv.ensure_edunotes_student = ensure_edunotes_student_fixed

# Keep the existing FastAPI application.
app = srv.app
