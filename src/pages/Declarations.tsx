import { useMemo, useState } from "react";
import { FileDown, FileText, CalendarClock, Landmark, AlertTriangle } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm, periodsOfFirm, payslipsOfPeriod, actions } from "@/data/store";
import { useT } from "@/lib/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Field,
  Select,
  Table,
  Th,
  Td,
  PageHeader,
} from "@/components/ui/kit";
import { mad, num, pct, periodLabel, MONTHS_FR } from "@/lib/format";
import { computeFor, defaultInput, employeesForPeriod } from "@/lib/payroll-helpers";
import type { PayrollResult } from "@/lib/payroll-engine";
import { SELECTABLE_YEARS, getParams } from "@/lib/params";

const YEAR_OPTIONS = SELECTABLE_YEARS;

export default function Declarations() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const periods = periodsOfFirm(s, firm.id);

  const lastValidated = useMemo(
    () =>
      periods
        .filter((p) => p.status !== "draft")
        .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0],
    [periods],
  );

  const [year, setYear] = useState<number>(lastValidated?.year ?? 2026);
  const [month, setMonth] = useState<number>(lastValidated?.month ?? 6);

  // Assiette du mois : uniquement les salariés RÉELLEMENT employés sur la période déclarée
  // (embauche/fin de contrat) — sinon la masse diverge de la BDS/DAMANCOM réelle.
  const employees = useMemo(
    () => employeesForPeriod(employeesOfFirm(s, firm.id), year, month),
    [s, firm.id, year, month],
  );

  // Une période VALIDÉE fige un instantané de bulletins : on DÉCLARE cet instantané (mêmes chiffres
  // que l'écriture comptable et la BDS réellement déposée), pas un recalcul en direct — sinon un
  // salaire modifié APRÈS la validation ferait diverger la déclaration de la comptabilité.
  const declPeriod = s.periods.find((pd) => pd.firm_id === firm.id && pd.year === year && pd.month === month);
  const frozen = declPeriod ? payslipsOfPeriod(s, declPeriod.id).filter((sl) => sl.result != null) : [];
  const isValidated = !!declPeriod && declPeriod.status !== "draft";
  const useFrozen = isValidated && frozen.length > 0;
  // Alerte si l'instantané validé ne couvre pas tout l'effectif employé (validation incomplète).
  const incompleteValidation = isValidated && frozen.length !== employees.length;

  // Plafond CNSS de la PÉRIODE (source unique params.ts) — 5 000 avant 2002, 6 000 ensuite.
  const p = getParams(year);
  const rows = useMemo<{ key: string; name: string; matricule?: string; cnss?: string; r: PayrollResult; plafonne: number }[]>(
    () => {
      const ceiling = p.cnssCeiling;
      if (useFrozen) {
        const empById = new Map(employeesOfFirm(s, firm.id).map((e) => [e.id, e]));
        return frozen.map((sl) => {
          const e = empById.get(sl.employee_id);
          const r = sl.result as PayrollResult;
          return {
            key: sl.id,
            name: e ? `${e.first_name} ${e.last_name}` : "(salarié supprimé)",
            matricule: e?.matricule ?? sl.employee_id,
            cnss: e?.cnss_number,
            r,
            plafonne: Math.min(r.sbi, ceiling),
          };
        });
      }
      return employees.map((e) => {
        const r = computeFor(e, firm, year, month, defaultInput(e));
        return { key: e.id, name: `${e.first_name} ${e.last_name}`, matricule: e.matricule ?? e.id, cnss: e.cnss_number, r, plafonne: Math.min(r.sbi, ceiling) };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, useFrozen, frozen, firm, year, month, p.cnssCeiling, s],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, { r, plafonne }) => {
        acc.masse += r.salaireBrut;
        acc.massePlaf += plafonne;
        acc.cnssSal += r.cnssSalarie;
        acc.cnssPatr += r.cnssPatronal;
        acc.amo += r.amoSalarie;
        acc.af += r.af;
        acc.ir += r.ir;
        return acc;
      },
      { masse: 0, massePlaf: 0, cnssSal: 0, cnssPatr: 0, amo: 0, af: 0, ir: 0 },
    );
  }, [rows]);

  const cnssTotal = totals.cnssSal + totals.cnssPatr;

  /** Trace une déclaration CNSS produite (traçabilité + KPI du « Journal des documents »). */
  function trackDecl(format: "bds" | "print") {
    actions.recordDocGeneration({
      firm_id: firm.id,
      doc_type: "declaration_cnss",
      format,
      subject: `${firm.name} · ${periodLabel(year, month)}`,
      period_year: year,
      period_month: month,
    });
  }

  function downloadBds() {
    trackDecl("bds");
    const lines = rows.map(
      ({ matricule, cnss, r, plafonne }) =>
        `${matricule ?? ""};${cnss ?? ""};${plafonne.toFixed(2)};${(
          r.cnssSalarie + r.cnssPatronal
        ).toFixed(2)}`,
    );
    const header = `# BDS DAMANCOM ${firm.name} ${periodLabel(year, month)}\n# matricule;cnss;sbi_plafonne;cnss_total\n`;
    const blob = new Blob([header + lines.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bds_${firm.id}_${year}-${String(month).padStart(2, "0")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={t("page.declarations.title")}
        subtitle={t("page.declarations.sub")}
      >
        <Field label={t("pay.year")}>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("pay.month")}>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS_FR.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </PageHeader>

      {incompleteValidation && (
        <Card className="mb-4 border-warning/50">
          <CardContent className="pt-4 flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <span className="text-muted-foreground">
              <b className="text-foreground">Écart avec la comptabilité.</b> Cette période est validée avec
              seulement <b>{frozen.length}</b> bulletin(s), alors que <b>{employees.length}</b> salarié(s) sont
              employés sur {periodLabel(year, month)}. Le montant ci-dessous est calculé sur l'effectif <b>réel
              ({employees.length})</b> ; l'<b>écriture comptable</b> reste figée sur les {frozen.length} bulletins
              validés — d'où la différence. Pour aligner les deux : <b>Paie → {periodLabel(year, month)} → Remettre
              en brouillon</b>, puis <b>re-valider</b> (l'effectif complet sera figé).
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("decl.cnss.title")} {periodLabel(year, month)}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>{t("doc.employee")}</Th>
                <Th>{t("doc.cnss")}</Th>
                <Th className="text-right">SBI</Th>
                <Th className="text-right">{t("decl.col.plafonne")} ({num(p.cnssCeiling)})</Th>
                <Th className="text-right">{t("decl.col.cnssSal")} {pct(p.cnssEmployeeRate)}</Th>
                <Th className="text-right">{t("decl.col.cnssPat")} {pct(p.cnssEmployerRate)}</Th>
                <Th className="text-right">{t("decl.col.amoSal")} {pct(p.amoEmployeeRate)}</Th>
                <Th className="text-right">AF</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, name, cnss, r, plafonne }) => (
                <tr key={key}>
                  <Td>{name}</Td>
                  <Td>
                    {cnss ? cnss : <Badge tone="destructive">{t("decl.notReg")}</Badge>}
                  </Td>
                  <Td className="text-right num">{mad(r.sbi)}</Td>
                  <Td className="text-right num">{mad(plafonne)}</Td>
                  <Td className="text-right num">{mad(r.cnssSalarie)}</Td>
                  <Td className="text-right num">{mad(r.cnssPatronal)}</Td>
                  <Td className="text-right num">{mad(r.amoSalarie)}</Td>
                  <Td className="text-right num">{mad(r.af)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>{t("decl.total")} ({rows.length})</Td>
                <Td />
                <Td className="text-right num">{mad(totals.masse)}</Td>
                <Td className="text-right num">{mad(totals.massePlaf)}</Td>
                <Td className="text-right num">{mad(totals.cnssSal)}</Td>
                <Td className="text-right num">{mad(totals.cnssPatr)}</Td>
                <Td className="text-right num">{mad(totals.amo)}</Td>
                <Td className="text-right num">{mad(totals.af)}</Td>
              </tr>
            </tfoot>
          </Table>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("decl.kpi.masse")}</p>
              <p className="mt-1 num text-lg font-semibold">{mad(totals.masse)}</p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("decl.kpi.massePlaf")}</p>
              <p className="mt-1 num text-lg font-semibold">{mad(totals.massePlaf)}</p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("decl.kpi.cnss")}</p>
              <p className="mt-1 num text-lg font-semibold">{mad(cnssTotal)}</p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("decl.kpi.headcount")}</p>
              <p className="mt-1 num text-lg font-semibold">{rows.length}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => { trackDecl("print"); window.print(); }}>
              <FileDown size={16} />
              {t("decl.export")}
            </Button>
            <Button variant="sage" onClick={downloadBds}>
              <FileText size={16} />
              {t("decl.bds")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("decl.damancomNote")}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Landmark size={16} className="text-sage" />
              {t("decl.9421.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>{t("doc.employee")}</Th>
                <Th>{t("doc.cnss")}</Th>
                <Th className="text-right">{t("decl.col.irMonth")}</Th>
                <Th className="text-right">{t("decl.col.irYear")}</Th>
                <Th className="text-right">{t("decl.col.netMonth")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, name, cnss, r }) => (
                <tr key={key}>
                  <Td>{name}</Td>
                  <Td>{cnss ?? "—"}</Td>
                  <Td className="text-right num">{mad(r.ir)}</Td>
                  <Td className="text-right num">{mad(r.ir * 12)}</Td>
                  <Td className="text-right num">{mad(r.netAPayer)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>{t("decl.total")}</Td>
                <Td />
                <Td className="text-right num">{mad(totals.ir)}</Td>
                <Td className="text-right num">{mad(totals.ir * 12)}</Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("decl.9421.note")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <CalendarClock size={16} className="text-warning" />
              {t("decl.deadlines.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge tone="warning">{t("decl.deadline.badge")}</Badge>
            <p className="text-sm text-muted-foreground">
              {t("decl.deadline.body1")} {periodLabel(year, month)} {t("decl.deadline.body2")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
