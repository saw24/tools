# 📦 Module : Import Indicateurs + Dépendances

## 📋 Vue d'ensemble

Importe sur une instance DHIS2 le paquet JSON produit par le module [Export Indicateurs +
Dépendances](MODULE_EXPORT_INDICATORS_DEPS.md) : indicateurs, types d'indicateur, éléments de données,
chaîne CategoryCombo complète, constantes, groupes d'unités d'organisation, groupes d'indicateurs,
groupes d'options de catégorie, etc.

C'est la « prochaine étape » annoncée dans la documentation du module d'export : consommation du JSON,
aperçu, dry-run puis import réel vers `/api/metadata`.

## 🚀 Utilisation

1. Se connecter à l'instance DHIS2 **cible** (celle qui doit recevoir les indicateurs).
2. **Étape 1 — Fichier** : glisser-déposer (ou sélectionner) le fichier `indicators-export-*.json`
   téléchargé par le module d'export. Un paquet de métadonnées DHIS2 brut (JSON avec des clés comme
   `indicators`, `dataElements`...) est aussi accepté directement.
3. **Étape 2 — Aperçu & Options** : vérifier le nombre d'objets par type et les « points d'attention »
   remontés par l'export (dépendances non résolues automatiquement, ex. programmes référencés par
   `D{...}`/`A{...}`). Choisir la stratégie d'import, le mode atomique et le mode de fusion.
4. **Étape 3 — Dry Run** : simulation via `POST /api/metadata?dryRun=true`. Le rapport détaille le
   statut global, les statistiques par type d'objet (créés/mis à jour/ignorés) et les éventuels messages
   d'erreur DHIS2.
5. **Étape 4 — Import** : une fois le dry-run validé, déclencher l'import réel (même appel sans
   `dryRun=true`). Le rapport final et les statistiques s'affichent de la même façon.

## ⚙️ Options d'import

| Option | Valeurs | Par défaut | Effet |
|---|---|---|---|
| Stratégie (`importStrategy`) | `CREATE_AND_UPDATE`, `CREATE`, `UPDATE` | `CREATE_AND_UPDATE` | Contrôle la création vs mise à jour des objets déjà existants (par UID) sur la cible. |
| Mode atomique (`atomicMode`) | `ALL`, `NONE` | `ALL` | `ALL` annule tout l'import au moindre objet en erreur — recommandé vu les dépendances croisées entre les objets du paquet. |
| Mode de fusion (`mergeMode`) | `MERGE`, `REPLACE` | `MERGE` | `MERGE` ne modifie que les champs présents dans le paquet lors d'une mise à jour ; `REPLACE` remplace l'objet cible entièrement. |
| Inclure les DataSets référencés | case à cocher | **décochée** | Les DataSets du paquet ne portent qu'un jeu de champs minimal (nom, `periodType`, `categoryCombo`) utile uniquement à la résolution des tokens `R{dataSet.METRIC}`. Les inclure dans l'import risque d'écraser des champs du DataSet existant sur la cible (unités d'organisation, éléments de données...) si `mergeMode=REPLACE`. Par défaut ils sont donc exclus de l'envoi : le DataSet doit déjà exister sur la cible. |

## 🔧 Architecture technique

- **Frontend** : `import-indicators-dependencies.html` (page autonome, pas de fichier JS séparé).
- **Backend** : aucun endpoint dédié — les appels passent directement par le proxy générique existant
  (`api/dhis2-proxy.php`, via `dhis2Session.post()`) vers `/api/metadata` de l'instance DHIS2 connectée,
  comme le fait déjà `import-metadata.html`.

## ⚠️ Limitations

- Comme documenté côté export, les **Programmes** référencés par `D{...}`/`A{...}` ne sont pas inclus
  dans le paquet : ils doivent déjà exister sur l'instance cible avant l'import.
- DHIS2 gère lui-même l'ordre d'import des types de métadonnées au sein d'un même appel `/api/metadata` ;
  aucune logique d'ordonnancement client n'est nécessaire ici.
- Le paquet exporté n'est pas modifiable ligne à ligne dans l'interface (pas d'édition manuelle des
  objets) : pour un import partiel, ré-exporter avec une sélection plus restreinte côté module d'export,
  ou éditer le fichier JSON avant de l'importer.

---

**Auteur** : Claude Sonnet 5
**Date** : 2026-09-24
**Version** : 1.0.0
