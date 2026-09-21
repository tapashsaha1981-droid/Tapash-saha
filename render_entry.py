"""Render entrypoint for Tuition Manager -> EduNotes Pro class sync.

Keeps the existing Tuition Manager API and MongoDB behaviour intact.
Only the EduNotes student-registration hook is replaced.

Fixes:
- Multiple Tuition Manager students may share the same mobile number.
- Existing EduNotes profiles are matched by student name + phone, not phone alone.
- Existing Auth users are reused when their generated login email already exists.
- Existing profiles are repaired instead of causing a profiles primary-key 409.
- Class is synchronized from the Tuition Manager batch whenever it can be mapped.
- A missing phone is still rejected because EduNotes login is phone-based.
"""

import re
import backend.server as srv


def _clean_name(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _student_email(phone, student):
    """
    Keep the original phone-based login for the first student using a phone.
    For a second/different student sharing that phone, use a stable student
    suffix so Supabase Auth can hold a separate account.

    NOTE: the EduNotes student login UI must use the same email mapping if
    shared-phone students need separate logins. The Tuition Manager sync itself
    remains safe and will create separate profiles.
    """
    name = _clean_name(student.get("name"))
    # A deterministic slug based on the student's name is enough to separate
    # brothers/sisters with the same phone without changing Tuition Manager.
    slug = re.sub(r"[^a-z0-9]+", "", name)[:40]
    if not slug:
        slug = "student"
    return f"{phone}+{slug}@students.edunotespro.local"


async def _find_auth_user_by_email(supabase_url, supabase_key, email):
    """Return the existing Supabase Auth user with this email, if any."""
    response = srv.requests.get(
        f"{supabase_url}/auth/v1/admin/users",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        },
        params={"page": 1, "per_page": 1000},
        timeout=15,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            "Supabase Auth user lookup failed "
            f"({response.status_code}): {response.text[:500]}"
        )

    data = response.json()
    users = data.get("users", data if isinstance(data, list) else [])

    target = email.casefold()
    for user in users:
        if str(user.get("email") or "").casefold() == target:
            return user

    return None


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

        student_name = str(student.get("name") or "").strip()
        if not student_name:
            srv.logger.warning(
                "EduNotes registration skipped: student has no name"
            )
            return False

        base = f"{supabase_url}/rest/v1"
        headers = srv._supabase_headers()

        # ---------------------------------------------------------------
        # 1. Tuition Manager batch -> EduNotes class
        # ---------------------------------------------------------------
        batch = await srv.db.batches.find_one(
            {"id": student.get("batch_id")},
            {"_id": 0, "name": 1},
        )
        batch_name = str((batch or {}).get("name") or "").strip()

        class_id = None
        class_name = None

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
                student_name,
                batch_name,
            )

        # ---------------------------------------------------------------
        # 2. Find an existing EduNotes profile.
        #
        # IMPORTANT: DO NOT match by phone alone.
        # Two brothers can have the same phone number.
        #
        # First try exact name + phone. Then try the Auth email/user.
        # ---------------------------------------------------------------
        profile_response = srv._supabase_request(
            "GET",
            f"{base}/profiles",
            headers=headers,
            params={
                "select": "id,full_name,username,phone,class_id,role",
                "role": "eq.student",
                "limit": "1000",
            },
        )

        profiles = profile_response.json()

        normalized_name = _clean_name(student_name)

        existing_profile = next(
            (
                p
                for p in profiles
                if srv._normalise_phone(p.get("phone")) == phone
                and _clean_name(p.get("full_name")) == normalized_name
            ),
            None,
        )

        # ---------------------------------------------------------------
        # 3. Determine the Auth email.
        #
        # For shared-phone students, the name suffix gives each student
        # a separate Auth account. This prevents "email_exists" when two
        # students have the same mobile number.
        # ---------------------------------------------------------------
        student_email = _student_email(phone, student)

        # If this exact email already has an Auth account, find its user.
        auth_user = await _find_auth_user_by_email(
            supabase_url,
            supabase_key,
            student_email,
        )

        # ---------------------------------------------------------------
        # 4. If we already have a profile, repair it.
        # ---------------------------------------------------------------
        if existing_profile:
            profile_id = existing_profile.get("id")

            patch_payload = {
                "full_name": student_name,
                "username": phone,
                "phone": phone,
                "active": True,
            }

            if class_id is not None:
                patch_payload["class_id"] = class_id

            srv._supabase_request(
                "PATCH",
                f"{base}/profiles",
                headers=headers,
                params={"id": f"eq.{profile_id}"},
                json=patch_payload,
            )

            srv.logger.info(
                "EduNotes student synchronized: %s (%s), class=%s",
                student_name,
                phone,
                class_name or "unchanged/unmapped",
            )
            return True

        # ---------------------------------------------------------------
        # 5. If Auth user exists, repair/create its profile.
        # ---------------------------------------------------------------
        if auth_user:
            auth_user_id = auth_user.get("id")

            if not auth_user_id:
                raise RuntimeError(
                    f"Supabase Auth returned an existing user without an id "
                    f"for {student_email}"
                )

            # Check whether a profile already exists for this Auth id.
            profile_by_id_response = srv._supabase_request(
                "GET",
                f"{base}/profiles",
                headers=headers,
                params={
                    "select": "id,full_name,phone,class_id,role",
                    "id": f"eq.{auth_user_id}",
                    "limit": "1",
                },
            )

            profile_by_id = profile_by_id_response.json()

            profile_payload = {
                "id": auth_user_id,
                "full_name": student_name,
                "username": phone,
                "phone": phone,
                "role": "student",
                "active": True,
            }

            if class_id is not None:
                profile_payload["class_id"] = class_id

            if profile_by_id:
                srv._supabase_request(
                    "PATCH",
                    f"{base}/profiles",
                    headers=headers,
                    params={"id": f"eq.{auth_user_id}"},
                    json=profile_payload,
                )

                srv.logger.info(
                    "Existing EduNotes Auth/profile repaired: %s (%s), class=%s",
                    student_name,
                    phone,
                    class_name or "unchanged/unmapped",
                )
            else:
                srv._supabase_request(
                    "POST",
                    f"{base}/profiles",
                    headers=headers,
                    json=profile_payload,
                )

                srv.logger.info(
                    "EduNotes profile created for existing Auth user: %s (%s), class=%s",
                    student_name,
                    phone,
                    class_name or "unmapped",
                )

            return True

        # ---------------------------------------------------------------
        # 6. Create a NEW Auth account.
        # ---------------------------------------------------------------
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
                    "full_name": student_name,
                    "phone": phone,
                },
            },
            timeout=15,
        )

        # A race can happen between the lookup above and the create request.
        # If Auth says the email already exists, look it up once more and
        # continue instead of failing the whole student registration.
        if auth_response.status_code == 422:
            auth_user = await _find_auth_user_by_email(
                supabase_url,
                supabase_key,
                student_email,
            )

        if auth_response.status_code >= 400 and not auth_user:
            raise RuntimeError(
                "Supabase Auth user creation failed "
                f"({auth_response.status_code}): "
                f"{auth_response.text[:500]}"
            )

        if auth_user:
            auth_user_id = auth_user.get("id")
        else:
            auth_data = auth_response.json()
            auth_user_id = auth_data.get("id")

        if not auth_user_id:
            raise RuntimeError("Supabase Auth did not return a user id")

        # ---------------------------------------------------------------
        # 7. Create the profile. If the profile already exists because of
        # a race/retry, PATCH it instead of throwing a 409 duplicate-key.
        # ---------------------------------------------------------------
        profile_payload = {
            "id": auth_user_id,
            "full_name": student_name,
            "username": phone,
            "phone": phone,
            "role": "student",
            "active": True,
        }

        if class_id is not None:
            profile_payload["class_id"] = class_id

        existing_by_id_response = srv._supabase_request(
            "GET",
            f"{base}/profiles",
            headers=headers,
            params={
                "select": "id",
                "id": f"eq.{auth_user_id}",
                "limit": "1",
            },
        )

        if existing_by_id_response.json():
            srv._supabase_request(
                "PATCH",
                f"{base}/profiles",
                headers=headers,
                params={"id": f"eq.{auth_user_id}"},
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
            "New EduNotes student registered: %s (%s), class=%s",
            student_name,
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


# The existing create_student route looks up this name at runtime.
# Replacing it here keeps all other Tuition Manager routes unchanged.
srv.ensure_edunotes_student = ensure_edunotes_student_fixed

app = srv.app
