import { upsertLead } from "@/lib/odoo";
import { listLeads, saveLead, storeDriver } from "@/lib/leads/store";
import { validateLead, type LeadPayload } from "@/lib/leads/types";

/**
 * POST: recibe los leads de la cola del dispositivo, los guarda en el almacén del
 * servidor (siempre) y los crea/actualiza en Odoo. Idempotente por id.
 * GET: lista para /players-game (protegido con PLAYERS_KEY si está definida).
 */
export async function POST(request: Request) {
  const expected = process.env.LEADS_KIOSK_KEY;
  if (expected && request.headers.get("x-kiosk-key") !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let lead: LeadPayload;
  try {
    const body = (await request.json()) as { lead?: LeadPayload };
    if (!body.lead) throw new Error("missing lead");
    lead = body.lead;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const errors = validateLead(lead);
  if (errors.length) return Response.json({ ok: false, error: "invalid_lead", fields: errors }, { status: 422 });

  // 1) almacén propio: nunca se pierde un jugador aunque Odoo falle
  try {
    await saveLead(lead);
  } catch (err) {
    console.error("[leads] store error", err);
  }

  // 2) Odoo
  try {
    const r = await upsertLead(lead);
    await saveLead(lead, { id: r.id, mode: r.mode, at: new Date().toISOString() }).catch(() => {});
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error("[leads] odoo error", err);
    await saveLead(lead, { error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }).catch(() => {});
    // 502: el dispositivo lo deja en la cola y reintenta con backoff
    return Response.json({ ok: false, error: "odoo_unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const expected = process.env.PLAYERS_KEY;
  const url = new URL(request.url);
  const given = request.headers.get("x-players-key") || url.searchParams.get("key") || "";
  if (expected && given !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const leads = await listLeads();
    return Response.json({ ok: true, driver: storeDriver(), count: leads.length, leads }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[leads] list error", err);
    return Response.json({ ok: false, error: "store_unavailable" }, { status: 500 });
  }
}
