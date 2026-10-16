"use client";

import { useState } from "react";
import BGen from "../BGen";
import Header, { Steps } from "../Header";
import { FlyerArt } from "../Flyer";
import { DECAGON_PATH } from "@/lib/brand";
import { useSession } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { putLead } from "@/lib/leads/queue";
import { isEmail, OCCUPATIONS, PAINS, type LeadPayload } from "@/lib/leads/types";
import type { KioskConfig } from "@/lib/config";
import { abandon } from "../Experience";
import s from "./screens.module.css";

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "occupation" | "consent", string>>;

/** Registro del lead. Se guarda en el dispositivo antes de jugar (funciona sin red). */
export default function Register({ config }: { config: KioskConfig }) {
  const { go, setPlayer, chooseGame, player } = useSession();
  const [f, setF] = useState({
    firstName: player?.firstName || "",
    lastName: player?.lastName || "",
    email: player?.email || "",
    occupation: player?.occupation || "",
    pain: player?.pain || "",
    consent: !!player,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k as keyof Errors];
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    if (!f.firstName.trim()) er.firstName = "Contanos tu nombre";
    if (!f.lastName.trim()) er.lastName = "Y tu apellido";
    if (!isEmail(f.email)) er.email = "Revisá el email";
    if (!f.occupation) er.occupation = "Elegí una opción";
    if (!f.consent) er.consent = "Necesitamos tu OK para contactarte";
    setErrors(er);
    if (Object.keys(er).length) {
      sfx("ui.error");
      return;
    }
    sfx("ui.confirm");
    setSaving(true);
    const now = new Date().toISOString();
    const lead: LeadPayload = {
      id: player?.id || crypto.randomUUID(),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      occupation: f.occupation,
      pain: f.pain || undefined,
      consentAt: player?.consentAt || now,
      createdAt: player?.createdAt || now,
      device: config.deviceName,
      stand: config.stand,
      campaign: config.campaign,
    };
    try {
      await putLead(lead);
    } catch {
      /* si IndexedDB falla, seguimos: el lead viaja igual al terminar */
    }
    setPlayer(lead);
    setSaving(false);
    if (config.games.length === 1) {
      chooseGame(config.games[0]);
      go("briefing");
    } else go("select");
  }

  return (
    <section className="frame">
      <div className="sheet">
        <div className={s.dots} />
        <Header right={<Steps current={1} />} />

        <div className={s.registerGrid}>
          <div className={s.side}>
            <Stage />
            <h1 className={s.h1}>
              Sumate al <em>desafío</em> de BGen
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: "34ch", fontSize: "calc(14.5 * var(--u))" }}>
              Al terminar te mostramos tu diagnóstico de IA y un especialista de Bizit te puede contactar para un discovery gratuito.
            </p>
          </div>

          <form className={`panel ${s.form}`} onSubmit={submit} noValidate>
            <div className={`${s.formBody} scroll-subtle`}>
              <div className={s.row2}>
                <label className={s.field}>
                  <span className={s.label}>Nombre</span>
                  <input id="firstName" className={s.input} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" aria-invalid={!!errors.firstName} />
                  {errors.firstName && <span className={s.err}>{errors.firstName}</span>}
                </label>
                <label className={s.field}>
                  <span className={s.label}>Apellido</span>
                  <input id="lastName" className={s.input} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="family-name" aria-invalid={!!errors.lastName} />
                  {errors.lastName && <span className={s.err}>{errors.lastName}</span>}
                </label>
              </div>
              <label className={s.field}>
                <span className={s.label}>Email</span>
                <input id="email" className={s.input} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" aria-invalid={!!errors.email} />
                {errors.email && <span className={s.err}>{errors.email}</span>}
              </label>
              <div className={s.field} role="group" aria-label="Ocupación">
                <span className={s.label}>¿A qué te dedicás?</span>
                <div className={s.chips}>
                  {OCCUPATIONS.map((o) => (
                    <button type="button" key={o} className="chip" aria-pressed={f.occupation === o} onClick={() => set("occupation", o)}>
                      {o}
                    </button>
                  ))}
                </div>
                {errors.occupation && <span className={s.err}>{errors.occupation}</span>}
              </div>
              <div className={s.field} role="group" aria-label="Lo que más tiempo te quita">
                <span className={s.label}>
                  ¿Qué te quita más tiempo? <small>(opcional)</small>
                </span>
                <div className={s.chips}>
                  {PAINS.map((o) => (
                    <button type="button" key={o} className="chip" aria-pressed={f.pain === o} onClick={() => set("pain", f.pain === o ? "" : o)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <label className={s.consent}>
                <input id="consent" type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>
                  Acepto que Bizit Global use mis datos para contactarme sobre sus soluciones de IA, según la Ley 25.326 de Protección de Datos Personales. Puedo
                  pedir acceso, rectificación o baja cuando quiera.
                  {errors.consent && (
                    <>
                      <br />
                      <span className={s.err}>{errors.consent}</span>
                    </>
                  )}
                </span>
              </label>
            </div>
            <div className={s.formFoot}>
              <button type="button" className={s.linkBtn} onClick={() => abandon()}>
                Volver
              </button>
              <button className="btn btn-lg" type="submit" disabled={saving}>
                Seguir →
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

/** Lo que flota alrededor de la ventana: centro (% del escenario), alto (% del escenario) y giro. */
const STAGE_ITEMS = [
  { k: "fantasma", x: 9, y: 50, s: 17, r: -10 },
  { k: "excel", x: 92, y: 45, s: 14, r: 12 },
  { k: "mail", x: 12, y: 87, s: 8.5, r: -14 },
  { k: "factura", x: 89, y: 84, s: 17, r: 10 },
  { k: "doc", x: 6, y: 26, s: 5.5, r: -22 },
  { k: "sobre", x: 94, y: 22, s: 4, r: 18 },
  { k: "grafico", x: 99, y: 65, s: 5, r: -12 },
];

/**
 * Escenario del registro: versión calma de la portada. La empresa se ve por una
 * ventana con la forma de BGen, él asoma por el borde de abajo y algunos
 * Problemones flotan alrededor (sin estallido ni rayo: lo importante es el form).
 */
function Stage() {
  return (
    <div className={s.stage}>
      <div className={s.stageArt} aria-hidden="true">
        <svg className={s.portal} viewBox="-4 -4 136 136">
          <defs>
            <clipPath id="reg-portal">
              <path d={DECAGON_PATH} />
            </clipPath>
            <linearGradient id="reg-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#BFE8EE" />
              <stop offset="0.55" stopColor="#EAF7F5" />
              <stop offset="1" stopColor="#FFF4E8" />
            </linearGradient>
            <radialGradient id="reg-haze" cx="0.5" cy="0.55" r="0.6">
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.55" />
            </radialGradient>
          </defs>
          <g clipPath="url(#reg-portal)">
            <rect x="-4" y="-4" width="136" height="136" fill="url(#reg-sky)" />
            <image href="/sprites/home/cover-city.webp" x="-6" y="4" width="140" height="133" preserveAspectRatio="xMidYMax slice" opacity="0.8" />
            <rect x="-4" y="-4" width="136" height="136" fill="url(#reg-haze)" />
          </g>
          <path d={DECAGON_PATH} fill="none" stroke="#E6E1DC" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
        {STAGE_ITEMS.map((it, i) => (
          <span
            key={it.k}
            className={s.stageFly}
            style={{ left: `${it.x}%`, top: `${it.y}%`, "--s": it.s, "--r": `${it.r}deg`, "--fx": `${50 - it.x}cqw`, "--fy": `${60 - it.y}cqh`, "--d": `${0.25 + i * 0.07}s`, "--t": `${3.2 + (i % 3) * 0.5}s` } as React.CSSProperties}
          >
            <span className={s.stageBob}>
              <FlyerArt k={it.k} />
            </span>
          </span>
        ))}
        <div className={s.stageHero}>
          <BGen expr="curioso" size="var(--hero)" followPointer aura />
        </div>
      </div>
      <p className={`bubble ${s.stageSay}`}>¡Hola! Antes de arrancar, contame quién sos.</p>
    </div>
  );
}
