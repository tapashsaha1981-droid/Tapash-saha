"""
Render entrypoint for Tuition Manager -> EduNotes Pro class sync.

Fixes:
1. Tuition Manager students are assigned to the correct EduNotes class.
2. Multiple students may use the same parent/household phone number.
3. Existing students are matched by name + phone + class, NOT phone alone.
4. Each student gets a unique Supabase Auth email.
5. Existing EduNotes profiles with a missing/wrong class are repaired.
6. Existing Auth users are reused when an earlier registration partially failed.
7. The existing Tuition Manager API remains unchanged.
"""

import re
import backend.server as srv


def _clean_name(value):
    """
    Normalize a student name for safe comparison.
    """
    return " ".join(
        str(value or "")
        .strip()
        .lower()
        .split()
    )


def _safe_student_key(student):
    """
    Create a stable identifier for the student's EduNotes Auth email.

    Tuition Manager student IDs are UUIDs in the normal application,
    so using the ID prevents two students with the same phone number
    from receiving the same Auth email.
    """
    student_id = str(student.get("id") or "").strip()

    if student_id:
        return re.sub(
            r"[^a-zA-Z0-9_-]",
            "",
            student_id,
        )[:40]

    name = _clean_name(student.get("name"))

    if name:
        return re.sub(
            r"[^a-zA-Z0-9_-]",
            "",
            name.replace(" ", "_"),
        )[:30]

    return "student"


async def ensure_edunotes_student_fixed(student):
    """
    Create/match EduNotes profile and assign the correct class.

    IMPORTANT:
    Phone number is NOT treated as a unique student identifier.

    Two brothers can therefore have:
        Student A -> 7005661862
        Student B -> 7005661862

    and both can have separate EduNotes profiles.
    """

    try:
        # ---------------------------------------------------------
        # 1. Supabase configuration
        # ---------------------------------------------------------

        supabase_url = (
            srv.os.environ
            .get("SUPABASE_URL", "")
            .rstrip("/")
        )

        supabase_key = (
            srv.os.environ
            .get("SUPABASE_SERVICE_ROLE_KEY", "")
            .strip()
        )

        if not supabase_url or not supabase_key:
            srv.logger.warning(
                "EduNotes registration skipped: "
                "Supabase credentials not configured"
            )
            return False

        # ---------------------------------------------------------
        # 2. Normalize phone
        # ---------------------------------------------------------

        phone = srv._normalise_phone(
            student.get("phone")
        )

        if not phone or len(phone) != 10:
            srv.logger.warning(
                "EduNotes registration skipped: "
                "invalid phone for student %s",
                student.get("name"),
            )
            return False

        base = f"{supabase_url}/rest/v1"

        headers = srv._supabase_headers()

        # ---------------------------------------------------------
        # 3. Find the Tuition Manager batch
        # ---------------------------------------------------------

        batch = await srv.db.batches.find_one(
            {
                "id": student.get("batch_id")
            },
            {
                "_id": 0,
                "name": 1,
            },
        )

        batch_name = str(
            (batch or {}).get("name") or ""
        ).strip()

        # ---------------------------------------------------------
        # 4. Convert batch name to EduNotes class
        #
        # Examples:
        #
        # CLASS 7
        # CLASS 8
        # CLASS 10 MORNING
        # CLASS 10 EVENING
        # CLASS 12 EVENING
        #
        # become:
        #
        # Class 7
        # Class 8
        # Class 10
        # Class 12
        # ---------------------------------------------------------

        class_id = None
        class_name = None

        match = re.search(
            r"\bclass\s*(\d{1,2})\b",
            batch_name,
            re.IGNORECASE,
        )

        if match:
            class_name = (
                f"Class {match.group(1)}"
            )

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
                "EduNotes class mapping skipped for %s: "
                "batch=%r",
                student.get("name"),
                batch_name,
            )

        # ---------------------------------------------------------
        # 5. Get existing EduNotes student profiles
        #
        # IMPORTANT FIX:
        #
        # We DO NOT search only by phone.
        #
        # The old code did:
        #
        #     phone == phone
        #
        # That caused two brothers sharing one number to be
        # treated as the same student.
        #
        # We now also look at:
        #
        #     name
        #     class_id
        # ---------------------------------------------------------

        profile_response = srv._supabase_request(
            "GET",
            f"{base}/profiles",
            headers=headers,
            params={
                "select": (
                    "id,"
                    "phone,"
                    "class_id,"
                    "full_name,"
                    "username"
                ),
                "role": "eq.student",
            },
        )

        profiles = profile_response.json()

        student_name = _clean_name(
            student.get("name")
        )

        existing_profile = None

        # ---------------------------------------------------------
        # 6. First attempt:
        #
        # Exact student name + same phone + same class
        #
        # This is the safest match.
        # ---------------------------------------------------------

        if class_id is not None:

            for profile in profiles:

                profile_phone = (
                    srv._normalise_phone(
                        profile.get("phone")
                    )
                )

                profile_name = _clean_name(
                    profile.get("full_name")
                )

                profile_class_id = (
                    profile.get("class_id")
                )

                if (
                    profile_phone == phone
                    and profile_name == student_name
                    and profile_class_id == class_id
                ):
                    existing_profile = profile
                    break

        # ---------------------------------------------------------
        # 7. Second attempt:
        #
        # Exact name + same phone where class is currently NULL.
        #
        # This repairs the "Class null" problem.
        # ---------------------------------------------------------

        if existing_profile is None:

            for profile in profiles:

                profile_phone = (
                    srv._normalise_phone(
                        profile.get("phone")
                    )
                )

                profile_name = _clean_name(
                    profile.get("full_name")
                )

                profile_class_id = (
                    profile.get("class_id")
                )

                if (
                    profile_phone == phone
                    and profile_name == student_name
                    and profile_class_id is None
                ):
                    existing_profile = profile
                    break

        # ---------------------------------------------------------
        # 8. Existing student found
        #
        # Repair class if necessary.
        # ---------------------------------------------------------

        if existing_profile:

            profile_id = (
                existing_profile.get("id")
            )

            current_class_id = (
                existing_profile.get("class_id")
            )

            if (
                class_id is not None
                and current_class_id != class_id
            ):

                srv._supabase_request(
                    "PATCH",
                    f"{base}/profiles",
                    headers=headers,
                    params={
                        "id": f"eq.{profile_id}"
                    },
                    json={
                        "class_id": class_id
                    },
                )

                srv.logger.info(
                    "EduNotes class synchronized: "
                    "%s -> %s (%s)",
                    student.get("name"),
                    class_name,
                    class_id,
                )

            else:

                srv.logger.info(
                    "EduNotes student already synchronized: "
                    "%s / %s / %s",
                    student.get("name"),
                    phone,
                    class_name or "unmapped",
                )

            return True

        # ---------------------------------------------------------
        # 9. NEW STUDENT
        #
        # IMPORTANT:
        #
        # The Auth email MUST NOT be based only on phone.
        #
        # Old:
        #
        #     7005661862@students.edunotespro.local
        #
        # New:
        #
        #     7005661862.STUDENT_ID@students.edunotespro.local
        #
        # Therefore two students can share one phone.
        # ---------------------------------------------------------

        student_key = _safe_student_key(
            student
        )

        student_email = (
            f"{phone}.{student_key}"
            "@students.edunotespro.local"
        )

        # ---------------------------------------------------------
        # 10. Decide username
        #
        # Phone remains the student's phone/contact number.
        #
        # If the phone is already being used by another EduNotes
        # profile, create a unique internal username.
        # ---------------------------------------------------------

        phone_already_used = False

        for profile in profiles:

            profile_phone = (
                srv._normalise_phone(
                    profile.get("phone")
                )
            )

            if profile_phone == phone:
                phone_already_used = True
                break

        if phone_already_used:
            username = (
                f"{phone}_{student_key}"
            )
        else:
            username = phone

        # ---------------------------------------------------------
        # 11. Create Supabase Auth account
        # ---------------------------------------------------------

        auth_response = srv.requests.post(
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
                        "",
                    ),
                    "phone": phone,
                },
            },
            timeout=15,
        )

        # ---------------------------------------------------------
        # 12. If Auth account already exists
        #
        # This can happen if a previous registration created the
        # Auth account but failed before creating the profile.
        # ---------------------------------------------------------

        auth_user = None

        if auth_response.status_code == 422:

            error_text = (
                auth_response.text or ""
            ).lower()

            if (
                "email_exists" in error_text
                or "already been registered"
                in error_text
                or "already exists"
                in error_text
            ):

                srv.logger.warning(
                    "EduNotes Auth account already exists "
                    "for %s; attempting recovery.",
                    student_email,
                )

                try:

                    users_response = (
                        srv.requests.get(
                            f"{supabase_url}/auth/v1/admin/users",
                            headers={
                                "apikey": supabase_key,
                                "Authorization": (
                                    f"Bearer {supabase_key}"
                                ),
                            },
                            params={
                                "page": "1",
                                "per_page": "1000",
                            },
                            timeout=15,
                        )
                    )

                    if (
                        users_response.status_code
                        < 400
                    ):

                        users_data = (
                            users_response.json()
                        )

                        if isinstance(
                            users_data,
                            dict,
                        ):
                            auth_users = (
                                users_data.get(
                                    "users",
                                    [],
                                )
                            )
                        else:
                            auth_users = (
                                users_data
                            )

                        for user in auth_users:

                            if (
                                str(
                                    user.get("email")
                                    or ""
                                ).lower()
                                == student_email.lower()
                            ):
                                auth_user = user
                                break

                except Exception:
                    srv.logger.exception(
                        "EduNotes Auth account "
                        "recovery failed for %s",
                        student_email,
                    )

            if auth_user is None:

                raise RuntimeError(
                    "Supabase Auth user creation failed "
                    f"({auth_response.status_code}): "
                    f"{auth_response.text[:500]}"
                )

        elif auth_response.status_code >= 400:

            raise RuntimeError(
                "Supabase Auth user creation failed "
                f"({auth_response.status_code}): "
                f"{auth_response.text[:500]}"
            )

        else:

            auth_user = (
                auth_response.json()
            )

        # ---------------------------------------------------------
        # 13. Get Auth user ID
        # ---------------------------------------------------------

        auth_user_id = (
            auth_user.get("id")
            if auth_user
            else None
        )

        if not auth_user_id:

            raise RuntimeError(
                "Supabase Auth did not return "
                "a user id"
            )

        # ---------------------------------------------------------
        # 14. Create EduNotes profile
        # ---------------------------------------------------------

        profile_payload = {
            "id": auth_user_id,

            "full_name": student.get(
                "name",
                "",
            ),

            "username": username,

            "phone": phone,

            "role": "student",

            "active": True,
        }

        # Save the correct class.
        if class_id is not None:

            profile_payload[
                "class_id"
            ] = class_id

        # ---------------------------------------------------------
        # 15. Try to create the profile
        # ---------------------------------------------------------

        profile_create_response = (
            srv._supabase_request(
                "POST",
                f"{base}/profiles",
                headers=headers,
                json=profile_payload,
            )
        )

        # ---------------------------------------------------------
        # 16. Log successful registration
        # ---------------------------------------------------------

        srv.logger.info(
            "New EduNotes student registered: "
            "%s / phone=%s / username=%s / class=%s",
            student.get("name"),
            phone,
            username,
            class_name or "unmapped",
        )

        return True

    except Exception:

        srv.logger.exception(
            "Automatic EduNotes student registration "
            "failed for student=%s",
            student.get("name"),
        )

        return False


# -------------------------------------------------------------
# Replace the existing EduNotes registration hook.
# -------------------------------------------------------------

srv.ensure_edunotes_student = (
    ensure_edunotes_student_fixed
)


# -------------------------------------------------------------
# Keep the existing FastAPI application.
# -------------------------------------------------------------

app = srv.app
