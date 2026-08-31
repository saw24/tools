# 📦 Module : Export de Valeurs de Données

## 📋 Vue d'ensemble

Le module **Export de Valeurs de Données** (`export-data-values.html`) permet d'exporter des
`dataValues` DHIS2 aux formats **XLSX**, **CSV** et **JSON**, en respectant strictement la
structure attendue par DHIS2 pour un ré-import (`dataValueSet`).

C'est un assistant en 4 étapes, avec possibilité de revenir en arrière à tout moment sans perdre
la sélection déjà faite.

## 🧭 Étapes

1. **Éléments de données** — 3 modes de sélection, cumulables dans un panier commun :
   - **Recherche directe** : recherche/multi-sélection par UID, nom ou code.
   - **Par ensemble de données** : cocher un ou plusieurs *datasets*, puis ajouter tous leurs
     éléments au panier.
   - **Par groupe d'éléments** : cocher un ou plusieurs *dataElementGroups*, puis ajouter tous
     leurs membres au panier.
2. **Unités d'organisation** — arbre hiérarchique à cases à cocher + recherche, multi-sélection
   libre (pas de parent unique imposé). Option « Inclure les sous-unités » (descendants).
3. **Périodes** — deux sous-onglets :
   - **Fixes** : type de période (quotidien, hebdomadaire, mensuel, bimestriel, trimestriel,
     semestriel, annuel), sélection d'année(s) ou plage de dates pour le quotidien, puis
     coche/recherche des périodes générées.
   - **Relatives** : périodes relatives façon DHIS2 (Aujourd'hui, 12 derniers mois, Trimestre
     dernier, Cette année, 5 dernières années, etc.), résolues côté client en périodes concrètes
     à partir de la date du jour.
   Les deux modes sont cumulables ; le total de périodes effectives est affiché en résumé.
4. **Aperçu & Export** — récupération des `dataValues` via `/api/dataValueSets.json`, tableau
   d'aperçu (unité, élément, catégorie, période, valeur) avec recherche et sélection ligne par
   ligne (désactivée au-delà de 3000 lignes pour rester fluide — l'export inclut alors la
   totalité des données récupérées), puis boutons d'export JSON / CSV / XLSX.

## 🗓️ Périodes : identifiants exacts vs. plage de dates

DHIS2 stocke chaque valeur sous l'identifiant **exact** de sa période de collecte (ex.
`2026W31` pour une semaine). Une requête `dataValueSets?period=202608` (Mensuel, Août 2026) ne
retrouve **jamais** une donnée stockée en `2026W31`, même si cette semaine tombe bien en août :
DHIS2 ne convertit pas les identifiants d'un type de période vers un autre.

Pour éviter ce piège, le module calcule si les périodes sélectionnées (étape 3) forment un
**intervalle calendaire continu** (ex. tout le mois d'août, ou plusieurs mois/semaines qui se
suivent sans trou). Si c'est le cas, l'export interroge DHIS2 avec `startDate`/`endDate` plutôt
qu'avec des identifiants de période : DHIS2 renvoie alors toutes les valeurs dont la période est
entièrement comprise dans cet intervalle, **quel que soit son propre `periodType`** — cela
fonctionne même si les données sont collectées en hebdomadaire alors que « Mensuel » a été
choisi comme type d'affichage. Un bandeau bleu confirme cette optimisation en étape 3.

Si la sélection de périodes comporte des trous (ex. Janvier + Mars 2026 sans Février), la
requête repasse par des identifiants de période exacts ; dans ce cas seulement, le type de
période choisi doit correspondre au type de collecte réel des éléments, et un bandeau
d'avertissement (ambre) s'affiche si une incohérence est détectée (déduite du/des ensemble(s)
de données utilisé(s) pour ajouter les éléments via le mode « Par Ensemble de données »).

## 📤 Formats d'export (compatibles import DHIS2)

### JSON

```json
{
  "dataValues": [
    {
      "dataElement": "fbfJHSPpUQD",
      "period": "202501",
      "orgUnit": "DiszpKrYNg8",
      "categoryOptionCombo": "HllvX50cXC0",
      "attributeOptionCombo": "HllvX50cXC0",
      "value": "12"
    }
  ]
}
```

### CSV / XLSX

Colonnes, dans l'ordre standard DHIS2 (`dataelement,period,orgunit,categoryoptioncombo,
attributeoptioncombo,value,storedby,lastupdated,comment,followup`). Par défaut, **aucune ligne
d'en-tête** n'est ajoutée (le format d'import CSV/XLS de DHIS2 est sans en-tête) ; une case à
cocher permet d'en ajouter une pour une lecture plus confortable, à retirer avant un import.

## 🔧 Aspects techniques

- Fichiers : `export-data-values.html`, `js/export-data-values.js`.
- Dépendances : jQuery 3.6, SheetJS (`xlsx.full.min.js`), `dhis2-session-manager.js`,
  `dhis2-auth.js`, `interaction-manager.js`, `api/dhis2-proxy.php` (déjà existant, aucune
  modification nécessaire).
- Les requêtes `/api/dataValueSets.json` sont découpées par lots (50 éléments de données × 100
  unités d'organisation × 100 périodes par requête) avec une barre de progression, pour rester
  robuste sur de gros volumes.
- Les libellés de périodes (fixes ou relatives) sont calculés localement (`PeriodUtils`), sans
  appel réseau supplémentaire.

## ⚠️ Limitations

- Les types de périodes financières (`FinancialYear` variantes) ne sont pas couverts.
- L'aperçu interactif (sélection ligne par ligne) est désactivé au-delà de 3000 lignes ; l'export
  reste néanmoins complet.
