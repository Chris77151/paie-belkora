/**
 * Kit mineurs RH — sous-volet du skill « documents-rh-conformes », porté au navigateur.
 *
 * Emploi d'un salarié mineur (15-18 ans) sur poste NON dangereux (Loi 65-99, art. 143 & s.,
 * 172, 179-181, 290) :
 *   1. Autorisation du représentant légal   (art. 143 & s. — annexée au contrat)
 *   2. Contrat pour accomplir un travail déterminé — mineur (art. 16/33 + protections)
 *
 * BILINGUE : chaque document est fourni en FR et en AR (arabe RTL). Le PDF (jsPDF) ne gère
 * que le FR ; l'AR est rendu en HTML (RTL) — « Imprimer / Enregistrer en PDF » du navigateur
 * produit un PDF arabe correct. Contenu calqué EXACTEMENT sur les .tex MBD. ZÉRO INVENTION :
 * identité du mineur, dates, CIN restent en pointillé, jamais fabriqués.
 */
import type { Firm } from "@/data/types";
import {
  legalFileName,
  PH,
  renderLegalHtml,
  renderLegalPdf,
  val,
  valDate,
  type LegalBlock,
  type LegalDoc,
  type LegalDocAr,
} from "./rh-legal";

export type MineurType = "autorisation" | "contrat";
export type MineurLang = "fr" | "ar";

export const MINEUR_TYPES: { value: MineurType; label: string; hint: string; article: string }[] = [
  { value: "autorisation", label: "Autorisation du représentant légal", hint: "Emploi d'un mineur — annexée au contrat", article: "Art. 143 & s." },
  { value: "contrat", label: "Contrat de travail — mineur", hint: "Travail déterminé, poste non dangereux", article: "Art. 16/33/179-181" },
];

export const MINEUR_TITLE: Record<MineurType, string> = {
  autorisation: "AUTORISATION DU REPRÉSENTANT LÉGAL",
  contrat: "CONTRAT POUR ACCOMPLIR UN TRAVAIL DÉTERMINÉ — MINEUR",
};
const MINEUR_TITLE_AR: Record<MineurType, string> = {
  autorisation: "إذن النائب الشرعي",
  contrat: "عقد عمل لإنجاز شغل معيّن — قاصر",
};

export interface RhMineurView {
  firm: Firm;
  type: MineurType;
  issueDate: string;
  issueCity?: string;
  signatoryName?: string;
  signatoryRole?: string;
}

/* ------------------------------------------------------------------ identité employeur ------------------------------------------------------------------ */
function firmIdentFr(f: Firm): string {
  return [
    f.name.toUpperCase(),
    "société à responsabilité limitée",
    f.rc && `immatriculée au Registre du Commerce sous le n° ${f.rc}`,
    f.if_fiscal && `IF n° ${f.if_fiscal}`,
    f.cnss_affiliation && `CNSS n° ${f.cnss_affiliation}`,
    f.ice && `ICE ${f.ice}`,
    f.address && `dont le siège est sis à ${f.address}`,
  ].filter(Boolean).join(", ");
}
function firmIdentAr(f: Firm): string {
  return [
    `شركة ${f.name}`,
    "شركة ذات مسؤولية محدودة",
    f.rc && `المسجّلة بالسجل التجاري تحت رقم ${f.rc}`,
    f.if_fiscal && `رقم التعريف الجبائي ${f.if_fiscal}`,
    f.cnss_affiliation && `رقم التسجيل بالضمان الاجتماعي ${f.cnss_affiliation}`,
    f.ice && `المعرّف الموحّد ${f.ice}`,
    f.address && `ومقرها بـ${f.address}`,
  ].filter(Boolean).join("، ");
}

/* ------------------------------------------------------------------ AUTORISATION ------------------------------------------------------------------ */
function autorisationFr(v: RhMineurView): LegalBlock[] {
  return [
    { k: "h", t: "Le représentant légal" },
    { k: "p", t: `Je soussigné(e) ${PH}` },
    { k: "p", t: `Agissant en qualité de : ${PH} (père / mère / tuteur légal « wali »)` },
    { k: "p", t: `CIN n° : ${PH}    Demeurant à : ${PH}` },
    { k: "p", t: `Justificatif du lien : ${PH} (livret de famille / acte de tutelle)` },
    { k: "h", t: "Le mineur concerné" },
    { k: "p", t: `Prénom et NOM : ${PH}` },
    { k: "p", t: `Né(e) le : ${PH} (âge : ${PH})    à : ${PH}` },
    { k: "center", t: "DÉCLARE ET AUTORISE CE QUI SUIT :", strong: true },
    { k: "p", t: `1. J'autorise expressément le mineur susnommé, placé sous ma responsabilité, à conclure un contrat de travail et à être employé par la société ${firmIdentFr(v.firm)}, ci-après « l'Employeur ».` },
    { k: "p", t: `2. Cet emploi est autorisé exclusivement pour un poste non dangereux adapté à son âge : ${PH} (tâches légères d'aménagement paysager de plain-pied). Je reconnais avoir été informé(e) que le mineur ne doit en aucun cas être affecté à la conduite d'engins ou de machines, au travail en hauteur, au port de charges lourdes ni à la manipulation de produits (articles 179 à 181 du Code du travail).` },
    { k: "p", t: "3. Je reconnais avoir été informé(e) des horaires de travail (de jour uniquement), de la nature des tâches et des conditions de sécurité, et j'autorise la visite médicale d'embauche préalable à la prise de poste." },
    { k: "p", t: "4. Je m'engage à informer sans délai l'Employeur de tout élément (état de santé, scolarité, ou autre) susceptible d'affecter cet emploi." },
    { k: "p", t: "5. La présente autorisation est annexée au contrat de travail du mineur et en fait partie intégrante." },
  ];
}
function autorisationAr(v: RhMineurView): LegalBlock[] {
  return [
    { k: "h", t: "النائب الشرعي" },
    { k: "p", t: `أنا الموقّع(ة) أسفله: ${PH}` },
    { k: "p", t: `بصفتي: ${PH} (الأب / الأم / الوصي الشرعي «الولي»)` },
    { k: "p", t: `بطاقة التعريف الوطنية رقم: ${PH}    القاطن(ة) بـ: ${PH}` },
    { k: "p", t: `ما يُثبت صلة القرابة: ${PH} (دفتر الحالة المدنية / عقد الوصاية)` },
    { k: "h", t: "القاصر المعني" },
    { k: "p", t: `الاسم الكامل: ${PH}` },
    { k: "p", t: `المزداد(ة) بتاريخ: ${PH} (السن: ${PH})    بـ: ${PH}` },
    { k: "center", t: "أُصرّح وأُذن بما يلي:", strong: true },
    { k: "p", t: `1. أُذن صراحةً للقاصر المذكور، الموضوع تحت مسؤوليتي، بإبرام عقد عمل والاشتغال لدى ${firmIdentAr(v.firm)}، ويُشار إليها بـ«المشغّل».` },
    { k: "p", t: "2. يُؤذَن بهذا التشغيل حصراً في منصب غير خطير مناسب لسنّه: …… (أشغال خفيفة لتهيئة المساحات الخضراء على مستوى الأرض). وأُقرّ بأنّني أُخبِرتُ بأنّ القاصر لا يجب بأيّ حال أن يُكلَّف بقيادة الآليات أو الماكينات، أو العمل على علوّ، أو حمل الأثقال، أو مناولة المواد (المواد 179 إلى 181 من مدونة الشغل)." },
    { k: "p", t: "3. أُقرّ بأنّني أُخبِرتُ بأوقات العمل (نهاراً فقط)، وبطبيعة المهام، وبشروط السلامة، وأُذن بالفحص الطبي عند التوظيف السابق للالتحاق بالمنصب." },
    { k: "p", t: "4. ألتزم بإخبار المشغّل دون تأخير بكلّ عنصر (حالة صحية، دراسة، أو غير ذلك) من شأنه التأثير في هذا التشغيل." },
    { k: "p", t: "5. يُلحَق هذا الإذن بعقد عمل القاصر ويُشكّل جزءاً لا يتجزّأ منه." },
  ];
}

/* ------------------------------------------------------------------ CONTRAT MINEUR ------------------------------------------------------------------ */
function contratFr(v: RhMineurView): LegalBlock[] {
  return [
    { k: "p", t: "Entre les soussignés :" },
    { k: "h", t: "L'Employeur" },
    { k: "p", t: `La société ${firmIdentFr(v.firm)}, représentée par ${val(v.signatoryName ?? v.firm.signatory_name)}, en sa qualité de ${val(v.signatoryRole ?? v.firm.signatory_role)}, ci-après « l'Employeur », d'une part,` },
    { k: "h", t: "Le salarié mineur" },
    { k: "p", t: `Prénom et NOM : ${PH}\nNé(e) le : ${PH} (mineur de moins de 18 ans)    à : ${PH}\nDemeurant à : ${PH}\nci-après « le Salarié »,` },
    { k: "h", t: "Et le représentant légal (qui autorise et co-signe)" },
    { k: "p", t: `Prénom et NOM : ${PH}\nQualité : ${PH} (père / mère / tuteur)    CIN : ${PH}\nci-après « le Représentant légal », d'autre part.` },
    { k: "center", t: "IL A ÉTÉ CONVENU CE QUI SUIT :", strong: true },
    { k: "h", t: "Article 1 — Motif et nature du contrat (art. 16 et 33)" },
    { k: "p", t: `Le présent contrat est conclu pour accomplir un travail déterminé (article 16, al. 1er du Code du travail), en raison de l'accroissement temporaire d'activité résultant du chantier d'aménagement paysager désigné ci-après : ${PH} (lieu : ${PH}).` },
    { k: "h", t: "Article 2 — Objet, prise d'effet et terme (art. 33)" },
    { k: "p", t: `2.1. Le Salarié est chargé de tâches légères d'aménagement paysager limitativement énumérées à l'article 3. 2.2. Le contrat prend effet le ${PH} et prend fin de plein droit à l'achèvement des travaux qui en constituent l'objet (art. 33), constaté par un procès-verbal de fin de travaux daté et signé, sans qu'il soit besoin de préavis. 2.3. Durée minimale garantie : ${PH} jours ; durée estimée à titre purement indicatif (sans valeur de terme).` },
    { k: "h", t: "Article 3 — Poste NON DANGEREUX et lieu de travail (art. 179 à 181)" },
    { k: "p", t: "3.1. Le Salarié mineur est affecté exclusivement à des tâches légères, de plain-pied et sans machine, à savoir :" },
    { k: "ul", items: [
      "plantation manuelle de petits sujets, semis, rempotage ;",
      "désherbage manuel, arrosage manuel ;",
      "entretien léger d'espaces verts, aide au tri de plants en pépinière ;",
      `${PH} (autres tâches légères, à préciser).`,
    ] },
    { k: "p", t: "3.2. Interdictions absolues. Conformément aux articles 179 à 181 du Code du travail, il est formellement interdit d'affecter le Salarié mineur : à la conduite ou l'utilisation d'engins et de machines (mini-pelle, motoculteur, débroussailleuse, tronçonneuse, taille-haie, tondeuse autoportée, broyeur, bétonnière…) ; au travail en hauteur (échelles, échafaudages, toitures, élagage) ; au port de charges lourdes ; à la manipulation de produits chimiques ou phytosanitaires ; à tout travail de terrassement ou présentant un danger." },
    { k: "h", t: "Article 4 — Période d'essai (art. 14)" },
    { k: "p", t: "La durée du contrat étant inférieure à six (6) mois, la période d'essai est de quatre (4) jours (1 jour par semaine, dans la limite légale de 2 semaines)." },
    { k: "h", t: "Article 5 — Rémunération (art. 356)" },
    { k: "p", t: "Le Salarié perçoit au moins le salaire minimum légal (SMIG), soit dix-sept dirhams et quatre-vingt-douze centimes (17,92 DH) de l'heure, sans aucun abattement lié à l'âge, au prorata du travail effectif, ainsi que, le cas échéant, les indemnités de frais professionnels applicables. La rémunération est versée par quinzaine, avec bulletin de paie (art. 370)." },
    { k: "h", t: "Article 6 — Durée du travail, travail de jour et repos (art. 172, 231)" },
    { k: "p", t: "6.1. Le Salarié mineur travaille de jour uniquement ; le travail de nuit lui est interdit (art. 172). 6.2. Aucune heure supplémentaire ne peut lui être demandée ; la journée reste modérée et le repos hebdomadaire d'au moins 24 heures est strictement respecté. 6.3. Le Salarié mineur bénéficie d'un congé annuel majoré de deux (2) jours ouvrables par mois de travail (art. 231)." },
    { k: "h", t: "Article 6 bis — Interruption des travaux (fait du maître d'ouvrage)" },
    { k: "p", t: "6bis.1. L'exécution des travaux dépend de la mise à disposition, par le maître d'ouvrage, des conditions nécessaires (accès au site, eau, terrassement). 6bis.2. Coupure temporaire. Le chantier ayant vocation à reprendre, et la rémunération étant calculée au prorata des journées effectivement travaillées, les journées non travaillées du fait de l'interruption ne sont pas rémunérées ; le Salarié reprend son poste à la reprise des travaux. 6bis.3. Arrêt définitif ou force majeure. Si les travaux sont achevés ou définitivement abandonnés, ou en cas de force majeure, le contrat prend fin (article 2) ; il est procédé au solde de tout compte (jours travaillés et congés), sans dommages-intérêts. Ces stipulations s'appliquent dans le respect des dispositions impératives du Code du travail." },
    { k: "h", t: "Article 7 — Visite médicale d'aptitude (art. 290 et 144)" },
    { k: "p", t: "La prise de poste est subordonnée à une visite médicale d'embauche préalable attestant de l'aptitude du mineur au poste. L'inspection du travail peut, à tout moment, requérir un examen médical pour vérifier que le travail n'excède pas ses capacités (art. 144) ; le cas échéant, le mineur en est retiré. L'Employeur adhère à un service médical du travail interentreprises et prend en charge ces visites." },
    { k: "h", t: "Article 8 — Encadrement et sécurité" },
    { k: "p", t: `Le Salarié mineur travaille sous la surveillance permanente d'un encadrant désigné : ${PH}. Il porte les équipements de protection individuelle (EPI) adaptés et respecte les consignes de sécurité du site et de l'encadrant.` },
    { k: "h", t: "Article 9 — Couverture sociale (CNSS, AMO, AT)" },
    { k: "p", t: "Le Salarié est affilié à la CNSS et à l'AMO ; à défaut d'immatriculation, l'Employeur y procède. Il est couvert par l'assurance accidents du travail (Loi 18-12) pendant toute la durée du contrat, trajets inclus." },
    { k: "h", t: "Article 10 — Autorisation du représentant légal" },
    { k: "p", t: "Le présent contrat est conclu avec l'autorisation écrite et légalisée du Représentant légal, qui y est annexée (Annexe 1) et en fait partie intégrante. Le Représentant légal co-signe le présent contrat." },
    { k: "h", t: "Article 11 — Confidentialité et données personnelles" },
    { k: "p", t: "Le Salarié respecte la confidentialité des informations de l'entreprise. Les données personnelles du Salarié et de son Représentant légal sont traitées par l'Employeur, responsable du traitement, aux seules fins de gestion du personnel, dans le respect de la loi 09-08, et conservées selon les délais légaux." },
    { k: "h", t: "Article 12 — Rupture anticipée (art. 33)" },
    { k: "p", t: "Hors période d'essai et hors faute grave ou force majeure, la rupture anticipée ouvre droit à des dommages-intérêts égaux aux salaires restant dus jusqu'au terme (art. 33). La faute grave dûment constatée selon la procédure légale (art. 62-65) permet la rupture sans indemnité." },
    { k: "h", t: "Article 13 — Droit applicable et juridiction" },
    { k: "p", t: `Le présent contrat est régi par le droit marocain (Loi 65-99, Loi 09-08, DOC). Tout litige relève, après tentative de conciliation, du Tribunal de Première Instance de ${PH}, section sociale (art. 28 CPC — lieu d'exécution).` },
    { k: "h", t: "Article 14 — Dispositions finales" },
    { k: "p", t: "Établi en deux (2) exemplaires originaux, dont un remis au Salarié ; les signatures sont légalisées par l'autorité communale (art. 18)." },
  ];
}
function contratAr(v: RhMineurView): LegalBlock[] {
  return [
    { k: "p", t: "بين الموقّعين أسفله:" },
    { k: "h", t: "المشغّل" },
    { k: "p", t: `${firmIdentAr(v.firm)}، ممثَّلةً من طرف ${val(v.signatoryName ?? v.firm.signatory_name)} بصفته/بصفتها ${val(v.signatoryRole ?? v.firm.signatory_role)}، ويُشار إليها بـ«المشغّل»، من جهة؛` },
    { k: "h", t: "الأجير القاصر" },
    { k: "p", t: `الاسم الكامل: ${PH}\nالمزداد(ة) بتاريخ: ${PH} (قاصر دون 18 سنة)    بـ: ${PH}\nالقاطن(ة) بـ: ${PH}\nويُشار إليه(ها) بـ«الأجير»؛` },
    { k: "h", t: "والنائب الشرعي (الذي يأذن ويُوقّع معه)" },
    { k: "p", t: `الاسم الكامل: ${PH}\nالصفة: ${PH} (أب / أم / وصي)    ب.ت.و: ${PH}\nويُشار إليه بـ«النائب الشرعي»، من جهة أخرى.` },
    { k: "center", t: "تم الاتفاق على ما يلي:", strong: true },
    { k: "h", t: "المادة 1 — سبب العقد وطبيعته (المادتان 16 و33)" },
    { k: "p", t: `يُبرَم هذا العقد لإنجاز شغل معيّن (المادة 16، الفقرة الأولى من مدونة الشغل)، بسبب الزيادة المؤقتة في النشاط الناتجة عن ورش تهيئة المساحات الخضراء المعيّن أدناه: ${PH} (المكان: ${PH}).` },
    { k: "h", t: "المادة 2 — الموضوع والبداية والانتهاء (المادة 33)" },
    { k: "p", t: `2.1. يُكلَّف الأجير بمهام خفيفة لتهيئة المساحات الخضراء محدّدة حصراً في المادة 3. 2.2. يبدأ سريان العقد بتاريخ ${PH} وينتهي بقوة القانون بإتمام الأشغال موضوعِه (المادة 33)، ويُعايَن بمحضر انتهاء أشغال مؤرّخ وموقّع، دون حاجة إلى إشعار. 2.3. المدّة الدنيا المضمونة: ${PH} يوماً؛ والمدّة التقديرية على سبيل الاستئناس فقط (دون قيمة أجل).` },
    { k: "h", t: "المادة 3 — منصب غير خطير ومكان العمل (المواد 179 إلى 181)" },
    { k: "p", t: "3.1. يُعيَّن الأجير القاصر حصراً في مهام خفيفة، على مستوى الأرض ودون آلات، وهي:" },
    { k: "ul", items: [
      "الغرس اليدوي لأصناف صغيرة، البذر، وضع الأصص؛",
      "إزالة الأعشاب الضارة يدوياً، السقي اليدوي؛",
      "الصيانة الخفيفة للمساحات الخضراء، المساعدة في فرز الشتلات؛",
      `${PH} (مهام خفيفة أخرى، تُحدَّد).`,
    ] },
    { k: "p", t: "3.2. منع مطلق. طبقاً للمواد 179 إلى 181 من مدونة الشغل، يُمنع منعاً باتاً تكليف الأجير القاصر بـ: قيادة أو استعمال الآليات والماكينات (جرافة صغيرة، محراث، آلة تعشيب، منشار سلسلي، مقصّ الأسيجة، جزّازة، مطحنة، خلّاطة إسمنت…)؛ العمل على علوّ (السلالم، السقالات، الأسطح، تقليم الأشجار)؛ حمل الأثقال؛ مناولة المواد الكيميائية أو مبيدات الآفات؛ وكلّ عمل تسوية للتربة أو ينطوي على خطر." },
    { k: "h", t: "المادة 4 — فترة الاختبار (المادة 14)" },
    { k: "p", t: "لكون مدّة العقد تقلّ عن ستة (6) أشهر، تُحدَّد فترة الاختبار في أربعة (4) أيام (يوم عن كل أسبوع، في حدود أسبوعين)." },
    { k: "h", t: "المادة 5 — الأجر (المادة 356)" },
    { k: "p", t: "يتقاضى الأجير على الأقلّ الحدّ الأدنى القانوني للأجر، أي 17,92 درهم عن الساعة، دون أيّ تخفيض مرتبط بالسنّ، بالتناسب مع العمل الفعلي، وكذا، عند الاقتضاء، تعويضات المصاريف المهنية المطبَّقة. ويُؤدَّى الأجر كلّ نصف شهر، مع ورقة أداء (المادة 370)." },
    { k: "h", t: "المادة 6 — مدّة العمل، العمل نهاراً والراحة (المادتان 172 و231)" },
    { k: "p", t: "6.1. يشتغل الأجير القاصر نهاراً فقط؛ ويُمنع عليه العمل ليلاً (المادة 172). 6.2. لا يمكن أن يُطلب منه أيّ ساعة إضافية؛ ويبقى اليوم معتدلاً، وتُحترم الراحة الأسبوعية التي لا تقلّ عن 24 ساعة. 6.3. يستفيد الأجير القاصر من عطلة سنوية مرفوعة بيومين (2) من أيام العمل عن كل شهر عمل (المادة 231)." },
    { k: "h", t: "المادة 6 مكرر — توقّف الأشغال (بفعل صاحب المشروع)" },
    { k: "p", t: "6مكرر.1. يتوقّف إنجاز الأشغال على توفير صاحب المشروع للشروط اللازمة (الولوج إلى الموقع، الماء، التسوية). 6مكرر.2. التوقّف المؤقت: مع كون الورش سيُستأنف، ولمّا كان الأجر يُحتسب بالتناسب مع الأيام المشتغَلة فعلياً، فإنّ الأيام غير المشتغَلة بسبب التوقّف لا تُؤدّى عنها أجرة؛ ويستأنف الأجير منصبه عند استئناف الأشغال. 6مكرر.3. التوقّف النهائي أو القوة القاهرة: إذا أُتمّت الأشغال أو تُخُلّي عنها نهائياً، أو في حالة قوة قاهرة، انتهى العقد (المادة 2)؛ وتُجرى تصفية كامل الحساب (الأيام المشتغَلة والعطلة)، دون تعويض عن الأضرار. وتُطبَّق هذه المقتضيات مع مراعاة الأحكام الآمرة لمدونة الشغل." },
    { k: "h", t: "المادة 7 — الفحص الطبي للأهلية (المادتان 290 و144)" },
    { k: "p", t: "يتوقّف الالتحاق بالمنصب على فحص طبي عند التوظيف سابق يُثبت أهلية القاصر للمنصب. ويمكن لمفتشية الشغل، في أيّ وقت، أن تطلب فحصاً طبياً للتأكّد من أنّ العمل لا يتجاوز قدراته (المادة 144)؛ وعند الاقتضاء يُسحَب منه. ويَنخرط المشغّل في مصلحة طبية للشغل مشتركة ويتحمّل نفقات هذه الفحوص." },
    { k: "h", t: "المادة 8 — التأطير والسلامة" },
    { k: "p", t: `يشتغل الأجير القاصر تحت المراقبة الدائمة لمؤطّر مُعيَّن: ${PH}. ويرتدي معدات الحماية الفردية الملائمة ويحترم تعليمات السلامة الخاصة بالموقع وبالمؤطّر.` },
    { k: "h", t: "المادة 9 — التغطية الاجتماعية (CNSS، AMO، حوادث الشغل)" },
    { k: "p", t: "يُسجَّل الأجير لدى الصندوق الوطني للضمان الاجتماعي والتأمين الإجباري عن المرض؛ وفي غياب التسجيل، يتكفّل المشغّل به. ويستفيد من التأمين عن حوادث الشغل (القانون 18-12) طيلة مدّة العقد، بما في ذلك التنقّل." },
    { k: "h", t: "المادة 10 — إذن النائب الشرعي" },
    { k: "p", t: "يُبرَم هذا العقد بإذن كتابي مصادَق عليه من النائب الشرعي، مُلحَق به (الملحق 1) ويُشكّل جزءاً لا يتجزّأ منه. ويُوقّع النائب الشرعي مع هذا العقد." },
    { k: "h", t: "المادة 11 — السرّية والمعطيات الشخصية" },
    { k: "p", t: "يحترم الأجير سرّية معلومات المقاولة. وتُعالَج المعطيات الشخصية للأجير ولنائبه الشرعي من طرف المشغّل، المسؤول عن المعالجة، لأغراض تدبير المستخدَمين فقط، مع احترام القانون 09-08، وتُحفظ وفق الآجال القانونية." },
    { k: "h", t: "المادة 12 — الفسخ المسبق (المادة 33)" },
    { k: "p", t: "خارج فترة الاختبار وفي غير حالة الخطأ الجسيم أو القوة القاهرة، يترتّب على الفسخ المسبق تعويض يعادل الأجور المستحقّة إلى غاية الأجل (المادة 33). والخطأ الجسيم المُثبت وفق المسطرة القانونية (المواد 62-65) يسمح بالفسخ دون تعويض." },
    { k: "h", t: "المادة 13 — القانون المطبَّق والمحكمة" },
    { k: "p", t: `يخضع هذا العقد للقانون المغربي (القانون 65-99، القانون 09-08، قانون الالتزامات والعقود). ويُعرَض كلّ نزاع، بعد محاولة الصلح، على المحكمة الابتدائية بـ ${PH}، الغرفة الاجتماعية (المادة 28 من قانون المسطرة المدنية — مكان التنفيذ).` },
    { k: "h", t: "المادة 14 — مقتضيات ختامية" },
    { k: "p", t: "حُرّر في نظيرين أصليين، يُسلَّم أحدهما للأجير؛ وتُصادَق التوقيعات لدى السلطة المحلّية (المادة 18)." },
  ];
}

/* ------------------------------------------------------------------ assemblage ------------------------------------------------------------------ */
export function buildMineurDoc(v: RhMineurView): LegalDoc {
  const city = v.issueCity?.trim() || v.firm.city || PH;
  const dateFr = valDate(v.issueDate);
  const isAuto = v.type === "autorisation";

  const ar: LegalDocAr = isAuto
    ? {
        heading: MINEUR_TITLE_AR.autorisation,
        subheading: "لتشغيل قاصر (بين 15 و18 سنة) — المواد 143 وما يليها من مدونة الشغل",
        blocks: autorisationAr(v),
        faitA: `حُرّر بـ ${city}، بتاريخ ${dateFr}`,
        legalNote: "التوقيع مصادَق عليه لدى السلطة المحلّية المختصة.",
        signatures: [
          { title: "النائب الشرعي", lines: [`الاسم الكامل: ${PH}`], caption: "التوقيع مسبوقاً بـ«قُرئ وصودق عليه»، مع المصادقة" },
          { title: "القاصر", lines: [`الاسم الكامل: ${PH}`], caption: "التوقيع" },
        ],
      }
    : {
        heading: MINEUR_TITLE_AR.contrat,
        subheading: "أجير قاصر (من 15 إلى 18 سنة) — منصب غير خطير · ورش تهيئة المساحات الخضراء",
        blocks: contratAr(v),
        faitA: `حُرّر بـ ${city}، بتاريخ ${dateFr}`,
        signatures: [
          { title: "عن المشغّل", lines: [`${val(v.signatoryName ?? v.firm.signatory_name)}`], caption: "التوقيع والخاتم والمصادقة" },
          { title: "الأجير القاصر", lines: [], caption: "«قُرئ وصودق عليه»" },
          { title: "النائب الشرعي", lines: [], caption: "«قُرئ وصودق عليه»، والمصادقة" },
        ],
      };

  const doc: LegalDoc = isAuto
    ? {
        fileTitle: `${MINEUR_TITLE.autorisation} — ${v.firm.name.toUpperCase()}`,
        heading: MINEUR_TITLE.autorisation,
        subheading: "Emploi d'un mineur (15-18 ans) — articles 143 et suivants du Code du travail (Loi 65-99)",
        blocks: autorisationFr(v),
        faitA: `Fait à ${city}, le ${dateFr}`,
        legalNote: "Signature légalisée auprès de l'autorité communale compétente.",
        signatures: [
          { title: "Le représentant légal", lines: [`Prénom NOM : ${PH}`], caption: "Signature précédée de « Lu et approuvé », et légalisation" },
          { title: "Le mineur", lines: [`Prénom NOM : ${PH}`], caption: "Signature" },
        ],
        ar,
      }
    : {
        fileTitle: `${MINEUR_TITLE.contrat} — ${v.firm.name.toUpperCase()}`,
        heading: "CONTRAT POUR ACCOMPLIR UN TRAVAIL DÉTERMINÉ",
        subheading: "Salarié mineur (15 à 18 ans) — poste non dangereux · chantier d'aménagement paysager (ouvrier)",
        blocks: contratFr(v),
        faitA: `Fait à ${city}, le ${dateFr}`,
        legalNote: "Deux (2) exemplaires originaux, signatures légalisées (art. 18). Autorisation du représentant légal annexée (Annexe 1).",
        signatures: [
          { title: "Pour l'Employeur", lines: [val(v.signatoryName ?? v.firm.signatory_name)], caption: "Signature, cachet, légalisation" },
          { title: "Le Salarié mineur", lines: [], caption: "« Lu et approuvé »" },
          { title: "Le Représentant légal", lines: [], caption: "« Lu et approuvé », légalisation" },
        ],
        ar,
      };

  return doc;
}

/* ------------------------------------------------------------------ transparence & export ------------------------------------------------------------------ */
export function mineurMissingFields(v: RhMineurView): string[] {
  const out = [
    v.type === "autorisation" ? "Représentant légal (nom, CIN, qualité)" : "Salarié mineur (nom, naissance)",
    "Identité du mineur",
    v.type === "contrat" ? "Représentant légal (co-signature)" : "Justificatif du lien",
    "Dates / chantier",
  ];
  if (!(v.signatoryName ?? v.firm.signatory_name)?.trim()) out.push("Signataire employeur");
  return out;
}

export function mineurPrefilled(v: RhMineurView): { label: string; value: string }[] {
  return [
    { label: "Entité (employeur)", value: v.firm.name.toUpperCase() },
    ...(v.firm.ice ? [{ label: "ICE", value: v.firm.ice }] : []),
  ];
}

export function mineurFileName(v: RhMineurView, lang: MineurLang): string {
  const suffix = lang === "ar" ? "AR" : "FR";
  return legalFileName(`${MINEUR_TITLE[v.type]}_${suffix}`, v.firm.name);
}

/** PDF (FR uniquement — jsPDF ne rend pas l'arabe ; pour l'AR, utiliser le HTML). */
export async function exportMineurPdf(v: RhMineurView) {
  const doc = await renderLegalPdf(v.firm, buildMineurDoc(v));
  doc.save(mineurFileName(v, "fr"));
}

export function openMineurHtml(v: RhMineurView, lang: MineurLang) {
  const html = renderLegalHtml(v.firm, buildMineurDoc(v), lang);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
