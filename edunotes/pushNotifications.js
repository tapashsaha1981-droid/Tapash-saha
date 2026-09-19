const SUPABASE_URL = "https://pnpkdhngcqriuntdvyer.supabase.co";
const SUPABASE_KEY = "sb_publishable_mm0-ChNNdlTwXq47Su76aQ_GqNSA0le";
const PUSH_FUNCTION = `${SUPABASE_URL}/functions/v1/push-notification`;

function base64ToUint8Array(base64) {
  if (!base64 || typeof base64 !== "string") {
    throw new Error("VAPID public key is missing.");
  }

  const normalized = base64
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const rawData = window.atob(normalized + padding);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

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
    ...(body ? { body: JSON.stringify(body) } : {}),
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
        `Push function failed (${response.status}).`,
    );
  }

  return data || {};
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this device.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  await navigator.serviceWorker.ready;
  return registration;
}

async function getPushPublicKey(accessToken = null) {
  const data = await callPushFunction(null, accessToken);

  if (!data.publicKey) {
    throw new Error("VAPID public key is not configured.");
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
    throw new Error("Student session is not ready.");
  }

  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported on this device.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this device.");
  }

  if (!("PushManager" in window)) {
    throw new Error("Web Push is not supported on this device.");
  }

  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked. Please enable notifications for EduNotes Pro in your device settings.",
    );
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }
  }

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const publicKey = await getPushPublicKey(accessToken);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(publicKey),
    });
  }

  const serialized = subscription.toJSON();

  if (
    !serialized?.endpoint ||
    !serialized?.keys?.p256dh ||
    !serialized?.keys?.auth
  ) {
    throw new Error("The browser returned an incomplete push subscription.");
  }

  await callPushFunction(
    {
      action: "register",
      student_id: studentId,
      endpoint: subscription.endpoint,
      subscription: serialized,
      board,
      class_id: classId,
      device_id: deviceId,
    },
    accessToken,
  );

  return subscription;
}

export async function unregisterPushNotifications({
  accessToken,
  studentId,
} = {}) {
  if (!accessToken || !studentId) {
    throw new Error("Student session is not ready.");
  }

  await callPushFunction(
    { action: "unregister", student_id: studentId },
    accessToken,
  );

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager?.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch {
    // Local cleanup is best effort.
  }
}

export { callPushFunction, PUSH_FUNCTION };
