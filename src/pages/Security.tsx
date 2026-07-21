import { useMemo, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Loader2, ScanSearch, DatabaseBackup,
  Lock, Info, AlertTriangle,
} from "lucide-react";
import { actions, currentFirm, useStore } from "@/data/store";
import { odooFetchBankSnapshot, odooReadiness, odooErrorHint } from "@/lib/odoo";
import { buildAuditEvents, buildBaseline, severityRank } from "@/lib/bank-audit";
import type { AppRole, BankAuditEvent, BankEventClass, BankSeverity } from "@/data/types";
import {
  Badge, Button, Card, CardContent, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";

const ADMIN_ROLES: AppRole[] = ["super_admin", "firm_admin"];

const CLASS_META: Record<BankEventClass, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  NON_AUTORISE: { label: "Non autorisé", tone: "destructive" },
  A_VERIFIER: { label: "À vérifier", tone: "warning" },
  NOUVEAU: { label: "Nouveau", tone: "primary" },
  SUPPRIME: { label: "Supprimé", tone: "muted" },
  AUTORISE: { label: "Autorisé", tone: "success" },
};
const SEV_TONE: Record<BankSeverity, Parameters<typeof Badge>[0]["tone"]> = {
  critique: "destructive", eleve: "warning", moyen: "muted", info: "success",
};

/** Garde-fou : refuse le RENDU (pas seulement le menu) si le rôle n'est pas admin. */
function AdminOnly({ role, children }: { role: AppRole; children: React.ReactNode }) {
  if (!ADMIN_ROLES.includes(role)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock size={16} className="text-destructive" /> Accès réservé à l'administrateur.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre rôle actuel (<b>{role}</b>) n'autorise pas la consultation du rapport de
            sécurité. Demandez un accès administrateur (Paramètres → Équipe &amp; rôles).
          </p>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}

export default function Security() {
  const s = useStore();
  const role = s.currentRole ?? "firm_admin";
  const firm = currentFirm(s);
  const [busy, setBusy] = useState<"scan" | "baseline" | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");

  const events = useMemo(
    () => (s.bankAudit ?? []).filter((e) => e.firm_id === firm.id),
    [s.bankAudit, firm.id],
  );
  const baselineCount = (s.bankBaseline ?? []).filter((b) => b.firm_id === firm.id).length;
  const critical = events.filter((e) => e.severity === "critique");

  const rows = events
    .filter((e) => classFilter === "all" || e.classification === classFilter)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  function guardOdoo(): boolean {
    const err = odooReadiness(s.odoo, firm);
    if (err) { alert(err); return false; }
    return true;
  }

  async function establishBaseline() {
    if (!guardOdoo() || !s.odoo || !firm.odoo_company_id) return;
    setBusy("baseline"); setWarn(null);
    try {
      const snap = await odooFetchBankSnapshot(s.odoo, firm.odoo_company_id);
      const base = buildBaseline(firm.id, snap.records, `app:${role}`, new Date().toISOString());
      actions.setBankBaseline(firm.id, base);
      actions.setBankAudit(firm.id, []); // repart d'une référence propre
      if (!snap.groupResolved) setWarn("Groupe habilité introuvable dans Odoo : les autorisations ne seront pas vérifiées (tout acteur est considéré habilité). Définissez un groupe « RIB habilité » ou ajustez la recherche.");
      alert(`Base de référence établie : ${base.length} RIB enregistré(s) pour « ${firm.name} ». Les prochaines analyses détecteront les écarts.`);
    } catch (e) {
      alert(`Échec : ${odooErrorHint((e as Error).message)}`);
    } finally { setBusy(null); }
  }

  async function scan() {
    if (!guardOdoo() || !s.odoo || !firm.odoo_company_id) return;
    setBusy("scan"); setWarn(null);
    try {
      const snap = await odooFetchBankSnapshot(s.odoo, firm.odoo_company_id);
      const baseline = (s.bankBaseline ?? []);
      const evts = buildAuditEvents(firm.id, snap.records, baseline, new Date().toISOString());
      actions.setBankAudit(firm.id, evts);
      if (!snap.groupResolved) setWarn("Groupe habilité introuvable dans Odoo : autorisations non vérifiées (aucun événement « non autorisé » ne peut être établi de façon fiable).");
      if (baselineCount === 0) setWarn((w) => (w ? w + " " : "") + "Aucune base de référence : tous les comptes apparaissent comme « Nouveau ». Établissez d'abord la base de référence.");
    } catch (e) {
      alert(`Échec de l'analyse : ${odooErrorHint((e as Error).message)}`);
    } finally { setBusy(null); }
  }

  return (
    <AdminOnly role={role}>
      <PageHeader
        title="Sécurité / Audit RIB"
        subtitle={`Modifications des coordonnées bancaires — accès administrateur · ${firm.name}`}
      >
        <Button variant="outline" onClick={establishBaseline} disabled={busy !== null}>
          {busy === "baseline" ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} Établir la base de référence
        </Button>
        <Button onClick={scan} disabled={busy !== null}>
          {busy === "scan" ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />} Analyser les modifications
        </Button>
      </PageHeader>

      {/* Bandeau conformité (loi 09-08 / CNDP) */}
      <Card className="mb-4">
        <CardContent className="pt-4 text-xs text-muted-foreground flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Finalité : <b>prévention de la fraude au virement</b> et contrôle interne. Traçage des
            <b> données</b> (RIB), attribution par le <b>compte Odoo authentifié</b> — aucune surveillance
            de personne. RIB masqués, accès restreint. Traitement à inscrire au registre CNDP (DPO :
            Ahmed Belkora). Conservation recommandée : 3 ans.
          </span>
        </CardContent>
      </Card>

      {warn && (
        <Card className="mb-4 border-warning/40">
          <CardContent className="pt-4 text-sm flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
            <span className="text-muted-foreground">{warn}</span>
          </CardContent>
        </Card>
      )}

      {/* Alertes critiques en tête */}
      {critical.length > 0 ? (
        <Card className="mb-4 border-destructive/50">
          <CardContent className="pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ShieldAlert size={16} /> {critical.length} alerte(s) critique(s) — RIB modifié par un acteur non habilité.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {critical.map((e) => (
                <li key={e.id} className="text-muted-foreground">
                  <b className="text-foreground">{e.partner}</b> ({e.partner_kind}) : {e.rib_before_masked ?? "—"} → {e.rib_after_masked ?? "—"} par {e.actor_name} &lt;{e.actor_login}&gt;
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : events.length > 0 ? (
        <Card className="mb-4 border-success/40">
          <CardContent className="pt-4 text-sm flex items-center gap-2">
            <ShieldCheck size={16} className="text-success" /> Aucune modification critique détectée sur ce périmètre.
          </CardContent>
        </Card>
      ) : null}

      {/* Filtres + tableau */}
      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {events.length} événement(s) · base de référence : {baselineCount} RIB
          </span>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="ml-auto w-48">
            <option value="all">Tous les classements</option>
            <option value="NON_AUTORISE">Non autorisé</option>
            <option value="A_VERIFIER">À vérifier</option>
            <option value="NOUVEAU">Nouveau</option>
            <option value="SUPPRIME">Supprimé</option>
            <option value="AUTORISE">Autorisé</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Partenaire</Th><Th>Type</Th><Th>RIB (masqué)</Th><Th>Acteur</Th>
              <Th>Classement</Th><Th>Sévérité</Th><Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: BankAuditEvent) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td className="font-medium">{e.partner}</Td>
                <Td className="text-muted-foreground capitalize">{e.partner_kind}</Td>
                <Td className="num text-xs">
                  {e.rib_before_masked ?? "—"} <span className="text-muted-foreground">→</span> {e.rib_after_masked ?? "(supprimé)"}
                </Td>
                <Td className="text-xs">
                  <div className="font-medium">{e.actor_name}</div>
                  <div className="text-muted-foreground">{e.actor_login}</div>
                </Td>
                <Td><Badge tone={CLASS_META[e.classification].tone}>{CLASS_META[e.classification].label}</Badge></Td>
                <Td><Badge tone={SEV_TONE[e.severity]}>{e.severity}</Badge></Td>
                <Td className="text-muted-foreground text-xs">{e.when ? dateFr(e.when.slice(0, 10)) : "—"}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Aucun événement. Cliquez sur « Établir la base de référence » puis « Analyser les modifications ».
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </AdminOnly>
  );
}
