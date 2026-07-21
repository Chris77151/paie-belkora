import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, Info, HardHat, FileWarning } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm, deriveAlerts } from "@/data/store";
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

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critique",
  warning: "Avertissement",
  info: "Info",
};

const TYPE_LABEL: Record<string, string> = {
  cnss_missing: "Immatriculation CNSS",
  cin_missing: "Pièce d'identité",
  minor_hazardous: "Travail des mineurs",
  cdd_expiring: "Échéance CDD",
  contract_missing: "Contrat manquant",
};

export default function Compliance() {
  const s = useStore();
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
      <PageHeader title="Conformité RH" subtitle="Alertes réglementaires, AT et échéances de contrat" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Alertes critiques"
          value={String(nbCritical)}
          sub="Action immédiate requise"
          accent="destructive"
          icon={<ShieldAlert size={20} />}
        />
        <Kpi
          label="Avertissements"
          value={String(nbWarning)}
          sub="À traiter sous 30 jours"
          accent="gold"
          icon={<FileWarning size={20} />}
        />
        <Kpi
          label="Total alertes"
          value={String(alerts.length)}
          sub={`${nbInfo} information(s)`}
          accent="primary"
          icon={<Info size={20} />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Alertes de conformité</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-4 text-sm text-success">
              <ShieldCheck size={18} />
              Aucune alerte, dossier conforme.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Sévérité</Th>
                  <Th>Type</Th>
                  <Th>Message</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Badge tone={severityTone(a.severity)}>{SEV_LABEL[a.severity]}</Badge>
                    </Td>
                    <Td>{TYPE_LABEL[a.type] ?? a.type}</Td>
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
              Registre des accidents du travail (loi 18-12)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Délai 48 heures</p>
              <p className="mt-1 text-sm">
                Information de l'employeur <span className="font-medium">par la victime</span> (ou
                ses ayants droit).
              </p>
            </div>
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Délai 5 jours ouvrables</p>
              <p className="mt-1 text-sm">
                Déclaration <span className="font-medium">de l'employeur à l'assureur</span> (et à
                l'inspection du travail).
              </p>
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Salarié</Th>
                <Th>Date accident</Th>
                <Th>Information employeur (48 h)</Th>
                <Th>Déclaration assureur (5 j)</Th>
                <Th>Assureur / Police</Th>
                <Th>Statut</Th>
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
                  <Badge tone="muted">Aucun AT déclaré</Badge>
                </Td>
              </tr>
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Alerte automatique si le délai de 5 jours de déclaration à l'assureur approche.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contrats CDD arrivant à échéance</CardTitle>
        </CardHeader>
        <CardContent>
          {cddRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun CDD avec échéance renseignée.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Salarié</Th>
                  <Th>Poste</Th>
                  <Th>Fin de contrat</Th>
                  <Th className="text-right">Jours restants</Th>
                  <Th>Statut</Th>
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
                          {days < 0 ? "Expiré" : "Échéance proche"}
                        </Badge>
                      ) : (
                        <Badge tone="muted">En cours</Badge>
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
