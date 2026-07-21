import { useEffect, useMemo, useState } from "react";
import {
  Calculator, FileDown, FileText, Printer, Lock, CheckCircle2, X, SlidersHorizontal,
} from "lucide-react";
import {
  actions, currentFirm, employeesOfFirm, payslipsOfPeriod, uid, useStore,
} from "@/data/store";
import type { Employee, PayslipInput } from "@/data/types";
import { computeFor, defaultInput } from "@/lib/payroll-helpers";
import type { PayrollResult } from "@/lib/payroll-engine";
import {
  Badge, Button, Card, CardContent, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Th,
} from "@/components/ui/kit";
import { MONTHS_FR, mad, num, periodLabel } from "@/lib/format";
import { exportPayslipPdf, downloadTex, openHtmlPayslip, type PayslipView } from "@/lib/payslip";

const YEARS = [2026, 2025];

export default function Payroll() {
  const s = useStore();
  const firm = currentFirm(s);
  const emps = useMemo(() => employeesOfFirm(s, firm.id).filter((e) => e.is_active), [s, firm]);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [editing, setEditing] = useState<Employee | null>(null);

  const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
  const locked = period?.status !== "draft" && period != null;

  // Ouvre la période et crée les bulletins manquants (saisie par défaut).
  useEffect(() => {
    const per = actions.ensurePeriod(firm.id, year, month);
    const existing = new Set(payslipsOfPeriod(s, per.id).map((p) => p.employee_id));
    const missing = emps.filter((e) => !existing.has(e.id));
    if (missing.length) {
      actions.bulkUpsertPayslips(
        missing.map((e) => ({ id: uid("slip"), period_id: per.id, employee_id: e.id, input: defaultInput(e), result: null })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm.id, year, month, emps.length]);

  const slips = period ? payslipsOfPeriod(s, period.id) : [];

  const rows = slips
    .map((slip) => {
      const emp = emps.find((e) => e.id === slip.employee_id);
      if (!emp) return null;
      const result: PayrollResult = slip.result ?? computeFor(emp, firm, year, month, slip.input);
      return { emp, slip, result };
    })
    .filter(Boolean) as { emp: Employee; slip: (typeof slips)[number]; result: PayrollResult }[];

  const totals = rows.reduce(
    (a, r) => ({
      brut: a.brut + r.result.salaireBrut,
      net: a.net + r.result.netAPayer,
      cnss: a.cnss + r.result.cnssSalarie + r.result.cnssPatronal,
      cout: a.cout + r.result.coutTotalEmployeur,
    }),
    { brut: 0, net: 0, cnss: 0, cout: 0 },
  );

  function validate() {
    if (!period) return;
    if (!confirm(`Valider et figer la paie de ${periodLabel(year, month)} ? Les montants ne seront plus recalculés.`)) return;
    actions.bulkUpsertPayslips(
      rows.map((r) => ({ ...r.slip, result: computeFor(r.emp, firm, year, month, r.slip.input) })),
    );
    actions.setPeriodStatus(period.id, "validated");
  }

  async function exportAll() {
    for (const r of rows) {
      await exportPayslipPdf(view(r.emp, r.result, r.slip.input));
    }
  }
  const view = (emp: Employee, result: PayrollResult, input: PayslipInput): PayslipView => ({
    firm, employee: emp, period: period!, result, input,
  });

  return (
    <div>
      <PageHeader title="Paie" subtitle={`Calcul de la paie · ${firm.name}`}>
        {period && <StatusBadge status={period.status} />}
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label="Année">
            <Select value={year} onChange={(e) => setYear(+e.target.value)} className="w-28">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Mois">
            <Select value={month} onChange={(e) => setMonth(+e.target.value)} className="w-40">
              {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <div className="flex-1" />
          {!locked ? (
            <>
              <Button variant="outline" onClick={exportAll}><FileDown size={16} /> Export groupé PDF</Button>
              <Button onClick={validate}><Lock size={16} /> Valider la période</Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportAll}><FileDown size={16} /> Export groupé PDF</Button>
              {period?.status === "validated" && (
                <Button variant="sage" onClick={() => actions.setPeriodStatus(period!.id, "declared")}>
                  <CheckCircle2 size={16} /> Marquer déclarée
                </Button>
              )}
              {period?.status === "declared" && (
                <Button variant="sage" onClick={() => actions.setPeriodStatus(period!.id, "paid")}>
                  <CheckCircle2 size={16} /> Marquer payée
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Mini label="Bulletins" value={String(rows.length)} />
        <Mini label="Masse brute" value={mad(totals.brut)} />
        <Mini label="Total net" value={mad(totals.net)} />
        <Mini label="Coût employeur" value={mad(totals.cout)} accent />
      </div>

      <Card>
        <div className="flex items-center gap-2 px-5 py-3 border-b text-sm text-muted-foreground">
          <Calculator size={16} className="text-primary" />
          Bulletins de {periodLabel(year, month)} {locked && <Badge tone="muted" className="ml-1">figés</Badge>}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Salarié</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">Brut</Th>
              <Th className="text-right">CNSS</Th>
              <Th className="text-right">AMO</Th>
              <Th className="text-right">IR</Th>
              <Th className="text-right">Net à payer</Th>
              <Th className="text-center">Bulletin</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, slip, result: r }) => (
              <tr key={emp.id} className="hover:bg-muted/40">
                <Td>
                  <div className="font-medium">{emp.first_name} {emp.last_name}</div>
                  <div className="text-xs text-muted-foreground">{emp.matricule ?? "—"} · {emp.position ?? "—"}</div>
                </Td>
                <Td className="text-right num">{num(r.salaireBase)}</Td>
                <Td className="text-right num">{num(r.salaireBrut)}</Td>
                <Td className="text-right num text-muted-foreground">{num(r.cnssSalarie)}</Td>
                <Td className="text-right num text-muted-foreground">{num(r.amoSalarie)}</Td>
                <Td className="text-right num text-muted-foreground">{num(r.ir)}</Td>
                <Td className="text-right num font-semibold text-primary">{num(r.netAPayer)}</Td>
                <Td>
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" title="PDF" onClick={() => exportPayslipPdf(view(emp, r, slip.input))}><FileDown size={15} /></Button>
                    <Button variant="ghost" size="icon" title="LaTeX (.tex)" onClick={() => downloadTex(view(emp, r, slip.input), firm.payslip_template_latex)}><FileText size={15} /></Button>
                    <Button variant="ghost" size="icon" title="HTML imprimable" onClick={() => openHtmlPayslip(view(emp, r, slip.input))}><Printer size={15} /></Button>
                  </div>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="icon" title="Saisie variable" disabled={locked} onClick={() => setEditing(emp)}>
                    <SlidersHorizontal size={15} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="px-5 py-2 text-xs text-muted-foreground border-t">
          Totaux — Brut {mad(totals.brut)} · Net {mad(totals.net)} · Cotisations CNSS {mad(totals.cnss)} · Coût employeur {mad(totals.cout)}
        </div>
      </Card>

      {editing && period && (
        <InputEditor
          emp={editing}
          slip={slips.find((sl) => sl.employee_id === editing.id)!}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "bg-accent/60" : ""}>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold num">{value}</p>
      </CardContent>
    </Card>
  );
}

function InputEditor({
  emp, slip, onClose,
}: {
  emp: Employee;
  slip: { id: string; period_id: string; employee_id: string; input: PayslipInput; result?: PayrollResult | null };
  onClose: () => void;
}) {
  const s = useStore();
  const firm = currentFirm(s);
  const period = s.periods.find((p) => p.id === slip.period_id)!;
  const [inp, setInp] = useState<PayslipInput>(slip.input);
  const set = (patch: Partial<PayslipInput>) => setInp((p) => ({ ...p, ...patch }));
  const r = computeFor(emp, firm, period.year, period.month, inp);

  function save() {
    actions.upsertPayslip({ ...slip, input: inp, result: null });
    onClose();
  }

  const numField = (label: string, key: keyof PayslipInput, step = "1", hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" step={step} value={inp[key] as number} onChange={(e) => set({ [key]: +e.target.value } as Partial<PayslipInput>)} />
    </Field>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-2xl scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-display">Saisie — {emp.first_name} {emp.last_name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">{periodLabel(period.year, period.month)} · taux {mad(emp.base_hourly_rate)}/h</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {numField("Jours travaillés", "days_worked")}
          {numField("Heures normales", "hours_normal")}
          {numField("HS +25 % (h)", "hours_ot_25", "0.5")}
          {numField("HS +50 % (h)", "hours_ot_50", "0.5")}
          {numField("HS +100 % (h)", "hours_ot_100", "0.5")}
          {numField("Panier (DH)", "panier", "0.01")}
          {numField("Transport (DH)", "transport", "0.01")}
          {numField("Salissure (DH)", "salissure", "0.01")}
          {numField("Autres gains (DH)", "other_gross", "0.01")}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!inp.transport_outside_urban} onChange={(e) => set({ transport_outside_urban: e.target.checked })} />
          Transport hors périmètre urbain (plafond 750)
        </label>

        <div className="mt-5 rounded-lg bg-muted/60 p-4 text-sm space-y-1.5">
          <Line label="Salaire brut" value={mad(r.salaireBrut)} />
          <Line label="SBI (imposable)" value={mad(r.sbi)} />
          <Line label={`Prime ancienneté (${(r.seniorityRate * 100).toFixed(0)} %)`} value={mad(r.primeAnciennete)} />
          <Line label="CNSS + AMO" value={mad(r.cnssSalarie + r.amoSalarie)} />
          <Line label={`Abattement frais pro (${(r.fraisProRate * 100).toFixed(0)} %)`} value={`- ${mad(r.fraisPro)}`} />
          <Line label="SNI (net imposable)" value={mad(r.sni)} />
          <Line label="IR" value={mad(r.ir)} />
          <div className="border-t pt-1.5 mt-1.5">
            <Line label="Net à payer" value={mad(r.netAPayer)} strong />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save}>Appliquer</Button>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-primary" : "text-muted-foreground"}`}>
      <span>{label}</span><span className="num">{value}</span>
    </div>
  );
}
