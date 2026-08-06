/**
 * Export des écritures comptables de paie : XML, Excel (.xlsx), PDF.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Firm } from "@/data/types";
import type { JournalEntry } from "./payroll-accounting";
import type { RGB } from "./brand-color";
import {
  ALERT,
  FONT,
  FS,
  M,
  W,
  afterTable,
  asciiSpaces,
  drawFullHeader,
  drawTitleBox,
  ensure,
  firmPalette,
  paintFooters,
  tableStyles,
  type Cursor,
} from "./pdf-kit";

const n2 = (v: number) => v.toFixed(2);
const nFr = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");

function download(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------ XML ------------------------------ */
export function exportEntriesXml(entries: JournalEntry[], firm: Firm, period: string) {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(`<ecritures-comptables generateur="Belkora Paie" societe="${esc(firm.name)}" ice="${esc(firm.ice ?? "")}" periode="${esc(period)}">`);
  for (const e of entries) {
    lines.push(`  <ecriture journal="${esc(e.journal)}" date="${e.date}" reference="${esc(e.reference)}" equilibree="${e.balanced}">`);
    lines.push(`    <libelle>${esc(e.description)}</libelle>`);
    for (const l of e.lines) {
      lines.push(
        `    <ligne compte="${esc(l.account)}" libelle="${esc(l.label)}" debit="${n2(l.debit)}" credit="${n2(l.credit)}"/>`,
      );
    }
    lines.push(`    <totaux debit="${n2(e.totalDebit)}" credit="${n2(e.totalCredit)}"/>`);
    lines.push("  </ecriture>");
  }
  lines.push("</ecritures-comptables>");
  download(lines.join("\n"), `ecritures_paie_${period}.xml`, "application/xml;charset=utf-8");
}

/* ------------------------------ CSV (Sage / logiciels comptables) ------------------------------ */

/** Date ISO (aaaa-mm-jj) → jj/mm/aaaa (format attendu par Sage / Ciel / EBP). */
function toDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
/** Montant à la française pour l'import (virgule décimale) ; vide si nul (colonne D/C non concernée). */
function frAmount(v: number): string {
  return v ? v.toFixed(2).replace(".", ",") : "";
}
/** Nettoie un champ CSV : pas de séparateur ni de retour ligne (sinon colonnes décalées), pas de
 *  caractère spécial d'espace. Guillemets doublés par sécurité si le champ en contient. */
function csvField(s: string): string {
  const clean = asciiSpaces(s).replace(/[\r\n;]+/g, " ").trim();
  return clean.includes('"') ? clean.replace(/"/g, '""') : clean;
}

/**
 * Construit le CSV d'import des écritures — UNE LIGNE PAR LIGNE D'ÉCRITURE. PUR & testable.
 * Colonnes : Journal;Date;Pièce;Compte;Libellé;Débit;Crédit. Séparateur « ; », décimales à
 * virgule, dates jj/mm/aaaa. Importable dans Sage (import paramétrable), Ciel, EBP, etc. — les
 * montants proviennent du modèle (aucun recalcul). Le débit et le crédit sont en colonnes
 * distinctes (vide si nul), jamais un montant signé.
 */
export function buildEntriesCsvSage(entries: JournalEntry[], _firm: Firm, _period: string): string {
  const SEP = ";";
  const header = ["Journal", "Date", "Piece", "Compte", "Libelle", "Debit", "Credit"].join(SEP);
  const rows = [header];
  for (const e of entries) {
    for (const l of e.lines) {
      rows.push([
        csvField(e.journal),
        toDmy(e.date),
        csvField(e.reference),
        csvField(l.account),
        csvField(l.label),
        frAmount(l.debit),
        frAmount(l.credit),
      ].join(SEP));
    }
  }
  return rows.join("\r\n") + "\r\n";
}

/** Télécharge le CSV d'import (BOM UTF-8 pour les accents dans Sage/Excel). */
export function exportEntriesCsvSage(entries: JournalEntry[], firm: Firm, period: string) {
  const BOM = "﻿";
  download(BOM + buildEntriesCsvSage(entries, firm, period), `ecritures_paie_${period}_sage.csv`, "text/csv;charset=utf-8");
}

/* ------------------------------ Excel ------------------------------ */
export function exportEntriesXlsx(entries: JournalEntry[], firm: Firm, period: string) {
  const rows: (string | number)[][] = [];
  rows.push([`Écritures comptables de paie — ${firm.name} — ${period}`]);
  rows.push([]);
  for (const e of entries) {
    rows.push([`Journal ${e.journal}`, e.reference, e.date, e.description]);
    rows.push(["Compte", "Libellé", "Débit", "Crédit"]);
    for (const l of e.lines) rows.push([l.account, l.label, l.debit || "", l.credit || ""]);
    rows.push(["", "TOTAL", e.totalDebit, e.totalCredit]);
    rows.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 46 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Écritures");
  XLSX.writeFile(wb, `ecritures_paie_${period}.xlsx`);
}

/* ------------------------------ PDF ------------------------------ */
export function exportEntriesPdf(entries: JournalEntry[], firm: Firm, period: string) {
  buildEntriesDoc(entries, firm, period).save(`ecritures_paie_${period}.pdf`);
}

/**
 * Construit le document PDF des écritures (sans le sauvegarder) — testable hors navigateur.
 *
 * Mise en page issue du socle commun `pdf-kit.ts` : mêmes marges, même en-tête société et même
 * pied paginé que les bulletins et les documents RH. Les couleurs viennent de la société
 * (`brand_color`) — elles étaient auparavant écrites en dur, ce qui donnait des écritures au vert
 * Miya même pour une société ayant sa propre couleur de marque.
 */
export function buildEntriesDoc(entries: JournalEntry[], firm: Firm, period: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pal = firmPalette(firm);
  // En-tête sans logo : cette fonction reste synchrone (chargement du logo = asynchrone).
  const cur: Cursor = { doc, firm, pal, y: drawFullHeader(doc, firm, null, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, "Écritures comptables de paie", cur.y) + 7;
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.muted);
  doc.text(asciiSpaces(`Période ${period}`), M, cur.y);
  doc.text("PCGE/CGNC — à valider avant intégration comptable.", W - M, cur.y, { align: "right" });
  cur.y += 7;

  for (const e of entries) {
    // Le titre de l'écriture, sa description et l'amorce du tableau sont réservés d'un bloc :
    // un intitulé orphelin en bas de page rend le document illisible.
    ensure(cur, 26);
    doc.setFont("helvetica", "bold").setFontSize(FS.section).setTextColor(...pal.ink);
    doc.text(asciiSpaces(`Journal ${e.journal} · ${e.reference} · ${e.date}`), M, cur.y);
    doc.setFont("helvetica", "normal").setFontSize(FS.note).setTextColor(...pal.muted);
    doc.text(asciiSpaces(e.description), M, cur.y + 4.5);
    const styles = tableStyles(pal);
    autoTable(doc, {
      startY: cur.y + 7,
      head: [["Compte", "Libellé", "Débit", "Crédit"]],
      body: [
        ...e.lines.map((l) => [l.account, l.label, l.debit ? nFr(l.debit) : "", l.credit ? nFr(l.credit) : ""]),
        ["", "TOTAL", nFr(e.totalDebit), nFr(e.totalCredit)],
      ],
      theme: "grid",
      ...styles,
      columnStyles: { 0: { cellWidth: 24 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 32 } },
      didParseCell: (d) => {
        // Ligne de total : gras sur fond attenué de la société.
        if (d.row.index === e.lines.length) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
        }
      },
    });
    afterTable(cur, 6);
    ensure(cur, 8);
    // Le déséquilibre reste en rouge : c'est un signal d'alerte, pas un élément de charte.
    const flag: RGB = e.balanced ? pal.deep : ALERT;
    doc.setFontSize(7.5).setTextColor(flag[0], flag[1], flag[2]);
    doc.text(e.balanced ? "Écriture équilibrée (débit = crédit)." : "DÉSÉQUILIBRE — à vérifier.", M, cur.y);
    cur.y += 8;
  }

  paintFooters(doc, firm, pal);
  return doc;
}
