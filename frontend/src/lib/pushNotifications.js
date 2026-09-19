async function callPushFunction(body = null, accessToken = null) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(PUSH_FUNCTION, {
    method: body ? "POST" : "GET",
    headers,
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        text ||
        `Push function failed (${response.status}).`
    );
  }

  return data || {};
}
