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
import { buildRemediationPlan, describeCompte, findingSteps, type AuditReport, type AuditFinding } from "./audit-engine";
import type { ReconcileOutcome } from "./odoo";
import type { Firm } from "@/data/types";
import type { RGB } from "./brand-color";
import { pdfText, asciiSpaces } from "./format";
import {
  ALERT,
  CW,
  FOOT,
  H as A4_H,
  M,
  W,
  drawRunningHeader,
  firmPalette,
  lineHeight,
  paintFooters,
} from "./pdf-kit";

/** Résumé chiffré du lettrage réellement appliqué dans Odoo (facultatif). */
export interface AppliedReconcile {
  outcomes: ReconcileOutcome[];
}

/**
 * Rapport de régularisation, à la mise en page commune (`pdf-kit.ts`) et aux couleurs de la
 * société — elles étaient auparavant écrites en dur, donc identiques pour toutes les sociétés.
 * L'avance verticale suit la conversion point → mm : l'ancien facteur `taille * 0,42` sur-espaçait
 * le texte d'environ un quart et faisait dériver la fin du document sous le pied.
 */
export function buildRemediationReportPdf(
  report: AuditReport,
  firm: Firm,
  period: string,
  applied?: AppliedReconcile,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pal = firmPalette(firm);
  const INK = pal.ink;
  const OLIVE = pal.olive;
  const GREY = pal.muted;
  const RED = ALERT;
  let y = M;

  const txt = (s: string, x: number, opts?: { size?: number; color?: RGB; bold?: boolean; italic?: boolean }) => {
    const size = opts?.size ?? 9;
    doc.setFont("helvetica", opts?.bold ? "bold" : opts?.italic ? "italic" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts?.color ?? INK));
    const lines = doc.splitTextToSize(pdfText(s), CW) as string[];
    const lh = lineHeight(size);
    for (const ln of lines) {
      // Le pied est réservé : sans cette borne, les dernières lignes s'écrivaient par-dessus.
      if (y + lh > A4_H - FOOT) { doc.addPage(); y = drawRunningHeader(doc, firm, pal); }
      doc.text(ln, x, y);
      y += lh;
    }
  };
  const gap = (h = 2) => { y += h; };
  const rule = () => { doc.setDrawColor(...OLIVE).setLineWidth(0.3); doc.line(M, y, W - M, y); y += 3; };

  // En-tête
  txt(firm.name.toUpperCase(), M, { size: 13, bold: true });
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
      block(txt, gap, i + 1, c, GREY);
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

  // Pied de page paginé — identique à celui des autres documents de l'application
  paintFooters(doc, firm, pal);
  return doc;
}

const RANK: Record<AuditFinding["gravite"], number> = { critique: 0, eleve: 1, moyen: 2, info: 3 };

function fmt(n: number): string {
  return asciiSpaces(n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Un bloc détaillé d'anomalie humaine. `grey` vient de la palette de la société (plus de couleur en dur). */
function block(
  txt: (s: string, x: number, o?: { size?: number; color?: RGB; bold?: boolean; italic?: boolean }) => void,
  gap: (h?: number) => void,
  n: number,
  c: AuditFinding,
  grey: RGB,
) {
  txt(`${n}. [${c.gravite.toUpperCase()}] ${c.titre}`, M, { size: 9.5, bold: true });
  txt(`Cycle / assertion : ${c.cycle} · ${c.assertion} (${c.categorie_assertion})`, M + 2, { size: 7.5, color: grey });
  if (c.comptes.length) txt(`Comptes concernés : ${c.comptes.map(describeCompte).join(" ; ")}`, M + 2, { size: 8 });
  txt(`Problème : ${c.detail}`, M + 2, { size: 8 });
  if (c.correction) txt(`Comprendre : ${c.correction.comprendre}`, M + 2, { size: 8, color: grey });
  // Marche à suivre : toujours présente (étapes de la correction, sinon recommandation + action Odoo).
  const steps = findingSteps(c);
  if (steps.length) {
    txt("Comment procéder :", M + 2, { size: 8, bold: true });
    steps.forEach((s, i) => txt(`  ${i + 1}. ${s}`, M + 2, { size: 8 }));
  }
  if (c.correction) {
    const e = c.correction.ecriture;
    if (e) {
      txt(`Écriture de correction (journal ${e.journal}) — ${e.libelle} :`, M + 2, { size: 8, bold: true });
      for (const l of e.lignes) {
        const mont = l.debit ? `Débit ${fmt(l.debit)}` : `Crédit ${fmt(l.credit)}`;
        txt(`  ${l.compte}  —  ${l.libelle}  —  ${mont} DH`, M + 2, { size: 7.5 });
      }
      txt(`  Total : Débit ${fmt(e.totalDebit)} = Crédit ${fmt(e.totalCredit)} DH${e.equilibre ? "" : "  (DÉSÉQUILIBRE)"}`, M + 2, { size: 7.5, bold: true });
      if (e.note) txt(`  Note : ${e.note}`, M + 2, { size: 7, italic: true, color: grey });
    }
  }
  txt(`Base normative : ${c.reference_normative}`, M + 2, { size: 8 });
  txt(`Action Odoo : ${c.action_odoo}`, M + 2, { size: 8 });
  gap(2);
}
