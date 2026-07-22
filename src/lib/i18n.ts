/**
 * Internationalisation FR / AR — bascule de langue complète avec support RTL.
 *
 * Conçu selon les bonnes pratiques de rédaction :
 *  - Français : texte accentué, ponctuation soignée, registre institutionnel sobre.
 *  - Arabe standard moderne (MSA / الفصحى) : `dir="rtl"`, ponctuation arabe (، ؛ ؟),
 *    terminologie du droit social marocain (الأجراء، الأجور، التصاريح…), jamais de darija.
 *
 * Store réactif minimal (useSyncExternalStore) : au changement de langue on met à jour
 * `document.documentElement` (lang + dir) et on notifie tous les abonnés. La préférence est
 * persistée dans localStorage (`gca-lang`).
 */
import { useSyncExternalStore } from "react";

export type Lang = "fr" | "ar";

const STORAGE_KEY = "gca-lang";
const listeners = new Set<() => void>();

function readInitial(): Lang {
  if (typeof localStorage === "undefined") return "fr";
  return localStorage.getItem(STORAGE_KEY) === "ar" ? "ar" : "fr";
}

let current: Lang = readInitial();

/** Applique la langue au document (dir + lang) — appelé au boot et à chaque bascule. */
export function applyLangToDocument(lang: Lang = current) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.lang = lang;
  el.dir = lang === "ar" ? "rtl" : "ltr";
  el.classList.toggle("rtl", lang === "ar");
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  applyLangToDocument(lang);
  listeners.forEach((l) => l());
}

export function toggleLang() {
  setLang(current === "fr" ? "ar" : "fr");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook réactif : renvoie la langue courante (re-render au changement). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Hook réactif : renvoie la fonction de traduction `t` liée à la langue courante. */
export function useT(): (key: TKey, fallback?: string) => string {
  const lang = useLang();
  return (key: TKey, fallback?: string) => translate(key, lang, fallback);
}

export function translate(key: TKey, lang: Lang = current, fallback?: string): string {
  const entry = DICT[key];
  if (!entry) return fallback ?? key;
  return entry[lang] ?? entry.fr ?? fallback ?? key;
}

/* ------------------------------------------------------------------ dictionnaire ------------------------------------------------------------------ */
type Entry = { fr: string; ar: string };

/**
 * Dictionnaire FR / AR. Les clés sont stables (namespacées). Étendre au fil des pages.
 * Arabe : MSA, ponctuation arabe, terminologie du Code du travail marocain.
 */
export const DICT = {
  // Marque / coquille
  "brand.title": { fr: "Belkora Paie", ar: "بلكورة للأجور" },
  "brand.subtitle": { fr: "Maroc · RH & Paie", ar: "المغرب · الموارد البشرية والأجور" },
  "shell.footer": { fr: "Réf. Maroc 2025-2026 · SMIG 17,92 DH/h", ar: "مرجع المغرب 2025-2026 · الحد الأدنى للأجر 17,92 د.م/س" },

  // Groupes de navigation
  "nav.group.pilotage": { fr: "Pilotage", ar: "القيادة" },
  "nav.group.paierh": { fr: "Paie & RH", ar: "الأجور والموارد البشرية" },
  "nav.group.compta": { fr: "Comptabilité", ar: "المحاسبة" },
  "nav.group.conformite": { fr: "Conformité", ar: "الامتثال" },
  "nav.group.systeme": { fr: "Système", ar: "النظام" },

  // Éléments de navigation
  "nav.dashboard": { fr: "Tableau de bord", ar: "لوحة القيادة" },
  "nav.employees": { fr: "Salariés", ar: "الأجراء" },
  "nav.documents": { fr: "Documents RH", ar: "وثائق الموارد البشرية" },
  "nav.payroll": { fr: "Paie", ar: "الأجور" },
  "nav.leaves": { fr: "Congés", ar: "الإجازات" },
  "nav.accounting": { fr: "Écritures comptables", ar: "القيود المحاسبية" },
  "nav.audit": { fr: "Audit comptable", ar: "التدقيق المحاسبي" },
  "nav.declarations": { fr: "Déclarations", ar: "التصاريح" },
  "nav.compliance": { fr: "Conformité", ar: "الامتثال" },
  "nav.accidents": { fr: "Accidents du travail", ar: "حوادث الشغل" },
  "nav.security": { fr: "Sécurité / Audit RIB", ar: "الأمن / تدقيق الحساب البنكي" },
  "nav.assistant": { fr: "Assistant IA", ar: "المساعد الذكي" },
  "nav.settings": { fr: "Paramètres", ar: "الإعدادات" },

  // En-tête
  "header.search": { fr: "Rechercher un salarié…", ar: "ابحث عن أجير…" },
  "header.noResult": { fr: "Aucun salarié trouvé.", ar: "لا يوجد أي أجير." },
  "header.firm": { fr: "Société active", ar: "الشركة النشطة" },
  "header.theme": { fr: "Basculer le thème", ar: "تبديل السمة" },
  "header.logout": { fr: "Se déconnecter", ar: "تسجيل الخروج" },
  "header.logoutConfirm": { fr: "Se déconnecter de l'application ?", ar: "هل تريد تسجيل الخروج من التطبيق؟" },
  "header.lang": { fr: "Langue", ar: "اللغة" },
  "header.lang.fr": { fr: "Français", ar: "الفرنسية" },
  "header.lang.ar": { fr: "العربية", ar: "العربية" },
  "header.menuOpen": { fr: "Ouvrir le menu", ar: "فتح القائمة" },
  "header.menuClose": { fr: "Fermer le menu", ar: "إغلاق القائمة" },

  // Titres et sous-titres de page (toutes les pages)
  "page.dashboard.title": { fr: "Tableau de bord", ar: "لوحة القيادة" },
  "page.dashboard.sub": { fr: "masse salariale simulée pour", ar: "الكتلة الأجرية المقدَّرة لشهر" },
  "page.employees.title": { fr: "Salariés", ar: "الأجراء" },
  "page.employees.count": { fr: "salarié(s)", ar: "أجير/أجراء" },
  "page.documents.title": { fr: "Documents RH", ar: "وثائق الموارد البشرية" },
  "page.payroll.title": { fr: "Paie", ar: "الأجور" },
  "page.payroll.sub": { fr: "Calcul de la paie", ar: "احتساب الأجور" },
  "page.leaves.title": { fr: "Congés & absences", ar: "الإجازات والغيابات" },
  "page.leaves.sub": { fr: "Journal des absences et soldes de congés payés", ar: "سجل الغيابات وأرصدة الإجازات المؤدى عنها" },
  "page.accounting.title": { fr: "Écritures comptables de paie", ar: "القيود المحاسبية للأجور" },
  "page.accounting.sub": { fr: "PCGE / CGNC marocain", ar: "المخطط المحاسبي العام المغربي" },
  "page.audit.title": { fr: "Audit comptable & financier", ar: "التدقيق المحاسبي والمالي" },
  "page.audit.sub": { fr: "analyse par assertions d'audit (CGNC/PCGE · CGI · CNSS · Odoo)", ar: "تحليل وفق تأكيدات التدقيق (المخطط المحاسبي · المدونة العامة للضرائب · الصندوق الوطني للضمان الاجتماعي · أودو)" },
  "page.declarations.title": { fr: "Déclarations sociales", ar: "التصاريح الاجتماعية" },
  "page.declarations.sub": { fr: "Bordereau CNSS, préparation DAMANCOM, état IR annuel", ar: "كشف الصندوق الوطني للضمان الاجتماعي، إعداد داماك، الحالة السنوية للضريبة على الدخل" },
  "page.compliance.title": { fr: "Conformité RH", ar: "مطابقة الموارد البشرية" },
  "page.compliance.sub": { fr: "Alertes réglementaires, AT et échéances de contrat", ar: "التنبيهات التنظيمية، حوادث الشغل وآجال العقود" },
  "page.accidents.title": { fr: "Registre des accidents du travail", ar: "سجل حوادث الشغل" },
  "page.accidents.sub": { fr: "obligation légale (Loi 18-12, Code du travail)", ar: "التزام قانوني (القانون 18-12، مدونة الشغل)" },
  "page.security.title": { fr: "Sécurité / Audit RIB", ar: "الأمن / تدقيق الحساب البنكي" },
  "page.security.sub": { fr: "Modifications des coordonnées bancaires — accès administrateur", ar: "تعديلات البيانات البنكية — ولوج المدير" },
  "page.assistant.title": { fr: "Assistant IA", ar: "المساعد الذكي" },
  "page.assistant.sub": { fr: "Claude pilote l'application par prompt · société active", ar: "المساعد الذكي يقود التطبيق بالأوامر · الشركة النشطة" },
  "page.settings.title": { fr: "Paramètres", ar: "الإعدادات" },
  "page.settings.sub": { fr: "Sociétés, Odoo, référentiel réglementaire, bulletin et rôles", ar: "الشركات، أودو، المرجع التنظيمي، كشف الأجر والأدوار" },

  // Onglets Documents RH
  "docs.tab.attestations": { fr: "Attestations & certificats", ar: "الشهادات والإشهادات" },
  "docs.tab.contrat": { fr: "Contrat RH", ar: "عقد الشغل" },
  "docs.tab.discipline": { fr: "Kit disciplinaire RH", ar: "حزمة التأديب" },
  "docs.tab.rupture": { fr: "Kit rupture", ar: "حزمة إنهاء العقد" },
  "docs.tab.mineurs": { fr: "Kit mineurs (FR/AR)", ar: "حزمة القاصرين (FR/AR)" },
  "docs.sub.attestations": { fr: "Attestation de travail · Attestation de salaire · Certificat de travail — données réelles, zéro invention", ar: "شهادة عمل · شهادة أجر · شهادة الشغل — بيانات حقيقية، دون أي اختلاق" },
  "docs.sub.contrat": { fr: "Contrats de travail au gabarit Miya Belkora Design (chantier) — CDD & travail déterminé", ar: "عقود الشغل بنموذج ميّا بلكورة ديزاين (ورش) — عقد محدد المدة وشغل معيّن" },
  "docs.sub.discipline": { fr: "Sanctions graduées du Code du travail (art. 37 → 39) — avertissement à licenciement pour faute grave", ar: "العقوبات المتدرجة لمدونة الشغل (المواد 37 إلى 39) — من الإنذار إلى الفصل بسبب خطأ جسيم" },
  "docs.sub.rupture": { fr: "Fin du contrat « travail déterminé » (art. 33) — PV de fin de travaux, accord amiable, reçu pour solde de tout compte", ar: "إنهاء عقد « الشغل المعيّن » (المادة 33) — محضر انتهاء الأشغال، اتفاق ودّي، وصل التصفية النهائية" },
  "docs.sub.mineurs": { fr: "Emploi d'un mineur (15-18 ans, art. 143 & s.) — autorisation du représentant légal & contrat, en français et en arabe", ar: "تشغيل قاصر (15-18 سنة، المادة 143 وما بعدها) — إذن الممثل القانوني والعقد، بالفرنسية والعربية" },

  // Boutons communs
  "btn.add": { fr: "Ajouter", ar: "إضافة" },
  "btn.edit": { fr: "Modifier", ar: "تعديل" },
  "btn.delete": { fr: "Supprimer", ar: "حذف" },
  "btn.save": { fr: "Enregistrer", ar: "حفظ" },
  "btn.cancel": { fr: "Annuler", ar: "إلغاء" },
  "btn.pdf": { fr: "PDF", ar: "PDF" },
  "btn.html": { fr: "HTML", ar: "HTML" },
  "btn.print": { fr: "Imprimer", ar: "طباعة" },
  "btn.compute": { fr: "Calculer", ar: "احتساب" },
  "btn.export": { fr: "Exporter", ar: "تصدير" },

  // Module Solde de tout compte (STC)
  "stc.tab": { fr: "Kit rupture", ar: "حزمة إنهاء العقد" },
  "stc.auto": { fr: "Calcul automatique du solde de tout compte", ar: "الاحتساب التلقائي للتصفية النهائية" },
  "stc.reason": { fr: "Motif de départ", ar: "سبب المغادرة" },
  "stc.category": { fr: "Catégorie", ar: "الفئة" },
  "stc.cadre": { fr: "Cadre", ar: "إطار" },
  "stc.nonCadre": { fr: "Non-cadre (ouvrier/employé)", ar: "غير إطار (عامل/مستخدم)" },
  "stc.refSalary": { fr: "Salaire brut mensuel de référence", ar: "الأجر الشهري الخام المرجعي" },
  "stc.grossTotal": { fr: "Total brut", ar: "المجموع الخام" },
  "stc.exonerated": { fr: "part exonérée", ar: "الجزء المعفى" },
  "stc.taxable": { fr: "part imposable", ar: "الجزء الخاضع للضريبة" },
  "stc.net": { fr: "NET À PAYER", ar: "الصافي المستحق" },
  "stc.title": { fr: "Solde de tout compte — décompte", ar: "التصفية النهائية — التفصيل" },
} satisfies Record<string, Entry>;

export type TKey = keyof typeof DICT;
