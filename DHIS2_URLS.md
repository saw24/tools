# ✅ URLs DHIS2 Correctes

## 🎯 Problème identifié

D'après les logs, vous utilisez : `https://play.im.dhis2.org`

Cette URL est **incorrecte** ou l'instance n'existe plus.

## ✅ URLs correctes pour DHIS2 Play (Démo)

### Instances stables

```
https://play.dhis2.org/2.40.0
https://play.dhis2.org/2.39.1
https://play.dhis2.org/2.38.6
```

### Instance de développement

```
https://play.dhis2.org/dev
```

## 🔑 Credentials par défaut

Pour toutes les instances DHIS2 Play :

- **Username** : `admin`
- **Password** : `district`

## 🧪 Test rapide

### 1. Dans votre navigateur

Ouvrez : `https://play.dhis2.org/2.40.0/api/me`

Vous devriez voir une demande d'authentification.

### 2. Avec curl

```bash
curl -u "admin:district" "https://play.dhis2.org/2.40.0/api/me"
```

Vous devriez voir les infos de l'utilisateur admin.

## 🔧 Correction dans votre application

### 1. Ouvrez le modal de connexion

### 2. Entrez l'URL correcte

```
URL: https://play.dhis2.org/2.40.0
Username: admin
Password: district
```

### 3. Cliquez sur "Se connecter"

## ⚠️ URLs à éviter

- ❌ `https://play.im.dhis2.org` (n'existe pas/plus)
- ❌ `play.dhis2.org` (manque le protocole https://)
- ❌ `https://play.dhis2.org/` (manque la version)
- ❌ `https://play.dhis2.org/2.40.0/` (slash final à éviter)

## 📋 Checklist

- [ ] Utiliser `https://play.dhis2.org/2.40.0` (ou autre version)
- [ ] Username: `admin`
- [ ] Password: `district`
- [ ] Pas de slash final dans l'URL
- [ ] Vérifier que l'URL fonctionne dans le navigateur

## 🎉 Résultat attendu

Après correction, vous devriez voir dans les logs :

```
=== DHIS2 Proxy Debug ===
URL: https://play.dhis2.org/2.40.0/api/me
Method: GET
Auth Header: Present
```

Et la connexion devrait réussir !

---

**Note** : L'URL `https://play.im.dhis2.org` dans vos logs est la cause du problème. Utilisez `https://play.dhis2.org/2.40.0` à la place.
