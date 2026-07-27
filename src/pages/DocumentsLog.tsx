import { useMemo, useState } from "react";
import { FileClock, FileText, Users, CalendarClock, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { actions, currentFirm, useStore } from "@/data/store";
import { useT, type TKey } from "@/lib/i18n";
import { computeDocKpis } from "@/lib/doc-log";
import type { DocFormat, DocGenEvent, DocType } from "@/data/types";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Kpi, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { dateTimeFr, MONTHS_FR, periodLabel } from "@/lib/format";

const TYPE_KEY: Record<DocType, TKey> = {
  bulletin: "doc.type.bulletin",
  attestation: "doc.type.attestation",
  contrat: "doc.type.contrat",
  disciplinaire: "doc.type.disciplinaire",
  rupture: "doc.type.rupture",
  mineurs: "doc.type.mineurs",
  declaration_cnss: "doc.type.declaration_cnss",
  regularisation: "doc.type.regularisation",
};
const FORMAT_KEY: Record<DocFormat, TKey> = {
  pdf: "doc.format.pdf",
  html: "doc.format.html",
  apercu: "doc.format.apercu",
  latex: "doc.format.latex",
  bds: "doc.format.bds",
  print: "doc.format.print",
};
const TYPE_TONE: Record<DocType, Parameters<typeof Badge>[0]["tone"]> = {
  bulletin: "primary",
  attestation: "sage",
  contrat: "sage",
  disciplinaire: "warning",
  rupture: "destructive",
  mineurs: "warning",
  declaration_cnss: "success",
  regularisation: "primary",
};

/** Mois court « juil. 2026 » à partir d'une année + mois (1-12). */
function shortMonth(year: number, month: number): string {
  return `${MONTHS_FR[month - 1]?.slice(0, 4)}. ${year}`;
}

export default function DocumentsLog() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const [typeFilter, setTypeFilter] = useState<"all" | DocType>("all");

  // Périmètre : société active (comme les autres volets). Le « maintenant » est figé au rendu.
  const events = useMemo(
    () => (s.docGenerations ?? []).filter((e) => e.firm_id === firm.id),
    [s.docGenerations, firm.id],
  );
  const now = new Date().toISOString();
  const kpis = useMemo(() => computeDocKpis(events, now), [events, now]);

  // 12 derniers mois de la série (complétés à droite).
  const monthly = kpis.monthly.slice(-12);
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));

  const delta = kpis.thisMonth - kpis.prevMonth;

  const rows: DocGenEvent[] = [...events]
    .reverse()
    .filter((e) => typeFilter === "all" || e.doc_type === typeFilter);

  function clearLog() {
    if (window.confirm("Vider le journal des documents de cette société ? Cette action est irréversible.")) {
      actions.clearDocGenerations();
    }
  }

  return (
    <div>
      <PageHeader title={t("page.doclog.title")} subtitle={`${t("page.doclog.sub")} · ${firm.name}`}>
        {events.length > 0 && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={clearLog}>
            <Trash2 size={15} /> {t("doclog.clear")}
          </Button>
        )}
      </PageHeader>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi label={t("doclog.kpi.total")} value={String(kpis.total)} icon={<FileText size={18} />} />
        <Kpi
          label={t("doclog.kpi.thisMonth")}
          value={String(kpis.thisMonth)}
          sub={delta === 0 ? t("doclog.kpi.vsPrev") : `${delta > 0 ? "+" : ""}${delta} ${t("doclog.kpi.vsPrev")}`}
          icon={delta >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          accent={delta >= 0 ? "sage" : "destructive"}
        />
        <Kpi label={t("doclog.kpi.distinct")} value={String(kpis.distinctEmployees)} icon={<Users size={18} />} accent="gold" />
        <Kpi
          label={t("doclog.kpi.last")}
          value={kpis.lastAt ? dateTimeFr(kpis.lastAt) : "—"}
          icon={<CalendarClock size={18} />}
        />
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileClock size={28} className="mx-auto mb-3 text-muted-foreground/60" />
            {t("doclog.empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Série mensuelle */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileClock size={16} className="text-primary" /> {t("doclog.monthly.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 sm:gap-3 h-40 pt-2">
                {monthly.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center justify-end gap-1.5" title={`${shortMonth(m.year, m.month)} : ${m.count}`}>
                    <span className="text-xs font-semibold num text-foreground">{m.count}</span>
                    <div
                      className="w-full max-w-[46px] rounded-t bg-primary/85 transition-all"
                      style={{ height: `${Math.max(4, (m.count / maxMonthly) * 100)}%` }}
                    />
                    <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">{shortMonth(m.year, m.month)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Répartitions */}
          <div className="grid gap-6 lg:grid-cols-3 mb-6">
            <BreakdownCard
              title={t("doclog.byType.title")}
              rows={kpis.byType.map((r) => ({ label: t(TYPE_KEY[r.key as DocType]), count: r.count }))}
              total={kpis.total}
            />
            <BreakdownCard
              title={t("doclog.byFormat.title")}
              rows={kpis.byFormat.map((r) => ({ label: t(FORMAT_KEY[r.key as DocFormat]), count: r.count }))}
              total={kpis.total}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users size={16} className="text-primary" /> {t("doclog.top.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {kpis.topEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-2">
                    {kpis.topEmployees.map((e) => (
                      <li key={e.key} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{e.label}</span>
                        <Badge tone="muted">{e.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Table des documents récents */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText size={16} className="text-primary" /> {t("doclog.recent.title")}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{events.length} {t("doclog.count")}</span>
                  <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="w-52">
                    <option value="all">{t("doclog.filter.allTypes")}</option>
                    {(Object.keys(TYPE_KEY) as DocType[]).map((k) => (
                      <option key={k} value={k}>{t(TYPE_KEY[k])}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </CardHeader>
            <Table>
              <thead>
                <tr>
                  <Th>{t("doclog.col.date")}</Th>
                  <Th>{t("doclog.col.type")}</Th>
                  <Th>{t("doclog.col.format")}</Th>
                  <Th>{t("doclog.col.subject")}</Th>
                  <Th>{t("doclog.col.period")}</Th>
                  <Th>{t("doclog.col.author")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40">
                    <Td className="num text-xs whitespace-nowrap">{dateTimeFr(e.at)}</Td>
                    <Td><Badge tone={TYPE_TONE[e.doc_type]}>{t(TYPE_KEY[e.doc_type])}</Badge></Td>
                    <Td className="text-muted-foreground text-xs">{t(FORMAT_KEY[e.format])}</Td>
                    <Td className="font-medium">{e.subject ?? "—"}</Td>
                    <Td className="text-muted-foreground text-xs whitespace-nowrap">
                      {e.period_year && e.period_month ? periodLabel(e.period_year, e.period_month) : "—"}
                    </Td>
                    <Td className="text-muted-foreground text-xs">{e.by ?? "—"}</Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <Td colSpan={6} className="py-8 text-center text-muted-foreground">{t("doclog.empty")}</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

/** Petite carte de répartition avec barre de proportion. */
function BreakdownCard({ title, rows, total }: { title: string; rows: { label: string; count: number }[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.label}</span>
                  <span className="num text-muted-foreground">{r.count}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
