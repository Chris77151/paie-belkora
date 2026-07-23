import { useMemo, useState } from "react";
import {
  Activity, ShieldAlert, Wrench, RefreshCw, CheckCircle2, Lock, Calculator, Database,
} from "lucide-react";
import { actions, useStore } from "@/data/store";
import { useSession } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import {
  runStabilityChecks, buildReport, type StabilityFinding, type StabilitySeverity, type StabilityAxis,
} from "@/lib/stability-engine";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, Td, Th,
} from "@/components/ui/kit";

const SEV_TONE: Record<StabilitySeverity, Parameters<typeof Badge>[0]["tone"]> = {
  critique: "destructive", eleve: "warning", moyen: "muted", info: "sage",
};
const SEV_LABEL: Record<StabilitySeverity, string> = {
  critique: "Critique", eleve: "Élevé", moyen: "Moyen", info: "Info",
};
const AXIS_ICON: Record<StabilityAxis, typeof Calculator> = {
  calcul: Calculator, integrite: Database,
};

export default function Stability() {
  const s = useStore();
  const t = useT();
  const session = useSession();
  const isSuperAdmin = session?.role === "super_admin";

  // Re-analyse : on incrémente un jeton pour recalculer explicitement (l'état est déjà réactif).
  const [nonce, setNonce] = useState(0);
  const report = useMemo(() => buildReport(runStabilityChecks(s)), [s, nonce]);

  // Défense en profondeur : refuse le RENDU si le rôle n'est pas super administrateur.
  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title={t("page.stability.title")} subtitle={t("page.stability.sub")} />
        <Card>
          <CardContent className="pt-6">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock size={16} className="mt-0.5 shrink-0 text-destructive" />
              Cette zone est réservée au super administrateur.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function fix() {
    if (report.repairableCount === 0) {
      window.alert(t("stab.fixNone"));
      return;
    }
    if (!window.confirm(t("stab.fixConfirm"))) return;
    const r = actions.repairIntegrity();
    setNonce((n) => n + 1);
    window.alert(
      `Corrections appliquées : ${r.payslips} bulletin(s), ${r.leaves} congé(s), ${r.accidents} accident(s) orphelin(s) purgé(s)` +
        (r.currentFirm ? ", société active recalée" : "") + ".",
    );
  }

  const scoreTone =
    report.score >= 90 ? "text-success" : report.score >= 60 ? "text-warning" : "text-destructive";

  return (
    <div>
      <PageHeader title={t("page.stability.title")} subtitle={t("page.stability.sub")}>
        <Button variant="outline" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={16} /> {t("stab.rerun")}
        </Button>
        <Button variant="sage" onClick={fix} disabled={report.repairableCount === 0}>
          <Wrench size={16} /> {t("stab.fix")}
          {report.repairableCount > 0 && (
            <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-background/25 px-1 text-[11px] font-semibold">
              {report.repairableCount}
            </span>
          )}
        </Button>
      </PageHeader>

      {/* Synthèse : score + compteurs par gravité */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity size={16} className="text-primary" /> {t("stab.score")}
            </div>
            <div className={`mt-1 font-display text-3xl font-bold ${scoreTone}`}>{report.score}<span className="text-lg text-muted-foreground">/100</span></div>
          </CardContent>
        </Card>
        {(["critique", "eleve", "moyen"] as StabilitySeverity[]).map((sev) => (
          <Card key={sev}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{SEV_LABEL[sev]}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-display text-3xl font-bold">{report.counts[sev]}</span>
                <Badge tone={SEV_TONE[sev]}>{sev}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Note : correction données vs code */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" />
            {t("stab.about")}
          </p>
        </CardContent>
      </Card>

      {/* Constats */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Activity size={16} className="text-primary" /> {report.findings.length} constat(s)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.findings.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm font-medium text-success">
              <CheckCircle2 size={18} /> {t("stab.none")}
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("stab.col.sev")}</Th>
                  <Th>{t("stab.col.axis")}</Th>
                  <Th>{t("stab.col.finding")}</Th>
                  <Th>{t("stab.col.reco")}</Th>
                </tr>
              </thead>
              <tbody>
                {[...report.findings]
                  .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
                  .map((f: StabilityFinding) => {
                    const AxisIcon = AXIS_ICON[f.axis];
                    return (
                      <tr key={f.id}>
                        <Td><Badge tone={SEV_TONE[f.severity]}>{SEV_LABEL[f.severity]}</Badge></Td>
                        <Td>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <AxisIcon size={14} className="text-muted-foreground" />
                            {t(f.axis === "calcul" ? "stab.axis.calcul" : "stab.axis.integrite")}
                          </span>
                        </Td>
                        <Td>
                          <div className="font-medium">{f.title}</div>
                          <div className="mt-0.5 max-w-xl text-[12.5px] text-muted-foreground">{f.detail}</div>
                          {f.repairable && (
                            <Badge tone="sage" className="mt-1">{t("stab.repairable")}</Badge>
                          )}
                        </Td>
                        <Td className="max-w-xs text-[12.5px] text-muted-foreground">{f.recommendation}</Td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const sevRank = (s: StabilitySeverity): number =>
  ({ critique: 0, eleve: 1, moyen: 2, info: 3 })[s];
