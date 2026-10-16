import {
  Activity,
  ShieldAlert,
  FileDown,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Target,
  Cpu,
  Hand,
  Camera,
  Radio,
} from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { actions, currentFirm, useStore } from "@/data/store";
import { nonDeclaresOfFirm } from "@/lib/non-declares";
import {
  AUTOMATION_LABEL, CATEGORY_LABEL, CONTROL_TYPE_LABEL, RISK_DISCLAIMER, STEPS, STEP_LABEL,
  buildRiskMap, controlGaps, criticityMatrix, exposure,
  type AssessedRisk, type RiskStep,
} from "@/lib/risk-engine";
import { DEFAULT_APPETITE, LEVEL_LABEL, LEVEL_ORDER, MAX_ABATEMENT_POINTS, levelOf, type RiskLevel } from "@/lib/risk-params";
import { FACT_LABEL, collectRiskFacts } from "@/lib/risk-facts";
import { exportRiskPdf, exportRiskXlsx } from "@/lib/risk-export";
import { exportEvaluationPdf } from "@/lib/risk-evaluation-export";
import { traceAndArchivePdf } from "@/lib/doc-archive";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Kpi, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { useCanWrite } from "@/lib/auth";
import { ActionPlanCard, CustomRisksCard, ImprovementCard } from "@/components/RiskPanels";

/** Tons du kit par niveau — sémantique de gravité, distincte de la couleur de marque. */
const LEVEL_TONE: Record<RiskLevel, Parameters<typeof Badge>[0]["tone"]> = {
  faible: "success",
  modere: "sage",
  eleve: "warning",
  critique: "destructive",
};

/** Fond de case de la matrice — la gravité se lit à l'intensité, pas seulement au chiffre. */
const LEVEL_CELL: Record<RiskLevel, string> = {
  faible: "bg-success/10 border-success/25",
  modere: "bg-sage/15 border-sage/30",
  eleve: "bg-warning/15 border-warning/35",
  critique: "bg-destructive/15 border-destructive/40",
};

export default function Risks() {
  const s = useStore();
  const firm = currentFirm(s);

  // Date d'arrêté figée au rendu : la cartographie doit être reproductible d'une édition à
  // l'autre, ce que ne permettrait pas un `new Date()` disséminé dans le moteur.
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [appetite, setAppetite] = useState(DEFAULT_APPETITE);
  const [stepFilter, setStepFilter] = useState<"all" | RiskStep>("all");
  const [view, setView] = useState<"gross" | "residual">("residual");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = useCanWrite();
  const customRisks = useMemo(
    () => (s.customRisks ?? []).filter((c) => c.firm_id === firm.id),
    [s.customRisks, firm.id],
  );
  const riskActions = useMemo(
    () => (s.riskActions ?? []).filter((a) => a.firm_id === firm.id),
    [s.riskActions, firm.id],
  );
  const snapshots = useMemo(
    () => (s.riskSnapshots ?? []).filter((x) => x.firm_id === firm.id).sort((a, b) => a.asOf.localeCompare(b.asOf)),
    [s.riskSnapshots, firm.id],
  );

  const facts = useMemo(() => collectRiskFacts(s, firm, asOf), [s, firm, asOf]);
  const all = useMemo(() => buildRiskMap(facts, appetite, undefined, customRisks), [facts, appetite, customRisks]);
  const risks = useMemo(
    () => (stepFilter === "all" ? all : all.filter((r) => r.step === stepFilter)),
    [all, stepFilter],
  );

  const e = useMemo(() => exposure(risks), [risks]);
  const gaps = useMemo(() => controlGaps(risks), [risks]);
  const grid = useMemo(() => criticityMatrix(risks, view), [risks, view]);

  // Volet VIVANT : chaque fait est relu depuis l'état réel à chaque rendu
  // (le store notifie via useSyncExternalStore). `recomputedAt` prouve la
  // fraîcheur ; le flux liste les dernières actions des autres volets qui
  // ont fait bouger un fait, avec lien direct vers le volet source.
  const [recomputedAt, setRecomputedAt] = useState(() => new Date().toISOString());
  useEffect(() => { setRecomputedAt(new Date().toISOString()); }, [s, firm.id, asOf]);
  const ndCount = useMemo(() => nonDeclaresOfFirm(s, firm.id).length, [s, firm.id]);
  const ndPayCount = useMemo(
    () => (s.nonDeclarePayments ?? []).filter((p) => p.firm_id === firm.id).length,
    [s.nonDeclarePayments, firm.id],
  );
  const liveFeed = useMemo(() => {
    const items: { at: string; label: string; to: string }[] = [];
    for (const a of (s.attachments ?? []).filter((x) => x.firm_id === firm.id).slice(-3))
      items.push({ at: a.uploaded_at, label: `Pièce ${a.kind} déposée (${a.filename})`, to: "/employees" });
    for (const cl of (s.accountingClosures ?? []).filter((x) => x.firm_id === firm.id).slice(-2))
      items.push({ at: cl.validated_at, label: `Écritures ${cl.year}-${String(cl.month).padStart(2, "0")} verrouillées`, to: "/accounting" });
    for (const p of (s.nonDeclarePayments ?? []).filter((x) => x.firm_id === firm.id).slice(-3))
      items.push({ at: p.created_at, label: `Versement interne ${p.year}-${String(p.month).padStart(2, "0")} (${p.net_verse} DH)`, to: "/non-declares" });
    for (const d of (s.docGenerations ?? []).filter((x) => x.firm_id === firm.id).slice(-2))
      items.push({ at: d.at, label: `Document ${d.doc_type} produit (${d.subject ?? ""})`, to: "/documents-log" });
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
  }, [s, firm.id]);

  async function onPdf() {
    setBusy(true);
    try {
      await traceAndArchivePdf(
        { firm, docType: "regularisation", format: "pdf", subject: `Cartographie des risques - ${asOf}` },
        () => exportRiskPdf({ firm, risks, appetite, asOf, actions: riskActions, snapshots }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onEvalPdf() {
    setBusy(true);
    try {
      await traceAndArchivePdf(
        { firm, docType: "regularisation", format: "pdf", subject: `Formulaire d'évaluation des risques - ${asOf}` },
        () => exportEvaluationPdf({ firm, asOf, appetite, risks: all, s }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cartographie des risques"
        subtitle={`Processus paie · ${firm.name} · arrêtée au ${asOf}`}
      >
        <Button variant="outline" onClick={() => exportRiskXlsx({ firm, risks, appetite, asOf, actions: riskActions, snapshots })}>
          <FileSpreadsheet size={16} /> Excel
        </Button>
        <Button onClick={() => void onPdf()} disabled={busy}>
          <FileDown size={16} /> PDF
        </Button>
        <Button
          variant="sage"
          onClick={() => void onEvalPdf()}
          disabled={busy}
          title="Formulaire exhaustif d'évaluation : 16 fiches action du plan 2.4 avec indicateurs Tableau 13 relevés en direct."
        >
          <FileDown size={16} /> Formulaire d'évaluation
        </Button>
        <Button
          variant="sage"
          disabled={!canEdit}
          title="Fige l'exposition du jour pour pouvoir la comparer aux mesures suivantes."
          onClick={() => {
            actions.addRiskSnapshot({
              firm_id: firm.id, asOf, appetite,
              count: e.count, grossTotal: e.grossTotal, residualTotal: e.residualTotal,
              aboveAppetite: e.aboveAppetite, controlsProven: e.controlsProven, controlsTotal: e.controlsTotal,
              residualByLevel: { ...e.residualByLevel },
            });
          }}
        >
          <Camera size={16} /> Figer un point de mesure
        </Button>
      </PageHeader>

      {/* Paramètres de la cartographie */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date d'arrêté
            <input
              type="date"
              value={asOf}
              onChange={(ev) => setAsOf(ev.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Périmètre
            <Select value={stepFilter} onChange={(ev) => setStepFilter(ev.target.value as typeof stepFilter)} className="w-full sm:w-64">
              <option value="all">Tout le processus</option>
              {STEPS.map((st) => (
                <option key={st} value={st}>{STEP_LABEL[st]}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Appétence — score résiduel maximal accepté
            <Select value={String(appetite)} onChange={(ev) => setAppetite(Number(ev.target.value))} className="w-full sm:w-64">
              <option value="4">4 — n'accepter que le faible</option>
              <option value="9">9 — accepter jusqu'au modéré (défaut)</option>
              <option value="14">14 — accepter jusqu'à l'élevé</option>
            </Select>
          </label>
          <p className="ml-auto max-w-md text-xs leading-relaxed text-muted-foreground">
            L'appétence est une décision de direction, pas un paramètre technique. Tout risque
            au-dessus appelle un plan de traitement daté et affecté.
          </p>
        </CardContent>
      </Card>

      {/* Exposition */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Exposition brute" value={String(e.grossTotal)} icon={<ShieldAlert size={18} />} sub={`${e.count} risques cotés à dispositif nul`} />
        <Kpi label="Exposition résiduelle" value={String(e.residualTotal)} icon={<TrendingDown size={18} />} sub={`−${e.reductionPct} % après contrôles`} />
        <Kpi
          label="Hors appétence"
          value={String(e.aboveAppetite)}
          icon={<Target size={18} />}
          sub={e.aboveAppetite > 0 ? "Plan de traitement requis" : "Tous les résiduels sont acceptés"}
          accent={e.aboveAppetite > 0 ? "destructive" : "sage"}
        />
        <Kpi label="Contrôles prouvés" value={`${e.controlsProven}/${e.controlsTotal}`} icon={<CheckCircle2 size={18} />} sub="Un contrôle non prouvé n'abat rien" />
      </div>

      {/* Volet vivant : recalculé depuis l'état réel + actions sources */}
      <Card className="mb-6 border-sage/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio size={16} className="text-success" />
            En direct des autres volets
            <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> vivant
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Recalculé à l'instant ({recomputedAt.slice(11, 19)}) depuis l'état réel de {firm.name} — arrêté au {asOf}.
            Chaque action ci-dessous a fait bouger un fait, donc un résiduel. Changer la date d'arrêté rejoue l'historique.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone={facts.allDeclaredCnss ? "success" : "destructive"}>
              CNSS : {facts.allDeclaredCnss ? "tous déclarés" : `${ndCount} sans N° CNSS`}
            </Badge>
            <Badge tone={facts.payrollValidated ? "success" : "muted"}>
              Paie : {facts.payrollValidated ? "dernière close validée" : "dernière close en brouillon"}
            </Badge>
            <Badge tone={facts.accountingLocked ? "success" : "muted"}>
              Compta : {facts.accountingLocked ? "écritures verrouillées" : "non verrouillées"}
            </Badge>
            <Badge tone={facts.declarationsOnTime ? "success" : "warning"}>
              Déclarations : {facts.declarationsOnTime ? "à jour" : "échéance dépassée"}
            </Badge>
            <Badge tone="muted">Versements internes suivis : {ndPayCount}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {!facts.allDeclaredCnss && (<Link to="/non-declares" className="text-xs underline">Voir les non-déclarés →</Link>)}
            {!facts.payrollValidated && (<Link to="/payroll" className="text-xs underline">Valider la paie →</Link>)}
            {!facts.accountingLocked && (<Link to="/accounting" className="text-xs underline">Verrouiller les écritures →</Link>)}
            {!facts.declarationsOnTime && (<Link to="/declarations" className="text-xs underline">Régulariser les déclarations →</Link>)}
            <Link to="/employees" className="text-xs underline">Salariés (CNSS, sorties, pièces) →</Link>
            <Link to="/securite" className="text-xs underline">Sécurité RIB →</Link>
          </div>
          {liveFeed.length > 0 && (
            <ul className="space-y-1.5 border-t border-border/60 pt-3">
              {liveFeed.map((it, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <Activity size={13} className="text-muted-foreground" />
                  <span className="num text-muted-foreground">{it.at.slice(0, 10)}</span>
                  <span className="flex-1">{it.label}</span>
                  <Link to={it.to} className="underline">Ouvrir le volet</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Déplacement par niveau */}
        <Card>
          <CardHeader><CardTitle>Déplacement de l'exposition</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {LEVEL_ORDER.map((lvl) => {
                const g = e.grossByLevel[lvl];
                const r = e.residualByLevel[lvl];
                const max = Math.max(1, e.count);
                return (
                  <li key={lvl}>
                    <div className="flex items-center justify-between text-sm">
                      <Badge tone={LEVEL_TONE[lvl]}>{LEVEL_LABEL[lvl]}</Badge>
                      <span className="num text-muted-foreground">
                        {g} <span className="mx-1">→</span> <span className="font-semibold text-foreground">{r}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${(g / max) * 100}%` }} />
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(r / max) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Barre pâle : brut. Barre pleine : résiduel.
            </p>
          </CardContent>
        </Card>

        {/* Matrice de criticité */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Matrice de criticité</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant={view === "gross" ? "primary" : "outline"} onClick={() => setView("gross")}>Brut</Button>
                <Button size="sm" variant={view === "residual" ? "primary" : "outline"} onClick={() => setView("residual")}>Résiduel</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex gap-2">
                <div className="flex flex-col justify-around pb-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="rotate-180 [writing-mode:vertical-rl]">Impact</span>
                </div>
                <div className="min-w-[300px] flex-1">
                  {/* impact décroissant en ordonnée : le plus grave en haut */}
                  {[5, 4, 3, 2, 1].map((imp) => (
                    <div key={imp} className="mb-1 flex items-stretch gap-1">
                      <span className="w-4 shrink-0 self-center text-center text-[10px] num text-muted-foreground">{imp}</span>
                      {[1, 2, 3, 4, 5].map((lik) => {
                        const refs = grid[imp - 1][lik - 1];
                        const lvl = levelOf(imp * lik);
                        return (
                          <div
                            key={lik}
                            title={`Probabilité ${lik} × impact ${imp} = ${lik * imp} — ${LEVEL_LABEL[lvl]}`}
                            className={cn(
                              "flex min-h-[42px] flex-1 flex-wrap content-center justify-center gap-0.5 rounded border p-1",
                              LEVEL_CELL[lvl],
                            )}
                          >
                            {refs.map((ref) => (
                              <span key={ref} className="rounded bg-background/70 px-1 text-[10px] font-medium num">{ref}</span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div className="mt-1 flex gap-1 pl-5">
                    {[1, 2, 3, 4, 5].map((l) => (
                      <span key={l} className="flex-1 text-center text-[10px] num text-muted-foreground">{l}</span>
                    ))}
                  </div>
                  <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Probabilité</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Registre */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Registre des risques</CardTitle>
            <span className="text-xs text-muted-foreground">{risks.length} risques · cliquer une ligne pour voir son dispositif</span>
          </div>
        </CardHeader>
        <Table wide>
          <thead>
            <tr>
              <Th>Réf</Th>
              <Th>Étape</Th>
              <Th>Événement de risque</Th>
              <Th className="text-center">Brut</Th>
              <Th className="text-center">Dispositif</Th>
              <Th className="text-center">Résiduel</Th>
              <Th className="text-center">Écart</Th>
              <Th className="text-center">Traitement</Th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <RiskRow key={r.ref} risk={r} open={open === r.ref} onToggle={() => setOpen(open === r.ref ? null : r.ref)} />
            ))}
            {risks.length === 0 && (
              <tr><Td colSpan={8} className="py-8 text-center text-muted-foreground">Aucun risque sur ce périmètre.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {/* Angles morts */}
      {gaps.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle size={16} className="text-destructive" /> Angles morts — {gaps.length} contrôles qui n'abattent rien
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
              Ces contrôles figurent au dispositif mais rien ne prouve leur application. Ils ne sont pas
              neutres : ils créent l'illusion d'une maîtrise et détournent l'attention d'une exposition réelle.
            </p>
            <ul className="space-y-2">
              {gaps.map((g) => (
                <li key={g.control.label} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{g.control.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {g.control.note ?? (g.control.proof ? `À constater : ${FACT_LABEL[g.control.proof]}` : "Contrôle déclaratif, non constatable.")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="muted">{CONTROL_TYPE_LABEL[g.control.type]}</Badge>
                    <Badge tone="muted" title={`Abattrait ${g.potential.toFixed(2)} point(s) sur ${g.axis === "likelihood" ? "la probabilité" : "l'impact"}`}>
                      {g.axis === "likelihood" ? "probabilité" : "impact"} −{g.potential.toFixed(2)}
                    </Badge>
                    <Badge tone="warning">{g.refs.join(", ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Suivi de l'amélioration */}
      <ImprovementCard snapshots={snapshots} current={e} asOf={asOf} canEdit={canEdit} />

      {/* Risques saisis à la main */}
      <CustomRisksCard firmId={firm.id} risks={customRisks} canEdit={canEdit} />

      {/* Plan de traitement */}
      <ActionPlanCard
        firmId={firm.id}
        plan={riskActions}
        openRefs={all.filter((r) => r.aboveAppetite).map((r) => r.ref)}
        asOf={asOf}
        canEdit={canEdit}
      />

      {/* Méthode */}
      <Card>
        <CardHeader><CardTitle>Méthode et réserve</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Le résiduel se calcule, il ne se déclare pas.</strong> Le brut
            est coté à dispositif nul — comme si aucun contrôle n'existait. Un contrôle préventif abat la
            probabilité, un contrôle détectif ou correctif abat l'impact, à hauteur de son poids multiplié
            par son degré d'automatisation.
          </p>
          <p>
            L'abattement est plafonné à {MAX_ABATEMENT_POINTS} points par axe, plancher 1 : un risque coté
            5 × 5 = 25 descend au mieux à 3 × 3 = 9. Aucun dispositif ne fait descendre un risque critique
            au niveau négligeable — et un contrôle non prouvé n'abat rien du tout.
          </p>
          <p className="text-xs">{RISK_DISCLAIMER}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Une ligne du registre, dépliable sur le détail de son dispositif de maîtrise. */
function RiskRow({ risk: r, open, onToggle }: { risk: AssessedRisk; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <Td className="num text-xs font-semibold">
          <span className="inline-flex items-center gap-1">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {r.ref}
          </span>
        </Td>
        <Td className="text-xs text-muted-foreground whitespace-nowrap">{STEP_LABEL[r.step]}</Td>
        <Td className="max-w-xl">
          <p className="text-sm">{r.event}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]} · {r.basis}</p>
        </Td>
        <Td className="text-center whitespace-nowrap">
          <div className="num text-sm">{r.grossLikelihood} × {r.grossImpact} = <strong>{r.grossScore}</strong></div>
          <Badge tone={LEVEL_TONE[r.grossLevel]} className="mt-1">{LEVEL_LABEL[r.grossLevel]}</Badge>
        </Td>
        <Td className="text-center whitespace-nowrap text-xs">
          <span className={cn("num font-medium", r.provenCount === 0 && "text-destructive")}>
            {r.provenCount}/{r.assessedControls.length}
          </span>
          <p className="text-muted-foreground">prouvés</p>
        </Td>
        <Td className="text-center whitespace-nowrap">
          <div className="num text-sm">{r.residualLikelihood} × {r.residualImpact} = <strong>{r.residualScore}</strong></div>
          <Badge tone={LEVEL_TONE[r.residualLevel]} className="mt-1">{LEVEL_LABEL[r.residualLevel]}</Badge>
        </Td>
        <Td className="text-center whitespace-nowrap num text-sm">
          {r.reduction > 0 ? <span className="text-success">−{r.reduction} <span className="text-xs">({r.reductionPct} %)</span></span> : <span className="text-muted-foreground">—</span>}
        </Td>
        <Td className="text-center whitespace-nowrap">
          <Badge tone={r.aboveAppetite ? "destructive" : "success"}>{r.aboveAppetite ? "Réduire" : "Accepter"}</Badge>
        </Td>
      </tr>
      {open && (
        <tr className="bg-muted/25">
          <Td colSpan={8} className="px-4 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dispositif de maîtrise — abattement appliqué : probabilité −{r.abatementLikelihood}, impact −{r.abatementImpact}
            </p>
            <ul className="space-y-2">
              {r.assessedControls.map((ct) => (
                <li
                  key={ct.id}
                  className={cn(
                    "flex flex-wrap items-start gap-2 rounded-md border px-3 py-2",
                    ct.proven ? "border-success/30 bg-success/5" : "border-border/60 bg-background",
                  )}
                >
                  {ct.proven
                    ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                    : <XCircle size={15} className="mt-0.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{ct.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ct.proven
                        ? `Prouvé — ${ct.proof ? FACT_LABEL[ct.proof] : ""}`
                        : ct.note ?? (ct.proof ? `Non prouvé — attendu : ${FACT_LABEL[ct.proof]}` : "Contrôle déclaratif : jamais crédité.")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="muted" title={ct.axis === "likelihood" ? "Réduit la probabilité" : "Réduit l'impact"}>
                      {CONTROL_TYPE_LABEL[ct.type]}
                    </Badge>
                    <Badge tone="muted" className="gap-1">
                      {ct.automation === "manuel" ? <Hand size={11} /> : <Cpu size={11} />} {AUTOMATION_LABEL[ct.automation]}
                    </Badge>
                    <Badge tone={ct.proven ? "sage" : "muted"} className="num">
                      {ct.proven ? `−${ct.abatement.toFixed(2)}` : "0"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Td>
        </tr>
      )}
    </>
  );
}
