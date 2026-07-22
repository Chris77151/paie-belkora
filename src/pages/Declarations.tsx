import { useMemo, useState } from "react";
import { FileDown, FileText, CalendarClock, Landmark } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm, periodsOfFirm } from "@/data/store";
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
import { mad, periodLabel, MONTHS_FR } from "@/lib/format";
import { computeFor, defaultInput } from "@/lib/payroll-helpers";

const CNSS_CEILING = 6000;
const YEAR_OPTIONS = [2025, 2026];

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

  const employees = useMemo(
    () => employeesOfFirm(s, firm.id).filter((e) => e.is_active),
    [s, firm.id],
  );

  const rows = useMemo(
    () =>
      employees.map((e) => {
        const r = computeFor(e, firm, year, month, defaultInput(e));
        const plafonne = Math.min(r.sbi, CNSS_CEILING);
        return { emp: e, r, plafonne };
      }),
    [employees, firm, year, month],
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

  function downloadBds() {
    const lines = rows.map(
      ({ emp, r, plafonne }) =>
        `${emp.matricule ?? emp.id};${emp.cnss_number ?? ""};${plafonne.toFixed(2)};${(
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
                <Th className="text-right">{t("decl.col.plafonne")}</Th>
                <Th className="text-right">{t("decl.col.cnssSal")}</Th>
                <Th className="text-right">{t("decl.col.cnssPat")}</Th>
                <Th className="text-right">{t("decl.col.amoSal")}</Th>
                <Th className="text-right">AF</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, r, plafonne }) => (
                <tr key={emp.id}>
                  <Td>
                    {emp.first_name} {emp.last_name}
                  </Td>
                  <Td>
                    {emp.cnss_number ? (
                      emp.cnss_number
                    ) : (
                      <Badge tone="destructive">{t("decl.notReg")}</Badge>
                    )}
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
            <Button variant="outline" onClick={() => window.print()}>
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
              {rows.map(({ emp, r }) => (
                <tr key={emp.id}>
                  <Td>
                    {emp.first_name} {emp.last_name}
                  </Td>
                  <Td>{emp.cnss_number ?? "—"}</Td>
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
