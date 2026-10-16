/**
 * Volet « Salariés non déclarés » — suivi INTERNE, jamais déclaratif.
 *
 * - Liste les salariés SANS N° CNSS (volet Salariés fait foi : renseigner le
 *   N° CNSS y fait SORTIR le salarié d'ici, automatiquement).
 * - Suit des VERSEMENTS internes par entité et par période (brut/avance/net),
 *   avec reçus internes et totaux par entité — SANS alimenter BDS, livre
 *   art. 371, écritures ni IR 9421 (étanchéité vérifiée par test).
 */
import {
  AlertTriangle,
  FileDown,
  FileSpreadsheet,
  FileSignature,
  Plus,
  Receipt,
  Trash2,
  UserX,
} from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { actions, currentFirm, employeesOfFirm, uid, useStore } from "@/data/store";
import { useCanWrite, useSession } from "@/lib/auth";
import type { ContractType } from "@/data/types";
import { getParams } from "@/lib/params";
import { PinPrompt } from "@/components/PinPrompt";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Field, Input, Kpi, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { mad } from "@/lib/format";
import { YearSelect } from "@/components/YearSelect";
import {
  buildPayment, isNonDeclare, nonDeclaresOfFirm, paymentsOfNonDeclares,
  paymentPeriodLabel, quinzaineLabel, totalsByFirm, totalsOf, yearlyTotal,
} from "@/lib/non-declares";
import { PayrollAttachmentsPanel } from "@/components/PayrollAttachmentsPanel";
import {
  NON_DECLARE_MENTION, downloadPeriodCsv, downloadPeriodXlsx, downloadReceiptPdf,
} from "@/lib/non-declares-export";
import {
  buildEmargementLines, defaultEmargementNumero, downloadEmargementPdf,
} from "@/lib/emargement-export";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default function NonDeclares() {
  const s = useStore();
  const firm = currentFirm(s);
  const session = useSession();
  const canEdit = useCanWrite();

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [q, setQ] = useState("");
  const [empId, setEmpId] = useState("");
  const [jours, setJours] = useState(26);
  const [brut, setBrut] = useState(3000);
  const [avance, setAvance] = useState(0);
  const [mode, setMode] = useState<"especes" | "virement" | "cheque">("especes");
  const [section, setSection] = useState("OUVRIERS");
  const [note, setNote] = useState("");
  // Période suivie : mois entier ou quinzaine Q1 (1–15) / Q2 (16–fin) — TOUJOURS précisée.
  const [qFilter, setQFilter] = useState<"all" | "Q1" | "Q2">("all");
  const [qSaisie, setQSaisie] = useState<"mois" | "Q1" | "Q2">("mois");

  // Fiche d'émargement exportable — mêmes mentions que le modèle remis.
  const [ficheNo, setFicheNo] = useState("");
  const [quinzaine, setQuinzaine] = useState("");
  const [chantier, setChantier] = useState("");
  const [lieu, setLieu] = useState("");
  const [datePaiement, setDatePaiement] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    setFicheNo(defaultEmargementNumero(firm, year, month));
    setLieu(firm.city ?? "");
    if (qFilter !== "all") setQuinzaine(quinzaineLabel(year, month, qFilter));
  }, [firm, year, month, qFilter]);

  // Saisie directe d'un salarié non déclaré (sans N° CNSS — il reste donc ici).
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [matricule, setMatricule] = useState("");
  const [cin, setCin] = useState("");
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contract, setContract] = useState<ContractType>("CDD");
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [salaryTouched, setSalaryTouched] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const pinConfigured = !!firm.validation_pin_hash;

  const legalHours = getParams(new Date().getFullYear()).legalMonthlyHours;
  const smigMonthly = Math.round(
    (getParams(new Date().getFullYear()).smigHourly * legalHours + Number.EPSILON) * 100,
  ) / 100;
  const effectiveMonthly = !salaryTouched || monthlySalary <= 0 ? smigMonthly : monthlySalary;
  const hourlyRate = Math.round(((effectiveMonthly / legalHours) * 1e6)) / 1e6;

  const ndEmps = useMemo(() => nonDeclaresOfFirm(s, firm.id), [s, firm.id]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ndEmps;
    return ndEmps.filter((e) =>
      `${e.first_name} ${e.last_name} ${e.matricule ?? ""} ${e.cin ?? ""}`.toLowerCase().includes(needle),
    );
  }, [ndEmps, q]);

  // Périmètre du PROCESSUS : seuls les versements des salariés encore sans CNSS.
  // Un régularisé quitte complètement ce volet (son historique reste conservé).
  const pays = useMemo(() => paymentsOfNonDeclares(s, firm.id, year, month), [s, firm.id, year, month]);
  // Filtre quinzaine : mouvements et fiche suivent la période affichée, totaux restent mensuels.
  const paysFiltres = useMemo(
    () => (qFilter === "all" ? pays : pays.filter((p) => (p.quinzaine ?? "") === qFilter)),
    [pays, qFilter],
  );
  const periodTitle = qFilter === "all"
    ? `${String(month).padStart(2, "0")}/${year} (mois entier)`
    : `${String(month).padStart(2, "0")}/${year} · ${qFilter} — ${quinzaineLabel(year, month, qFilter)}`;
  const rows = useMemo(() => {
    const byId = new Map(employeesOfFirm(s, firm.id).map((e) => [e.id, e]));
    return paysFiltres
      .map((pay) => ({ pay, emp: byId.get(pay.employee_id) }))
      .filter((r): r is { pay: (typeof paysFiltres)[number]; emp: NonNullable<ReturnType<typeof byId.get>> } => !!r.emp);
  }, [paysFiltres, s, firm.id]);
  const tot = useMemo(() => totalsOf(pays), [pays]);
  const totYear = useMemo(() => yearlyTotal(s, firm.id, year), [s, firm.id, year]);
  const byFirm = useMemo(() => totalsByFirm(s, s.firms, year, month), [s, year, month]);
  const groupTot = useMemo(
    () => byFirm.reduce((a, t) => ({ brut: a.brut + t.brut, net: a.net + t.net, n: a.n + t.count }), { brut: 0, net: 0, n: 0 }),
    [byFirm],
  );

  function commitCreateEmployee() {
    if (!canEdit) return;
    if (!firstName.trim() || !lastName.trim()) return;
    actions.upsertEmployee({
      id: uid("emp"), firm_id: firm.id,
      first_name: firstName.trim(), last_name: lastName.trim(),
      matricule: matricule.trim() || undefined, cin: cin.trim() || undefined,
      hire_date: hireDate, contract_type: contract,
      base_hourly_rate: hourlyRate, monthly_hours: legalHours,
      dependents: 0, is_active: true,
      // PAS de cnss_number : c'est ce qui le maintient dans ce volet.
    });
    setFirstName(""); setLastName(""); setMatricule(""); setCin("");
    setSalaryTouched(false); setMonthlySalary(0);
    setPinOpen(false);
  }

  function onCreateEmployee() {
    if (!canEdit) return;
    if (!firstName.trim() || !lastName.trim()) return;
    if (pinConfigured) setPinOpen(true);
    else commitCreateEmployee();
  }

  function onAdd() {
    if (!canEdit || !empId) return;
    const emp = ndEmps.find((e) => e.id === empId);
    if (!emp || !isNonDeclare(emp)) return; // garde-fou : jamais un déclaré ici
    actions.upsertNonDeclarePayment(
      buildPayment({
        id: uid("ndp"), firm_id: firm.id, employee_id: empId, year, month,
        jours: Math.max(0, jours), brut_verse: Math.max(0, brut),
        avance_deduite: Math.max(0, avance), mode,
        section: section.trim() || "OUVRIERS",
        quinzaine: qSaisie === "mois" ? undefined : qSaisie,
        periode: qSaisie === "mois" ? undefined : quinzaineLabel(year, month, qSaisie),
        note: note.trim() || undefined,
        created_at: new Date().toISOString(), created_by: session?.username,
      }),
    );
    setEmpId(""); setNote("");
  }

  function onEmargement() {
    const emps = employeesOfFirm(s, firm.id);
    const lines = buildEmargementLines(emps, paysFiltres);
    void downloadEmargementPdf({
      firm, numero: ficheNo.trim() || defaultEmargementNumero(firm, year, month),
      quinzaine: quinzaine.trim() || (qFilter === "all" ? "" : quinzaineLabel(year, month, qFilter)),
      chantier: chantier.trim(), lieu: lieu.trim(),
      datePaiement, year, month, lines,
    });
  }

  return (
    <div>
      <PageHeader
        title="Salariés non déclarés"
        subtitle={`${firm.name} — suivi interne · période affichée : ${periodTitle} · sans CNSS = ici, avec CNSS = paie normale`}
      >
        <Button variant="outline" onClick={() => downloadPeriodCsv(firm, rows, year, month)}>
          <FileDown size={16} /> CSV
        </Button>
        <Button variant="outline" onClick={() => downloadPeriodXlsx(firm, rows, year, month, byFirm)}>
          <FileSpreadsheet size={16} /> Excel
        </Button>
      </PageHeader>

      <Card className="mb-4 border-warning/40">
        <CardContent className="flex items-start gap-3 pt-5 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <p>
            <strong>{NON_DECLARE_MENTION}.</strong> Ce volet organise la régularisation : renseigner le N° CNSS
            dans <Link to="/employees" className="underline">Salariés</Link> fait sortir le salarié d'ici et le
            fait entrer en paie normale — il quitte alors COMPLÈTEMENT ce processus (effectif,
            mouvements, totaux, fiche), son historique restant conservé. Ces versements n'alimentent
            jamais la BDS DAMANCOM, le livre de paie, les écritures ni l'état IR.
          </p>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Année"><YearSelect value={year} onChange={setYear} /></Field>
        <Field label="Mois">
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} className="w-full sm:w-40">
            {MONTHS.map((m, i) => (<option key={m} value={String(i + 1)}>{m}</option>))}
          </Select>
        </Field>
        <Field label="Recherche">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, matricule, CIN…" className="w-full sm:w-64" />
        </Field>
        <Field label="Période (quinzaines)">
          <Select value={qFilter} onChange={(e) => setQFilter(e.target.value as typeof qFilter)} className="w-full sm:w-64">
            <option value="all">Mois entier — Q1 + Q2</option>
            <option value="Q1">Q1 — {quinzaineLabel(year, month, "Q1")}</option>
            <option value="Q2">Q2 — {quinzaineLabel(year, month, "Q2")}</option>
          </Select>
        </Field>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Effectif non déclaré" value={String(ndEmps.length)} sub={`${firm.name} · sans N° CNSS`} icon={<UserX size={18} />} accent="gold" />
        <Kpi label="Net versé (mois)" value={mad(tot.net)} sub={`${tot.count} versement(s) · ${String(month).padStart(2, "0")}/${year}`} />
        <Kpi label="Brut versé (mois)" value={mad(tot.brut)} sub={`Avances déduites : ${mad(tot.avances)}`} />
        <Kpi label="Cumul annuel entité" value={mad(totYear.net)} sub={`${totYear.count} versement(s) en ${year}`} accent="sage" />
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Salariés suivis ici — {filtered.length}</CardTitle></CardHeader>
        <Table wide>
          <thead><tr><Th>Matricule</Th><Th>Nom</Th><Th>Embauche</Th><Th>Contrat</Th><Th>Régulariser</Th></tr></thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <Td className="num">{e.matricule ?? "—"}</Td>
                <Td>{e.first_name} {e.last_name} <span className="text-xs text-muted-foreground">· CIN {e.cin ?? "—"}</span></Td>
                <Td className="num">{e.hire_date}</Td>
                <Td><Badge tone="warning">{e.contract_type}</Badge></Td>
                <Td><Link to="/employees" className="text-sm underline">Renseigner le N° CNSS</Link></Td>
              </tr>
            ))}
            {filtered.length === 0 && (<tr><Td colSpan={5} className="py-8 text-center text-muted-foreground">Aucun salarié sans N° CNSS dans cette entité. La paie normale couvre tout l'effectif.</Td></tr>)}
          </tbody>
        </Table>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Saisir un salarié non déclaré — {firm.name}</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Création directe sans N° CNSS : le salarié apparaît aussitôt ci-dessus et reste hors paie normale
            jusqu'à sa régularisation (volet Salariés → N° CNSS). Salaire prérempli au SMIG ({mad(smigMonthly)}).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Prénom *"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Nom *"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Matricule"><Input value={matricule} onChange={(e) => setMatricule(e.target.value)} placeholder="Auto si vide" disabled={!canEdit} /></Field>
            <Field label="CIN"><Input value={cin} onChange={(e) => setCin(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Date d'embauche"><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Contrat">
              <Select value={contract} onChange={(e) => setContract(e.target.value as ContractType)} disabled={!canEdit}>
                <option value="CDD">CDD</option>
                <option value="CDI">CDI</option>
                <option value="ANAPEC">ANAPEC</option>
                <option value="Interim">Intérim</option>
                <option value="Stagiaire">Stagiaire</option>
              </Select>
            </Field>
            <Field label="Salaire mensuel (DH)" hint={`SMIG ${mad(smigMonthly)} · ${hourlyRate}/h`}>
              <Input
                type="number" min={0} value={salaryTouched ? monthlySalary : smigMonthly}
                onChange={(e) => { setMonthlySalary(Number(e.target.value)); setSalaryTouched(true); }}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Heures mensuelles"><Input value={legalHours} disabled /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={onCreateEmployee} disabled={!canEdit || !firstName.trim() || !lastName.trim()}>
              <Plus size={16} /> Créer le salarié (sans CNSS)
            </Button>
            {!canEdit && <span className="text-xs text-muted-foreground">Lecture seule : saisie désactivée.</span>}
            {pinConfigured && canEdit && (
              <span className="text-xs text-muted-foreground">Le code de validation à 4 chiffres sera demandé.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {pinOpen && (
        <PinPrompt
          firm={firm}
          title="Créer le salarié non déclaré"
          action="Créer"
          onSuccess={commitCreateEmployee}
          onClose={() => setPinOpen(false)}
        />
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Saisir un versement — {periodTitle}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Quinzaine" hint={qSaisie === "mois" ? "Mois entier" : quinzaineLabel(year, month, qSaisie)}>
              <Select value={qSaisie} onChange={(e) => setQSaisie(e.target.value as typeof qSaisie)} disabled={!canEdit}>
                <option value="mois">Mois entier</option>
                <option value="Q1">Q1 (1–15)</option>
                <option value="Q2">Q2 (16–fin)</option>
              </Select>
            </Field>
            <Field label="Salarié (sans CNSS)">
              <Select value={empId} onChange={(e) => setEmpId(e.target.value)} disabled={!canEdit}>
                <option value="">— Choisir —</option>
                {ndEmps.map((e) => (<option key={e.id} value={e.id}>{e.matricule ?? ""} · {e.first_name} {e.last_name}</option>))}
              </Select>
            </Field>
            <Field label="Jours"><Input type="number" min={0} max={31} value={jours} onChange={(e) => setJours(Number(e.target.value))} disabled={!canEdit} /></Field>
            <Field label="Brut versé (DH)"><Input type="number" min={0} value={brut} onChange={(e) => setBrut(Number(e.target.value))} disabled={!canEdit} /></Field>
            <Field label="Avance déduite (DH)"><Input type="number" min={0} value={avance} onChange={(e) => setAvance(Number(e.target.value))} disabled={!canEdit} /></Field>
            <Field label="Mode">
              <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} disabled={!canEdit}>
                <option value="especes">Espèces</option>
                <option value="virement">Virement</option>
                <option value="cheque">Chèque</option>
              </Select>
            </Field>
            <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionnel" disabled={!canEdit} /></Field>
            <Field label="Section / équipe" hint="Reprise telle quelle sur la fiche d'émargement."><Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="OUVRIERS" disabled={!canEdit} /></Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={onAdd} disabled={!canEdit || !empId}>Ajouter le versement (net auto : {mad(Math.max(0, brut - avance))})</Button>
            {!canEdit && <span className="text-xs text-muted-foreground">Lecture seule : saisie désactivée.</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Mouvements — {firm.name} · {periodTitle}</CardTitle></CardHeader>
        <Table wide>
          <thead><tr><Th>Salarié</Th><Th>Période</Th><Th>Jours</Th><Th>Brut</Th><Th>Avance</Th><Th>Net remis</Th><Th>Mode</Th><Th>Reçu</Th><Th /></tr></thead>
          <tbody>
            {rows.map(({ emp, pay }) => (
              <tr key={pay.id}>
                <Td>{emp.first_name} {emp.last_name} <span className="text-xs text-muted-foreground">· {emp.matricule ?? ""}</span></Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{paymentPeriodLabel(pay)}</Td>
                <Td className="num">{pay.jours}</Td>
                <Td className="num">{mad(pay.brut_verse)}</Td>
                <Td className="num">{mad(pay.avance_deduite ?? 0)}</Td>
                <Td className="num font-semibold">{mad(pay.net_verse)}</Td>
                <Td>{pay.mode}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => void downloadReceiptPdf(firm, emp, pay, {
                  numero: ficheNo.trim() || defaultEmargementNumero(firm, year, month),
                  quinzaine: quinzaine.trim(), chantier: chantier.trim(),
                  lieu: lieu.trim(), datePaiement,
                })}><Receipt size={14} /> Reçu</Button></Td>
                <Td>{canEdit && (<Button size="sm" variant="ghost" onClick={() => actions.removeNonDeclarePayment(pay.id)} title="Supprimer"><Trash2 size={14} /></Button>)}</Td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><Td colSpan={9} className="py-8 text-center text-muted-foreground">Aucun versement sur {periodTitle}.</Td></tr>)}
          </tbody>
        </Table>
      </Card>

      <div className="mb-6">
        <PayrollAttachmentsPanel
          firmId={firm.id} year={year} month={month}
          kinds={["emargement_signee", "mise_a_disposition"]}
          verseNet={tot.net}
        />
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Fiche d'émargement — {firm.name} · {periodTitle}</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Export PDF identique au modèle remis, limité à la période affichée ({periodTitle}).
            Sans versement sur la période, un salarié sans CNSS y figure en « Néant ».
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="N° fiche"><Input value={ficheNo} onChange={(e) => setFicheNo(e.target.value)} /></Field>
            <Field label="Période (quinzaine)"><Input value={quinzaine} onChange={(e) => setQuinzaine(e.target.value)} placeholder="du 20/09/2026 au 03/10/2026" /></Field>
            <Field label="Chantier"><Input value={chantier} onChange={(e) => setChantier(e.target.value)} placeholder="Travaux exterieur - Sidi Yahya" /></Field>
            <Field label="Lieu de paiement"><Input value={lieu} onChange={(e) => setLieu(e.target.value)} /></Field>
            <Field label="Date de paiement"><Input type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} /></Field>
          </div>
          <div className="mt-3">
            <Button onClick={onEmargement}><FileSignature size={16} /> Fiche d'émargement (PDF)</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Totaux par entité — {String(month).padStart(2, "0")}/{year} (groupe)</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>Entité</Th><Th className="text-center">Effectif ND</Th><Th className="text-center">Versements</Th><Th className="text-center">Brut mois</Th><Th className="text-center">Net mois</Th></tr></thead>
          <tbody>
            {byFirm.map((t) => (
              <tr key={t.firm_id}>
                <Td>{t.firm_name}</Td>
                <Td className="num text-center">{t.effectifND}</Td>
                <Td className="num text-center">{t.count}</Td>
                <Td className="num text-center">{mad(t.brut)}</Td>
                <Td className="num text-center font-semibold">{mad(t.net)}</Td>
              </tr>
            ))}
            <tr>
              <Td><strong>GROUPE</strong></Td>
              <Td className="num text-center"><strong>{byFirm.reduce((a, t) => a + t.effectifND, 0)}</strong></Td>
              <Td className="num text-center"><strong>{groupTot.n}</strong></Td>
              <Td className="num text-center"><strong>{mad(groupTot.brut)}</strong></Td>
              <Td className="num text-center"><strong>{mad(groupTot.net)}</strong></Td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
