import type { Gesture } from "@/lib/games";
import styles from "./GestureIcon.module.css";

/**
 * Íconos de gestos en estilo "línea": una mano que señala y, en el color de
 * acento, el símbolo del gesto (ondas de toque, flechas de deslizar, arco de
 * lanzamiento). Animados para que se entiendan sin leer.
 */

/** Mano que señala, contorno cerrado (se rellena de blanco). */
const HAND =
  "M38 66V22a7 7 0 0 1 14 0v26a7 7 0 0 1 14 0v8a7 7 0 0 1 14 0v8a6 6 0 0 1 12 0v10c0 14-10 22-24 22H58c-8 0-13-3-18-9L26 73a6 6 0 0 1 9-8Z";
const FINGERS = "M52 48v16M66 56v12M80 64v6";

export default function GestureIcon({ gesture, size = 72 }: { gesture: Gesture; size?: number }) {
  const cls = `${styles.icon} ${styles[gesture.replace("-", "_")]}`;
  return (
    <svg viewBox="0 0 100 108" width={size} height={size * 1.08} className={cls} aria-hidden="true">
      {gesture === "swipe-h" && (
        <g className={styles.accent}>
          <path d="M28 12H8m0 0l7-7M8 12l7 7" />
          <path d="M62 12h20m0 0l-7-7m7 7l-7 7" />
        </g>
      )}
      {(gesture === "tap" || gesture === "tap-fast" || gesture === "tap-area") && (
        <g className={`${styles.accent} ${styles.ripple}`}>
          <path d="M32 20a13 13 0 0 1 26 0" />
          <path d="M24 20a21 21 0 0 1 42 0" />
        </g>
      )}
      {gesture === "tap-area" && <rect className={styles.area} x="58" y="4" width="36" height="26" rx="7" />}
      {gesture === "hold-up" && (
        <g className={styles.accent}>
          <path className={styles.up} d="M78 34V10m0 0l-8 8m8-8l8 8" />
          <path className={styles.speed} d="M14 30h14M10 40h10M16 50h8" />
        </g>
      )}
      {gesture === "drag-release" && (
        <g className={styles.accent}>
          <path className={styles.pull} d="M34 32L14 50m0 0l1-10m-1 10l10-1" />
          <path className={styles.arc} d="M52 16C62 2 80 0 94 14" strokeDasharray="5 6" />
          <path className={styles.arcHead} d="M86 6l8 8-10 4" />
        </g>
      )}
      <g className={styles.hand}>
        <path d={HAND} />
        <path d={FINGERS} className={styles.fingers} />
      </g>
    </svg>
  );
}
