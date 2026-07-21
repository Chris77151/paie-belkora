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
import { getParams } from "@/lib/params";
import type { Employee, LeaveType } from "@/data/types";

const LEAVE_LABEL: Record<LeaveType, string> = {
  conge_paye: "Congé payé",
  maladie: "Maladie",
  AT: "Accident du travail",
  absence_injustifiee: "Absence injustifiée",
  maternite: "Maternité",
};

/** Âge en années à une date donnée (null si date de naissance absente). */
function ageAt(birth_date: string | undefined, at: Date): number | null {
  if (!birth_date) return null;
  return (at.getTime() - new Date(birth_date).getTime()) / (365.25 * 8.64e7);
}

/**
 * Congés payés acquis (jours ouvrables), majorations légales incluses (Code du travail) :
 *  - art. 231 : 1,5 j/mois de service, porté à 2 j/mois pour les salariés de moins de 18 ans ;
 *  - art. 232 : + majoration d'ancienneté de 1,5 j par tranche entière de 5 ans de service,
 *    la part de majoration étant plafonnée pour que le congé annuel ne dépasse pas 30 jours.
 * Modèle cumulatif depuis l'embauche (simplification conservée de l'app), donc le plafond de
 * 30 j s'applique à la seule majoration d'ancienneté, pas au cumul de base.
 */
function acquiredLeave(emp: Employee, at: Date): number {
  const p = getParams(at.getFullYear());
  const months = Math.max(0, (at.getTime() - new Date(emp.hire_date).getTime()) / (30.4375 * 8.64e7));
  const age = ageAt(emp.birth_date, at);
  const isMinor = age !== null && age < 18;
  const baseMonthly = isMinor ? p.paidLeaveMinorPerMonth : p.paidLeavePerMonth;

  const years = months / 12;
  const tranches = Math.floor(years / p.paidLeaveSeniorityTrancheYears);
  const seniorityBonusCap = Math.max(0, p.paidLeaveMaxDays - baseMonthly * 12);
  const seniorityBonus = Math.min(tranches * p.paidLeaveSeniorityBonusDays, seniorityBonusCap);

  return months * baseMonthly + seniorityBonus;
}

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
          const acquis = acquiredLeave(e, today);
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
            Acquisition de 1,5 jour ouvrable par mois de service — 2 jours/mois pour les
            salariés de moins de 18 ans (art. 231), majoration d'ancienneté incluse : +1,5 jour
            par tranche entière de 5 ans de service, plafonnée à 30 jours au total (art. 232).
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
