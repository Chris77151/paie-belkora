import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Gauge,
  AlertTriangle,
  ServerCog,
} from "@/components/icons";
import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { getAiConfig } from "@/lib/ai-agent";
import { isSupabaseConfigured } from "@/lib/supabase";
import { localBinaryIds } from "@/lib/blob-store";
import {
  DOMAINS, DOMAIN_LABEL, EFFORT_LABEL, ITGC_DISCLAIMER, SEVERITY_LABEL,
  buildItgcReport, prioritise,
  type ItgcFinding, type ItgcSeverity,
} from "@/lib/itgc-engine";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Kpi, PageHeader, Select,
} from "@/components/ui/kit";
import { cn } from "@/lib/cn";

const SEV_TONE: Record<ItgcSeverity, Parameters<typeof Badge>[0]["tone"]> = {
  critique: "destructive", majeur: "warning", mineur: "muted",
};

/**
 * Contrôles généraux informatiques — volet RÉSERVÉ au super administrateur.
 *
 * Le rapport est constaté sur l'état réel du système à chaque affichage, jamais déclaré. Un
 * contrôle que l'application ne sait pas tester est affiché « non évalué » et EXCLU du calcul
 * de maturité : sans cette règle, le score monterait quand l'outil devient aveugle.
 */
export default function Itgc() {
  const s = useStore();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [domainFilter, setDomainFilter] = useState<"all" | (typeof DOMAINS)[number]>("all");
  const [showSatisfied, setShowSatisfied] = useState(false);

  // Pièces dont le binaire ne vit que sur ce poste : lu depuis IndexedDB, hors de l'état.
  const [localOnly, setLocalOnly] = useState(0);
  useEffect(() => {
    let alive = true;
    void localBinaryIds().then((ids) => {
      if (!alive) return;
      setLocalOnly((s.attachments ?? []).filter((a) => ids.has(a.id)).length);
    });
    return () => { alive = false; };
  }, [s.attachments]);

  const report = useMemo(
    () => buildItgcReport(s, asOf, {
      cloudConfigured: isSupabaseConfigured(),
      aiKeyInBrowser: !!getAiConfig().apiKey.trim(),
      localOnlyAttachments: localOnly,
    }),
    [s, asOf, localOnly],
  );

  const shown = useMemo(() => {
    const base = report.findings.filter((f) => domainFilter === "all" || f.domain === domainFilter);
    return showSatisfied ? base : base.filter((f) => f.verdict !== "satisfait");
  }, [report, domainFilter, showSatisfied]);

  const priorities = useMemo(() => prioritise(report.anomalies).slice(0, 5), [report]);

  return (
    <div>
      <PageHeader
        title="Contrôles généraux informatiques"
        subtitle={`Accès · changements · développement · exploitation — arrêtés au ${asOf}`}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date d'arrêté
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      </PageHeader>

      {/* Maturité */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Maturité globale"
          value={`${report.maturityPct} %`}
          icon={<Gauge size={18} />}
          sub={`${report.findings.length - report.notAssessed.length} contrôles évaluables`}
          accent={report.maturityPct >= 80 ? "sage" : report.maturityPct >= 50 ? "primary" : "destructive"}
        />
        <Kpi
          label="Anomalies critiques"
          value={String(report.counts.critique)}
          icon={<AlertTriangle size={18} />}
          sub="compromission ou perte de données possible"
          accent={report.counts.critique > 0 ? "destructive" : "sage"}
        />
        <Kpi label="Anomalies majeures" value={String(report.counts.majeur)} icon={<XCircle size={18} />} sub="contrôle contournable" />
        <Kpi
          label="Non évalués"
          value={String(report.notAssessed.length)}
          icon={<HelpCircle size={18} />}
          sub="exclus du calcul de maturité"
        />
      </div>

      {/* Maturité par domaine */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Maturité par domaine</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {report.byDomain.map((d) => (
              <li key={d.domain}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{DOMAIN_LABEL[d.domain]}</span>
                  <span className="num text-muted-foreground">
                    {d.satisfied}/{d.applicable} satisfaits
                    {d.notAssessed > 0 && <span className="ml-1 text-xs">· {d.notAssessed} non évalué(s)</span>}
                    <span className="ml-2 font-semibold text-foreground">{d.pct} %</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", d.pct >= 80 ? "bg-success" : d.pct >= 50 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Le dénominateur exclut les contrôles non évaluables. Un score calculé sur le total
            monterait quand l'outil devient aveugle — l'inverse de ce qu'on mesure.
          </p>
        </CardContent>
      </Card>

      {/* Priorités */}
      {priorities.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight size={16} className="text-primary" /> À traiter en premier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
              Ordonnées par rapport gravité / effort : ce qui coûte peu et rapporte beaucoup d'abord.
            </p>
            <ol className="space-y-2">
              {priorities.map((f, i) => (
                <li key={f.id} className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
                  <span className="num mt-0.5 shrink-0 text-lg font-semibold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{f.action}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.observed}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone={SEV_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
                    <Badge tone="muted">{EFFORT_LABEL[f.effort]}</Badge>
                    {f.route && (
                      <Link to={f.route}><Button variant="outline" size="sm">Corriger</Button></Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Constats */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Constats détaillés</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={showSatisfied} onChange={(e) => setShowSatisfied(e.target.checked)} />
                afficher les contrôles satisfaits
              </label>
              <Select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value as typeof domainFilter)}
                className="w-full sm:w-72"
              >
                <option value="all">Tous les domaines</option>
                {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABEL[d]}</option>)}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun constat sur ce périmètre.
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map((f) => <FindingCard key={f.id} finding={f} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Portée et réserve</CardTitle></CardHeader>
        <CardContent>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{ITGC_DISCLAIMER}</p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Voir le skill Claude Code <code className="rounded bg-muted px-1 py-0.5 text-xs">controles-generaux-informatiques</code> pour
            la méthode et le référentiel complet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Un constat : état attendu, verdict, ce qui est observé, la conséquence, l'action, la preuve. */
function FindingCard({ finding: f }: { finding: ItgcFinding }) {
  const border =
    f.verdict === "anomalie"
      ? f.severity === "critique" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"
      : f.verdict === "non_evalue" ? "border-border/60 bg-muted/20" : "border-success/30 bg-success/5";

  const icon =
    f.verdict === "satisfait" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
      : f.verdict === "non_evalue" ? <HelpCircle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        : <XCircle size={16} className={cn("mt-0.5 shrink-0", f.severity === "critique" ? "text-destructive" : "text-warning")} />;

  return (
    <li className={cn("rounded-lg border p-3.5", border)}>
      <div className="flex items-start gap-2.5">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xs font-semibold text-muted-foreground">{f.id}</span>
            <span className="text-sm font-medium">{f.control}</span>
          </div>
          <p className="mt-1.5 text-sm">{f.observed}</p>

          {f.verdict !== "satisfait" && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Pourquoi cela compte — </span>{f.consequence}</p>
              <p><span className="font-medium text-foreground">Action — </span>{f.action}</p>
              <p><span className="font-medium text-foreground">Preuve du retour à la normale — </span>{f.evidence}</p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {f.verdict === "non_evalue"
            ? <Badge tone="muted">non évalué</Badge>
            : <Badge tone={f.verdict === "satisfait" ? "success" : SEV_TONE[f.severity]}>
                {f.verdict === "satisfait" ? "satisfait" : SEVERITY_LABEL[f.severity]}
              </Badge>}
          <Badge tone="muted">{EFFORT_LABEL[f.effort]}</Badge>
          {f.route && f.verdict === "anomalie" && (
            <Link to={f.route}><Button variant="outline" size="sm"><ServerCog size={14} /> Corriger</Button></Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Icône exportée pour la navigation (cohérence avec les autres volets réservés). */
export const ITGC_ICON = ShieldCheck;
