/**
 * Datos de marca usados por la UI y los motores de juego.
 * Fuente: docs/08-branding-aplicado.md · assets/brand/bgenai (logo v2).
 */

/** Isotipo BGenAI v2: 7 trazos (decágono, pentágono, 5 hojas) en un viewBox de 128. */
export const MARK_POLYS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [[[81.92, 8.84], [110.92, 29.91], [122.0, 64.0], [110.92, 98.09], [81.92, 119.16], [46.08, 119.16], [17.08, 98.09], [6.0, 64.0], [17.08, 29.91], [46.08, 8.84], [81.92, 8.84]], [[64.0, 51.0], [76.36, 59.98], [71.64, 74.52], [56.36, 74.52], [51.64, 59.98], [64.0, 51.0]], [[64.0, 51.0], [84.05, 36.43], [122.0, 64.0]], [[76.36, 59.98], [96.42, 74.55], [81.92, 119.16]], [[71.64, 74.52], [63.98, 98.09], [17.08, 98.09]], [[56.36, 74.52], [31.57, 74.52], [17.08, 29.91]], [[51.64, 59.98], [43.98, 36.41], [81.92, 8.84]]];

export const MARK_PATHS: readonly string[] = MARK_POLYS.map(
  (p) => "M" + p.map(([x, y]) => `${x},${y}`).join("L"),
);

/** Contorno del decágono (cuerpo de BGen). */
export const DECAGON_PATH = MARK_PATHS[0] + "Z";

/** Isotipo Bizit (viewBox 0 0 120 100), relleno con el degradé naranja→rojo. */
export const BIZIT_MARK_PATH = "M109.8,46.5c-0.5-7.9-3.4-15.3-8-20.5c-5.1-5.8-11.9-8.5-19.8-8c-12.5,0.8-23,12.8-34.1,25.5l-0.1,0.1 c-1.5,1.8-1.8,2.2-3.4,3.9c0,0-0.7,0.7-0.7,0.6C37,41.7,30,36.3,23.4,36.4c-4.1,0.1-7.5,1.8-9.8,5c-2.2,2.9-3.3,7-3.2,11.3 c0.1,4.3,1.5,8.2,3.800,11.1c2.6,3.1,6.2,4.7,10.5,4.6c6-0.1,12.9-7.2,19.6-14.1c0.1-0.1,0.2-0.2,0.2-0.2c0.9,0.8,1.8,1.5,2.6,2.3 C60,67.4,73.3,78.8,84.7,78.4c0.2,0,0.3,0,0.5,0c8.2-0.5,14.9-4.2,19.3-10.6C108.4,62.1,110.3,54.5,109.8,46.5z M102.9,67 c-3.7,5.5-9.5,8.6-16.6,9c-0.1,0-0.2,0-0.4,0c-10,0.4-23.2-11-35.900-21.9c-0.9-0.8-1.8-1.5-2.7-2.3c1.3-1.5,2.7-3,3.9-4.5l0.1-0.1 c10.9-12.5,21.1-24.3,32.3-25c0.2,0,0.5,0,0.7,0c6.4-0.2,12,2.1,16.2,6.8c4.1,4.6,6.7,11.4,7.2,18.6 C108.1,54.9,106.4,61.8,102.9,67z";

export const COLORS = {
  naranja: "#F75D00",
  naranjaLogo: "#FA6B00",
  naranjaCalido: "#EC7203",
  rojoDegrade: "#E80000",
  amberDegrade: "#FE8100",
  violeta: "#662D91",
  rojo: "#C52126",
  carbon: "#212529",
  gris: "#54595F",
  superficie: "#F6F4F2",
  linea: "#E6E1DC",
  cian: "#0AB6BC",
  lima: "#B2F326",
  noche: "#131315",
  negro: "#0A0A0C",
  niebla: "#E6E6F0",
  /** BGen claro: cuerpo blanco con trazos negros; el visor sigue oscuro para que los LEDs se lean. */
  bgenBody: "#FFFFFF",
  bgenStroke: "#212529",
  visor: "#0A0A0C",
} as const;

/** Visor y cara de BGen en coordenadas del isotipo (ver 08 §3). */
export const BGEN_FACE = {
  visor: { x: 28, y: 44, w: 72, h: 36, r: 18 },
  eyes: { left: 52, right: 76, y: 56 },
  mouth: { x: 64, y: 71 },
} as const;
