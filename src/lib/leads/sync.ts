"use client";

import { allLeads, updateLead } from "./queue";
import type { LeadPayload, QueuedLead } from "./types";

/** Un lead sin terminar se manda igual después de este tiempo (abandono). */
const ABANDON_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

let running = false;
let timer: number | undefined;

export type SyncStatus = { pending: number; sent: number; errors: number; lastSync?: string; lastError?: string };
const listeners = new Set<(s: SyncStatus) => void>();
let lastStatus: SyncStatus = { pending: 0, sent: 0, errors: 0 };

export function onSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn);
  fn(lastStatus);
  return () => {
    listeners.delete(fn);
  };
}

function emit(s: SyncStatus) {
  lastStatus = s;
  listeners.forEach((fn) => fn(s));
}

function due(l: QueuedLead, now: number) {
  if (l.status === "sent") return false;
  const age = now - new Date(l.createdAt).getTime();
  if (!l.ready && age < ABANDON_MS) return false;
  // backoff exponencial según intentos
  const wait = Math.min(MAX_BACKOFF_MS, 2 ** Math.max(0, l.attempts - 1) * 15000);
  return l.attempts === 0 || now - new Date(l.updatedAt).getTime() >= wait;
}

function toPayload(l: QueuedLead): LeadPayload {
  const { status: _s, ready: _r, attempts: _a, updatedAt: _u, lastError: _e, ...payload } = l;
  void _s; void _r; void _a; void _u; void _e;
  return payload;
}

/** Envía todo lo pendiente. Seguro de llamar muchas veces: no corre en paralelo. */
export async function syncNow(force = false): Promise<SyncStatus> {
  if (running) return lastStatus;
  running = true;
  let lastError: string | undefined;
  try {
    const now = Date.now();
    const leads = await allLeads();
    for (const l of leads) {
      if (!(force ? l.status !== "sent" : due(l, now))) continue;
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Kiosk-Key": process.env.NEXT_PUBLIC_KIOSK_KEY || "" },
          body: JSON.stringify({ lead: toPayload(l) }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await updateLead(l.id, { status: "sent", lastError: undefined });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await updateLead(l.id, { status: "error", attempts: l.attempts + 1, lastError });
      }
    }
  } finally {
    running = false;
  }
  const after = await allLeads();
  const status: SyncStatus = {
    pending: after.filter((l) => l.status !== "sent").length,
    sent: after.filter((l) => l.status === "sent").length,
    errors: after.filter((l) => l.status === "error").length,
    lastSync: new Date().toISOString(),
    lastError,
  };
  emit(status);
  return status;
}

/** Arranca la sincronización periódica y al recuperar conexión. */
export function startSync() {
  if (typeof window === "undefined" || timer) return;
  const tick = () => void syncNow();
  window.addEventListener("online", tick);
  timer = window.setInterval(tick, 30000);
  window.setTimeout(tick, 2000);
}
