/**
 * Exports du volet « Salariés non déclarés » — reçus internes + tableaux.
 *
 * Mention légale portée PARTOUT : suivi interne, SANS valeur CNSS / DAMANCOM /
 * fiscale. Un reçu sans cette mention deviendrait un faux bulletin opposable.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { Employee, Firm } from "@/data/types";
import type { NonDeclarePayment } from "./non-declares";
import { dateFr, mad } from "./format";

export const NON_DECLARE_MENTION =
  "DOCUMENT INTERNE DE SUIVI — SANS VALEUR CNSS / DAMANCOM / FISCALE — À RÉGULARISER";

function fileBase(firm: Firm, year: number, month: number): string {
  const safe = firm.name.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 24) || "Societe";
  return `NonDeclares_${safe}_${year}-${String(month).padStart(2, "0")}`;
}

export function downloadReceiptPdf(firm: Firm, emp: Employee, p: NonDeclarePayment): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text("RECU DE VERSEMENT INTERNE — NON DECLARE", 14, 18);
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.text(NON_DECLARE_MENTION, 14, 24);
  doc.text(`${firm.name}`, 14, 31);
  doc.text(`Salarie : ${emp.first_name} ${emp.last_name} — Mat. ${emp.matricule ?? "—"} — CIN ${emp.cin ?? "—"}`, 14, 37);
  doc.text(`Periode de presence : ${String(p.month).padStart(2, "0")}/${p.year} — Jours : ${p.jours}`, 14, 43);
  autoTable(doc, {
    startY: 49,
    head: [["Rubrique", "Montant (DH)"]],
    body: [
      ["Brut verse", mad(p.brut_verse)],
      ["Avance / acompte deduit", mad(p.avance_deduite ?? 0)],
      ["NET REMIS", mad(p.net_verse)],
      ["Mode", p.mode === "especes" ? "Especes" : p.mode === "cheque" ? "Cheque" : "Virement"],
    ],
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.text(`Fait le ${dateFr(p.created_at.slice(0, 10))}${p.note ? ` — ${p.note}` : ""}`, 14, y);
  doc.text("Signature employeur :                      Signature salarie :", 14, y + 12);
  doc.setFontSize(8);
  doc.text("Ce recu ne tient pas lieu de bulletin de paie (art. 370) ni de preuve de declaration CNSS.", 14, 285);
  doc.save(`${fileBase(firm, p.year, p.month)}_recu_${emp.matricule ?? emp.id}.pdf`);
}

export function downloadPeriodCsv(
  firm: Firm,
  rows: { emp: Employee; pay: NonDeclarePayment }[],
  year: number,
  month: number,
): void {
  const head = "periode;matricule;nom;prenom;cin;jours;brut_verse;avance;net_verse;mode;note";
  const lines = rows.map(({ emp, pay }) =>
    [
      `${year}-${String(month).padStart(2, "0")}`,
      emp.matricule ?? "", `${emp.last_name}`, `${emp.first_name}`, emp.cin ?? "",
      String(pay.jours), String(pay.brut_verse), String(pay.avance_deduite ?? 0),
      String(pay.net_verse), pay.mode, (pay.note ?? "").replace(/;/g, ","),
    ].join(";"),
  );
  const blob = new Blob([`﻿${head}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase(firm, year, month)}_mouvements.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadPeriodXlsx(
  firm: Firm,
  rows: { emp: Employee; pay: NonDeclarePayment }[],
  year: number,
  month: number,
  totalsByFirm: { firm_name: string; effectifND: number; brut: number; net: number }[],
): void {
  const ws1 = XLSX.utils.json_to_sheet(
    rows.map(({ emp, pay }) => ({
      Periode: `${year}-${String(month).padStart(2, "0")}`,
      Matricule: emp.matricule ?? "",
      Nom: emp.last_name,
      Prenom: emp.first_name,
      CIN: emp.cin ?? "",
      Jours: pay.jours,
      Brut_verse: pay.brut_verse,
      Avance: pay.avance_deduite ?? 0,
      Net_verse: pay.net_verse,
      Mode: pay.mode,
      Mention: NON_DECLARE_MENTION,
    })),
  );
  const ws2 = XLSX.utils.json_to_sheet(
    totalsByFirm.map((t) => ({
      Entite: t.firm_name, Effectif_non_declare: t.effectifND, Brut_mois: t.brut, Net_mois: t.net,
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Mouvements");
  XLSX.utils.book_append_sheet(wb, ws2, "Totaux_entites");
  XLSX.writeFile(wb, `${fileBase(firm, year, month)}.xlsx`);
}
