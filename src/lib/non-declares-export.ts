/**
 * Exports du volet « Salariés non déclarés » — reçus internes + tableaux.
 *
 * Mention légale portée PARTOUT : suivi interne, SANS valeur CNSS / DAMANCOM /
 * fiscale. Un reçu sans cette mention deviendrait un faux bulletin opposable.
 */
import * as XLSX from "xlsx";
import type { Employee, Firm } from "@/data/types";
import type { NonDeclarePayment } from "./non-declares";
import {
  buildEmargementPdf, emargementSuffix, paymentCat, paymentSection,
} from "./emargement-export";

export const NON_DECLARE_MENTION =
  "DOCUMENT INTERNE DE SUIVI — SANS VALEUR CNSS / DAMANCOM / FISCALE — À RÉGULARISER";

function fileBase(firm: Firm, year: number, month: number): string {
  const safe = firm.name.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 24) || "Societe";
  return `NonDeclares_${safe}_${year}-${String(month).padStart(2, "0")}`;
}

/** Contexte de fiche partagé avec l'export collectif (mêmes N°, quinzaine, chantier…). */
export interface ReceiptContext {
  numero: string;
  quinzaine: string;
  chantier: string;
  lieu: string;
  datePaiement: string;
}

/**
 * Reçu individuel — REMPLACE l'ancien reçu générique : présentation IDENTIQUE à
 * la fiche d'émargement remise (même en-tête entité, POUR ACQUIT, tableau
 * 10 colonnes, arrêté en chiffres et en lettres, signatures), limitée à ce salarié.
 */
export function downloadReceiptPdf(
  firm: Firm,
  emp: Employee,
  p: NonDeclarePayment,
  ctx: ReceiptContext,
): void {
  const doc = buildEmargementPdf({
    firm,
    numero: ctx.numero,
    quinzaine: ctx.quinzaine,
    chantier: ctx.chantier,
    lieu: ctx.lieu,
    datePaiement: ctx.datePaiement,
    year: p.year,
    month: p.month,
    lines: [
      {
        n: 1, emp, pay: p, section: paymentSection(p), cat: paymentCat(p),
        jours: p.jours, montantDu: p.brut_verse,
        avance: p.avance_deduite ?? 0, net: p.net_verse,
      },
    ],
  });
  const tag = emargementSuffix(firm) || firm.id;
  const mat = (emp.matricule ?? emp.id).replace(/[^A-Za-z0-9]+/g, "_");
  doc.save(`Fiche_Emargement_${tag}_${p.year}-${String(p.month).padStart(2, "0")}_recu_${mat}.pdf`);
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
