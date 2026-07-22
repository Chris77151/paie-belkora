import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, Pencil, UserRound, X, Trash2, DownloadCloud, UploadCloud, Loader2,
  ArrowRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { actions, currentFirm, employeesOfFirm, uid, useStore } from "@/data/store";
import { useCanWrite } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import {
  odooImportEmployees, buildEmployeeSyncPlan, applyEmployeeSyncPlan,
  odooReadiness, odooErrorHint,
} from "@/lib/odoo";
import type { SyncPlan } from "@/lib/odoo";
import type { ContractType, Employee } from "@/data/types";
import {
  Badge, Button, Card, CardContent, Field, Input, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { dateFr, mad } from "@/lib/format";
import { getParams } from "@/lib/params";

const CONTRACTS: ContractType[] = ["CDI", "CDD", "ANAPEC", "Interim", "Stagiaire"];

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Salaire mensuel minimum légal selon le régime de la société (valeurs issues de params.ts). */
function regimeMonthlyMin(regime: "SMIG" | "SMAG"): number {
  const p = getParams(new Date().getFullYear());
  return regime === "SMAG"
    ? round2(p.smagDaily * p.smagMonthlyDays) // 93,68 × 26 = 2 435,68
    : round2(p.smigHourly * p.legalMonthlyHours); // 17,92 × 191 = 3 422,72
}

export default function Employees() {
  const s = useStore();
  const t = useT();
  const canEdit = useCanWrite(); // false pour le rôle « lecture seule »
  const firm = currentFirm(s);
  const all = employeesOfFirm(s, firm.id);
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [site, setSite] = useState("all");
  const [contract, setContract] = useState("all");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sites = useMemo(() => Array.from(new Set(all.map((e) => e.site).filter(Boolean))) as string[], [all]);

  async function prepareSync() {
    const cfgErr = odooReadiness(s.odoo, firm);
    if (cfgErr || !s.odoo || !firm.odoo_company_id) {
      alert(cfgErr ?? "Configuration Odoo incomplète.");
      return;
    }
    setSyncing(true);
    try {
      // Lecture-avant-écriture : construit un plan (dry-run), aucune donnée n'est écrite ici.
      const plan = await buildEmployeeSyncPlan(s.odoo, firm.odoo_company_id, all);
      setSyncPlan(plan);
    } catch (e) {
      alert(`Échec de la préparation de la synchronisation : ${odooErrorHint((e as Error).message)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function importFromOdoo() {
    const cfgErr = odooReadiness(s.odoo, firm);
    if (cfgErr || !s.odoo || !firm.odoo_company_id) {
      alert(cfgErr ?? "Configuration Odoo incomplète.");
      return;
    }
    setImporting(true);
    try {
      const imported = await odooImportEmployees(s.odoo, firm.odoo_company_id, firm.id);
      const { added, updated } = actions.mergeEmployees(imported);
      alert(`Import Odoo terminé : ${added} ajouté(s), ${updated} mis à jour (société « ${firm.name} »).`);
    } catch (e) {
      alert(`Échec de l'import Odoo : ${odooErrorHint((e as Error).message)}`);
    } finally {
      setImporting(false);
    }
  }

  const rows = all.filter((e) => {
    if (q && !`${e.first_name} ${e.last_name} ${e.matricule ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (site !== "all" && e.site !== site) return false;
    if (contract !== "all" && e.contract_type !== contract) return false;
    if (status === "active" && !e.is_active) return false;
    if (status === "inactive" && e.is_active) return false;
    return true;
  });

  function newEmployee() {
    const hours = getParams(new Date().getFullYear()).legalMonthlyHours;
    const monthlyMin = regimeMonthlyMin(firm.regime); // prérempli au minimum du régime, éditable
    setEditing({
      id: uid("emp"), firm_id: firm.id, first_name: "", last_name: "",
      hire_date: new Date().toISOString().slice(0, 10), contract_type: "CDI",
      base_hourly_rate: round6(monthlyMin / hours), monthly_hours: hours, dependents: 0, is_active: true,
    });
  }

  return (
    <div>
      <PageHeader title={t("page.employees.title")} subtitle={`${all.length} ${t("page.employees.count")} · ${firm.name}`}>
        <Button variant="outline" onClick={importFromOdoo} disabled={importing || !canEdit}>
          {importing ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />} {t("emp.importOdoo")}
        </Button>
        <Button variant="sage" onClick={prepareSync} disabled={syncing || !canEdit} title={t("emp.syncOdoo.hint")}>
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {t("emp.syncOdoo")}
        </Button>
        <Button onClick={newEmployee} disabled={!canEdit}><Plus size={16} /> {t("emp.new")}</Button>
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("emp.search")} className="pl-9" />
          </div>
          <Select value={site} onChange={(e) => setSite(e.target.value)} className="w-44">
            <option value="all">{t("emp.allSites")}</option>
            {sites.map((si) => <option key={si} value={si}>{si}</option>)}
          </Select>
          <Select value={contract} onChange={(e) => setContract(e.target.value)} className="w-40">
            <option value="all">{t("emp.allContracts")}</option>
            {CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="active">{t("emp.active")}</option>
            <option value="inactive">{t("emp.inactive")}</option>
            <option value="all">{t("emp.all")}</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{t("doc.employee")}</Th><Th>{t("emp.matricule")}</Th><Th>{t("emp.contract")}</Th><Th>{t("emp.site")}</Th>
              <Th className="text-right">{t("emp.hourlyRate")}</Th><Th>{t("emp.hire")}</Th><Th>{t("emp.compliance")}</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
                      {e.first_name[0]}{e.last_name[0]}
                    </span>
                    <div>
                      <div className="font-medium">{e.first_name} {e.last_name}</div>
                      <div className="text-xs text-muted-foreground">{e.position ?? "—"}</div>
                    </div>
                  </div>
                </Td>
                <Td className="text-muted-foreground">{e.matricule ?? "—"}</Td>
                <Td><Badge tone={e.contract_type === "CDI" ? "sage" : "muted"}>{e.contract_type}</Badge></Td>
                <Td className="text-muted-foreground">{e.site ?? "—"}</Td>
                <Td className="text-right num">{mad(e.base_hourly_rate)}</Td>
                <Td className="text-muted-foreground">{dateFr(e.hire_date)}</Td>
                <Td>
                  <div className="flex gap-1">
                    {!e.cnss_number && <Badge tone="destructive">CNSS</Badge>}
                    {!e.cin && <Badge tone="warning">CIN</Badge>}
                    {e.cnss_number && e.cin && <Badge tone="success">OK</Badge>}
                  </div>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ ...e })} disabled={!canEdit} title={canEdit ? undefined : t("header.readonly.hint")}><Pencil size={15} /></Button>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><Td className="text-center text-muted-foreground py-8" >{t("emp.empty")}</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {editing && <EmployeeDrawer emp={editing} onClose={() => setEditing(null)} />}
      {syncPlan && s.odoo && (
        <OdooSyncDialog
          plan={syncPlan}
          config={s.odoo}
          firmName={firm.name}
          onClose={() => setSyncPlan(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Dialogue de synchronisation app -> Odoo ---------------- */
const OP_META: Record<string, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  create: { label: "À créer", tone: "sage" },
  update: { label: "À compléter", tone: "warning" },
  unchanged: { label: "À jour", tone: "muted" },
  conflict: { label: "Conflit", tone: "destructive" },
};

function OdooSyncDialog({
  plan, config, firmName, onClose,
}: {
  plan: SyncPlan;
  config: NonNullable<ReturnType<typeof useStore>["odoo"]>;
  firmName: string;
  onClose: () => void;
}) {
  const t = useT();
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number; errors: { name: string; message: string }[] } | null>(null);

  const writable = plan.items.filter((i) => i.op === "create" || i.op === "update");
  const shown = plan.items.filter((i) => i.op !== "unchanged"); // on masque les "déjà à jour" (bruit)

  async function confirm() {
    setApplying(true);
    try {
      const res = await applyEmployeeSyncPlan(config, plan);
      actions.attachOdooIds(res.createdIds);
      setDone({ created: res.created, updated: res.updated, errors: res.errors });
    } catch (e) {
      setDone({ created: 0, updated: 0, errors: [{ name: "—", message: (e as Error).message }] });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-foreground/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="my-8 h-fit w-full max-w-3xl rounded-lg bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-display flex items-center gap-2">
              <UploadCloud size={18} className="text-sage" /> {t("emp.syncOdoo")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Société « {firmName} » · {plan.odooCount} salarié(s) lus dans Odoo (company_id {plan.companyId}).
              Odoo fait foi : aucune valeur existante n'est écrasée, on ne comble que les champs vides.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        {/* Récapitulatif */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCell label={t("emp.sync.create")} value={plan.summary.create} tone="sage" />
          <SummaryCell label={t("emp.sync.update")} value={plan.summary.update} tone="warning" />
          <SummaryCell label={t("emp.sync.unchanged")} value={plan.summary.unchanged} tone="muted" />
          <SummaryCell label={t("emp.sync.conflict")} value={plan.summary.conflict} tone="destructive" />
        </div>

        {done ? (
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 size={16} /> Synchronisation terminée : {done.created} créé(s), {done.updated} complété(s).
            </p>
            {done.errors.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle size={15} /> {done.errors.length} erreur(s) :
                </p>
                <ul className="mt-1 list-disc pl-6 text-xs text-muted-foreground">
                  {done.errors.map((er, i) => <li key={i}>{er.name} : {er.message}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={onClose}>{t("emp.close")}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[45vh] overflow-y-auto rounded-md border scrollbar-thin">
              <Table>
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <Th>{t("doc.employee")}</Th><Th>{t("emp.sync.colAction")}</Th><Th>{t("emp.sync.colMatch")}</Th><Th>{t("emp.sync.colPushed")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => (
                    <tr key={it.employee_id} className="align-top">
                      <Td className="font-medium">{it.name}</Td>
                      <Td><Badge tone={OP_META[it.op].tone}>{OP_META[it.op].label}</Badge></Td>
                      <Td className="text-xs text-muted-foreground">
                        {it.matchKey
                          ? <>par {it.matchKey}{" "}
                              <Badge tone={it.matchConfidence === "faible" ? "warning" : "muted"}>{it.matchConfidence}</Badge>
                              {it.odooId != null && <span className="ml-1">#{it.odooId}</span>}
                            </>
                          : "—"}
                      </Td>
                      <Td className="text-xs">
                        {it.changes.length === 0 ? (
                          <span className="text-muted-foreground">{it.note ?? "—"}</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {it.changes.map((c) => (
                              <li key={c.field} className="flex items-center gap-1.5">
                                <span className="font-medium">{c.label} :</span>
                                <span className="text-muted-foreground line-through">{c.odoo}</span>
                                <ArrowRight size={11} className="text-muted-foreground" />
                                <span className="text-foreground">{c.app}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><Td className="py-6 text-center text-muted-foreground">{t("emp.sync.allUpToDate")}</Td></tr>
                  )}
                </tbody>
              </Table>
            </div>

            {plan.summary.conflict > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {plan.summary.conflict} conflit(s) d'appariement (même enregistrement Odoo visé par 2 salariés) : ignorés,
                à lever manuellement (matricule/CIN distincts).
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {writable.length} écriture(s) seront envoyées à Odoo après confirmation. Rien n'a encore été écrit.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>{t("btn.cancel")}</Button>
                <Button variant="sage" onClick={confirm} disabled={applying || writable.length === 0}>
                  {applying ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  Confirmer &amp; écrire dans Odoo
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: number; tone: Parameters<typeof Badge>[0]["tone"] }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-center">
      <div className="text-xl font-semibold num">{value}</div>
      <Badge tone={tone} className="mt-1">{label}</Badge>
    </div>
  );
}

function EmployeeDrawer({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState<Employee>(emp);
  const set = (patch: Partial<Employee>) => setF((prev) => ({ ...prev, ...patch }));
  const isNew = !emp.first_name && !emp.last_name;

  // Régime de la société (SMIG / SMAG) -> preset proposé.
  const s = useStore();
  const regime = (s.firms.find((x) => x.id === f.firm_id) ?? currentFirm(s))?.regime ?? "SMIG";
  const smigMonthly = regimeMonthlyMin("SMIG");
  const smagMonthly = regimeMonthlyMin("SMAG");

  // Salaire mensuel saisi = ancre (anti-jitter) ; il pilote base_hourly_rate.
  const [salaireMensuel, setSalaireMensuel] = useState<number>(round2(emp.base_hourly_rate * emp.monthly_hours));
  const applyMonthly = (m: number) => {
    setSalaireMensuel(m);
    set({ base_hourly_rate: m > 0 && f.monthly_hours > 0 ? round6(m / f.monthly_hours) : 0 });
  };
  const applyHours = (h: number) => {
    set({ monthly_hours: h, base_hourly_rate: h > 0 ? round6(salaireMensuel / h) : 0 });
  };

  function save() {
    if (!f.first_name.trim() || !f.last_name.trim()) return;
    actions.upsertEmployee(f);
    onClose();
  }
  function remove() {
    if (confirm(`${t("emp.delete.confirm1")} ${f.first_name} ${f.last_name}${t("emp.delete.confirm2")}`)) {
      actions.removeEmployee(f.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-2xl scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display flex items-center gap-2">
            <UserRound size={18} className="text-primary" /> {isNew ? t("emp.new") : t("emp.edit")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("emp.firstName")}><Input value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} /></Field>
          <Field label={t("emp.lastName")}><Input value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} /></Field>
          <Field label={t("emp.matricule")}><Input value={f.matricule ?? ""} onChange={(e) => set({ matricule: e.target.value })} /></Field>
          <Field label={t("emp.position")}><Input value={f.position ?? ""} onChange={(e) => set({ position: e.target.value })} /></Field>
          <Field label={t("emp.cin")} hint={!f.cin ? t("emp.cin.hint") : undefined}>
            <Input value={f.cin ?? ""} onChange={(e) => set({ cin: e.target.value })} />
          </Field>
          <Field label={t("doc.cnss")} hint={!f.cnss_number ? t("emp.cnss.hint") : undefined}>
            <Input value={f.cnss_number ?? ""} onChange={(e) => set({ cnss_number: e.target.value })} />
          </Field>
          <Field label={t("emp.contractType")}>
            <Select value={f.contract_type} onChange={(e) => set({ contract_type: e.target.value as ContractType })}>
              {CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t("emp.site")}><Input value={f.site ?? ""} onChange={(e) => set({ site: e.target.value })} /></Field>
          <Field label={t("doc.hireDate")}><Input type="date" value={f.hire_date} onChange={(e) => set({ hire_date: e.target.value })} /></Field>
          {f.contract_type === "CDD" && (
            <Field label={t("emp.contractEnd")}><Input type="date" value={f.contract_end ?? ""} onChange={(e) => set({ contract_end: e.target.value })} /></Field>
          )}
          <Field label={t("emp.birth")}><Input type="date" value={f.birth_date ?? ""} onChange={(e) => set({ birth_date: e.target.value })} /></Field>
          <div className="col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Field label={t("emp.baseSalary")} hint={t("emp.baseSalary.hint")}>
              <Input type="number" step="0.01" min={0} value={salaireMensuel} onChange={(e) => applyMonthly(+e.target.value)} />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant={regime === "SMIG" ? "primary" : "outline"} onClick={() => applyMonthly(smigMonthly)}>
                SMIG · {mad(smigMonthly)}{regime === "SMIG" ? " · société" : ""}
              </Button>
              <Button type="button" size="sm" variant={regime === "SMAG" ? "primary" : "outline"} onClick={() => applyMonthly(smagMonthly)}>
                SMAG · {mad(smagMonthly)}{regime === "SMAG" ? " · société" : ""}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">{t("emp.hourlyComputed")} : {mad(f.base_hourly_rate)}/h</span>
            </div>
          </div>
          <Field label={t("emp.hoursMonth")} hint={t("emp.hoursMonth.hint")}><Input type="number" value={f.monthly_hours} onChange={(e) => applyHours(+e.target.value)} /></Field>
          <Field label={t("emp.dependents")}><Input type="number" min={0} max={6} value={f.dependents} onChange={(e) => set({ dependents: +e.target.value })} /></Field>
          <Field label={t("emp.rib")}><Input value={f.bank_rib ?? ""} onChange={(e) => set({ bank_rib: e.target.value })} /></Field>
          <Field label={t("emp.phone")}><Input value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> {t("emp.activeCheck")}
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.hazardous_site} onChange={(e) => set({ hazardous_site: e.target.checked })} /> {t("emp.hazardCheck")}
        </label>

        <div className="mt-6 flex items-center justify-between">
          {!isNew ? (
            <Button variant="ghost" onClick={remove} className="text-destructive"><Trash2 size={15} /> {t("btn.delete")}</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("btn.cancel")}</Button>
            <Button onClick={save}>{t("btn.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
