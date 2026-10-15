import { GAMES, type GameId } from "./games";

/**
 * Modo desarrollo de juegos: arranca directo en un juego, sin registro ni selector,
 * con una barra para comenzar / pausar / reiniciar / saltar de fase.
 *
 * Se activa con NEXT_PUBLIC_DEV_GAME=compania|deploy|central (en .env.development
 * solo aplica a `npm run dev`; "off" o vacío = flujo completo de producción).
 * También se puede forzar por URL con ?dev=compania (útil en una preview de Vercel).
 */
export function devGame(): GameId | null {
  let v = process.env.NEXT_PUBLIC_DEV_GAME ?? "";
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("dev");
    if (q !== null) v = q;
  }
  v = v.trim().toLowerCase();
  return v && v !== "off" && v !== "false" && v in GAMES ? (v as GameId) : null;
}
