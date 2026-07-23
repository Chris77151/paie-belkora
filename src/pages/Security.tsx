import { useMemo, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Loader2, ScanSearch, DatabaseBackup,
  Lock, Info, AlertTriangle,
} from "lucide-react";
import { actions, currentFirm, useStore } from "@/data/store";
import { useSession } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import { odooFetchBankSnapshot, odooReadiness, odooErrorHint } from "@/lib/odoo";
import { buildAuditEvents, buildBaseline, severityRank } from "@/lib/bank-audit";
import type { AppRole, BankAuditEvent, BankEventClass, BankSeverity } from "@/data/types";
import {
  Badge, Button, Card, CardContent, PageHeader, Select, Table, Td, Th,
} from "@/components/ui/kit";
import { dateFr } from "@/lib/format";

/** Zone sensible : réservée au SUPER administrateur uniquement. */
const SUPER_ONLY: AppRole[] = ["super_admin"];

const CLASS_META: Record<BankEventClass, { labelKey: TKey; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  NON_AUTORISE: { labelKey: "sec.class.NON_AUTORISE", tone: "destructive" },
  A_VERIFIER: { labelKey: "sec.class.A_VERIFIER", tone: "warning" },
  NOUVEAU: { labelKey: "sec.class.NOUVEAU", tone: "primary" },
  SUPPRIME: { labelKey: "sec.class.SUPPRIME", tone: "muted" },
  AUTORISE: { labelKey: "sec.class.AUTORISE", tone: "success" },
};
const SEV_TONE: Record<BankSeverity, Parameters<typeof Badge>[0]["tone"]> = {
  critique: "destructive", eleve: "warning", moyen: "muted", info: "success",
};

/** Garde-fou : refuse le RENDU (pas seulement le menu) si le rôle n'est pas super admin. */
function AdminOnly({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const t = useT();
  if (!SUPER_ONLY.includes(role)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock size={16} className="text-destructive" /> {t("sec.admin.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sec.admin.body1")} (<b>{role}</b>) {t("sec.admin.body2")}
          </p>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}

export default function Security() {
  const s = useStore();
  const t = useT();
  const session = useSession();
  // Le rôle fait foi via le compte authentifié (session), défaut sûr = le plus restreint.
  const role = session?.role ?? "lecture_seule";
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
        title={t("page.security.title")}
        subtitle={`${t("page.security.sub")} · ${firm.name}`}
      >
        <Button variant="outline" onClick={establishBaseline} disabled={busy !== null}>
          {busy === "baseline" ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />} {t("sec.establishBaseline")}
        </Button>
        <Button onClick={scan} disabled={busy !== null}>
          {busy === "scan" ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />} {t("sec.scan")}
        </Button>
      </PageHeader>

      {/* Bandeau conformité (loi 09-08 / CNDP) */}
      <Card className="mb-4">
        <CardContent className="pt-4 text-xs text-muted-foreground flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>{t("sec.banner")}</span>
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
              <ShieldAlert size={16} /> {critical.length} {t("sec.critical1")}
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
            <ShieldCheck size={16} className="text-success" /> {t("sec.noCritical")}
          </CardContent>
        </Card>
      ) : null}

      {/* Filtres + tableau */}
      <Card className="mb-4">
        <CardContent className="pt-5 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {events.length} {t("sec.eventsCount1")} {baselineCount} {t("sec.eventsCount2")}
          </span>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="ml-auto w-48">
            <option value="all">{t("sec.filter.all")}</option>
            <option value="NON_AUTORISE">{t("sec.class.NON_AUTORISE")}</option>
            <option value="A_VERIFIER">{t("sec.class.A_VERIFIER")}</option>
            <option value="NOUVEAU">{t("sec.class.NOUVEAU")}</option>
            <option value="SUPPRIME">{t("sec.class.SUPPRIME")}</option>
            <option value="AUTORISE">{t("sec.class.AUTORISE")}</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{t("sec.col.partner")}</Th><Th>{t("lv.col.type")}</Th><Th>{t("sec.col.rib")}</Th><Th>{t("sec.col.actor")}</Th>
              <Th>{t("sec.col.class")}</Th><Th>{t("cmp.col.severity")}</Th><Th>{t("acc.col.date")}</Th>
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
                <Td><Badge tone={CLASS_META[e.classification].tone}>{t(CLASS_META[e.classification].labelKey)}</Badge></Td>
                <Td><Badge tone={SEV_TONE[e.severity]}>{e.severity}</Badge></Td>
                <Td className="text-muted-foreground text-xs">{e.when ? dateFr(e.when.slice(0, 10)) : "—"}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <Td colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t("sec.empty")}
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </AdminOnly>
  );
}
