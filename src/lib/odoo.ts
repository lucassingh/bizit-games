import "server-only";
import type { LeadPayload } from "./leads/types";
import { buildLeadVals, leadMarker, readOdooEnv, type OdooEnv, type OdooMode } from "./odoo-vals";

export { readOdooEnv, buildLeadVals, leadMarker };
export type { OdooEnv, OdooMode };

/**
 * Adaptador Odoo (solo servidor). Crea o actualiza un crm.lead por lead del juego.
 *
 * Variables de entorno (ver .env.example):
 *   ODOO_MODE      mock | jsonrpc | json2   (mock por defecto: no envía, solo registra)
 *   ODOO_URL       https://tuempresa.odoo.com
 *   ODOO_DB        nombre de la base
 *   ODOO_LOGIN     usuario técnico (solo jsonrpc)
 *   ODOO_API_KEY   API key del usuario técnico
 *   ODOO_TEAM_ID   (opcional) equipo de ventas
 *   ODOO_TAG_IDS   (opcional) ids de etiquetas separados por coma, ej. "12,15"
 *   ODOO_FIELD_MAP (opcional) JSON con campos personalizados, ej.
 *                  {"score":"x_studio_puntaje","level":"x_studio_nivel_ia"}
 *
 * Idempotencia: la descripción lleva la marca [bgc:<id>]; antes de crear se busca.
 */

async function rpc(url: string, service: string, method: string, args: unknown[]) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.data?.message || data.error.message || "Odoo error");
  return data.result;
}

async function json2(env: OdooEnv, model: string, method: string, body: unknown) {
  const res = await fetch(`${env.url}/json/2/${model}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${env.apiKey}`,
      "X-Odoo-Database": env.db,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Odoo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let cachedUid: number | undefined;

/** Crea o actualiza el lead en Odoo. Devuelve el id de crm.lead (o 0 en modo mock). */
export async function upsertLead(l: LeadPayload, env = readOdooEnv()): Promise<{ id: number; mode: OdooMode; created: boolean }> {
  const vals = buildLeadVals(l, env);
  const domain = [["description", "ilike", leadMarker(l.id)]];

  if (env.mode === "mock") {
    console.info("[odoo:mock] lead", JSON.stringify({ id: l.id, email: l.email, game: l.game, score: l.score }));
    return { id: 0, mode: "mock", created: true };
  }

  if (env.mode === "json2") {
    const found: number[] = await json2(env, "crm.lead", "search", { domain, limit: 1 });
    if (found.length) {
      await json2(env, "crm.lead", "write", { ids: [found[0]], vals });
      return { id: found[0], mode: "json2", created: false };
    }
    const ids: number[] = await json2(env, "crm.lead", "create", { vals_list: [vals] });
    return { id: ids[0], mode: "json2", created: true };
  }

  // jsonrpc (Odoo 17–19)
  if (!cachedUid) {
    cachedUid = await rpc(env.url, "common", "authenticate", [env.db, env.login, env.apiKey, {}]);
    if (!cachedUid) throw new Error("Odoo: autenticación fallida");
  }
  const kw = (model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) =>
    rpc(env.url, "object", "execute_kw", [env.db, cachedUid, env.apiKey, model, method, args, kwargs]);
  const found: number[] = await kw("crm.lead", "search", [domain], { limit: 1 });
  if (found.length) {
    await kw("crm.lead", "write", [[found[0]], vals]);
    return { id: found[0], mode: "jsonrpc", created: false };
  }
  const id: number = await kw("crm.lead", "create", [vals]);
  return { id, mode: "jsonrpc", created: true };
}
