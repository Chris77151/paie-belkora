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

Aucun backend requis : les données vivent en local (`localStorage`) à partir d'un jeu
de démonstration (2 sociétés, 7 salariés). L'architecture reste calquée sur le schéma
Supabase de la spécification pour un branchement ultérieur.

## Ce qui est couvert

| Domaine | État |
|---|---|
| Moteur de paie Maroc (SMIG 17,92/191 h, CNSS 4,48 % plafond 6 000, AMO 2,26 %, IR barème LF 2025, frais pro 35 %/25 %, prime d'ancienneté, HS art. 201) | ✅ + 22 tests |
| Paramètres réglementaires isolés dans `payroll_params` (aucun taux en dur) | ✅ |
| 7 pages : Tableau de bord, Salariés, Paie, Déclarations, Conformité, Congés, Paramètres | ✅ |
| Bulletin de paie : PDF (jsPDF + logo), LaTeX (.tex), HTML imprimable | ✅ |
| **Documents RH** (gabarit MBD, PDF + HTML) : attestations/certificats · contrats de travail chantier · **kit disciplinaire** (avertissement → licenciement, art. 37-39/62) · **kit rupture** (PV de fin de travaux, accord de rupture amiable, reçu pour solde de tout compte — art. 33/73-76) · **kit mineurs** (autorisation du représentant légal + contrat travail déterminé mineur, art. 143-181) **bilingue FR / AR (arabe RTL)** — zéro invention, champs absents en pointillé | ✅ |
| **Calcul automatique du solde de tout compte (STC)** (`src/lib/stc-engine.ts`, moteur pur + 28 tests) : préavis (art. 43 — cadres 1/2/3 mois, non-cadres 8 j/1 mois/2 mois), indemnité légale de licenciement (art. 52-53 — 96/144/192/240 h par année, **exonérée**), congés payés non pris (art. 231), dommages-intérêts licenciement abusif (art. 41 — 1,5 mois/an plaf. 36 mois), indemnité de fin de CDD (7 %), puis traitement social/fiscal (CNSS/AMO/IR) → **NET**. Le motif de départ pilote les postes ; décompte injecté dans le reçu. Aucun taux en dur (barèmes dans `params.ts`). | ✅ + 28 tests |
| **Bascule de langue FR / AR** (`src/lib/i18n.ts`) : bouton dans l'en-tête, `dir="rtl"` + police arabe en mode arabe (MSA, ponctuation ، ؛ ؟), coquille traduite (navigation, en-tête, pied), préférence mémorisée. Dictionnaire extensible clé par clé. | ✅ |
| Calcul en masse, saisie variable, validation & gel de période | ✅ |
| Bordereau CNSS + fichier BDS DAMANCOM, état 9421/IR | ✅ |
| Moteur d'alertes de conformité (CNSS, CIN, mineur, CDD, contrat) | ✅ |
| Congés payés, soldes, absences/IPE | ✅ |
| Écritures comptables de paie (OD + règlement), PCGE validé expert-comptable | ✅ + 8 tests d'équilibre |
| Export des écritures : XML · Excel (.xlsx) · PDF | ✅ |
| Multi-sociétés : création / suppression de sociétés | ✅ |
| Import Odoo des salariés (JSON-RPC hr.employee, filtré par company_id ; salaire réel `wage`, CNSS `l10n_ma_cnss_number`, CIN) | ✅ |
| **Audit comptable & financier** (déterministe, sans IA) : revue par les 13 **assertions d'audit** (flux / soldes / présentation). Périmètre **paie locale** (sous-SMIG, charges patronales, cut-off, CNSS/CIN, équilibre, classification 4441/4457, provisions…) **+ toute la comptabilité Odoo** si connectée — lecture seule des soldes postés : balance générale équilibrée, écritures en brouillon, journaux sans écriture, charges/produits au solde anormal, clients créditeurs / fournisseurs débiteurs, comptes d'attente non soldés, cohérence TVA 4455/3455. Détail + recommandation (CGNC/PCGE, CGI, CNSS) + action Odoo, score de fiabilité | ✅ |
| **Assistant IA conversationnel** (Claude via SDK Anthropic, *tool-use*) : lit, crée, modifie, supprime salariés et sociétés, calcule des bulletins, consulte les alertes — **choix du modèle** (Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 ou identifiant personnalisé), test de connexion, suppressions confirmées | ✅ |

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
    payslip.ts           Exports bulletin PDF / LaTeX / HTML
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
- Persistance locale ; l'adaptateur Supabase (RLS, Edge Functions, audit CNDP) reste à brancher.
