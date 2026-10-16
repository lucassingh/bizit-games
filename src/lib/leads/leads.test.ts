import { describe, expect, it } from "vitest";
import { formatArMobile, normalizeArMobile, validateLead } from "./types";
import { countPeople, personKey, rankPlayers } from "./consolidate";

describe("normalizeArMobile", () => {
  it("acepta las formas habituales de escribir un celular argentino", () => {
    for (const v of ["11 2345 6789", "+54 9 11 2345-6789", "5491123456789", "541123456789", "011 15 2345-6789", "11 15 2345 6789", "(011) 2345-6789"])
      expect(normalizeArMobile(v)).toBe("+5491123456789");
    expect(normalizeArMobile("351 234 5678")).toBe("+5493512345678");
    expect(normalizeArMobile("0351 15 234-5678")).toBe("+5493512345678");
    expect(normalizeArMobile("0294 15 412-3456")).toBe("+5492944123456");
  });

  it("rechaza números incompletos, sin código de área o que no son de Argentina", () => {
    for (const v of ["", "1234", "15 2345 6789", "2345 6789", "11 2345 678", "11 2345 67890", "4567 1234 12", "+1 415 555 0123", "11 99 2345 6789"]) expect(normalizeArMobile(v)).toBeNull();
  });

  it("formatea para mostrar y vuelve a normalizar igual", () => {
    expect(formatArMobile("+5491123456789")).toBe("+54 9 11 2345-6789");
    expect(formatArMobile("+5493512345678")).toBe("+54 9 351234-5678");
    expect(normalizeArMobile(formatArMobile("+5493512345678"))).toBe("+5493512345678");
  });
});

describe("validateLead con celular", () => {
  const base = { id: "abc12345-0000", firstName: "Ana", lastName: "Pérez", email: "ana@empresa.com", occupation: "IT", consentAt: "x" };
  it("el celular es opcional en el servidor (leads viejos en cola) pero si viene tiene que ser válido", () => {
    expect(validateLead(base)).toEqual([]);
    expect(validateLead({ ...base, phone: "+5491123456789" })).toEqual([]);
    expect(validateLead({ ...base, phone: "1234" })).toContain("phone");
  });
});

describe("cierre post-feria: mejor puntaje por persona (email + celular)", () => {
  const row = (email: string, phone: string | undefined, score: number | undefined, at: string) => ({ email, phone, score, createdAt: at, playedAt: at, game: "central" as const });
  const leads = [
    row("Ana@Empresa.com", "+5491123456789", 4200, "2026-11-20T10:00:00Z"),
    row("ana@empresa.com ", "11 2345 6789", 9100, "2026-11-20T12:00:00Z"), // misma persona, otra visita
    row("ana@empresa.com", "+5493512345678", 5000, "2026-11-20T11:00:00Z"), // mismo email, otro celular → otra persona
    row("beto@x.com", "+5491187654321", undefined, "2026-11-20T09:00:00Z"), // se registró y no jugó
  ];

  it("la clave junta email (sin mayúsculas ni espacios) y celular normalizado", () => {
    expect(personKey(leads[0])).toBe(personKey(leads[1]));
    expect(personKey(leads[0])).not.toBe(personKey(leads[2]));
    expect(countPeople(leads)).toBe(3);
  });

  it("con bestOnly queda una fila por persona, la de mayor puntaje", () => {
    const r = rankPlayers(leads, { bestOnly: true });
    expect(r.map((x) => [x.rank, x.score, x.plays])).toEqual([
      [1, 9100, 2],
      [2, 5000, 1],
      [3, undefined, 1],
    ]);
  });

  it("sin bestOnly muestra todas, con la repetida sin puesto", () => {
    const r = rankPlayers(leads);
    expect(r).toHaveLength(4);
    expect(r.find((x) => x.score === 4200)).toMatchObject({ best: false, rank: 0, plays: 2 });
  });
});
