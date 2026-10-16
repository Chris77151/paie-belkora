/**
 * Système d'icônes Belkora — tuiles dégradées « vivantes » (style Teams / loupe).
 *
 * Chaque icône = une tuile arrondie en dégradé + un glyphe blanc (ligne 1.8).
 * Les 5 dégradés restent STRICTEMENT dans la charte (index.css : émeraude,
 * kelly, forêt, sarcelle info, or) — aucune couleur hors charte. Le glyphe blanc
 * garantit le contraste AA sur tous les dégradés, en clair comme en sombre.
 *
 * Correspondances charte :
 *   émeraude #088838 (primaire) · kelly #38A838 (sage) · forêt #186848 (payé)
 *   sarcelle #0E7C86 (statut « déclarée ») · or #C08A3E (gold)
 */
import * as React from "react";

export interface TileIconProps {
  size?: number;
  className?: string;
}

type Pair = [string, string];
const G: Record<string, Pair> = {
  emerald: ["#088838", "#38A838"], // émeraude → kelly
  kelly: ["#38A838", "#0E7C86"],   // kelly → sarcelle
  teal: ["#0E7C86", "#186848"],    // sarcelle → forêt
  forest: ["#186848", "#088838"],  // forêt → émeraude
  gold: ["#C08A3E", "#E0A83C"],    // or → ambre (signalement)
};

function Tile({
  id, pair, size = 18, className, children, glyph,
}: TileIconProps & { id: string; pair: Pair; children?: React.ReactNode; glyph?: React.ReactNode }) {
  const [a, b] = pair;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill={`url(#${id})`} />
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={glyph ? 1.6 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph ?? children}
      </g>
    </svg>
  );
}

const P = (props: TileIconProps & { id: string; pair: Pair; children: React.ReactNode }) => (
  <Tile {...props} />
);

/* ------------------------------ Pilotage ------------------------------ */

export function DashboardIcon(p: TileIconProps) {
  return (
    <P id="blg-dashboard" pair={G.emerald} {...p}>
      <rect x="5" y="5" width="6" height="6" rx="1.5" />
      <rect x="13" y="5" width="6" height="6" rx="1.5" />
      <rect x="5" y="13" width="6" height="6" rx="1.5" />
      <rect x="13" y="13" width="6" height="6" rx="1.5" />
    </P>
  );
}

export function RisksIcon(p: TileIconProps) {
  return (
    <P id="blg-risks" pair={G.teal} {...p}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="0.6" fill="#FFFFFF" />
      <path d="M12 12 L16.5 7.5" />
    </P>
  );
}

/* ------------------------------ Paie & RH ------------------------------ */

export function EmployeesIcon(p: TileIconProps) {
  return (
    <P id="blg-employees" pair={G.kelly} {...p}>
      <circle cx="9" cy="9" r="2.6" />
      <path d="M4.5 17c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4" />
      <circle cx="16" cy="10" r="2" />
      <path d="M15.5 13.6c2 .2 3.4 1.4 4 3.4" />
    </P>
  );
}

export function NonDeclaresIcon(p: TileIconProps) {
  return (
    <P id="blg-nondeclares" pair={G.gold} {...p}>
      <circle cx="10.5" cy="8.5" r="2.8" />
      <path d="M5.5 17.5c.7-3 2.6-4.5 5-4.5 1 0 1.9.3 2.7.8" />
      <path d="M17.5 14v4" />
      <circle cx="17.5" cy="19.4" r="0.7" fill="#FFFFFF" stroke="none" />
    </P>
  );
}

export function RegisterIcon(p: TileIconProps) {
  return (
    <P id="blg-register" pair={G.forest} {...p}>
      <rect x="6" y="4.5" width="12" height="15" rx="2" />
      <rect x="9.5" y="3" width="5" height="3" rx="1" />
      <path d="M9 10.5h6M9 13.5h6M9 16.5h4" />
    </P>
  );
}

export function DocumentsIcon(p: TileIconProps) {
  return (
    <P id="blg-documents" pair={G.emerald} {...p}>
      <path d="M7 3.5h6l4 4v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 16.5v-11A1.5 1.5 0 0 1 7.5 4Z" />
      <path d="M13 3.5v4h4" />
      <path d="M9.5 15.5 15 10" />
      <path d="M9.5 15.5 8.8 13l2.5-.7Z" />
    </P>
  );
}

export function DocLogIcon(p: TileIconProps) {
  return (
    <P id="blg-doclog" pair={G.teal} {...p}>
      <path d="M7 3.5h6l4 4v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 16.5v-11A1.5 1.5 0 0 1 7.5 4Z" />
      <path d="M13 3.5v4h4" />
      <circle cx="12" cy="13.5" r="3" />
      <path d="M12 12v1.6l1.1 1.1" />
    </P>
  );
}

export function PayrollIcon(p: TileIconProps) {
  return (
    <P id="blg-payroll" pair={G.kelly} {...p}>
      <rect x="6.5" y="3.5" width="11" height="17" rx="2" />
      <rect x="9" y="6.5" width="6" height="3" rx="0.8" />
      <path d="M9 13h1.5M12.5 13H14M15.5 13h.5M9 16h1.5M12.5 16H14M15.5 16h.5" />
    </P>
  );
}

export function LivrePaieIcon(p: TileIconProps) {
  return (
    <P id="blg-livrepaie" pair={G.forest} {...p}>
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H18v13.5H7.5A1.5 1.5 0 0 0 6 18Z" />
      <path d="M6 18v2.5" />
      <path d="M18 16.5H7.5" />
      <path d="M13.8 7h2.4v5.6l-1.2-1-1.2 1Z" />
    </P>
  );
}

export function LeavesIcon(p: TileIconProps) {
  return (
    <P id="blg-leaves" pair={G.emerald} {...p}>
      <rect x="5" y="5.5" width="14" height="13" rx="2" />
      <path d="M5 10h14M9 3.5v3M15 3.5v3" />
      <path d="M12 13.2c-1.6-.4-2.4-1.4-2.4-2.7 1.5 0 2.4.8 2.4 2.7Zm0 0c1.6-.4 2.4-1.4 2.4-2.7-1.5 0-2.4.8-2.4 2.7Z" />
    </P>
  );
}

/* ------------------------------ Comptabilité ------------------------------ */

export function AccountingIcon(p: TileIconProps) {
  return (
    <P id="blg-accounting" pair={G.teal} {...p}>
      <path d="M5.5 4.5A1.5 1.5 0 0 1 7 3h10v15H7a1.5 1.5 0 0 0-1.5 1.5Z" />
      <path d="M5.5 19.5V21" />
      <path d="M9.5 8h5M9.5 11h5M9.5 14h3" />
    </P>
  );
}

export function AuditIcon(p: TileIconProps) {
  return (
    <P id="blg-audit" pair={G.forest} {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M13.8 13.8 16 16" />
    </P>
  );
}

/* ------------------------------ Conformité ------------------------------ */

export function DeclarationsIcon(p: TileIconProps) {
  return (
    <P id="blg-declarations" pair={G.kelly} {...p}>
      <path d="M7 3.5h6l4 4v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 16.5v-11A1.5 1.5 0 0 1 7.5 4Z" />
      <path d="M13 3.5v4h4" />
      <path d="M9 13h6M9 15.8h6" />
    </P>
  );
}

export function ComplianceIcon(p: TileIconProps) {
  return (
    <P id="blg-compliance" pair={G.gold} {...p}>
      <path d="M12 3.5 18 6v5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V6Z" />
      <path d="M12 8v4" />
      <circle cx="12" cy="14.8" r="0.7" fill="#FFFFFF" stroke="none" />
    </P>
  );
}

export function AccidentsIcon(p: TileIconProps) {
  return (
    <P id="blg-accidents" pair={G.gold} {...p}>
      <path d="M7 13a5 5 0 0 1 3.4-4.7V6.5h3.2v1.8A5 5 0 0 1 17 13v2H7Z" />
      <path d="M4.5 15.5h15" />
      <path d="M10 18.5h4" />
    </P>
  );
}

export function SecurityIcon(p: TileIconProps) {
  return (
    <P id="blg-security" pair={G.forest} {...p}>
      <path d="M12 3.5 18 6v5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V6Z" />
      <path d="M9.5 11.8l1.8 1.8 3.2-3.4" />
    </P>
  );
}

/* ------------------------------ Système ------------------------------ */

export function AssistantIcon(p: TileIconProps) {
  return (
    <P id="blg-assistant" pair={G.teal} {...p}>
      <rect x="6" y="8" width="12" height="9" rx="2.5" />
      <path d="M12 8V5.5M9 5.5h6" />
      <circle cx="10" cy="12" r="0.8" fill="#FFFFFF" stroke="none" />
      <circle cx="14" cy="12" r="0.8" fill="#FFFFFF" stroke="none" />
      <path d="M4.5 11v3M19.5 11v3" />
    </P>
  );
}

export function ItgcIcon(p: TileIconProps) {
  return (
    <P id="blg-itgc" pair={G.emerald} {...p}>
      <rect x="5" y="4" width="14" height="5" rx="1.5" />
      <rect x="5" y="10.5" width="14" height="5" rx="1.5" />
      <circle cx="8" cy="6.5" r="0.7" fill="#FFFFFF" stroke="none" />
      <circle cx="8" cy="13" r="0.7" fill="#FFFFFF" stroke="none" />
      <circle cx="16" cy="17.8" r="2.4" />
      <path d="M16 15.4v-1.2M16 20.2v-1M13.6 17.8h-1.2M19.6 17.8h-1.2" />
    </P>
  );
}

export function StabilityIcon(p: TileIconProps) {
  return (
    <P id="blg-stability" pair={G.kelly} {...p}>
      <path d="M3.5 12h4l2-5 4 10 2-5h5" />
    </P>
  );
}

export function SettingsIcon(p: TileIconProps) {
  return (
    <P id="blg-settings" pair={G.forest} {...p}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 4.5v2.4M12 17.1v2.4M4.5 12h2.4M17.1 12h2.4M6.7 6.7l1.7 1.7M15.6 15.6l1.7 1.7M17.3 6.7l-1.7 1.7M8.4 15.6l-1.7 1.7" />
    </P>
  );
}

/* ------------------------------ Marque & recherche ------------------------------ */

/** Tuile de marque (pousse) — remplace le Sprout monochrome (sidebar, login, favicon). */
export function BrandIcon(p: TileIconProps) {
  return (
    <P id="blg-brand" pair={G.emerald} {...p}>
      <path d="M12 19v-7" />
      <path d="M12 12C12 8.5 9.5 6.5 5.5 6.5c0 3.8 2.5 5.5 6.5 5.5Z" />
      <path d="M12 12c0-3.5 2.5-5.5 6.5-5.5 0 3.8-2.5 5.5-6.5 5.5Z" />
    </P>
  );
}

/**
 * Loupe en dégradé émeraude→sarcelle (sans tuile), comme la référence —
 * pour le champ de recherche globale.
 */
export function SearchIcon({ size = 16, className }: TileIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blg-search" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#088838" />
          <stop offset="55%" stopColor="#38A838" />
          <stop offset="100%" stopColor="#0E7C86" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#blg-search)" strokeWidth={2.4} strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M15.8 15.8 20.5 20.5" />
      </g>
    </svg>
  );
}
