const SUPABASE_URL = "https://pnpkdhngcqriuntdvyer.supabase.co";
const SUPABASE_KEY = "sb_publishable_mm0-ChNNdlTwXq47Su76aQ_GqNSA0le";

const PUSH_FUNCTION =
  `${SUPABASE_URL}/functions/v1/push-notification`;

function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  const normalized = (base64 + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(normalized);

  return Uint8Array.from(
    [...rawData].map((char) => char.charCodeAt(0))
  );
}

async function callPushFunction(body = null) {
  const response = await fetch(PUSH_FUNCTION, {
    method: body ? "POST" : "GET",

    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },

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

async function getPushPublicKey() {
  const data = await callPushFunction();

  if (!data.publicKey) {
    throw new Error(
      "VAPID public key is not configured."
    );
  }

  return data.publicKey;
}

export async function registerPushNotifications({
  accessToken,
  studentId,
  board = null,
  classId = null,
  deviceId = null,
} = {}) {
  if (!accessToken || !studentId) {
    throw new Error(
      "Student session is not ready."
    );
  }

  if (!("Notification" in window)) {
    throw new Error(
      "Notifications are not supported on this device."
    );
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "Service workers are not supported."
    );
  }

  if (!("PushManager" in window)) {
    throw new Error(
      "Web Push is not supported on this device."
    );
  }

  // Ask for notification permission.
  if (Notification.permission !== "granted") {
    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Notifications are blocked. Please allow notifications for EduNotes Pro."
      );
    }
  }

  // Register service worker.
  const registration =
    await navigator.serviceWorker.register(
      "/sw.js",
      {
        scope: "/",
      }
    );

  await navigator.serviceWorker.ready;

  // Reuse existing subscription if available.
  let subscription =
    await registration.pushManager.getSubscription();

  // Create subscription if none exists.
  if (!subscription) {
    const publicKey =
      await getPushPublicKey();

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,

        applicationServerKey:
          base64ToUint8Array(publicKey),
      });
  }

  const payload = {
    action: "register",

    student_id: studentId,

    endpoint:
      subscription.endpoint,

    subscription:
      subscription.toJSON(),

    board,

    class_id: classId,

    device_id: deviceId,
  };

  /*
   * IMPORTANT:
   *
   * Do NOT write directly to
   * push_subscriptions from the browser.
   *
   * The Supabase Edge Function will handle
   * the database insert using its server-side
   * credentials.
   */

  await callPushFunction(payload);

  return subscription;
}

export async function unregisterPushNotifications({
  accessToken,
  studentId,
} = {}) {
  if (!accessToken || !studentId) {
    throw new Error(
      "Student session is not ready."
    );
  }

  await callPushFunction({
    action: "unregister",
    student_id: studentId,
  });

  try {
    const registration =
      await navigator.serviceWorker.getRegistration(
        "/"
      );

    const subscription =
      await registration
        ?.pushManager
        ?.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch {
    // Local unsubscribe is best effort.
  }
}
