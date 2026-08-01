import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import type { Firm } from "@/data/types";
import {
  CW,
  FOOT,
  FS,
  H,
  HEAD_RUN,
  M,
  PT2MM,
  W,
  ensure,
  escapeHtml,
  firmLogoPath,
  firmPalette,
  layoutRuns,
  lineHeight,
  parseRuns,
  runsToHtml,
  paintFooters,
  type Cursor,
} from "./pdf-kit";

const firm = {
  id: "f1",
  name: "Miya Belkora Design",
  regime: "SMIG",
  ice: "002711234000059",
  if_fiscal: "45123789",
  address: "Route de l'Ourika, Marrakech",
} as unknown as Firm;

function cursor(y: number): Cursor {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  return { doc, firm, pal: firmPalette(firm), y, page: 1 };
}

describe("grille A4 — cohérence des constantes", () => {
  it("la largeur de composition dérive de la marge (aucune valeur en double)", () => {
    expect(W).toBe(210);
    expect(H).toBe(297);
    expect(CW).toBe(W - 2 * M);
  });

  it("la marge reste au-dessus du seuil de rognage à l'impression (15 mm)", () => {
    expect(M).toBeGreaterThanOrEqual(15);
  });

  it("l'en-tête courant et le pied laissent une zone de texte utile", () => {
    expect(H - FOOT - HEAD_RUN).toBeGreaterThan(200);
  });
});

describe("lineHeight — conversion point → mm", () => {
  it("applique PT2MM et le facteur d'interligne, pas un facteur inventé", () => {
    expect(lineHeight(10)).toBeCloseTo(10 * PT2MM * 1.32, 6);
  });

  it("une ligne de corps mesure environ 4,7 mm — pas 5 ni 8", () => {
    // Contre-exemple historique : `fs * 0,5 * 1,5` donnait 7,5 mm pour un corps de 10 pt,
    // soit ~60 % de trop, d'où la dérive verticale des blocs suivants.
    expect(lineHeight(FS.body)).toBeGreaterThan(4.5);
    expect(lineHeight(FS.body)).toBeLessThan(5);
  });

  it("est strictement croissante avec le corps", () => {
    expect(lineHeight(FS.note)).toBeLessThan(lineHeight(FS.body));
    expect(lineHeight(FS.body)).toBeLessThan(lineHeight(FS.title));
  });
});

describe("échelle typographique", () => {
  it("reste fermée et hiérarchisée (micro < note < body < section < title)", () => {
    expect(FS.micro).toBeLessThan(FS.note);
    expect(FS.note).toBeLessThan(FS.body);
    expect(FS.body).toBeLessThan(FS.section);
    expect(FS.section).toBeLessThan(FS.title);
  });

  it("ne descend jamais sous 6 pt — illisible à l'impression", () => {
    for (const size of Object.values(FS)) expect(size).toBeGreaterThanOrEqual(6);
  });
});

describe("ensure — pagination", () => {
  it("ne pagine pas quand le bloc tient dans la page", () => {
    const c = cursor(50);
    ensure(c, 20);
    expect(c.page).toBe(1);
    expect(c.y).toBe(50);
    expect(c.doc.getNumberOfPages()).toBe(1);
  });

  it("ajoute une page dès que le bloc mordrait sur le pied", () => {
    const c = cursor(H - FOOT - 5);
    ensure(c, 20);
    expect(c.page).toBe(2);
    expect(c.doc.getNumberOfPages()).toBe(2);
  });

  it("repositionne le curseur sous l'en-tête courant après un saut de page", () => {
    const c = cursor(H - FOOT - 5);
    ensure(c, 20);
    expect(c.y).toBe(HEAD_RUN);
  });

  it("aucun contenu ne peut être posé sous H - FOOT", () => {
    const c = cursor(100);
    for (let i = 0; i < 40; i++) {
      ensure(c, 12);
      expect(c.y + 12).toBeLessThanOrEqual(H - FOOT);
      c.y += 12;
    }
  });
});

describe("paintFooters — numérotation a posteriori", () => {
  it("pose un pied sur chaque page, y compris celles ajoutées en cours de rendu", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addPage();
    doc.addPage();
    paintFooters(doc, firm, firmPalette(firm));
    expect(doc.getNumberOfPages()).toBe(3);
  });
});

describe("logo", () => {
  it("retombe sur le logo Miya quand la société n'en définit aucun", () => {
    expect(firmLogoPath(firm)).toBe("/logo-miya.png");
  });

  it("respecte le logo propre à la société", () => {
    expect(firmLogoPath({ ...firm, logo_path: "/logo-abc.png" } as Firm)).toBe("/logo-abc.png");
  });
});

describe("parseRuns — balisage des données clés", () => {
  it("isole un fragment gras", () => {
    expect(parseRuns("du **4 mai 2026** au")).toEqual([
      { t: "du " },
      { t: "4 mai 2026", b: true },
      { t: " au" },
    ]);
  });

  it("isole un fragment italique", () => {
    expect(parseRuns("web *full-stack*")).toEqual([{ t: "web " }, { t: "full-stack", i: true }]);
  });

  it("laisse un astérisque isolé littéral — aucune donnée perdue par le balisage", () => {
    expect(parseRuns("3 * 4 = 12")).toEqual([{ t: "3 * 4 = 12" }]);
  });

  it("rend un texte sans balisage à l'identique", () => {
    const plain = "Attestation délivrée à l'intéressé, à sa demande.";
    expect(parseRuns(plain)).toEqual([{ t: plain }]);
  });

  it("préserve intégralement le texte, balises retirées", () => {
    const src = "**Monsieur X**, employé depuis le **01/03/2019**, en *CDD*.";
    expect(parseRuns(src).map((r) => r.t).join("")).toBe(
      "Monsieur X, employé depuis le 01/03/2019, en CDD.",
    );
  });
});

describe("runsToHtml", () => {
  it("traduit le balisage en HTML sémantique", () => {
    expect(runsToHtml("du **4 mai** au *31*")).toBe("du <strong>4 mai</strong> au <em>31</em>");
  });

  it("échappe le HTML AVANT de baliser (pas d'injection par le contenu)", () => {
    expect(runsToHtml("**<script>**")).toBe("<strong>&lt;script&gt;</strong>");
  });
});

describe("layoutRuns — découpe en lignes", () => {
  const doc = () => new jsPDF({ unit: "mm", format: "a4" });

  it("ne dépasse jamais la largeur de composition", () => {
    const d = doc();
    const long = "La présente attestation est délivrée à l'intéressé, à sa demande, pour servir et faire valoir ce que de droit. ".repeat(4);
    for (const line of layoutRuns(d, parseRuns(long), CW, FS.body)) {
      d.setFontSize(FS.body).setFont("times", "normal");
      const w = line.reduce((a, x) => a + x.w, 0) + (line.length - 1) * d.getTextWidth(" ");
      expect(w).toBeLessThanOrEqual(CW + 0.01);
    }
  });

  it("mesure les mots en gras avec la graisse grasse, pas la normale", () => {
    const d = doc();
    const [plain] = layoutRuns(d, parseRuns("ATTESTATION"), CW, FS.body);
    const [bold] = layoutRuns(d, parseRuns("**ATTESTATION**"), CW, FS.body);
    expect(bold[0].w).toBeGreaterThan(plain[0].w);
  });

  it("soude la ponctuation au fragment gras qui la précède", () => {
    const d = doc();
    const [line] = layoutRuns(d, parseRuns("**OUTERGA**, titulaire"), CW, FS.body);
    // Un seul mot « OUTERGA, » — sinon le PDF afficherait « OUTERGA , ».
    expect(line[0].segs.map((s) => s.t).join("")).toBe("OUTERGA,");
    expect(line[0].segs[0].b).toBe(true);
    expect(line[0].segs[1].b).toBeUndefined();
  });

  it("ne perd aucun mot à la découpe", () => {
    const d = doc();
    const src = "Monsieur **Moustafa OUTERGA**, titulaire de la carte nationale d'identité, a effectué un stage.";
    const words = layoutRuns(d, parseRuns(src), 60, FS.body)
      .flat()
      .map((w) => w.segs.map((s) => s.t).join(""))
      .join(" ");
    expect(words).toBe(src.replace(/\*\*/g, ""));
  });
});

describe("escapeHtml", () => {
  it("neutralise les caractères actifs du HTML", () => {
    expect(escapeHtml('<script>a & b</script>')).toBe("&lt;script&gt;a &amp; b&lt;/script&gt;");
  });

  it("échappe l'esperluette avant les chevrons (pas de double échappement)", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
