import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, Users, Calculator, FileText, ShieldAlert,
  CalendarDays, Settings, Moon, Sun, Sprout, BookText, FileSignature,
  Search, UserRound, ShieldCheck, Bot, ScanSearch, LogOut, Menu, X,
} from "lucide-react";
import { actions, currentFirm, deriveAlerts, useStore } from "@/data/store";
import type { AppRole } from "@/data/types";
import { Select } from "@/components/ui/kit";
import { logout, ROLE_LABELS, useSession } from "@/lib/auth";
import { cn } from "@/lib/cn";

const ADMIN_ROLES: AppRole[] = ["super_admin", "firm_admin"];

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Pilotage", items: [
    { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  ] },
  { label: "Paie & RH", items: [
    { to: "/employees", label: "Salariés", icon: Users },
    { to: "/documents", label: "Documents RH", icon: FileSignature },
    { to: "/payroll", label: "Paie", icon: Calculator },
    { to: "/leaves", label: "Congés", icon: CalendarDays },
  ] },
  { label: "Comptabilité", items: [
    { to: "/accounting", label: "Écritures comptables", icon: BookText },
    { to: "/audit", label: "Audit comptable", icon: ScanSearch },
  ] },
  { label: "Conformité", items: [
    { to: "/declarations", label: "Déclarations", icon: FileText },
    { to: "/compliance", label: "Conformité", icon: ShieldAlert },
    { to: "/securite", label: "Sécurité / Audit RIB", icon: ShieldCheck, adminOnly: true },
  ] },
  { label: "Système", items: [
    { to: "/assistant", label: "Assistant IA", icon: Bot },
    { to: "/settings", label: "Paramètres", icon: Settings },
  ] },
];

export default function Layout() {
  const s = useStore();
  const session = useSession();
  const firm = currentFirm(s);
  const role = session?.role ?? s.currentRole ?? "firm_admin";
  const canSee = (item: NavItem) => !item.adminOnly || ADMIN_ROLES.includes(role);
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);
  const alerts = deriveAlerts(s, firm.id);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const [dark, setDark] = useState(() => localStorage.getItem("gca-theme") === "dark");
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("gca-theme", dark ? "dark" : "light");
  }, [dark]);

  // Ferme le tiroir mobile à chaque changement de route.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Fermeture au clavier (Échap) + verrou du scroll de fond quand le tiroir est ouvert.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sprout size={20} />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-bold">Belkora Paie</div>
        <div className="text-[11px] text-muted-foreground -mt-0.5">Maroc · RH & Paie</div>
      </div>
    </div>
  );

  const navList = (
    <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </div>
          {group.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground",
                    )}
                  />
                  <span className="truncate">{label}</span>
                  {to === "/compliance" && critical > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground">
                      {critical}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  const firmSelect = (
    <Select
      value={firm.id}
      onChange={(ev) => actions.setCurrentFirm(ev.target.value)}
      className="w-full sm:w-56 sm:max-w-[60vw]"
      aria-label="Société active"
    >
      {s.firms.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name} · {f.regime}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center px-5 h-16 border-b">{brand}</div>
        {navList}
        <div className="p-4 border-t text-[11px] text-muted-foreground">
          Réf. Maroc 2025-2026 · SMIG 17,92 DH/h
        </div>
      </aside>

      {/* Tiroir de navigation (mobile) */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setNavOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[86%] max-w-xs flex-col border-r bg-card shadow-2xl">
            <div className="flex items-center justify-between px-4 h-16 border-b">
              {brand}
              <button
                onClick={() => setNavOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-input hover:bg-accent"
                aria-label="Fermer le menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="border-b p-3">{firmSelect}</div>
            {navList}
            <div className="p-4 border-t text-[11px] text-muted-foreground">
              Réf. Maroc 2025-2026 · SMIG 17,92 DH/h
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card/80 backdrop-blur flex items-center justify-between px-3 sm:px-5 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setNavOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-input hover:bg-accent md:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu size={18} />
            </button>
            <img
              src="/logo-belkora.png"
              alt="Belkora"
              className="h-7 w-auto hidden lg:block dark:brightness-[1.6] dark:saturate-[1.1]"
            />
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Sélecteur société : dans le header dès md, sinon dans le tiroir mobile. */}
            <div className="hidden md:block">{firmSelect}</div>
            <button
              onClick={() => setDark((d) => !d)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-input hover:bg-accent"
              title="Basculer le thème"
              aria-label="Basculer le thème"
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {session && (
              <div className="flex items-center gap-2 border-l pl-2 sm:pl-3">
                <div className="hidden sm:block text-right leading-tight">
                  <div className="text-xs font-medium truncate max-w-[160px]">
                    {session.full_name || session.username}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">{ROLE_LABELS[session.role]}</div>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground text-[11px] font-semibold">
                  {(session.full_name || session.username).slice(0, 2).toUpperCase()}
                </span>
                <button
                  onClick={() => { if (window.confirm("Se déconnecter de l'application ?")) logout(); }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-input hover:bg-accent"
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                >
                  <LogOut size={17} />
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-5 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const stripDiacritics = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recherche globale de salariés (toutes sociétés) — nom, matricule, CIN, CNSS, poste, site. */
function GlobalSearch() {
  const s = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const needle = stripDiacritics(q.trim());
    if (needle.length < 2) return [];
    const firmName = new Map(s.firms.map((f) => [f.id, f.name]));
    return s.employees
      .map((e) => ({
        e,
        hay: stripDiacritics(
          `${e.first_name} ${e.last_name} ${e.matricule ?? ""} ${e.cin ?? ""} ${e.cnss_number ?? ""} ${e.position ?? ""} ${e.site ?? ""}`,
        ),
        firm: firmName.get(e.firm_id) ?? "",
      }))
      .filter((r) => r.hay.includes(needle))
      .slice(0, 8);
  }, [q, s.employees, s.firms]);

  function go(firmId: string, name: string) {
    if (firmId !== s.currentFirmId) actions.setCurrentFirm(firmId);
    setOpen(false);
    setQ("");
    navigate(`/employees?q=${encodeURIComponent(name)}`);
  }

  return (
    <div ref={box} className="relative w-[clamp(180px,32vw,360px)]">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].e.firm_id, `${results[0].e.first_name} ${results[0].e.last_name}`);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Rechercher un salarié…"
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "placeholder:text-muted-foreground/60",
        )}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-md border bg-card shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Aucun salarié trouvé.</div>
          ) : (
            results.map(({ e, firm }) => (
              <button
                key={e.id}
                onMouseDown={(ev) => { ev.preventDefault(); go(e.firm_id, `${e.first_name} ${e.last_name}`); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground text-[11px] font-semibold">
                  {e.first_name?.[0]}{e.last_name?.[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.first_name} {e.last_name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[e.matricule, e.position, firm].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <UserRound size={14} className="shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
