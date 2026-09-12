import { useState } from "react";
import { Plus, Trash2, ListChecks, PencilLine, X, TrendingDown, XCircle, Target } from "lucide-react";
import { actions, uid } from "@/data/store";
import {
  CATEGORY_LABEL, STEPS, STEP_LABEL, nextCustomRef,
  type RiskExposure, type RiskStep,
} from "@/lib/risk-engine";
import { IMPACT_SCALE, LEVEL_LABEL, LIKELIHOOD_SCALE, levelOf, type RiskLevel } from "@/lib/risk-params";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CustomRisk, CustomRiskControl, RiskAction, RiskActionStatus, RiskSnapshot } from "@/data/types";

const LEVEL_TONE: Record<RiskLevel, Parameters<typeof Badge>[0]["tone"]> = {
  faible: "success", modere: "sage", eleve: "warning", critique: "destructive",
};

/* ============================================================ suivi de l'amélioration ============================================================ */

/**
 * Série des instantanés datés. Sans point de comparaison, un score résiduel ne dit pas si le
 * dispositif progresse ou se dégrade — c'est cette série, et elle seule, qui rend l'amélioration
 * lisible.
 */
export function ImprovementCard({
  snapshots, current, asOf, canEdit,
}: {
  snapshots: RiskSnapshot[];
  current: RiskExposure;
  asOf: string;
  canEdit: boolean;
}) {
  const last = snapshots[snapshots.length - 1];
  const delta = last ? current.residualTotal - last.residualTotal : null;
  const max = Math.max(1, ...snapshots.map((x) => x.grossTotal), current.grossTotal);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingDown size={16} className="text-primary" /> Suivi de l'amélioration
          </CardTitle>
          {last && (
            <span className="text-xs text-muted-foreground">
              Dernier point : {dateFr(last.asOf)} — résiduel {last.residualTotal}
              {delta !== null && (
                <strong className={cn("ml-2", delta < 0 ? "text-success" : delta > 0 ? "text-destructive" : "")}>
                  {delta > 0 ? "+" : ""}{delta} depuis
                </strong>
              )}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun point de mesure. Figez un instantané pour commencer à suivre l'évolution : la
            cartographie du jour ne dit rien de la tendance tant qu'elle est seule.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {snapshots.map((sn, i) => {
                const prev = i > 0 ? snapshots[i - 1] : null;
                const d = prev ? sn.residualTotal - prev.residualTotal : null;
                return (
                  <li key={sn.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{dateFr(sn.asOf)}</span>
                      <span className="num text-xs text-muted-foreground">
                        brut {sn.grossTotal} · résiduel <strong className="text-foreground">{sn.residualTotal}</strong>
                        {d !== null && (
                          <span className={cn("ml-1.5", d < 0 ? "text-success" : d > 0 ? "text-destructive" : "")}>
                            ({d > 0 ? "+" : ""}{d})
                          </span>
                        )}
                        {" · "}{sn.controlsProven}/{sn.controlsTotal} contrôles · {sn.aboveAppetite} hors appétence
                      </span>
                    </div>
                    <div className="mt-1 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${(sn.grossTotal / max) * 100}%` }} />
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(sn.residualTotal / max) * 100}%` }} />
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => actions.removeRiskSnapshot(sn.id)}
                      >
                        retirer ce point
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Barre pâle : exposition brute. Barre pleine : résiduelle. Position au {dateFr(asOf)} :
              brut {current.grossTotal}, résiduel {current.residualTotal}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================ fiche de saisie ============================================================ */

const emptyControl = (): CustomRiskControl => ({
  id: uid("ctl"), label: "", type: "preventif", automation: "manuel", strength: "moyen", proven: false, evidence: "",
});

/**
 * Risques propres à l'entité, en complément du référentiel intégré. Ils sont cotés, exportés et
 * suivis exactement comme les autres — un risque local n'est pas un citoyen de seconde zone.
 */
export function CustomRisksCard({
  firmId, risks, canEdit,
}: {
  firmId: string;
  risks: CustomRisk[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<CustomRisk | null>(null);

  const blank = (): CustomRisk => ({
    id: uid("crisk"), firm_id: firmId, ref: nextCustomRef(risks),
    step: "collecte", category: "operationnel", event: "", basis: "",
    grossLikelihood: 3, grossImpact: 3, controls: [emptyControl()],
    created_at: new Date().toISOString(),
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <PencilLine size={16} className="text-primary" /> Risques saisis — {risks.length}
          </CardTitle>
          <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setDraft(blank())}>
            <Plus size={15} /> Ajouter un risque
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun risque saisi. Le référentiel intégré couvre le processus paie standard ; ajoutez
            ici ce qui est propre à l'entité — un chantier, un client, une organisation particulière.
          </p>
        ) : (
          <ul className="space-y-2">
            {risks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
                <Badge tone="primary" className="num shrink-0">{c.ref}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.event || <em className="text-muted-foreground">sans énoncé</em>}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {STEP_LABEL[c.step as RiskStep] ?? c.step}
                    {" · "}{CATEGORY_LABEL[c.category as keyof typeof CATEGORY_LABEL] ?? c.category}
                    {" · "}brut {c.grossLikelihood} × {c.grossImpact} = {c.grossLikelihood * c.grossImpact}
                    {" · "}{c.controls.length} contrôle(s)
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" title="Modifier" onClick={() => setDraft({ ...c })}>
                      <PencilLine size={15} />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="text-destructive" title="Supprimer"
                      onClick={() => { if (confirm(`Supprimer le risque ${c.ref} ?`)) actions.removeCustomRisk(c.id); }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {draft && <CustomRiskForm draft={draft} onChange={setDraft} onClose={() => setDraft(null)} />}
    </Card>
  );
}

/** Formulaire de saisie d'un risque, en volet modal. */
function CustomRiskForm({
  draft, onChange, onClose,
}: {
  draft: CustomRisk;
  onChange: (c: CustomRisk) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<CustomRisk>) => onChange({ ...draft, ...patch });
  const setCtl = (id: string, patch: Partial<CustomRiskControl>) =>
    set({ controls: draft.controls.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const valid = draft.event.trim().length > 5;
  const score = draft.grossLikelihood * draft.grossImpact;

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-foreground/40 p-4" onClick={onClose}>
      <div className="my-8 h-fit w-full max-w-3xl rounded-lg bg-card p-4 shadow-2xl sm:p-6" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display">Fiche de risque {draft.ref}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Coté à dispositif NUL — comme si aucun contrôle n'existait. C'est le point où la
              plupart des cartographies dérapent, en cotant la situation observée aujourd'hui.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Étape du processus" hint="Un risque se rattache à une étape, jamais à un service.">
            <Select value={draft.step} onChange={(ev) => set({ step: ev.target.value })}>
              {STEPS.map((st) => <option key={st} value={st}>{STEP_LABEL[st]}</option>)}
            </Select>
          </Field>
          <Field label="Catégorie">
            <Select value={draft.category} onChange={(ev) => set({ category: ev.target.value })}>
              {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Événement de risque" hint="[cause] → [événement redouté] → [conséquence chiffrable].">
            <Textarea
              rows={3}
              value={draft.event}
              placeholder="Absence de contrôle des entrées → un salarié embauché n'est pas déclaré → majoration et astreinte."
              onChange={(ev) => set({ event: ev.target.value })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Base normative" hint="Article vérifié, ou « à confirmer » — jamais une référence inventée.">
            <Input value={draft.basis} placeholder="art. 24 du Code du travail" onChange={(ev) => set({ basis: ev.target.value })} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
          <Field label="Probabilité brute">
            <Select value={String(draft.grossLikelihood)} onChange={(ev) => set({ grossLikelihood: Number(ev.target.value) })}>
              {LIKELIHOOD_SCALE.map((x) => <option key={x.value} value={x.value} title={x.anchor}>{x.value} — {x.label}</option>)}
            </Select>
          </Field>
          <Field label="Impact brut">
            <Select value={String(draft.grossImpact)} onChange={(ev) => set({ grossImpact: Number(ev.target.value) })}>
              {IMPACT_SCALE.map((x) => <option key={x.value} value={x.value} title={x.anchor}>{x.value} — {x.label}</option>)}
            </Select>
          </Field>
          <div className="flex flex-col justify-end">
            <p className="text-xs text-muted-foreground">Score brut</p>
            <p className="num text-2xl font-semibold leading-tight">{score}</p>
            <Badge tone={LEVEL_TONE[levelOf(score)]} className="mt-1 self-start">{LEVEL_LABEL[levelOf(score)]}</Badge>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Dispositif de maîtrise</h3>
            <Button size="sm" variant="outline" onClick={() => set({ controls: [...draft.controls, emptyControl()] })}>
              <Plus size={14} /> Contrôle
            </Button>
          </div>
          <ul className="space-y-3">
            {draft.controls.map((c) => (
              <li key={c.id} className="rounded-md border border-border/60 p-3">
                <div className="flex gap-2">
                  <Input
                    className="flex-1" value={c.label} placeholder="Intitulé du contrôle"
                    onChange={(ev) => setCtl(c.id, { label: ev.target.value })}
                  />
                  <Button
                    variant="ghost" size="icon" className="text-destructive"
                    onClick={() => set({ controls: draft.controls.filter((x) => x.id !== c.id) })}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select value={c.type} onChange={(ev) => setCtl(c.id, { type: ev.target.value })}>
                    <option value="preventif">Préventif — abat la probabilité</option>
                    <option value="detectif">Détectif — abat l'impact</option>
                    <option value="correctif">Correctif — abat l'impact</option>
                  </Select>
                  <Select value={c.automation} onChange={(ev) => setCtl(c.id, { automation: ev.target.value })}>
                    <option value="automatique">Automatique (x1,00)</option>
                    <option value="semi">Semi-automatique (x0,75)</option>
                    <option value="manuel">Manuel (x0,50)</option>
                  </Select>
                  <Select value={c.strength} onChange={(ev) => setCtl(c.id, { strength: ev.target.value })}>
                    <option value="fort">Fort — bloquant (1,5)</option>
                    <option value="moyen">Moyen — systématique (1,0)</option>
                    <option value="faible">Faible — ponctuel (0,5)</option>
                  </Select>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.proven} onChange={(ev) => setCtl(c.id, { proven: ev.target.checked })} />
                  Contrôle réellement appliqué
                </label>
                {c.proven && (
                  <div className="mt-2">
                    <Input
                      value={c.evidence ?? ""}
                      placeholder="Preuve : PV de revue du 12/03, export daté, capture du paramétrage…"
                      onChange={(ev) => setCtl(c.id, { evidence: ev.target.value })}
                    />
                    {!c.evidence?.trim() && (
                      <p className="mt-1 text-xs text-destructive">
                        Sans preuve écrite, ce contrôle n'abattra rien : un contrôle non prouvé masque
                        le risque au lieu de le réduire.
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            disabled={!valid}
            title={valid ? undefined : "L'événement de risque doit être formulé."}
            onClick={() => { actions.upsertCustomRisk(draft); onClose(); }}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ plan de traitement ============================================================ */

const ACTION_STATUS: { value: RiskActionStatus; label: string }[] = [
  { value: "a_lancer", label: "À lancer" },
  { value: "en_cours", label: "En cours" },
  { value: "fait", label: "Fait" },
  { value: "abandonne", label: "Abandonnée" },
];

/**
 * Plan de traitement. Un plan sans responsable nommé ni échéance datée n'est pas un plan : les
 * deux sont donc obligatoires à l'enregistrement. Les risques hors appétence sans action, et les
 * actions en retard, sont signalés — c'est là que le plan se périme en silence.
 */
export function ActionPlanCard({
  firmId, plan, openRefs, asOf, canEdit,
}: {
  firmId: string;
  plan: RiskAction[];
  openRefs: string[];
  asOf: string;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<RiskAction | null>(null);
  const covered = new Set(plan.filter((a) => a.status !== "abandonne").map((a) => a.risk_ref));
  const uncovered = openRefs.filter((r) => !covered.has(r));
  const isLate = (a: RiskAction) => !!a.due && a.due < asOf && a.status !== "fait" && a.status !== "abandonne";
  const late = plan.filter(isLate);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListChecks size={16} className="text-primary" /> Plan de traitement — {plan.length} action(s)
          </CardTitle>
          <Button
            size="sm" variant="outline" disabled={!canEdit}
            onClick={() => setDraft({
              id: uid("act"), firm_id: firmId, risk_ref: openRefs[0] ?? "", action: "", owner: "",
              due: "", status: "a_lancer", progress: 0, created_at: new Date().toISOString(),
            })}
          >
            <Plus size={15} /> Ajouter une action
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {uncovered.length > 0 && (
          <p className="mb-3 flex items-start gap-1.5 text-xs text-destructive">
            <XCircle size={13} className="mt-0.5 shrink-0" />
            {uncovered.length} risque(s) hors appétence sans action : {uncovered.join(", ")}.
          </p>
        )}
        {late.length > 0 && (
          <p className="mb-3 flex items-start gap-1.5 text-xs text-warning">
            <Target size={13} className="mt-0.5 shrink-0" />
            {late.length} action(s) au-delà de leur échéance.
          </p>
        )}

        {plan.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune action. Un risque hors appétence appelle un plan daté et affecté — sans quoi
            l'acceptation est implicite, donc jamais assumée.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...plan].sort((a, b) => a.due.localeCompare(b.due)).map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
                <Badge tone="primary" className="num shrink-0">{a.risk_ref}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.owner || <span className="text-destructive">responsable non désigné</span>}
                    {" · "}
                    {a.due
                      ? <span className={isLate(a) ? "font-medium text-destructive" : ""}>
                          échéance {dateFr(a.due)}{isLate(a) ? " — dépassée" : ""}
                        </span>
                      : <span className="text-destructive">sans échéance</span>}
                  </p>
                  <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${a.progress}%` }} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Badge tone={a.status === "fait" ? "success" : a.status === "abandonne" ? "muted" : isLate(a) ? "destructive" : "warning"}>
                    {ACTION_STATUS.find((x) => x.value === a.status)?.label ?? a.status}
                  </Badge>
                  <span className="num text-xs text-muted-foreground">{a.progress} %</span>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" title="Modifier" onClick={() => setDraft({ ...a })}>
                        <PencilLine size={15} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="text-destructive" title="Supprimer"
                        onClick={() => actions.removeRiskAction(a.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setDraft(null)}>
          <div className="w-full max-w-lg rounded-lg bg-card p-4 shadow-2xl sm:p-6" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-display">Action de traitement</h2>
              <Button variant="ghost" size="icon" onClick={() => setDraft(null)}><X size={18} /></Button>
            </div>
            <div className="space-y-4">
              <Field label="Risque traité" hint="Référence du référentiel (R01…) ou d'un risque saisi (L01…).">
                <Input value={draft.risk_ref} onChange={(ev) => setDraft({ ...draft, risk_ref: ev.target.value.toUpperCase() })} />
              </Field>
              <Field label="Action">
                <Textarea rows={3} value={draft.action} onChange={(ev) => setDraft({ ...draft, action: ev.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Responsable" hint="Une personne nommée, pas un service.">
                  <Input value={draft.owner} onChange={(ev) => setDraft({ ...draft, owner: ev.target.value })} />
                </Field>
                <Field label="Échéance">
                  <Input type="date" value={draft.due} onChange={(ev) => setDraft({ ...draft, due: ev.target.value })} />
                </Field>
                <Field label="État">
                  <Select value={draft.status} onChange={(ev) => setDraft({ ...draft, status: ev.target.value as RiskActionStatus })}>
                    {ACTION_STATUS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </Select>
                </Field>
                <Field label="Avancement (%)">
                  <Input
                    type="number" min={0} max={100} value={draft.progress}
                    onChange={(ev) => setDraft({ ...draft, progress: Math.min(100, Math.max(0, Number(ev.target.value))) })}
                  />
                </Field>
              </div>
              <Field label="Notes (facultatif)">
                <Textarea rows={2} value={draft.notes ?? ""} onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>Annuler</Button>
              <Button
                disabled={!draft.action.trim() || !draft.owner.trim() || !draft.due}
                title="Un plan sans responsable nommé ni échéance datée n'est pas un plan."
                onClick={() => { actions.upsertRiskAction(draft); setDraft(null); }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
