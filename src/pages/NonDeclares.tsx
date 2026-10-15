/**
 * Volet « Salariés non déclarés » — suivi INTERNE, jamais déclaratif.
 *
 * - Liste les salariés SANS N° CNSS (volet Salariés fait foi : renseigner le
 *   N° CNSS y fait SORTIR le salarié d'ici, automatiquement).
 * - Suit des VERSEMENTS internes par entité et par période (brut/avance/net),
 *   avec reçus internes et totaux par entité — SANS alimenter BDS, livre
 *   art. 371, écritures ni IR 9421 (étanchéité vérifiée par test).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileDown, FileSpreadsheet, Receipt, Trash2, UserX } from "lucide-react";
import { actions, currentFirm, employeesOfFirm, uid, useStore } from "@/data/store";
import { useCanWrite, useSession } from "@/lib/auth";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Field, Input, Kpi, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { mad } from "@/lib/format";
import { YearSelect } from "@/components/YearSelect";
import {
  buildPayment, isNonDeclare, nonDeclaresOfFirm, paymentsOfFirmPeriod,
  totalsByFirm, totalsOf, yearlyTotal,
} from "@/lib/non-declares";
import {
  NON_DECLARE_MENTION, downloadPeriodCsv, downloadPeriodXlsx, downloadReceiptPdf,
} from "@/lib/non-declares-export";

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
  const [note, setNote] = useState("");

  const ndEmps = useMemo(() => nonDeclaresOfFirm(s, firm.id), [s, firm.id]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ndEmps;
    return ndEmps.filter((e) =>
      `${e.first_name} ${e.last_name} ${e.matricule ?? ""} ${e.cin ?? ""}`.toLowerCase().includes(needle),
    );
  }, [ndEmps, q]);

  const pays = useMemo(() => paymentsOfFirmPeriod(s, firm.id, year, month), [s, firm.id, year, month]);
  const rows = useMemo(() => {
    const byId = new Map(employeesOfFirm(s, firm.id).map((e) => [e.id, e]));
    return pays
      .map((pay) => ({ pay, emp: byId.get(pay.employee_id) }))
      .filter((r): r is { pay: (typeof pays)[number]; emp: NonNullable<ReturnType<typeof byId.get>> } => !!r.emp);
  }, [pays, s, firm.id]);
  const tot = useMemo(() => totalsOf(pays), [pays]);
  const totYear = useMemo(() => yearlyTotal(s, firm.id, year), [s, firm.id, year]);
  const byFirm = useMemo(() => totalsByFirm(s, s.firms, year, month), [s, year, month]);
  const groupTot = useMemo(
    () => byFirm.reduce((a, t) => ({ brut: a.brut + t.brut, net: a.net + t.net, n: a.n + t.count }), { brut: 0, net: 0, n: 0 }),
    [byFirm],
  );

  function onAdd() {
    if (!canEdit || !empId) return;
    const emp = ndEmps.find((e) => e.id === empId);
    if (!emp || !isNonDeclare(emp)) return; // garde-fou : jamais un déclaré ici
    actions.upsertNonDeclarePayment(
      buildPayment({
        id: uid("ndp"), firm_id: firm.id, employee_id: empId, year, month,
        jours: Math.max(0, jours), brut_verse: Math.max(0, brut),
        avance_deduite: Math.max(0, avance), mode, note: note.trim() || undefined,
        created_at: new Date().toISOString(), created_by: session?.username,
      }),
    );
    setEmpId(""); setNote("");
  }

  return (
    <div>
      <PageHeader
        title="Salariés non déclarés"
        subtitle={`${firm.name} — suivi interne ${String(month).padStart(2, "0")}/${year} · sans CNSS = ici, avec CNSS = paie normale`}
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
            fait entrer en paie normale. Ces versements n'alimentent jamais la BDS DAMANCOM, le livre de paie,
            les écritures ni l'état IR.
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
        <CardHeader><CardTitle>Saisir un versement — {MONTHS[month - 1]} {year}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={onAdd} disabled={!canEdit || !empId}>Ajouter le versement (net auto : {mad(Math.max(0, brut - avance))})</Button>
            {!canEdit && <span className="text-xs text-muted-foreground">Lecture seule : saisie désactivée.</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Mouvements du mois — {firm.name}</CardTitle></CardHeader>
        <Table wide>
          <thead><tr><Th>Salarié</Th><Th>Jours</Th><Th>Brut</Th><Th>Avance</Th><Th>Net remis</Th><Th>Mode</Th><Th>Reçu</Th><Th /></tr></thead>
          <tbody>
            {rows.map(({ emp, pay }) => (
              <tr key={pay.id}>
                <Td>{emp.first_name} {emp.last_name} <span className="text-xs text-muted-foreground">· {emp.matricule ?? ""}</span></Td>
                <Td className="num">{pay.jours}</Td>
                <Td className="num">{mad(pay.brut_verse)}</Td>
                <Td className="num">{mad(pay.avance_deduite ?? 0)}</Td>
                <Td className="num font-semibold">{mad(pay.net_verse)}</Td>
                <Td>{pay.mode}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => downloadReceiptPdf(firm, emp, pay)}><Receipt size={14} /> Reçu</Button></Td>
                <Td>{canEdit && (<Button size="sm" variant="ghost" onClick={() => actions.removeNonDeclarePayment(pay.id)} title="Supprimer"><Trash2 size={14} /></Button>)}</Td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><Td colSpan={8} className="py-8 text-center text-muted-foreground">Aucun versement saisi ce mois.</Td></tr>)}
          </tbody>
        </Table>
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
