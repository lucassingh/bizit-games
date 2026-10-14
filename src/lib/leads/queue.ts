"use client";

import { createStore, del, entries, get, set } from "idb-keyval";
import type { LeadPayload, QueuedLead } from "./types";

/**
 * Cola de leads en IndexedDB. Todo lead se guarda acá ANTES de jugar, así no se
 * pierde aunque el visitante abandone o no haya red. La sincronización
 * (sync.ts) lo envía a /api/leads cuando puede.
 */
const store = typeof indexedDB !== "undefined" ? createStore("bgc-leads", "queue") : undefined;

export async function putLead(lead: LeadPayload, opts: { ready?: boolean } = {}): Promise<QueuedLead> {
  const prev = store ? await get<QueuedLead>(lead.id, store) : undefined;
  const rec: QueuedLead = {
    ...(prev || {}),
    ...lead,
    status: "pending",
    ready: opts.ready ?? prev?.ready ?? false,
    attempts: prev?.attempts ?? 0,
    updatedAt: new Date().toISOString(),
  };
  if (store) await set(lead.id, rec, store);
  return rec;
}

export async function getLead(id: string) {
  return store ? get<QueuedLead>(id, store) : undefined;
}

export async function updateLead(id: string, patch: Partial<QueuedLead>) {
  if (!store) return;
  const prev = await get<QueuedLead>(id, store);
  if (!prev) return;
  await set(id, { ...prev, ...patch, updatedAt: new Date().toISOString() }, store);
}

export async function allLeads(): Promise<QueuedLead[]> {
  if (!store) return [];
  const all = await entries<string, QueuedLead>(store);
  return all.map(([, v]) => v).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeLead(id: string) {
  if (store) await del(id, store);
}
