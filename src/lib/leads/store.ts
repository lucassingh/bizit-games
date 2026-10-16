import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LeadPayload } from "./types";

/**
 * Almacén de jugadores en el servidor: cada lead que llega a /api/leads se guarda
 * acá además de ir a Odoo, así /players-game puede listar y rankear aunque Odoo
 * esté en modo mock o caído. Idempotente por `id` (el mismo lead puede llegar
 * varias veces: reintentos, re-jugadas).
 *
 * Dos drivers, según el entorno:
 *  - Redis REST (Upstash / Vercel KV) si están KV_REST_API_URL + KV_REST_API_TOKEN
 *    (o UPSTASH_REDIS_REST_URL/TOKEN): persistente en Vercel.
 *  - Archivo JSON (LEADS_FILE, por defecto ./.data/leads.json): para la mini-PC del
 *    stand y para desarrollo. En Vercel sin KV cae a /tmp (se pierde al reiniciar).
 */

export interface StoredLead extends LeadPayload {
  /** Cuándo lo recibió el servidor por última vez. */
  receivedAt: string;
  /** Resultado del último envío a Odoo. */
  odoo?: { id: number; mode: string; at: string } | { error: string; at: string };
}

const KEY = "bgc:leads";

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cmd: unknown[]) {
  const env = redisEnv()!;
  const res = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`KV ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

function filePath() {
  if (process.env.LEADS_FILE) return process.env.LEADS_FILE;
  if (process.env.VERCEL) return "/tmp/bgc-leads.json";
  return path.join(process.cwd(), ".data", "leads.json");
}

let fileLock: Promise<void> = Promise.resolve();
async function withFile<T>(fn: (all: Record<string, StoredLead>) => Promise<T> | T, write: boolean): Promise<T> {
  let out!: T;
  const run = async () => {
    const p = filePath();
    let all: Record<string, StoredLead> = {};
    try {
      all = JSON.parse(await fs.readFile(p, "utf8")) as Record<string, StoredLead>;
    } catch {
      all = {};
    }
    out = await fn(all);
    if (write) {
      await fs.mkdir(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all), "utf8");
      await fs.rename(tmp, p);
    }
  };
  const next = fileLock.then(run, run);
  fileLock = next.catch(() => {});
  await next;
  return out;
}

export function storeDriver(): "kv" | "file" {
  return redisEnv() ? "kv" : "file";
}

export async function saveLead(lead: LeadPayload, odoo?: StoredLead["odoo"]): Promise<StoredLead> {
  const rec: StoredLead = { ...lead, receivedAt: new Date().toISOString(), ...(odoo ? { odoo } : {}) };
  if (redisEnv()) {
    const prev = (await redis(["HGET", KEY, lead.id])) as string | null;
    const merged = { ...(prev ? (JSON.parse(prev) as StoredLead) : {}), ...rec };
    await redis(["HSET", KEY, lead.id, JSON.stringify(merged)]);
    return merged;
  }
  return withFile((all) => {
    all[lead.id] = { ...(all[lead.id] || {}), ...rec };
    return all[lead.id];
  }, true);
}

export async function listLeads(): Promise<StoredLead[]> {
  let rows: StoredLead[];
  if (redisEnv()) {
    const flat = (await redis(["HGETALL", KEY])) as string[] | null;
    rows = [];
    for (let i = 1; i < (flat?.length || 0); i += 2) {
      try {
        rows.push(JSON.parse(flat![i]) as StoredLead);
      } catch {}
    }
  } else {
    rows = await withFile((all) => Object.values(all), false);
  }
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.receivedAt.localeCompare(b.receivedAt));
}
