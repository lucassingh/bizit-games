import type { GameId } from "../games";
import type { Level } from "../scoring";

export const OCCUPATIONS = ["Dueño/a o CEO", "Gerencia", "Finanzas", "Ventas", "Operaciones", "IT", "RRHH", "Otro"] as const;
export const PAINS = ["Mails", "Cobranzas", "Reportes", "Atención al cliente", "Carga de datos"] as const;

/** Lo que se envía al servidor y termina en un crm.lead de Odoo. */
export interface LeadPayload {
  /** ID generado en el dispositivo; hace idempotente el envío a Odoo. */
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Celular normalizado a E.164 móvil argentino (+549…). Opcional en el tipo: los leads viejos no lo tienen. */
  phone?: string;
  occupation: string;
  pain?: string;
  consentAt: string;
  createdAt: string;
  device: string;
  stand: string;
  campaign: string;
  game?: GameId;
  score?: number;
  level?: Level;
  hours?: number;
  metricLabel?: string;
  metricValue?: string;
  playedAt?: string;
}

/** Registro local en la cola (IndexedDB). */
export interface QueuedLead extends LeadPayload {
  status: "pending" | "sent" | "error";
  /** true cuando terminó el juego o se abandonó la sesión: ya se puede enviar. */
  ready: boolean;
  attempts: number;
  updatedAt: string;
  lastError?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLead(p: Partial<LeadPayload>): string[] {
  const errors: string[] = [];
  if (!p.id || p.id.length < 8) errors.push("id");
  if (!p.firstName?.trim()) errors.push("firstName");
  if (!p.lastName?.trim()) errors.push("lastName");
  if (!p.email || !EMAIL_RE.test(p.email.trim())) errors.push("email");
  // opcional en el servidor: los leads que quedaron en cola antes de pedir el celular no lo traen
  if (p.phone !== undefined && !normalizeArMobile(p.phone)) errors.push("phone");
  if (!p.occupation?.trim()) errors.push("occupation");
  if (!p.consentAt) errors.push("consent");
  return errors;
}

export function isEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}

/**
 * Celular argentino → E.164 móvil (+549 + 10 dígitos: código de área + número).
 * Acepta cómo lo escribe la gente: "+54 9 11 2345-6789", "5491123456789",
 * "011 15 2345-6789", "11 15 2345 6789", "351 234 5678", "0294 15 412-3456".
 * Devuelve null si no es un celular válido (falta el código de área, sobran o faltan dígitos).
 */
export function normalizeArMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  } else if (d.length === 11 && d.startsWith("9")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    // el 15 va después del código de área: 11 (2 dígitos) o de 3 a 4 dígitos en el interior
    const at = (d.startsWith("11") ? [2] : [3, 4]).find((n) => d.slice(n, n + 2) === "15");
    if (at === undefined) return null;
    d = d.slice(0, at) + d.slice(at + 2);
  }
  if (!/^[1-3]\d{9}$/.test(d)) return null;
  // el único código de área que empieza con 1 es el 11 (AMBA)
  if (d.startsWith("1") && !d.startsWith("11")) return null;
  return `+549${d}`;
}

export function isArMobile(v: string) {
  return normalizeArMobile(v) !== null;
}

/** Para mostrar: "+54 9 11 2345-6789" (AMBA) o "+54 9 351234-5678" (sin adivinar el largo del código de área). */
export function formatArMobile(v?: string) {
  const e = v ? normalizeArMobile(v) : null;
  if (!e) return v || "";
  const n = e.slice(4);
  return n.startsWith("11") ? `+54 9 11 ${n.slice(2, 6)}-${n.slice(6)}` : `+54 9 ${n.slice(0, 6)}-${n.slice(6)}`;
}
