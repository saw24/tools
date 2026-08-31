# 📊 Module : Statistiques d'Utilisation

## 📋 Vue d'ensemble

La section **Statistiques d'Utilisation** (bas de `index.html`) suit la fréquentation des
modules de l'application : compteur de visites par module, badge d'usage sur chaque carte du
tableau de bord, graphique d'activité et répartition par catégorie. Elle repose sur une base
PostgreSQL, partagée avec le module Commentaires/Notifications (`api/interactions.php`).

Ce document décrit l'architecture actuelle (revue le 2026-08-31) : configuration par `.env`
externe, schéma en base événementiel (journal de visites plutôt que compteur agrégé), catalogue
de modules garantissant qu'aucun module n'est "invisible" des statistiques, et le frontend
associé.

## 🔐 Configuration — fichier `.env` externe au dossier servi

Les identifiants PostgreSQL ne sont **plus codés en dur** dans le code. Ils sont lus depuis un
fichier `.env` que vous placez **hors du dossier servi par le serveur web**, afin qu'il ne soit
jamais accessible via une URL.

### 1. Créer le fichier `.env` réel

Copiez `.env.example` (à la racine du dépôt, un simple modèle) vers un emplacement **externe**,
par exemple :

```bash
mkdir -p /etc/dhis2-tools        # ou tout autre emplacement de votre choix
cp .env.example /etc/dhis2-tools/.env
nano /etc/dhis2-tools/.env       # renseignez DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
```

### 2. Indiquer le chemin — méthode simple (recommandée pour démarrer)

Ouvrez `api/env.php` et éditez directement la ligne suivante avec le chemin absolu choisi
ci-dessus :

```php
define('DHIS2_TOOLS_ENV_PATH', '/etc/dhis2-tools/.env');
```

C'est la méthode la plus simple : aucune configuration serveur nécessaire, et elle évite un
piège classique de **PHP-FPM**, dont la valeur par défaut `clear_env = yes` **ignore
silencieusement** les variables positionnées par `SetEnv` (Apache) ou `export` (shell) — un
`api/stats.php` qui renvoie une réponse vide ou une 502 malgré un `.env` bien rempli est souvent
dû à ça.

### 2bis. Méthode avancée — variable d'environnement système

Si vous préférez ne pas toucher au code (utile pour du déploiement scripté/CI), laissez
`DHIS2_TOOLS_ENV_PATH` à `''` dans `api/env.php` et positionnez la variable d'environnement du
même nom **au niveau du process qui exécute PHP** :

```apache
# Apache : redémarrer après modification, et vérifier que mod_env est actif
SetEnv DHIS2_TOOLS_ENV_PATH /etc/dhis2-tools/.env
```

```ini
; php-fpm (pool .conf) : nécessite clear_env = no, sinon SetEnv/export sont ignorés
env[DHIS2_TOOLS_ENV_PATH] = /etc/dhis2-tools/.env
```

```bash
# php -S (test rapide) : export dans le MÊME shell qui lance php -S
export DHIS2_TOOLS_ENV_PATH=/etc/dhis2-tools/.env
php -S 0.0.0.0:8000
```

### Ordre de résolution

`api/env.php` résout le chemin dans cet ordre : 1) constante `DHIS2_TOOLS_ENV_PATH` éditée dans
le fichier, 2) à défaut, variable d'environnement système du même nom, 3) à défaut des deux,
repli automatique sur `dhis2-tools.env` un niveau au-dessus de la racine de l'app. Aucune autre
partie du code ne lit `.env` directement — tout passe par `envGet()`.

## 🗄️ Schéma de base de données

### Tables

| Table | Rôle |
|---|---|
| `t_modules` | **Catalogue** de tous les modules de l'application (source de vérité). |
| `t_module_visits` | **Journal** des visites : une ligne par visite (`module_id`, `visited_at`). |
| `t_module_comments` | Commentaires/notes laissés sur un module (inchangé). |
| `t_module_notifications` | Notifications affichées sur le tableau de bord (inchangé). |

### Pourquoi un catalogue + un journal, plutôt qu'un compteur agrégé ?

L'ancien schéma (`t_module_stats`) stockait un simple compteur par module, mis à jour au fil des
visites : un module jamais cliqué n'avait **aucune ligne**, donc restait invisible des
statistiques — c'est ce que corrige le nouveau schéma :

- `t_modules` est peuplé avec **tous** les modules connus (voir `api/module_catalog.php`), qu'ils
  aient été visités ou non. `get_stats` fait un `LEFT JOIN` vers les visites agrégées, donc un
  module jamais utilisé apparaît avec `visit_count = 0` au lieu de ne pas apparaître du tout.
- `t_module_visits` conserve **un événement par visite** (horodaté) plutôt qu'un simple total :
  cela permet un vrai historique et le graphique d'activité par jour (`get_visits_timeseries`),
  ce qu'un compteur agrégé ne permettait pas.

### Créer/mettre à jour le schéma

Deux façons équivalentes, à choisir selon votre contexte :

**a) Automatique (recommandé pour un premier déploiement)** — un simple appel HTTP crée les
tables si besoin et (re)synchronise le catalogue de modules :

```bash
curl "http://votre-serveur/api/stats.php?action=init"
# {"success":true,"message":"Base de données initialisée (24 module(s) catalogués)"}
```

Idempotent : à rappeler après chaque ajout de module dans `api/module_catalog.php` pour que la
base reprenne les nouveaux modules (nom, icône) sans rien casser.

**b) Migration SQL explicite** — `migrations/2026-08-31_init_schema.sql` contient un instantané
SQL complet du même schéma, avec en prime une reprise automatique des données de l'ancien
`t_module_stats` s'il existe (renommé en `t_module_stats_legacy_20260831`, jamais supprimé) :

```bash
psql -h <host> -p <port> -U <user> -d dhis2_tools -f migrations/2026-08-31_init_schema.sql
```

Les tables `t_module_comments`/`t_module_notifications` se créent quant à elles **toujours**
automatiquement au premier chargement de n'importe quelle page (`InteractionManager.initUI()`).

## 🧩 Catalogue de modules — éviter les statistiques manquantes

`api/module_catalog.php` liste, pour chaque module, son chemin, son nom affiché, sa catégorie et
son icône. C'est la **source de vérité** :

```php
array('path' => 'export-data-values.html', 'name' => 'Export Valeurs de Données', 'category' => 'Export', 'icon' => 'fa-file-export'),
```

**⚠️ À chaque nouveau module (nouvelle page `.html`) :**
1. Ajoutez une ligne dans `api/module_catalog.php`.
2. Ajoutez une carte correspondante dans `index.html` (`.modules-grid`).
3. Relancez `curl ".../api/stats.php?action=init"` (ou attendez la prochaine visite du module :
   `track_visit` crée aussi la ligne à la volée si elle manque encore, avec la catégorie par
   défaut `Autre`).

Un module oublié de ce catalogue continue de fonctionner (`track_visit` le crée quand même à la
première visite), mais il vaut mieux l'y ajouter explicitement pour contrôler sa catégorie/icône
et pour qu'il apparaisse dès l'installation, même sans avoir encore été visité.

Au 2026-08-31, tous les modules exposés sur `index.html` sont catalogués, ainsi que
`import-metadata.html` qui existait dans le dépôt mais n'était jusque-là lié depuis aucune carte
du tableau de bord (ni donc suivi dans les statistiques) — corrigé dans cette révision.

## 🔌 API (`api/stats.php`)

| Action | Méthode | Description |
|---|---|---|
| `init` | GET/POST | Crée les tables si besoin + (re)synchronise le catalogue de modules. |
| `track_visit` | POST `{moduleName, modulePath}` | Enregistre une visite (upsert du module + insertion d'un événement). |
| `get_stats` | GET | Statistiques par module (tous les modules actifs, y compris 0 visite). |
| `get_visits_timeseries` | GET `?days=14` | Visites par jour sur les N derniers jours (1 à 90), jours vides inclus à 0. |

## 🎨 Frontend (`index.html`)

La section Statistiques a été redécoupée en quatre blocs (`js` inline de `index.html`,
`js/stats-manager.js` pour les appels réseau) :

1. **Cartes de synthèse** — visites totales, modules déjà utilisés (`x / total`), module le plus
   utilisé, dernière activité (formatage relatif « il y a X min/h/j »).
2. **Graphique d'activité** — barres CSS pures (pas de dépendance JS supplémentaire) sur les 14
   derniers jours, alimentées par `get_visits_timeseries`.
3. **Répartition par catégorie** — barres de progression par catégorie (Export/Import/Analyse/
   Suppression/Gestion/Utilitaire), calculées côté client à partir de `get_stats`.
4. **Tableau complet des modules** — nom, catégorie (badge coloré déterministe par hash de
   texte), visites (ou « Jamais utilisé »), dernière visite ; filtrable via le champ de recherche
   dédié. Remplace l'ancienne grille tronquée aux 7 modules les plus visités : tous les modules
   sont désormais listés, y compris ceux jamais utilisés.

Le badge « éclair » sur chaque carte du tableau de bord (`module-usage-badge`) n'est mis à jour
que pour les modules ayant au moins une visite, afin de ne pas écraser un badge statique existant
(ex: « Nouveau ») sur un module tout juste ajouté et pas encore utilisé.

## 🆘 Dépannage

- **La section reste vide / « Statistiques indisponibles »** : vérifiez la réponse de
  `api/stats.php?action=get_stats` — en cas d'échec de connexion, le champ `diagnostic` indique
  le chemin `.env` résolu et s'il a été trouvé, sans jamais exposer le mot de passe.
- **`pdo_pgsql` manquant** : `php -m | grep pgsql` doit lister `pgsql` et `pdo_pgsql`. Attention,
  le PHP en ligne de commande (`php -v`) n'est pas forcément le même que celui utilisé par votre
  pool PHP-FPM (souvent le cas avec Herd/Valet/Caddy) : vérifiez l'extension côté FPM, pas juste
  en CLI.
- **502 Bad Gateway sur `api/stats.php` ou `api/interactions.php` derrière un reverse proxy**
  (Caddy, nginx, Herd, Valet...) alors qu'un test direct en `php -S` fonctionne : c'est le signe
  d'un crash PHP-FPM (erreur fatale non catchée), pas d'un souci réseau. Cause fréquente :
  certains pools PHP-FPM durcis désactivent `putenv()`/`getenv()` via `disable_functions` — notre
  `api/env.php` les enveloppe déjà de façon défensive (`function_exists()` avant tout appel), mais
  gardez le réflexe si vous ajoutez du code touchant à l'environnement système.
  **Important** : après avoir corrigé la cause, un simple rechargement de page ne suffit parfois
  pas — le worker PHP-FPM qui a planté peut rester dans un état bloqué. Redémarrez PHP-FPM *et*
  le reverse proxy (`brew services restart php`, `brew services restart caddy`, ou l'équivalent
  de votre stack) pour repartir sur un état propre.
- **Un module n'apparaît pas dans le tableau** : vérifiez qu'il est bien dans
  `api/module_catalog.php`, puis relancez `?action=init`.
