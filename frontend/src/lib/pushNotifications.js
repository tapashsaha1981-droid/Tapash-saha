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

async function getPushPublicKey() {
  const response = await fetch(PUSH_FUNCTION, {
    headers: {
      apikey: SUPABASE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error("Push configuration could not be loaded.");
  }

  const data = await response.json();

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
    throw new Error("Service workers are not supported.");
  }

  if (!("PushManager" in window)) {
    throw new Error("Web Push is not supported on this device.");
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Notifications are blocked. Please allow notifications for EduNotes Pro."
      );
    }
  }

  const registration =
    await navigator.serviceWorker.register("/sw.js");

  await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    const publicKey = await getPushPublicKey();

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          base64ToUint8Array(publicKey),
      });
  }

  const payload = {
    student_id: studentId,
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    board,
    class_id: classId,
    device_id: deviceId,
    updated_at: new Date().toISOString(),
  };

  /*
   * Remove the student's previous device subscription.
   * This follows the working V63 one-device policy.
   */
  const deleteResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?student_id=eq.${encodeURIComponent(
      studentId
    )}`,
    {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!deleteResponse.ok) {
    throw new Error(
      "Could not update the existing push subscription."
    );
  }

  const saveResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!saveResponse.ok) {
    const errorText = await saveResponse.text();
    throw new Error(
      errorText || "Could not save push subscription."
    );
  }

  return subscription;
}
