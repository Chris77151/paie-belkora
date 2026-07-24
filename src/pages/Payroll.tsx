import { useEffect, useMemo, useState } from "react";
import {
  Calculator, FileDown, FileText, Printer, Lock, Unlock, CheckCircle2, X, SlidersHorizontal,
} from "lucide-react";
import {
  actions, currentFirm, employeesOfFirm, payslipsOfPeriod, uid, useStore,
} from "@/data/store";
import { useT } from "@/lib/i18n";
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
  const t = useT();
  const firm = currentFirm(s);
  const emps = useMemo(() => employeesOfFirm(s, firm.id).filter((e) => e.is_active), [s, firm]);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [editing, setEditing] = useState<Employee | null>(null);
  // Affichage de la « Partie réservée à l'employeur » (charges patronales) sur les bulletins exportés.
  const [showEmployer, setShowEmployer] = useState(true);

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
    if (!confirm(`${t("pay.validate.confirm1")} ${periodLabel(year, month)}${t("pay.validate.confirm2")}`)) return;
    actions.bulkUpsertPayslips(
      rows.map((r) => ({ ...r.slip, result: computeFor(r.emp, firm, year, month, r.slip.input) })),
    );
    actions.setPeriodStatus(period.id, "validated");
  }

  /** Remet une période verrouillée (validée/déclarée/payée) en brouillon : la saisie redevient modifiable. */
  function revertToDraft() {
    if (!period) return;
    const hasClosure = (s.accountingClosures ?? []).some((c) => c.id === `${firm.id}_${year}_${month}`);
    const warn = hasClosure ? `\n\n${t("pay.revert.closureWarn")}` : "";
    if (!confirm(`${t("pay.revert.confirm")} ${periodLabel(year, month)} ?${warn}`)) return;
    actions.setPeriodStatus(period.id, "draft");
  }

  async function exportAll() {
    for (const r of rows) {
      await exportPayslipPdf(view(r.emp, r.result, r.slip.input));
    }
  }
  const view = (emp: Employee, result: PayrollResult, input: PayslipInput): PayslipView => ({
    firm, employee: emp, period: period!, result, input,
    showEmployerSection: showEmployer, // « Partie réservée à l'employeur » : optionnelle à l'export
  });

  return (
    <div>
      <PageHeader title={t("page.payroll.title")} subtitle={`${t("page.payroll.sub")} · ${firm.name}`}>
        {period && <StatusBadge status={period.status} />}
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label={t("pay.year")}>
            <Select value={year} onChange={(e) => setYear(+e.target.value)} className="w-28">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label={t("pay.month")}>
            <Select value={month} onChange={(e) => setMonth(+e.target.value)} className="w-40">
              {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <div className="flex-1" />
          <label
            className="flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer select-none"
            title={t("pay.showEmployer.hint")}
          >
            <input
              type="checkbox"
              checked={showEmployer}
              onChange={(e) => setShowEmployer(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            {t("pay.showEmployer")}
          </label>
          {!locked ? (
            <>
              <Button variant="outline" onClick={exportAll}><FileDown size={16} /> {t("pay.exportGroup")}</Button>
              <Button onClick={validate}><Lock size={16} /> {t("pay.validate")}</Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportAll}><FileDown size={16} /> {t("pay.exportGroup")}</Button>
              <Button variant="outline" onClick={revertToDraft} title={t("pay.revert.hint")}>
                <Unlock size={16} /> {t("pay.revert")}
              </Button>
              {period?.status === "validated" && (
                <Button variant="sage" onClick={() => actions.setPeriodStatus(period!.id, "declared")}>
                  <CheckCircle2 size={16} /> {t("pay.markDeclared")}
                </Button>
              )}
              {period?.status === "declared" && (
                <Button variant="sage" onClick={() => actions.setPeriodStatus(period!.id, "paid")}>
                  <CheckCircle2 size={16} /> {t("pay.markPaid")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Mini label={t("pay.kpi.slips")} value={String(rows.length)} />
        <Mini label={t("pay.kpi.gross")} value={mad(totals.brut)} />
        <Mini label={t("pay.kpi.net")} value={mad(totals.net)} />
        <Mini label={t("pay.kpi.cost")} value={mad(totals.cout)} accent />
      </div>

      <Card>
        <div className="flex items-center gap-2 px-5 py-3 border-b text-sm text-muted-foreground">
          <Calculator size={16} className="text-primary" />
          {t("pay.slipsOf")} {periodLabel(year, month)} {locked && <Badge tone="muted" className="ml-1">{t("pay.frozen")}</Badge>}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>{t("doc.employee")}</Th>
              <Th className="text-right">{t("pay.col.base")}</Th>
              <Th className="text-right">{t("pay.col.gross")}</Th>
              <Th className="text-right">CNSS</Th>
              <Th className="text-right">AMO</Th>
              <Th className="text-right">IR</Th>
              <Th className="text-right">{t("pay.col.net")}</Th>
              <Th className="text-center">{t("pay.col.slip")}</Th>
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
                    <Button variant="ghost" size="icon" title={t("pay.printable")} onClick={() => openHtmlPayslip(view(emp, r, slip.input))}><Printer size={15} /></Button>
                  </div>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="icon" title={t("pay.variableInput")} disabled={locked} onClick={() => setEditing(emp)}>
                    <SlidersHorizontal size={15} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="px-5 py-2 text-xs text-muted-foreground border-t">
          {t("pay.totals")} — {t("pay.col.gross")} {mad(totals.brut)} · {t("pay.kpi.net")} {mad(totals.net)} · {t("pay.cnssContrib")} {mad(totals.cnss)} · {t("pay.kpi.cost")} {mad(totals.cout)}
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
  const t = useT();
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
          <h2 className="text-lg font-display">{t("pay.input.title")} — {emp.first_name} {emp.last_name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">{periodLabel(period.year, period.month)} · {t("pay.rate")} {mad(emp.base_hourly_rate)}/h</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {numField(t("pay.f.days"), "days_worked")}
          {numField(t("pay.f.hours"), "hours_normal")}
          {numField(t("pay.f.ot25"), "hours_ot_25", "0.5")}
          {numField(t("pay.f.ot50"), "hours_ot_50", "0.5")}
          {numField(t("pay.f.ot100"), "hours_ot_100", "0.5")}
          {numField(t("pay.f.panier"), "panier", "0.01")}
          {numField(t("pay.f.transport"), "transport", "0.01")}
          {numField(t("pay.f.salissure"), "salissure", "0.01")}
          {numField(t("pay.f.other"), "other_gross", "0.01")}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!inp.transport_outside_urban} onChange={(e) => set({ transport_outside_urban: e.target.checked })} />
          {t("pay.f.transportOutside")}
        </label>

        <div className="mt-5 rounded-lg bg-muted/60 p-4 text-sm space-y-1.5">
          <Line label={t("pay.l.gross")} value={mad(r.salaireBrut)} />
          <Line label={t("pay.l.sbi")} value={mad(r.sbi)} />
          <Line label={`${t("pay.l.seniority")} (${(r.seniorityRate * 100).toFixed(0)} %)`} value={mad(r.primeAnciennete)} />
          <Line label={t("pay.l.cnssAmo")} value={mad(r.cnssSalarie + r.amoSalarie)} />
          <Line label={`${t("pay.l.fraisPro")} (${(r.fraisProRate * 100).toFixed(0)} %)`} value={`- ${mad(r.fraisPro)}`} />
          <Line label={t("pay.l.sni")} value={mad(r.sni)} />
          <Line label="IR" value={mad(r.ir)} />
          <div className="border-t pt-1.5 mt-1.5">
            <Line label={t("pay.col.net")} value={mad(r.netAPayer)} strong />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("btn.cancel")}</Button>
          <Button onClick={save}>{t("pay.apply")}</Button>
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
