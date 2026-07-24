/**
 * Bulletin de paie Belkora Paie — reproduction du modèle officiel Miya Belkora Design
 * (bulletin_corrige_ABOUBI). 3 formats : PDF (jsPDF + autotable), HTML imprimable, LaTeX.
 * Aux couleurs du logo. La section « Exonérations & abattements appliqués » n'est PAS affichée.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Employee, Firm, PayrollPeriod, PayslipInput } from "@/data/types";
import type { PayrollResult } from "./payroll-engine";
import { getParams } from "./params";
import { amountToWordsFr, dateFr, periodLabel } from "./format";
import { firmDescriptor, firmLegalLine } from "./firm-legal";
import { paletteForFirm, type PayslipPalette, type RGB } from "./brand-color";

export interface PayslipView {
  firm: Firm;
  employee: Employee;
  period: PayrollPeriod;
  result: PayrollResult;
  input?: PayslipInput;
  /**
   * Afficher la « Partie réservée à l'employeur » (charges patronales + coût total employeur).
   * Défaut : `true` (comportement historique). Mettre à `false` pour un bulletin remis au salarié
   * sans le coût employeur. N'affecte QUE l'affichage : les charges restent calculées (écritures
   * comptables, BDS CNSS et totaux inchangés).
   */
  showEmployerSection?: boolean;
}

/* Couleurs de marque — dérivées de la société (firm.brand_color) au début de chaque rendu.
 * Sans couleur de marque définie, on garde EXACTEMENT le vert Miya d'origine.
 * `usePalette(firm)` réassigne LIME/OLIVE/… : tous les usages `...LIME` restent inchangés. */
let PAL: PayslipPalette = paletteForFirm(undefined);
let LIME: RGB = PAL.lime;
let OLIVE: RGB = PAL.olive;
let SAGE_DARK: RGB = PAL.sageDark;
let TINT: RGB = PAL.tint;
let INK: RGB = PAL.ink;
function usePalette(firm: Firm) {
  PAL = paletteForFirm(firm.brand_color);
  LIME = PAL.lime;
  OLIVE = PAL.olive;
  SAGE_DARK = PAL.sageDark;
  TINT = PAL.tint;
  INK = PAL.ink;
}

/* Format numérique du modèle : espace pour les milliers, point décimal. */
function f(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");
}
const pctv = (r: number) => (r * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function defaults(v: PayslipView): PayslipInput {
  return (
    v.input ?? {
      days_worked: 26, hours_normal: v.employee.monthly_hours,
      hours_ot_25: 0, hours_ot_50: 0, hours_ot_100: 0,
      panier: 0, transport: 0, salissure: 0, other_gross: 0,
    }
  );
}

type RowKind = "normal" | "bold" | "italic" | "net";
interface Row { cells: [string, string, string, string, string]; kind: RowKind }

/** Lignes du tableau principal LIBELLE | Nbre/Base | TAUX | GAINS | RETENUES. */
function mainRows(v: PayslipView): Row[] {
  const { result: r } = v;
  const inp = defaults(v);
  const p = getParams(v.period.year); // taux affichés dérivés de params.ts (source unique)
  const rows: Row[] = [];
  const days = inp.days_worked || 0;
  const dailyBase = days > 0 ? r.salaireBase / days : v.employee.base_hourly_rate;

  rows.push({ cells: ["Salaire de base", f(days || inp.hours_normal), f(dailyBase), f(r.salaireBase), ""], kind: "normal" });

  const otHours = inp.hours_ot_25 + inp.hours_ot_50 + inp.hours_ot_100;
  if (r.overtime > 0)
    rows.push({ cells: ["Heures supplémentaires", otHours ? f(otHours) : "", "", f(r.overtime), ""], kind: "normal" });

  if (r.primeAnciennete > 0)
    rows.push({ cells: [`Prime d'ancienneté (${(r.seniorityRate * 100).toFixed(0)} %)`, "", pctv(r.seniorityRate), f(r.primeAnciennete), ""], kind: "normal" });

  if (inp.panier > 0)
    rows.push({ cells: ["Prime de panier (exonérée)", f(days), f(days > 0 ? inp.panier / days : inp.panier), f(inp.panier), ""], kind: "normal" });
  if (inp.transport > 0)
    rows.push({ cells: ["Indemnité de transport (exonérée)", f(days), f(days > 0 ? inp.transport / days : inp.transport), f(inp.transport), ""], kind: "normal" });
  if (inp.salissure > 0)
    rows.push({ cells: ["Indemnité de salissure (exonérée)", "", "", f(inp.salissure), ""], kind: "normal" });
  if (inp.other_gross > 0)
    rows.push({ cells: ["Primes / gains soumis", "", "", f(inp.other_gross), ""], kind: "normal" });

  rows.push({ cells: ["SALAIRE BRUT", "", "", f(r.salaireBrut), ""], kind: "bold" });
  rows.push({ cells: ["Salaire brut soumis à cotisations", f(r.sbi), "", "", ""], kind: "italic" });

  rows.push({ cells: ["CNSS prestations sociales", f(r.employerDetail.cnssBase), pctv(p.cnssEmployeeRate), "", f(r.cnssSalarie)], kind: "normal" });
  rows.push({ cells: ["AMO", f(r.sbi), pctv(p.amoEmployeeRate), "", f(r.amoSalarie)], kind: "normal" });
  rows.push({ cells: ["Total cotisations salariales", "", "", "", f(r.cnssSalarie + r.amoSalarie)], kind: "bold" });

  // Abattement fiscal (art. 59 CGI) : sert au SEUL calcul de l'IR, ce N'EST PAS une retenue
  // sur le net -> ligne informative (montant + taux), colonne RETENUES laissée vide.
  rows.push({ cells: ["Abattement frais professionnels (art. 59 CGI)", f(r.fraisPro), pctv(r.fraisProRate), "", ""], kind: "italic" });
  rows.push({ cells: ["Salaire net imposable", f(r.sni), "", "", ""], kind: "italic" });
  rows.push({
    cells: [`Impôt sur le revenu (barème LF ${v.period.year} — tranche ${(r.irMarginalRate * 100).toFixed(0)} %)`, f(r.sni), pctv(r.irMarginalRate), "", f(r.ir)],
    kind: "normal",
  });

  rows.push({ cells: ["NET À PAYER", "", "", f(r.netAPayer), ""], kind: "net" });
  return rows;
}

/** Détail des charges patronales (modèle §2). */
function employerRows(v: PayslipView): { cells: [string, string, string, string, string]; kind: RowKind }[] {
  const { result: r } = v;
  const p = getParams(v.period.year);
  const d = r.employerDetail;
  const cb = f(d.cnssBase), sb = f(d.sbiBase);
  return [
    { cells: ["CNSS prestations court terme", cb, pctv(p.cnssEmployerCourtTermeRate), f(p.cnssCeiling), f(d.cnssCourtTerme)], kind: "normal" },
    { cells: ["CNSS IPE (perte d'emploi)", cb, pctv(p.cnssEmployerIpeRate), f(p.cnssCeiling), f(d.cnssIpe)], kind: "normal" },
    { cells: ["CNSS prestations long terme", cb, pctv(p.cnssEmployerLongTermeRate), f(p.cnssCeiling), f(d.cnssLongTerme)], kind: "normal" },
    { cells: ["Allocations familiales", sb, pctv(p.familyAllocRate), "—", f(d.af)], kind: "normal" },
    { cells: ["AMO de base", sb, pctv(p.amoEmployerBaseRate), "—", f(d.amoBase)], kind: "normal" },
    { cells: ["AMO solidarité", sb, pctv(p.amoEmployerSolidariteRate), "—", f(d.amoSolidarite)], kind: "normal" },
    { cells: ["Taxe de formation professionnelle (TFP)", sb, pctv(p.tfpRate), "—", f(d.tfp)], kind: "normal" },
    { cells: [`Total charges patronales (${d.totalRate.toLocaleString("en-US", { minimumFractionDigits: 2 })} %)`, "", "", "", f(r.chargesPatronales)], kind: "bold" },
    { cells: ["COÛT TOTAL EMPLOYEUR (brut + charges patronales)", "", "", "", f(r.coutTotalEmployeur)], kind: "bold" },
  ];
}

/** Décompte monétaire du net (coupures MAD). */
function denominations(net: number): number[] {
  const coupures = [200, 100, 50, 20, 10, 5, 2, 1];
  let rest = Math.floor(net);
  return coupures.map((c) => {
    const n = Math.floor(rest / c);
    rest -= n * c;
    return n;
  });
}

/* -------------------------------------------------- PDF -------------------------------------------------- */
async function loadLogo(path?: string): Promise<{ data: string; fmt: string } | null> {
  if (!path) return null;
  try {
    if (path.startsWith("data:")) {
      const fmt = path.substring(5, path.indexOf("/")) === "image" ? path.substring(11, path.indexOf(";")).toUpperCase() : "PNG";
      return { data: path, fmt: fmt === "JPEG" || fmt === "JPG" ? "JPEG" : "PNG" };
    }
    const res = await fetch(path);
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return { data, fmt: blob.type.includes("jpeg") ? "JPEG" : "PNG" };
  } catch {
    return null;
  }
}

export async function exportPayslipPdf(v: PayslipView) {
  const doc = await buildPayslipDoc(v);
  doc.save(`bulletin_${v.employee.last_name}_${v.period.year}-${String(v.period.month).padStart(2, "0")}.pdf`);
}

/** Construit le document PDF (sans le sauvegarder) — utilisable en test/rendu hors navigateur. */
export async function buildPayslipDoc(v: PayslipView): Promise<jsPDF> {
  const { firm, employee: e, period } = v;
  usePalette(firm); // couleurs dérivées de la société (défaut = vert Miya)
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 12;
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 0);

  // En-tête : logo + société
  const logo = await loadLogo(firm.logo_path || "/logo-miya.png");
  if (logo) {
    try { doc.addImage(logo.data, logo.fmt, M, 9, 38, 19); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
  doc.text(firm.name.toUpperCase(), M, 32);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(110, 110, 110);
  const headLine = [firmDescriptor(firm), firmLegalLine(firm)].filter(Boolean).join("   ·   ")
    || `ICE : ${firm.ice ?? "—"}`;
  doc.text(doc.splitTextToSize(headLine, W - 2 * M), M, 36);

  // Titre encadré + période
  doc.setDrawColor(...OLIVE).setLineWidth(0.4);
  doc.rect(M, 42, 92, 13);
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
  doc.text("BULLETIN DE PAIE", M + 46, 50.5, { align: "center" });
  doc.rect(W - M - 76, 42, 76, 13);
  doc.setFontSize(9).setTextColor(...INK);
  doc.text("Période de paie", W - M - 38, 47.5, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90, 90, 90);
  doc.text(`du ${dateFr(start.toISOString())} au ${dateFr(end.toISOString())}`, W - M - 38, 52.5, { align: "center" });

  // Grilles employeur
  const headFill = OLIVE;
  const grid = (startY: number, head: string[], body: string[], widths: number[]) => {
    autoTable(doc, {
      startY,
      head: [head],
      body: [body],
      theme: "grid",
      styles: { fontSize: 8, halign: "center", lineColor: [200, 205, 195], textColor: INK, cellPadding: 1.6 },
      headStyles: { fillColor: headFill, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
      margin: { left: M, right: M },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  const full = W - 2 * M;
  let y = grid(
    58,
    ["Matricule", "Nom et prénom de l'employé", "Poste", "Affaire"],
    [e.matricule ?? "—", `${e.first_name} ${e.last_name}`, e.position ?? "—", e.site ?? "—"],
    [22, full - 22 - 40 - 40, 40, 40],
  );
  y = grid(
    y,
    ["Naissance", "Embauche", "Situation familiale", "Déduction", "N° C.I.N.", "N° C.N.S.S."],
    [dateFr(e.birth_date), dateFr(e.hire_date), e.marital_status ?? "—", String(e.dependents), e.cin ?? "—", e.cnss_number ?? "EN COURS (DAMANCOM)"],
    [26, 26, 34, 20, 30, full - 26 - 26 - 34 - 20 - 30],
  );
  const inp = defaults(v);
  const otH = inp.hours_ot_25 + inp.hours_ot_50 + inp.hours_ot_100;
  y = grid(
    y,
    ["Jours ouvrés", "Jours travaillés", "Absences", "Maladie", "H. supp."],
    ["26", String(inp.days_worked), "0", "0", otH ? String(otH) : "0"],
    [full / 5, full / 5, full / 5, full / 5, full / 5],
  );

  // Tableau principal
  const rows = mainRows(v);
  autoTable(doc, {
    startY: y + 2,
    head: [["LIBELLE", "Nbre ou Base", "TAUX", "GAINS", "RETENUES"]],
    body: rows.map((r) => r.cells),
    theme: "grid",
    styles: { fontSize: 8.3, lineColor: [214, 218, 208], textColor: INK, cellPadding: 1.5 },
    headStyles: { fillColor: OLIVE, textColor: 255, fontStyle: "bold", fontSize: 7.8, halign: "center" },
    columnStyles: {
      0: { cellWidth: full - 30 - 22 - 34 - 34 },
      1: { cellWidth: 30, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 34, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
    margin: { left: M, right: M },
    didParseCell: (data) => {
      const kind = rows[data.row.index]?.kind;
      if (kind === "bold") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = TINT; }
      else if (kind === "italic") { data.cell.styles.fontStyle = "italic"; data.cell.styles.textColor = [90, 96, 88]; }
      else if (kind === "net") {
        data.cell.styles.fillColor = LIME;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY;

  // Charges patronales — section OPTIONNELLE (masquée si showEmployerSection === false).
  if (v.showEmployerSection !== false) {
    const emp = employerRows(v);
    autoTable(doc, {
      startY: y + 3,
      head: [["Partie réservée à l'employeur — charges patronales", "Base", "Taux %", "Plafond", "Montant"]],
      body: emp.map((r) => r.cells),
      theme: "grid",
      styles: { fontSize: 8, lineColor: [214, 218, 208], textColor: INK, cellPadding: 1.4 },
      headStyles: { fillColor: SAGE_DARK, textColor: 255, fontStyle: "bold", fontSize: 7.6, halign: "center" },
      columnStyles: {
        0: { cellWidth: full - 28 - 22 - 26 - 30 },
        1: { cellWidth: 28, halign: "right" },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 26, halign: "right" },
        4: { cellWidth: 30, halign: "right" },
      },
      margin: { left: M, right: M },
      didParseCell: (data) => {
        if (emp[data.row.index]?.kind === "bold") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = TINT; }
      },
    });
    y = (doc as any).lastAutoTable.finalY;
  }

  // Bloc de BAS DE PAGE (décompte monétaire + « Arrêté à la somme de » + mentions légales).
  // Il doit rester ancré en bas même quand la « Partie réservée à l'employeur » est masquée :
  // sinon tout le bas du bulletin remonte et laisse un grand vide. Si le contenu au-dessus est
  // long, le flux naturel l'emporte (max) pour ne jamais chevaucher.
  const PAGE_H = 297;        // A4 (mm)
  const BOTTOM_MARGIN = 10;  // marge basse
  const TRAILING_H = 34;     // hauteur du bloc final (décompte 2 lignes + arrêté + filet + mentions)
  y = Math.max(y, PAGE_H - BOTTOM_MARGIN - TRAILING_H);

  // Décompte monétaire
  const den = denominations(v.result.netAPayer);
  autoTable(doc, {
    startY: y + 3,
    head: [["Décompte monétaire", "200", "100", "50", "20", "10", "5", "2", "1", "Mode", "Net à payer"]],
    body: [["", ...den.map(String), "Virement", f(v.result.netAPayer)]],
    theme: "grid",
    styles: { fontSize: 8, halign: "center", lineColor: [214, 218, 208], textColor: INK, cellPadding: 1.4 },
    headStyles: { fillColor: [245, 247, 241], textColor: INK, fontStyle: "bold", fontSize: 7.4 },
    columnStyles: { 0: { fontStyle: "bold", halign: "left" }, 10: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 10) {
        data.cell.styles.fillColor = LIME; data.cell.styles.textColor = [255, 255, 255];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK);
  doc.text("Arrêté à la somme de :", M, y);
  doc.setFont("helvetica", "italic").setTextColor(70, 70, 70);
  doc.text(amountToWordsFr(v.result.netAPayer).toUpperCase(), M + 38, y, { maxWidth: full - 40 });
  y += 8;

  doc.setDrawColor(210, 214, 204).line(M, y, W - M, y);
  doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(140, 140, 140);
  doc.text(
    "CGI Maroc art. 73 - Loi 65-00 CNSS/AMO  -  Document a conserver 5 ans minimum.  -  Genere par Belkora Paie, referentiel Maroc " +
      period.year + ".",
    M, y + 4, { maxWidth: full },
  );

  return doc;
}

/* -------------------------------------------------- HTML -------------------------------------------------- */
export function buildPayslipHtml(v: PayslipView): string {
  const { firm, employee: e, period } = v;
  const pal = paletteForFirm(firm.brand_color); // couleurs dérivées de la société (défaut = vert Miya)
  const inp = defaults(v);
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 0);
  const rows = mainRows(v);
  const emp = employerRows(v);
  const den = denominations(v.result.netAPayer);

  const mainTr = rows
    .map((r) => {
      const cls = r.kind === "bold" ? ' class="b"' : r.kind === "italic" ? ' class="i"' : r.kind === "net" ? ' class="net"' : "";
      return `<tr${cls}><td>${r.cells[0]}</td><td class="r">${r.cells[1]}</td><td class="r">${r.cells[2]}</td><td class="r">${r.cells[3]}</td><td class="r">${r.cells[4]}</td></tr>`;
    })
    .join("");
  const empTr = emp
    .map((r) => `<tr${r.kind === "bold" ? ' class="b"' : ""}><td>${r.cells[0]}</td><td class="r">${r.cells[1]}</td><td class="r">${r.cells[2]}</td><td class="r">${r.cells[3]}</td><td class="r">${r.cells[4]}</td></tr>`)
    .join("");
  const denTd = den.map((n) => `<td>${n}</td>`).join("");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Bulletin ${e.last_name} ${periodLabel(period.year, period.month)}</title>
<style>
 :root{--lime:${pal.limeHex};--olive:${pal.oliveHex};--sage:${pal.sageHex};--tint:${pal.tintHex};--ink:${pal.inkHex}}
 *{box-sizing:border-box;font-family:"IBM Plex Sans",Arial,sans-serif}
 body{margin:0;padding:24px;background:#f4f5f2;color:var(--ink);font-size:13px}
 .sheet{max-width:820px;margin:auto;background:#fff;padding:26px;border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);display:flex;flex-direction:column;min-height:1040px}
 /* Bloc final (décompte + arrêté + mentions) ancré en bas, même si la section employeur est masquée. */
 .bottom{margin-top:auto}
 .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
 .top img{height:52px;object-fit:contain}
 .firm{font-weight:700;font-size:15px}
 .firm small{display:block;font-weight:400;color:#888;font-size:11px}
 .titlerow{display:flex;gap:12px;margin:16px 0}
 .box{border:1px solid var(--olive);border-radius:4px;padding:8px 14px}
 .box.title{flex:1;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;letter-spacing:.06em}
 .box.per{width:230px;text-align:center}
 .box.per b{font-size:12px}.box.per span{color:#777;font-size:12px}
 table{width:100%;border-collapse:collapse;margin:6px 0}
 th{background:var(--olive);color:#fff;font-size:11px;padding:5px 7px;text-align:center;border:1px solid #cfd4c7}
 td{padding:4px 7px;border:1px solid #dfe3d8;font-size:12px}
 td.r{text-align:right;font-variant-numeric:tabular-nums}
 tr.b td{background:var(--tint);font-weight:700}
 tr.i td{font-style:italic;color:#5a605a}
 tr.net td{background:var(--lime);color:#fff;font-weight:700;font-size:15px}
 .emp th{background:var(--sage)}
 .den th{background:#f5f7f1;color:var(--ink)}
 .den td:last-child{background:var(--lime);color:#fff;font-weight:700;text-align:right}
 .den td{text-align:center}
 .words{margin-top:12px;font-size:13px}.words b{margin-right:6px}
 .foot{margin-top:12px;border-top:1px solid #e0e4da;padding-top:6px;color:#999;font-size:10px;font-style:italic}
 .noprint{margin-bottom:14px}
 button{background:var(--lime);color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer}
 @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;min-height:262mm}.noprint{display:none}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
 <div class="top">
   <div style="display:flex;gap:12px;align-items:center">
     <img src="${firm.logo_path || "/logo-miya.png"}" alt="logo">
     <div class="firm">${firm.name.toUpperCase()}<small>${[firmDescriptor(firm), firmLegalLine(firm)].filter(Boolean).join("  ·  ") || `ICE : ${firm.ice ?? "—"}`}</small></div>
   </div>
 </div>
 <div class="titlerow">
   <div class="box title">BULLETIN DE PAIE</div>
   <div class="box per"><b>Période de paie</b><br><span>du ${dateFr(start.toISOString())} au ${dateFr(end.toISOString())}</span></div>
 </div>
 <table><tr><th>Matricule</th><th>Nom et prénom de l'employé</th><th>Poste</th><th>Affaire</th></tr>
   <tr><td style="text-align:center">${e.matricule ?? "—"}</td><td>${e.first_name} ${e.last_name}</td><td>${e.position ?? "—"}</td><td>${e.site ?? "—"}</td></tr></table>
 <table><tr><th>Naissance</th><th>Embauche</th><th>Situation familiale</th><th>Déduction</th><th>N° C.I.N.</th><th>N° C.N.S.S.</th></tr>
   <tr style="text-align:center"><td>${dateFr(e.birth_date)}</td><td>${dateFr(e.hire_date)}</td><td>${e.marital_status ?? "—"}</td><td>${e.dependents}</td><td>${e.cin ?? "—"}</td><td>${e.cnss_number ?? "EN COURS (DAMANCOM)"}</td></tr></table>
 <table><tr><th>Jours ouvrés</th><th>Jours travaillés</th><th>Absences</th><th>Maladie</th><th>H. supp.</th></tr>
   <tr style="text-align:center"><td>26</td><td>${inp.days_worked}</td><td>0</td><td>0</td><td>${inp.hours_ot_25 + inp.hours_ot_50 + inp.hours_ot_100}</td></tr></table>
 <table><tr><th style="text-align:left">LIBELLE</th><th>Nbre ou Base</th><th>TAUX</th><th>GAINS</th><th>RETENUES</th></tr>${mainTr}</table>
 ${v.showEmployerSection === false ? "" : `<table class="emp"><tr><th style="text-align:left">Partie réservée à l'employeur — charges patronales</th><th>Base</th><th>Taux %</th><th>Plafond</th><th>Montant</th></tr>${empTr}</table>`}
 <div class="bottom">
 <table class="den"><tr><th style="text-align:left">Décompte monétaire</th><th>200</th><th>100</th><th>50</th><th>20</th><th>10</th><th>5</th><th>2</th><th>1</th><th>Mode</th><th>Net à payer</th></tr>
   <tr><td style="text-align:left;font-weight:700"></td>${denTd}<td>Virement</td><td>${f(v.result.netAPayer)}</td></tr></table>
 <div class="words"><b>Arrêté à la somme de :</b><i>${amountToWordsFr(v.result.netAPayer).toUpperCase()}</i></div>
 <div class="foot">CGI Maroc art. 73 – Loi 65-00 CNSS/AMO • Document à conserver 5 ans minimum. • Généré par Belkora Paie, référentiel Maroc ${period.year}.</div>
 </div>
</div></body></html>`;
}

export function openHtmlPayslip(v: PayslipView) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(buildPayslipHtml(v)); w.document.close(); }
}

/* -------------------------------------------------- LaTeX -------------------------------------------------- */
export function buildPayslipLatex(v: PayslipView, template?: string): string {
  const { firm, employee: e, period, result: r } = v;
  if (template && template.trim()) {
    const map: Record<string, string> = {
      "firm.name": firm.name, "firm.ice": firm.ice ?? "", "firm.cnss_affiliation": firm.cnss_affiliation ?? "",
      "employee.first_name": e.first_name, "employee.last_name": e.last_name,
      "employee.matricule": e.matricule ?? "", "employee.cnss_number": e.cnss_number ?? "",
      "period.label": periodLabel(period.year, period.month),
      "result.brut": f(r.salaireBrut), "result.net": f(r.netAPayer), "result.net_lettres": amountToWordsFr(r.netAPayer),
      "result.cnss_salarie": f(r.cnssSalarie), "result.ir": f(r.ir),
    };
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? `??${k}??`);
  }

  const pal = paletteForFirm(firm.brand_color); // couleurs dérivées de la société (défaut = vert Miya)
  const rgb = ([r, g, b]: RGB) => `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
  const esc = (s: string) => s.replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/—/g, "--");
  const rowsMain = mainRows(v)
    .map((row) => {
      const c = row.cells.map(esc);
      const line = `${c[0]} & ${c[1]} & ${c[2]} & ${c[3]} & ${c[4]} \\\\`;
      if (row.kind === "bold" || row.kind === "net") return `\\rowcolor{tint}\\textbf{${c[0]}} & ${c[1]} & ${c[2]} & \\textbf{${c[3]}} & \\textbf{${c[4]}} \\\\`;
      if (row.kind === "italic") return `\\textit{${c[0]}} & ${c[1]} & ${c[2]} & ${c[3]} & ${c[4]} \\\\`;
      return line;
    })
    .join("\n");
  const rowsEmp = employerRows(v)
    .map((row) => {
      const c = row.cells.map(esc);
      return row.kind === "bold"
        ? `\\rowcolor{tint}\\textbf{${c[0]}} & ${c[1]} & ${c[2]} & ${c[3]} & \\textbf{${c[4]}} \\\\`
        : `${c[0]} & ${c[1]} & ${c[2]} & ${c[3]} & ${c[4]} \\\\`;
    })
    .join("\n");
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 0);

  return `\\documentclass[10pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1.5cm]{geometry}
\\usepackage{xcolor,colortbl,booktabs,array}
\\definecolor{lime}{RGB}{${rgb(pal.lime)}}
\\definecolor{olive}{RGB}{${rgb(pal.olive)}}
\\definecolor{sage}{RGB}{${rgb(pal.sageDark)}}
\\definecolor{tint}{RGB}{${rgb(pal.tint)}}
\\renewcommand{\\arraystretch}{1.25}
\\begin{document}\\pagestyle{empty}
\\noindent{\\Large\\bfseries ${esc(firm.name.toUpperCase())}}\\\\[-2pt]{\\small ICE/ID : ${esc(firm.ice ?? "--")}}
\\vspace{4pt}
\\begin{center}\\fbox{\\Large\\bfseries BULLETIN DE PAIE}\\quad\\fbox{\\parbox{6cm}{\\centering\\textbf{Période de paie}\\\\ du ${dateFr(start.toISOString())} au ${dateFr(end.toISOString())}}}\\end{center}
\\vspace{2pt}
\\noindent\\textbf{Matricule :} ${esc(e.matricule ?? "--")} \\quad \\textbf{Nom :} ${esc(e.first_name + " " + e.last_name)} \\quad \\textbf{Poste :} ${esc(e.position ?? "--")} \\quad \\textbf{Affaire :} ${esc(e.site ?? "--")}\\\\
\\textbf{CIN :} ${esc(e.cin ?? "--")} \\quad \\textbf{CNSS :} ${esc(e.cnss_number ?? "EN COURS")} \\quad \\textbf{Déduction :} ${e.dependents} \\quad \\textbf{Jours travaillés :} ${defaults(v).days_worked}
\\vspace{6pt}
\\definecolor{hdr}{RGB}{${rgb(pal.olive)}}
\\arrayrulecolor{gray!40}
\\noindent\\begin{tabular}{|p{8.3cm}|r|r|r|r|}\\hline
\\rowcolor{olive}\\textcolor{white}{\\textbf{LIBELLE}} & \\textcolor{white}{\\textbf{Nbre/Base}} & \\textcolor{white}{\\textbf{TAUX}} & \\textcolor{white}{\\textbf{GAINS}} & \\textcolor{white}{\\textbf{RETENUES}} \\\\ \\hline
${rowsMain}
\\hline\\end{tabular}
\\vspace{6pt}
${v.showEmployerSection === false ? "" : `\\noindent\\begin{tabular}{|p{7.2cm}|r|r|r|r|}\\hline
\\rowcolor{sage}\\textcolor{white}{\\textbf{Charges patronales}} & \\textcolor{white}{\\textbf{Base}} & \\textcolor{white}{\\textbf{Taux \\%}} & \\textcolor{white}{\\textbf{Plafond}} & \\textcolor{white}{\\textbf{Montant}} \\\\ \\hline
${rowsEmp}
\\hline\\end{tabular}
\\vspace{6pt}`}
\\vfill
\\noindent\\textbf{Net à payer : ${f(r.netAPayer)} DH}\\\\
\\textit{Arrêté à la somme de : ${esc(amountToWordsFr(r.netAPayer).toUpperCase())}.}
\\vspace{4pt}\\\\{\\footnotesize\\itshape CGI Maroc art. 73 -- Loi 65-00 CNSS/AMO. Document à conserver 5 ans minimum. Généré par Belkora Paie.}
\\end{document}
`;
}

export function downloadTex(v: PayslipView, template?: string) {
  const tex = buildPayslipLatex(v, template);
  const blob = new Blob([tex], { type: "text/x-tex" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bulletin_${v.employee.last_name}_${v.period.year}-${String(v.period.month).padStart(2, "0")}.tex`;
  a.click();
  URL.revokeObjectURL(url);
}
