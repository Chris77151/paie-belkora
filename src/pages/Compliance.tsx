import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, Info, HardHat, FileWarning } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm, deriveAlerts } from "@/data/store";
import { useT, type TKey } from "@/lib/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  severityTone,
  Table,
  Th,
  Td,
  PageHeader,
  Kpi,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";
import type { Severity } from "@/data/types";

const SEV_KEY: Record<Severity, TKey> = {
  critical: "sev.critical",
  warning: "sev.warning",
  info: "sev.info",
};

const TYPE_KEY: Record<string, TKey> = {
  cnss_missing: "ctype.cnss_missing",
  cin_missing: "ctype.cin_missing",
  minor_hazardous: "ctype.minor_hazardous",
  cdd_expiring: "ctype.cdd_expiring",
  contract_missing: "ctype.contract_missing",
};

export default function Compliance() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);
  const alerts = useMemo(() => deriveAlerts(s, firm.id), [s, firm.id]);

  const nbCritical = alerts.filter((a) => a.severity === "critical").length;
  const nbWarning = alerts.filter((a) => a.severity === "warning").length;
  const nbInfo = alerts.filter((a) => a.severity === "info").length;

  const today = new Date();
  const cddRows = useMemo(
    () =>
      employeesOfFirm(s, firm.id)
        .filter((e) => e.is_active && e.contract_type === "CDD" && e.contract_end)
        .map((e) => {
          const days = Math.round(
            (new Date(e.contract_end as string).getTime() - today.getTime()) / 8.64e7,
          );
          return { emp: e, days };
        })
        .sort((a, b) => a.days - b.days),
    [s, firm.id],
  );

  return (
    <div>
      <PageHeader title={t("page.compliance.title")} subtitle={t("page.compliance.sub")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label={t("cmp.kpi.critical")}
          value={String(nbCritical)}
          sub={t("cmp.kpi.critical.sub")}
          accent="destructive"
          icon={<ShieldAlert size={20} />}
        />
        <Kpi
          label={t("cmp.kpi.warnings")}
          value={String(nbWarning)}
          sub={t("cmp.kpi.warnings.sub")}
          accent="gold"
          icon={<FileWarning size={20} />}
        />
        <Kpi
          label={t("cmp.kpi.total")}
          value={String(alerts.length)}
          sub={`${nbInfo} ${t("cmp.kpi.info.sub")}`}
          accent="primary"
          icon={<Info size={20} />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("cmp.alerts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-4 text-sm text-success">
              <ShieldCheck size={18} />
              {t("cmp.noAlert")}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("cmp.col.severity")}</Th>
                  <Th>{t("lv.col.type")}</Th>
                  <Th>{t("cmp.col.message")}</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Badge tone={severityTone(a.severity)}>{t(SEV_KEY[a.severity])}</Badge>
                    </Td>
                    <Td>{TYPE_KEY[a.type] ? t(TYPE_KEY[a.type]) : a.type}</Td>
                    <Td>{a.message}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <HardHat size={16} className="text-warning" />
              {t("cmp.at.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("cmp.at.delay48")}</p>
              <p className="mt-1 text-sm">
                {t("cmp.at.delay48.body")}
              </p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("cmp.at.delay5")}</p>
              <p className="mt-1 text-sm">
                {t("cmp.at.delay5.body")}
              </p>
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>{t("doc.employee")}</Th>
                <Th>{t("cmp.at.col.date")}</Th>
                <Th>{t("cmp.at.col.info48")}</Th>
                <Th>{t("cmp.at.col.decl5")}</Th>
                <Th>{t("cmp.at.col.insurer")}</Th>
                <Th>{t("cmp.col.status")}</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>
                  <Badge tone="muted">{t("cmp.at.none")}</Badge>
                </Td>
              </tr>
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("cmp.at.note")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("cmp.cdd.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {cddRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cmp.cdd.none")}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("doc.employee")}</Th>
                  <Th>{t("emp.position")}</Th>
                  <Th>{t("cmp.cdd.col.end")}</Th>
                  <Th className="text-right">{t("cmp.cdd.col.daysLeft")}</Th>
                  <Th>{t("cmp.col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {cddRows.map(({ emp, days }) => (
                  <tr key={emp.id}>
                    <Td>
                      {emp.first_name} {emp.last_name}
                    </Td>
                    <Td>{emp.position ?? "—"}</Td>
                    <Td>{dateFr(emp.contract_end)}</Td>
                    <Td className="text-right num">{days}</Td>
                    <Td>
                      {days <= 30 ? (
                        <Badge tone="warning">
                          {days < 0 ? t("cmp.cdd.expired") : t("cmp.cdd.soon")}
                        </Badge>
                      ) : (
                        <Badge tone="muted">{t("cmp.cdd.inProgress")}</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
