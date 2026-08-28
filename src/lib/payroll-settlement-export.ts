/**
 * Exports de l'ÉTAT DE RÈGLEMENT des salaires d'une période : PDF (socle `pdf-kit`) et tableur
 * (.xlsx, présentation « finance »). Liste les salariés déclarés + mode de règlement, et le solde
 * par mode (virement / chèque / espèces). Aucune donnée recalculée : tout vient des bulletins.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { num, periodLabel } from "./format";
import {
  FONT, FS, M,
  afterTable, asciiSpaces, drawFullHeader, drawTitleBox, firmLogoPath, firmPalette,
  loadLogo, paintFooters, tableStyles, type Cursor,
} from "./pdf-kit";
import type { SettlementReport } from "./payroll-settlement";

const TITLE = "ÉTAT DE RÈGLEMENT DES SALAIRES";

/** Nom de fichier : Reglement_Salaires_<firm>_<aaaa-mm>.<ext> */
export function settlementFileName(r: SettlementReport, ext: string): string {
  return `Reglement_Salaires_${r.firm.id}_${r.year}-${String(r.month).padStart(2, "0")}.${ext}`;
}

const money = (n: number) => (n ? num(n) : "");

/** Construit le PDF de l'état de règlement (sans le sauvegarder) — testable hors navigateur. */
export async function buildSettlementPdf(rep: SettlementReport): Promise<jsPDF> {
  const pal = firmPalette(rep.firm);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `${TITLE} — ${rep.firm.name} — ${periodLabel(rep.year, rep.month)}` });
  const logo = await loadLogo(firmLogoPath(rep.firm));
  const cur: Cursor = { doc, firm: rep.firm, pal, y: drawFullHeader(doc, rep.firm, logo, pal), page: 1 };

  cur.y = drawTitleBox(doc, pal, TITLE, cur.y) + 8;
  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(asciiSpaces(`${periodLabel(rep.year, rep.month)}  —  ${rep.total.count} salarié(s) déclaré(s)`), M, cur.y);
  cur.y += 6;

  // Tableau nominatif.
  const head = ["N°", "Matricule", "Nom et prénom", "N° CNSS", "Mode", "RIB", "Net à payer", "Avances", "Net à régler"];
  const body = rep.rows.map((r) => [
    String(r.order),
    r.matricule || "—",
    r.name,
    r.cnss || "—",
    r.modeLabel,
    r.bankRib || (r.mode === "virement" ? "—" : ""),
    money(r.net),
    money(r.advances),
    num(r.netToPay),
  ]);
  const totalRow = ["", "", `Total (${rep.total.count})`, "", "", "", money(rep.total.net), money(rep.total.advances), num(rep.total.netToPay)];
  const totalIdx = body.length;
  const styles = tableStyles(pal);
  autoTable(doc, {
    startY: cur.y,
    head: [head],
    body: [...body, totalRow],
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 8, cellPadding: 1.3 },
    headStyles: { ...styles.headStyles, fontSize: 8, halign: "center" },
    alternateRowStyles: { fillColor: [...pal.tint] },
    columnStyles: {
      0: { halign: "right", cellWidth: 8 },
      1: { cellWidth: 18 },
      2: { cellWidth: 42 },
      3: { cellWidth: 20 },
      4: { cellWidth: 18 },
      5: { cellWidth: 22 },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === totalIdx) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
      }
    },
  });
  afterTable(cur, 8);

  // Solde par mode de règlement.
  doc.setFont(FONT, "bold").setFontSize(FS.section).setTextColor(...pal.deep);
  doc.text(asciiSpaces("Solde par mode de règlement"), M, cur.y);
  cur.y += 4;
  const modeHead = ["Mode de règlement", "Compte", "Effectif", "Net à payer", "Avances", "Net à régler"];
  const modeBody = rep.byMode.map((m) => [
    m.label, m.account, String(m.count), money(m.net), money(m.advances), num(m.netToPay),
  ]);
  modeBody.push(["Total général", "", String(rep.total.count), money(rep.total.net), money(rep.total.advances), num(rep.total.netToPay)]);
  const modeTotalIdx = rep.byMode.length;
  autoTable(doc, {
    startY: cur.y,
    head: [modeHead],
    body: modeBody,
    theme: "grid",
    ...styles,
    styles: { ...styles.styles, fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { ...styles.headStyles, fontSize: 8.5, halign: "center" },
    columnStyles: {
      0: { cellWidth: 44 }, 1: { halign: "center", cellWidth: 20 }, 2: { halign: "right", cellWidth: 20 },
      3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
    },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === modeTotalIdx) {
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.fillColor = [pal.tint[0], pal.tint[1], pal.tint[2]];
      }
    },
  });
  afterTable(cur, 6);

  doc.setFont(FONT, "normal").setFontSize(FS.note).setTextColor(...pal.ink);
  doc.text(
    asciiSpaces(
      "Net à régler = net à payer - avances (retenues). Mode de règlement : virement / cheque -> Banque (5141) ; especes -> Caisse (5161). Montants issus des bulletins validés.",
    ),
    M,
    cur.y,
    { maxWidth: doc.internal.pageSize.getWidth() - 2 * M, lineHeightFactor: 1.3 },
  );

  paintFooters(doc, rep.firm, pal);
  return doc;
}

export async function exportSettlementPdf(rep: SettlementReport): Promise<void> {
  const doc = await buildSettlementPdf(rep);
  doc.save(settlementFileName(rep, "pdf"));
}

/** Export tableur — liste nominative + solde par mode, présentation « finance ». */
export function exportSettlementXlsx(rep: SettlementReport): void {
  const MONEY = "#,##0.00";
  const header = ["N°", "Matricule", "Nom et prénom", "N° CNSS", "RIB", "Mode de règlement", "Compte", "Net à payer", "Avances", "Net à régler"];
  const rows: (string | number)[][] = [
    [`État de règlement des salaires — ${rep.firm.name} — ${periodLabel(rep.year, rep.month)}`],
    [`${rep.total.count} salarié(s) déclaré(s) — montants issus des bulletins validés`],
    [],
    header,
  ];
  for (const r of rep.rows) {
    rows.push([r.order, r.matricule, r.name, r.cnss ?? "", r.bankRib ?? "", r.modeLabel, r.account, r.net, r.advances, r.netToPay]);
  }
  rows.push(["", "", `Total (${rep.total.count})`, "", "", "", "", rep.total.net, rep.total.advances, rep.total.netToPay]);
  rows.push([]);
  rows.push(["Solde par mode de règlement"]);
  rows.push(["Mode", "Compte", "Effectif", "Net à payer", "Avances", "Net à régler"]);
  for (const m of rep.byMode) rows.push([m.label, m.account, m.count, m.net, m.advances, m.netToPay]);
  rows.push(["Total général", "", rep.total.count, rep.total.net, rep.total.advances, rep.total.netToPay]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const LAST = 9; // 10 colonnes (0..9)
  const HEADER_ROW = 3;
  const firstData = HEADER_ROW + 1;
  const lastData = firstData + rep.rows.length; // inclut la ligne Total nominatif
  // Formats montants (colonnes 7,8,9) sur la liste nominative + son total.
  for (let r = firstData; r <= lastData; r++) {
    for (const c of [7, 8, 9]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = MONEY;
    }
  }
  // Formats montants du bloc « solde par mode » (colonnes 3,4,5).
  const modeHeaderRow = lastData + 3; // ligne d'en-têtes du bloc mode
  for (let r = modeHeaderRow + 1; r <= modeHeaderRow + rep.byMode.length + 1; r++) {
    for (const c of [3, 4, 5]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = MONEY;
    }
  }
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: LAST } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: LAST } },
  ];
  ws["!autofilter"] = { ref: `${XLSX.utils.encode_cell({ r: HEADER_ROW, c: 0 })}:${XLSX.utils.encode_cell({ r: lastData - 1, c: LAST })}` };
  ws["!cols"] = [
    { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 26 },
    { wch: 16 }, { wch: 8 }, { wch: 13 }, { wch: 11 }, { wch: 13 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Règlement salaires");
  XLSX.writeFile(wb, settlementFileName(rep, "xlsx"));
}
