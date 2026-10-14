import type { LeadPayload } from "./leads/types";

/**
 * Parte pura del adaptador Odoo: lectura de variables de entorno y armado de
 * valores del crm.lead. Separada de odoo.ts para poder testearla.
 */

export type OdooMode = "mock" | "jsonrpc" | "json2";

export interface OdooEnv {
  mode: OdooMode;
  url: string;
  db: string;
  login: string;
  apiKey: string;
  teamId?: number;
  tagIds: number[];
  fieldMap: Record<string, string>;
}

export function readOdooEnv(env: NodeJS.ProcessEnv = process.env): OdooEnv {
  let fieldMap: Record<string, string> = {};
  try {
    fieldMap = env.ODOO_FIELD_MAP ? JSON.parse(env.ODOO_FIELD_MAP) : {};
  } catch {
    fieldMap = {};
  }
  const mode = (env.ODOO_MODE as OdooMode) || "mock";
  return {
    mode: ["mock", "jsonrpc", "json2"].includes(mode) ? mode : "mock",
    url: (env.ODOO_URL || "").replace(/\/$/, ""),
    db: env.ODOO_DB || "",
    login: env.ODOO_LOGIN || "",
    apiKey: env.ODOO_API_KEY || "",
    teamId: env.ODOO_TEAM_ID ? Number(env.ODOO_TEAM_ID) : undefined,
    tagIds: (env.ODOO_TAG_IDS || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    fieldMap,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function leadMarker(id: string) {
  return `[bgc:${id}]`;
}

/** Arma los valores del crm.lead. Función pura (testeada). */
export function buildLeadVals(l: LeadPayload, env: Pick<OdooEnv, "teamId" | "tagIds" | "fieldMap">): Record<string, unknown> {
  const full = `${l.firstName.trim()} ${l.lastName.trim()}`;
  const lines: [string, string | number | undefined][] = [
    ["Campaña", l.campaign],
    ["Stand / dispositivo", `${l.stand} · ${l.device}`],
    ["Ocupación", l.occupation],
    ["Lo que más tiempo le quita", l.pain],
    ["Juego", l.game],
    ["Puntaje", l.score],
    ["Nivel de madurez IA", l.level],
    ["Horas ahorradas/mes (estimación lúdica)", l.hours],
    [l.metricLabel || "Métrica", l.metricValue],
    ["Jugó", l.playedAt],
    ["Consentimiento (Ley 25.326)", l.consentAt],
  ];
  const description =
    lines
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(String(v))}</p>`)
      .join("") + `<p style="color:#888">${leadMarker(l.id)}</p>`;

  const vals: Record<string, unknown> = {
    name: `${l.campaign} · ${full}`,
    type: "lead",
    contact_name: full,
    email_from: l.email.trim().toLowerCase(),
    function: l.occupation,
    description,
  };
  if (env.teamId) vals.team_id = env.teamId;
  if (env.tagIds.length) vals.tag_ids = [[6, 0, env.tagIds]];
  const custom: Record<string, unknown> = {
    score: l.score,
    level: l.level,
    hours: l.hours,
    game: l.game,
    pain: l.pain,
    occupation: l.occupation,
  };
  for (const [key, field] of Object.entries(env.fieldMap)) {
    if (custom[key] !== undefined) vals[field] = custom[key];
  }
  return vals;
}

