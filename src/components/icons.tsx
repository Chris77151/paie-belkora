/**
 * Système d'icônes Belkora — tuiles dégradées « vivantes » (style Teams / loupe).
 *
 * Deux couches :
 *   1. Icônes d'identité dessinées main (20 nav + marque + loupe), glyphes blancs
 *      minimalistes sur tuile arrondie en dégradé.
 *   2. Icônes d'action : glyphes Lucide OFFICIELS en blanc, posés sur les mêmes
 *      tuiles dégradées (`vivid()`). Même sens, même lisibilité — en couleurs.
 *
 * Les dégradés restent STRICTEMENT dans la charte (index.css) : émeraude, kelly,
 * forêt, sarcelle info, or (+ rouge destructif et neutre déjà présents dans la
 * charte pour les états). Reflet glossy commun façon icônes 3D. Glyphe blanc =
 * contraste AA en clair comme en sombre. Chaque action garde SA couleur partout.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity as LActivity,
  AlertCircle as LAlertCircle,
  AlertTriangle as LAlertTriangle,
  ArrowDownRight as LArrowDownRight,
  ArrowRight as LArrowRight,
  ArrowUpRight as LArrowUpRight,
  Baby as LBaby,
  BadgeCheck as LBadgeCheck,
  BookMarked as LBookMarked,
  BookText as LBookText,
  Bot as LBot,
  Building2 as LBuilding2,
  CalendarClock as LCalendarClock,
  CalendarDays as LCalendarDays,
  Camera as LCamera,
  Check as LCheck,
  CheckCircle2 as LCheckCircle2,
  ChevronDown as LChevronDown,
  ChevronRight as LChevronRight,
  ChevronUp as LChevronUp,
  CircleSlash as LCircleSlash,
  ClipboardList as LClipboardList,
  Clock as LClock,
  Cloud as LCloud,
  CloudOff as LCloudOff,
  Copy as LCopy,
  Cpu as LCpu,
  Database as LDatabase,
  DatabaseBackup as LDatabaseBackup,
  DatabaseZap as LDatabaseZap,
  DoorOpen as LDoorOpen,
  Download as LDownload,
  DownloadCloud as LDownloadCloud,
  ExternalLink as LExternalLink,
  Eye as LEye,
  FileClock as LFileClock,
  FileCode2 as LFileCode2,
  FileDown as LFileDown,
  FileSignature as LFileSignature,
  FileSpreadsheet as LFileSpreadsheet,
  FileText as LFileText,
  FileWarning as LFileWarning,
  Filter as LFilter,
  Gauge as LGauge,
  Gavel as LGavel,
  Hand as LHand,
  HardHat as LHardHat,
  HelpCircle as LHelpCircle,
  History as LHistory,
  Hourglass as LHourglass,
  ImageUp as LImageUp,
  Info as LInfo,
  KeyRound as LKeyRound,
  Landmark as LLandmark,
  Languages as LLanguages,
  LayoutList as LLayoutList,
  Lightbulb as LLightbulb,
  ListChecks as LListChecks,
  Loader2 as _Loader2,
  Lock as LLock,
  LogIn as LLogIn,
  LogOut as LLogOut,
  Menu as LMenu,
  MinusCircle as LMinusCircle,
  Moon as LMoon,
  Paperclip as LPaperclip,
  Pencil as LPencil,
  PencilLine as LPencilLine,
  Plug as LPlug,
  Plus as LPlus,
  Printer as LPrinter,
  Radio as LRadio,
  Receipt as LReceipt,
  RefreshCw as LRefreshCw,
  RotateCcw as LRotateCcw,
  Save as LSave,
  Scale as LScale,
  Calculator as LCalculator,
  ScanSearch as LScanSearch,
  Search as LSearch,
  Send as LSend,
  ScrollText as LScrollText,
  ServerCog as LServerCog,
  Sheet as LSheet,
  ShieldAlert as LShieldAlert,
  ShieldCheck as LShieldCheck,
  ShieldX as LShieldX,
  SlidersHorizontal as LSlidersHorizontal,
  Sparkles as LSparkles,
  Stethoscope as LStethoscope,
  Sun as LSun,
  Table2 as LTable2,
  Target as LTarget,
  Trash2 as LTrash2,
  TrendingDown as LTrendingDown,
  TrendingUp as LTrendingUp,
  Unlock as LUnlock,
  Upload as LUpload,
  UploadCloud as LUploadCloud,
  UserPlus as LUserPlus,
  UserRound as LUserRound,
  Users as LUsers,
  UserX as LUserX,
  Wallet as LWallet,
  Wifi as LWifi,
  Wrench as LWrench,
  X as LX,
  XCircle as LXCircle,
} from "lucide-react";

void _Loader2;

export interface TileIconProps {
  size?: number;
  className?: string;
}

type Pair = [string, string];
const G: Record<string, Pair> = {
  emerald: ["#0AA14E", "#3DDC74"], // émeraude vive → kelly clair
  kelly: ["#2FBF5B", "#0E9AA7"],   // kelly → sarcelle
  teal: ["#0E9AA7", "#1FAB89"],    // sarcelle → menthe forêt
  forest: ["#1FA35C", "#0AA14E"],  // forêt vive → émeraude
  gold: ["#E09A1F", "#F5C04C"],    // or → ambre
  red: ["#D92638", "#F4535F"],     // destructif charte, avivé
  slate: ["#5F7A6B", "#9DBEAC"],   // neutre teinté charte
};

/** Coquille commune : tuile dégradée + reflet glossy + contenu. */
function TileShell({
  id, pair, size = 18, className, children,
}: TileIconProps & { id: string; pair: Pair; children: React.ReactNode }) {
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
        <clipPath id={`${id}-c`}>
          <rect x="1" y="1" width="22" height="22" rx="6" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill={`url(#${id})`} />
      <g clipPath={`url(#${id}-c)`}>
        <ellipse cx="12" cy="5.5" rx="10" ry="4.5" fill="#FFFFFF" opacity="0.22" />
      </g>
      {children}
    </svg>
  );
}

function Tile({
  id, pair, size = 18, className, children, glyph,
}: TileIconProps & { id: string; pair: Pair; children?: React.ReactNode; glyph?: React.ReactNode }) {
  return (
    <TileShell id={id} pair={pair} size={size} className={className}>
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={glyph ? 1.6 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph ?? children}
      </g>
    </TileShell>
  );
}

const P = (props: TileIconProps & { id: string; pair: Pair; children: React.ReactNode }) => (
  <Tile {...props} />
);

/**
 * Enrobe un glyphe Lucide (blanc, épais) dans une tuile vive.
 * Même composant, même sens — seule la présentation change.
 */
function vivid(Icon: LucideIcon, pair: Pair, id: string) {
  return function VividIcon({ size = 18, className }: TileIconProps) {
    return (
      <TileShell id={id} pair={pair} size={size} className={className}>
        <g transform="translate(4.6,4.6)">
          <Icon size={14.8} color="#FFFFFF" strokeWidth={2.4} />
        </g>
      </TileShell>
    );
  };
}

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

/* ------------------------------ Actions (glyphes Lucide sur tuiles vives) ------------------------------ */
/* Chaque action garde SA couleur partout : ajout = émeraude, édition = sarcelle,
   suppression = rouge, alerte = or, info/doc = sarcelle-forêt, validation = émeraude. */

export const Plus = vivid(LPlus, G.emerald, "v-plus");
export const Pencil = vivid(LPencil, G.teal, "v-pencil");
export const PencilLine = vivid(LPencilLine, G.teal, "v-pencilline");
export const Trash2 = vivid(LTrash2, G.red, "v-trash2");
export const X = vivid(LX, G.slate, "v-x");
export const Check = vivid(LCheck, G.emerald, "v-check");
export const CheckCircle2 = vivid(LCheckCircle2, G.emerald, "v-checkcircle2");
export const XCircle = vivid(LXCircle, G.red, "v-xcircle");
export const AlertTriangle = vivid(LAlertTriangle, G.gold, "v-alerttriangle");
export const AlertCircle = vivid(LAlertCircle, G.red, "v-alertcircle");
export const Info = vivid(LInfo, G.teal, "v-info");
export const ShieldAlert = vivid(LShieldAlert, G.gold, "v-shieldalert");
export const ShieldCheck = vivid(LShieldCheck, G.forest, "v-shieldcheck");
export const ShieldX = vivid(LShieldX, G.red, "v-shieldx");
export const FileText = vivid(LFileText, G.teal, "v-filetext");
export const FileSignature = vivid(LFileSignature, G.teal, "v-filesignature");
export const FileClock = vivid(LFileClock, G.teal, "v-fileclock");
export const FileCode2 = vivid(LFileCode2, G.teal, "v-filecode2");
export const FileWarning = vivid(LFileWarning, G.gold, "v-filewarning");
export const FileSpreadsheet = vivid(LFileSpreadsheet, G.forest, "v-filespreadsheet");
export const Sheet = vivid(LSheet, G.forest, "v-sheet");
export const Table2 = vivid(LTable2, G.forest, "v-table2");
export const BookText = vivid(LBookText, G.teal, "v-booktext");
export const BookMarked = vivid(LBookMarked, G.forest, "v-bookmarked");
export const ScrollText = vivid(LScrollText, G.teal, "v-scrolltext");
export const ClipboardList = vivid(LClipboardList, G.forest, "v-clipboardlist");
export const ListChecks = vivid(LListChecks, G.teal, "v-listchecks");
export const LayoutList = vivid(LLayoutList, G.teal, "v-layoutlist");
export const FileDown = vivid(LFileDown, G.forest, "v-filedown");
export const Download = vivid(LDownload, G.forest, "v-download");
export const DownloadCloud = vivid(LDownloadCloud, G.forest, "v-downloadcloud");
export const Upload = vivid(LUpload, G.teal, "v-upload");
export const UploadCloud = vivid(LUploadCloud, G.teal, "v-uploadcloud");
export const ImageUp = vivid(LImageUp, G.teal, "v-imageup");
export const Eye = vivid(LEye, G.teal, "v-eye");
export const Printer = vivid(LPrinter, G.slate, "v-printer");
export const Lock = vivid(LLock, G.forest, "v-lock");
export const Unlock = vivid(LUnlock, G.gold, "v-unlock");
export const KeyRound = vivid(LKeyRound, G.gold, "v-keyround");
export const Camera = vivid(LCamera, G.teal, "v-camera");
export const Sparkles = vivid(LSparkles, G.gold, "v-sparkles");
export const Wallet = vivid(LWallet, G.gold, "v-wallet");
export const Receipt = vivid(LReceipt, G.forest, "v-receipt");
export const SlidersHorizontal = vivid(LSlidersHorizontal, G.teal, "v-sliders");
export const Filter = vivid(LFilter, G.teal, "v-filter");
export const CalendarClock = vivid(LCalendarClock, G.teal, "v-calendarclock");
export const CalendarDays = vivid(LCalendarDays, G.emerald, "v-calendardays");
export const Clock = vivid(LClock, G.teal, "v-clock");
export const Hourglass = vivid(LHourglass, G.gold, "v-hourglass");
export const History = vivid(LHistory, G.teal, "v-history");
export const ChevronDown = vivid(LChevronDown, G.teal, "v-chevrondown");
export const ChevronUp = vivid(LChevronUp, G.teal, "v-chevronup");
export const ChevronRight = vivid(LChevronRight, G.teal, "v-chevronright");
export const ArrowRight = vivid(LArrowRight, G.emerald, "v-arrowright");
export const ArrowUpRight = vivid(LArrowUpRight, G.emerald, "v-arrowupright");
export const ArrowDownRight = vivid(LArrowDownRight, G.teal, "v-arrowdownright");
export const TrendingUp = vivid(LTrendingUp, G.emerald, "v-trendingup");
export const TrendingDown = vivid(LTrendingDown, G.red, "v-trendingdown");
export const Users = vivid(LUsers, G.kelly, "v-users");
export const UserPlus = vivid(LUserPlus, G.kelly, "v-userplus");
export const UserRound = vivid(LUserRound, G.kelly, "v-userround");
export const UserX = vivid(LUserX, G.gold, "v-userx");
export const Save = vivid(LSave, G.emerald, "v-save");
export const RotateCcw = vivid(LRotateCcw, G.teal, "v-rotateccw");
export const RefreshCw = vivid(LRefreshCw, G.teal, "v-refreshcw");
export const Copy = vivid(LCopy, G.teal, "v-copy");
export const ExternalLink = vivid(LExternalLink, G.forest, "v-externallink");
export const Search = vivid(LSearch, G.teal, "v-search");
export const Menu = vivid(LMenu, G.slate, "v-menu");
export const Sun = vivid(LSun, G.gold, "v-sun");
export const Moon = vivid(LMoon, G.slate, "v-moon");
export const Languages = vivid(LLanguages, G.teal, "v-languages");
export const LogIn = vivid(LLogIn, G.emerald, "v-login");
export const LogOut = vivid(LLogOut, G.slate, "v-logout");
export const Cloud = vivid(LCloud, G.teal, "v-cloud");
export const CloudOff = vivid(LCloudOff, G.slate, "v-cloudoff");
export const Send = vivid(LSend, G.emerald, "v-send");
export const Paperclip = vivid(LPaperclip, G.teal, "v-paperclip");
export const Baby = vivid(LBaby, G.teal, "v-baby");
export const Stethoscope = vivid(LStethoscope, G.teal, "v-stethoscope");
export const Landmark = vivid(LLandmark, G.teal, "v-landmark");
export const BadgeCheck = vivid(LBadgeCheck, G.emerald, "v-badgecheck");
export const Gavel = vivid(LGavel, G.forest, "v-gavel");
export const Building2 = vivid(LBuilding2, G.teal, "v-building2");
export const Database = vivid(LDatabase, G.teal, "v-database");
export const DatabaseZap = vivid(LDatabaseZap, G.teal, "v-databasezap");
export const DatabaseBackup = vivid(LDatabaseBackup, G.teal, "v-databasebackup");
export const Gauge = vivid(LGauge, G.teal, "v-gauge");
export const HelpCircle = vivid(LHelpCircle, G.teal, "v-helpcircle");
export const Lightbulb = vivid(LLightbulb, G.gold, "v-lightbulb");
export const DoorOpen = vivid(LDoorOpen, G.slate, "v-dooropen");
export const CircleSlash = vivid(LCircleSlash, G.red, "v-circleslash");
export const MinusCircle = vivid(LMinusCircle, G.red, "v-minuscircle");
export const Radio = vivid(LRadio, G.teal, "v-radio");
export const Cpu = vivid(LCpu, G.teal, "v-cpu");
export const Hand = vivid(LHand, G.slate, "v-hand");
export const Bot = vivid(LBot, G.teal, "v-bot");
export const ServerCog = vivid(LServerCog, G.emerald, "v-servercog");
export const Activity = vivid(LActivity, G.kelly, "v-activity");
export const ScanSearch = vivid(LScanSearch, G.forest, "v-scansearch");
export const Wrench = vivid(LWrench, G.teal, "v-wrench");
export const Target = vivid(LTarget, G.gold, "v-target");
export const Plug = vivid(LPlug, G.teal, "v-plug");
export const HardHat = vivid(LHardHat, G.gold, "v-hardhat");
export const Scale = vivid(LScale, G.teal, "v-scale");
export const Wifi = vivid(LWifi, G.teal, "v-wifi");
export const Calculator = vivid(LCalculator, G.kelly, "v-calculator");
