import type { GameId } from "./games";

/**
 * Los Problemones: los enemigos del mundo compartido (docs/03 §Problemones), en
 * la versión que ve el jugador antes de jugar. Los sprites son renders del mundo
 * 3D (`/dev/render` → public/sprites/deploy). Cada juego presenta los suyos.
 */
export type FoeKind = "problemon" | "vip" | "trampa" | "jefe";

export interface Foe {
  id: string;
  name: string;
  /** Qué es, en una línea corta (se lee desde la tele). */
  blurb: string;
  kind: FoeKind;
  /** Sprite en public/ (los Problemones) o nada (se dibuja con ícono). */
  sprite?: string;
}

export const FOES: Record<string, Foe> = {
  mail: { id: "mail", name: "Mail Eterno", blurb: "La pila de correos que nunca baja.", kind: "problemon", sprite: "/sprites/deploy/mail.png" },
  fantasma: { id: "fantasma", name: "Lead Fantasma", blurb: "El cliente que nadie llamó a tiempo.", kind: "problemon", sprite: "/sprites/deploy/fantasma.png" },
  excel: { id: "excel", name: "Excel Zombie", blurb: "La planilla que se arma a mano cada mes.", kind: "problemon", sprite: "/sprites/deploy/excel.png" },
  caja: { id: "caja", name: "Caja de Archivo", blurb: "Papeles y datos que nadie encuentra.", kind: "problemon", sprite: "/sprites/deploy/caja.png" },
  factura: { id: "factura", name: "Factura Vencida", blurb: "La cobranza que se pasó de fecha.", kind: "problemon", sprite: "/sprites/deploy/factura.png" },
  botella: { id: "botella", name: "Cuello de Botella", blurb: "El proceso donde todo se traba.", kind: "problemon", sprite: "/sprites/deploy/botella.png" },
  vip: { id: "vip", name: "Documento VIP", blurb: "Lo importante: vale triple.", kind: "vip" },
  delete: { id: "delete", name: "DELETE", blurb: "No se toca: resta puntos.", kind: "trampa" },
  caos: { id: "caos", name: "El Caos Operativo", blurb: "El jefe final. Aparece al terminar.", kind: "jefe" },
};

/** Qué enfrenta cada juego, en el orden en que aparece. */
export const GAME_FOES: Record<GameId, string[]> = {
  compania: ["fantasma", "mail", "excel", "caja", "factura", "botella", "caos"],
  deploy: ["mail", "fantasma", "excel", "factura", "caja", "caos"],
  central: ["mail", "excel", "factura", "fantasma", "caja", "vip", "delete", "caos"],
};

export function foesFor(game: GameId): Foe[] {
  return GAME_FOES[game].map((id) => FOES[id]);
}
