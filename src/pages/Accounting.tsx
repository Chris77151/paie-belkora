import { useMemo, useState } from "react";
import { Calculator, FileCode2, FileSpreadsheet, FileDown, CheckCircle2, AlertTriangle, Sparkles, Lock, Unlock } from "lucide-react";
import { actions, currentFirm, payslipsOfPeriod, useStore } from "@/data/store";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/auth";
import type { PayrollResult } from "@/lib/payroll-engine";
import {
  buildPayrollEntry, buildSettlementEntry, sumResults, checkPayrollEntryInvariants,
  type JournalEntry, type InvariantCheck,
} from "@/lib/payroll-accounting";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting-accounts";
import { exportEntriesPdf, exportEntriesXlsx, exportEntriesXml } from "@/lib/accounting-export";
import { Badge, Button, Card, CardContent, Field, PageHeader, Select, Table, Td, Th } from "@/components/ui/kit";
import { MONTHS_FR, dateFr, mad, num, periodLabel } from "@/lib/format";

const YEARS = [2026, 2025];

export default function Accounting() {
  const s = useStore();
  const t = useT();
  const session = useSession();
  const firm = currentFirm(s);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [generated, setGenerated] = useState(false);

  const closureId = `${firm.id}_${year}_${month}`;
  const closure = (s.accountingClosures ?? []).find((c) => c.id === closureId);
  const isValidated = !!closure;

  // SOURCE UNIQUE DE VÉRITÉ : on n'agrège QUE les bulletins réellement validés (calculés) de la
  // période. Aucun recalcul, aucune valeur par défaut — sinon divergence garantie avec la BDS/CNSS.
  const { results, hasValidated } = useMemo<{ results: PayrollResult[]; hasValidated: boolean }>(() => {
    const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
    if (period) {
      const frozen = payslipsOfPeriod(s, period.id).filter((sl) => sl.result).map((sl) => sl.result as PayrollResult);
      if (frozen.length) return { results: frozen, hasValidated: true };
    }
    return { results: [], hasValidated: false };
  }, [s, firm, year, month]);

  const { paie, reglement, totals, invariants } = useMemo(() => {
    const t = sumResults(results);
    const paieEntry = buildPayrollEntry(t, DEFAULT_ACCOUNTS, year, month); // TFP incluse dans 4441 (défaut)
    return {
      totals: t,
      paie: paieEntry,
      reglement: buildSettlementEntry(t, DEFAULT_ACCOUNTS, year, month),
      invariants: checkPayrollEntryInvariants(paieEntry, t, DEFAULT_ACCOUNTS),
    };
  }, [results, year, month]);

  const period = periodLabel(year, month);
  // Période validée : on affiche l'INSTANTANÉ figé ; sinon les écritures dérivées à la volée.
  const entries: JournalEntry[] = isValidated ? closure!.entries : [paie, reglement];
  const balanced = entries.every((e) => e.balanced);
  // Génération/validation autorisées seulement si TOUS les invariants passent (bloquant).
  const controlsOk = balanced && invariants.ok;
  const showEntries = isValidated || generated;

  function validate() {
    if (!controlsOk) {
      window.alert("Impossible de valider : un contrôle d'invariant a échoué (voir le détail). Corrigez la paie avant de figer la période.");
      return;
    }
    if (!window.confirm(`Valider et verrouiller les écritures de ${period} ? La période sera figée.`)) return;
    actions.validateAccounting({
      id: closureId,
      firm_id: firm.id,
      year,
      month,
      entries: [paie, reglement],
      validated_at: new Date().toISOString(),
      validated_by: session?.username ?? "—",
    });
  }

  function revert() {
    if (!window.confirm(`Remettre ${period} en brouillon ? Les écritures redeviendront modifiables.`)) return;
    actions.revertAccounting(closureId);
  }

  const changeYear = (v: number) => { setYear(v); setGenerated(false); };
  const changeMonth = (v: number) => { setMonth(v); setGenerated(false); };

  return (
    <div>
      <PageHeader title={t("page.accounting.title")} subtitle={`${firm.name} · ${t("page.accounting.sub")}`}>
        {isValidated ? (
          <Badge tone="success"><Lock size={13} /> Validée · verrouillée</Badge>
        ) : showEntries ? (
          <Badge tone={controlsOk ? "success" : "destructive"}>
            {controlsOk ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {controlsOk ? "Invariants OK (brouillon)" : "Contrôle échoué"}
          </Badge>
        ) : null}
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-end gap-3">
          <Field label="Année">
            <Select value={year} onChange={(e) => changeYear(+e.target.value)} className="w-28">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Mois">
            <Select value={month} onChange={(e) => changeMonth(+e.target.value)} className="w-40">
              {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <div className="flex-1" />
          {isValidated ? (
            <Button variant="outline" onClick={revert}>
              <Unlock size={16} /> Remettre en brouillon
            </Button>
          ) : (
            <>
              {!generated && (
                <Button variant="outline" onClick={() => setGenerated(true)} disabled={!hasValidated}>
                  <Sparkles size={16} /> Générer les écritures
                </Button>
              )}
              {generated && (
                <Button onClick={validate} disabled={!controlsOk}>
                  <Lock size={16} /> Valider la période
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!showEntries ? (
        <Card>
          <CardContent className="py-16 text-center">
            {hasValidated ? (
              <>
                <Calculator size={40} className="mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Cliquez sur <b>Générer les écritures</b>.<br />
                  Écriture de paie (journal OD) + règlement (banque), conformes au PCGE — <b>agrégées à partir des bulletins validés</b>.
                </p>
                <p className="mt-2 text-xs text-muted-foreground/80">{totals.headcount} bulletin(s) validé(s) · {period}</p>
              </>
            ) : (
              <>
                <AlertTriangle size={40} className="mx-auto text-warning/70" />
                <p className="mt-4 text-sm text-muted-foreground max-w-lg mx-auto">
                  <b>Aucun bulletin validé</b> pour {period}. L'écriture comptable n'agrège que des bulletins
                  <b> réels validés</b> (elle ne recalcule jamais). Calculez et validez d'abord la paie sur la
                  page <b>Paie</b>, puis revenez générer les écritures.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {isValidated && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <Lock size={15} className="shrink-0" />
              <span>
                Période verrouillée le {dateFr(closure!.validated_at)} par {closure!.validated_by}.
                Instantané figé — les modifications de bulletins n'affectent plus ces écritures.
              </span>
            </div>
          )}

          <InvariantsPanel check={invariants} />

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground mr-2">Exporter :</span>
            <Button variant="outline" onClick={() => exportEntriesXml(entries, firm, period.replace(" ", "-"))}>
              <FileCode2 size={16} /> XML
            </Button>
            <Button variant="outline" onClick={() => exportEntriesXlsx(entries, firm, period.replace(" ", "-"))}>
              <FileSpreadsheet size={16} /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportEntriesPdf(entries, firm, period.replace(" ", "-"))}>
              <FileDown size={16} /> PDF
            </Button>
          </div>

          {entries.map((entry, i) => (
            <div key={i}>
              {i > 0 && <div className="h-4" />}
              <EntryCard
                title={`${entry.journal === "BQ" ? "Écriture de règlement" : "Écriture de paie"} — journal ${entry.journal}`}
                entry={entry}
              />
            </div>
          ))}

          <p className="mt-6 text-xs text-muted-foreground">
            Comptes PCGE par défaut (6171, 617411/617412, 61744, 61671, 4432, 4441, 4457, 44525, 5141),
            validés par l'expert-comptable. Écritures à contrôler avant intégration en comptabilité.
          </p>
        </>
      )}
    </div>
  );
}

/** Contrôle d'invariants (bloquant) — affiché avant l'export/validation. */
function InvariantsPanel({ check }: { check: InvariantCheck }) {
  return (
    <Card className={`mb-4 ${check.ok ? "" : "border-destructive/50"}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          {check.ok ? <CheckCircle2 size={16} className="text-success" /> : <AlertTriangle size={16} className="text-destructive" />}
          Contrôle d'invariants comptables
        </div>
        <Badge tone={check.ok ? "success" : "destructive"}>
          {check.ok ? "Tous validés" : "Écart détecté — génération bloquée"}
        </Badge>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Invariant</Th><Th className="text-right">Attendu</Th><Th className="text-right">Obtenu</Th><Th className="text-right">Écart</Th><Th></Th>
          </tr>
        </thead>
        <tbody>
          {check.results.map((r) => (
            <tr key={r.code} className={r.ok ? "" : "bg-destructive/5"}>
              <Td className="text-muted-foreground">{r.label}</Td>
              <Td className="text-right num">{mad(r.expected)}</Td>
              <Td className="text-right num">{mad(r.actual)}</Td>
              <Td className={`text-right num ${r.ok ? "text-muted-foreground" : "text-destructive font-semibold"}`}>{mad(r.delta)}</Td>
              <Td className="text-right">
                <Badge tone={r.ok ? "success" : "destructive"}>{r.ok ? "OK" : "Écart"}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function EntryCard({ title, entry }: { title: string; entry: JournalEntry }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calculator size={16} className="text-primary" /> {title}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{entry.reference}</span>
          <Badge tone={entry.balanced ? "success" : "destructive"}>
            {entry.balanced ? "Équilibrée" : "Déséquilibre"}
          </Badge>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((l, i) => (
            <tr key={i} className="hover:bg-muted/40">
              <Td className="num font-medium">{l.account}</Td>
              <Td className="text-muted-foreground">{l.label}</Td>
              <Td className="text-right num">{l.debit ? num(l.debit) : ""}</Td>
              <Td className="text-right num">{l.credit ? num(l.credit) : ""}</Td>
            </tr>
          ))}
          <tr className="bg-accent/50 font-semibold">
            <Td></Td><Td className="text-right">TOTAL</Td>
            <Td className="text-right num">{mad(entry.totalDebit)}</Td>
            <Td className="text-right num">{mad(entry.totalCredit)}</Td>
          </tr>
        </tbody>
      </Table>
    </Card>
  );
}
