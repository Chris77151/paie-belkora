import { useMemo, useState, type ReactNode } from "react";
import {
  ShieldCheck, Sparkles, Loader2, AlertTriangle, ChevronDown, CheckCircle2,
  ScrollText, Scale, LayoutList, Wrench, BookMarked, FileDown, DatabaseZap,
  Lightbulb, ListChecks, BookText, ExternalLink, ArrowRight,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, Field, PageHeader, Select,
} from "@/components/ui/kit";
import { actions, currentFirm, useStore } from "@/data/store";
import { useSession } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { MONTHS_FR, mad } from "@/lib/format";
import {
  buildAuditSnapshot, runFullAudit, buildRemediationPlan, findingSteps, findingRoute, PCGE_LABELS,
  type AuditReport, type AuditFinding, type Gravite, type CorrectionEntry,
} from "@/lib/audit-engine";
import { buildRemediationReportPdf } from "@/lib/remediation-report";
import {
  odooReadiness, odooErrorHint, odooReadOpenItems, groupReconcilable, odooApplyReconcile, odooRecordUrl,
  type ReconcileOutcome,
} from "@/lib/odoo";
import { cn } from "@/lib/cn";
import { YearSelect } from "@/components/YearSelect";

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
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  const session = useSession();
  const isSuperAdmin = session?.role === "super_admin";
  const period = `${MONTHS_FR[month - 1]} ${year}`;
  const odooNotReady = odooReadiness(s.odoo, { name: firm.name, odoo_company_id: firm.odoo_company_id });
  // Y a-t-il des corrections auto-applicables (lettrage) dans le rapport courant ?
  const hasAuto = report ? buildRemediationPlan(report).auto.length > 0 : false;

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

  const fileBase = `dossier-regularisation_${firm.name.replace(/\s+/g, "-")}_${period.replace(/\s+/g, "-")}`;

  /** « Corriger » : génère le RAPPORT PDF en 2 volets (auto / humain), sans écrire dans Odoo. */
  function correct(applied?: { outcomes: ReconcileOutcome[] }) {
    if (!report) return;
    buildRemediationReportPdf(report, firm, period, applied).save(`${fileBase}.pdf`);
    // Traçabilité : le rapport de régularisation apparaît dans le Journal des documents.
    actions.recordDocGeneration({
      firm_id: firm.id,
      doc_type: "regularisation",
      format: "pdf",
      subject: `Régularisation comptable · ${period}`,
      period_year: year,
      period_month: month,
    });
  }

  /**
   * « Appliquer dans Odoo » (super administrateur) : exécute le SEUL sous-ensemble sûr —
   * le lettrage des écritures d'un même tiers qui s'apurent exactement (réversible dans Odoo).
   * Aperçu (lecture seule) → confirmation → application → rapport PDF avec le résultat réel.
   */
  async function applyInOdoo() {
    if (!report || !s.odoo || !firm.odoo_company_id) return;
    if (odooNotReady) { alert(odooNotReady); return; }
    setApplying(true);
    setError(null);
    try {
      // 1) Aperçu (lecture seule) : que va-t-on lettrer ?
      const lines = await odooReadOpenItems(s.odoo, firm.odoo_company_id);
      const groups = groupReconcilable(lines);
      if (groups.length === 0) {
        alert("Aucun groupe d'écritures ne s'apure exactement : rien à lettrer automatiquement. "
          + "Les autres constats relèvent du volet « intervention humaine » du rapport.");
        return;
      }
      const totalLines = groups.reduce((a, g) => a + g.line_ids.length, 0);
      const totalAmount = groups.reduce((a, g) => a + g.amount, 0);
      // 2) Confirmation explicite avant toute écriture en production.
      const okToApply = window.confirm(
        "Lettrage automatique dans Odoo (RÉVERSIBLE) :\n\n"
        + `• ${groups.length} groupe(s) tiers/compte qui s'apurent exactement\n`
        + `• ${totalLines} ligne(s) d'écriture\n`
        + `• volume ${mad(totalAmount)}\n\n`
        + "Aucune écriture n'est créée, modifiée ou supprimée : seul le rapprochement est posé "
        + "(annulable dans Odoo). Appliquer maintenant ?",
      );
      if (!okToApply) return;
      // 3) Application réelle.
      const outcomes = await odooApplyReconcile(s.odoo, groups);
      const ok = outcomes.filter((o) => o.ok).length;
      const ko = outcomes.length - ok;
      alert(`Lettrage terminé : ${ok} groupe(s) rapproché(s)${ko ? `, ${ko} échec(s)` : ""}. `
        + `Le rapport PDF détaillé est généré.`);
      // 4) Rapport PDF incluant le résultat réel.
      correct({ outcomes });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Échec du lettrage automatique : ${odooErrorHint(msg)}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("page.audit.title")}
        subtitle={`${firm.name} · ${t("page.audit.sub")}`}
      >
        {report && (
          <div className="flex items-center gap-2">
            <Badge tone={report.score_fiabilite >= 75 ? "success" : report.score_fiabilite >= 50 ? "warning" : "destructive"}>
              Fiabilité {report.score_fiabilite}/100
            </Badge>
            {report.constats.length > 0 && (
              <Button variant="outline" onClick={() => correct()} title="Générer le rapport PDF de régularisation (2 volets : auto / intervention humaine)">
                <FileDown size={16} /> Corriger (rapport PDF)
              </Button>
            )}
            {isSuperAdmin && hasAuto && !odooNotReady && (
              <Button variant="sage" onClick={applyInOdoo} disabled={applying}
                title="Appliquer le lettrage automatique dans Odoo (réversible) — super administrateur">
                {applying ? <Loader2 size={16} className="animate-spin" /> : <DatabaseZap size={16} />} Appliquer dans Odoo
              </Button>
            )}
          </div>
        )}
      </PageHeader>

      {/* Barre de contrôle */}
      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label="Année">
            <YearSelect value={year} onChange={(y) => { setYear(y); setReport(null); }} />
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
                    .map((c, i) => <FindingRow key={i} c={c} odooUrl={s.odoo?.url} companyId={firm.odoo_company_id} />)}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Revue préliminaire automatique (règles d'audit, calcul local). <b>Corriger (rapport PDF)</b> produit
            un dossier en <b>2 volets</b> : corrections automatiques (lettrage réversible) et actions nécessitant
            une <b>intervention humaine</b> (détail par anomalie, base normative). <b>Appliquer dans Odoo</b>
            (super administrateur) exécute le seul sous-ensemble sûr — le lettrage des écritures qui s'apurent
            exactement, réversible dans Odoo. Les corrections de fond relèvent du comptable ou du skill
            <code className="font-mono"> odoo-correction-anomalies</code> (lecture Odoo réelle, OD contre-passable,
            rapport de régularité).
          </p>
        </div>
      )}
    </div>
  );
}

function FindingRow({ c, odooUrl, companyId }: { c: AuditFinding; odooUrl?: string; companyId?: number }) {
  const route = findingRoute(c);
  const odooReady = !!odooUrl?.trim();
  return (
    <details className="rounded-md border border-border/70 bg-card open:pb-3">
      <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 select-none">
        <Badge tone={GRAVITE_TONE[c.gravite]}>{GRAVITE_LABEL[c.gravite]}</Badge>
        <span className="text-sm font-medium min-w-0 flex-1 truncate">{c.titre}</span>
        {c.comptes.length > 0 && (
          <span className="hidden md:inline font-mono text-[11px] text-primary">{c.comptes.join(" · ")}</span>
        )}
        <span className="hidden sm:inline text-xs text-muted-foreground">{c.assertion} · {c.cycle}</span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
      </summary>
      <div className="px-4 space-y-3 text-sm">
        {/* Comptes RÉELLEMENT anormaux (Odoo) : n° + intitulé + montant + lien direct pour corriger. */}
        {c.elementsAnormaux && c.elementsAnormaux.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <AlertTriangle size={13} className="text-warning" /> Comptes anormaux détectés
            </div>
            <div className="overflow-x-auto rounded border border-warning/30 bg-warning/[0.05]">
              <table className="w-full text-[12px]">
                <tbody>
                  {c.elementsAnormaux.map((el) => (
                    <tr key={el.code + (el.id ?? "")} className="border-t border-warning/20 first:border-t-0">
                      <td className="px-2 py-1 font-mono font-medium text-primary whitespace-nowrap">{el.code}</td>
                      <td className="px-2 py-1 text-muted-foreground">{el.name}</td>
                      <td className="px-2 py-1 text-right num whitespace-nowrap">{mad(el.montant)}</td>
                      <td className="px-2 py-1 text-right">
                        {odooReady && el.id != null && (
                          <a
                            href={odooRecordUrl(odooUrl!, "account.account", el.id, companyId)}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline whitespace-nowrap"
                            title="Ouvrir ce compte dans Odoo pour le corriger"
                          >
                            Ouvrir <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {c.comptes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <BookText size={13} className="text-primary" /> Comptes concernés (PCGE)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.comptes.map((n) => (
                <span key={n} className="inline-flex items-baseline gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px]">
                  <span className="font-mono font-medium text-primary">{n}</span>
                  {PCGE_LABELS[n] && <span className="text-muted-foreground">{PCGE_LABELS[n]}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
        <Detail label="Problème détecté" value={c.detail} />

        {c.correction ? (
          <div className="space-y-3 rounded-md border border-primary/25 bg-primary/[0.04] p-3">
            <Detail label="Comprendre l'anomalie" value={c.correction.comprendre} icon={<Lightbulb size={13} className="text-warning" />} />
            <StepList label="Comment procéder" steps={findingSteps(c)} />
            {c.correction.ecriture ? (
              <EcritureTable e={c.correction.ecriture} />
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Pas d'écriture automatique : le compte de contrepartie dépend d'une analyse au cas par cas (voir les étapes).
              </p>
            )}
          </div>
        ) : (
          // Constat sans écriture-type : on garantit tout de même une marche à suivre concrète.
          <div className="rounded-md border border-sage/25 bg-sage/[0.05] p-3">
            <StepList label="Comment procéder" steps={findingSteps(c)} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail label="Référence normative (Maroc)" value={c.reference_normative} icon={<BookMarked size={13} className="text-muted-foreground" />} />
          <Detail label="Action Odoo" value={c.action_odoo} icon={<Wrench size={13} className="text-muted-foreground" />} />
        </div>

        {/* Lien DIRECT pour aller corriger l'anomalie : Odoo (constats compta) ou volet interne (paie). */}
        <div className="flex flex-wrap gap-2 pt-1">
          {c.source === "odoo" && odooReady ? (
            <a
              href={
                c.elementsAnormaux?.find((e) => e.id != null)
                  ? odooRecordUrl(odooUrl!, "account.account", c.elementsAnormaux.find((e) => e.id != null)!.id!, companyId)
                  : `${odooUrl!.replace(/\/+$/, "").replace(/\/odoo$/i, "")}/web`
              }
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <ExternalLink size={13} /> Corriger dans Odoo
            </a>
          ) : route ? (
            <a
              href={`#/${route.route}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <ArrowRight size={13} /> Corriger — {route.label}
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}

/** Liste numérotée « Comment procéder » — étapes concrètes de résolution d'un constat. */
function StepList({ label, steps }: { label: string; steps: string[] }) {
  if (!steps.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <ListChecks size={13} className="text-sage" /> {label}
      </div>
      <ol className="ml-4 list-decimal space-y-0.5 leading-relaxed">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}

/** Écriture de correction proposée, rendue en table (Compte / Libellé / Débit / Crédit + totaux). */
function EcritureTable({ e }: { e: CorrectionEntry }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <BookText size={13} className="text-primary" /> Écriture de correction — journal {e.journal}
      </div>
      <div className="overflow-x-auto rounded border border-border/60 bg-card">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Compte</th>
              <th className="px-2 py-1 text-left font-medium">Libellé</th>
              <th className="px-2 py-1 text-right font-medium">Débit</th>
              <th className="px-2 py-1 text-right font-medium">Crédit</th>
            </tr>
          </thead>
          <tbody>
            {e.lignes.map((l, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="px-2 py-1 font-mono text-primary">{l.compte}</td>
                <td className="px-2 py-1">{l.libelle}</td>
                <td className="px-2 py-1 text-right num">{l.debit ? mad(l.debit) : ""}</td>
                <td className="px-2 py-1 text-right num">{l.credit ? mad(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="px-2 py-1" />
              <td className="px-2 py-1 text-right">Total</td>
              <td className="px-2 py-1 text-right num">{mad(e.totalDebit)}</td>
              <td className="px-2 py-1 text-right num">{mad(e.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-1 text-[11px] italic text-muted-foreground">
        {e.libelle}
        {!e.equilibre && <span className="text-destructive"> — ⚠ écriture déséquilibrée</span>}
        {e.note ? ` · ${e.note}` : ""}
      </p>
    </div>
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
