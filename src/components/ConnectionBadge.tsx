"use client";

import { useEffect, useState } from "react";
import { onSyncStatus, type SyncStatus } from "@/lib/leads/sync";

/** Indicador discreto: sin conexión / leads pendientes. Solo aparece si hay algo que avisar. */
export default function ConnectionBadge() {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>({ pending: 0, sent: 0, errors: 0 });

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    addEventListener("online", up);
    addEventListener("offline", up);
    const off = onSyncStatus(setStatus);
    return () => {
      removeEventListener("online", up);
      removeEventListener("offline", up);
      off();
    };
  }, []);

  // en línea no molesta (los pendientes se ven en /config); solo avisa si se cortó la red
  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        left: "max(12px, env(safe-area-inset-left, 0px))",
        bottom: "max(10px, env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        font: "500 calc(12 * var(--u))/1 var(--mono)",
        color: "var(--muted)",
        background: "rgba(255,255,255,.85)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        padding: "6px 10px",
        display: "flex",
        gap: 8,
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 8, background: online ? "var(--cian)" : "#b9b1a8" }} />
      {online ? "En línea" : "Sin conexión"}
      {status.pending > 0 && ` · ${status.pending} por enviar`}
    </div>
  );
}
