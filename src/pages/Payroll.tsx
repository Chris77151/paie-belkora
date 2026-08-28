import { useEffect, useMemo, useState } from "react";
import {
  Calculator, FileDown, FileText, Printer, Lock, Unlock, CheckCircle2, X, SlidersHorizontal, Info,
  Trash2, AlertTriangle, Wallet, Sheet,
} from "lucide-react";
import {
  actions, currentFirm, employeesOfFirm, getState, payslipsOfPeriod, uid, useStore,
} from "@/data/store";
import { useCanWrite } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { DocFormat, Employee, Payslip, PayslipInput, SalaryAdvance } from "@/data/types";
import { computeFor, defaultInput, employeesForPeriod } from "@/lib/payroll-helpers";
import type { PayrollResult } from "@/lib/payroll-engine";
import {
  advanceBalanceAfter, advanceDueForPeriod, advanceOutstanding, advanceStartMonth, cappedAdvanceDeduction,
} from "@/lib/advance-engine";
import {
  Badge, Button, Card, CardContent, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Th,
} from "@/components/ui/kit";
import { MONTHS_FR, mad, num, periodLabel } from "@/lib/format";
import { exportPayslipPdf, downloadTex, openHtmlPayslip, type PayslipView } from "@/lib/payslip";
import { getParams } from "@/lib/params";
import { YearSelect } from "@/components/YearSelect";
import { payslipLeave } from "@/lib/leave-balance";
import { buildSettlementReport } from "@/lib/payroll-settlement";
import { exportSettlementPdf, exportSettlementXlsx } from "@/lib/payroll-settlement-export";
import { PinPrompt } from "@/components/PinPrompt";

export default function Payroll() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const canEdit = useCanWrite(); // « lecture seule » : ni saisie, ni validation de période
  // Liste complète de la société (recherche/affichage des bulletins existants) ...
  const firmEmps = useMemo(() => employeesOfFirm(s, firm.id), [s, firm]);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  // ... et ceux RÉELLEMENT employés pendant la période (roster à auto-créer / à totaliser).
  const emps = useMemo(() => employeesForPeriod(firmEmps, year, month), [firmEmps, year, month]);
  const [editing, setEditing] = useState<Employee | null>(null);
  // Affichage de la « Partie réservée à l'employeur » (charges patronales) sur les bulletins exportés.
  const [showEmployer, setShowEmployer] = useState(true);

  // État de règlement : salariés déclarés de la période + solde par mode de règlement (bulletins figés).
  const settlement = useMemo(() => buildSettlementReport(s, firm, year, month), [s, firm, year, month]);

  const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
  const locked = period?.status !== "draft" && period != null;

  // Clé stable de l'effectif de la période : change dès qu'un salarié entre/sort (ajout,
  // suppression, embauche/sortie), même à effectif constant — ce que `length` ne détecte pas.
  const rosterKey = emps.map((e) => e.id).sort().join(",");

  // Ouvre la période et crée les bulletins manquants (saisie par défaut). Ne touche JAMAIS une
  // période verrouillée (instantané figé).
  useEffect(() => {
    const per = actions.ensurePeriod(firm.id, year, month);
    if (locked) return;
    const existing = new Set(payslipsOfPeriod(getState(), per.id).map((p) => p.employee_id));
    const missing = emps.filter((e) => !existing.has(e.id));
    if (missing.length) {
      actions.bulkUpsertPayslips(
        missing.map((e) => ({ id: uid("slip"), period_id: per.id, employee_id: e.id, input: defaultInput(e), result: null })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm.id, year, month, rosterKey, locked]);

  const slips = period ? payslipsOfPeriod(s, period.id) : [];

  const rows: { emp: Employee; slip: Payslip; result: PayrollResult }[] = locked
    ? // Période VERROUILLÉE : instantané FIGÉ uniquement — les bulletins RÉELLEMENT calculés
      // (result != null). On ne recalcule jamais un bulletin neutralisé (result null) : sinon un
      // bulletin « hors effectif » neutralisé réapparaîtrait avec des montants recalculés.
      (slips
        .filter((slip) => slip.result != null)
        .map((slip) => {
          const emp = firmEmps.find((e) => e.id === slip.employee_id);
          if (!emp) return null;
          return { emp, slip, result: slip.result as PayrollResult };
        })
        .filter(Boolean) as { emp: Employee; slip: Payslip; result: PayrollResult }[])
    : // Période BROUILLON : l'affichage suit l'EFFECTIF RÉEL de la période (roster), pas les
      // bulletins déjà créés — un salarié saisi apparaît immédiatement, un salarié sorti disparaît.
      emps.map((emp) => {
        const slip: Payslip =
          slips.find((sl) => sl.employee_id === emp.id) ??
          { id: `tmp_${emp.id}`, period_id: period?.id ?? "", employee_id: emp.id, input: defaultInput(emp), result: null };
        const result: PayrollResult = slip.result ?? computeFor(emp, firm, year, month, slip.input);
        return { emp, slip, result };
      });

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
    // Fige l'effectif RÉEL de la période (roster), avec un id stable (jamais l'id temporaire d'affichage).
    const rosterIds = new Set(emps.map((e) => e.id));
    const validated = rows.map((r) => ({
      ...r.slip,
      id: r.slip.id.startsWith("tmp_") ? uid("slip") : r.slip.id,
      result: computeFor(r.emp, firm, year, month, r.slip.input),
    }));
    // Neutralise TOUT bulletin de la période hors de l'effectif affiché (sorti, embauché après,
    // fantôme) — qu'il ait déjà un résultat ou non → l'instantané figé, l'affichage verrouillé,
    // l'écriture comptable et la déclaration ne portent QUE sur les salariés réellement présents.
    const nonRoster = slips
      .filter((sl) => !rosterIds.has(sl.employee_id) && sl.result != null)
      .map((sl) => ({ ...sl, result: null }));
    // (les non-roster déjà à result=null sont laissés tels quels : inertes, rien à écrire.)
    actions.bulkUpsertPayslips([...validated, ...nonRoster]);
    actions.setPeriodStatus(period.id, "validated");
  }

  // Verrou : si un code de validation est défini pour la société, l'exiger avant de figer la paie.
  const [pinOpen, setPinOpen] = useState(false);
  function requestValidate() {
    if (firm.validation_pin_hash) setPinOpen(true);
    else validate();
  }

  /** Remet une période verrouillée (validée/déclarée/payée) en brouillon : la saisie redevient modifiable. */
  function revertToDraft() {
    if (!period) return;
    const hasClosure = (s.accountingClosures ?? []).some((c) => c.id === `${firm.id}_${year}_${month}`);
    const warn = hasClosure ? `\n\n${t("pay.revert.closureWarn")}` : "";
    if (!confirm(`${t("pay.revert.confirm")} ${periodLabel(year, month)} ?${warn}`)) return;
    actions.setPeriodStatus(period.id, "draft");
  }

  /** Trace un bulletin réellement produit (traçabilité + KPI du volet « Journal des documents »). */
  function trackSlip(emp: Employee, format: DocFormat) {
    actions.recordDocGeneration({
      firm_id: firm.id,
      doc_type: "bulletin",
      format,
      employee_id: emp.id,
      subject: `${emp.first_name} ${emp.last_name}`,
      period_year: year,
      period_month: month,
    });
  }

  async function exportAll() {
    for (const r of rows) {
      trackSlip(r.emp, "pdf");
      await exportPayslipPdf(view(r.emp, r.result, r.slip.input));
    }
  }
  const view = (emp: Employee, result: PayrollResult, input: PayslipInput): PayslipView => {
    // Congés du bulletin : source choisie dans Paramètres (décompte app ou soldes Odoo), arrêtée
    // à la fin de la période. Repli automatique sur le décompte app si Odoo choisi sans données.
    const lv = payslipLeave(emp, s.leaves, new Date(period!.year, period!.month, 0), firm.payslip_leave_source);
    return {
      firm, employee: emp, period: period!, result, input,
      showEmployerSection: showEmployer, // « Partie réservée à l'employeur » : optionnelle à l'export
      leave: lv.balance,
      leaveSource: lv.source,
    };
  };

  return (
    <div>
      <PageHeader title={t("page.payroll.title")} subtitle={`${t("page.payroll.sub")} · ${firm.name}`}>
        {period && <StatusBadge status={period.status} />}
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label={t("pay.year")}>
            <YearSelect value={year} onChange={setYear} />
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
              <Button onClick={requestValidate} disabled={!canEdit} title={canEdit ? undefined : t("header.readonly.hint")}><Lock size={16} /> {t("pay.validate")}</Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportAll}><FileDown size={16} /> {t("pay.exportGroup")}</Button>
              <Button variant="outline" onClick={revertToDraft} title={canEdit ? t("pay.revert.hint") : t("header.readonly.hint")} disabled={!canEdit}>
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

      {settlement.total.count > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wallet size={17} className="text-primary" />
                Règlement des salaires — {periodLabel(year, month)}
                <span className="text-muted-foreground font-normal">· {settlement.total.count} salarié(s) déclaré(s)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void exportSettlementPdf(settlement)}>
                  <FileDown size={16} /> État de règlement (PDF)
                </Button>
                <Button variant="sage" onClick={() => exportSettlementXlsx(settlement)}>
                  <Sheet size={16} /> Excel
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <thead>
                  <tr>
                    <Th>Mode de règlement</Th>
                    <Th>Compte</Th>
                    <Th className="text-right">Effectif</Th>
                    <Th className="text-right">Net à payer</Th>
                    <Th className="text-right">Avances</Th>
                    <Th className="text-right">Net à régler</Th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.byMode.map((m) => (
                    <tr key={m.mode}>
                      <Td className="capitalize">{m.label}</Td>
                      <Td className="num">{m.account}</Td>
                      <Td className="text-right num">{m.count}</Td>
                      <Td className="text-right num">{mad(m.net)}</Td>
                      <Td className="text-right num">{m.advances ? mad(m.advances) : "—"}</Td>
                      <Td className="text-right num font-medium">{mad(m.netToPay)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <Td>Total général</Td>
                    <Td />
                    <Td className="text-right num">{settlement.total.count}</Td>
                    <Td className="text-right num">{mad(settlement.total.net)}</Td>
                    <Td className="text-right num">{mad(settlement.total.advances)}</Td>
                    <Td className="text-right num">{mad(settlement.total.netToPay)}</Td>
                  </tr>
                </tfoot>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Net à régler = net à payer − avances retenues. Mode par salarié : le sien (fiche), sinon celui de la société, sinon virement.
              Virement / chèque → Banque (5141), espèces → Caisse (5161).
            </p>
          </CardContent>
        </Card>
      )}

      {!locked && (
        <Card className="mb-4 border-warning/40">
          <CardContent className="pt-4 flex items-start gap-2 text-sm">
            <Info size={16} className="mt-0.5 shrink-0 text-warning" />
            <span className="text-muted-foreground">
              <b className="text-foreground">Période reconstituée.</b> Les bulletins sont calculés à partir
              des salariés <b>actuellement employés sur {periodLabel(year, month)}</b> (embauche/fin de contrat
              pris en compte) et de leurs <b>salaires actuels</b>, avec le <b>barème {year}</b>. Ce n'est pas
              forcément la paie réellement déclarée à l'époque : pour une cohérence stricte avec la CNSS/DAMANCOM
              d'une période passée, saisissez les données réelles (effectif, salaires, primes) puis <b>validez</b>.
            </span>
          </CardContent>
        </Card>
      )}

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
                    <Button variant="ghost" size="icon" title="PDF" onClick={() => { trackSlip(emp, "pdf"); exportPayslipPdf(view(emp, r, slip.input)); }}><FileDown size={15} /></Button>
                    <Button variant="ghost" size="icon" title="LaTeX (.tex)" onClick={() => { trackSlip(emp, "latex"); downloadTex(view(emp, r, slip.input), firm.payslip_template_latex); }}><FileText size={15} /></Button>
                    <Button variant="ghost" size="icon" title={t("pay.printable")} onClick={() => { trackSlip(emp, "html"); openHtmlPayslip(view(emp, r, slip.input)); }}><Printer size={15} /></Button>
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

      {editing && period && slips.some((sl) => sl.employee_id === editing.id) && (
        <InputEditor
          emp={editing}
          slip={slips.find((sl) => sl.employee_id === editing.id)!}
          onClose={() => setEditing(null)}
        />
      )}

      {pinOpen && (
        <PinPrompt
          firm={firm}
          title={t("pay.validate")}
          action={t("pay.validate")}
          onSuccess={validate}
          onClose={() => setPinOpen(false)}
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
      <Input type="number" step={step} value={(inp[key] as number | undefined) ?? 0} onChange={(e) => set({ [key]: +e.target.value } as Partial<PayslipInput>)} />
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
          {numField(t("pay.f.advances"), "advances", "0.01", t("pay.f.advances.hint"))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!inp.transport_outside_urban} onChange={(e) => set({ transport_outside_urban: e.target.checked })} />
          {t("pay.f.transportOutside")}
        </label>

        <AdvancesPanel
          emp={emp}
          year={period.year}
          month={period.month}
          net={r.netAPayer}
          onApply={(v) => set({ advances: v })}
        />

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

/**
 * Registre des avances / acomptes du salarié, intégré au bulletin. Une avance est saisie UNE fois ;
 * le moteur (`advance-engine`) en déduit l'échéance du mois, le solde restant et l'écrêtement au 1/10
 * du net (art. 386 CT, taux depuis `params.ts`). Le bouton « Appliquer » reporte la retenue effective
 * dans le champ `advances` du bulletin (net final = net − avances dans le livre de paie).
 */
function AdvancesPanel({
  emp, year, month, net, onApply,
}: {
  emp: Employee;
  year: number;
  month: number;
  net: number;
  onApply: (value: number) => void;
}) {
  const t = useT();
  const s = useStore();
  const capRate = getParams(year).advanceMonthlyCapRate;
  const list = useMemo(
    () => (s.salaryAdvances ?? []).filter((a) => a.employee_id === emp.id),
    [s.salaryAdvances, emp.id],
  );
  const ded = cappedAdvanceDeduction(list, emp.id, year, month, net, capRate);
  const outstanding = advanceOutstanding(list, emp.id, year, month);

  const [open, setOpen] = useState(false);
  const defMonth = `${year}-${String(month).padStart(2, "0")}`;
  const [form, setForm] = useState<{ kind: "acompte" | "avance"; amount: string; months: string; start_month: string; reason: string }>(
    { kind: "avance", amount: "", months: "1", start_month: defMonth, reason: "" },
  );

  function add() {
    const amount = +form.amount;
    if (!(amount > 0)) return;
    const a: SalaryAdvance = {
      id: uid(),
      firm_id: emp.firm_id,
      employee_id: emp.id,
      kind: form.kind,
      date: `${form.start_month}-01`,
      amount,
      months: form.kind === "acompte" ? 1 : Math.max(1, Math.round(+form.months || 1)),
      start_month: form.start_month,
      reason: form.reason.trim() || undefined,
    };
    actions.upsertSalaryAdvance(a);
    setForm({ kind: "avance", amount: "", months: "1", start_month: defMonth, reason: "" });
    setOpen(false);
  }

  return (
    <div className="mt-5 rounded-lg border border-border/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("adv.title")}</h3>
        <span className="text-xs text-muted-foreground">{t("adv.outstanding")} : <span className="num font-medium">{mad(outstanding)}</span></span>
      </div>

      {list.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("adv.none")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {list.map((a) => {
            const due = advanceDueForPeriod(a, year, month);
            const bal = advanceBalanceAfter(a, year, month);
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                <div className="min-w-0">
                  <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${a.kind === "acompte" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                    {a.kind === "acompte" ? t("adv.kind.acompte").split(" ")[0] : t("adv.kind.avance").split(" ")[0]}
                  </span>
                  <span className="num font-medium">{mad(a.amount)}</span>
                  {a.kind === "avance" && <span className="text-muted-foreground"> · {a.months} {t("adv.months").toLowerCase()}</span>}
                  <span className="text-muted-foreground"> · {advanceStartMonth(a)}</span>
                  {a.reason && <span className="block truncate text-muted-foreground">{a.reason}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-right">
                    {due > 0 && <span className="num font-medium">{mad(due)}</span>}
                    <span className="block text-[10px] text-muted-foreground">{t("adv.remaining")} {num(bal)}</span>
                  </span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" title={t("adv.delete")} onClick={() => actions.removeSalaryAdvance(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ded.due > 0 && (
        <div className="mt-3 rounded-md bg-primary/5 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("adv.dueThisMonth")}</span>
            <span className="num font-semibold text-primary">{mad(ded.applied)}</span>
          </div>
          {ded.capApplied && (
            <p className="mt-1 flex gap-1 text-[11px] text-amber-700">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              <span>{t("adv.capNote")} ({t("adv.dueThisMonth").toLowerCase()} {num(ded.avance)} → {num(ded.avanceApplied)}, {t("adv.installment").toLowerCase()} ≤ {num(ded.cap)})</span>
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onApply(ded.applied)}>{t("adv.apply")}</Button>
          </div>
        </div>
      )}

      {open ? (
        <div className="mt-3 space-y-2 rounded-md border border-border/70 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("adv.kind")}>
              <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "acompte" | "avance" }))}>
                <option value="avance">{t("adv.kind.avance")}</option>
                <option value="acompte">{t("adv.kind.acompte")}</option>
              </Select>
            </Field>
            <Field label={t("adv.amount")}>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </Field>
            {form.kind === "avance" && (
              <Field label={t("adv.months")}>
                <Input type="number" min="1" step="1" value={form.months} onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))} />
              </Field>
            )}
            <Field label={t("adv.startMonth")}>
              <Input type="month" value={form.start_month} onChange={(e) => setForm((f) => ({ ...f, start_month: e.target.value }))} />
            </Field>
            <div className="col-span-2">
              <Field label={t("adv.reason")}>
                <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("btn.cancel")}</Button>
            <Button size="sm" onClick={add}>{t("adv.save")}</Button>
          </div>
        </div>
      ) : (
        <button type="button" className="mt-3 text-xs font-medium text-primary hover:underline" onClick={() => setOpen(true)}>
          {t("adv.add")}
        </button>
      )}
    </div>
  );
}
