"use client";

import { useState } from "react";
import BGen from "../BGen";
import Header, { Steps } from "../Header";
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
            <p className="bubble bubble-left">¡Hola! Antes de arrancar, contame quién sos.</p>
            <BGen expr="curioso" size="min(26vh, 240px)" followPointer />
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
