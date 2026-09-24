# 📦 Module : Export Indicateurs + Dépendances

## 📋 Vue d'ensemble

Exporte des indicateurs DHIS2 avec **toutes les dépendances nécessaires à leur réimport** sur une autre instance. C'est l'équivalent, pour les indicateurs, du module [Export Éléments de Données + Dépendances](MODULE_EXPORT_DATA_ELEMENTS_DEPS.md).

Les indicateurs sont l'objet DHIS2 le plus difficile à migrer « à la main » car leur numérateur et leur dénominateur sont des **expressions textuelles** qui encodent des références à d'autres objets (éléments de données, constantes, groupes d'unités, autres indicateurs...). Le module parse ces expressions pour découvrir automatiquement tout ce qui doit accompagner l'indicateur.

## 🎯 Dépendances résolues automatiquement

À partir du numérateur/dénominateur (`#{...}`, `C{...}`, `R{...}`, `OUG{...}`, `I{...}`, `D{...}`, `A{...}`) :

| Token | Dépendance résolue |
|---|---|
| `#{de}` / `#{de.coc}` / `#{de.coc.aoc}` | DataElement + CategoryCombo → Categories → CategoryOptions → CategoryOptionCombos |
| `C{uid}` | Constant |
| `R{dataSet.METRIC}` | DataSet (taux de complétude) + sa chaîne CategoryCombo |
| `OUG{uid}` | OrganisationUnitGroup |
| `I{uid}` | Indicateur imbriqué (résolution **récursive**, profondeur max 10, jusqu'à 200 indicateurs) |
| `D{program.de}` | DataElement de programme (le **Programme** lui-même n'est pas exporté — voir Limitations) |
| `A{program.attr}` | TrackedEntityAttribute (le Programme n'est pas exporté) |

Plus : `IndicatorType`, `LegendSets` (optionnel), `IndicatorGroups`/`IndicatorGroupSets` et `CategoryOptionGroups`/`GroupSets` (optionnels).

## 🚀 Utilisation

1. Se connecter à l'instance DHIS2 source.
2. Saisir un ou plusieurs UID d'indicateurs (séparés par `;` ou `,`).
3. Choisir les options (LegendSets, Groups, GroupSets).
4. Cliquer sur **Exporter**. Un fichier `indicators-export-YYYY-MM-DD.json` est téléchargé.
5. Vérifier le panneau **Points d'attention** : il liste les dépendances qui n'ont pas pu être résolues automatiquement (ex. programmes référencés par `D{...}`/`A{...}`) et qui doivent déjà exister sur l'instance cible.

## 🔧 Architecture technique

- **Frontend** : `export-indicators-dependencies.html`
- **Backend** : `api/export-indicators-deps.php`

### Différence de performance avec les autres modules d'export

Les modules d'export existants (`export-data-elements-deps.php`, `export-form-deps.php`) font **un appel HTTP par objet** dans des boucles `foreach`. Ce module batche systématiquement les lectures via `filter=id:in:[...]` par paquets de 100 UID (`bulkFetch()`), ce qui réduit le nombre de requêtes DHIS2 d'un facteur proportionnel au nombre d'objets exportés — déterminant pour un indicateur qui peut référencer des dizaines d'éléments de données.

## ⚠️ Limitations

- **Programmes** (`D{...}`, `A{...}`) : seuls le DataElement/TrackedEntityAttribute référencés sont exportés, pas le Programme complet (hors périmètre — export de programme = module à part entière). Le programme doit déjà exister sur l'instance cible.
- **ValidationRules / Predictors** utilisant l'indicateur : non inclus (comme pour le module Data Elements).
- **CategoryOptionGroups** exportés conservent leur liste `categoryOptions[]` complète (pas seulement l'intersection avec l'export), comme dans le module Data Elements — limitation héritée du même choix de conception.

## 🔮 Suite

Le module d'**import** correspondant (consommation du JSON produit ici, avec dry-run et import réel vers `/api/metadata`) est la prochaine étape.
