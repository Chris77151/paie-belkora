import { useMemo } from "react";
import { CalendarDays, Stethoscope, Hourglass, Baby } from "lucide-react";
import { useStore, currentFirm, employeesOfFirm } from "@/data/store";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Table,
  Th,
  Td,
  PageHeader,
  Kpi,
} from "@/components/ui/kit";
import { dateFr, num } from "@/lib/format";
import type { LeaveType } from "@/data/types";

const LEAVE_LABEL: Record<LeaveType, string> = {
  conge_paye: "Congé payé",
  maladie: "Maladie",
  AT: "Accident du travail",
  absence_injustifiee: "Absence injustifiée",
  maternite: "Maternité",
};

const ACQUIS_PER_MONTH = 1.5;

export default function Leaves() {
  const s = useStore();
  const firm = currentFirm(s);

  const employees = useMemo(() => employeesOfFirm(s, firm.id), [s, firm.id]);
  const empIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const empById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  const leaves = useMemo(
    () => s.leaves.filter((l) => empIds.has(l.employee_id)),
    [s.leaves, empIds],
  );

  const today = new Date();
  const inProgress = leaves.filter(
    (l) => new Date(l.start_date) <= today && today <= new Date(l.end_date),
  ).length;
  const totalPaid = leaves
    .filter((l) => l.type === "conge_paye")
    .reduce((a, l) => a + l.days, 0);
  const nbMaladie = leaves.filter((l) => l.type === "maladie").length;

  const soldes = useMemo(
    () =>
      employees
        .filter((e) => e.is_active)
        .map((e) => {
          const months =
            (today.getTime() - new Date(e.hire_date).getTime()) / (30.4375 * 8.64e7);
          const acquis = Math.max(0, months) * ACQUIS_PER_MONTH;
          const pris = leaves
            .filter((l) => l.employee_id === e.id && l.type === "conge_paye")
            .reduce((a, l) => a + l.days, 0);
          return { emp: e, acquis, pris, solde: acquis - pris };
        }),
    [employees, leaves],
  );

  return (
    <div>
      <PageHeader title="Congés & absences" subtitle="Journal des absences et soldes de congés payés" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Congés payés pris"
          value={`${num(totalPaid)} j`}
          sub="Cumul de l'exercice"
          accent="sage"
          icon={<CalendarDays size={20} />}
        />
        <Kpi
          label="Absences maladie"
          value={String(nbMaladie)}
          sub="Nombre d'épisodes"
          accent="gold"
          icon={<Stethoscope size={20} />}
        />
        <Kpi
          label="Absences en cours"
          value={String(inProgress)}
          sub="À la date du jour"
          accent="primary"
          icon={<Hourglass size={20} />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Journal des absences</CardTitle>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune absence enregistrée.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Salarié</Th>
                  <Th>Type</Th>
                  <Th>Du</Th>
                  <Th>Au</Th>
                  <Th className="text-right">Jours</Th>
                  <Th>IPE CNSS</Th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => {
                  const emp = empById.get(l.employee_id);
                  return (
                    <tr key={l.id}>
                      <Td>{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</Td>
                      <Td>{LEAVE_LABEL[l.type]}</Td>
                      <Td>{dateFr(l.start_date)}</Td>
                      <Td>{dateFr(l.end_date)}</Td>
                      <Td className="text-right num">{l.days}</Td>
                      <Td>
                        {l.cnss_ipe ? (
                          <Badge tone="success">IPE</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Soldes de congés payés</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Salarié</Th>
                <Th>Poste</Th>
                <Th className="text-right">Acquis (j)</Th>
                <Th className="text-right">Pris (j)</Th>
                <Th className="text-right">Solde (j)</Th>
              </tr>
            </thead>
            <tbody>
              {soldes.map(({ emp, acquis, pris, solde }) => (
                <tr key={emp.id}>
                  <Td>
                    {emp.first_name} {emp.last_name}
                  </Td>
                  <Td>{emp.position ?? "—"}</Td>
                  <Td className="text-right num">{num(acquis)}</Td>
                  <Td className="text-right num">{num(pris)}</Td>
                  <Td className="text-right num">
                    <span className={solde < 0 ? "text-destructive font-medium" : "font-medium"}>
                      {num(solde)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Acquisition de 1,5 jour ouvrable par mois de service (art. 231), hors majoration
            d'ancienneté (1,5 jour supplémentaire par tranche de 5 ans).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-sage/12 text-sage">
              <Baby size={20} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Congé de maternité :</span> 14 semaines
              indemnisées par la CNSS (dont 7 après l'accouchement), sous réserve des conditions
              d'ouverture des droits.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
