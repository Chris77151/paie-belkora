# Belkora Paie & RH — Maroc

Application web de **gestion de la paie et des ressources humaines** conforme à la
réglementation marocaine 2025-2026, construite à partir de la spécification
`PAIE-RH-SPECIFICATION-MAROC-v2.md`.

Identité visuelle dérivée du logo **Miya Belkora Design** : vert lime (`#8DB94E`),
verts sauge et gris neutres, déclinés en un thème clair/sombre cohérent.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # tests unitaires du moteur de paie (Vitest)
npm run build    # build de production (dist/)
```

Deux modes de persistance : **local** par défaut (`localStorage`, aucun backend), ou
**cloud permanent** en activant Supabase dans Paramètres (données sauvegardées et partagées
entre appareils). Jeu de départ : 2 sociétés, **0 salarié** (à saisir ou importer depuis Odoo).

## Ce qui est couvert

| Domaine | État |
|---|---|
| Moteur de paie Maroc (SMIG 17,92/191 h, CNSS 4,48 % plafond 6 000, AMO 2,26 %, IR barème LF 2025, frais pro 35 %/25 %, prime d'ancienneté, HS art. 201) — + **exonération CNSS par salarié** (dispositifs ANAPEC) : `totale` (stage — indemnité hors assiette, CNSS/AMO/AF/TFP = 0) ou `patronale` (TAHFIZ/IDMAJ — part patronale exonérée, part salariale due), pour aligner le calcul et l'écriture comptable sur la **BDS DAMANCOM** réelle | ✅ + 40 tests |
| Paramètres réglementaires isolés dans `payroll_params` (aucun taux en dur) | ✅ |
| 7 pages : Tableau de bord, Salariés, Paie, Déclarations, Conformité, Congés, Paramètres | ✅ |
| Bulletin de paie : PDF (jsPDF + logo), LaTeX (.tex), HTML imprimable — **« Partie réservée à l'employeur » (charges patronales + coût employeur) optionnelle** : case à cocher dans Paie, appliquée aux 3 exports (unitaire et en masse) ; incluse par défaut. N'affecte QUE l'affichage — le calcul, les écritures comptables et la BDS CNSS restent inchangés | ✅ + 4 tests |
| **Couleur de marque par société** (`src/lib/brand-color.ts`, + 10 tests) : chaque société définit une `brand_color` (choisie ou **extraite du logo**, canvas) dans Paramètres → un **spectre mono-teinte harmonieux** (accent/en-tête/tint/encre + vert profond & gris teinté) est dérivé et appliqué à **tous ses documents** — bulletins **et** documents RH / juridiques (attestations, certificats, contrats, kits disciplinaire / rupture / mineurs), en PDF + HTML. Chaque société, présente ou future, obtient ainsi ses documents à sa propre couleur ; sans couleur : vert Miya par défaut, à l'identique. | ✅ + 10 tests |
| **Documents RH** (gabarit MBD, PDF + HTML) : attestations/certificats · contrats de travail chantier · **kit disciplinaire** (avertissement → licenciement, art. 37-39/62) · **kit rupture** (PV de fin de travaux, accord de rupture amiable, **reçu pour solde de tout compte** — modèle MBD complet : parties, relation/rupture à cocher, **tableau de décompte** (bloc `table` du moteur, rendu PDF/HTML/aperçu), mentions légales, signatures + annexe salarié illettré ; **entièrement auto-rempli** depuis l'employé et le calcul STC, avec **cases pré-cochées** (nature du contrat / motif de la rupture / mode de règlement) déduites des données saisies, et champs de correspondance (naissance, adresse, référence, chèque) — pointillés sinon (zéro invention) — art. 33/73-76) · **kit mineurs** (autorisation du représentant légal + contrat travail déterminé mineur, art. 143-181) **bilingue FR / AR (arabe RTL)** — zéro invention, champs absents en pointillé. **Génération possible pour un salarié NON enregistré** dans le fichier du personnel (saisie manuelle d'un salarié ad-hoc en mémoire, jamais persisté) et/ou **non encore déclaré à la CNSS** (n° CNSS vide → pointillé). **Export « Aperçu fidèle »** (capture WYSIWYG de l'aperçu → PDF identique, couleurs de la société incluses). | ✅ |
| **Calcul automatique du solde de tout compte (STC)** (`src/lib/stc-engine.ts`, moteur pur + 28 tests) : préavis (art. 43 — cadres 1/2/3 mois, non-cadres 8 j/1 mois/2 mois), indemnité légale de licenciement (art. 52-53 — 96/144/192/240 h par année, **exonérée**), congés payés non pris (art. 231), dommages-intérêts licenciement abusif (art. 41 — 1,5 mois/an plaf. 36 mois), indemnité de fin de CDD (7 %), puis traitement social/fiscal (CNSS/AMO/IR) → **NET**. Le motif de départ pilote les postes ; décompte injecté dans le reçu. Aucun taux en dur (barèmes dans `params.ts`). | ✅ + 28 tests |
| **Bascule de langue FR / AR** (`src/lib/i18n.ts`) : bouton dans l'en-tête, `dir="rtl"` + police arabe en mode arabe (MSA, ponctuation ، ؛ ؟), coquille traduite (navigation, en-tête, pied), préférence mémorisée. Dictionnaire extensible clé par clé. | ✅ |
| Calcul en masse, saisie variable, validation & gel de période | ✅ |
| Bordereau CNSS + fichier BDS DAMANCOM, état 9421/IR | ✅ |
| Moteur d'alertes de conformité (CNSS, CIN, mineur, CDD, contrat) | ✅ |
| **Sécurité / Audit RIB** (`src/lib/bank-audit.ts`, super-admin) : analyse **tous les RIB de tous les tiers** présents dans Odoo (fournisseurs, clients, salariés — `company_id = false` inclus) + ceux de la société. Détection d'écart vs base de référence, classement du risque (non autorisé / à vérifier / nouveau / supprimé), acteur et habilitation. **Chiffrement de qualité** : empreinte **HMAC-SHA-256 salée** (sel 256 bits par société) — le RIB en clair n'est **jamais** stocké ni affiché (empreinte + masque `****1234`). Comparaison **rétro-compatible** avec les bases antérieures | ✅ + 11 tests |
| Congés payés, soldes, absences/IPE | ✅ |
| Écritures comptables de paie (OD + règlement), PCGE validé expert-comptable — **source unique de vérité** : agrège UNIQUEMENT les bulletins validés de la période (aucun recalcul, aucune valeur par défaut). **TFP incluse dans 4441 par défaut** (recouvrement CNSS/OFPPT), option isolée 4457. **Invariants bloquants** à chaque génération : équilibre débit=crédit, organismes sociaux (4441+4457)=Σ cotisations au centime, 6171=4432+retenues+IR — génération/validation bloquées avec détail de l'écart si un invariant échoue | ✅ + 14 tests |
| Export des écritures : XML · Excel (.xlsx) · PDF | ✅ |
| Multi-sociétés : création / suppression de sociétés | ✅ |
| Import Odoo des salariés (JSON-RPC hr.employee, filtré par company_id ; salaire réel `wage`, CNSS `l10n_ma_cnss_number`, CIN) | ✅ |
| **Synchronisation app → Odoo** (`buildEmployeeSyncPlan`/`applyEmployeeSyncPlan`) : plan **dry-run** apparié par clé stable (odoo_id → matricule → CIN → CNSS → nom), puis **create** (salarié absent d'Odoo) / **update** / **conflit**. L'update **complète** les champs vides d'Odoo **ET corrige les divergences** (`syncDiffers`) — l'app fait foi, dont le **poste** ; le **nom** n'est jamais réécrit, une valeur app vide n'écrase jamais Odoo. Champs synchronisés : nom, matricule, CIN, CNSS, **poste**, naissance, salaire mensuel, **personnes à charge** (`children`), **téléphone** (`mobile_phone`), **adresse** (`private_street`). **Robustesse** : `fields_get` détecte les champs réellement présents sur l'instance → un champ absent (module l10n_ma manquant, renommage de version) est **ignoré** au lieu de faire échouer tout le write. Chaque écriture est précédée d'un plan confirmé (compléter / corriger distingués) | ✅ + 4 tests |
| **Audit comptable & financier** (déterministe, sans IA) : revue par les **assertions d'audit** (flux / soldes / présentation). Périmètre **paie locale** (sous-SMIG, charges patronales, cut-off, CNSS/CIN, équilibre, classification 4441/4457, provisions…) **+ toute la comptabilité Odoo** si connectée — lecture seule : balance générale équilibrée, écritures en brouillon, journaux sans écriture, charges/produits au solde anormal, clients créditeurs / fournisseurs débiteurs, comptes d'attente non soldés, cohérence TVA 4455/3455, **lettrage clients/fournisseurs non rapprochés**, **factures échues impayées (balance âgée AR/AP)** et **ventilation réelle des écritures postées par type** (ventes, achats, trésorerie, divers) — l'audit ne se limite plus à la paie. Détail + recommandation (CGNC/PCGE, CGI, CNSS) + action Odoo + **numéros de compte PCGE concernés** (extraits par allowlist, sans faux positif) + score de fiabilité. Deux boutons de correction : **« Corriger (rapport PDF) »** génère un **rapport de régularisation PDF en 2 volets** (`src/lib/remediation-report.ts`) — **Volet A** corrections applicables **automatiquement** (lettrage réversible) avec leur résultat réel, **Volet B** actions nécessitant une **intervention humaine** (détail complet par anomalie : cause, comptes PCGE, écriture-type, base normative CGNC/CGI/CNSS, contrôle post-régularisation). **« Appliquer dans Odoo »** (**super administrateur**, confirmation explicite) exécute le **seul sous-ensemble sûr** : le **lettrage automatique** (`odooReadOpenItems`+`groupReconcilable`+`odooApplyReconcile`) — ne rapproche QUE les groupes tiers/compte dont **Σ résidu ≈ 0** (mécanique, **réversible** dans Odoo, aucune écriture créée/supprimée). La classification AUTO/HUMAIN (`classifyRemediation`) et l'exécution des corrections de fond suivent le skill Claude Code `odoo-correction-anomalies` (lit Odoo réel, OD contre-passable, rapport de régularité, zéro hallucination) | ✅ + 10 tests |
| **Assistant IA conversationnel** (Claude via SDK Anthropic, *tool-use*) : lit, crée, modifie, supprime salariés et sociétés, calcule des bulletins, consulte les alertes — **choix du modèle** (Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 ou identifiant personnalisé), test de connexion, suppressions confirmées | ✅ |
| **Stabilisation & Calculs** (`src/lib/stability-engine.ts`, moteur pur + tests) — page **réservée au super administrateur**. Self-checks déterministes : cohérence de `params.ts` (barème IR monotone, taux dans les bornes, bases positives), invariants des bulletins réellement calculés (net ≤ brut, CNSS plafonnée, IR ≥ 0, identité net = brut − CNSS − AMO − IR), **équilibre débit = crédit** des écritures des périodes figées, intégrité des données (bulletins/congés/accidents orphelins, société active invalide, doublons de matricule). Score de santé + bouton **« Corriger »** (réparations de DONNÉES idempotentes via le store) + **rapport des formules de calcul réelles** (`src/lib/formula-report.ts`) : chaque formule de paie (base, HS, ancienneté, SBI, CNSS/AMO, frais pro, IR, net, charges patronales) est restituée en **exécutant le vrai moteur** sur un exemple chiffré (jamais inventée). Les corrections de **code** relèvent du skill Claude Code `audit-stabilisation-app` (lit les fichiers md comme référence). | ✅ |
| **Contrôle d'accès par rôle** (`src/lib/auth.ts` `ROUTE_ACCESS`/`canAccess`) : garde de routes + navigation filtrée + gardes de rendu. **super_admin** = tout (dont Stabilisation, Sécurité RIB, persistance cloud Supabase, import Odoo, gestion des utilisateurs) ; **firm_admin** = tout sauf zones sensibles super-admin ; **gestionnaire_paie** = opérationnel sans Paramètres/Sécurité ; **lecture_seule** = consultation (écritures neutralisées au niveau du store). | ✅ |
| **Volet « Registre des salariés »** (`src/lib/staff-register.ts`, moteur pur + 52 tests) — volet dédié à **4 onglets** (groupe Paie & RH) : **Registre nominatif** (numéroté, toutes colonnes) · **Mouvements** (chronologie mois par mois, entrées/sorties/solde, statut de déclaration porté sur chaque entrée) · **Conformité** (constats) · **Registres légaux** (état HONNÊTE de ce que l'app couvre : livre de paie **non couvert**, registre des congés **partiel**, carte de travail **non couverte**, certificat de travail, CNSS). Export **« Registre à présenter »** : numérotation continue des lignes, formule d'arrêté (« Arrêté le présent registre à N salariés (n en toutes lettres) » — elle fige le nombre de lignes, rendant visible tout ajout postérieur à la signature), bloc signature et cachet de l'employeur. **Présence calculée à la date d'arrêté** et non par « absence de date de sortie » : un préavis en cours ou un CDD à échoir au-delà de l'arrêté laisse le salarié dans l'effectif (défaut corrigé, verrouillé par test). Liste **toute personne ayant travaillé sur la période**, déclarée à la CNSS **ou non**, présente ou sortie, avec catégorie, poste, **date d'entrée / date de sortie / motif** (art. 24), ancienneté et **statut de déclaration** calculé à une **date d'arrêté passée en paramètre** (jamais `new Date()` implicite : sans cela le registre n'est ni testable ni reproductible d'une édition à l'autre). Quatre statuts : `déclaré` · `délai en cours` (jours restants) · `hors délai` (jours de retard + ordre de grandeur de l'exposition) · `régime dérogatoire à confirmer` (stagiaire, intérim — **jamais compté comme conforme**, c'est une attente de pièce). **Piège traité explicitement : les dispositifs ANAPEC (Idmaj/Tahfiz) exonèrent de COTISATIONS, pas de DÉCLARATION** — un salarié ANAPEC sans n° CNSS ressort donc `hors délai`. KPI centrés sur l'**écart effectif réel / effectif déclaré** (+ entrées, sorties, turnover avec sa formule affichée, ancienneté moyenne, sorties par motif). Constats de non-conformité datés, chiffrés et rattachés à leur base légale **vérifiée**. Exports **PDF paysage** (gabarit `pdf-kit`) et **Excel** (onglets Registre / Constats / Réserves). Aucune donnée sensible : ni salaire, ni RIB (minimisation, loi 09-08/CNDP) — un test le verrouille. Délais et sanctions dans `params.ts` (`RegistreParams`), jamais en dur. **Réserve portée sur tout export** : ce registre **ne se substitue ni au livre de paie (art. 371, conservation ≥ 2 ans art. 373) ni au registre des congés payés (art. 246)** — le droit marocain ne connaît pas de « registre unique du personnel » à la française. Voir le skill Claude Code `registre-personnel-maroc`. | ✅ + 52 tests |
| **Socle typographique unique des PDF** (`src/lib/pdf-kit.ts`, + 28 tests) — SOURCE UNIQUE de la mise en page, calquée sur le **gabarit officiel Belkora** (attestation LaTeX de référence) : police à **empattements** (Times) pour les actes et linéale pour les documents tabulaires (bulletin, écritures) ; grille A4 (marge 22 mm, composition 166 mm, réserve de pied 24 mm) ; échelle fermée (raison sociale 19 / titre 15 / section 11 / corps 10,5 / note 8,5 / pied 7,5 pt) ; conversion point → mm (`PT2MM`, `lineHeight`) ; **en-tête** logo carré à gauche + bloc centré (raison sociale, descripteur, `ICE \| IF \| RC \| TP \| CNSS`, `siège \| Tél. \| e-mail`) + filet de marque ; **titre encadré** en capitales espacées ; **signature** à droite (1 signataire) ou en 2 colonnes (contrats) ; **pied** à deux lignes centrées d'identité, paginé `p / total` **seulement au-delà d'une page**, et **sans mention de l'outil** (un acte engage l'entreprise, pas le logiciel) ; **texte enrichi** `**gras**` / `*italique*` mesuré mot par mot avec sa propre graisse pour mettre en évidence noms, dates, durées et montants. Défauts supprimés : les attestations avaient leur propre moteur **sans aucune pagination** (une attestation de stage longue débordait sous le pied, silencieusement) et un facteur d'interligne inventé (`corps × 0,5` au lieu de `corps × 0,3528`) ; un paragraphe plus haut qu'une page débordait malgré `ensure` (pagination désormais **ligne par ligne**) ; les écritures comptables et le rapport de régularisation portaient des **couleurs en dur**, identiques pour toutes les sociétés au lieu de suivre `brand_color`. Aucune couleur ni géométrie en dur hors de ce module (seule exception documentée : le rouge d'alerte `ALERT`, signal et non élément de charte). Voir le skill Claude Code `pdf-mise-en-page-pro`. | ✅ + 28 tests |
| **Rendu PDF sans caractère parasite** (`asciiSpaces`, `src/lib/format.ts`) : `Intl.NumberFormat(fr-*)` sépare les milliers par une **espace fine insécable U+202F**, absente de l'encodage WinAnsi des polices standard jsPDF → glyphe parasite sur le bulletin (« 100 /000 » au lieu de « 100 000 »). Normalisation à la source (mad/num/pct, `capitalMad`) + assainissement défensif de l'en-tête société — rendu identique en PDF, HTML et UI, pour toutes les sociétés. | ✅ + 6 tests |
| **Journal des documents** (`src/lib/doc-log.ts`, moteur pur + tests) — volet dédié « Journal des documents » (groupe Paie & RH). Trace **chaque document réellement produit** — bulletins (PDF/HTML/LaTeX, y compris l'export groupé), documents RH (attestations, contrats, disciplinaire, rupture/STC, mineurs — PDF/HTML/Aperçu) et déclarations CNSS (BDS DAMANCOM / impression) — une trace = un document. **KPI mensuels** : total, ce mois-ci (+ variation vs mois précédent), salariés concernés, dernier document ; **série mensuelle** (12 mois), répartition **par type** et **par format**, **top salariés**, et table filtrable (date, type, format, sujet, période, auteur). Traçage via mutation `{ view:true }` (exporter reste permis en lecture seule), journal **borné** aux 2000 plus récents, purge. Aucune donnée sensible (ni RIB ni montant). | ✅ + 13 tests |
| **Journal des connexions** (`src/lib/login-audit.ts`, moteur pur + tests) — carte **réservée au super administrateur** dans Paramètres. Trace **chaque accès** : connexion **réussie**, **échec** de connexion et **déconnexion** — date/heure, identifiant saisi, compte/rôle/société si connu, résultat et **cause de l'échec** (champs vides / identifiant inconnu / compte désactivé / mot de passe incorrect). **Sécurité** : le mot de passe n'est **jamais** journalisé, même en échec ; journal **borné** aux 500 plus récentes (anti-croissance), filtre par type (connexions / échecs / déconnexions), purge. Capté dans `login()`/`logout()`, persisté via le store (partagé Supabase si activé). | ✅ + 7 tests |

## Assistant IA (page « Assistant IA »)

L'application intègre un assistant conversationnel qui **pilote l'app par prompt** : il lit,
crée, modifie et supprime les données (sociétés, salariés), calcule des bulletins de paie via
le moteur légal et consulte les alertes de conformité, le tout au moyen d'outils (*tool-use*)
branchés sur le store. Le fournisseur est **Claude (Anthropic)** — la même famille de modèles
que celle utilisée par Lovable.

- **Choix du modèle** (Configuration → *Modèle (IA)*), du plus performant au plus rapide :
  - `claude-fable-5` — la plus performante (premium) ;
  - `claude-opus-4-8` — très performante (**modèle par défaut**) ;
  - `claude-sonnet-5` — équilibrée, rapide et économique ;
  - `claude-haiku-4-5` — la plus rapide et la plus économique ;
  - **Personnalisé** — n'importe quel identifiant de modèle Claude valide.
- **Accès selon l'offre API** : les modèles haut de gamme (Fable 5, Opus 4.8) requièrent un
  compte API qui y donne droit. Le bouton **« Tester la connexion »** valide la clé **et** le
  modèle choisi, et signale précisément une clé refusée (401) ou un modèle inaccessible (404).
- **Clé API** : saisie dans Configuration et stockée **uniquement dans ce navigateur**
  (`localStorage`). L'app n'ayant pas de serveur, l'appel part directement du navigateur :
  adapté à un usage **local et personnel**, à ne pas déployer en ligne avec une clé partagée.
- **Garde-fous** : chaque appel d'outil est visible dans le fil, les suppressions demandent une
  confirmation, et aucun taux de paie n'est inventé (calcul délégué à `src/lib/params.ts`).

## Architecture

```
src/
  lib/
    params.ts            Référentiel réglementaire (table payroll_params) — SOURCE UNIQUE des taux
    payroll-engine.ts    Moteur PUR (brut → net → coût employeur), testé
    payroll-engine.test.ts  22 tests unitaires (valeurs vérifiées à la main)
    payroll-helpers.ts   Ponts store ↔ moteur
    pdf-kit.ts           Socle typographique des PDF — SOURCE UNIQUE de la mise en page
    staff-register.ts    Registre des mouvements de main-d'œuvre (moteur PUR, date d'arrêté en paramètre)
    payslip.ts           Exports bulletin PDF / LaTeX / HTML
    rh-legal.ts          Moteur documentaire commun (LegalDoc → PDF paginé / HTML)
    format.ts            MAD, dates FR, montant en toutes lettres
  data/
    types.ts             Types calqués sur le schéma Supabase (§3.1)
    store.ts             Store réactif localStorage + moteur d'alertes
    seed.ts              Jeu de démonstration
  components/
    Layout.tsx           Coquille (sidebar Miya, sélecteur société, thème)
    ui/kit.tsx           Design system (Card, Button, Badge, Table, KPI…)
  pages/                 Dashboard, Employees, Payroll, Declarations, Compliance, Leaves, Settings
```

## Règle permanente de conformité

Tout taux, plafond ou barème vit **exclusivement** dans `src/lib/params.ts` et doit être
re-validé à chaque loi de finances et à chaque revalorisation du SMIG/SMAG par décret.
Le moteur ne contient aucune valeur réglementaire en dur.

## Limites (V1)

- Dépôt DAMANCOM manuel : l'application **prépare** le fichier BDS, le téléversement reste
  sur le portail CNSS (API non publique).
- Identifiants ICE/RC/CNSS du jeu de démonstration = fictifs.
- **Persistance permanente (Supabase)** : `src/lib/supabase.ts` synchronise tout l'`AppState`
  (une ligne JSONB `app_state`) vers Supabase — données **sauvegardées en permanence et
  partagées entre appareils/utilisateurs**, avec fallback localStorage hors-ligne (offline-first,
  écriture débouncée, hydratation au démarrage). Configuration dans **Paramètres → Persistance
  cloud** (URL + clé anon, script SQL fourni) ou via env Vercel (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`). Sans configuration, l'app reste 100 % locale.
