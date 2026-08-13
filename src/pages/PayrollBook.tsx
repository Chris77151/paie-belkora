import { useMemo, useState } from "react";
import { FileDown, Sheet, BookText, Wallet, MinusCircle, Users } from "lucide-react";
import { useStore, currentFirm } from "@/data/store";
import { useT } from "@/lib/i18n";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Field, Select,
  Table, Th, Td, PageHeader, Kpi,
} from "@/components/ui/kit";
import { mad, num, dateFr, MONTHS_FR } from "@/lib/format";
import { buildPayrollBook, payrollBookYears } from "@/lib/payroll-book";
import { exportPayrollBookPdf, exportPayrollBookXlsx } from "@/lib/payroll-book-export";

export default function PayrollBook() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);

  const years = useMemo(() => {
    const ys = payrollBookYears(s, firm.id);
    return ys.length ? ys : [new Date().getFullYear()];
  }, [s, firm.id]);

  const [year, setYear] = useState<number>(years[0]);
  // 0 = toute l'année, 1-12 = mois filtré.
  const [month, setMonth] = useState<number>(0);

  const effectiveYear = years.includes(year) ? year : years[0];
  const book = useMemo(
    () => buildPayrollBook(s, firm, effectiveYear, month === 0 ? null : month),
    [s, firm, effectiveYear, month],
  );
  const { rows, totals } = book;

  return (
    <div>
      <PageHeader title={t("page.livrePaie.title")} subtitle={t("page.livrePaie.sub")}>
        <Field label={t("pay.year")}>
          <Select value={effectiveYear} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("pay.month")}>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            <option value={0}>{t("lp.all")}</option>
            {MONTHS_FR.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Select>
        </Field>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("lp.kpi.bulletins")} value={String(totals.count)} sub={t("lp.kpi.bulletins.sub")} accent="primary" icon={<Users size={20} />} />
        <Kpi label={t("lp.kpi.masse")} value={mad(totals.salaireBrut)} sub={t("lp.kpi.masse.sub")} accent="sage" icon={<Wallet size={20} />} />
        <Kpi label={t("lp.kpi.retenues")} value={mad(totals.totalRetenues)} sub={t("lp.kpi.retenues.sub")} accent="gold" icon={<MinusCircle size={20} />} />
        <Kpi label={t("lp.kpi.net")} value={mad(totals.netAPayer)} sub={t("lp.kpi.net.sub")} accent="primary" icon={<BookText size={20} />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.livrePaie.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lp.empty")}</p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <thead>
                  <tr>
                    <Th className="text-right">N°</Th>
                    <Th>Période</Th>
                    <Th>Matricule</Th>
                    <Th>{t("doc.employee")}</Th>
                    <Th>Emploi</Th>
                    <Th>N° CNSS</Th>
                    <Th>Naissance</Th>
                    <Th>Entrée</Th>
                    <Th className="text-right">S.F.</Th>
                    <Th className="text-right">P.C.</Th>
                    <Th className="text-right">H.N.</Th>
                    <Th className="text-right">HS 25</Th>
                    <Th className="text-right">HS 50</Th>
                    <Th className="text-right">HS 100</Th>
                    <Th className="text-right">Jours</Th>
                    <Th className="text-right">Base</Th>
                    <Th className="text-right">Ancien.</Th>
                    <Th className="text-right">Primes/Ind.</Th>
                    <Th className="text-right">Brut</Th>
                    <Th className="text-right">SBI</Th>
                    <Th className="text-right">CNSS</Th>
                    <Th className="text-right">AMO</Th>
                    <Th className="text-right">IR</Th>
                    <Th className="text-right">Total ret.</Th>
                    <Th className="text-right">Salaire net</Th>
                    <Th className="text-right">Avances</Th>
                    <Th className="text-right">Net à payer</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.year}-${r.month}-${r.order}`}>
                      <Td className="text-right num">{r.order}</Td>
                      <Td className="whitespace-nowrap">{r.period}</Td>
                      <Td>{r.matricule || "—"}</Td>
                      <Td className="whitespace-nowrap">{r.name}</Td>
                      <Td>{r.emploi || "—"}</Td>
                      <Td>{r.cnss || "—"}</Td>
                      <Td className="whitespace-nowrap">{r.birthDate ? dateFr(r.birthDate) : "—"}</Td>
                      <Td className="whitespace-nowrap">{dateFr(r.hireDate)}</Td>
                      <Td className="text-right">{r.maritalStatus || "—"}</Td>
                      <Td className="text-right num">{r.dependents}</Td>
                      <Td className="text-right num">{r.hoursNormal || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt25 || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt50 || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt100 || "—"}</Td>
                      <Td className="text-right num">{r.daysWorked || "—"}</Td>
                      <Td className="text-right num">{num(r.salaireBase)}</Td>
                      <Td className="text-right num">{r.primeAnciennete ? num(r.primeAnciennete) : "—"}</Td>
                      <Td className="text-right num">{r.primesIndemnites ? num(r.primesIndemnites) : "—"}</Td>
                      <Td className="text-right num">{num(r.salaireBrut)}</Td>
                      <Td className="text-right num">{num(r.sbi)}</Td>
                      <Td className="text-right num">{num(r.cnssSalarie)}</Td>
                      <Td className="text-right num">{num(r.amoSalarie)}</Td>
                      <Td className="text-right num">{num(r.ir)}</Td>
                      <Td className="text-right num">{num(r.totalRetenues)}</Td>
                      <Td className="text-right num">{num(r.netAPayer)}</Td>
                      <Td className="text-right num">{r.avances ? num(r.avances) : "—"}</Td>
                      <Td className="text-right num font-medium">{num(r.netFinal)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <Td colSpan={14} className="text-right">{t("lp.total")} ({totals.count})</Td>
                    <Td className="text-right num">{num(totals.daysWorked)}</Td>
                    <Td className="text-right num">{num(totals.salaireBase)}</Td>
                    <Td className="text-right num">{num(totals.primeAnciennete)}</Td>
                    <Td className="text-right num">{num(totals.primesIndemnites)}</Td>
                    <Td className="text-right num">{num(totals.salaireBrut)}</Td>
                    <Td className="text-right num">{num(totals.sbi)}</Td>
                    <Td className="text-right num">{num(totals.cnssSalarie)}</Td>
                    <Td className="text-right num">{num(totals.amoSalarie)}</Td>
                    <Td className="text-right num">{num(totals.ir)}</Td>
                    <Td className="text-right num">{num(totals.totalRetenues)}</Td>
                    <Td className="text-right num">{num(totals.netAPayer)}</Td>
                    <Td className="text-right num">{num(totals.avances)}</Td>
                    <Td className="text-right num">{num(totals.netFinal)}</Td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void exportPayrollBookPdf(book)} disabled={rows.length === 0}>
              <FileDown size={16} /> {t("lp.pdf")}
            </Button>
            <Button variant="sage" onClick={() => exportPayrollBookXlsx(book)} disabled={rows.length === 0}>
              <Sheet size={16} /> {t("lp.excel")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("lp.note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
