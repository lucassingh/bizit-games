import type { GameId } from "../games";
import { normalizeArMobile, type LeadPayload } from "./types";

/**
 * Cierre post-feria: una persona es "mismo email + mismo celular". Si jugó más de
 * una vez (en el mismo o en otro dispositivo, en la misma o en otra visita), en la
 * tabla de leads y en el CSV queda una sola fila: la de su puntaje más alto.
 * Función pura, compartida por /players-game y los tests.
 */

/** Clave de persona: email en minúsculas + celular normalizado (vacío en los leads viejos, sin celular). */
export function personKey(l: Pick<LeadPayload, "email" | "phone">) {
  const phone = l.phone ? (normalizeArMobile(l.phone) ?? l.phone.replace(/\D/g, "")) : "";
  return `${l.email.trim().toLowerCase()}|${phone}`;
}

export type RankedRow<T> = T & {
  /** Puesto en el ranking (0 en las partidas que no son la mejor de la persona). */
  rank: number;
  /** Cuántas partidas/registros tiene la persona. */
  plays: number;
  /** true en la fila con el puntaje más alto de la persona. */
  best: boolean;
};

type Rankable = Pick<LeadPayload, "email" | "phone" | "score" | "playedAt" | "createdAt" | "game">;

/**
 * Ordena por puntaje (mayor primero; a igual puntaje, el que llegó antes) y marca la
 * mejor fila de cada persona. Con `bestOnly`, devuelve solo esa fila por persona.
 */
export function rankPlayers<T extends Rankable>(leads: T[], opts: { game?: GameId | "all"; bestOnly?: boolean } = {}): RankedRow<T>[] {
  const all = leads.filter((l) => !opts.game || opts.game === "all" || l.game === opts.game);
  const plays = new Map<string, number>();
  for (const l of all) plays.set(personKey(l), (plays.get(personKey(l)) || 0) + 1);
  const sorted = [...all].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.playedAt || a.createdAt).localeCompare(b.playedAt || b.createdAt));
  const seen = new Set<string>();
  const out: RankedRow<T>[] = [];
  let rank = 0;
  for (const l of sorted) {
    const k = personKey(l);
    const best = !seen.has(k);
    seen.add(k);
    if (opts.bestOnly && !best) continue;
    if (best) rank++;
    out.push({ ...l, rank: best ? rank : 0, plays: plays.get(k) || 1, best });
  }
  return out;
}

/** Cantidad de personas distintas (email + celular). */
export function countPeople(leads: Pick<LeadPayload, "email" | "phone">[]) {
  return new Set(leads.map(personKey)).size;
}
