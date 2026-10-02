# Module : Affectation des Groupes aux Structures

Affecte des groupes d'unités d'organisation DHIS2 aux structures, dans une table interactive (une case à cocher par groupe). Les structures sans groupe sont prioritaires. Ce module remplace l'ancien module « Structures sans Groupe » (`descendant-structures-filter.html`, supprimé).

## Fichiers

- `assign-structures-groups.html` : interface (jQuery, `dhis2Session`, même socle que les autres modules)
- `api/assign-org-units-groups.php` : API backend (proxy vers DHIS2)

## Utilisation

1. Se connecter à DHIS2 (sinon redirection vers `index.html`).
2. Choisir une catégorie dans la barre latérale :
   - **Sans groupe** (par défaut, prioritaire)
   - **Groupes incomplets** : au moins un groupe, mais moins que le total des groupes existants
   - **Complets** : appartient à tous les groupes
3. Filtrer (voir ci-dessous), cocher ou décocher les groupes voulus.
4. Cliquer sur **Appliquer les changements**.

## Fonctionnalités

### Filtres (se combinent entre eux)
- **Nom** : recherche insensible à la casse et aux accents.
- **Niveau** : liste des niveaux d'organisation DHIS2.
- **Groupes** : chaque groupe est un filtre à trois états. 1 clic : a le groupe (vert) ; 2 clics : n'a pas le groupe (rouge, barré) ; 3 clics : aucun filtre. Le filtre porte sur les groupes déjà enregistrés, pas sur les cases en cours de modification. Le lien « Effacer les filtres » les retire tous.
- Changer de catégorie réinitialise les filtres et **efface les modifications en attente**.

### Table
- Pagination (50 / 100 / 200 / 500 lignes, 100 par défaut), indispensable avec des milliers de structures.
- Colonnes « sélection » et « Structure » figées à gauche, colonne « Total » figée à droite, en-tête figé en haut (fond opaque).
- Noms de groupes affichés à la verticale dans l'en-tête.
- Au survol d'une case, sa ligne et sa colonne sont surlignées ; au clic, le surlignage reste (plus foncé) jusqu'au clic suivant.
- Cases à cocher à fond transparent.
- La barre d'info indique le nombre de structures (« 12 sur 130 » si filtré) et le nombre de modifications en attente.

### Export CSV
Bouton « Exporter CSV » : exporte tout le résultat filtré de la catégorie (toutes pages). Colonnes : `ID, Nom, Niveau, Parent Direct, Groupes`. Encodage UTF-8 avec BOM, fichier `structures_<catégorie>_<date>.csv`.

### Enregistrement
- Les modifications restent locales tant que « Appliquer » n'est pas cliqué.
- Envoi **par lots de 20 structures**, avec compteur de progression sur un écran de blocage qui interdit toute modification de l'interface pendant l'opération.
- Après succès, seules les données locales sont mises à jour (pas de rechargement complet depuis DHIS2) : la catégorie active reste affichée, les structures qui changent d'état en sortent, les compteurs sont recalculés, les filtres sont conservés.
- En cas d'échec partiel, un message affiche la première erreur DHIS2 ; les structures en échec gardent leurs modifications en attente pour une nouvelle tentative.
- Limite connue : en cas de modification concurrente par un autre utilisateur, recharger la page pour voir les données à jour.

## API (`api/assign-org-units-groups.php`)

Toutes les actions : `POST` JSON avec `dhis2_url` et `dhis2_auth` (en-tête `Authorization`), action passée en `?action=`.

| Action | Rôle |
|--------|------|
| `groups` | Liste des groupes (`id`, `displayName`), triée par nom |
| `list` | Toutes les structures (`id`, `displayName`, `path`, `level`, `parent`, groupes), classées en `without_groups`, `incomplete_groups`, `complete`, avec les totaux |
| `stats` | Nombre total de structures et de groupes |
| `assign` | Corps : `assignments: [{ouId, groupIds}]` (liste complète des groupes souhaités). Réponse : `results.success`, `results.failed`, `successCount`, `failedCount` |

### Pourquoi l'affectation passe par les groupes

Dans DHIS2, la relation structure/groupe appartient au **groupe** : un `PATCH` sur `/api/organisationUnits/{id}` avec `organisationUnitGroups` n'a aucun effet. Pour chaque structure, l'API :

1. lit ses groupes actuels (`GET /api/organisationUnits/{id}?fields=organisationUnitGroups[id]`) ;
2. ajoute les groupes manquants : `POST /api/organisationUnitGroups/{groupId}/organisationUnits/{ouId}` ;
3. retire les groupes décochés : `DELETE` sur la même URL.

`set_time_limit(300)` est appliqué par requête, d'où les lots de 20 côté interface.

## Droits requis

L'utilisateur DHIS2 doit pouvoir modifier les groupes d'unités d'organisation et voir les structures concernées. Sans cela, l'enregistrement échoue avec le message d'erreur DHIS2.

## Dépannage

- **404 sur l'API** : l'URL doit rester relative (`api/assign-org-units-groups.php`).
- **`showToast is not defined`** : la fonction est définie dans la page (pas dans les scripts partagés) ; ne pas retirer son bloc.
- **Erreurs 502 sur `interactions.php` / `stats.php`** : indépendantes de ce module (base de données des statistiques inaccessible).
- **« 0 structures mises à jour »** : lire le message d'erreur affiché ; le plus souvent un droit DHIS2 manquant.

## Pistes d'évolution

- Regrouper les colonnes par ensemble de groupes DHIS2 et définir « incomplet » comme « sans groupe dans un ensemble de groupes donné » (plus pertinent que le total des groupes).
- Confirmation avant de changer de catégorie quand des modifications sont en attente.
- Journal des affectations effectuées.
