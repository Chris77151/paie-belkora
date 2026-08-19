import { useMemo, useState } from "react";
import { CalendarDays, Stethoscope, Hourglass, Baby, Plus, Pencil, Trash2, X } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm, uid, actions } from "@/data/store";
import { useT, type TKey } from "@/lib/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Table,
  Th,
  Td,
  PageHeader,
  Kpi,
} from "@/components/ui/kit";
import { dateFr, num } from "@/lib/format";
import { countLeaveDays } from "@/lib/holidays-maroc";
import { payslipLeave } from "@/lib/leave-balance";
import type { Leave, LeaveType } from "@/data/types";

const LEAVE_LABEL_KEY: Record<LeaveType, TKey> = {
  conge_paye: "leave.conge_paye",
  maladie: "leave.maladie",
  AT: "leave.AT",
  absence_injustifiee: "leave.absence_injustifiee",
  maternite: "leave.maternite",
};

const LEAVE_TYPES: LeaveType[] = ["conge_paye", "maladie", "AT", "absence_injustifiee", "maternite"];

export default function Leaves() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);

  const employees = useMemo(() => employeesOfFirm(s, firm.id), [s, firm.id]);
  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const empById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  const leaves = useMemo(
    () => s.leaves.filter((l) => empIds.has(l.employee_id)),
    [s.leaves, empIds],
  );

  const [editing, setEditing] = useState<Leave | null>(null);

  function newLeave() {
    const start = new Date().toISOString().slice(0, 10);
    setEditing({
      id: uid("lv"),
      employee_id: employees[0]?.id ?? "",
      type: "conge_paye",
      start_date: start,
      end_date: start,
      days: 1,
      cnss_ipe: false,
    });
  }

  function remove(id: string) {
    if (window.confirm(t("lv.deleteConfirm"))) actions.removeLeave(id);
  }

  const today = new Date();
  const inProgress = leaves.filter(
    (l) => new Date(l.start_date) <= today && today <= new Date(l.end_date),
  ).length;
  const totalPaid = leaves
    .filter((l) => l.type === "conge_paye")
    .reduce((a, l) => a + l.days, 0);
  const nbMaladie = leaves.filter((l) => l.type === "maladie").length;

  // Source des soldes affichés : décompte de l'app OU soldes importés d'Odoo (réglage société,
  // le même que le bulletin). Repli automatique sur l'app pour un salarié sans solde Odoo.
  const leaveSource = firm.payslip_leave_source ?? "app";
  const soldes = useMemo(
    () =>
      employees
        .filter((e) => e.is_active)
        .map((e) => {
          const { balance, source } = payslipLeave(e, leaves, today, leaveSource);
          return { emp: e, acquis: balance.acquired, pris: balance.taken, solde: balance.balance, source };
        }),
    [employees, leaves, leaveSource],
  );
  const odooCount = soldes.filter((r) => r.source === "odoo").length;
  const lastOdooFetch = useMemo(() => {
    const dates = employees.map((e) => e.odoo_leave?.fetched_at).filter((d): d is string => !!d).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [employees]);

  return (
    <div>
      <PageHeader title={t("page.leaves.title")} subtitle={t("page.leaves.sub")}>
        <Button onClick={newLeave} disabled={employees.length === 0}>
          <Plus size={16} /> {t("lv.new")}
        </Button>
      </PageHeader>

      {employees.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-4 text-sm text-muted-foreground">{t("lv.noEmp")}</CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label={t("lv.kpi.paidTaken")}
          value={`${num(totalPaid)} j`}
          sub={t("lv.kpi.paidTaken.sub")}
          accent="sage"
          icon={<CalendarDays size={20} />}
        />
        <Kpi
          label={t("lv.kpi.sick")}
          value={String(nbMaladie)}
          sub={t("lv.kpi.sick.sub")}
          accent="gold"
          icon={<Stethoscope size={20} />}
        />
        <Kpi
          label={t("lv.kpi.inProgress")}
          value={String(inProgress)}
          sub={t("lv.kpi.inProgress.sub")}
          accent="primary"
          icon={<Hourglass size={20} />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("lv.journal")}</CardTitle>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lv.noLeave")}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("doc.employee")}</Th>
                  <Th>{t("lv.col.type")}</Th>
                  <Th>{t("lv.col.from")}</Th>
                  <Th>{t("lv.col.to")}</Th>
                  <Th className="text-right">{t("lv.col.days")}</Th>
                  <Th>IPE CNSS</Th>
                  <Th className="text-right">{t("lv.col.actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => {
                  const emp = empById.get(l.employee_id);
                  return (
                    <tr key={l.id}>
                      <Td>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</Td>
                      <Td>{t(LEAVE_LABEL_KEY[l.type])}</Td>
                      <Td>{dateFr(l.start_date)}</Td>
                      <Td>{dateFr(l.end_date)}</Td>
                      <Td className="text-right num">{l.days}</Td>
                      <Td>
                        {l.cnss_ipe ? (
                          <Badge tone="success">IPE</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" title={t("btn.edit")} onClick={() => setEditing(l)}>
                            <Pencil size={15} />
                          </Button>
                          <Button size="icon" variant="ghost" title={t("btn.delete")} onClick={() => remove(l.id)}>
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex flex-wrap items-center gap-2">
              {t("lv.balances")}
              {leaveSource === "odoo" ? (
                <Badge tone="primary">{t("lv.src.odoo")}{odooCount > 0 ? ` · ${odooCount}` : ""}</Badge>
              ) : (
                <Badge tone="muted">{t("lv.src.app")}</Badge>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>{t("doc.employee")}</Th>
                <Th>{t("emp.position")}</Th>
                <Th className="text-right">{t("lv.col.acquired")}</Th>
                <Th className="text-right">{t("lv.col.taken")}</Th>
                <Th className="text-right">{t("lv.col.balance")}</Th>
                <Th>{t("lv.col.source")}</Th>
              </tr>
            </thead>
            <tbody>
              {soldes.map(({ emp, acquis, pris, solde, source }) => (
                <tr key={emp.id}>
                  <Td>
                    {emp.first_name} {emp.last_name}
                  </Td>
                  <Td>{emp.position ?? "—"}</Td>
                  <Td className="text-right num">{num(acquis)}</Td>
                  <Td className="text-right num">{num(pris)}</Td>
                  <Td className="text-right num">
                    <span className={solde < 0 ? "text-destructive font-medium" : "font-medium"}>
                      {num(solde)}
                    </span>
                  </Td>
                  <Td>
                    {source === "odoo" ? (
                      <Badge tone="primary">Odoo</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("lv.src.appShort")}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            {leaveSource === "odoo" ? (
              <>
                {t("lv.src.odooNote")}
                {lastOdooFetch ? ` (${dateFr(lastOdooFetch)})` : ""}
              </>
            ) : (
              t("lv.acquisitionNote")
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-sage/12 text-sage">
              <Baby size={20} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t("lv.maternity.title")}</span> {t("lv.maternity.body")}
            </p>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <LeaveForm
          key={editing.id}
          initial={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSave={(l) => { actions.upsertLeave(l); setEditing(null); }}
        />
      )}
    </div>
  );
}

function LeaveForm({
  initial,
  employees,
  onClose,
  onSave,
}: {
  initial: Leave;
  employees: { id: string; first_name: string; last_name: string }[];
  onClose: () => void;
  onSave: (l: Leave) => void;
}) {
  const t = useT();
  const [f, setF] = useState<Leave>(initial);
  const set = (patch: Partial<Leave>) => setF((prev) => ({ ...prev, ...patch }));

  // Jour(s) de repos hebdomadaire pour le décompte : dimanche par défaut (jours ouvrables, cohérent
  // avec l'acquisition art. 231), ou samedi + dimanche.
  const [restDays, setRestDays] = useState<number[]>([0]);

  // Dates : recalcule le nombre de jours DÉCOMPTÉS (jours ouvrables : week-end/repos et jours fériés
  // fixes exclus). L'utilisateur peut ensuite ajuster (fêtes religieuses variables, cas particulier).
  const setStart = (start_date: string) =>
    setF((p) => ({ ...p, start_date, days: countLeaveDays(start_date, p.end_date, { restDays }).working }));
  const setEnd = (end_date: string) =>
    setF((p) => ({ ...p, end_date, days: countLeaveDays(p.start_date, end_date, { restDays }).working }));
  const changeRest = (rd: number[]) => {
    setRestDays(rd);
    setF((p) => ({ ...p, days: countLeaveDays(p.start_date, p.end_date, { restDays: rd }).working }));
  };

  const count = useMemo(
    () => countLeaveDays(f.start_date, f.end_date, { restDays }),
    [f.start_date, f.end_date, restDays],
  );

  const datesValid = !!f.start_date && !!f.end_date && new Date(f.end_date) >= new Date(f.start_date);
  const canSave = !!f.employee_id && datesValid && f.days > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-2xl scrollbar-thin"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-display">{t("lv.form.title")}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="space-y-4">
          <Field label={t("lv.f.employee")}>
            <Select value={f.employee_id} onChange={(e) => set({ employee_id: e.target.value })}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </Select>
          </Field>

          <Field label={t("lv.f.type")}>
            <Select value={f.type} onChange={(e) => set({ type: e.target.value as LeaveType })}>
              {LEAVE_TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(LEAVE_LABEL_KEY[ty])}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("lv.col.from")}>
              <Input type="date" value={f.start_date} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={t("lv.col.to")}>
              <Input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          {!datesValid && <p className="-mt-1 text-xs text-destructive">{t("lv.f.dateError")}</p>}

          <Field label={t("lv.f.restDays")}>
            <Select value={restDays.join(",")} onChange={(e) => changeRest(e.target.value.split(",").map(Number))}>
              <option value="0">{t("lv.rest.sun")}</option>
              <option value="6,0">{t("lv.rest.satsun")}</option>
            </Select>
          </Field>

          <Field label={t("lv.f.days")}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={f.days}
              onChange={(e) => set({ days: Math.max(0, +e.target.value) })}
            />
          </Field>

          {datesValid && (
            <div className="-mt-2 rounded-md border bg-muted/30 p-2.5 text-xs">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{count.calendar}</span> {t("lv.dc.cal")}
                {" − "}<span className="font-medium text-foreground">{count.rest}</span> {t("lv.dc.rest")}
                {" − "}<span className="font-medium text-foreground">{count.holidays}</span> {t("lv.dc.hol")}
                {" = "}<span className="font-semibold text-foreground">{count.working}</span> {t("lv.dc.work")}
                {f.days !== count.working && <span className="text-warning"> · saisi : {f.days}</span>}
              </p>
              {count.holidayList.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {count.holidayList.map((h) => `${dateFr(h.date)} — ${h.name}`).join(" · ")}
                </p>
              )}
            </div>
          )}
          <p className="-mt-1 text-xs text-muted-foreground">{t("lv.f.daysHint")}</p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.cnss_ipe} onChange={(e) => set({ cnss_ipe: e.target.checked })} />
            {t("lv.f.ipe")}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t("btn.cancel")}</Button>
          <Button type="submit" disabled={!canSave}>{t("btn.save")}</Button>
        </div>
      </form>
    </div>
  );
}
