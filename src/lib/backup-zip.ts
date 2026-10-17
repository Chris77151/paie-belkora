/**
 * Sauvegarde complète de la base locale dans un ZIP organisé en sous-dossiers
 * (PDF + Excel + JSON + binaires locaux).
 *
 * - 00_Lisez-moi / README.txt + manifest.json (traçabilité : date, périmètre, contenu)
 * - 01_Societes / 02_Salaries / 03_Paie / 04_Conges / 05_Comptabilite /
 *   06_Documents / 07_Pieces / 99_Brut
 * - Chaque dossier porte le même jeu en 3 formats quand il a du sens :
 *   .json (données brutes, réimportables), .xlsx (tableur, contrôle), .pdf (lecture/visa).
 * - Les BINAIRES (pièces, fiches signées) vivent dans IndexedDB, poste par poste :
 *   on embarque ceux PRESENTS localement (best-effort), les absents sont listés
 *   dans le manifest (jamais un fichier vide).
 *
 * Moteurs PURS testables (lignes, manifest, filtrage) + une fonction async
 * `buildBackupZip` qui assemble le ZIP (JSZip) sans jamais inventer de donnée.
 */
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { AppState } from "@/data/types";
import { asciiSpaces, pdfText } from "./format";
import { DEFAULT_PALETTE } from "./brand-color";
import { getBinary, localBinaryIds } from "./blob-store";

export interface BackupOptions {
  /** Id société pour un périmètre restreint. null/undefined = toutes les sociétés. */
  scopeFirmId?: string | null;
  /** Inclure les formats (défaut : tout vrai). */
  includePdf?: boolean;
  includeExcel?: boolean;
  includeJson?: boolean;
  /** Embarquer les binaires IndexedDB présents sur CE poste (défaut : vrai). */
  includeBinaries?: boolean;
  /** Inclure les comptes utilisateurs (hashes, jamais de clair). Réservé super_admin. */
  includeUsers?: boolean;
  /** Inclure le dump brut AppState.json (restauration). Défaut : vrai. */
  includeRaw?: boolean;
}

export interface BackupManifest {
  app: string;
  generated_at: string;
  scope: { mode: "toutes" | "societe"; firm_id?: string; firm_name?: string };
  formats: { pdf: boolean; excel: boolean; json: boolean; binaires: boolean; utilisateurs: boolean };
  counts: Record<string, number>;
  files: string[];
  missingBinaries: { id: string; filename: string; reason: string }[];
  notes: string[];
}

/** Nom de base du ZIP : Sauvegarde_Belkora_AAAAMMJJ_HHMM */
export function backupBaseName(at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Sauvegarde_Belkora_${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}_${p(at.getHours())}${p(at.getMinutes())}`;
}

/** Normalise un fragment de nom de fichier (sans toucher au contenu). */
export function sanitizeFilePart(s: string): string {
  return asciiSpaces(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "export";
}

/** Filtre l'état au périmètre demandé (société unique ou tout le groupe). PUR. */
export function filterStateForBackup(state: AppState, scopeFirmId?: string | null): AppState {
  if (!scopeFirmId) return state;
  const empIds = new Set(state.employees.filter((e) => e.firm_id === scopeFirmId).map((e) => e.id));
  const periodIds = new Set(state.periods.filter((p) => p.firm_id === scopeFirmId).map((p) => p.id));
  return {
    ...state,
    firms: state.firms.filter((f) => f.id === scopeFirmId),
    employees: state.employees.filter((e) => e.firm_id === scopeFirmId),
    periods: state.periods.filter((p) => p.firm_id === scopeFirmId),
    payslips: state.payslips.filter((p) => periodIds.has(p.period_id) || empIds.has(p.employee_id)),
    leaves: state.leaves.filter((l) => empIds.has(l.employee_id)),
    salaryAdvances: (state.salaryAdvances ?? []).filter((a) => a.firm_id === scopeFirmId),
    workAccidents: (state.workAccidents ?? []).filter((a) => a.firm_id === scopeFirmId),
    documentRequests: (state.documentRequests ?? []).filter((d) => d.firm_id === scopeFirmId),
    attachments: (state.attachments ?? []).filter((a) => a.firm_id === scopeFirmId),
    accountingClosures: (state.accountingClosures ?? []).filter((c) => c.firm_id === scopeFirmId),
    docGenerations: (state.docGenerations ?? []).filter((d) => d.firm_id === scopeFirmId),
    bankAudit: (state.bankAudit ?? []).filter((b) => b.firm_id === scopeFirmId),
    bankBaseline: (state.bankBaseline ?? []).filter((b) => b.firm_id === scopeFirmId),
    payrollAttachments: (state.payrollAttachments ?? []).filter((p) => p.firm_id === scopeFirmId),
    nonDeclarePayments: (state.nonDeclarePayments ?? []).filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      const fid = rec["firm_id"];
      return typeof fid === "string" ? fid === scopeFirmId : true;
    }),
    customRisks: (state.customRisks ?? []).filter((r) => r.firm_id === scopeFirmId),
    riskActions: (state.riskActions ?? []).filter((r) => r.firm_id === scopeFirmId),
    riskSnapshots: (state.riskSnapshots ?? []).filter((r) => r.firm_id === scopeFirmId),
    users: (state.users ?? []).filter((u) => !u.firm_id || u.firm_id === scopeFirmId),
    currentFirmId: scopeFirmId,
  };
}

/* ---------------- Lignes tabulaires (PUR, testables) ---------------- */

export function firmsRows(s: AppState): Record<string, string | number>[] {
  return s.firms.map((f) => ({
    Societe: f.name,
    Regime: f.regime,
    ICE: f.ice ?? "",
    IF: f.if_fiscal ?? "",
    RC: f.rc ?? "",
    Patente: f.patente ?? "",
    CNSS: f.cnss_affiliation ?? "",
    Ville: f.city ?? "",
    OdooID: f.odoo_company_id ?? "",
  }));
}

export function employeesRows(s: AppState): Record<string, string | number>[] {
  const firmName = (id: string) => s.firms.find((f) => f.id === id)?.name ?? id;
  return s.employees.map((e) => ({
    Societe: firmName(e.firm_id),
    Matricule: e.matricule ?? "",
    Nom: `${e.last_name} ${e.first_name}`,
    CIN: e.cin ?? "",
    CNSS: e.cnss_number ?? "",
    Contrat: e.contract_type,
    Poste: e.position ?? "",
    Embauche: e.hire_date,
    Sortie: e.exit_date ?? "",
    Actif: e.is_active ? "oui" : "non",
  }));
}

export function periodsRows(s: AppState): Record<string, string | number>[] {
  const firmName = (id: string) => s.firms.find((f) => f.id === id)?.name ?? id;
  return s.periods.map((p) => ({
    Societe: firmName(p.firm_id),
    Periode: `${p.year}-${String(p.month).padStart(2, "0")}`,
    Statut: p.status,
    Bulletins: s.payslips.filter((b) => b.period_id === p.id).length,
  }));
}

export function leavesRows(s: AppState): Record<string, string | number>[] {
  const empName = (id: string) => {
    const e = s.employees.find((x) => x.id === id);
    return e ? `${e.last_name} ${e.first_name}` : id;
  };
  return (s.leaves ?? []).map((l) => ({
    Salarie: empName(l.employee_id),
    Type: l.type,
    Debut: l.start_date,
    Fin: l.end_date,
    Jours: l.days,
  }));
}

export function docEventsRows(s: AppState): Record<string, string | number>[] {
  return (s.docGenerations ?? []).map((d) => ({
    Date: d.at,
    Type: d.doc_type,
    Format: d.format,
    Sujet: d.subject ?? "",
    Periode: d.period_year ? `${d.period_year}-${String(d.period_month ?? "").padStart(2, "0")}` : "",
    Par: d.by ?? "",
    Archive: d.archive ? "oui" : "non",
  }));
}

export function attachmentsRows(s: AppState): Record<string, string | number>[] {
  const empName = (id: string) => {
    const e = s.employees.find((x) => x.id === id);
    return e ? `${e.last_name} ${e.first_name}` : id;
  };
  return (s.attachments ?? []).map((a) => ({
    Salarie: empName(a.employee_id),
    Nature: a.kind,
    Fichier: a.filename,
    Taille: a.size,
    Depose_le: a.uploaded_at,
    Par: a.uploaded_by ?? "",
    Empreinte: a.sha256.slice(0, 12) + "…",
  }));
}

/* ---------------- Générateurs de formats ---------------- */

/** Construit un classeur .xlsx à partir de lignes-objets (en-têtes = clés). */
export function workbookBytes(rows: Record<string, string | number>[], sheet: string, title: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [[title], []];
  if (rows.length === 0) {
    aoa.push(["(aucune ligne)"]);
  } else {
    aoa.push(Object.keys(rows[0]));
    for (const r of rows) aoa.push(Object.values(r));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = Object.keys(rows[0] ?? { a: 1 }).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  // xlsx renvoie un ArrayBuffer avec type:'array' (pas un Uint8Array) : on enveloppe.
  const raw = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as unknown as ArrayBuffer | Uint8Array;
  return raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
}

/** Construit un PDF tabulaire simple (titre + tableau + pied). */
export function simpleTablePdf(title: string, subtitle: string, head: string[], body: (string | number)[][]): Uint8Array {
  const pal = DEFAULT_PALETTE;
  const landscape = head.length > 5;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  doc.setProperties({ title: pdfText(title) });
  doc.setFont("times", "bold").setFontSize(15).setTextColor(pal.deep[0], pal.deep[1], pal.deep[2]);
  doc.text(pdfText(title.toUpperCase()), 22, 22);
  doc.setDrawColor(pal.olive[0], pal.olive[1], pal.olive[2]).setLineWidth(0.8);
  doc.line(22, 25, 60, 25);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(pal.muted[0], pal.muted[1], pal.muted[2]);
  doc.text(pdfText(subtitle), 22, 31);
  autoTable(doc, {
    startY: 35,
    head: [head.map((h) => pdfText(h))],
    body: body.map((r) => r.map((c) => pdfText(String(c ?? "")))),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4, textColor: [...pal.ink], lineColor: [210, 214, 204], lineWidth: 0.12, overflow: "linebreak" },
    headStyles: { fillColor: [...pal.deep], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    margin: { left: 14, right: 14 },
    didDrawPage: (d) => {
      const total = doc.getNumberOfPages();
      doc.setFontSize(7).setTextColor(130, 130, 130);
      doc.text(pdfText(`Belkora Paie & RH — sauvegarde — p. ${d.pageNumber} / ${total}`), 14, doc.internal.pageSize.getHeight() - 8);
      doc.text(pdfText(new Date().toLocaleString("fr-FR")), doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    },
  });
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

function readmeText(m: BackupManifest): string {
  return [
    "BELKORA PAIE & RH — SAUVEGARDE DE LA BASE LOCALE",
    "=================================================",
    "",
    `Generee le : ${m.generated_at}`,
    `Perimetre  : ${m.scope.mode === "toutes" ? "toutes les societes" : `societe ${m.scope.firm_name ?? m.scope.firm_id}`}`,
    "",
    "CONTENU (sous-dossiers)",
    "  01_Societes      : societes (Societes.xlsx / .pdf / .json)",
    "  02_Salaries      : salaries (Salaries.xlsx / .pdf / .json)",
    "  03_Paie          : periodes + bulletins (Periodes.*, Bulletins.*)",
    "  04_Conges        : conges, avances, accidents (Conges.*, Avances.*, Accidents.*)",
    "  05_Comptabilite  : clotures comptables (Clotures.*)",
    "  06_Documents     : journal des documents (Journal.*)",
    "  07_Pieces        : pieces justificatives (metadonnees + Fichiers/ si presents sur ce poste)",
    "  99_Brut          : AppState.json (dump complet pour restauration)",
    "",
    "FORMATS",
    "  .pdf  : lecture, visa, impression (extrait mis en page, voir Excel pour l'integralite).",
    "  .xlsx : controle et archivage tableur (colonnes completes).",
    "  .json : donnees brutes reimportables (source de restauration).",
    "",
    "RESTAURATION",
    "  Le fichier 99_Brut/AppState.json contient l'etat applicatif (sans les binaires).",
    "  Pour restaurer : copier son contenu dans le stockage local (cle gca-paie-rh-state-v1)",
    "  depuis un poste autorise, puis recharger. Les binaires du dossier Fichiers/",
    "  sont a redeposer via le volet Pieces (ils ne se restaurent pas seuls).",
    "",
    "CONFIDENTIALITE",
    "  Archive sensible (RIB, CIN, salaires, hashes de mots de passe si inclus).",
    "  Ne pas diffuser par e-mail non chiffre. Conserver en lieu sur.",
    ...(m.missingBinaries.length
      ? ["", `BINAIRES ABSENTS (${m.missingBinaries.length}) : deposes depuis un autre poste, non telechargeables ici.`, ...m.missingBinaries.slice(0, 50).map((b) => `  - ${b.filename} (${b.reason})`)]
      : ["", "BINAIRES : tous les fichiers connus etaient presents sur ce poste, ou aucun binaire demande."]),
    "",
    ...m.notes.map((n) => `NOTE : ${n}`),
    "",
  ].join("\n");
}

/* ---------------- Assemblage du ZIP ---------------- */

export async function buildBackupZip(
  state: AppState,
  opts: BackupOptions = {},
): Promise<{ blob: Blob; filename: string; manifest: BackupManifest }> {
  const o: Required<BackupOptions> = {
    scopeFirmId: opts.scopeFirmId ?? null,
    includePdf: opts.includePdf ?? true,
    includeExcel: opts.includeExcel ?? true,
    includeJson: opts.includeJson ?? true,
    includeBinaries: opts.includeBinaries ?? true,
    includeUsers: opts.includeUsers ?? false,
    includeRaw: opts.includeRaw ?? true,
  };
  const s = filterStateForBackup(state, o.scopeFirmId);
  const at = new Date();
  const base = backupBaseName(at);
  const scopeFirm = o.scopeFirmId ? state.firms.find((f) => f.id === o.scopeFirmId) : undefined;

  const manifest: BackupManifest = {
    app: "Belkora Paie & RH — sauvegarde locale",
    generated_at: at.toISOString(),
    scope: o.scopeFirmId
      ? { mode: "societe", firm_id: o.scopeFirmId, firm_name: scopeFirm?.name }
      : { mode: "toutes" },
    formats: { pdf: o.includePdf, excel: o.includeExcel, json: o.includeJson, binaires: o.includeBinaries, utilisateurs: o.includeUsers },
    counts: {
      societes: s.firms.length,
      salaries: s.employees.length,
      periodes: s.periods.length,
      bulletins: s.payslips.length,
      conges: (s.leaves ?? []).length,
      avances: (s.salaryAdvances ?? []).length,
      accidents: (s.workAccidents ?? []).length,
      clotures: (s.accountingClosures ?? []).length,
      documents: (s.docGenerations ?? []).length,
      pieces: (s.attachments ?? []).length,
    },
    files: [],
    missingBinaries: [],
    notes: [
      "PDF = extrait de lecture (colonnes essentielles) ; Excel/JSON = integralite.",
      "Les taux et baremes vivent dans params.ts (referentiel), pas dans ce ZIP.",
      o.includeUsers
        ? "Comptes inclus avec empreintes SHA-256 (jamais de mot de passe en clair)."
        : "Comptes utilisateurs EXCLUS (option).",
    ],
  };

  const zip = new JSZip();
  const root = zip.folder(base);
  if (!root) throw new Error("Creation du ZIP impossible.");
  const put = (path: string, data: Uint8Array | string) => {
    root.file(path, data);
    manifest.files.push(`${base}/${path}`);
  };
  const stamp = `Genere le ${at.toLocaleString("fr-FR")} — ${manifest.scope.mode === "toutes" ? "toutes societes" : scopeFirm?.name ?? ""}`;

  // 01 Societes
  const fRows = firmsRows(s);
  if (o.includeJson) put("01_Societes/Societes.json", JSON.stringify(s.firms, null, 2));
  if (o.includeExcel) put("01_Societes/Societes.xlsx", workbookBytes(fRows, "Societes", `Societes — ${stamp}`));
  if (o.includePdf)
    put(
      "01_Societes/Societes.pdf",
      simpleTablePdf("Societes", stamp, ["Societe", "Regime", "ICE", "IF", "RC", "CNSS", "Ville"], fRows.map((r) => [r.Societe, r.Regime, r.ICE, r.IF, r.RC, r.CNSS, r.Ville])),
    );

  // 02 Salaries
  const eRows = employeesRows(s);
  if (o.includeJson) put("02_Salaries/Salaries.json", JSON.stringify(s.employees, null, 2));
  if (o.includeExcel) put("02_Salaries/Salaries.xlsx", workbookBytes(eRows, "Salaries", `Salaries — ${stamp}`));
  if (o.includePdf)
    put(
      "02_Salaries/Salaries.pdf",
      simpleTablePdf("Salaries", stamp, ["Societe", "Matricule", "Nom", "CIN", "CNSS", "Contrat", "Embauche", "Actif"], eRows.map((r) => [r.Societe, r.Matricule, r.Nom, r.CIN, r.CNSS, r.Contrat, r.Embauche, r.Actif])),
    );

  // 03 Paie
  const pRows = periodsRows(s);
  if (o.includeJson) {
    put("03_Paie/Periodes.json", JSON.stringify(s.periods, null, 2));
    put("03_Paie/Bulletins.json", JSON.stringify(s.payslips, null, 2));
  }
  if (o.includeExcel) {
    put("03_Paie/Periodes.xlsx", workbookBytes(pRows, "Periodes", `Periodes de paie — ${stamp}`));
    put(
      "03_Paie/Bulletins.xlsx",
      workbookBytes(
        s.payslips.map((b) => ({
          Periode: b.period_id,
          Salarie: b.employee_id,
          Brut: b.result?.salaireBrut ?? "",
          Net: b.result?.netAPayer ?? "",
          IR: b.result?.ir ?? "",
        })),
        "Bulletins",
        `Bulletins (montants figes) — ${stamp}`,
      ),
    );
  }
  if (o.includePdf)
    put("03_Paie/Periodes.pdf", simpleTablePdf("Periodes de paie", stamp, ["Societe", "Periode", "Statut", "Bulletins"], pRows.map((r) => [r.Societe, r.Periode, r.Statut, r.Bulletins])));

  // 04 Conges (+ avances, accidents)
  const cRows = leavesRows(s);
  if (o.includeJson) {
    put("04_Conges/Conges.json", JSON.stringify(s.leaves ?? [], null, 2));
    put("04_Conges/Avances.json", JSON.stringify(s.salaryAdvances ?? [], null, 2));
    put("04_Conges/Accidents.json", JSON.stringify(s.workAccidents ?? [], null, 2));
  }
  if (o.includeExcel) {
    put("04_Conges/Conges.xlsx", workbookBytes(cRows, "Conges", `Conges — ${stamp}`));
    put("04_Conges/Avances.xlsx", workbookBytes((s.salaryAdvances ?? []).map((a) => ({ Salarie: a.employee_id, Nature: a.kind, Montant: a.amount, Date: a.date })), "Avances", `Avances — ${stamp}`));
  }
  if (o.includePdf && cRows.length)
    put("04_Conges/Conges.pdf", simpleTablePdf("Conges", stamp, ["Salarie", "Type", "Debut", "Fin", "Jours"], cRows.map((r) => [r.Salarie, r.Type, r.Debut, r.Fin, r.Jours])));

  // 05 Comptabilite
  if (o.includeJson) put("05_Comptabilite/Clotures.json", JSON.stringify(s.accountingClosures ?? [], null, 2));
  if (o.includeExcel)
    put(
      "05_Comptabilite/Clotures.xlsx",
      workbookBytes((s.accountingClosures ?? []).map((c) => ({ Societe: c.firm_id, Periode: `${c.year}-${String(c.month).padStart(2, "0")}`, Validee_le: c.validated_at, Par: c.validated_by, Lignes: c.entries.reduce((n, e) => n + e.lines.length, 0) })), "Clotures", `Clotures comptables — ${stamp}`),
    );

  // 06 Documents (journal + declarations mensuelles derivees des periodes)
  const dRows = docEventsRows(s);
  if (o.includeJson) put("06_Documents/Journal.json", JSON.stringify(s.docGenerations ?? [], null, 2));
  if (o.includeExcel) put("06_Documents/Journal.xlsx", workbookBytes(dRows, "Journal", `Journal des documents — ${stamp}`));
  if (o.includePdf && dRows.length)
    put("06_Documents/Journal.pdf", simpleTablePdf("Journal des documents", stamp, ["Date", "Type", "Format", "Sujet", "Periode"], dRows.map((r) => [r.Date, r.Type, r.Format, r.Sujet, r.Periode])));

  // 07 Pieces (metadonnees + binaires locaux best-effort)
  const aRows = attachmentsRows(s);
  if (o.includeJson) {
    put("07_Pieces/Attachments.json", JSON.stringify(s.attachments ?? [], null, 2));
    put("07_Pieces/PayrollAttachments.json", JSON.stringify(s.payrollAttachments ?? [], null, 2));
  }
  if (o.includeExcel) put("07_Pieces/Attachments.xlsx", workbookBytes(aRows, "Pieces", `Pieces justificatives (metadonnees) — ${stamp}`));
  if (o.includePdf && aRows.length)
    put("07_Pieces/Attachments.pdf", simpleTablePdf("Pieces justificatives", stamp, ["Salarie", "Nature", "Fichier", "Taille", "Depose le"], aRows.map((r) => [r.Salarie, r.Nature, r.Fichier, r.Taille, r.Depose_le])));

  if (o.includeBinaries) {
    const wanted: { id: string; filename: string }[] = [
      ...(s.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename })),
      ...(s.payrollAttachments ?? []).map((p) => ({ id: p.id, filename: p.filename })),
      ...(s.docGenerations ?? []).filter((d) => d.archive).map((d) => ({ id: d.id, filename: d.archive!.filename })),
    ];
    let present: Set<string> = new Set();
    try {
      present = await localBinaryIds();
    } catch {
      present = new Set();
    }
    for (const w of wanted) {
      if (!present.has(w.id)) {
        manifest.missingBinaries.push({ id: w.id, filename: w.filename, reason: "absent de ce poste (depose ailleurs ou purge)" });
        continue;
      }
      try {
        const found = await getBinary(w.id);
        if (!found) {
          manifest.missingBinaries.push({ id: w.id, filename: w.filename, reason: "illisible sur ce poste" });
          continue;
        }
        const buf = new Uint8Array(await found.blob.arrayBuffer());
        const safe = sanitizeFilePart(w.filename.replace(/\.[a-zA-Z0-9]+$/, "")) + "_" + w.id.slice(-6);
        const ext = (w.filename.split(".").pop() ?? "bin").slice(0, 5).replace(/[^a-zA-Z0-9]/g, "");
        put(`07_Pieces/Fichiers/${safe}.${ext}`, buf);
      } catch (e) {
        manifest.missingBinaries.push({ id: w.id, filename: w.filename, reason: `erreur lecture : ${(e as Error).message}` });
      }
    }
    if (!wanted.length) manifest.notes.push("Aucun binaire a embarquer (aucune piece, ni archive sur le perimetre).");
  }

  // Utilisateurs (optionnel, hashes uniquement — jamais de clair dans l'app)
  if (o.includeUsers) {
    put("06_Documents/Utilisateurs.json", JSON.stringify(s.users ?? [], null, 2));
    if (o.includeExcel)
      put(
        "06_Documents/Utilisateurs.xlsx",
        workbookBytes((s.users ?? []).map((u) => ({ Identifiant: u.username, Nom: u.full_name ?? "", Role: u.role, Societe: u.firm_id ?? "toutes", Actif: u.is_active ? "oui" : "non" })), "Utilisateurs", `Comptes (sans mot de passe) — ${stamp}`),
      );
  }

  // 99 Brut (restauration)
  if (o.includeRaw) {
    const raw: AppState = o.includeUsers ? s : { ...s, users: [] };
    put("99_Brut/AppState.json", JSON.stringify(raw, null, 2));
  }

  put("00_Lisez-moi/manifest.json", JSON.stringify(manifest, null, 2));
  put("00_Lisez-moi/README.txt", readmeText(manifest));

  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob: out, filename: `${base}.zip`, manifest };
}
