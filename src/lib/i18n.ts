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
  "nav.stability": { fr: "Stabilisation", ar: "الاستقرار" },
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
  "header.readonly": { fr: "Lecture seule", ar: "قراءة فقط" },
  "header.readonly.hint": {
    fr: "Votre rôle permet la consultation uniquement : les actions de modification sont désactivées.",
    ar: "دوركم يسمح بالاطّلاع فقط: إجراءات التعديل معطّلة.",
  },

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
  "page.stability.title": { fr: "Stabilisation & Calculs", ar: "الاستقرار والحسابات" },
  "page.stability.sub": { fr: "Audit technique de l'application — réservé au super administrateur", ar: "تدقيق تقني للتطبيق — خاص بالمدير العام فقط" },
  "stab.score": { fr: "Score de santé", ar: "مؤشر السلامة" },
  "stab.rerun": { fr: "Ré-analyser", ar: "إعادة التحليل" },
  "stab.fix": { fr: "Corriger", ar: "إصلاح" },
  "stab.axis.calcul": { fr: "Calcul", ar: "الحساب" },
  "stab.axis.integrite": { fr: "Intégrité", ar: "السلامة" },
  "stab.col.sev": { fr: "Gravité", ar: "الخطورة" },
  "stab.col.axis": { fr: "Axe", ar: "المحور" },
  "stab.col.finding": { fr: "Constat", ar: "الملاحظة" },
  "stab.col.reco": { fr: "Recommandation", ar: "التوصية" },
  "stab.none": { fr: "Aucune anomalie détectée — application stable et calculs cohérents.", ar: "لم يُكتشف أي خلل — التطبيق مستقر والحسابات متسقة." },
  "stab.repairable": { fr: "réparable in-app", ar: "قابل للإصلاح داخل التطبيق" },
  "stab.fixConfirm": { fr: "Appliquer les corrections de données réparables (purge des orphelins, société active) ? Action idempotente et sûre.", ar: "تطبيق إصلاحات البيانات القابلة للإصلاح؟ إجراء آمن وقابل للتكرار." },
  "stab.fixNone": { fr: "Aucune anomalie de données réparable in-app. Les constats restants relèvent d'une correction de code (skill audit-stabilisation-app).", ar: "لا يوجد خلل قابل للإصلاح داخل التطبيق. الباقي يتطلب تصحيح الشيفرة." },
  "stab.about": { fr: "Corrections de DONNÉES (orphelins, société active) appliquées ici via « Corriger ». Les corrections de CODE (moteur de paie, params, types) relèvent du skill Claude Code « audit-stabilisation-app », qui lit les fichiers md de l'app comme référence.", ar: "إصلاحات البيانات تُطبَّق هنا عبر «إصلاح». أما إصلاحات الشيفرة فتتم عبر مهارة «audit-stabilisation-app»." },
  "stab.formulas.title": { fr: "Formules de calcul réelles", ar: "صيغ الحساب الفعلية" },
  "stab.formulas.sub": { fr: "Restituées en exécutant le VRAI moteur de paie sur un exemple chiffré (jamais inventées) — toute évolution des taux (params.ts) s'y reflète automatiquement.", ar: "مستخرجة بتشغيل محرّك الأجور الحقيقي على مثال رقمي (غير مخترعة) — أي تغيير في المعدلات ينعكس هنا تلقائياً." },
  "stab.formulas.hypotheses": { fr: "Hypothèses de l'exemple (entrée du moteur)", ar: "فرضيات المثال (مدخل المحرّك)" },
  "stab.formulas.col.step": { fr: "Étape", ar: "الخطوة" },
  "stab.formulas.col.formula": { fr: "Formule réelle", ar: "الصيغة الفعلية" },
  "stab.formulas.col.result": { fr: "Résultat", ar: "النتيجة" },

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

  // Corps de la page Documents RH — composants partagés et formulaire
  "doc.params": { fr: "Paramètres du document", ar: "إعدادات الوثيقة" },
  "doc.params.contract": { fr: "Paramètres du contrat", ar: "إعدادات العقد" },
  "doc.params.sanction": { fr: "Paramètres de la sanction", ar: "إعدادات العقوبة" },
  "doc.preview": { fr: "Aperçu", ar: "معاينة" },
  "doc.exportPreview": { fr: "Exporter l'aperçu (PDF fidèle)", ar: "تصدير المعاينة (PDF مطابق)" },
  "doc.type": { fr: "Type de document", ar: "نوع الوثيقة" },
  "doc.employee": { fr: "Salarié", ar: "الأجير" },
  "doc.civility": { fr: "Civilité", ar: "صفة المخاطبة" },
  "doc.civility.hint": { fr: "Détermine les accords (employé·e, immatriculé·e). Non précisé → « (e) ».", ar: "تحدد التذكير والتأنيث. غير محدد ← « (e) »." },
  "doc.notSpecified": { fr: "Non précisé", ar: "غير محدد" },
  "doc.mr": { fr: "Monsieur", ar: "السيد" },
  "doc.mrs": { fr: "Madame", ar: "السيدة" },
  "doc.hireDate": { fr: "Date d'embauche", ar: "تاريخ التوظيف" },
  "doc.hint.fromFile": { fr: "Repris du dossier", ar: "مأخوذ من الملف" },
  "doc.hint.fileLabel": { fr: "Dossier", ar: "الملف" },
  "doc.hint.absentToFill": { fr: "Absente du dossier — à saisir", ar: "غير واردة في الملف — تُدخَل يدويًا" },
  "doc.hint.absentPlaceholder": { fr: "Absent du dossier — placeholder si vide", ar: "غير وارد في الملف — يُترك فراغًا إن لم يُملأ" },
  "doc.cnss": { fr: "N° CNSS", ar: "رقم CNSS" },
  "doc.salary": { fr: "Rémunération mensuelle", ar: "الأجر الشهري" },
  "doc.salary.hint": { fr: "Préciser brut ou net (texte libre)", ar: "حدد الأجر الخام أو الصافي (نص حر)" },
  "doc.contractEnd": { fr: "Date de fin de contrat", ar: "تاريخ انتهاء العقد" },
  "doc.issueCity": { fr: "Lieu (Fait à…)", ar: "المكان (حُرِّر بـ…)" },
  "doc.issueDate": { fr: "Date de délivrance", ar: "تاريخ التسليم" },
  "doc.signatory": { fr: "Signataire", ar: "المُوقِّع" },
  "doc.signatory.ph": { fr: "Nom du signataire", ar: "اسم المُوقِّع" },
  "doc.role": { fr: "Qualité", ar: "الصفة" },
  "doc.role.ph": { fr: "Ex. Gérant(e)", ar: "مثال: المسيّر(ة)" },
  // Stage
  "doc.stage.type": { fr: "Type de stage", ar: "نوع التدريب" },
  "doc.stage.type.hint": { fr: "Ex. Stage de fin d'études (PFE), stage d'application, stage d'observation", ar: "مثال: تدريب نهاية الدراسة، تدريب تطبيقي، تدريب ملاحظة" },
  "doc.stage.formation": { fr: "Formation / diplôme préparé", ar: "التكوين / الشهادة المحضَّرة" },
  "doc.stage.start": { fr: "Date de début du stage", ar: "تاريخ بداية التدريب" },
  "doc.stage.duration": { fr: "Durée prévue", ar: "المدة المتوقعة" },
  "doc.stage.status": { fr: "Statut du stage", ar: "حالة التدريب" },
  "doc.stage.ongoing": { fr: "Toujours en cours", ar: "لا يزال جاريًا" },
  "doc.stage.done": { fr: "Achevé (préciser la date de fin)", ar: "منتهٍ (حدد تاريخ الانتهاء)" },
  "doc.stage.end": { fr: "Date de fin du stage", ar: "تاريخ انتهاء التدريب" },
  "doc.stage.missions": { fr: "Missions confiées (optionnel)", ar: "المهام المُسندة (اختياري)" },
  // Cartes transverses
  "doc.missing.title.one": { fr: "champ rendu en pointillé (à compléter à la main)", ar: "حقل مُبيَّن بنقاط (يُكمَّل يدويًا)" },
  "doc.missing.title.many": { fr: "champs rendus en pointillé (à compléter à la main)", ar: "حقول مُبيَّنة بنقاط (تُكمَّل يدويًا)" },
  "doc.missing.note": { fr: "Aucune donnée n'est inventée : les champs absents apparaissent en « …… » sur le document.", ar: "لا تُختلق أي بيانات: الحقول الغائبة تظهر بـ « …… » على الوثيقة." },
  "doc.prefilled.title": { fr: "Données injectées depuis le dossier salarié (réelles)", ar: "بيانات مأخوذة من ملف الأجير (حقيقية)" },
  "doc.legalNote": { fr: "Acte structurant : faire valider par le conseil juridique (agent legal) avant signature. Base légale (art. 14/16/17/33/37/39/62) non modifiable sans validation. Signatures légalisées, deux exemplaires (Art. 18).", ar: "وثيقة مُهيكِلة: يجب عرضها على المستشار القانوني قبل التوقيع. الأساس القانوني (المواد 14/16/17/33/37/39/62) غير قابل للتعديل دون مصادقة. توقيعات مُصادق عليها، في نسختين (المادة 18)." },

  // Page Salariés
  "emp.importOdoo": { fr: "Importer depuis Odoo", ar: "استيراد من أودو" },
  "emp.syncOdoo": { fr: "Synchroniser vers Odoo", ar: "مزامنة نحو أودو" },
  "emp.syncOdoo.hint": { fr: "Pousser vers Odoo les données manquantes (lecture d'abord, sans écraser)", ar: "دفع البيانات الناقصة نحو أودو (قراءة أولًا، دون الكتابة فوقها)" },
  "emp.new": { fr: "Nouveau salarié", ar: "أجير جديد" },
  "emp.edit": { fr: "Fiche salarié", ar: "بطاقة الأجير" },
  "emp.search": { fr: "Rechercher un nom, un matricule…", ar: "ابحث باسم أو رقم تسجيل…" },
  "emp.allSites": { fr: "Tous les sites", ar: "كل المواقع" },
  "emp.allContracts": { fr: "Tous contrats", ar: "كل العقود" },
  "emp.active": { fr: "Actifs", ar: "نشطون" },
  "emp.inactive": { fr: "Inactifs", ar: "غير نشطين" },
  "emp.all": { fr: "Tous", ar: "الكل" },
  "emp.matricule": { fr: "Matricule", ar: "رقم التسجيل" },
  "emp.contract": { fr: "Contrat", ar: "العقد" },
  "emp.site": { fr: "Site", ar: "الموقع" },
  "emp.hourlyRate": { fr: "Taux horaire", ar: "الأجر الساعي" },
  "emp.hire": { fr: "Embauche", ar: "التوظيف" },
  "emp.compliance": { fr: "Conformité", ar: "المطابقة" },
  "emp.empty": { fr: "Aucun salarié ne correspond aux filtres.", ar: "لا يوجد أجير مطابق للمرشحات." },
  "emp.firstName": { fr: "Prénom", ar: "الاسم الشخصي" },
  "emp.lastName": { fr: "Nom", ar: "الاسم العائلي" },
  "emp.position": { fr: "Poste", ar: "المنصب" },
  "emp.cin": { fr: "CIN", ar: "البطاقة الوطنية (CIN)" },
  "emp.cin.hint": { fr: "Manquante = alerte conformité", ar: "غياب = تنبيه مطابقة" },
  "emp.cnss.hint": { fr: "Manquant = alerte critique", ar: "غياب = تنبيه حرج" },
  "emp.contractType": { fr: "Type de contrat", ar: "نوع العقد" },
  "emp.contractEnd": { fr: "Fin de contrat", ar: "نهاية العقد" },
  "emp.cnssExemption": { fr: "Exonération CNSS", ar: "إعفاء من الصندوق الوطني للضمان الاجتماعي" },
  "emp.cnssExemption.hint": { fr: "Dispositif ANAPEC/stage : exclut ce salarié de l'assiette CNSS/AMO/AF/TFP (aligne le calcul et la BDS DAMANCOM).", ar: "آلية أنابيك/تدريب: تستثني هذا الأجير من وعاء اشتراكات CNSS/AMO/AF/TFP." },
  "emp.cnssExemption.none": { fr: "Aucune (droit commun)", ar: "لا يوجد (النظام العادي)" },
  "emp.cnssExemption.patronale": { fr: "Part patronale (TAHFIZ / IDMAJ)", ar: "الحصة المشغّلة (تحفيز / إدماج)" },
  "emp.cnssExemption.totale": { fr: "Totale (stage ANAPEC)", ar: "كلّي (تدريب أنابيك)" },
  "emp.birth": { fr: "Naissance", ar: "تاريخ الازدياد" },
  "emp.baseSalary": { fr: "Salaire mensuel de base (DH)", ar: "الأجر الشهري الأساسي (د.م)" },
  "emp.baseSalary.hint": { fr: "Saisie manuelle — ou choisir un minimum légal ci-dessous", ar: "إدخال يدوي — أو اختر حدًا أدنى قانونيًا أدناه" },
  "emp.hoursMonth": { fr: "Heures / mois", ar: "ساعات / شهر" },
  "emp.hoursMonth.hint": { fr: "Avancé — le salaire mensuel reste constant", ar: "متقدم — يبقى الأجر الشهري ثابتًا" },
  "emp.dependents": { fr: "Personnes à charge", ar: "الأشخاص المعالون" },
  "emp.rib": { fr: "RIB", ar: "رقم الحساب البنكي (RIB)" },
  "emp.phone": { fr: "Téléphone", ar: "الهاتف" },
  "emp.close": { fr: "Fermer", ar: "إغلاق" },
  "emp.exited": { fr: "sorti", ar: "مغادر" },
  "emp.activeCheck": { fr: "Salarié actif", ar: "أجير نشط" },
  "emp.hazardCheck": { fr: "Site dangereux / BTP (contrôle mineur)", ar: "موقع خطر / بناء (مراقبة القاصر)" },
  "emp.hourlyComputed": { fr: "Taux horaire calculé", ar: "الأجر الساعي المحتسب" },
  "emp.delete.confirm1": { fr: "Supprimer", ar: "حذف" },
  "emp.delete.confirm2": { fr: "? Action irréversible.", ar: "؟ إجراء لا رجعة فيه." },
  // Synchronisation Odoo
  "emp.sync.create": { fr: "À créer", ar: "للإنشاء" },
  "emp.sync.update": { fr: "À compléter", ar: "للإكمال" },
  "emp.sync.unchanged": { fr: "Déjà à jour", ar: "مُحدَّث" },
  "emp.sync.conflict": { fr: "Conflits", ar: "تعارضات" },
  "emp.sync.colAction": { fr: "Action", ar: "الإجراء" },
  "emp.sync.colMatch": { fr: "Appariement", ar: "المطابقة" },
  "emp.sync.colPushed": { fr: "Champs poussés", ar: "الحقول المدفوعة" },
  "emp.sync.allUpToDate": { fr: "Tout est déjà à jour dans Odoo — rien à synchroniser.", ar: "كل شيء مُحدَّث في أودو — لا شيء للمزامنة." },

  // Page Paie
  "pay.year": { fr: "Année", ar: "السنة" },
  "pay.month": { fr: "Mois", ar: "الشهر" },
  "pay.exportGroup": { fr: "Export groupé PDF", ar: "تصدير جماعي PDF" },
  "pay.validate": { fr: "Valider la période", ar: "المصادقة على الفترة" },
  "pay.markDeclared": { fr: "Marquer déclarée", ar: "تعليم كمُصرَّح بها" },
  "pay.markPaid": { fr: "Marquer payée", ar: "تعليم كمؤدَّاة" },
  "pay.revert": { fr: "Remettre en brouillon", ar: "إرجاع إلى مسودة" },
  "pay.revert.hint": { fr: "Rouvrir la période : la saisie des bulletins redevient modifiable.", ar: "إعادة فتح الفترة: تصبح إدخالات كشوف الأجور قابلة للتعديل من جديد." },
  "pay.revert.confirm": { fr: "Remettre en brouillon la période", ar: "إرجاع الفترة إلى مسودة" },
  "pay.revert.closureWarn": { fr: "Une écriture comptable validée existe pour cette période : elle reste figée. Remettez-la en brouillon séparément dans Comptabilité si besoin.", ar: "توجد قيود محاسبية مصادق عليها لهذه الفترة: تبقى مجمّدة. أعِد فتحها بشكل منفصل في المحاسبة عند الحاجة." },
  "pay.validate.confirm1": { fr: "Valider et figer la paie de", ar: "المصادقة على أجور شهر" },
  "pay.validate.confirm2": { fr: "? Les montants ne seront plus recalculés.", ar: "وتجميدها؟ لن يُعاد احتساب المبالغ." },
  "pay.kpi.slips": { fr: "Bulletins", ar: "كشوف الأجور" },
  "pay.kpi.gross": { fr: "Masse brute", ar: "الكتلة الأجرية الخام" },
  "pay.kpi.net": { fr: "Total net", ar: "مجموع الصافي" },
  "pay.kpi.cost": { fr: "Coût employeur", ar: "كلفة المشغِّل" },
  "pay.slipsOf": { fr: "Bulletins de", ar: "كشوف أجور" },
  "pay.frozen": { fr: "figés", ar: "مُجمَّدة" },
  "pay.col.base": { fr: "Base", ar: "الأساس" },
  "pay.col.gross": { fr: "Brut", ar: "الخام" },
  "pay.col.net": { fr: "Net à payer", ar: "الصافي المستحق" },
  "pay.col.slip": { fr: "Bulletin", ar: "الكشف" },
  "pay.printable": { fr: "HTML imprimable", ar: "HTML قابل للطباعة" },
  "pay.variableInput": { fr: "Saisie variable", ar: "إدخال المتغيرات" },
  "pay.totals": { fr: "Totaux", ar: "المجاميع" },
  "pay.cnssContrib": { fr: "Cotisations CNSS", ar: "اشتراكات CNSS" },
  // Modale de saisie variable
  "pay.input.title": { fr: "Saisie", ar: "إدخال" },
  "pay.rate": { fr: "taux", ar: "التعرفة" },
  "pay.f.days": { fr: "Jours travaillés", ar: "أيام العمل" },
  "pay.f.hours": { fr: "Heures normales", ar: "الساعات العادية" },
  "pay.f.ot25": { fr: "HS +25 % (h)", ar: "س. إضافية +25 % (س)" },
  "pay.f.ot50": { fr: "HS +50 % (h)", ar: "س. إضافية +50 % (س)" },
  "pay.f.ot100": { fr: "HS +100 % (h)", ar: "س. إضافية +100 % (س)" },
  "pay.f.panier": { fr: "Panier (DH)", ar: "بدل التغذية (د.م)" },
  "pay.f.transport": { fr: "Transport (DH)", ar: "بدل النقل (د.م)" },
  "pay.f.salissure": { fr: "Salissure (DH)", ar: "بدل الاتساخ (د.م)" },
  "pay.f.other": { fr: "Autres gains (DH)", ar: "مكاسب أخرى (د.م)" },
  "pay.f.transportOutside": { fr: "Transport hors périmètre urbain (plafond 750)", ar: "نقل خارج المحيط الحضري (سقف 750)" },
  "pay.l.gross": { fr: "Salaire brut", ar: "الأجر الخام" },
  "pay.l.sbi": { fr: "SBI (imposable)", ar: "الأجر الخام الخاضع للضريبة" },
  "pay.l.seniority": { fr: "Prime ancienneté", ar: "منحة الأقدمية" },
  "pay.l.cnssAmo": { fr: "CNSS + AMO", ar: "CNSS + AMO" },
  "pay.l.fraisPro": { fr: "Abattement frais pro", ar: "خصم المصاريف المهنية" },
  "pay.l.sni": { fr: "SNI (net imposable)", ar: "الأجر الصافي الخاضع للضريبة" },
  "pay.apply": { fr: "Appliquer", ar: "تطبيق" },

  // Page Congés
  "lv.kpi.paidTaken": { fr: "Congés payés pris", ar: "الإجازات المؤدى عنها المأخوذة" },
  "lv.kpi.paidTaken.sub": { fr: "Cumul de l'exercice", ar: "المجموع خلال السنة" },
  "lv.kpi.sick": { fr: "Absences maladie", ar: "غيابات المرض" },
  "lv.kpi.sick.sub": { fr: "Nombre d'épisodes", ar: "عدد الحالات" },
  "lv.kpi.inProgress": { fr: "Absences en cours", ar: "غيابات جارية" },
  "lv.kpi.inProgress.sub": { fr: "À la date du jour", ar: "إلى حدود اليوم" },
  "lv.journal": { fr: "Journal des absences", ar: "سجل الغيابات" },
  "lv.noLeave": { fr: "Aucune absence enregistrée.", ar: "لا غياب مسجَّل." },
  "lv.col.type": { fr: "Type", ar: "النوع" },
  "lv.col.from": { fr: "Du", ar: "من" },
  "lv.col.to": { fr: "Au", ar: "إلى" },
  "lv.col.days": { fr: "Jours", ar: "الأيام" },
  "lv.balances": { fr: "Soldes de congés payés", ar: "أرصدة الإجازات المؤدى عنها" },
  "lv.col.acquired": { fr: "Acquis (j)", ar: "المكتسب (يوم)" },
  "lv.col.taken": { fr: "Pris (j)", ar: "المأخوذ (يوم)" },
  "lv.col.balance": { fr: "Solde (j)", ar: "الرصيد (يوم)" },
  "lv.acquisitionNote": { fr: "Acquisition de 1,5 jour ouvrable par mois de service — 2 jours/mois pour les salariés de moins de 18 ans (art. 231), majoration d'ancienneté incluse : +1,5 jour par tranche entière de 5 ans de service, plafonnée à 30 jours au total (art. 232).", ar: "اكتساب 1,5 يوم عمل عن كل شهر خدمة — يومان/شهر للأجراء دون 18 سنة (المادة 231)، مع زيادة الأقدمية: +1,5 يوم عن كل خمس سنوات خدمة كاملة، في حدود 30 يومًا إجمالًا (المادة 232)." },
  "lv.maternity.title": { fr: "Congé de maternité :", ar: "إجازة الأمومة:" },
  "lv.maternity.body": { fr: "14 semaines indemnisées par la CNSS (dont 7 après l'accouchement), sous réserve des conditions d'ouverture des droits.", ar: "14 أسبوعًا يعوّض عنها الصندوق الوطني للضمان الاجتماعي (منها 7 بعد الوضع)، رهنًا بشروط استحقاق الحقوق." },
  "leave.conge_paye": { fr: "Congé payé", ar: "إجازة مؤدى عنها" },
  "leave.maladie": { fr: "Maladie", ar: "مرض" },
  "leave.AT": { fr: "Accident du travail", ar: "حادثة شغل" },
  "leave.absence_injustifiee": { fr: "Absence injustifiée", ar: "غياب غير مبرر" },
  "leave.maternite": { fr: "Maternité", ar: "أمومة" },

  // Page Paramètres — titres de section
  "set.firm.title": { fr: "Société active", ar: "الشركة النشطة" },
  "set.regul.title": { fr: "Paramètres réglementaires (année en cours)", ar: "المعايير التنظيمية (السنة الجارية)" },
  "set.latex.title": { fr: "Template LaTeX du bulletin", ar: "قالب LaTeX لكشف الأجر" },
  "set.roles.title": { fr: "Rôles & permissions (référentiel)", ar: "الأدوار والصلاحيات (مرجع)" },
  "set.danger.title": { fr: "Zone sensible", ar: "منطقة حساسة" },
  "set.users.title": { fr: "Utilisateurs & accès", ar: "المستخدمون والولوج" },
  "set.firms.title": { fr: "Sociétés", ar: "الشركات" },
  "set.odoo.title": { fr: "Connexion Odoo (import des salariés)", ar: "الاتصال بأودو (استيراد الأجراء)" },
  "set.cloud.title": { fr: "Persistance cloud (Supabase)", ar: "الحفظ السحابي (Supabase)" },
  // Tableau réglementaire
  "set.regul.year": { fr: "Année de référence", ar: "السنة المرجعية" },
  "set.regul.col.param": { fr: "Paramètre", ar: "المعيار" },
  "set.regul.col.value": { fr: "Valeur", ar: "القيمة" },
  "set.regul.smig": { fr: "SMIG horaire", ar: "الحد الأدنى للأجر في الساعة" },
  "set.regul.base": { fr: "Base mensuelle légale", ar: "الأساس الشهري القانوني" },
  "set.regul.cnssEmp": { fr: "CNSS salariale (plafond", ar: "CNSS الأجير (سقف" },
  "set.regul.amoEmp": { fr: "AMO salariale (déplafonnée)", ar: "AMO الأجير (بدون سقف)" },
  "set.regul.cnssPat": { fr: "CNSS patronale", ar: "CNSS المشغِّل" },
  "set.regul.af": { fr: "Allocations familiales (patronal)", ar: "التعويضات العائلية (المشغِّل)" },
  "set.regul.amoPat": { fr: "AMO patronale", ar: "AMO المشغِّل" },
  "set.regul.tfp": { fr: "TFP (taxe formation professionnelle)", ar: "TFP (رسم التكوين المهني)" },
  "set.regul.fraisPro": { fr: "Frais professionnels (plafond annuel", ar: "المصاريف المهنية (سقف سنوي" },
  "set.regul.family": { fr: "Charges de famille (max", ar: "التكاليف العائلية (بحد أقصى" },
  "set.regul.persons": { fr: "personnes)", ar: "أشخاص)" },
  "set.regul.perPerson": { fr: "/ pers.", ar: "/ شخص" },
  "set.regul.note1": { fr: "Toute loi de finances future se traduit par une nouvelle entrée", ar: "كل قانون مالية مقبل يُترجَم بإدخال جديد في" },
  "set.regul.note2": { fr: ", jamais par un taux codé en dur.", ar: "، وليس بتعديل نسبة مضمَّنة في الشيفرة." },
  // Zone sensible
  "set.reset.note": { fr: "Restaure le jeu de démonstration d'origine. Toutes les modifications locales (sociétés, salariés, bulletins, absences) seront perdues.", ar: "يُعيد مجموعة العرض الأصلية. ستُفقد كل التعديلات المحلية (الشركات، الأجراء، كشوف الأجور، الغيابات)." },
  "set.reset.btn": { fr: "Réinitialiser les données de démonstration", ar: "إعادة تعيين بيانات العرض" },

  // Carte « Société active » — champs
  "set.firm.raison": { fr: "Raison sociale", ar: "التسمية التجارية" },
  "set.firm.legalForm": { fr: "Forme juridique", ar: "الشكل القانوني" },
  "set.firm.legalForm.hint": { fr: "SARL, SARL AU, SA, personne physique…", ar: "ش.م.م، ش.م.م بشريك وحيد، ش.م، شخص ذاتي…" },
  "set.firm.capital": { fr: "Capital social (DH)", ar: "رأس المال الاجتماعي (د.م)" },
  "set.firm.capital.hint": { fr: "Sociétés de capitaux — laisser vide pour une personne physique", ar: "لشركات الأموال — يُترك فارغًا للشخص الذاتي" },
  "set.firm.regime": { fr: "Régime", ar: "النظام" },
  "set.firm.ice.hint": { fr: "Identifiant Commun de l'Entreprise (15 chiffres)", ar: "المُعرِّف الموحَّد للمقاولة (15 رقمًا)" },
  "set.firm.if": { fr: "Identifiant fiscal (IF)", ar: "المُعرِّف الجبائي (IF)" },
  "set.firm.patente": { fr: "N° Patente (Taxe professionnelle)", ar: "رقم الضريبة المهنية" },
  "set.firm.rc": { fr: "RC (numéro)", ar: "السجل التجاري (رقم)" },
  "set.firm.rcCity": { fr: "Ville du RC (tribunal de commerce)", ar: "مدينة السجل التجاري (المحكمة التجارية)" },
  "set.firm.cnss": { fr: "Affiliation CNSS", ar: "الانخراط في CNSS" },
  "set.firm.email": { fr: "E-mail", ar: "البريد الإلكتروني" },
  "set.firm.city": { fr: "Ville", ar: "المدينة" },
  "set.firm.address": { fr: "Adresse du siège social", ar: "عنوان المقر الاجتماعي" },
  "set.firm.signatory": { fr: "Signataire par défaut", ar: "المُوقِّع الافتراضي" },
  "set.firm.signatory.hint": { fr: "Représentant légal — repris sur les documents RH", ar: "الممثل القانوني — يُدرَج في وثائق الموارد البشرية" },
  "set.firm.signatoryRole": { fr: "Qualité du signataire", ar: "صفة المُوقِّع" },
  "set.firm.signatoryRole.hint": { fr: "Ex. Gérant(e), Directeur", ar: "مثال: المسيّر(ة)، المدير" },
  "set.firm.odooId": { fr: "ID société Odoo (company_id)", ar: "معرِّف الشركة في أودو (company_id)" },
  "set.firm.odooId.hint": { fr: "Pour l'import des salariés depuis Odoo", ar: "لاستيراد الأجراء من أودو" },
  "set.firm.changeLogo": { fr: "Changer le logo", ar: "تغيير الشعار" },
  "set.brand.title": { fr: "Couleur de marque (bulletins)", ar: "لون العلامة (كشوف الأجور)" },
  "set.brand.hint": { fr: "Spectre unique dérivé du logo — variantes harmonieuses appliquées aux bulletins de paie de cette société.", ar: "طيف لوني فريد مشتق من الشعار — تدرّجات متناسقة تُطبَّق على كشوف أجور هذه الشركة." },
  "set.brand.extract": { fr: "Extraire du logo", ar: "استخراج من الشعار" },
  "set.brand.reset": { fr: "Vert Miya par défaut", ar: "الأخضر الافتراضي (ميّا)" },
  "set.brand.preview": { fr: "Aperçu du spectre", ar: "معاينة الطيف" },
  "set.brand.noColor": { fr: "Aucune couleur dominante détectée dans le logo.", ar: "لم يُكتشف أي لون سائد في الشعار." },
  "set.firm.resetLogo": { fr: "Rétablir le logo Miya par défaut", ar: "استعادة شعار ميّا الافتراضي" },
  "set.firm.logoNote": { fr: "Le logo apparaît en en-tête des bulletins de paie. PNG/JPG/SVG, max 1,5 Mo.", ar: "يظهر الشعار في ترويسة كشوف الأجور. PNG/JPG/SVG، بحد أقصى 1,5 م." },
  // Rôles & Utilisateurs
  "set.roles.col.role": { fr: "Rôle", ar: "الدور" },
  "set.roles.col.label": { fr: "Libellé", ar: "التسمية" },
  "set.roles.col.desc": { fr: "Description", ar: "الوصف" },
  "set.users.col.login": { fr: "Identifiant", ar: "المُعرِّف" },
  "set.users.col.name": { fr: "Nom", ar: "الاسم" },
  "set.users.col.firm": { fr: "Société", ar: "الشركة" },
  "set.users.col.state": { fr: "État", ar: "الحالة" },
  "set.users.login": { fr: "Identifiant (login / e-mail)", ar: "المُعرِّف (اسم الدخول / البريد)" },
  "set.users.fullName": { fr: "Nom complet", ar: "الاسم الكامل" },
  "set.users.firm": { fr: "Société de rattachement", ar: "شركة الانتماء" },
  "set.users.firm.hint": { fr: "« Toutes » pour un accès multi-sociétés.", ar: "« الكل » للولوج متعدد الشركات." },
  "set.users.allFirms": { fr: "Toutes les sociétés", ar: "كل الشركات" },
  "set.users.password": { fr: "Mot de passe", ar: "كلمة المرور" },
  "set.users.password.hint": { fr: "6 caractères minimum — stocké en empreinte SHA-256 uniquement.", ar: "6 أحرف على الأقل — تُخزَّن كبصمة SHA-256 فقط." },
  "set.users.new": { fr: "Nouvel utilisateur", ar: "مستخدم جديد" },
  "set.users.resetPw": { fr: "Réinitialiser le mot de passe", ar: "إعادة تعيين كلمة المرور" },
  // Sociétés (création)
  "set.firms.create": { fr: "Nouvelle société", ar: "شركة جديدة" },
  "set.firms.createBtn": { fr: "Créer", ar: "إنشاء" },
  "set.firms.deleteTitle": { fr: "Supprimer la société et ses salariés", ar: "حذف الشركة وأجرائها" },
  // Odoo
  "set.odoo.url": { fr: "URL Odoo", ar: "عنوان أودو" },
  "set.odoo.db": { fr: "Base de données (db)", ar: "قاعدة البيانات (db)" },
  "set.odoo.login": { fr: "Identifiant (login)", ar: "المُعرِّف (الدخول)" },
  "set.odoo.login.hint": { fr: "Votre e-mail de connexion Odoo.", ar: "بريدك الإلكتروني للاتصال بأودو." },
  "set.odoo.apiKey": { fr: "Clé API / mot de passe", ar: "مفتاح API / كلمة المرور" },
  // Cloud
  "set.cloud.url": { fr: "URL du projet Supabase", ar: "عنوان مشروع Supabase" },
  "set.cloud.anon": { fr: "Clé anon (public)", ar: "المفتاح العام (anon)" },
  "set.cloud.anon.hint": { fr: "Clé publique — protégée par la RLS. Stockée dans ce navigateur.", ar: "مفتاح عمومي — محمي بواسطة RLS. يُخزَّن في هذا المتصفح." },
  "set.cloud.activate": { fr: "Activer la synchronisation", ar: "تفعيل المزامنة" },
  "set.cloud.disable": { fr: "Désactiver", ar: "تعطيل" },

  // Page Déclarations
  "decl.cnss.title": { fr: "Bordereau CNSS mensuel —", ar: "كشف CNSS الشهري —" },
  "decl.col.plafonne": { fr: "Plafonné (6 000)", ar: "المسقوف (6 000)" },
  "decl.col.cnssSal": { fr: "CNSS sal. 4,48 %", ar: "CNSS الأجير 4,48 %" },
  "decl.col.cnssPat": { fr: "CNSS patr. 8,98 %", ar: "CNSS المشغِّل 8,98 %" },
  "decl.col.amoSal": { fr: "AMO sal.", ar: "AMO الأجير" },
  "decl.notReg": { fr: "Non immatriculé", ar: "غير مسجَّل" },
  "decl.total": { fr: "Total", ar: "المجموع" },
  "decl.kpi.masse": { fr: "Masse salariale", ar: "الكتلة الأجرية" },
  "decl.kpi.massePlaf": { fr: "Masse plafonnée", ar: "الكتلة المسقوفة" },
  "decl.kpi.cnss": { fr: "Cotisations CNSS (sal.+patr.)", ar: "اشتراكات CNSS (أجير+مشغِّل)" },
  "decl.kpi.headcount": { fr: "Effectif déclaré", ar: "العدد المصرَّح به" },
  "decl.export": { fr: "Exporter bordereau (PDF)", ar: "تصدير الكشف (PDF)" },
  "decl.bds": { fr: "Générer fichier DAMANCOM (BDS)", ar: "توليد ملف داماك (BDS)" },
  "decl.damancomNote": { fr: "Le dépôt DAMANCOM reste manuel (API non publique) : le fichier BDS généré doit être téléversé sur le portail CNSS.", ar: "يبقى إيداع داماك يدويًا (واجهة غير عمومية): يجب رفع ملف BDS المُولَّد على بوابة CNSS." },
  "decl.9421.title": { fr: "État 9421 / IR annuel", ar: "البيان 9421 / الضريبة على الدخل السنوية" },
  "decl.col.irMonth": { fr: "IR mensuel", ar: "الضريبة الشهرية" },
  "decl.col.irYear": { fr: "IR annuel estimé (× 12)", ar: "الضريبة السنوية المقدَّرة (×12)" },
  "decl.col.netMonth": { fr: "Net mensuel", ar: "الصافي الشهري" },
  "decl.9421.note": { fr: "Récapitulatif annuel des rémunérations (estimation par extrapolation du mois courant).", ar: "ملخص سنوي للأجور (تقدير بالاستقراء من الشهر الجاري)." },
  "decl.deadlines.title": { fr: "Échéances", ar: "الآجال" },
  "decl.deadline.badge": { fr: "À déposer avant le 10", ar: "للإيداع قبل 10" },
  "decl.deadline.body1": { fr: "Bordereau CNSS de", ar: "كشف CNSS لشهر" },
  "decl.deadline.body2": { fr: "à déposer avant le 10 du mois suivant.", ar: "يُودَع قبل 10 من الشهر الموالي." },

  // Page Conformité
  "cmp.kpi.critical": { fr: "Alertes critiques", ar: "التنبيهات الحرجة" },
  "cmp.kpi.warnings": { fr: "Avertissements", ar: "التنبيهات" },
  "cmp.kpi.total": { fr: "Total alertes", ar: "مجموع التنبيهات" },
  "cmp.alerts.title": { fr: "Alertes de conformité", ar: "تنبيهات المطابقة" },
  "cmp.col.severity": { fr: "Sévérité", ar: "الخطورة" },
  "cmp.col.message": { fr: "Message", ar: "الرسالة" },
  "cmp.noAlert": { fr: "Aucune alerte, dossier conforme.", ar: "لا تنبيه، الملف مطابق." },
  "sev.critical": { fr: "Critique", ar: "حرج" },
  "sev.warning": { fr: "Avertissement", ar: "تنبيه" },
  "sev.info": { fr: "Info", ar: "معلومة" },
  "ctype.cnss_missing": { fr: "Immatriculation CNSS", ar: "التسجيل في CNSS" },
  "ctype.cin_missing": { fr: "Pièce d'identité", ar: "بطاقة الهوية" },
  "ctype.minor_hazardous": { fr: "Travail des mineurs", ar: "تشغيل القاصرين" },
  "ctype.cdd_expiring": { fr: "Échéance CDD", ar: "أجل العقد المحدد المدة" },
  "ctype.contract_missing": { fr: "Contrat manquant", ar: "عقد ناقص" },
  "cmp.at.title": { fr: "Registre des accidents du travail (loi 18-12)", ar: "سجل حوادث الشغل (القانون 18-12)" },
  "cmp.at.delay48": { fr: "Délai 48 heures", ar: "أجل 48 ساعة" },
  "cmp.at.delay48.body": { fr: "Information de l'employeur par la victime (ou ses ayants droit).", ar: "إخبار المشغِّل من طرف الضحية (أو ذوي حقوقها)." },
  "cmp.at.delay5": { fr: "Délai 5 jours ouvrables", ar: "أجل 5 أيام عمل" },
  "cmp.at.delay5.body": { fr: "Déclaration de l'employeur à l'assureur (et à l'inspection du travail).", ar: "تصريح المشغِّل لدى المؤمِّن (وكذا مفتشية الشغل)." },
  "cmp.at.col.date": { fr: "Date accident", ar: "تاريخ الحادثة" },
  "cmp.at.col.info48": { fr: "Information employeur (48 h)", ar: "إخبار المشغِّل (48 س)" },
  "cmp.at.col.decl5": { fr: "Déclaration assureur (5 j)", ar: "تصريح المؤمِّن (5 أيام)" },
  "cmp.at.col.insurer": { fr: "Assureur / Police", ar: "المؤمِّن / رقم البوليصة" },
  "cmp.col.status": { fr: "Statut", ar: "الحالة" },
  "cmp.at.none": { fr: "Aucun AT déclaré", ar: "لا حادثة شغل مصرَّح بها" },
  "cmp.cdd.title": { fr: "Contrats CDD arrivant à échéance", ar: "العقود المحددة المدة القاربة على الانتهاء" },
  "cmp.cdd.none": { fr: "Aucun CDD avec échéance renseignée.", ar: "لا عقد محدد المدة بأجل مُدخَل." },
  "cmp.cdd.col.end": { fr: "Fin de contrat", ar: "نهاية العقد" },
  "cmp.cdd.col.daysLeft": { fr: "Jours restants", ar: "الأيام المتبقية" },
  "cmp.cdd.inProgress": { fr: "En cours", ar: "جارٍ" },
  "cmp.kpi.critical.sub": { fr: "Action immédiate requise", ar: "إجراء فوري مطلوب" },
  "cmp.kpi.warnings.sub": { fr: "À traiter sous 30 jours", ar: "للمعالجة خلال 30 يومًا" },
  "cmp.kpi.info.sub": { fr: "information(s)", ar: "معلومة/معلومات" },
  "cmp.at.note": { fr: "Alerte automatique si le délai de 5 jours de déclaration à l'assureur approche.", ar: "تنبيه تلقائي عند اقتراب أجل 5 أيام للتصريح لدى المؤمِّن." },
  "cmp.cdd.expired": { fr: "Expiré", ar: "منتهٍ" },
  "cmp.cdd.soon": { fr: "Échéance proche", ar: "أجل قريب" },

  // Page Accidents du travail
  "acc.sev.benin": { fr: "Bénin", ar: "طفيف" },
  "acc.sev.avec_arret": { fr: "Avec arrêt", ar: "بتوقف" },
  "acc.sev.grave": { fr: "Grave", ar: "خطير" },
  "acc.sev.mortel": { fr: "Mortel", ar: "مميت" },
  "acc.new": { fr: "Enregistrer un accident", ar: "تسجيل حادثة" },
  "acc.kpi.total": { fr: "Accidents enregistrés", ar: "الحوادث المسجَّلة" },
  "acc.kpi.total.sub": { fr: "Société courante", ar: "الشركة الحالية" },
  "acc.kpi.stop": { fr: "Avec arrêt de travail", ar: "بتوقف عن الشغل" },
  "acc.kpi.stop.sub": { fr: "Dossiers CNSS / assureur", ar: "ملفات CNSS / المؤمِّن" },
  "acc.kpi.days": { fr: "Jours d'arrêt cumulés", ar: "أيام التوقف المتراكمة" },
  "acc.kpi.days.sub": { fr: "Somme des arrêts", ar: "مجموع فترات التوقف" },
  "acc.kpi.notDeclared": { fr: "Non déclarés", ar: "غير مصرَّح بها" },
  "acc.kpi.notDeclared.sub": { fr: "À déclarer (5 jours)", ar: "للتصريح (5 أيام)" },
  "acc.empty": { fr: "Aucun accident enregistré pour cette société.", ar: "لا حادثة مسجَّلة لهذه الشركة." },
  "acc.col.date": { fr: "Date", ar: "التاريخ" },
  "acc.col.victim": { fr: "Victime", ar: "الضحية" },
  "acc.col.severity": { fr: "Gravité", ar: "الخطورة" },
  "acc.col.stop": { fr: "Arrêt", ar: "التوقف" },
  "acc.col.declared": { fr: "Déclaré", ar: "مصرَّح" },
  "acc.col.actions": { fr: "Actions", ar: "الإجراءات" },
  "acc.notDeclared": { fr: "Non déclaré", ar: "غير مصرَّح" },
  "acc.form.title": { fr: "Accident du travail", ar: "حادثة شغل" },
  "acc.f.victim": { fr: "Victime (salarié)", ar: "الضحية (الأجير)" },
  "acc.f.date": { fr: "Date de l'accident", ar: "تاريخ الحادثة" },
  "acc.f.time": { fr: "Heure", ar: "الساعة" },
  "acc.f.place": { fr: "Lieu / poste de travail", ar: "المكان / منصب الشغل" },
  "acc.f.circumstances": { fr: "Circonstances détaillées", ar: "الملابسات المفصَّلة" },
  "acc.f.injuryNature": { fr: "Nature des lésions", ar: "طبيعة الإصابات" },
  "acc.f.injurySite": { fr: "Siège des lésions", ar: "موضع الإصابات" },
  "acc.f.witnesses": { fr: "Témoins", ar: "الشهود" },
  "acc.f.status": { fr: "Statut du dossier", ar: "حالة الملف" },
  "acc.f.open": { fr: "Ouvert", ar: "مفتوح" },
  "acc.f.closed": { fr: "Clos", ar: "مغلق" },
  "acc.f.stopDays": { fr: "Nombre de jours d'arrêt", ar: "عدد أيام التوقف" },
  "acc.f.declDate": { fr: "Date de déclaration", ar: "تاريخ التصريح" },
  "acc.f.declRef": { fr: "Référence déclaration", ar: "مرجع التصريح" },
  "acc.f.notes": { fr: "Notes", ar: "ملاحظات" },
  "acc.f.stopCheck": { fr: "Arrêt de travail", ar: "توقف عن الشغل" },
  "acc.f.declCheck": { fr: "Déclaré à l'assureur / CNSS", ar: "مصرَّح لدى المؤمِّن / CNSS" },
  "acc.noEmp": { fr: "Aucun salarié dans cette société : ajoutez d'abord un salarié pour enregistrer un accident.", ar: "لا يوجد أجير في هذه الشركة: أضف أجيرًا أولًا لتسجيل حادثة." },
  "acc.note": { fr: "Rappel : l'employeur doit déclarer tout accident du travail à l'assureur / la CNSS dans les 5 jours ouvrables (Loi 18-12). Ce registre consigne les faits ; il ne calcule pas les indemnités.", ar: "تذكير: يجب على المشغِّل التصريح بكل حادثة شغل لدى المؤمِّن / CNSS داخل 5 أيام عمل (القانون 18-12). هذا السجل يوثِّق الوقائع؛ ولا يحتسب التعويضات." },
  "acc.deleteConfirm": { fr: "Supprimer cette fiche d'accident du registre ?", ar: "حذف بطاقة الحادثة من السجل؟" },

  // Page Sécurité / Audit RIB
  "sec.class.NON_AUTORISE": { fr: "Non autorisé", ar: "غير مأذون" },
  "sec.class.A_VERIFIER": { fr: "À vérifier", ar: "للتحقق" },
  "sec.class.NOUVEAU": { fr: "Nouveau", ar: "جديد" },
  "sec.class.SUPPRIME": { fr: "Supprimé", ar: "محذوف" },
  "sec.class.AUTORISE": { fr: "Autorisé", ar: "مأذون" },
  "sec.admin.title": { fr: "Accès réservé à l'administrateur.", ar: "ولوج محصور على المدير." },
  "sec.admin.body1": { fr: "Votre rôle actuel", ar: "دوركم الحالي" },
  "sec.admin.body2": { fr: "n'autorise pas la consultation du rapport de sécurité. Demandez un accès administrateur (Paramètres → Équipe & rôles).", ar: "لا يسمح بالاطلاع على تقرير الأمن. اطلبوا ولوجًا كمدير (الإعدادات ← الفريق والأدوار)." },
  "sec.establishBaseline": { fr: "Établir la base de référence", ar: "إنشاء قاعدة المرجع" },
  "sec.scan": { fr: "Analyser les modifications", ar: "تحليل التعديلات" },
  "sec.banner": { fr: "Finalité : prévention de la fraude au virement et contrôle interne. Traçage des données (RIB), attribution par le compte Odoo authentifié — aucune surveillance de personne. RIB masqués, accès restreint. Traitement à inscrire au registre CNDP (DPO : Ahmed Belkora). Conservation recommandée : 3 ans.", ar: "الغاية: الوقاية من الاحتيال في التحويل والمراقبة الداخلية. تتبُّع البيانات (RIB)، والإسناد عبر حساب أودو الموثَّق — دون أي مراقبة للأشخاص. أرقام حساب مقنَّعة، وولوج محدود. تُسجَّل المعالجة في سجل CNDP (المسؤول: أحمد بلكورة). المدة الموصى بها للحفظ: 3 سنوات." },
  "sec.critical1": { fr: "alerte(s) critique(s) — RIB modifié par un acteur non habilité.", ar: "تنبيه(ات) حرجة — RIB عُدِّل من طرف فاعل غير مؤهَّل." },
  "sec.noCritical": { fr: "Aucune modification critique détectée sur ce périmètre.", ar: "لم تُرصد أي تعديلات حرجة في هذا النطاق." },
  "sec.eventsCount1": { fr: "événement(s) · base de référence :", ar: "حدث/أحداث · قاعدة المرجع:" },
  "sec.eventsCount2": { fr: "RIB", ar: "RIB" },
  "sec.filter.all": { fr: "Tous les classements", ar: "كل التصنيفات" },
  "sec.col.partner": { fr: "Partenaire", ar: "الشريك" },
  "sec.col.rib": { fr: "RIB (masqué)", ar: "RIB (مقنَّع)" },
  "sec.col.actor": { fr: "Acteur", ar: "الفاعل" },
  "sec.col.class": { fr: "Classement", ar: "التصنيف" },
  "sec.empty": { fr: "Aucun événement. Cliquez sur « Établir la base de référence » puis « Analyser les modifications ».", ar: "لا حدث. انقر « إنشاء قاعدة المرجع » ثم « تحليل التعديلات »." },

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
