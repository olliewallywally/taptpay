/* Transaction push notifications — the same capability probe, web-push
   subscribe/unsubscribe and native-iOS registration the mobile settings page
   performs, packaged so the desktop/tablet settings screen drives the identical
   endpoints instead of a second implementation. */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { isNativeIOS } from "@/lib/native";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

const authHeaders = (json = false) => {
  const token = localStorage.getItem("authToken");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export interface PushNotifications {
  /** The browser/platform can receive push at all. */
  supported: boolean;
  /** The server has keys configured for this platform. */
  available: boolean;
  enabled: boolean;
  loading: boolean;
  toggle: (enable: boolean) => Promise<void>;
}

export function usePushNotifications(): PushNotifications {
  const { toast } = useToast();
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkNativeStatus = useCallback(async () => {
    try {
      const { PushNotifications: Native } = await import("@capacitor/push-notifications");
      const { receive } = await Native.checkPermissions();
      if (receive !== "granted") {
        setEnabled(false);
        return;
      }
      const res = await fetch("/api/push/status", { headers: authHeaders() });
      if (res.ok) {
        const status = await res.json();
        setEnabled(!!status.nativeSubscribed);
        return;
      }
      setEnabled(true);
    } catch {
      setEnabled(false);
    }
  }, []);

  const checkWebStatus = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setEnabled(!!subscription);
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (isNativeIOS()) {
      setSupported(true);
      fetch("/api/push/capabilities")
        .then((r) => r.json())
        .then((caps) => {
          if (cancelled) return;
          setAvailable(!!caps?.nativePush?.available);
          checkNativeStatus();
        })
        .catch(() => !cancelled && setAvailable(false));
    } else {
      const canPush =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(canPush);
      if (!canPush) return;
      fetch("/api/push/capabilities")
        .then((r) => r.json())
        .then((caps) => {
          if (cancelled) return;
          const webReady = !!caps?.webPush?.available;
          setAvailable(webReady);
          if (webReady) checkWebStatus();
        })
        .catch(() => !cancelled && setAvailable(false));
    }
    return () => {
      cancelled = true;
    };
  }, [checkNativeStatus, checkWebStatus]);

  const toggleWeb = useCallback(
    async (enable: boolean) => {
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast({
            title: "Notification permission denied",
            description: "Please enable notifications in your browser settings",
            variant: "destructive",
          });
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const keyRes = await fetch("/api/push/vapid-key");
        if (!keyRes.ok) {
          setAvailable(false);
          throw new Error("VAPID key unavailable — push notifications not configured on server");
        }
        const { publicKey } = await keyRes.json();
        if (!publicKey) throw new Error("Invalid VAPID public key received from server");

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        if (!res.ok) {
          await subscription.unsubscribe();
          throw new Error("Server rejected subscription");
        }
        setEnabled(true);
        toast({ title: "Notifications enabled", description: "You'll receive alerts for transaction updates" });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ endpoint }),
        });
      }
      setEnabled(false);
      toast({ title: "Notifications disabled" });
    },
    [toast],
  );

  const toggleNative = useCallback(
    async (enable: boolean) => {
      const { PushNotifications: Native } = await import("@capacitor/push-notifications");
      if (!enable) {
        const res = await fetch("/api/push/native-unsubscribe", {
          method: "POST",
          headers: authHeaders(true),
        });
        if (!res.ok) throw new Error("Server failed to remove notification subscription");
        setEnabled(false);
        toast({ title: "Notifications disabled" });
        return;
      }

      const perm = await Native.requestPermissions();
      if (perm.receive !== "granted") {
        toast({
          title: "Notification permission denied",
          description: "Please enable in iOS Settings > TaptPay",
          variant: "destructive",
        });
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Registration timed out")), 15000);
        const cleanup = () => {
          clearTimeout(timer);
          regHandle.then((h) => h.remove());
          errHandle.then((h) => h.remove());
        };
        const regHandle = Native.addListener("registration", async (token) => {
          cleanup();
          try {
            const res = await fetch("/api/push/native-subscribe", {
              method: "POST",
              headers: authHeaders(true),
              body: JSON.stringify({ deviceToken: token.value }),
            });
            if (!res.ok) throw new Error("Server rejected device token");
            setEnabled(true);
            toast({ title: "Notifications enabled", description: "You'll receive alerts for transaction updates" });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        const errHandle = Native.addListener("registrationError", async (err) => {
          cleanup();
          reject(new Error(err.error));
        });
        Native.register();
      });
    },
    [toast],
  );

  const toggle = useCallback(
    async (enable: boolean) => {
      setLoading(true);
      try {
        await (isNativeIOS() ? toggleNative(enable) : toggleWeb(enable));
      } catch (error) {
        console.error("Push notification toggle error:", error);
        toast({ title: "Failed to update notification settings", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [toggleNative, toggleWeb, toast],
  );

  return { supported, available, enabled, loading, toggle };
}

export default usePushNotifications;
