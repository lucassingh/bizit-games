import type { Gesture } from "@/lib/games";
import styles from "./GestureIcon.module.css";

/**
 * Íconos animados de gestos para que nadie tenga que leer: una mano que
 * desliza, toca, arrastra y suelta. Mismo trazo y color en todo el kit.
 */
const HAND =
  "M30 58V30a5 5 0 0 1 10 0v18m0-6a5 5 0 0 1 10 0v8m0-4a5 5 0 0 1 10 0v6m0-2a5 5 0 0 1 10 0v14c0 12-8 20-20 20h-6c-8 0-12-4-17-10l-9-12a5 5 0 0 1 8-6l4 4";

export default function GestureIcon({ gesture, size = 72 }: { gesture: Gesture; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`${styles.icon} ${styles[gesture.replace("-", "_")]}`} aria-hidden="true">
      {gesture === "swipe-h" && (
        <g className={styles.arrows}>
          <path d="M14 22 L4 22 M10 16 L4 22 L10 28" />
          <path d="M86 22 L96 22 M90 16 L96 22 L90 28" />
        </g>
      )}
      {(gesture === "tap" || gesture === "tap-area" || gesture === "tap-fast") && (
        <g className={styles.ripple}>
          <circle cx="35" cy="22" r="10" />
          <circle cx="35" cy="22" r="18" />
        </g>
      )}
      {gesture === "drag-release" && (
        <g className={styles.sling}>
          <path d="M70 20 L88 8" />
          <circle cx="92" cy="6" r="3" />
          <path d="M8 40 Q 30 18 60 26" strokeDasharray="4 6" />
        </g>
      )}
      {gesture === "tap-area" && <rect className={styles.area} x="60" y="8" width="30" height="24" rx="6" />}
      <g className={styles.hand}>
        <path d={HAND} />
      </g>
    </svg>
  );
}
