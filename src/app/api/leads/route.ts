import { upsertLead } from "@/lib/odoo";
import { validateLead, type LeadPayload } from "@/lib/leads/types";

/**
 * Recibe los leads de la cola del dispositivo y los crea/actualiza en Odoo.
 * Es idempotente: el mismo lead puede llegar varias veces (reintentos, re-jugadas).
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

  try {
    const r = await upsertLead(lead);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error("[leads] odoo error", err);
    // 502: el dispositivo lo deja en la cola y reintenta con backoff
    return Response.json({ ok: false, error: "odoo_unavailable" }, { status: 502 });
  }
}
