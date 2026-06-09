import { api } from "@/api/client";
import { listQueued, syncQueued } from "@/lib/offline";
import { useCallback, useEffect, useState } from "react";

/**
 * Watches connectivity and the offline submission queue. Flushes the queue on app start
 * and whenever the browser comes back online; shows a banner while anything is pending.
 */
export function OfflineIndicator() {
  const [pending, setPending] = useState(() => listQueued().length);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if (listQueued().length === 0) {
      setPending(0);
      return;
    }
    setSyncing(true);
    try {
      const result = await syncQueued(api.submit);
      setPending(result.remaining);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    sync(); // flush anything left over from a previous session
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [sync]);

  if (online && pending === 0) return null;

  return (
    <output className="offline-banner">
      {!online && <span>You're offline.</span>}
      {pending > 0 && (
        <span>
          {pending} {pending === 1 ? "response" : "responses"} saved on this device
          {online ? "" : " — will sync when you're back online"}.
        </span>
      )}
      {online && pending > 0 && (
        <button type="button" className="link-button" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      )}
    </output>
  );
}
