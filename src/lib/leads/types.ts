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
  if (!p.occupation?.trim()) errors.push("occupation");
  if (!p.consentAt) errors.push("consent");
  return errors;
}

export function isEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}
