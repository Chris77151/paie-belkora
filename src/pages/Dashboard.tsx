import { useMemo } from "react";
import {
  Users, Wallet, Building2, ShieldAlert, CalendarClock, TrendingUp,
} from "lucide-react";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { currentFirm, deriveAlerts, employeesOfFirm, useStore } from "@/data/store";
import { computeFor, defaultInput } from "@/lib/payroll-helpers";
import { Card, CardContent, CardHeader, CardTitle, Kpi, PageHeader, Badge } from "@/components/ui/kit";
import { mad, num, periodLabel } from "@/lib/format";

// Palette data-viz tokenisée — famille de marque, adaptative light/dark (cf. index.css).
const PALETTE = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];
const YEAR = 2026;
const MONTH = 6;

export default function Dashboard() {
  const s = useStore();
  const firm = currentFirm(s);
  const emps = employeesOfFirm(s, firm.id).filter((e) => e.is_active);
  const alerts = deriveAlerts(s, firm.id);

  const agg = useMemo(() => {
    let brut = 0, cout = 0, net = 0, cnss = 0;
    const bySite: Record<string, number> = {};
    const byContract: Record<string, number> = {};
    for (const e of emps) {
      const r = computeFor(e, firm, YEAR, MONTH, defaultInput(e));
      brut += r.salaireBrut;
      cout += r.coutTotalEmployeur;
      net += r.netAPayer;
      cnss += r.cnssSalarie + r.cnssPatronal;
      const site = e.site ?? "Autre";
      bySite[site] = (bySite[site] ?? 0) + r.salaireBrut;
      byContract[e.contract_type] = (byContract[e.contract_type] ?? 0) + 1;
    }
    return {
      brut, cout, net, cnss,
      siteData: Object.entries(bySite).map(([name, value]) => ({ name, value: Math.round(value) })),
      contractData: Object.entries(byContract).map(([name, value]) => ({ name, value })),
    };
  }, [emps, firm]);

  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${firm.name} · masse salariale simulée pour ${periodLabel(YEAR, MONTH)}`}
      >
        <Badge tone="sage">Régime {firm.regime}</Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Effectif actif" value={String(emps.length)} sub="salariés en poste" icon={<Users size={20} />} />
        <Kpi label="Masse salariale brute" value={mad(agg.brut)} sub="mensuelle estimée" icon={<Wallet size={20} />} accent="sage" />
        <Kpi label="Coût total employeur" value={mad(agg.cout)} sub="brut + charges patronales" icon={<Building2 size={20} />} accent="gold" />
        <Kpi
          label="Alertes conformité"
          value={String(alerts.length)}
          sub={`${critical} critique(s)`}
          icon={<ShieldAlert size={20} />}
          accent={critical > 0 ? "destructive" : "primary"}
        />
      </div>

      <div className="grid gap-4 mt-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={17} className="text-primary" /> Masse salariale par site
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agg.siteData} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={64}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => [mad(v), "Brut"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12, background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {agg.siteData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition des contrats</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={agg.contractData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={92} paddingAngle={3}>
                  {agg.contractData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12, background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {agg.contractData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock size={17} className="text-gold" /> Échéances sociales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2.5">
              <span>Bordereau CNSS {periodLabel(YEAR, MONTH)}</span>
              <Badge tone="warning">avant le 10/{String(MONTH + 1).padStart(2, "0")}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2.5">
              <span>Versement IR (retenue à la source)</span>
              <Badge tone="muted">mensuel</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2.5">
              <span>Total cotisations CNSS (part sal. + patr.)</span>
              <span className="num font-medium">{mad(agg.cnss)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert size={17} className="text-destructive" /> Dernières alertes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && <p className="text-sm text-success">Aucune alerte — dossier conforme.</p>}
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: a.severity === "critical" ? "hsl(var(--destructive))" : "hsl(var(--warning))" }}
                />
                <span className="text-muted-foreground">{a.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Masse salariale calculée sur une base théorique de {num(191)} h / mois par salarié actif.
        Les montants figés proviennent des périodes validées (page Paie).
      </p>
    </div>
  );
}
