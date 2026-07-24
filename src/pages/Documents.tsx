import { useMemo, useRef, useState } from "react";
import {
  FileSignature,
  FileDown,
  Printer,
  AlertTriangle,
  ShieldCheck,
  BadgeCheck,
  FileText,
  Gavel,
  DoorOpen,
  Baby,
  Languages,
  Camera,
} from "lucide-react";
import { useStore, currentFirm, employeesOfFirm } from "@/data/store";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Field,
  Input,
  Select,
  Textarea,
  PageHeader,
  Table,
  Th,
  Td,
} from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { firmDescriptor, firmLegalLine } from "@/lib/firm-legal";
import { paletteForFirm } from "@/lib/brand-color";
import type { Employee, Firm } from "@/data/types";
import { LegalDocPreview } from "@/components/LegalDocPreview";
import {
  RH_DOC_TYPES,
  bodyParagraphs,
  missingFields,
  exportRhDocPdf,
  openRhDocHtml,
  DOC_TITLE,
  type RhDocType,
  type Civility,
  type RhDocView,
} from "@/lib/rh-documents";
import {
  CONTRACT_MODELS,
  CONTRACT_PROJECTS,
  buildContractDoc,
  contractMissingFields,
  contractPrefilled,
  exportContractPdf,
  openContractHtml,
  type ContractModel,
  type RhContractView,
} from "@/lib/rh-contracts";
import {
  DISCIPLINE_TYPES,
  buildDisciplineDoc,
  disciplineMissingFields,
  disciplinePrefilled,
  exportDisciplinePdf,
  openDisciplineHtml,
  type DisciplineType,
  type RhDisciplineView,
} from "@/lib/rh-discipline";
import {
  RUPTURE_TYPES,
  buildRuptureDoc,
  ruptureMissingFields,
  rupturePrefilled,
  exportRupturePdf,
  openRuptureHtml,
  type RuptureType,
  type RhRuptureView,
  type StcBreakdown,
} from "@/lib/rh-rupture";
import {
  computeStc,
  DEPARTURE_REASONS,
  type DepartureReason,
  type EmployeeCategory,
  type StcResult,
} from "@/lib/stc-engine";
import { mad, num } from "@/lib/format";
import { exportElementToPdf, previewFileName } from "@/lib/preview-export";
import { useT, type TKey } from "@/lib/i18n";
import { Calculator, Wallet } from "lucide-react";
import {
  MINEUR_TYPES,
  buildMineurDoc,
  mineurMissingFields,
  mineurPrefilled,
  exportMineurPdf,
  openMineurHtml,
  type MineurType,
  type MineurLang,
  type RhMineurView,
} from "@/lib/rh-mineurs";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ================================================================= salarié hors liste (ad-hoc) ================================================================= */

interface ManualEmp {
  first_name: string; last_name: string; cin: string; cnss_number: string;
  position: string; hire_date: string; birth_date: string; address: string; site: string;
}
const EMPTY_MANUAL: ManualEmp = {
  first_name: "", last_name: "", cin: "", cnss_number: "", position: "",
  hire_date: "", birth_date: "", address: "", site: "",
};

/** Construit un Employee VALIDE en mémoire à partir d'une saisie manuelle (jamais persisté au store).
 *  Champs vides → undefined ⇒ le document affiche un pointillé (zéro invention). */
function adHocEmployee(firmId: string, m: ManualEmp): Employee {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    id: "__manual__",
    firm_id: firmId,
    first_name: m.first_name.trim(),
    last_name: m.last_name.trim(),
    cin: clean(m.cin),
    cnss_number: clean(m.cnss_number),
    position: clean(m.position),
    hire_date: m.hire_date || "",
    birth_date: m.birth_date || undefined,
    address: clean(m.address),
    site: clean(m.site),
    contract_type: "CDI",
    base_hourly_rate: 0,
    monthly_hours: 191,
    dependents: 0,
    is_active: true,
  };
}

/**
 * Source du salarié pour un document : soit un salarié de la liste (store), soit un salarié
 * NON ENREGISTRÉ saisi à la main. Renvoie l'objet `employee` (réel ou ad-hoc) + le `node` à
 * afficher en tête du formulaire. Le salarié ad-hoc n'est jamais ajouté au store.
 */
function useEmployeeSource(firm: Firm, employees: Employee[]): { employee: Employee; node: React.ReactNode } {
  const t = useT();
  const [manual, setManual] = useState(false);
  const [empId, setEmpId] = useState<string>(employees[0]?.id ?? "");
  const [m, setM] = useState<ManualEmp>(EMPTY_MANUAL);
  const setMf = (patch: Partial<ManualEmp>) => setM((x) => ({ ...x, ...patch }));

  const useManual = manual || employees.length === 0; // sans salarié en base : saisie manuelle forcée
  const employee: Employee = useManual
    ? adHocEmployee(firm.id, m)
    : (employees.find((e) => e.id === empId) ?? employees[0]);

  const node = (
    <>
      <Field label={t("doc.employee")}>
        <Select
          value={useManual ? "__manual__" : empId}
          onChange={(e) => {
            if (e.target.value === "__manual__") setManual(true);
            else { setManual(false); setEmpId(e.target.value); }
          }}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}{e.position ? ` · ${e.position}` : ""}{e.is_active ? "" : " (sorti)"}
            </option>
          ))}
          <option value="__manual__">{t("doc.manual.option")}</option>
        </Select>
      </Field>

      {useManual && (
        <div className="rounded-md border border-primary/30 bg-accent/30 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BadgeCheck size={13} className="text-primary" /> {t("doc.manual.title")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("emp.firstName")}><Input value={m.first_name} onChange={(e) => setMf({ first_name: e.target.value })} /></Field>
            <Field label={t("emp.lastName")}><Input value={m.last_name} onChange={(e) => setMf({ last_name: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("emp.cin")}><Input value={m.cin} onChange={(e) => setMf({ cin: e.target.value })} /></Field>
            <Field label={t("doc.cnss")} hint={t("doc.manual.cnss.hint")}><Input value={m.cnss_number} onChange={(e) => setMf({ cnss_number: e.target.value })} /></Field>
          </div>
          <Field label={t("emp.position")}><Input value={m.position} onChange={(e) => setMf({ position: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("doc.hireDate")}><Input type="date" value={m.hire_date} onChange={(e) => setMf({ hire_date: e.target.value })} /></Field>
            <Field label={t("emp.birth")}><Input type="date" value={m.birth_date} onChange={(e) => setMf({ birth_date: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("emp.site")}><Input value={m.site} onChange={(e) => setMf({ site: e.target.value })} /></Field>
            <Field label={t("doc.manual.address")}><Input value={m.address} onChange={(e) => setMf({ address: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </>
  );

  return { employee, node };
}

/* ================================================================= composants transverses ================================================================= */

function MissingCard({ missing }: { missing: string[] }) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <Card className="border-warning/40">
      <CardContent className="pt-5">
        <div className="flex items-start gap-2.5 text-sm">
          <AlertTriangle size={17} className="text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">
              {missing.length} {t(missing.length > 1 ? "doc.missing.title.many" : "doc.missing.title.one")}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {t("doc.missing.note")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Badge key={m} tone="warning">{m}</Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PrefilledCard({ rows }: { rows: { label: string; value: string }[] }) {
  const t = useT();
  return (
    <Card className="border-sage/40">
      <CardContent className="pt-5">
        <div className="flex items-start gap-2.5 text-sm">
          <BadgeCheck size={17} className="text-sage shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t("doc.prefilled.title")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rows.map((r) => (
                <Badge key={r.label} tone="sage">
                  {r.label} : {r.value}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegalNotice() {
  const t = useT();
  return (
    <Card className="border-primary/30 bg-accent/40">
      <CardContent className="pt-4">
        <div className="flex items-start gap-2.5 text-[13px]">
          <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">{t("doc.legalNote")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================= page ================================================================= */

type Tab = "attestations" | "contrat" | "discipline" | "rupture" | "mineurs";

const TABS: { id: Tab; labelKey: TKey; icon: typeof FileSignature }[] = [
  { id: "attestations", labelKey: "docs.tab.attestations", icon: FileSignature },
  { id: "contrat", labelKey: "docs.tab.contrat", icon: FileText },
  { id: "discipline", labelKey: "docs.tab.discipline", icon: Gavel },
  { id: "rupture", labelKey: "docs.tab.rupture", icon: DoorOpen },
  { id: "mineurs", labelKey: "docs.tab.mineurs", icon: Baby },
];

const SUBTITLE_KEY: Record<Tab, TKey> = {
  attestations: "docs.sub.attestations",
  contrat: "docs.sub.contrat",
  discipline: "docs.sub.discipline",
  rupture: "docs.sub.rupture",
  mineurs: "docs.sub.mineurs",
};

export default function Documents() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const employees = useMemo(() => employeesOfFirm(s, firm.id), [s, firm.id]);
  const [tab, setTab] = useState<Tab>("attestations");

  return (
    <div>
      <PageHeader title={t("page.documents.title")} subtitle={t(SUBTITLE_KEY[tab])} />

      {/* Barre d'onglets */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={16} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {tab === "attestations" ? (
        <AttestationsPanel firm={firm} employees={employees} />
      ) : tab === "contrat" ? (
        <ContractPanel firm={firm} employees={employees} />
      ) : tab === "discipline" ? (
        <DisciplinePanel firm={firm} employees={employees} />
      ) : tab === "rupture" ? (
        <RupturePanel firm={firm} employees={employees} />
      ) : (
        <MineurPanel firm={firm} />
      )}
    </div>
  );
}

/* ================================================================= 1) Attestations (famille A existante) ================================================================= */

function AttestationsPanel({ firm, employees }: { firm: Firm; employees: Employee[] }) {
  const { employee, node: employeeNode } = useEmployeeSource(firm, employees);
  const [type, setType] = useState<RhDocType>("attestation-travail");
  const [civility, setCivility] = useState<Civility>(null);
  const [hireDate, setHireDate] = useState<string>("");
  const [cnss, setCnss] = useState<string>("");
  const [salary, setSalary] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [city, setCity] = useState<string>("");
  const [signatoryName, setSignatoryName] = useState<string>("");
  const [signatoryRole, setSignatoryRole] = useState<string>("");
  // Champs spécifiques à l'attestation de stage
  const [stageStart, setStageStart] = useState<string>("");
  const [stageType, setStageType] = useState<string>("Stage de fin d'études (PFE)");
  const [formation, setFormation] = useState<string>("");
  const [stageDuration, setStageDuration] = useState<string>("");
  const [stageMissions, setStageMissions] = useState<string>("");
  const [stageOngoing, setStageOngoing] = useState<boolean>(true);

  const t = useT();
  const isStage = type === "attestation-stage";

  const view: RhDocView = {
    firm,
    employee,
    type,
    civility,
    hireDate: hireDate || undefined,
    cnss: cnss || undefined,
    salary: salary || undefined,
    endDate: endDate || undefined,
    issueDate,
    city: city || undefined,
    signatoryName: signatoryName || undefined,
    signatoryRole: signatoryRole || undefined,
    stageStart: stageStart || undefined,
    stageType: stageType || undefined,
    formation: formation || undefined,
    stageDuration: stageDuration || undefined,
    stageMissions: stageMissions || undefined,
    stageOngoing,
  };

  const missing = missingFields(view);
  const paras = bodyParagraphs(view);
  const pal = paletteForFirm(firm.brand_color); // aperçu aux couleurs de la société (comme l'export)
  const previewRef = useRef<HTMLDivElement>(null);
  const exportPreview = () =>
    previewRef.current && exportElementToPdf(previewRef.current, previewFileName(DOC_TITLE[type], `${employee.first_name}_${employee.last_name}`));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature size={17} className="text-primary" /> {t("doc.params")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t("doc.type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as RhDocType)}>
              {RH_DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </Select>
          </Field>

          {employeeNode}

          <Field label={t("doc.civility")} hint={t("doc.civility.hint")}>
            <Select value={civility ?? ""} onChange={(e) => setCivility((e.target.value || null) as Civility)}>
              <option value="">{t("doc.notSpecified")}</option>
              <option value="M.">{t("doc.mr")}</option>
              <option value="Mme">{t("doc.mrs")}</option>
            </Select>
          </Field>

          {!isStage && (
            <>
              <Field label={t("doc.hireDate")} hint={employee.hire_date ? `${t("doc.hint.fileLabel")} : ${employee.hire_date}` : t("doc.hint.absentToFill")}>
                <Input type="date" value={hireDate || employee.hire_date || ""} onChange={(e) => setHireDate(e.target.value)} />
              </Field>

              <Field label={t("doc.cnss")} hint={employee.cnss_number ? t("doc.hint.fromFile") : t("doc.hint.absentPlaceholder")}>
                <Input value={cnss || employee.cnss_number || ""} onChange={(e) => setCnss(e.target.value)} placeholder="Ex. 123456789" />
              </Field>
            </>
          )}

          {type === "attestation-salaire" && (
            <Field label={t("doc.salary")} hint={t("doc.salary.hint")}>
              <Input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Ex. 4 500,00 DH net" />
            </Field>
          )}

          {type === "certificat-travail" && (
            <Field label={t("doc.contractEnd")}>
              <Input type="date" value={endDate || employee.contract_end || ""} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          )}

          {isStage && (
            <>
              <Field label={t("doc.stage.type")} hint={t("doc.stage.type.hint")}>
                <Input value={stageType} onChange={(e) => setStageType(e.target.value)} placeholder="Stage de fin d'études (PFE)" />
              </Field>

              <Field label={t("doc.stage.formation")}>
                <Input value={formation} onChange={(e) => setFormation(e.target.value)} placeholder="Ex. Master en Business Administration" />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("doc.stage.start")}>
                  <Input type="date" value={stageStart} onChange={(e) => setStageStart(e.target.value)} />
                </Field>
                <Field label={t("doc.stage.duration")}>
                  <Input value={stageDuration} onChange={(e) => setStageDuration(e.target.value)} placeholder="Ex. six (6) mois" />
                </Field>
              </div>

              <Field label={t("doc.stage.status")}>
                <Select
                  value={stageOngoing ? "ongoing" : "done"}
                  onChange={(e) => setStageOngoing(e.target.value === "ongoing")}
                >
                  <option value="ongoing">{t("doc.stage.ongoing")}</option>
                  <option value="done">{t("doc.stage.done")}</option>
                </Select>
              </Field>

              {!stageOngoing && (
                <Field label={t("doc.stage.end")}>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Field>
              )}

              <Field
                label={t("doc.stage.missions")}
                hint="Texte inséré après « … s'est vu confier ». Ex. « le périmètre People & Performance et contribue activement… »"
              >
                <Textarea
                  value={stageMissions}
                  onChange={(e) => setStageMissions(e.target.value)}
                  placeholder="s'est vu confier le périmètre… Elle fait preuve de sérieux, d'autonomie…"
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("doc.issueCity")}>
              <Input value={city || firm.city || ""} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label={t("doc.issueDate")}>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("doc.signatory")}>
              <Input value={signatoryName || firm.signatory_name || ""} onChange={(e) => setSignatoryName(e.target.value)} placeholder={t("doc.signatory.ph")} />
            </Field>
            <Field label={t("doc.role")}>
              <Input value={signatoryRole || firm.signatory_role || ""} onChange={(e) => setSignatoryRole(e.target.value)} placeholder={t("doc.role.ph")} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => openRhDocHtml(view)}>
              <Printer size={16} /> {t("btn.html")}
            </Button>
            <Button className="flex-1" onClick={() => exportRhDocPdf(view)}>
              <FileDown size={16} /> {t("btn.pdf")}
            </Button>
            <Button variant="sage" className="w-full" onClick={exportPreview}>
              <Camera size={16} /> {t("doc.exportPreview")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <MissingCard missing={missing} />
        <Card>
          <CardHeader>
            <CardTitle>{t("doc.preview")} — {DOC_TITLE[type]}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={previewRef} className="mx-auto max-w-[640px] rounded-md border bg-white shadow-sm px-9 py-8" style={{ color: pal.inkHex }}>
              <div className="flex items-center gap-4 border-b-2 pb-3" style={{ borderColor: pal.oliveHex }}>
                <img src={firm.logo_path || "/logo-miya.png"} alt="logo" className="h-11 w-auto object-contain" />
                <div>
                  <div className="font-bold text-[15px]">
                    {firm.name.toUpperCase()}
                    {firmDescriptor(firm) && <span className="font-normal text-neutral-500"> — {firmDescriptor(firm)}</span>}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {firmLegalLine(firm, { includeAddress: true, sep: " · " })}
                  </div>
                </div>
              </div>

              <div className="my-6 flex justify-center">
                <div className="border-[1.4px] rounded px-7 py-2 font-bold tracking-wide text-[16px]" style={{ borderColor: pal.oliveHex }}>
                  {DOC_TITLE[type]}
                </div>
              </div>

              <div className="text-[13.5px] leading-[1.85] text-justify space-y-3">
                {paras.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              <div className="mt-10 text-right text-[13.5px]">
                Fait à {(city || firm.city || "……").trim()}, le {new Date(issueDate).toLocaleDateString("fr-FR")}.
              </div>
              <div className="mt-4 text-right">
                <div className="font-bold text-[13.5px]">{(signatoryName || firm.signatory_name || "……").trim()}</div>
                <div className="text-[12px] text-neutral-500">{(signatoryRole || firm.signatory_role || "……").trim()}</div>
                <div className="text-[11px] text-neutral-400 mt-1.5">(Signature et cachet)</div>
              </div>

              {firmLegalLine(firm) && (
                <div className="mt-8 border-t border-neutral-200 pt-2 text-center text-[9px] text-neutral-400">
                  {firmLegalLine(firm)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================= 2) Contrat RH ================================================================= */

function ContractPanel({ firm, employees }: { firm: Firm; employees: Employee[] }) {
  const t = useT();
  const { employee, node: employeeNode } = useEmployeeSource(firm, employees);
  const [model, setModel] = useState<ContractModel>("cdd-chef");
  const [civility, setCivility] = useState<Civility>(null);
  const [projectKey, setProjectKey] = useState<string>("gotion");
  const [projectLabel, setProjectLabel] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [birthPlace, setBirthPlace] = useState<string>("");
  const [nationality, setNationality] = useState<string>("Marocaine");
  const [address, setAddress] = useState<string>("");
  const [cin, setCin] = useState<string>("");
  const [cnss, setCnss] = useState<string>("");
  const [jobTitle, setJobTitle] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dailyWage, setDailyWage] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [issueCity, setIssueCity] = useState<string>("");
  const [signatoryName, setSignatoryName] = useState<string>("");
  const [signatoryRole, setSignatoryRole] = useState<string>("");

  const customProject = projectKey === "custom";

  const view: RhContractView = {
    firm,
    employee,
    model,
    civility,
    projectKey: customProject ? undefined : projectKey,
    projectLabel: customProject ? projectLabel || undefined : undefined,
    location: customProject ? location || undefined : undefined,
    jurisdiction: customProject ? jurisdiction || undefined : undefined,
    birthDate: birthDate || undefined,
    birthPlace: birthPlace || undefined,
    nationality: nationality || undefined,
    address: address || undefined,
    cin: cin || undefined,
    cnss: cnss || undefined,
    jobTitle: jobTitle || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    dailyWage: dailyWage || undefined,
    issueDate,
    issueCity: issueCity || undefined,
    signatoryName: signatoryName || undefined,
    signatoryRole: signatoryRole || undefined,
  };

  const doc = buildContractDoc(view);
  const missing = contractMissingFields(view);
  const prefilled = contractPrefilled(view);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportPreview = () =>
    previewRef.current && exportElementToPdf(previewRef.current, previewFileName(doc.fileTitle, `${employee.first_name}_${employee.last_name}`));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={17} className="text-primary" /> {t("doc.params.contract")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Modèle de contrat">
            <Select value={model} onChange={(e) => setModel(e.target.value as ContractModel)}>
              {CONTRACT_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          {employeeNode}

          <Field label="Projet / chantier">
            <Select value={projectKey} onChange={(e) => setProjectKey(e.target.value)}>
              {Object.entries(CONTRACT_PROJECTS).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Autre (saisie libre)…</option>
            </Select>
          </Field>

          {customProject && (
            <>
              <Field label="Libellé du projet">
                <Input value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} placeholder="Ex. Projet Casablanca Marina" />
              </Field>
              <Field label="Lieu d'exécution">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Aïn Sebaâ (province de Casablanca)" />
              </Field>
              <Field label="Juridiction compétente">
                <Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="TPI de …, section sociale" />
              </Field>
            </>
          )}

          <Field label="Civilité">
            <Select value={civility ?? ""} onChange={(e) => setCivility((e.target.value || null) as Civility)}>
              <option value="">Non précisé</option>
              <option value="M.">Monsieur</option>
              <option value="Mme">Madame</option>
            </Select>
          </Field>

          <Field label="Poste (intitulé au contrat)" hint={employee.position ? `Dossier : ${employee.position}` : "À préciser"}>
            <Input value={jobTitle || employee.position || ""} onChange={(e) => setJobTitle(e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CIN" hint={employee.cin ? "Repris du dossier" : "Absent — placeholder"}>
              <Input value={cin || employee.cin || ""} onChange={(e) => setCin(e.target.value)} />
            </Field>
            <Field label="N° CNSS" hint={employee.cnss_number ? "Repris du dossier" : "Absent — placeholder"}>
              <Input value={cnss || employee.cnss_number || ""} onChange={(e) => setCnss(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date de naissance" hint={employee.birth_date ? "Repris du dossier" : "Absente — placeholder"}>
              <Input type="date" value={birthDate || employee.birth_date || ""} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
            <Field label="Lieu de naissance">
              <Input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="Ex. Marrakech" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nationalité">
              <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
            </Field>
            <Field label="Adresse du salarié">
              <Input value={address || employee.address || ""} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date de début">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            {model === "cdd-chef" && (
              <Field label="Date de fin">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            )}
          </div>

          <Field
            label="Salaire journalier brut (DH)"
            hint={model === "travail-determine" ? "Vide → SMIG (17,92 DH/h) par défaut" : "Ex. 250,00"}
          >
            <Input value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} placeholder="Ex. 250,00" />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fait à (ville)">
              <Input value={issueCity} onChange={(e) => setIssueCity(e.target.value)} placeholder="Auto (lieu d'exécution)" />
            </Field>
            <Field label="Date">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signataire">
              <Input value={signatoryName || firm.signatory_name || ""} onChange={(e) => setSignatoryName(e.target.value)} />
            </Field>
            <Field label="Qualité">
              <Input value={signatoryRole || firm.signatory_role || ""} onChange={(e) => setSignatoryRole(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => openContractHtml(view)}>
              <Printer size={16} /> HTML
            </Button>
            <Button className="flex-1" onClick={() => exportContractPdf(view)}>
              <FileDown size={16} /> PDF
            </Button>
            <Button variant="sage" className="w-full" onClick={exportPreview}>
              <Camera size={16} /> {t("doc.exportPreview")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <LegalNotice />
        <PrefilledCard rows={prefilled} />
        <MissingCard missing={missing} />
        <Card>
          <CardHeader>
            <CardTitle>{t("doc.preview")} — {doc.heading}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={previewRef}>
              <LegalDocPreview firm={firm} doc={doc} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================= 3) Kit disciplinaire RH ================================================================= */

function DisciplinePanel({ firm, employees }: { firm: Firm; employees: Employee[] }) {
  const t = useT();
  const { employee, node: employeeNode } = useEmployeeSource(firm, employees);
  const [type, setType] = useState<DisciplineType>("avertissement");
  const [civility, setCivility] = useState<Civility>(null);
  const [jobTitle, setJobTitle] = useState<string>("");
  const [site, setSite] = useState<string>("");
  const [cin, setCin] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [faultDate, setFaultDate] = useState<string>("");
  const [faultFacts, setFaultFacts] = useState<string>("");
  const [delivery, setDelivery] = useState<"main-propre" | "lrar" | "">("");
  const [mAbsence, setMAbsence] = useState(false);
  const [mRefus, setMRefus] = useState(false);
  const [mConsignes, setMConsignes] = useState(false);
  const [consignesText, setConsignesText] = useState<string>("");
  const [deadline, setDeadline] = useState<string>("");
  const [layoffDays, setLayoffDays] = useState<string>("");
  const [layoffStart, setLayoffStart] = useState<string>("");
  const [auditionDate, setAuditionDate] = useState<string>("");
  const [auditionTime, setAuditionTime] = useState<string>("");
  const [auditionPlace, setAuditionPlace] = useState<string>("");
  const [priorSanctions, setPriorSanctions] = useState<string>("");
  const [effectDate, setEffectDate] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [issueCity, setIssueCity] = useState<string>("");
  const [signatoryName, setSignatoryName] = useState<string>("");
  const [signatoryRole, setSignatoryRole] = useState<string>("");

  const isMED = type === "mise-en-demeure";
  const showFacts = type !== "convocation" && type !== "mise-en-demeure";
  const showIdentity = type === "mise-en-demeure" || type === "decision-licenciement";

  const view: RhDisciplineView = {
    firm,
    employee,
    type,
    civility,
    jobTitle: jobTitle || undefined,
    site: site || undefined,
    cin: cin || undefined,
    address: address || undefined,
    faultDate: faultDate || undefined,
    faultFacts: faultFacts || undefined,
    delivery: delivery || undefined,
    mAbsence,
    mRefus,
    mConsignes,
    consignesText: consignesText || undefined,
    deadline: deadline || undefined,
    layoffDays: layoffDays || undefined,
    layoffStart: layoffStart || undefined,
    auditionDate: auditionDate || undefined,
    auditionTime: auditionTime || undefined,
    auditionPlace: auditionPlace || undefined,
    priorSanctions: priorSanctions || undefined,
    effectDate: effectDate || undefined,
    issueDate,
    issueCity: issueCity || undefined,
    signatoryName: signatoryName || undefined,
    signatoryRole: signatoryRole || undefined,
  };

  const doc = buildDisciplineDoc(view);
  const missing = disciplineMissingFields(view);
  const prefilled = disciplinePrefilled(view);
  const current = DISCIPLINE_TYPES.find((t) => t.value === type)!;
  const previewRef = useRef<HTMLDivElement>(null);
  const exportPreview = () =>
    previewRef.current && exportElementToPdf(previewRef.current, previewFileName(doc.fileTitle, `${employee.first_name}_${employee.last_name}`));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel size={17} className="text-primary" /> {t("doc.params.sanction")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Type de document" hint={`Échelle légale — degré ${current.degree} · ${current.hint}`}>
            <Select value={type} onChange={(e) => setType(e.target.value as DisciplineType)}>
              {DISCIPLINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.degree}. {t.label}
                </option>
              ))}
            </Select>
          </Field>

          {employeeNode}

          <Field label="Civilité">
            <Select value={civility ?? ""} onChange={(e) => setCivility((e.target.value || null) as Civility)}>
              <option value="">Non précisé</option>
              <option value="M.">Monsieur</option>
              <option value="Mme">Madame</option>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fonction" hint={employee.position ? "Repris du dossier" : "À préciser"}>
              <Input value={jobTitle || employee.position || ""} onChange={(e) => setJobTitle(e.target.value)} />
            </Field>
            <Field label="Chantier / site" hint={employee.site ? "Repris du dossier" : "À préciser"}>
              <Input value={site || employee.site || ""} onChange={(e) => setSite(e.target.value)} />
            </Field>
          </div>

          {showIdentity && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="CIN" hint={employee.cin ? "Repris du dossier" : "Absent — placeholder"}>
                <Input value={cin || employee.cin || ""} onChange={(e) => setCin(e.target.value)} />
              </Field>
              <Field label="Adresse">
                <Input value={address || employee.address || ""} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            </div>
          )}

          <Field label={isMED ? "Date de début du manquement" : "Date du manquement"}>
            <Input type="date" value={faultDate} onChange={(e) => setFaultDate(e.target.value)} />
          </Field>

          {showFacts && (
            <Field label="Faits reprochés" hint="Nature, date, lieu, conséquences — jamais inventés">
              <Textarea value={faultFacts} onChange={(e) => setFaultFacts(e.target.value)} placeholder="Décrire précisément les faits constatés…" />
            </Field>
          )}

          {isMED && (
            <div className="rounded-md border border-input p-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Nature du manquement</span>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mAbsence} onChange={(e) => setMAbsence(e.target.checked)} /> Absence / abandon de poste
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mRefus} onChange={(e) => setMRefus(e.target.checked)} /> Refus d'exécuter les tâches
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mConsignes} onChange={(e) => setMConsignes(e.target.checked)} /> Non-respect de consignes
              </label>
              {mConsignes && (
                <Input value={consignesText} onChange={(e) => setConsignesText(e.target.value)} placeholder="Préciser les consignes…" />
              )}
              <Field label="Délai de reprise">
                <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="48 h (recommandé)" />
              </Field>
            </div>
          )}

          {type === "mise-a-pied" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Durée (jours, ≤ 8)">
                <Input value={layoffDays} onChange={(e) => setLayoffDays(e.target.value)} placeholder="Ex. 3" />
              </Field>
              <Field label="Date d'effet">
                <Input type="date" value={layoffStart} onChange={(e) => setLayoffStart(e.target.value)} />
              </Field>
            </div>
          )}

          {type === "convocation" && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Date de l'entretien">
                  <Input type="date" value={auditionDate} onChange={(e) => setAuditionDate(e.target.value)} />
                </Field>
                <Field label="Heure">
                  <Input value={auditionTime} onChange={(e) => setAuditionTime(e.target.value)} placeholder="Ex. 10 h 00" />
                </Field>
              </div>
              <Field label="Lieu de l'entretien" hint="Vide → siège de l'entité">
                <Input value={auditionPlace} onChange={(e) => setAuditionPlace(e.target.value)} placeholder={firm.address || ""} />
              </Field>
            </>
          )}

          {type === "decision-licenciement" && (
            <>
              <Field label="Sanctions antérieures notifiées" hint="Rappel de l'historique disciplinaire">
                <Textarea value={priorSanctions} onChange={(e) => setPriorSanctions(e.target.value)} placeholder="Ex. avertissement du 12/05, blâme du 03/06…" />
              </Field>
              <Field label="Date d'effet du licenciement">
                <Input type="date" value={effectDate} onChange={(e) => setEffectDate(e.target.value)} />
              </Field>
            </>
          )}

          <Field label="Mode de remise">
            <Select value={delivery} onChange={(e) => setDelivery(e.target.value as "main-propre" | "lrar" | "")}>
              <option value="">À cocher sur le document</option>
              <option value="main-propre">Remise en main propre contre décharge</option>
              <option value="lrar">Lettre recommandée avec A.R.</option>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fait à (ville)">
              <Input value={issueCity || firm.city || ""} onChange={(e) => setIssueCity(e.target.value)} />
            </Field>
            <Field label="Date">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signataire">
              <Input value={signatoryName || firm.signatory_name || ""} onChange={(e) => setSignatoryName(e.target.value)} />
            </Field>
            <Field label="Qualité">
              <Input value={signatoryRole || firm.signatory_role || ""} onChange={(e) => setSignatoryRole(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => openDisciplineHtml(view)}>
              <Printer size={16} /> HTML
            </Button>
            <Button className="flex-1" onClick={() => exportDisciplinePdf(view)}>
              <FileDown size={16} /> PDF
            </Button>
            <Button variant="sage" className="w-full" onClick={exportPreview}>
              <Camera size={16} /> {t("doc.exportPreview")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <LegalNotice />
        <PrefilledCard rows={prefilled} />
        <MissingCard missing={missing} />
        <Card>
          <CardHeader>
            <CardTitle>{t("doc.preview")} — {doc.heading}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={previewRef}>
              <LegalDocPreview firm={firm} doc={doc} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================= 4) Kit rupture RH ================================================================= */

function RupturePanel({ firm, employees }: { firm: Firm; employees: Employee[] }) {
  const t = useT();
  const { employee, node: employeeNode } = useEmployeeSource(firm, employees);
  const [type, setType] = useState<RuptureType>("pv-fin-travaux");
  const [civility, setCivility] = useState<Civility>(null);
  const [jobTitle, setJobTitle] = useState<string>("");
  const [site, setSite] = useState<string>("");
  const [cin, setCin] = useState<string>("");
  const [cnss, setCnss] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [lieuExecution, setLieuExecution] = useState<string>("");
  const [objetTravaux, setObjetTravaux] = useState<string>("");
  const [constatDate, setConstatDate] = useState<string>("");
  const [effectDate, setEffectDate] = useState<string>("");
  const [autresSommes, setAutresSommes] = useState<string>("");
  const [contractStart, setContractStart] = useState<string>("");
  const [contractEnd, setContractEnd] = useState<string>("");
  const [netAmount, setNetAmount] = useState<string>("");
  const [chefChantier, setChefChantier] = useState<string>("");
  // ---- Reçu (modèle MBD) : correspondances des pointillés / cases ----
  const [birthDate, setBirthDate] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"" | "virement" | "cheque" | "especes">("");
  const [chequeNumber, setChequeNumber] = useState<string>("");

  // ---- Calcul automatique du solde de tout compte (STC) ----
  const [stcOn, setStcOn] = useState<boolean>(false);
  const [reason, setReason] = useState<DepartureReason>("fin_travail_determine");
  const [category, setCategory] = useState<EmployeeCategory>("non_cadre");
  const [monthlyGross, setMonthlyGross] = useState<string>("");
  const [daysWorked, setDaysWorked] = useState<string>("26");
  const [workingDays, setWorkingDays] = useState<string>("26");
  const [leaveDays, setLeaveDays] = useState<string>("");
  const [preavisDispensed, setPreavisDispensed] = useState<boolean>(false);
  const [abusive, setAbusive] = useState<boolean>(false);
  const [cddTotal, setCddTotal] = useState<string>("");
  const [otherDeductions, setOtherDeductions] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [issueCity, setIssueCity] = useState<string>("");
  const [signatoryName, setSignatoryName] = useState<string>("");
  const [signatoryRole, setSignatoryRole] = useState<string>("");

  const isPV = type === "pv-fin-travaux";
  const isAccord = type === "accord-amiable";
  const isRecu = type === "recu-solde";

  // Salaire brut mensuel de référence : saisi, sinon dérivé du dossier (taux horaire × heures).
  const refGross = monthlyGross.trim()
    ? Number(monthlyGross.replace(",", "."))
    : Math.round(employee.base_hourly_rate * employee.monthly_hours * 100) / 100;

  const stcResult: StcResult | null = useMemo(() => {
    if (!isRecu || !stcOn) return null;
    if (!contractStart || !contractEnd || !(refGross > 0)) return null;
    return computeStc({
      year: new Date(contractEnd).getFullYear() || new Date().getFullYear(),
      reason,
      category,
      monthlyGrossRef: refGross,
      hireDate: contractStart,
      endDate: contractEnd,
      daysWorkedLastMonth: Number(daysWorked) || 0,
      workingDaysLastMonth: Number(workingDays) || 26,
      accruedLeaveDays: leaveDays.trim() === "" ? null : Number(leaveDays.replace(",", ".")),
      preavisDispensed,
      abusive,
      cddTotalGross: cddTotal.trim() ? Number(cddTotal.replace(",", ".")) : 0,
      dependents: employee.dependents ?? 0,
      otherDeductions: otherDeductions.trim() ? Number(otherDeductions.replace(",", ".")) : 0,
    });
  }, [isRecu, stcOn, contractStart, contractEnd, refGross, reason, category, daysWorked, workingDays, leaveDays, preavisDispensed, abusive, cddTotal, otherDeductions, employee.dependents]);

  const stcBreakdown: StcBreakdown | undefined = stcResult
    ? {
        lines: stcResult.lines.map((l) => ({ label: l.label, amount: l.gross })),
        grossTotal: stcResult.grossTotal,
        cnss: stcResult.cnssSalarie,
        amo: stcResult.amoSalarie,
        ir: stcResult.ir,
        otherDeductions: stcResult.otherDeductions,
        net: stcResult.netAPayer,
      }
    : undefined;

  const view: RhRuptureView = {
    firm,
    employee,
    type,
    civility,
    jobTitle: jobTitle || undefined,
    site: site || undefined,
    cin: cin || undefined,
    cnss: cnss || undefined,
    address: address || undefined,
    lieuExecution: lieuExecution || undefined,
    objetTravaux: objetTravaux || undefined,
    constatDate: constatDate || undefined,
    effectDate: effectDate || undefined,
    autresSommes: autresSommes || undefined,
    contractStart: contractStart || undefined,
    contractEnd: contractEnd || undefined,
    netAmount: netAmount || undefined,
    stc: stcBreakdown,
    chefChantier: chefChantier || undefined,
    birthDate: birthDate || undefined,
    reference: reference || undefined,
    departureReason: reason, // coche « Nature du contrat » + « Motif de la rupture »
    paymentMode: paymentMode || undefined,
    chequeNumber: chequeNumber || undefined,
    issueDate,
    issueCity: issueCity || undefined,
    signatoryName: signatoryName || undefined,
    signatoryRole: signatoryRole || undefined,
  };

  const doc = buildRuptureDoc(view);
  const missing = ruptureMissingFields(view);
  const prefilled = rupturePrefilled(view);
  const current = RUPTURE_TYPES.find((t) => t.value === type)!;
  const previewRef = useRef<HTMLDivElement>(null);
  const exportPreview = () =>
    previewRef.current && exportElementToPdf(previewRef.current, previewFileName(doc.fileTitle, `${employee.first_name}_${employee.last_name}`));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DoorOpen size={17} className="text-primary" /> {t("doc.params")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Type de document" hint={`${current.article} · ${current.hint}`}>
            <Select value={type} onChange={(e) => setType(e.target.value as RuptureType)}>
              {RUPTURE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          {employeeNode}

          {isAccord && (
            <Field label="Civilité">
              <Select value={civility ?? ""} onChange={(e) => setCivility((e.target.value || null) as Civility)}>
                <option value="">Non précisé</option>
                <option value="M.">Monsieur</option>
                <option value="Mme">Madame</option>
              </Select>
            </Field>
          )}

          <Field label="Chantier / site" hint={employee.site ? "Repris du dossier" : "À préciser"}>
            <Input value={site || employee.site || ""} onChange={(e) => setSite(e.target.value)} />
          </Field>

          {isRecu && (
            <Field label="Fonction" hint={employee.position ? "Repris du dossier" : "À préciser"}>
              <Input value={jobTitle || employee.position || ""} onChange={(e) => setJobTitle(e.target.value)} />
            </Field>
          )}

          {(isAccord || isRecu) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="CIN" hint={employee.cin ? "Repris du dossier" : "Absent — placeholder"}>
                <Input value={cin || employee.cin || ""} onChange={(e) => setCin(e.target.value)} />
              </Field>
              {isRecu ? (
                <Field label="N° CNSS" hint={employee.cnss_number ? "Repris du dossier" : "Absent — placeholder"}>
                  <Input value={cnss || employee.cnss_number || ""} onChange={(e) => setCnss(e.target.value)} />
                </Field>
              ) : (
                <Field label="Adresse">
                  <Input value={address || employee.address || ""} onChange={(e) => setAddress(e.target.value)} />
                </Field>
              )}
            </div>
          )}

          {isPV && (
            <>
              <Field label="Lieu d'exécution">
                <Input value={lieuExecution} onChange={(e) => setLieuExecution(e.target.value)} placeholder="Adresse du chantier" />
              </Field>
              <Field label="Objet des travaux achevés" hint="Décrire l'ouvrage réalisé — jamais inventé">
                <Textarea value={objetTravaux} onChange={(e) => setObjetTravaux(e.target.value)} placeholder="Ex. aménagement paysager de la tranche…" />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Date d'achèvement">
                  <Input type="date" value={constatDate} onChange={(e) => setConstatDate(e.target.value)} />
                </Field>
                <Field label="Chef de chantier">
                  <Input value={chefChantier} onChange={(e) => setChefChantier(e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {isAccord && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Date d'effet de la rupture">
                <Input type="date" value={effectDate} onChange={(e) => setEffectDate(e.target.value)} />
              </Field>
              <Field label="Autres sommes dues" hint="Optionnel">
                <Input value={autresSommes} onChange={(e) => setAutresSommes(e.target.value)} placeholder="Ex. indemnité…" />
              </Field>
            </div>
          )}

          {isRecu && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Début du contrat">
                  <Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
                </Field>
                <Field label="Fin du contrat">
                  <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Date de naissance" hint={employee.birth_date ? "Repris du dossier" : "Absente — placeholder"}>
                  <Input type="date" value={birthDate || employee.birth_date || ""} onChange={(e) => setBirthDate(e.target.value)} />
                </Field>
                <Field label="Adresse du salarié" hint={employee.address ? "Repris du dossier" : "Absente — placeholder"}>
                  <Input value={address || employee.address || ""} onChange={(e) => setAddress(e.target.value)} />
                </Field>
              </div>

              <Field label="Référence reçu" hint="Complète « STC-AAAA-… »">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex. 042" />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Mode de règlement" hint="Coche « Réglé par » sur le reçu">
                  <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as "" | "virement" | "cheque" | "especes")}>
                    <option value="">À cocher sur le document</option>
                    <option value="virement">Virement bancaire</option>
                    <option value="cheque">Chèque</option>
                    <option value="especes">Espèces</option>
                  </Select>
                </Field>
                {paymentMode === "cheque" && (
                  <Field label="N° de chèque">
                    <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="Ex. 1234567" />
                  </Field>
                )}
              </div>

              {/* Bascule : calcul automatique du STC ou saisie manuelle du net. */}
              <label className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-accent/40 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stcOn}
                  onChange={(e) => setStcOn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-[13px]">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calculator size={14} className="text-primary" /> Calcul automatique du solde de tout compte
                  </span>
                  <span className="text-muted-foreground">
                    Préavis (art. 43), indemnité de licenciement (art. 52-53), congés (art. 231),
                    CNSS/AMO/IR — décompte injecté dans le reçu.
                  </span>
                </span>
              </label>

              {stcOn ? (
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                  <Field label="Motif de départ" hint={DEPARTURE_REASONS.find((r) => r.value === reason)?.hint}>
                    <Select value={reason} onChange={(e) => setReason(e.target.value as DepartureReason)}>
                      {DEPARTURE_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Catégorie">
                      <Select value={category} onChange={(e) => setCategory(e.target.value as EmployeeCategory)}>
                        <option value="non_cadre">Non-cadre (ouvrier/employé)</option>
                        <option value="cadre">Cadre</option>
                      </Select>
                    </Field>
                    <Field label="Salaire brut mensuel de réf. (DH)" hint={monthlyGross.trim() ? undefined : `Dérivé du dossier : ${num(refGross)}`}>
                      <Input value={monthlyGross} onChange={(e) => setMonthlyGross(e.target.value)} placeholder={num(refGross)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Jours travaillés (dernier mois)">
                      <Input value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} />
                    </Field>
                    <Field label="Jours ouvrables du mois">
                      <Input value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Jours de congés acquis non pris" hint="Vide = estimé depuis l'ancienneté">
                    <Input value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)} placeholder="Ex. 12" />
                  </Field>
                  {reason === "fin_cdd" && (
                    <Field label="Total brut perçu pendant le CDD (DH)" hint="Base de l'indemnité de fin de CDD (7 %)">
                      <Input value={cddTotal} onChange={(e) => setCddTotal(e.target.value)} placeholder="Ex. 45 600" />
                    </Field>
                  )}
                  <div className="flex flex-col gap-2">
                    {(reason === "licenciement" || reason === "rupture_amiable") && (
                      <label className="flex items-center gap-2 text-[13px] text-foreground">
                        <input type="checkbox" checked={preavisDispensed} onChange={(e) => setPreavisDispensed(e.target.checked)} className="h-4 w-4 accent-primary" />
                        Préavis dispensé par l'employeur (→ indemnité compensatrice)
                      </label>
                    )}
                    {(reason === "licenciement" || reason === "faute_grave") && (
                      <label className="flex items-center gap-2 text-[13px] text-foreground">
                        <input type="checkbox" checked={abusive} onChange={(e) => setAbusive(e.target.checked)} className="h-4 w-4 accent-primary" />
                        Licenciement abusif (→ dommages-intérêts art. 41)
                      </label>
                    )}
                  </div>
                  <Field label="Autres retenues (avances, prêts…) DH" hint="Optionnel">
                    <Input value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} placeholder="0" />
                  </Field>
                </div>
              ) : (
                <Field label="Net payé (DH)" hint="Montant reçu — saisi manuellement. Activez le calcul auto pour la décomposition.">
                  <Input value={netAmount} onChange={(e) => setNetAmount(e.target.value)} placeholder="Ex. 4 250,00" />
                </Field>
              )}
            </>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fait à (ville)">
              <Input value={issueCity || firm.city || ""} onChange={(e) => setIssueCity(e.target.value)} />
            </Field>
            <Field label="Date">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signataire">
              <Input value={signatoryName || firm.signatory_name || ""} onChange={(e) => setSignatoryName(e.target.value)} />
            </Field>
            <Field label="Qualité">
              <Input value={signatoryRole || firm.signatory_role || ""} onChange={(e) => setSignatoryRole(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => openRuptureHtml(view)}>
              <Printer size={16} /> HTML
            </Button>
            <Button className="flex-1" onClick={() => exportRupturePdf(view)}>
              <FileDown size={16} /> PDF
            </Button>
            <Button variant="sage" className="w-full" onClick={exportPreview}>
              <Camera size={16} /> {t("doc.exportPreview")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <LegalNotice />
        <PrefilledCard rows={prefilled} />
        {isRecu && stcOn && <StcResultCard result={stcResult} />}
        <MissingCard missing={missing} />
        <Card>
          <CardHeader>
            <CardTitle>{t("doc.preview")} — {doc.heading}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={previewRef}>
              <LegalDocPreview firm={firm} doc={doc} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Décompte détaillé du solde de tout compte (calcul automatique). */
function StcResultCard({ result }: { result: StcResult | null }) {
  if (!result) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Renseignez le <span className="font-medium text-foreground">début</span> et la{" "}
          <span className="font-medium text-foreground">fin du contrat</span> (et un salaire de référence)
          pour lancer le calcul automatique du solde de tout compte.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet size={17} className="text-primary" /> Solde de tout compte — décompte
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge tone="sage">Ancienneté : {num(result.seniorityYears)} ans</Badge>
          <Badge tone="sage">Taux horaire : {num(result.hourlyRate)} DH</Badge>
          <Badge tone="sage">Taux journalier : {num(result.dailyRate)} DH</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Poste</Th>
                <Th>Base</Th>
                <Th className="text-right">Brut (DH)</Th>
                <Th className="text-right">Régime</Th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.key}>
                  <Td className="font-medium">{l.label}{l.detail ? <span className="block text-[11px] text-muted-foreground">{l.detail}</span> : null}</Td>
                  <Td className="text-muted-foreground">{l.article}</Td>
                  <Td className="text-right tabular-nums">{num(l.gross)}</Td>
                  <Td className="text-right">
                    <Badge tone={l.taxable ? "warning" : "sage"}>{l.taxable ? "imposable" : "exonéré"}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
          <Row label="Total brut" value={mad(result.grossTotal)} strong />
          <Row label="dont part exonérée" value={mad(result.exonereTotal)} muted />
          <Row label="dont part imposable" value={mad(result.taxableTotal)} muted />
          <div className="my-1 border-t" />
          <Row label="CNSS salariale (4,48 %, plaf. 6 000)" value={`– ${num(result.cnssSalarie)}`} />
          <Row label="AMO salariale (2,26 %)" value={`– ${num(result.amoSalarie)}`} />
          <Row label={`IR (tranche ${(result.irMarginalRate * 100).toFixed(0)} %)`} value={`– ${num(result.ir)}`} />
          {result.otherDeductions > 0 && <Row label="Autres retenues" value={`– ${num(result.otherDeductions)}`} />}
          <div className="my-1 border-t" />
          <Row label="NET À PAYER" value={mad(result.netAPayer)} strong accent />
        </div>

        {result.notes.length > 0 && (
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            {result.notes.map((n, i) => (
              <li key={i} className="flex gap-1.5"><span className="text-warning">•</span>{n}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong, muted, accent }: { label: string; value: string; strong?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", muted && "text-muted-foreground text-[13px]", strong && "font-semibold")}>
      <span>{label}</span>
      <span className={cn("tabular-nums", accent && "text-primary text-base")}>{value}</span>
    </div>
  );
}

/* ================================================================= 5) Kit mineurs RH (FR / AR) ================================================================= */

function MineurPanel({ firm }: { firm: Firm }) {
  const t = useT();
  const [type, setType] = useState<MineurType>("autorisation");
  const [lang, setLang] = useState<MineurLang>("fr");
  const [issueCity, setIssueCity] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [signatoryName, setSignatoryName] = useState<string>("");
  const [signatoryRole, setSignatoryRole] = useState<string>("");

  const view: RhMineurView = {
    firm,
    type,
    issueDate,
    issueCity: issueCity || undefined,
    signatoryName: signatoryName || undefined,
    signatoryRole: signatoryRole || undefined,
  };
  const doc = buildMineurDoc(view);
  const missing = mineurMissingFields(view);
  const prefilled = mineurPrefilled(view);
  const current = MINEUR_TYPES.find((t) => t.value === type)!;
  const previewRef = useRef<HTMLDivElement>(null);
  const exportPreview = () =>
    previewRef.current && exportElementToPdf(previewRef.current, previewFileName(doc.fileTitle, `${firm.name}_${lang}`));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Baby size={17} className="text-primary" /> {t("doc.params")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Type de document" hint={`${current.article} · ${current.hint}`}>
            <Select value={type} onChange={(e) => setType(e.target.value as MineurType)}>
              {MINEUR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Langue du document">
            <div className="flex gap-1 rounded-md border border-input p-1">
              {(["fr", "ar"] as MineurLang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {l === "fr" ? "Français" : "العربية"}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fait à (ville)">
              <Input value={issueCity || firm.city || ""} onChange={(e) => setIssueCity(e.target.value)} />
            </Field>
            <Field label="Date">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signataire">
              <Input value={signatoryName || firm.signatory_name || ""} onChange={(e) => setSignatoryName(e.target.value)} />
            </Field>
            <Field label="Qualité">
              <Input value={signatoryRole || firm.signatory_role || ""} onChange={(e) => setSignatoryRole(e.target.value)} />
            </Field>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-input bg-muted/40 p-3 text-xs text-muted-foreground">
            <Languages size={14} className="mt-0.5 shrink-0" />
            <span>
              Le PDF direct est en <b>français</b>. Pour l'<b>arabe</b> (RTL), cliquez « Ouvrir (AR) » puis
              « Imprimer / Enregistrer en PDF » du navigateur — l'arabe s'y affiche correctement.
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => openMineurHtml(view, "fr")}>
              <Printer size={16} /> Ouvrir (FR)
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => openMineurHtml(view, "ar")}>
              <Printer size={16} /> Ouvrir (AR)
            </Button>
            <Button className="flex-1" onClick={() => exportMineurPdf(view)}>
              <FileDown size={16} /> PDF (FR)
            </Button>
            <Button variant="sage" className="w-full" onClick={exportPreview}>
              <Camera size={16} /> {t("doc.exportPreview")} ({lang === "ar" ? "AR" : "FR"})
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <LegalNotice />
        <PrefilledCard rows={prefilled} />
        <MissingCard missing={missing} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages size={15} className="text-primary" /> {t("doc.preview")} — {lang === "ar" ? "العربية" : "Français"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={previewRef}>
              <LegalDocPreview firm={firm} doc={doc} lang={lang} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
