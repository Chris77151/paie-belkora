/**
 * Rapport de régularisation — PDF structuré en DEUX volets :
 *   Volet A — Corrections applicables automatiquement (lettrage), avec le résultat réel dans
 *             Odoo si elles ont été appliquées.
 *   Volet B — Actions nécessitant une intervention humaine : détail complet par anomalie
 *             (cause, comptes PCGE, écriture-type, base normative, action Odoo, contrôle).
 *
 * Conforme à la doctrine du skill `odoo-correction-anomalies` : zéro invention, chaque constat
 * provient de l'audit déterministe ; l'exécution réelle des corrections automatiques est
 * réversible (lettrage) ; les corrections de fond restent documentées pour le comptable.
 */
import { jsPDF } from "jspdf";
import { buildRemediationPlan, type AuditReport, type AuditFinding } from "./audit-engine";
import type { ReconcileOutcome } from "./odoo";
import { asciiSpaces } from "./format";

const A4_W = 210;
const A4_H = 297;
const M = 14;
const INK: [number, number, number] = [40, 46, 40];
const OLIVE: [number, number, number] = [122, 138, 76];
const GREY: [number, number, number] = [110, 110, 110];
const RED: [number, number, number] = [176, 58, 46];

/** Résumé chiffré du lettrage réellement appliqué dans Odoo (facultatif). */
export interface AppliedReconcile {
  outcomes: ReconcileOutcome[];
}

export function buildRemediationReportPdf(
  report: AuditReport,
  firmName: string,
  period: string,
  applied?: AppliedReconcile,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = A4_W;
  let y = M;

  const txt = (s: string, x: number, opts?: { size?: number; color?: [number, number, number]; bold?: boolean; italic?: boolean }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : opts?.italic ? "italic" : "normal");
    doc.setFontSize(opts?.size ?? 9);
    doc.setTextColor(...(opts?.color ?? INK));
    const lines = doc.splitTextToSize(asciiSpaces(s), W - 2 * M) as string[];
    for (const ln of lines) {
      if (y > A4_H - M) { doc.addPage(); y = M; }
      doc.text(ln, x, y);
      y += (opts?.size ?? 9) * 0.42 + 1.4;
    }
  };
  const gap = (h = 2) => { y += h; };
  const rule = () => { doc.setDrawColor(...OLIVE).setLineWidth(0.3); doc.line(M, y, W - M, y); y += 3; };

  // En-tête
  txt(firmName.toUpperCase(), M, { size: 13, bold: true });
  txt(`Dossier de régularisation comptable — ${period}`, M, { size: 10, bold: true, color: OLIVE });
  txt(`Périmètre : ${report.scope} · Indice de fiabilité : ${report.score_fiabilite}/100 · ${report.constats.length} constat(s)`, M, { size: 8, color: GREY });
  gap(1);
  txt(
    "Ce dossier sépare les corrections applicables automatiquement (lettrage réversible dans Odoo) des "
      + "actions nécessitant une intervention humaine (jugement comptable, contrôle de pièce). Aucune écriture "
      + "n'est passée en aveugle ; les corrections de fond sont documentées pour le comptable.",
    M, { size: 7.5, italic: true, color: GREY },
  );
  gap(2);
  rule();

  const { auto, humain } = buildRemediationPlan(report);

  /* ---------------- Volet A — corrections automatiques ---------------- */
  txt("VOLET A — Corrections applicables automatiquement (lettrage)", M, { size: 11, bold: true, color: OLIVE });
  gap(1);

  if (applied) {
    const ok = applied.outcomes.filter((o) => o.ok);
    const ko = applied.outcomes.filter((o) => !o.ok);
    const totalLines = ok.reduce((a, o) => a + o.group.line_ids.length, 0);
    const totalAmount = ok.reduce((a, o) => a + o.group.amount, 0);
    txt(
      `Appliqué dans Odoo : ${ok.length} groupe(s) lettré(s), ${totalLines} ligne(s), volume ${fmt(totalAmount)} DH. `
        + `${ko.length} échec(s).`,
      M, { size: 9, bold: true },
    );
    gap(1);
    for (const o of applied.outcomes) {
      const g = o.group;
      const head = `${o.ok ? "[OK]" : "[ECHEC]"} ${g.partner} · compte ${g.account_code} · ${g.line_ids.length} ligne(s) · ${fmt(g.amount)} DH`;
      txt(head, M + 2, { size: 8.5, color: o.ok ? INK : RED });
      if (!o.ok && o.error) txt(`   motif : ${o.error}`, M + 2, { size: 7.5, color: RED, italic: true });
    }
    gap(1);
    txt("Rappel : le lettrage est réversible dans Odoo (dé-lettrage) ; aucune écriture n'a été supprimée.", M, { size: 7.5, italic: true, color: GREY });
  } else if (auto.length) {
    txt(
      "Anomalie(s) de lettrage détectée(s). Utilisez « Appliquer dans Odoo » (super administrateur) pour "
        + "rapprocher automatiquement les écritures d'un même tiers qui s'apurent exactement, ou exécutez le "
        + "skill odoo-correction-anomalies. Opération mécanique et réversible.",
      M, { size: 9 },
    );
    gap(1);
    for (const c of auto) {
      txt(`• ${c.titre}`, M + 2, { size: 8.5, bold: true });
      txt(`  ${c.detail}`, M + 2, { size: 8, color: GREY });
    }
  } else {
    txt("Aucune correction automatique applicable pour cette période.", M, { size: 9, color: GREY });
  }
  gap(2);
  rule();

  /* ---------------- Volet B — intervention humaine ---------------- */
  txt("VOLET B — Actions nécessitant une intervention humaine", M, { size: 11, bold: true, color: OLIVE });
  txt("Corrections de fond ou nécessitant un jugement comptable — à contrôler pièce à l'appui puis passer par le comptable.", M, { size: 7.5, italic: true, color: GREY });
  gap(2);

  if (!humain.length) {
    txt("Aucune action humaine requise pour cette période.", M, { size: 9, color: GREY });
  } else {
    const ordered = [...humain].sort((a, b) => RANK[a.gravite] - RANK[b.gravite]);
    ordered.forEach((c, i) => {
      block(txt, gap, i + 1, c);
    });
  }

  gap(2);
  rule();
  txt(
    "Exécution : les corrections automatiques (lettrage) sont réversibles dans Odoo. Les actions du volet B "
      + "relèvent du comptable (ou du skill odoo-correction-anomalies : lecture Odoo réelle, écriture de "
      + "régularisation datée et contre-passable, rapport de régularité). Base : PCGE/CGNC, CGI, CNSS/AMO/TFP.",
    M, { size: 7.5, italic: true, color: GREY },
  );

  // Pied de page paginé
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GREY);
    doc.text(`Belkora Paie & RH — dossier de régularisation ${firmName} · ${period}`, M, A4_H - 6);
    doc.text(`${p}/${pages}`, W - M, A4_H - 6, { align: "right" });
  }
  return doc;
}

const RANK: Record<AuditFinding["gravite"], number> = { critique: 0, eleve: 1, moyen: 2, info: 3 };

function fmt(n: number): string {
  return asciiSpaces(n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Un bloc détaillé d'anomalie humaine. */
function block(
  txt: (s: string, x: number, o?: { size?: number; color?: [number, number, number]; bold?: boolean; italic?: boolean }) => void,
  gap: (h?: number) => void,
  n: number,
  c: AuditFinding,
) {
  txt(`${n}. [${c.gravite.toUpperCase()}] ${c.titre}`, M, { size: 9.5, bold: true });
  txt(`Cycle / assertion : ${c.cycle} · ${c.assertion} (${c.categorie_assertion})`, M + 2, { size: 7.5, color: GREY });
  if (c.comptes.length) txt(`Comptes PCGE : ${c.comptes.join(", ")}`, M + 2, { size: 8 });
  txt(`Problème : ${c.detail}`, M + 2, { size: 8 });
  txt(`Correction : ${c.recommandation}`, M + 2, { size: 8 });
  txt(`Base normative : ${c.reference_normative}`, M + 2, { size: 8 });
  txt(`Action Odoo : ${c.action_odoo}`, M + 2, { size: 8 });
  gap(2);
}
