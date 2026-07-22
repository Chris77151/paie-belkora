import { useMemo, useState } from "react";
import { HardHat, Plus, Pencil, Trash2, X, AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";
import { currentFirm, employeesOfFirm, uid, useStore, actions } from "@/data/store";
import { useT, type TKey } from "@/lib/i18n";
import {
  Badge, Button, Card, CardContent, Field, Input, Textarea, Select,
  Table, Th, Td, PageHeader, Kpi,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";
import type { WorkAccident, WorkAccidentSeverity, WorkAccidentStatus } from "@/data/types";

const SEVERITY_KEY: Record<WorkAccidentSeverity, TKey> = {
  benin: "acc.sev.benin",
  avec_arret: "acc.sev.avec_arret",
  grave: "acc.sev.grave",
  mortel: "acc.sev.mortel",
};
const SEVERITY_TONE: Record<WorkAccidentSeverity, "muted" | "warning" | "destructive"> = {
  benin: "muted",
  avec_arret: "warning",
  grave: "destructive",
  mortel: "destructive",
};

export default function Accidents() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const employees = useMemo(() => employeesOfFirm(s, firm.id), [s, firm.id]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const accidents = useMemo(
    () =>
      (s.workAccidents ?? [])
        .filter((a) => a.firm_id === firm.id || empIds.has(a.employee_id))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [s.workAccidents, firm.id, empIds],
  );

  const [editing, setEditing] = useState<WorkAccident | null>(null);

  const total = accidents.length;
  const withStop = accidents.filter((a) => a.work_stoppage).length;
  const lostDays = accidents.reduce((a, x) => a + (x.work_stoppage ? x.stoppage_days ?? 0 : 0), 0);
  const notDeclared = accidents.filter((a) => !a.declared).length;

  function newAccident() {
    setEditing({
      id: uid("at"),
      firm_id: firm.id,
      employee_id: employees[0]?.id ?? "",
      date: new Date().toISOString().slice(0, 10),
      circumstances: "",
      severity: "benin",
      work_stoppage: false,
      declared: false,
      status: "ouvert",
      created_at: new Date().toISOString(),
    });
  }

  function remove(id: string) {
    if (window.confirm(t("acc.deleteConfirm"))) actions.removeWorkAccident(id);
  }

  return (
    <div>
      <PageHeader
        title={t("page.accidents.title")}
        subtitle={`${firm.name} · ${t("page.accidents.sub")}`}
      >
        <Button onClick={newAccident} disabled={employees.length === 0}>
          <Plus size={16} /> {t("acc.new")}
        </Button>
      </PageHeader>

      {employees.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-4 text-sm text-muted-foreground">
            {t("acc.noEmp")}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("acc.kpi.total")} value={String(total)} sub={t("acc.kpi.total.sub")} accent="primary" icon={<HardHat size={20} />} />
        <Kpi label={t("acc.kpi.stop")} value={String(withStop)} sub={t("acc.kpi.stop.sub")} accent="gold" icon={<CalendarClock size={20} />} />
        <Kpi label={t("acc.kpi.days")} value={`${lostDays} j`} sub={t("acc.kpi.days.sub")} accent="sage" icon={<AlertTriangle size={20} />} />
        <Kpi label={t("acc.kpi.notDeclared")} value={String(notDeclared)} sub={t("acc.kpi.notDeclared.sub")} accent={notDeclared > 0 ? "destructive" : "primary"} icon={<ShieldAlert size={20} />} />
      </div>

      <Card>
        <CardContent className="pt-5">
          {accidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("acc.empty")}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("acc.col.date")}</Th>
                  <Th>{t("acc.col.victim")}</Th>
                  <Th>{t("acc.col.severity")}</Th>
                  <Th>{t("acc.col.stop")}</Th>
                  <Th>{t("acc.col.declared")}</Th>
                  <Th>{t("cmp.col.status")}</Th>
                  <Th className="text-right">{t("acc.col.actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {accidents.map((a) => {
                  const emp = empById.get(a.employee_id);
                  return (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <Td className="whitespace-nowrap">
                        {dateFr(a.date)}
                        {a.time && <span className="text-muted-foreground"> · {a.time}</span>}
                      </Td>
                      <Td>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</Td>
                      <Td><Badge tone={SEVERITY_TONE[a.severity]}>{t(SEVERITY_KEY[a.severity])}</Badge></Td>
                      <Td className="num">{a.work_stoppage ? `${a.stoppage_days ?? 0} j` : "—"}</Td>
                      <Td>
                        {a.declared ? (
                          <Badge tone="success">{t("acc.col.declared")}</Badge>
                        ) : (
                          <Badge tone="destructive">{t("acc.notDeclared")}</Badge>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={a.status === "clos" ? "muted" : "warning"}>
                          {a.status === "clos" ? t("acc.f.closed") : t("acc.f.open")}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" title={t("btn.edit")} onClick={() => setEditing(a)}>
                            <Pencil size={15} />
                          </Button>
                          <Button size="icon" variant="ghost" title={t("btn.delete")} onClick={() => remove(a.id)}>
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

      <p className="mt-4 text-xs text-muted-foreground">
        {t("acc.note")}
      </p>

      {editing && (
        <AccidentForm
          key={editing.id}
          initial={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSave={(a) => { actions.upsertWorkAccident(a); setEditing(null); }}
        />
      )}
    </div>
  );
}

function AccidentForm({
  initial,
  employees,
  onClose,
  onSave,
}: {
  initial: WorkAccident;
  employees: { id: string; first_name: string; last_name: string }[];
  onClose: () => void;
  onSave: (a: WorkAccident) => void;
}) {
  const t = useT();
  const [f, setF] = useState<WorkAccident>(initial);
  const set = (patch: Partial<WorkAccident>) => setF((prev) => ({ ...prev, ...patch }));

  const canSave = f.employee_id && f.date && f.circumstances.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      ...f,
      stoppage_days: f.work_stoppage ? f.stoppage_days ?? 0 : undefined,
      declaration_date: f.declared ? f.declaration_date : undefined,
      declaration_ref: f.declared ? f.declaration_ref : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-2xl scrollbar-thin"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-display">{t("acc.form.title")}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="space-y-4">
          <Field label={t("acc.f.victim")}>
            <Select value={f.employee_id} onChange={(e) => set({ employee_id: e.target.value })}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("acc.f.date")}>
              <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label={t("acc.f.time")}>
              <Input type="time" value={f.time ?? ""} onChange={(e) => set({ time: e.target.value })} />
            </Field>
          </div>

          <Field label={t("acc.f.place")}>
            <Input value={f.location ?? ""} onChange={(e) => set({ location: e.target.value })} placeholder="Chantier, atelier, poste…" />
          </Field>

          <Field label={t("acc.f.circumstances")}>
            <Textarea value={f.circumstances} onChange={(e) => set({ circumstances: e.target.value })} placeholder="Comment l'accident est survenu…" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("acc.f.injuryNature")}>
              <Input value={f.injury_nature ?? ""} onChange={(e) => set({ injury_nature: e.target.value })} placeholder="Fracture, brûlure, coupure…" />
            </Field>
            <Field label={t("acc.f.injurySite")}>
              <Input value={f.injury_site ?? ""} onChange={(e) => set({ injury_site: e.target.value })} placeholder="Main droite, dos…" />
            </Field>
          </div>

          <Field label={t("acc.f.witnesses")}>
            <Input value={f.witnesses ?? ""} onChange={(e) => set({ witnesses: e.target.value })} placeholder="Nom(s) des témoins éventuels" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("acc.col.severity")}>
              <Select value={f.severity} onChange={(e) => set({ severity: e.target.value as WorkAccidentSeverity })}>
                <option value="benin">{t("acc.sev.benin")}</option>
                <option value="avec_arret">{t("acc.sev.avec_arret")}</option>
                <option value="grave">{t("acc.sev.grave")}</option>
                <option value="mortel">{t("acc.sev.mortel")}</option>
              </Select>
            </Field>
            <Field label={t("acc.f.status")}>
              <Select value={f.status} onChange={(e) => set({ status: e.target.value as WorkAccidentStatus })}>
                <option value="ouvert">{t("acc.f.open")}</option>
                <option value="clos">{t("acc.f.closed")}</option>
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.work_stoppage} onChange={(e) => set({ work_stoppage: e.target.checked })} />
            {t("acc.f.stopCheck")}
          </label>
          {f.work_stoppage && (
            <Field label={t("acc.f.stopDays")}>
              <Input type="number" min={0} value={f.stoppage_days ?? 0} onChange={(e) => set({ stoppage_days: +e.target.value })} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.declared} onChange={(e) => set({ declared: e.target.checked })} />
            {t("acc.f.declCheck")}
          </label>
          {f.declared && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("acc.f.declDate")}>
                <Input type="date" value={f.declaration_date ?? ""} onChange={(e) => set({ declaration_date: e.target.value })} />
              </Field>
              <Field label={t("acc.f.declRef")}>
                <Input value={f.declaration_ref ?? ""} onChange={(e) => set({ declaration_ref: e.target.value })} placeholder="N° de dossier" />
              </Field>
            </div>
          )}

          <Field label={t("acc.f.notes")}>
            <Textarea value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Suites, mesures de prévention…" />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t("btn.cancel")}</Button>
          <Button type="submit" disabled={!canSave}>{t("btn.save")}</Button>
        </div>
      </form>
    </div>
  );
}
