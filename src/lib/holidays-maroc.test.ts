import { describe, expect, it } from "vitest";
import { countLeaveDays, fixedHolidaysInRange } from "./holidays-maroc";

describe("holidays-maroc — décompte des congés", () => {
  it("jours fériés fixes dans une plage (Fête du Travail)", () => {
    const h = fixedHolidaysInRange("2026-04-28", "2026-05-05");
    expect(h.map((x) => x.date)).toContain("2026-05-01");
    expect(h.find((x) => x.date === "2026-05-01")?.name).toBe("Fête du Travail");
  });

  it("une semaine ouvrable pleine (lun→ven) = 5 jours décomptés, 0 repos", () => {
    // 2026-06-01 est un lundi ; 2026-06-05 un vendredi.
    const c = countLeaveDays("2026-06-01", "2026-06-05");
    expect(c.calendar).toBe(5);
    expect(c.rest).toBe(0);
    expect(c.holidays).toBe(0);
    expect(c.working).toBe(5);
  });

  it("dimanche écarté par défaut (repos hebdomadaire)", () => {
    // 2026-06-01 lundi → 2026-06-07 dimanche : 7 calendaires, 1 dimanche.
    const c = countLeaveDays("2026-06-01", "2026-06-07");
    expect(c.calendar).toBe(7);
    expect(c.rest).toBe(1); // le dimanche
    expect(c.working).toBe(6); // samedi compté (jours ouvrables)
  });

  it("option samedi + dimanche : 2 jours de repos écartés", () => {
    const c = countLeaveDays("2026-06-01", "2026-06-07", { restDays: [6, 0] });
    expect(c.rest).toBe(2); // samedi + dimanche
    expect(c.working).toBe(5); // lun→ven
  });

  it("un jour férié dans la plage est écarté et nommé", () => {
    // 2026-05-01 (Fête du Travail) est un vendredi → écarté du décompte.
    const c = countLeaveDays("2026-04-27", "2026-05-01"); // lun→ven, dont le 1er mai
    expect(c.holidays).toBe(1);
    expect(c.working).toBe(4);
    expect(c.holidayList[0].name).toBe("Fête du Travail");
  });

  it("un férié tombant un jour de repos n'est compté qu'une fois (comme repos)", () => {
    // 2026-11-01 est un dimanche ; pas férié. Prenons un férié un dimanche : 2026-02-01 dimanche
    // n'est pas férié non plus. On teste la non-double-comptée avec extraHolidays un dimanche.
    const c = countLeaveDays("2026-06-07", "2026-06-07", { extraHolidays: ["2026-06-07"] }); // dimanche
    expect(c.rest).toBe(1);
    expect(c.holidays).toBe(0); // déjà compté comme repos
    expect(c.working).toBe(0);
  });

  it("fêtes religieuses variables : fournies via extraHolidays (jamais inventées)", () => {
    const c = countLeaveDays("2026-03-20", "2026-03-20", { extraHolidays: ["2026-03-20"] });
    expect(c.holidays).toBe(1);
    expect(c.working).toBe(0);
  });

  it("dates inversées ou vides → décompte nul (jamais NaN)", () => {
    expect(countLeaveDays("2026-06-10", "2026-06-01").working).toBe(0);
    expect(countLeaveDays("", "2026-06-01").calendar).toBe(0);
  });
});
