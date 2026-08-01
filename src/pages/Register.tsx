/**
 * Volet « Registre des salariés » — quatre onglets.
 *
 *   Nominatif        qui figure aux effectifs, avec toutes les colonnes du registre
 *   Mouvements       ce qui a bougé et quand — la lecture d'un contrôleur qui remonte une période
 *   Conformité       les constats, datés, chiffrés et rattachés à leur base légale
 *   Registres légaux ce que la loi impose, et ce que l'application couvre ou NON
 *
 * Tout le calcul vit dans `staff-register.ts` (moteur pur, testé) : cette page n'affiche.
 */
import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, ClipboardList, FileDown, FileSignature,
  LogIn, LogOut, ScrollText, Sheet, ShieldAlert, Users,
} from "lucide-react";
import { useStore, currentFirm } from "@/data/store";
import type { ContractType } from "@/data/types";
import {
  buildMovements,
  buildStaffRegister,
  CATEGORY_LABEL,
  COVERAGE_LABEL,
  DECLARATION_LABEL,
  legalRegisters,
  REGISTER_DISCLAIMER,
  type CoverageState,
  type DeclarationStatus,
} from "@/lib/staff-register";
import { arreteLine, exportRegisterPdf, exportRegisterXlsx } from "@/lib/staff-register-export";
import { dateFr } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Field, Input, Kpi, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";

type Tab = "nominatif" | "mouvements" | "conformite" | "legaux";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "nominatif", label: "Registre nominatif", icon: Users },
  { key: "mouvements", label: "Mouvements", icon: ArrowUpRight },
  { key: "conformite", label: "Conformité", icon: ShieldAlert },
  { key: "legaux", label: "Registres légaux", icon: ScrollText },
];

const DECL_TONE: Record<DeclarationStatus, "muted" | "warning" | "destructive" | "primary"> = {
  declare: "primary",
  delai_en_cours: "warning",
  hors_delai: "destructive",
  derogatoire: "warning",
};

const COVERAGE_TONE: Record<CoverageState, "primary" | "warning" | "destructive"> = {
  couvert: "primary",
  partiel: "warning",
  non_couvert: "destructive",
};

const MONTH_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_FR[Number(m) - 1]} ${y}`;
}

export default function Register() {
  const s = useStore();
  const firm = currentFirm(s);

  const [tab, setTab] = useState<Tab>("nominatif");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ContractType | "">("");
  const [declaration, setDeclaration] = useState<DeclarationStatus | "">("");

  const reg = useMemo(
    () =>
      buildStaffRegister(s, firm.id, {
        from,
        to,
        category: category || undefined,
        declaration: declaration || undefined,
      }),
    [s, firm.id, from, to, category, declaration],
  );
  const months = useMemo(() => buildMovements(reg), [reg]);
  const legal = useMemo(() => legalRegisters(reg), [reg]);

  const k = reg.kpis;
  const critiques = reg.findings.filter((f) => f.severity === "critical").length;

  return (
    <div>
      <PageHeader
        title="Registre des salariés"
        subtitle={`${firm.name} — période du ${dateFr(from)} au ${dateFr(to)}, arrêté au ${dateFr(reg.asOf)}`}
      >
        <Button variant="outline" onClick={() => exportRegisterXlsx(firm, reg)}>
          <Sheet className="h-4 w-4" /> Excel
        </Button>
        <Button variant="outline" onClick={() => void exportRegisterPdf(firm, reg)}>
          <FileDown className="h-4 w-4" /> PDF
        </Button>
        <Button onClick={() => void exportRegisterPdf(firm, reg, { official: true })}>
          <FileSignature className="h-4 w-4" /> Registre à présenter
        </Button>
      </PageHeader>

      {/* Indicateurs — l'écart réel / déclaré d'abord : c'est l'objet du registre. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi label="Effectif présent" value={String(k.headcount)} sub={`arrêté au ${dateFr(reg.asOf)}`} icon={<Users className="h-5 w-5" />} />
        <Kpi
          label="Écart réel / déclaré"
          value={String(k.gap)}
          sub={`${k.declared} déclaré(s) à la CNSS`}
          accent={k.gap > 0 ? "destructive" : "sage"}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <Kpi label="Entrées" value={String(k.entries)} sub="sur la période" accent="sage" icon={<LogIn className="h-5 w-5" />} />
        <Kpi label="Sorties" value={String(k.exits)} sub={`turnover ${(k.turnover * 100).toFixed(1)} %`} accent="gold" icon={<LogOut className="h-5 w-5" />} />
      </div>

      {/* Filtres — communs à tous les onglets. */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Du">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Au (date d'arrêté)" hint="Le registre est calculé à cette date, pas à celle du jour.">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Catégorie">
              <Select value={category} onChange={(e) => setCategory(e.target.value as ContractType | "")}>
                <option value="">Toutes</option>
                {(Object.keys(CATEGORY_LABEL) as ContractType[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Statut de déclaration">
              <Select value={declaration} onChange={(e) => setDeclaration(e.target.value as DeclarationStatus | "")}>
                <option value="">Tous</option>
                {(Object.keys(DECLARATION_LABEL) as DeclarationStatus[]).map((d) => (
                  <option key={d} value={d}>{DECLARATION_LABEL[d]}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Onglets */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm transition-colors",
              tab === key
                ? "border-b-2 border-primary font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "conformite" && reg.findings.length > 0 && (
              <Badge tone={critiques > 0 ? "destructive" : "warning"}>{reg.findings.length}</Badge>
            )}
          </button>
        ))}
      </div>

      {tab === "nominatif" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {reg.rows.length} ligne{reg.rows.length > 1 ? "s" : ""} — {arreteLine(reg.rows.length)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>N°</Th>
                    <Th>Matricule</Th>
                    <Th>Nom et prénom</Th>
                    <Th>CIN</Th>
                    <Th>N° CNSS</Th>
                    <Th>Né(e) le</Th>
                    <Th>Catégorie</Th>
                    <Th>Poste</Th>
                    <Th>Établissement</Th>
                    <Th>Entrée</Th>
                    <Th>Sortie</Th>
                    <Th>Motif</Th>
                    <Th>Déclaration</Th>
                  </tr>
                </thead>
                <tbody>
                  {reg.rows.map((r, i) => (
                    <tr key={r.employeeId}>
                      <Td className="text-muted-foreground">{i + 1}</Td>
                      <Td>{r.matricule || "—"}</Td>
                      <Td>
                        {r.nom}
                        {r.minor && <Badge tone="warning" className="ml-2">Mineur</Badge>}
                        {!r.present && <Badge tone="muted" className="ml-2">Sorti</Badge>}
                      </Td>
                      <Td>{r.cin || "—"}</Td>
                      <Td>{r.cnss || "—"}</Td>
                      <Td>{r.birthDate ? dateFr(r.birthDate) : "—"}</Td>
                      <Td>
                        {CATEGORY_LABEL[r.category] ?? r.category}
                        {r.exemption && <div className="text-xs text-muted-foreground">{r.exemption}</div>}
                      </Td>
                      <Td>{r.position || "—"}</Td>
                      <Td>{r.site || "—"}</Td>
                      <Td>{dateFr(r.hireDate)}</Td>
                      <Td>{r.exitDate ? dateFr(r.exitDate) : "—"}</Td>
                      <Td>{r.exitReason || "—"}</Td>
                      <Td>
                        <Badge tone={DECL_TONE[r.declaration]}>
                          {DECLARATION_LABEL[r.declaration]}
                          {r.declaration === "hors_delai" && ` (+${r.declarationDays} j)`}
                          {r.declaration === "delai_en_cours" && ` (${r.declarationDays} j)`}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                  {!reg.rows.length && (
                    <tr>
                      <Td colSpan={13} className="text-center text-muted-foreground">
                        Aucun salarié sur la période sélectionnée.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "mouvements" && (
        <div className="space-y-4 mb-6">
          {months.map((m) => (
            <Card key={m.month}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-3">
                  <span className="capitalize">{monthLabel(m.month)}</span>
                  <Badge tone="sage">{m.entries} entrée{m.entries > 1 ? "s" : ""}</Badge>
                  <Badge tone="muted">{m.exits} sortie{m.exits > 1 ? "s" : ""}</Badge>
                  <span className={cn("text-sm num", m.net >= 0 ? "text-sage" : "text-destructive")}>
                    solde {m.net >= 0 ? "+" : ""}{m.net}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {m.movements.map((mv, i) => (
                    <li key={`${mv.employeeId}-${mv.kind}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                      {mv.kind === "entree" ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-sage" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="num text-muted-foreground">{dateFr(mv.date)}</span>
                      <span className="font-medium">{mv.nom}</span>
                      <span className="text-muted-foreground">
                        {CATEGORY_LABEL[mv.category] ?? mv.category}
                        {mv.position && ` · ${mv.position}`}
                        {mv.kind === "sortie" && ` · ${mv.reason}`}
                      </span>
                      {mv.kind === "entree" && mv.declaration !== "declare" && (
                        <Badge tone={DECL_TONE[mv.declaration]} className="ml-auto">
                          {DECLARATION_LABEL[mv.declaration]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
          {!months.length && (
            <Card>
              <CardContent className="pt-5 text-center text-muted-foreground">
                Aucun mouvement sur la période sélectionnée.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "conformite" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {reg.findings.length} constat{reg.findings.length > 1 ? "s" : ""}
              {critiques > 0 && <span className="text-destructive"> · {critiques} critique(s)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reg.findings.length ? (
              <div className="space-y-3">
                {reg.findings.map((f, i) => (
                  <div key={`${f.employeeId}-${i}`} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={f.severity === "critical" ? "destructive" : "warning"}>
                        {f.severity === "critical" ? "Critique" : "Avertissement"}
                      </Badge>
                      <span className="font-medium">{f.nom}</span>
                      <span className="text-muted-foreground">— {f.title}</span>
                      {f.exposure > 0 && (
                        <span className="ml-auto text-sm num text-destructive">
                          ~ {f.exposure.toLocaleString("en-US").replace(/,/g, " ")} DH
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm">{f.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Base : {f.legal}</p>
                    <p className="mt-1 text-xs"><span className="font-medium">Action :</span> {f.action}</p>
                  </div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">
                  Les montants sont des ORDRES DE GRANDEUR. Le poste dominant reste le rappel des
                  cotisations depuis la date réelle d'embauche, non chiffré ici.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun constat sur le périmètre sélectionné.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "legaux" && (
        <div className="space-y-3 mb-6">
          {legal.map((x) => (
            <Card key={x.key}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{x.name}</span>
                  <Badge tone={COVERAGE_TONE[x.coverage]}>{COVERAGE_LABEL[x.coverage]}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Base : {x.legal}</p>
                <p className="mt-2 text-sm">{x.requirement}</p>
                <p className="mt-1 text-sm text-muted-foreground">{x.detail}</p>
                <p className="mt-1 text-xs"><span className="font-medium">Action :</span> {x.action}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Réserves — affichées sur tous les onglets, jamais repliées. */}
      <Card>
        <CardContent className="pt-5 space-y-2 text-xs text-muted-foreground">
          <p className="flex gap-2">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span>{REGISTER_DISCLAIMER}</span>
          </p>
          <p className="pl-6">{reg.sourceNote}</p>
          <p className="pl-6">Turnover = {k.turnoverFormula}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
