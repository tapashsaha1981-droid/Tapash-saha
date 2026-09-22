"""
Render entrypoint for Tuition Manager -> EduNotes Pro sync.

Tuition Manager remains the master.

This file:
- Keeps existing Tuition Manager batches unchanged.
- Creates/synchronizes EduNotes students.
- Uses Tuition Manager board: CBSE / TBSE.
- Detects Class 5-12 from the existing Tuition Manager batch name.
- Updates EduNotes profiles with board + class_id.
- Matches existing EduNotes students by name + phone.
- Supports students sharing the same phone number.
"""

import re
import backend.server as srv


def _clean_name(value):
    return re.sub(
        r"\s+",
        " ",
        str(value or "").strip()
    ).casefold()


def _student_email(phone, student):
    name = _clean_name(
        student.get("name")
    )

    slug = re.sub(
        r"[^a-z0-9]+",
        "",
        name
    )[:40]

    if not slug:
        slug = "student"

    return (
        f"{phone}+{slug}"
        "@students.edunotespro.local"
    )


async def _find_auth_user_by_email(
    supabase_url,
    supabase_key,
    email
):
    response = srv.requests.get(
        f"{supabase_url}/auth/v1/admin/users",
        headers={
            "apikey": supabase_key,
            "Authorization":
                f"Bearer {supabase_key}",
            "Content-Type":
                "application/json",
        },
        params={
            "page": 1,
            "per_page": 1000,
        },
        timeout=15,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            "Supabase Auth user lookup failed "
            f"({response.status_code}): "
            f"{response.text[:500]}"
        )

    data = response.json()

    users = data.get(
        "users",
        data if isinstance(data, list)
        else []
    )

    target = email.casefold()

    for user in users:
        if (
            str(
                user.get("email") or ""
            ).casefold()
            == target
        ):
            return user

    return None


async def ensure_edunotes_student_fixed(
    student
):
    """
    Synchronize one Tuition Manager student
    into EduNotes Pro.
    """

    try:

        supabase_url = (
            srv.os.environ.get(
                "SUPABASE_URL",
                ""
            )
            .rstrip("/")
        )

        supabase_key = (
            srv.os.environ.get(
                "SUPABASE_SERVICE_ROLE_KEY",
                ""
            )
            .strip()
        )

        if (
            not supabase_url
            or not supabase_key
        ):
            srv.logger.warning(
                "EduNotes sync skipped: "
                "Supabase credentials missing"
            )
            return False

        phone = srv._normalise_phone(
            student.get("phone")
        )

        if not phone or len(phone) != 10:
            srv.logger.warning(
                "EduNotes sync skipped: "
                "invalid phone for %s",
                student.get("name")
            )
            return False

        student_name = str(
            student.get("name") or ""
        ).strip()

        if not student_name:
            srv.logger.warning(
                "EduNotes sync skipped: "
                "student has no name"
            )
            return False

        base = (
            f"{supabase_url}/rest/v1"
        )

        headers = srv._supabase_headers()

        # ============================================================
        # 1. GET TUITION MANAGER BATCH
        # ============================================================

        batch = await srv.db.batches.find_one(
            {
                "id":
                    student.get("batch_id")
            },
            {
                "_id": 0,
                "name": 1,
            },
        )

        batch_name = str(
            (batch or {}).get("name")
            or ""
        ).strip()

        # ============================================================
        # 2. DETERMINE BOARD
        # ============================================================

        board = str(
            student.get("board") or ""
        ).strip().upper()

        # Safety fallback:
        # If board wasn't saved but the batch name
        # itself contains CBSE/TBSE, use it.
        if board not in {
            "CBSE",
            "TBSE",
        }:

            upper_batch = batch_name.upper()

            if "CBSE" in upper_batch:
                board = "CBSE"

            elif "TBSE" in upper_batch:
                board = "TBSE"

            else:
                board = ""

        # ============================================================
        # 3. DETERMINE CLASS NUMBER FROM BATCH
        # ============================================================

        class_number = None

        match = re.search(
            r"\bclass\s*(\d{1,2})\b",
            batch_name,
            re.IGNORECASE,
        )

        if match:
            class_number = match.group(1)

        # ============================================================
        # 4. FIND EDU NOTES CLASS
        #
        # EduNotes currently has:
        # Class 5
        # Class 6
        # Class 7
        # Class 8
        # Class 9
        # Class 10
        # Class 11
        # Class 12
        #
        # We compare the number rather than relying on
        # an exact batch-name match.
        # ============================================================

        class_id = None
        class_name = None

        if class_number:

            class_response = (
                srv._supabase_request(
                    "GET",
                    f"{base}/classes",
                    headers=headers,
                    params={
                        "select":
                            "id,name",
                        "limit":
                            "100",
                    },
                )
            )

            classes = (
                class_response.json()
            )

            for edu_class in classes:

                edu_name = str(
                    edu_class.get(
                        "name"
                    ) or ""
                )

                edu_match = re.search(
                    r"\b(\d{1,2})\b",
                    edu_name,
                )

                if (
                    edu_match
                    and edu_match.group(1)
                    == class_number
                ):
                    class_id = (
                        edu_class.get("id")
                    )

                    class_name = (
                        edu_name
                    )

                    break

        if class_id is None:
            srv.logger.warning(
                "EduNotes class mapping failed "
                "for %s: batch=%r",
                student_name,
                batch_name,
            )

        # ============================================================
        # 5. FIND EXISTING PROFILE
        #
        # IMPORTANT:
        # Do NOT match by phone alone.
        # Brothers/sisters can share a phone.
        # ============================================================

        profile_response = (
            srv._supabase_request(
                "GET",
                f"{base}/profiles",
                headers=headers,
                params={
                    "select":
                        "id,full_name,"
                        "username,phone,"
                        "class_id,board,role",
                    "role":
                        "eq.student",
                    "limit":
                        "1000",
                },
            )
        )

        profiles = (
            profile_response.json()
        )

        normalized_name = (
            _clean_name(student_name)
        )

        existing_profile = next(
            (
                profile
                for profile in profiles
                if (
                    srv._normalise_phone(
                        profile.get("phone")
                    )
                    == phone
                    and
                    _clean_name(
                        profile.get(
                            "full_name"
                        )
                    )
                    == normalized_name
                )
            ),
            None,
        )

        # ============================================================
        # 6. PROFILE UPDATE PAYLOAD
        # ============================================================

        profile_payload = {
            "full_name":
                student_name,
            "username":
                phone,
            "phone":
                phone,
            "active":
                True,
        }

        if board in {
            "CBSE",
            "TBSE",
        }:
            profile_payload[
                "board"
            ] = board

        if class_id is not None:
            profile_payload[
                "class_id"
            ] = class_id

        # ============================================================
        # 7. EXISTING PROFILE
        # ============================================================

        if existing_profile:

            profile_id = (
                existing_profile.get(
                    "id"
                )
            )

            srv._supabase_request(
                "PATCH",
                f"{base}/profiles",
                headers=headers,
                params={
                    "id":
                        f"eq.{profile_id}"
                },
                json=profile_payload,
            )

            srv.logger.info(
                "EduNotes student synchronized: "
                "%s (%s), board=%s, class=%s",
                student_name,
                phone,
                board or "not set",
                class_name or "not set",
            )

            return True

        # ============================================================
        # 8. AUTH EMAIL
        # ============================================================

        student_email = _student_email(
            phone,
            student
        )

        auth_user = (
            await _find_auth_user_by_email(
                supabase_url,
                supabase_key,
                student_email,
            )
        )

        # ============================================================
        # 9. EXISTING AUTH USER
        # ============================================================

        if auth_user:

            auth_user_id = (
                auth_user.get("id")
            )

            if not auth_user_id:
                raise RuntimeError(
                    "Existing Supabase Auth "
                    "user has no id"
                )

            profile_by_id_response = (
                srv._supabase_request(
                    "GET",
                    f"{base}/profiles",
                    headers=headers,
                    params={
                        "select":
                            "id,full_name,"
                            "phone,class_id,"
                            "board,role",
                        "id":
                            f"eq.{auth_user_id}",
                        "limit":
                            "1",
                    },
                )
            )

            profile_by_id = (
                profile_by_id_response.json()
            )

            profile_payload_with_id = {
                "id":
                    auth_user_id,
                **profile_payload,
                "role":
                    "student",
            }

            if profile_by_id:

                srv._supabase_request(
                    "PATCH",
                    f"{base}/profiles",
                    headers=headers,
                    params={
                        "id":
                            f"eq.{auth_user_id}"
                    },
                    json=
                        profile_payload_with_id,
                )

            else:

                srv._supabase_request(
                    "POST",
                    f"{base}/profiles",
                    headers=headers,
                    json=
                        profile_payload_with_id,
                )

            srv.logger.info(
                "Existing EduNotes account "
                "repaired: %s (%s), "
                "board=%s, class=%s",
                student_name,
                phone,
                board or "not set",
                class_name or "not set",
            )

            return True

        # ============================================================
        # 10. CREATE NEW AUTH USER
        # ============================================================

        auth_response = srv.requests.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers={
                "apikey":
                    supabase_key,
                "Authorization":
                    f"Bearer {supabase_key}",
                "Content-Type":
                    "application/json",
            },
            json={
                "email":
                    student_email,
                "password":
                    phone,
                "email_confirm":
                    True,
                "user_metadata": {
                    "full_name":
                        student_name,
                    "phone":
                        phone,
                },
            },
            timeout=15,
        )

        # Race-safe email handling
        if (
            auth_response.status_code
            == 422
        ):

            auth_user = (
                await _find_auth_user_by_email(
                    supabase_url,
                    supabase_key,
                    student_email,
                )
            )

        if (
            auth_response.status_code
            >= 400
            and not auth_user
        ):
            raise RuntimeError(
                "Supabase Auth user "
                "creation failed "
                f"({auth_response.status_code}): "
                f"{auth_response.text[:500]}"
            )

        if auth_user:

            auth_user_id = (
                auth_user.get("id")
            )

        else:

            auth_data = (
                auth_response.json()
            )

            auth_user_id = (
                auth_data.get("id")
            )

        if not auth_user_id:
            raise RuntimeError(
                "Supabase Auth did not "
                "return a user id"
            )

        # ============================================================
        # 11. CREATE / REPAIR PROFILE
        # ============================================================

        profile_payload = {
            "id":
                auth_user_id,
            "full_name":
                student_name,
            "username":
                phone,
            "phone":
                phone,
            "role":
                "student",
            "active":
                True,
        }

        if board in {
            "CBSE",
            "TBSE",
        }:
            profile_payload[
                "board"
            ] = board

        if class_id is not None:
            profile_payload[
                "class_id"
            ] = class_id

        existing_by_id_response = (
            srv._supabase_request(
                "GET",
                f"{base}/profiles",
                headers=headers,
                params={
                    "select":
                        "id",
                    "id":
                        f"eq.{auth_user_id}",
                    "limit":
                        "1",
                },
            )
        )

        if (
            existing_by_id_response.json()
        ):

            srv._supabase_request(
                "PATCH",
                f"{base}/profiles",
                headers=headers,
                params={
                    "id":
                        f"eq.{auth_user_id}"
                },
                json=profile_payload,
            )

        else:

            srv._supabase_request(
                "POST",
                f"{base}/profiles",
                headers=headers,
                json=profile_payload,
            )

        srv.logger.info(
            "New EduNotes student registered: "
            "%s (%s), board=%s, class=%s",
            student_name,
            phone,
            board or "not set",
            class_name or "not set",
        )

        return True

    except Exception:

        srv.logger.exception(
            "Automatic EduNotes student "
            "registration failed for "
            "student=%s",
            student.get("name"),
        )

        return False


# Replace the original synchronization hook.
srv.ensure_edunotes_student = (
    ensure_edunotes_student_fixed
)

app = srv.app
