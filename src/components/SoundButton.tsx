"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/lib/audio";
import s from "./soundbutton.module.css";

/** Botón flotante de sonido on/off, sobre el escenario del juego (estilo del kit: placa biselada). */
export default function SoundButton() {
  const { enabled, toggle } = useAudio();
  return (
    <button
      className={`${s.btn} ${enabled ? "" : s.off}`}
      onClick={toggle}
      data-silent
      aria-pressed={enabled}
      aria-label={enabled ? "Silenciar" : "Activar sonido"}
      title={enabled ? "Sonido activado" : "Sonido silenciado"}
    >
      <span className={s.face}>
        {enabled ? <Volume2 /> : <VolumeX />}
        <i className={s.bars} aria-hidden="true">
          <b />
          <b />
          <b />
        </i>
      </span>
    </button>
  );
}
