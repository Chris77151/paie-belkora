import { useMemo, useState } from "react";
import { Calculator, FileCode2, FileSpreadsheet, FileDown, CheckCircle2, AlertTriangle, Sparkles, Lock, Unlock, Table2 } from "lucide-react";
import { actions, currentFirm, payslipsOfPeriod, useStore } from "@/data/store";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/auth";
import type { PayrollResult } from "@/lib/payroll-engine";
import {
  buildPayrollEntry, buildSettlementEntry, sumResults, checkPayrollEntryInvariants,
  type JournalEntry, type InvariantCheck,
} from "@/lib/payroll-accounting";
import type { Firm, PaymentMode } from "@/data/types";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting-accounts";
import { exportEntriesPdf, exportEntriesXlsx, exportEntriesXml, exportEntriesCsvSage } from "@/lib/accounting-export";
import { Badge, Button, Card, CardContent, Field, PageHeader, Select, Table, Td, Th } from "@/components/ui/kit";
import { MONTHS_FR, dateFr, mad, num, periodLabel } from "@/lib/format";
import { PinPrompt } from "@/components/PinPrompt";
import { YearSelect } from "@/components/YearSelect";

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
  const { results, advancesTotal, hasValidated } = useMemo<{ results: PayrollResult[]; advancesTotal: number; hasValidated: boolean }>(() => {
    const period = s.periods.find((p) => p.firm_id === firm.id && p.year === year && p.month === month);
    if (period) {
      const slips = payslipsOfPeriod(s, period.id).filter((sl) => sl.result);
      const frozen = slips.map((sl) => sl.result as PayrollResult);
      // Total des retenues d'avances/acomptes de la période (champ `advances` du bulletin) → crédit 3431.
      const adv = slips.reduce((sum, sl) => sum + Math.max(0, sl.input.advances ?? 0), 0);
      if (frozen.length) return { results: frozen, advancesTotal: adv, hasValidated: true };
    }
    return { results: [], advancesTotal: 0, hasValidated: false };
  }, [s, firm, year, month]);

  // Mode de règlement des salaires nets — mémorisé par société, appliqué automatiquement aux
  // écritures (5141 Banque pour virement/chèque, 5161 Caisse pour espèces).
  const paymentMode: PaymentMode = firm.payroll_payment_mode ?? "virement";
  function changePaymentMode(v: PaymentMode) {
    const next: Firm = { ...firm, payroll_payment_mode: v };
    actions.upsertFirm(next); // persistance : le mode est retenu et ré-appliqué la prochaine fois
  }

  const { paie, reglement, totals, invariants } = useMemo(() => {
    const t = sumResults(results);
    // Ventilation « à la Sage » : la TFP (taxe) est ISOLÉE en 4457 (État), le compte 4441 ne
    // porte que le vrai bordereau CNSS (CNSS + AMO + AF, parts sal.+patr.). L'IR reste en 44525.
    // Le mode de paiement pilote la trésorerie du RÈGLEMENT (banque/caisse), sans toucher à l'OD.
    const opts = { tfpInCnss: false, paymentMode, advances: advancesTotal } as const;
    const paieEntry = buildPayrollEntry(t, DEFAULT_ACCOUNTS, year, month, opts);
    return {
      totals: t,
      paie: paieEntry,
      reglement: buildSettlementEntry(t, DEFAULT_ACCOUNTS, year, month, opts),
      invariants: checkPayrollEntryInvariants(paieEntry, t, DEFAULT_ACCOUNTS),
    };
  }, [results, advancesTotal, year, month, paymentMode]);

  const period = periodLabel(year, month);
  // Période validée : on affiche l'INSTANTANÉ figé ; sinon les écritures dérivées à la volée.
  const entries: JournalEntry[] = isValidated ? closure!.entries : [paie, reglement];
  const balanced = entries.every((e) => e.balanced);
  // Génération/validation autorisées seulement si TOUS les invariants passent (bloquant).
  const controlsOk = balanced && invariants.ok;
  const showEntries = isValidated || generated;

  const [pinOpen, setPinOpen] = useState(false);

  /** Fige réellement les écritures — appelé après confirmation (code de validation ou confirm simple). */
  function doValidate() {
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

  function validate() {
    if (!controlsOk) {
      window.alert("Impossible de valider : un contrôle d'invariant a échoué (voir le détail). Corrigez la paie avant de figer la période.");
      return;
    }
    // Verrou : si un code de validation est défini pour la société, l'exiger avant de figer la période.
    if (firm.validation_pin_hash) {
      setPinOpen(true);
      return;
    }
    if (!window.confirm(`Valider et verrouiller les écritures de ${period} ? La période sera figée.`)) return;
    doValidate();
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
            <YearSelect value={year} onChange={changeYear} />
          </Field>
          <Field label="Mois">
            <Select value={month} onChange={(e) => changeMonth(+e.target.value)} className="w-40">
              {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Mode de paiement (salaires)">
            <Select
              value={paymentMode}
              onChange={(e) => changePaymentMode(e.target.value as PaymentMode)}
              disabled={isValidated}
              className="w-48"
              title="Pilote le compte de trésorerie du règlement des salaires : Banque (5141) ou Caisse (5161)"
            >
              <option value="virement">Virement bancaire (5141)</option>
              <option value="cheque">Chèque (5141)</option>
              <option value="especes">Espèces — caisse (5161)</option>
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
            <Button
              variant="sage"
              onClick={() => exportEntriesCsvSage(entries, firm, period.replace(" ", "-"))}
              title="CSV importable dans Sage / Ciel / EBP (une ligne par ligne d'écriture ; ; / virgule / jj-mm-aaaa)"
            >
              <Table2 size={16} /> Sage (CSV)
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
            Comptes PCGE par défaut (6171, 617411/617412, 61744, 61678 TFP, 4432, 4441, 4457, 44525, 5141/5161,
            3431 avances), validés par l'expert-comptable. Écritures à contrôler avant intégration en comptabilité.
          </p>
        </>
      )}

      {pinOpen && (
        <PinPrompt
          firm={firm}
          title="Valider les écritures comptables"
          action="Valider"
          onSuccess={doValidate}
          onClose={() => setPinOpen(false)}
        />
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
