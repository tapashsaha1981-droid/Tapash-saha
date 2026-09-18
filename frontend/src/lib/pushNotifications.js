import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerPushNotifications() {
  try {
    if (!("serviceWorker" in navigator)) {
      console.log("Service workers are not supported.");
      return null;
    }

    if (!("PushManager" in window)) {
      console.log("Push notifications are not supported.");
      return null;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.log("VAPID public key is not configured.");
      return null;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.log("Notification permission was not granted.");
      return null;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");

    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const subscriptionJson = subscription.toJSON();

    const endpoint = subscriptionJson.endpoint;
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      console.log("Invalid push subscription.");
      return null;
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
        },
        {
          onConflict: "endpoint",
        }
      );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return null;
    }

    console.log("Push subscription saved successfully.");

    return subscription;
  } catch (error) {
    console.error("Push notification setup failed:", error);
    return null;
  }
}
