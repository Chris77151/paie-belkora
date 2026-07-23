import { useMemo, useState, type ReactNode } from "react";
import {
  ShieldCheck, Sparkles, Loader2, AlertTriangle, ChevronDown, CheckCircle2,
  ScrollText, Scale, LayoutList, Wrench, BookMarked,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, Field, PageHeader, Select,
} from "@/components/ui/kit";
import { currentFirm, useStore } from "@/data/store";
import { useT } from "@/lib/i18n";
import { MONTHS_FR, mad } from "@/lib/format";
import {
  buildAuditSnapshot, runFullAudit, type AuditReport, type AuditFinding, type Gravite,
} from "@/lib/audit-engine";
import { cn } from "@/lib/cn";

const YEARS = [2026, 2025];

const CAT = {
  flux: { label: "Flux — Compte de résultat", icon: ScrollText },
  soldes: { label: "Soldes — Bilan", icon: Scale },
  presentation: { label: "Présentation & annexe", icon: LayoutList },
} as const;

const GRAVITE_TONE: Record<Gravite, "destructive" | "warning" | "sage" | "muted"> = {
  critique: "destructive",
  eleve: "warning",
  moyen: "sage",
  info: "muted",
};
const GRAVITE_LABEL: Record<Gravite, string> = {
  critique: "Critique", eleve: "Élevé", moyen: "Moyen", info: "Info",
};

export default function Audit() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  const period = `${MONTHS_FR[month - 1]} ${year}`;

  // Aperçu local (pur) de ce qui sera audité.
  const snapshot = useMemo(() => buildAuditSnapshot(year, month), [s, firm, year, month]);
  const balanced = snapshot.entries.every((e) => e.balanced);

  // Audit déterministe (pas d'IA) : paie locale + toute la comptabilité Odoo si connectée.
  async function launch() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await runFullAudit(year, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const bySeverity = report ? count(report.constats) : null;

  return (
    <div>
      <PageHeader
        title={t("page.audit.title")}
        subtitle={`${firm.name} · ${t("page.audit.sub")}`}
      >
        {report && (
          <Badge tone={report.score_fiabilite >= 75 ? "success" : report.score_fiabilite >= 50 ? "warning" : "destructive"}>
            Fiabilité {report.score_fiabilite}/100
          </Badge>
        )}
      </PageHeader>

      {/* Barre de contrôle */}
      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label="Année">
            <Select value={year} onChange={(e) => { setYear(+e.target.value); setReport(null); }} className="w-28">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Mois">
            <Select value={month} onChange={(e) => { setMonth(+e.target.value); setReport(null); }} className="w-40">
              {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{snapshot.totals.headcount} salarié(s)</span>
            <span>·</span>
            <span>Brut {mad(snapshot.totals.salaireBrut)}</span>
            <Badge tone={balanced ? "success" : "destructive"}>
              {balanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {balanced ? "Écritures équilibrées" : "Déséquilibre"}
            </Badge>
          </div>
          <Button onClick={launch} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Lancer l'audit
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="pt-5 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* État initial */}
      {!report && !busy && !error && (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck size={40} className="mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground max-w-lg mx-auto">
              Sélectionnez une période et cliquez sur <b>Lancer l'audit</b>. L'analyse est <b>déterministe</b>
              (sans IA) et passe les données au crible des <b>assertions d'audit</b>. Si <b>Odoo</b> est
              connecté, elle couvre <b>toute la comptabilité</b> de l'exercice — pas seulement la paie :
              balance générale, écritures en brouillon, classification (charges/produits), <b>lettrage
              clients/fournisseurs</b>, <b>factures échues impayées</b> (balance âgée), comptes d'attente,
              TVA collectée/déductible et <b>ventilation réelle des écritures par type</b> (ventes, achats,
              trésorerie, divers). Sans Odoo, périmètre = <b>paie locale</b> ({period}). Constats classés,
              avec détail et recommandation (normes marocaines + action Odoo).
            </p>
          </CardContent>
        </Card>
      )}

      {busy && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 size={32} className="mx-auto animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Analyse en cours par assertions d'audit…</p>
          </CardContent>
        </Card>
      )}

      {report && (
        <div className="space-y-5">
          {/* Synthèse */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                <BookMarked size={16} className="text-primary" /> Synthèse
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{report.synthese}</p>
              <p className="mt-1 text-xs text-muted-foreground/80">Périmètre analysé : {report.scope}</p>
              {bySeverity && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["critique", "eleve", "moyen", "info"] as Gravite[]).map((g) =>
                    bySeverity[g] > 0 ? (
                      <Badge key={g} tone={GRAVITE_TONE[g]}>{GRAVITE_LABEL[g]} : {bySeverity[g]}</Badge>
                    ) : null,
                  )}
                  <Badge tone="muted">{report.constats.length} constat(s)</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Constats par famille d'assertions */}
          {(Object.keys(CAT) as (keyof typeof CAT)[]).map((catKey) => {
            const items = report.constats.filter((c) => c.categorie_assertion === catKey);
            if (!items.length) return null;
            const { label, icon: Icon } = CAT[catKey];
            return (
              <div key={catKey}>
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
                  <Icon size={16} className="text-primary" /> {label}
                  <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items
                    .sort((a, b) => order(a.gravite) - order(b.gravite))
                    .map((c, i) => <FindingRow key={i} c={c} />)}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Revue préliminaire automatique (règles d'audit, calcul local). Les constats doivent être
            vérifiés pièce à l'appui ; le passage des écritures de correction relève de l'expert-comptable.
          </p>
        </div>
      )}
    </div>
  );
}

function FindingRow({ c }: { c: AuditFinding }) {
  return (
    <details className="rounded-md border border-border/70 bg-card open:pb-3">
      <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 select-none">
        <Badge tone={GRAVITE_TONE[c.gravite]}>{GRAVITE_LABEL[c.gravite]}</Badge>
        <span className="text-sm font-medium min-w-0 flex-1 truncate">{c.titre}</span>
        <span className="hidden sm:inline text-xs text-muted-foreground">{c.assertion} · {c.cycle}</span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
      </summary>
      <div className="px-4 space-y-3 text-sm">
        <Detail label="Problème détecté" value={c.detail} />
        <Detail label="Recommandation" value={c.recommandation} icon={<CheckCircle2 size={13} className="text-sage" />} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Detail label="Référence normative (Maroc)" value={c.reference_normative} icon={<BookMarked size={13} className="text-muted-foreground" />} />
          <Detail label="Action Odoo" value={c.action_odoo} icon={<Wrench size={13} className="text-muted-foreground" />} />
        </div>
      </div>
    </details>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className={cn("leading-relaxed")}>{value}</p>
    </div>
  );
}

function order(g: Gravite): number {
  return { critique: 0, eleve: 1, moyen: 2, info: 3 }[g];
}
function count(list: AuditFinding[]): Record<Gravite, number> {
  const c: Record<Gravite, number> = { critique: 0, eleve: 0, moyen: 0, info: 0 };
  for (const f of list) c[f.gravite] += 1;
  return c;
}
