import { describe, expect, it } from "vitest";
import { buildLeadVals, leadMarker, readOdooEnv } from "./odoo-vals";
import { validateLead, type LeadPayload } from "./leads/types";

const lead: LeadPayload = {
  id: "abc12345-0000",
  firstName: "Ana",
  lastName: "Pérez",
  email: "Ana@Empresa.com ",
  occupation: "Finanzas",
  pain: "Cobranzas",
  consentAt: "2026-11-20T15:00:00.000Z",
  createdAt: "2026-11-20T15:00:00.000Z",
  device: "tablet-1",
  stand: "Stand Bizit",
  campaign: "Expo IA 2026",
  game: "deploy",
  score: 6200,
  level: "Evolution",
  hours: 155,
  metricLabel: "Problemas eliminados",
  metricValue: "14/15",
};

describe("buildLeadVals", () => {
  it("arma un crm.lead con descripción y marca de idempotencia", () => {
    const vals = buildLeadVals(lead, { tagIds: [], fieldMap: {} });
    expect(vals.name).toBe("Expo IA 2026 · Ana Pérez");
    expect(vals.email_from).toBe("ana@empresa.com");
    expect(vals.function).toBe("Finanzas");
    expect(String(vals.description)).toContain(leadMarker(lead.id));
    expect(String(vals.description)).toContain("Evolution");
    expect(vals.tag_ids).toBeUndefined();
  });

  it("agrega equipo, etiquetas y campos personalizados", () => {
    const vals = buildLeadVals(lead, { teamId: 3, tagIds: [7, 9], fieldMap: { score: "x_puntaje", level: "x_nivel" } });
    expect(vals.team_id).toBe(3);
    expect(vals.tag_ids).toEqual([[6, 0, [7, 9]]]);
    expect(vals.x_puntaje).toBe(6200);
    expect(vals.x_nivel).toBe("Evolution");
  });

  it("escapa HTML en la descripción", () => {
    const vals = buildLeadVals({ ...lead, occupation: "<script>" }, { tagIds: [], fieldMap: {} });
    expect(String(vals.description)).not.toContain("<script>");
  });
});

describe("readOdooEnv", () => {
  it("usa mock por defecto y tolera JSON inválido", () => {
    const env = readOdooEnv({ ODOO_FIELD_MAP: "{nope", ODOO_TAG_IDS: "1, x, 4" } as unknown as NodeJS.ProcessEnv);
    expect(env.mode).toBe("mock");
    expect(env.fieldMap).toEqual({});
    expect(env.tagIds).toEqual([1, 4]);
  });
});

describe("validateLead", () => {
  it("detecta campos faltantes y email inválido", () => {
    expect(validateLead(lead)).toEqual([]);
    expect(validateLead({ ...lead, email: "ana@", consentAt: "" })).toEqual(["email", "consent"]);
  });
});
