import { useEffect, useRef, useState } from "react";
import {
  Save, ShieldX, Users, ScrollText, Building2, ImageUp, RotateCcw,
  Plus, Trash2, Check, Plug, Loader2, UserPlus, KeyRound, ShieldAlert,
  Cloud, Database, Copy, CloudOff,
} from "lucide-react";
import {
  useStore, currentFirm, actions, uid,
  subscribeSync, getSyncStatus, getSyncError, hydrateFromRemote, type SyncStatus,
} from "@/data/store";
import {
  getSupabaseConfig, setSupabaseConfig, testConnection, SUPABASE_SQL,
  isSupabaseConfigured, type SupabaseConfig,
} from "@/lib/supabase";
import { useT } from "@/lib/i18n";
import { odooTestConnection, odooListCompanies } from "@/lib/odoo";
import { hashPassword, useSession, ROLE_LABELS } from "@/lib/auth";
import type { AppUser, OdooConfig } from "@/data/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Field,
  Input,
  Select,
  Table,
  Th,
  Td,
  PageHeader,
} from "@/components/ui/kit";
import { mad, pct } from "@/lib/format";
import { getParams, AVAILABLE_YEARS } from "@/lib/params";
import { firmDescriptor, firmLegalLine } from "@/lib/firm-legal";
import type { AppRole, Firm, Regime } from "@/data/types";

const ROLES: { role: AppRole; label: string; desc: string; tone: Parameters<typeof Badge>[0]["tone"] }[] = [
  { role: "super_admin", label: "Super administrateur", desc: "Accès total, gestion des sociétés et des utilisateurs.", tone: "destructive" },
  { role: "firm_admin", label: "Administrateur société", desc: "Paramétrage complet d'une société et de ses salariés.", tone: "primary" },
  { role: "gestionnaire_paie", label: "Gestionnaire de paie", desc: "Saisie, calcul et validation des bulletins et déclarations.", tone: "sage" },
  { role: "lecture_seule", label: "Lecture seule", desc: "Consultation des données sans modification.", tone: "muted" },
];

const TEMPLATE_PLACEHOLDER = `Tokens disponibles :
{{firm.name}}  {{firm.ice}}  {{firm.cnss_affiliation}}
{{employee.first_name}}  {{employee.last_name}}  {{employee.matricule}}  {{employee.cnss_number}}
{{period.label}}
{{result.brut}}  {{result.net}}  {{result.net_lettres}}  {{result.cnss_salarie}}  {{result.ir}}`;

export default function Settings() {
  const s = useStore();
  const t = useT();
  const firm = currentFirm(s);

  const [draft, setDraft] = useState<Firm>(firm);
  const [trackedId, setTrackedId] = useState<string>(firm.id);
  if (trackedId !== firm.id) {
    setTrackedId(firm.id);
    setDraft(firm);
  }

  const [paramYear, setParamYear] = useState<number>(AVAILABLE_YEARS[0]);
  const p = getParams(paramYear);

  const patch = <K extends keyof Firm>(k: K, v: Firm[K]) =>
    setDraft((d) => ({ ...d, [k]: v }) as Firm);

  const logoInput = useRef<HTMLInputElement>(null);

  function saveFirm() {
    actions.upsertFirm(draft);
  }

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Veuillez choisir un fichier image (PNG, JPG, SVG…).");
      return;
    }
    if (file.size > 1_500_000) {
      window.alert("Logo trop volumineux (max 1,5 Mo). Réduisez l'image avant l'import.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const next = { ...draft, logo_path: dataUrl };
      setDraft(next);
      actions.upsertFirm(next); // persistance immédiate (affiché aussi dans le bulletin)
    };
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    const next = { ...draft, logo_path: "/logo-miya.png" };
    setDraft(next);
    actions.upsertFirm(next);
  }

  function resetDemo() {
    if (!window.confirm("Réinitialiser toutes les données de démonstration ?")) return;
    if (!window.confirm("Cette action est irréversible. Confirmer définitivement ?")) return;
    actions.reset();
  }

  return (
    <div>
      <PageHeader title={t("page.settings.title")} subtitle={t("page.settings.sub")} />

      <FirmsCard />
      <CloudSyncCard />
      <OdooCard />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              {t("set.firm.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <img
              src={draft.logo_path || "/logo-miya.png"}
              alt="Logo société"
              className="h-16 w-28 rounded-md border object-contain bg-background p-1.5"
            />
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-medium">{draft.name}</p>
              <p className="text-xs text-muted-foreground">{t("set.firm.regime")} {draft.regime}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("set.firm.logoNote")}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onLogoFile(e.target.files?.[0])}
              />
              <Button variant="outline" onClick={() => logoInput.current?.click()}>
                <ImageUp size={16} />
                {t("set.firm.changeLogo")}
              </Button>
              <Button variant="ghost" onClick={resetLogo} title="Rétablir le logo Miya par défaut">
                <RotateCcw size={16} />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.firm.raison")}>
              <Input value={draft.name} onChange={(e) => patch("name", e.target.value)} />
            </Field>
            <Field label={t("set.firm.legalForm")} hint={t("set.firm.legalForm.hint")}>
              <Input value={draft.legal_form ?? ""} onChange={(e) => patch("legal_form", e.target.value)} placeholder="Ex. SARL AU" />
            </Field>
            <Field label={t("set.firm.capital")} hint={t("set.firm.capital.hint")}>
              <Input
                type="number"
                value={draft.share_capital ?? ""}
                onChange={(e) => patch("share_capital", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Ex. 100000"
              />
            </Field>
            <Field label={t("set.firm.regime")}>
              <Select
                value={draft.regime}
                onChange={(e) => patch("regime", e.target.value as Regime)}
              >
                <option value="SMIG">SMIG (général)</option>
                <option value="SMAG">SMAG (agricole)</option>
              </Select>
            </Field>
            <Field label="ICE" hint={t("set.firm.ice.hint")}>
              <Input value={draft.ice ?? ""} onChange={(e) => patch("ice", e.target.value)} />
            </Field>
            <Field label={t("set.firm.if")}>
              <Input
                value={draft.if_fiscal ?? ""}
                onChange={(e) => patch("if_fiscal", e.target.value)}
              />
            </Field>
            <Field label={t("set.firm.patente")}>
              <Input value={draft.patente ?? ""} onChange={(e) => patch("patente", e.target.value)} />
            </Field>
            <Field label={t("set.firm.rc")}>
              <Input value={draft.rc ?? ""} onChange={(e) => patch("rc", e.target.value)} placeholder="Ex. 45231" />
            </Field>
            <Field label={t("set.firm.rcCity")}>
              <Input value={draft.rc_city ?? ""} onChange={(e) => patch("rc_city", e.target.value)} placeholder="Ex. Marrakech" />
            </Field>
            <Field label={t("set.firm.cnss")}>
              <Input
                value={draft.cnss_affiliation ?? ""}
                onChange={(e) => patch("cnss_affiliation", e.target.value)}
              />
            </Field>
            <Field label={t("emp.phone")}>
              <Input value={draft.phone ?? ""} onChange={(e) => patch("phone", e.target.value)} placeholder="+212 5 …" />
            </Field>
            <Field label={t("set.firm.email")}>
              <Input type="email" value={draft.email ?? ""} onChange={(e) => patch("email", e.target.value)} placeholder="contact@…" />
            </Field>
            <Field label={t("set.firm.city")}>
              <Input value={draft.city ?? ""} onChange={(e) => patch("city", e.target.value)} />
            </Field>
            <Field label={t("set.firm.address")}>
              <Input
                value={draft.address ?? ""}
                onChange={(e) => patch("address", e.target.value)}
              />
            </Field>
            <Field label={t("set.firm.signatory")} hint={t("set.firm.signatory.hint")}>
              <Input value={draft.signatory_name ?? ""} onChange={(e) => patch("signatory_name", e.target.value)} placeholder="Ex. Miya BELKORA" />
            </Field>
            <Field label={t("set.firm.signatoryRole")} hint={t("set.firm.signatoryRole.hint")}>
              <Input value={draft.signatory_role ?? ""} onChange={(e) => patch("signatory_role", e.target.value)} placeholder="Ex. Gérante" />
            </Field>
            <Field label={t("set.firm.odooId")} hint={t("set.firm.odooId.hint")}>
              <Input
                type="number"
                value={draft.odoo_company_id ?? ""}
                onChange={(e) => patch("odoo_company_id", e.target.value ? Number(e.target.value) : undefined)}
              />
            </Field>
          </div>

          {/* Aperçu des mentions légales telles qu'elles figureront sur les documents */}
          <div className="mt-5 rounded-md border bg-muted/40 p-4">
            <div className="text-xs font-medium text-muted-foreground">Aperçu des mentions légales (documents)</div>
            <div className="mt-1.5 text-sm font-semibold">
              {draft.name.toUpperCase()}
              {firmDescriptor(draft) && <span className="font-normal text-muted-foreground"> — {firmDescriptor(draft)}</span>}
            </div>
            {firmLegalLine(draft, { includeAddress: true }) ? (
              <div className="mt-1 text-xs text-muted-foreground">{firmLegalLine(draft, { includeAddress: true })}</div>
            ) : (
              <div className="mt-1 text-xs text-warning">Aucune mention légale renseignée — les documents afficheront un en-tête incomplet.</div>
            )}
          </div>

          <div className="mt-5">
            <Button onClick={saveFirm}>
              <Save size={16} />
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("set.regul.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-w-[160px]">
            <Field label={t("set.regul.year")}>
              <Select value={paramYear} onChange={(e) => setParamYear(Number(e.target.value))}>
                {AVAILABLE_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>{t("set.regul.col.param")}</Th>
                <Th className="text-right">{t("set.regul.col.value")}</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>{t("set.regul.smig")}</Td>
                <Td className="text-right num">{mad(p.smigHourly)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.base")}</Td>
                <Td className="text-right num">{p.legalMonthlyHours} h</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.cnssEmp")} {mad(p.cnssCeiling)})</Td>
                <Td className="text-right num">{pct(p.cnssEmployeeRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.amoEmp")}</Td>
                <Td className="text-right num">{pct(p.amoEmployeeRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.cnssPat")}</Td>
                <Td className="text-right num">{pct(p.cnssEmployerRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.af")}</Td>
                <Td className="text-right num">{pct(p.familyAllocRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.amoPat")}</Td>
                <Td className="text-right num">{pct(p.amoEmployerRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.tfp")}</Td>
                <Td className="text-right num">{pct(p.tfpRate)}</Td>
              </tr>
              <tr>
                <Td>{t("set.regul.fraisPro")} {mad(p.fraisProHighCapAnnual)})</Td>
                <Td className="text-right num">
                  {pct(p.fraisProLowRate)} / {pct(p.fraisProHighRate)}
                </Td>
              </tr>
              <tr>
                <Td>{t("set.regul.family")} {p.familyDeductionMaxPersons} {t("set.regul.persons")}</Td>
                <Td className="text-right num">{mad(p.familyDeductionMonthly)} {t("set.regul.perPerson")}</Td>
              </tr>
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("set.regul.note1")}{" "}
            <code className="font-mono">payroll_params</code>{t("set.regul.note2")}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <ScrollText size={16} className="text-sage" />
              {t("set.latex.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full h-40 rounded-md border border-input bg-background p-3 text-sm font-mono"
            value={draft.payslip_template_latex ?? ""}
            placeholder={TEMPLATE_PLACEHOLDER}
            onChange={(e) => patch("payslip_template_latex", e.target.value)}
          />
          <div className="mt-4">
            <Button onClick={saveFirm}>
              <Save size={16} />
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      <UsersCard />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Users size={16} className="text-primary" />
              {t("set.roles.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>{t("set.roles.col.role")}</Th>
                <Th>{t("set.roles.col.label")}</Th>
                <Th>{t("set.roles.col.desc")}</Th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.role}>
                  <Td>
                    <Badge tone={r.tone}>{r.role}</Badge>
                  </Td>
                  <Td>{r.label}</Td>
                  <Td className="text-muted-foreground">{r.desc}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2 text-destructive">
              <ShieldX size={16} />
              {t("set.danger.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("set.reset.note")}
          </p>
          <Button variant="destructive" onClick={resetDemo}>
            <ShieldX size={16} />
            {t("set.reset.btn")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Gestion des utilisateurs (auth) ---------------- */
function UsersCard() {
  const t = useT();
  const s = useStore();
  const session = useSession();
  const isSuperAdmin = session?.role === "super_admin";
  const users = s.users ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", role: "gestionnaire_paie" as AppRole, firm_id: "" as string, password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setF = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  if (!isSuperAdmin) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Users size={16} className="text-primary" />
              {t("set.users.title")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" />
            Seul le super administrateur peut créer et gérer les comptes de connexion.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function create() {
    setMsg(null);
    const username = form.username.trim();
    if (!username) return setMsg({ ok: false, text: "Identifiant requis." });
    if (form.password.length < 6) return setMsg({ ok: false, text: "Mot de passe : 6 caractères minimum." });
    if (users.some((u) => u.username.trim().toLowerCase() === username.toLowerCase()))
      return setMsg({ ok: false, text: "Cet identifiant existe déjà." });
    setBusy(true);
    try {
      const password_hash = await hashPassword(form.password);
      const now = new Date().toISOString();
      const user: AppUser = {
        id: uid("user"),
        username,
        full_name: form.full_name.trim() || undefined,
        role: form.role,
        firm_id: form.firm_id || null,
        password_hash,
        is_active: true,
        created_at: now,
      };
      actions.addUser(user);
      setMsg({ ok: true, text: `Compte « ${username} » créé.` });
      setForm({ username: "", full_name: "", role: "gestionnaire_paie", firm_id: "", password: "" });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: AppUser) {
    const pw = window.prompt(`Nouveau mot de passe pour « ${u.username} » (6 caractères min.) :`);
    if (pw == null) return;
    if (pw.length < 6) { window.alert("Mot de passe trop court (6 caractères minimum)."); return; }
    const password_hash = await hashPassword(pw);
    actions.updateUser({ ...u, password_hash });
    window.alert("Mot de passe réinitialisé.");
  }

  function toggleActive(u: AppUser) {
    actions.updateUser({ ...u, is_active: !u.is_active });
  }

  function remove(u: AppUser) {
    if (window.confirm(`Supprimer le compte « ${u.username} » ? Irréversible.`)) actions.removeUser(u.id);
  }

  const firmName = (id?: string | null) => (id ? s.firms.find((f) => f.id === id)?.name ?? "—" : "Toutes");

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Users size={16} className="text-primary" />
            {t("set.users.title")} ({users.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <thead>
            <tr>
              <Th>{t("set.users.col.login")}</Th><Th>{t("set.users.col.name")}</Th><Th>{t("set.roles.col.role")}</Th><Th>{t("set.users.col.firm")}</Th><Th>{t("set.users.col.state")}</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.id === session?.id ? "bg-accent/40" : ""}>
                <Td className="font-medium">
                  {u.username}
                  {u.is_super && <Badge tone="destructive" className="ml-2">super</Badge>}
                  {u.id === session?.id && <span className="ml-2 text-[11px] text-muted-foreground">(vous)</span>}
                </Td>
                <Td className="text-muted-foreground">{u.full_name ?? "—"}</Td>
                <Td><Badge tone="sage">{ROLE_LABELS[u.role]}</Badge></Td>
                <Td className="text-muted-foreground">{firmName(u.firm_id)}</Td>
                <Td>
                  {u.is_active
                    ? <Badge tone="success">actif</Badge>
                    : <Badge tone="muted">désactivé</Badge>}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title={t("set.users.resetPw")} onClick={() => resetPassword(u)}>
                      <KeyRound size={15} />
                    </Button>
                    {!u.is_super && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                          {u.is_active ? "Désactiver" : "Activer"}
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" title="Supprimer" onClick={() => remove(u)}>
                          <Trash2 size={15} />
                        </Button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {open ? (
          <div className="mt-4 rounded-md border bg-muted/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("set.users.login")}>
                <Input value={form.username} onChange={(e) => setF({ username: e.target.value })} placeholder="prenom.nom@pepinierebelkora.com" spellCheck={false} />
              </Field>
              <Field label={t("set.users.fullName")}>
                <Input value={form.full_name} onChange={(e) => setF({ full_name: e.target.value })} placeholder="Prénom NOM" />
              </Field>
              <Field label={t("set.roles.col.role")}>
                <Select value={form.role} onChange={(e) => setF({ role: e.target.value as AppRole })}>
                  {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label={t("set.users.firm")} hint={t("set.users.firm.hint")}>
                <Select value={form.firm_id} onChange={(e) => setF({ firm_id: e.target.value })}>
                  <option value="">{t("set.users.allFirms")}</option>
                  {s.firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label={t("set.users.password")} hint={t("set.users.password.hint")}>
                <Input type="password" value={form.password} onChange={(e) => setF({ password: e.target.value })} placeholder="••••••••" autoComplete="new-password" />
              </Field>
            </div>
            {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>}
            <div className="mt-4 flex gap-2">
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Créer le compte
              </Button>
              <Button variant="ghost" onClick={() => { setOpen(false); setMsg(null); }}>Annuler</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <Button variant="outline" onClick={() => setOpen(true)}><UserPlus size={16} /> Nouvel utilisateur</Button>
            {msg?.ok && <span className="text-sm text-success">{msg.text}</span>}
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">
          Authentification locale (ce navigateur). Les mots de passe ne sont jamais stockés en clair
          (empreinte SHA-256). Le super administrateur ne peut être ni supprimé ni désactivé.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Gestion des sociétés ---------------- */
function FirmsCard() {
  const t = useT();
  const s = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [regime, setRegime] = useState<"SMIG" | "SMAG">("SMIG");

  function create() {
    if (!name.trim()) return;
    const id = uid("firm");
    actions.upsertFirm({ id, name: name.trim(), regime, logo_path: "/logo-miya.png" });
    actions.setCurrentFirm(id);
    setName("");
    setCreating(false);
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Building2 size={16} className="text-primary" />
            {t("set.firms.title")} ({s.firms.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <thead>
            <tr>
              <Th>{t("set.users.col.firm")}</Th><Th>Régime</Th><Th>ICE</Th><Th>Odoo</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {s.firms.map((f) => (
              <tr key={f.id} className={f.id === s.currentFirmId ? "bg-accent/40" : ""}>
                <Td className="font-medium">{f.name}</Td>
                <Td><Badge tone="sage">{f.regime}</Badge></Td>
                <Td className="text-muted-foreground num">{f.ice ?? "—"}</Td>
                <Td className="text-muted-foreground num">{f.odoo_company_id ?? "—"}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {f.id !== s.currentFirmId && (
                      <Button size="sm" variant="outline" onClick={() => actions.setCurrentFirm(f.id)}>Activer</Button>
                    )}
                    {s.firms.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        title={t("set.firms.deleteTitle")}
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${f.name} » et tous ses salariés ? Irréversible.`)) actions.removeFirm(f.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {creating ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/40 p-4">
            <Field label={t("set.firm.raison")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle société SARL" className="w-64" />
            </Field>
            <Field label={t("set.firm.regime")}>
              <Select value={regime} onChange={(e) => setRegime(e.target.value as "SMIG" | "SMAG")} className="w-40">
                <option value="SMIG">SMIG (général)</option>
                <option value="SMAG">SMAG (agricole)</option>
              </Select>
            </Field>
            <Button onClick={create}><Check size={16} /> {t("set.firms.createBtn")}</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          </div>
        ) : (
          <div className="mt-4">
            <Button variant="outline" onClick={() => setCreating(true)}><Plus size={16} /> {t("set.firms.create")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Connexion Odoo ---------------- */
function OdooCard() {
  const t = useT();
  const s = useStore();
  const [cfg, setCfg] = useState<OdooConfig>(s.odoo ?? { url: "/odoo", db: "pepiniere-belkora", username: "", apiKey: "" });
  const [status, setStatus] = useState<{ ok?: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OdooConfig, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  // Mapping société ↔ Odoo : liste res.company et affecte le company_id à la société active.
  const firm = currentFirm(s);
  const [companies, setCompanies] = useState<{ id: number; name: string }[] | null>(null);
  const [loadingCos, setLoadingCos] = useState(false);

  async function loadCompanies() {
    setLoadingCos(true);
    setStatus(null);
    try {
      const list = await odooListCompanies(cfg);
      setCompanies(list);
      actions.setOdooConfig(cfg);
    } catch (e) {
      setStatus({ ok: false, msg: `Sociétés Odoo : ${(e as Error).message}. Vérifiez l'URL/CORS et la clé API.` });
    } finally {
      setLoadingCos(false);
    }
  }

  async function test() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await odooTestConnection(cfg);
      setStatus({ ok: true, msg: `Connecté — Odoo ${r.version}, uid ${r.uid}.` });
      actions.setOdooConfig(cfg);
    } catch (e) {
      setStatus({ ok: false, msg: `Échec : ${(e as Error).message}. Vérifiez l'URL/CORS (proxy) et la clé API.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Plug size={16} className="text-sage" />
            {t("set.odoo.title")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL Odoo" hint='En dev, garder "/odoo" (proxy CORS). Une URL directe https:// ne marche que si Odoo renvoie les en-têtes CORS.'>
            <Input value={cfg.url} onChange={(e) => set("url", e.target.value)} placeholder="/odoo" />
          </Field>
          <Field label={t("set.odoo.db")}>
            <Input value={cfg.db} onChange={(e) => set("db", e.target.value)} placeholder="pepiniere-belkora" />
          </Field>
          <Field label={t("set.odoo.login")} hint={t("set.odoo.login.hint")}>
            <Input value={cfg.username} onChange={(e) => set("username", e.target.value)} placeholder="prenom.nom@pepinierebelkora.com" />
          </Field>
          <Field label={t("set.odoo.apiKey")} hint="À générer dans Odoo : avatar → Préférences → « Sécurité du compte » → « Nouvelle clé API ». Collez-la ici.">
            <Input type="password" value={cfg.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder="clé API Odoo" />
          </Field>
        </div>
        {(!cfg.username?.trim() || !cfg.apiKey?.trim()) && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
            <Plug size={13} className="mt-0.5 shrink-0" />
            Identifiant ou clé API manquant : les fonctions Odoo (import, synchronisation, audit RIB)
            resteront bloquées tant que ces champs ne sont pas renseignés et testés.
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={test} disabled={busy || !cfg.url || !cfg.db}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Tester &amp; enregistrer
          </Button>
          <Button variant="outline" onClick={() => actions.setOdooConfig(cfg)}><Save size={16} /> Enregistrer</Button>
          {status && (
            <span className={status.ok ? "text-sm text-success" : "text-sm text-destructive"}>{status.msg}</span>
          )}
        </div>

        <div className="mt-5 rounded-md border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              ID société Odoo de « {firm.name} » :{" "}
              {firm.odoo_company_id != null ? (
                <Badge tone="sage">company_id {firm.odoo_company_id}</Badge>
              ) : (
                <Badge tone="destructive">non renseigné</Badge>
              )}
            </p>
            <Button variant="outline" size="sm" onClick={loadCompanies} disabled={loadingCos || !cfg.url || !cfg.db}>
              {loadingCos ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />} Lister les sociétés Odoo
            </Button>
          </div>
          {companies &&
            (companies.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Aucune société renvoyée par Odoo.</p>
            ) : (
              <div className="mt-3">
                <Table>
                  <thead>
                    <tr>
                      <Th>ID</Th><Th>Société Odoo</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id}>
                        <Td className="num">{c.id}</Td>
                        <Td>{c.name}</Td>
                        <Td className="text-right">
                          {firm.odoo_company_id === c.id ? (
                            <Badge tone="sage">affectée</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => actions.upsertFirm({ ...firm, odoo_company_id: c.id })}>
                              Affecter
                            </Button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Corrige l'erreur « Renseignez l'ID société Odoo » : choisissez la société Odoo correspondante,
            son <code className="font-mono">company_id</code> est enregistré sur la société active.
          </p>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          L'import se lance depuis la page <b>Salariés</b> (bouton « Importer depuis Odoo »), filtré par le
          <code className="font-mono"> company_id</code> Odoo de la société active. Mapping : name, salaire
          (<code className="font-mono">wage</code> mensuel → taux horaire sur 191 h), CIN (identification_id),
          matricule (registration_number), CNSS (l10n_ma_cnss_number), poste, situation, personnes à charge,
          département. Salariés sans <code className="font-mono">wage</code> renseigné (ouvriers cash) → repli SMIG.
        </p>
      </CardContent>
    </Card>
  );
}

/* ================================================================= Persistance cloud (Supabase) ================================================================= */

function useSyncStatus(): { status: SyncStatus; error: string } {
  const [, force] = useState(0);
  useEffect(() => subscribeSync(() => force((n) => n + 1)), []);
  return { status: getSyncStatus(), error: getSyncError() };
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  off: "Non configuré (local uniquement)",
  syncing: "Synchronisation…",
  saved: "Synchronisé",
  error: "Erreur de synchronisation",
};

function CloudSyncCard() {
  const t = useT();
  const existing = getSupabaseConfig();
  const [url, setUrl] = useState(existing?.url ?? "");
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { status, error } = useSyncStatus();
  const configured = isSupabaseConfigured();

  async function handleTest() {
    setTesting(true);
    setResult(null);
    const res = await testConnection({ url: url.trim(), anonKey: anonKey.trim() });
    setResult(res);
    setTesting(false);
  }

  async function handleSave() {
    setSupabaseConfig({ url: url.trim(), anonKey: anonKey.trim() });
    await hydrateFromRemote(); // adopte le cloud partagé (ou l'initialise avec l'état local)
    setResult({ ok: true });
  }

  function handleDisable() {
    if (!window.confirm("Désactiver la synchronisation cloud ? Les données restent en local sur cet appareil.")) return;
    setSupabaseConfig(null);
    setUrl("");
    setAnonKey("");
    setResult(null);
  }

  async function copySql() {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  const tone = status === "saved" ? "sage" : status === "error" ? "destructive" : status === "syncing" ? "warning" : "muted";

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Cloud size={16} className="text-primary" />
            {t("set.cloud.title")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">État :</span>
          <Badge tone={tone as "sage" | "destructive" | "warning" | "muted"}>
            {configured ? (
              <span className="inline-flex items-center gap-1.5">
                {status === "syncing" ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                {SYNC_LABEL[status]}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><CloudOff size={12} /> {SYNC_LABEL.off}</span>
            )}
          </Badge>
          {status === "error" && error && <span className="text-xs text-destructive">{error}</span>}
        </div>

        <p className="text-[13px] text-muted-foreground">
          Sans cloud, les données vivent uniquement dans ce navigateur (perdues si le cache est vidé ou sur un
          autre appareil). Avec Supabase, elles sont <b className="text-foreground">sauvegardées en permanence</b> et
          partagées entre tous les postes. L'app reste fonctionnelle hors-ligne : le cloud se synchronise dès qu'il est joignable.
        </p>

        <div className="rounded-md border bg-muted/40 p-3 text-[13px] space-y-2">
          <p className="font-medium text-foreground">Mise en place (une seule fois)</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Créez un projet gratuit sur <span className="font-mono">supabase.com</span>.</li>
            <li>Dans <b>SQL Editor</b>, exécutez le script ci-dessous (crée la table + la sécurité RLS).</li>
            <li>Dans <b>Project Settings → API</b>, copiez l'<b>URL</b> du projet et la clé <b>anon public</b>, collez-les ci-dessous, puis « Tester » et « Activer ».</li>
          </ol>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-muted-foreground">Script SQL à exécuter dans Supabase :</span>
            <Button variant="outline" onClick={copySql} className="h-8 px-2.5 text-xs">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copié" : "Copier le SQL"}
            </Button>
          </div>
          <pre className="max-h-40 overflow-auto rounded bg-background p-2 text-[11px] leading-snug font-mono">{SUPABASE_SQL}</pre>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("set.cloud.url")}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" />
          </Field>
          <Field label={t("set.cloud.anon")} hint={t("set.cloud.anon.hint")}>
            <Input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGciOi…" />
          </Field>
        </div>

        {result && (
          <div className={`flex items-start gap-2 rounded-md border p-2.5 text-[13px] ${result.ok ? "border-sage/40 text-foreground" : "border-destructive/40 text-destructive"}`}>
            {result.ok ? <Check size={15} className="mt-0.5 shrink-0 text-sage" /> : <ShieldAlert size={15} className="mt-0.5 shrink-0" />}
            <span>{result.ok ? "Connexion valide — synchronisation active." : result.error}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || !url.trim() || !anonKey.trim()}>
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Tester la connexion
          </Button>
          <Button onClick={handleSave} disabled={!url.trim() || !anonKey.trim()}>
            <Save size={16} /> {t("set.cloud.activate")}
          </Button>
          {configured && (
            <Button variant="outline" onClick={handleDisable}>
              <CloudOff size={16} /> {t("set.cloud.disable")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
