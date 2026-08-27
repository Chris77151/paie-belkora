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
import { YearSelect } from "@/components/YearSelect";

export default function PayrollBook() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);

  // Années RÉELLEMENT présentes dans les données de la société (périodes) — fusionnées à la plage
  // standard par le sélecteur, ce qui supprime les listes « à trous » (ex. 2016-2020 puis 2026).
  const dataYears = useMemo(() => payrollBookYears(s, firm.id), [s, firm.id]);

  const [year, setYear] = useState<number>(() => dataYears[0] ?? new Date().getFullYear());
  // 0 = toute l'année, 1-12 = mois filtré.
  const [month, setMonth] = useState<number>(0);

  // Au changement de société, se repositionner sur son année de données la plus récente.
  const [trackedFirm, setTrackedFirm] = useState<string>(firm.id);
  if (trackedFirm !== firm.id) {
    setTrackedFirm(firm.id);
    setYear(dataYears[0] ?? new Date().getFullYear());
  }

  const book = useMemo(
    () => buildPayrollBook(s, firm, year, month === 0 ? null : month),
    [s, firm, year, month],
  );
  const { rows, totals } = book;

  return (
    <div>
      <PageHeader title={t("page.livrePaie.title")} subtitle={t("page.livrePaie.sub")}>
        <Field label={t("pay.year")}>
          <YearSelect value={year} onChange={setYear} dataYears={dataYears} className="w-full" />
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
                {/* En-têtes groupés calqués sur le registre officiel (2 pages) : identité, période
                    payée (H/J + Total), rémunération, pont brut→imposable (à déduire / à ajouter),
                    retenues (CNSS/AMO/IR + Total), net. */}
                <thead>
                  <tr>
                    <Th rowSpan={2} className="text-right align-bottom">N° Bull.</Th>
                    <Th rowSpan={2} className="align-bottom">Période</Th>
                    <Th rowSpan={2} className="align-bottom">{t("doc.employee")}</Th>
                    <Th rowSpan={2} className="align-bottom">Emploi</Th>
                    <Th rowSpan={2} className="align-bottom">Naissance</Th>
                    <Th rowSpan={2} className="text-right align-bottom">S.F.</Th>
                    <Th rowSpan={2} className="align-bottom">N° CNSS</Th>
                    <Th colSpan={6} className="text-center">Période payée (Heures / Jours)</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Salaire du poste</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Ancien.</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Primes / Ind.</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Salaire brut</Th>
                    <Th rowSpan={2} className="text-right align-bottom">À déduire</Th>
                    <Th rowSpan={2} className="text-right align-bottom">À ajouter</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Salaire imposable</Th>
                    <Th colSpan={4} className="text-center">À déduire (retenues)</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Salaire net</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Avances</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Net à payer</Th>
                  </tr>
                  <tr>
                    <Th className="text-right">H.N.</Th>
                    <Th className="text-right">H.S. 25</Th>
                    <Th className="text-right">H.S. 50</Th>
                    <Th className="text-right">H.S. 100</Th>
                    <Th className="text-right">Jours</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">C.N.S.S</Th>
                    <Th className="text-right">AMO</Th>
                    <Th className="text-right">I.R.</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.year}-${r.month}-${r.order}`}>
                      <Td className="text-right num">{r.order}</Td>
                      <Td className="whitespace-nowrap">{r.period}</Td>
                      <Td className="whitespace-nowrap">{r.name}</Td>
                      <Td>{r.emploi || "—"}</Td>
                      <Td className="whitespace-nowrap">{r.birthDate ? dateFr(r.birthDate) : "—"}</Td>
                      <Td className="text-right">{r.maritalStatus || "—"}</Td>
                      <Td>{r.cnss || "—"}</Td>
                      <Td className="text-right num">{r.hoursNormal || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt25 || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt50 || "—"}</Td>
                      <Td className="text-right num">{r.hoursOt100 || "—"}</Td>
                      <Td className="text-right num">{r.daysWorked || "—"}</Td>
                      <Td className="text-right num">{r.totalHours || "—"}</Td>
                      <Td className="text-right num">{num(r.salaireBase)}</Td>
                      <Td className="text-right num">{r.primeAnciennete ? num(r.primeAnciennete) : "—"}</Td>
                      <Td className="text-right num">{r.primesIndemnites ? num(r.primesIndemnites) : "—"}</Td>
                      <Td className="text-right num">{num(r.salaireBrut)}</Td>
                      <Td className="text-right num">{r.imposableADeduire ? num(r.imposableADeduire) : "—"}</Td>
                      <Td className="text-right num">{r.imposableAAjouter ? num(r.imposableAAjouter) : "—"}</Td>
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
                    <Td colSpan={7} className="text-right">{t("lp.total")} ({totals.count})</Td>
                    <Td /><Td /><Td /><Td />
                    <Td className="text-right num">{num(totals.daysWorked)}</Td>
                    <Td className="text-right num">{num(totals.totalHours)}</Td>
                    <Td className="text-right num">{num(totals.salaireBase)}</Td>
                    <Td className="text-right num">{num(totals.primeAnciennete)}</Td>
                    <Td className="text-right num">{num(totals.primesIndemnites)}</Td>
                    <Td className="text-right num">{num(totals.salaireBrut)}</Td>
                    <Td className="text-right num">{num(totals.imposableADeduire)}</Td>
                    <Td className="text-right num">{num(totals.imposableAAjouter)}</Td>
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
