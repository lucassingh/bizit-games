import { describe, expect, it } from "vitest";
import { hoursSaved, levelFor, nextCombo, rankOf } from "./scoring";
import { phaseAt, phaseStart } from "./games";

describe("hoursSaved", () => {
  it("convierte el puntaje en horas y nunca baja de 8", () => {
    expect(hoursSaved(6000)).toBe(150);
    expect(hoursSaved(0)).toBe(8);
  });
});

describe("nextCombo", () => {
  it("sube dentro de la ventana y se corta fuera", () => {
    expect(nextCombo(1, 1)).toBe(2);
    expect(nextCombo(4, 0.5)).toBe(4);
    expect(nextCombo(3, 2)).toBe(1);
  });
});

describe("levelFor", () => {
  it("usa umbrales fijos con pocos datos", () => {
    expect(levelFor(1000, [])).toBe("Drive");
    expect(levelFor(3000, [1, 2])).toBe("Foundation");
    expect(levelFor(9000, [])).toBe("Evolution");
  });
  it("usa tercios del día con datos suficientes", () => {
    const day = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    expect(levelFor(150, day)).toBe("Drive");
    expect(levelFor(450, day)).toBe("Foundation");
    expect(levelFor(950, day)).toBe("Evolution");
  });
});

describe("rankOf", () => {
  it("cuenta cuántos superan el puntaje", () => {
    expect(rankOf(500, [100, 600, 900])).toBe(3);
    expect(rankOf(1000, [])).toBe(1);
  });
});

describe("fases", () => {
  it("90 s → 25 / 55 / 80", () => {
    expect(phaseAt(10, 90)).toBe(0);
    expect(phaseAt(30, 90)).toBe(1);
    expect(phaseAt(60, 90)).toBe(2);
    expect(phaseAt(85, 90)).toBe(3);
    expect(Math.round(phaseStart(2, 90))).toBe(55);
  });
});
