# Excel Mapping Intelligent - Application Moderne

Une application web élégante et interactive pour mapper automatiquement des colonnes Excel entre différentes feuilles en utilisant l'algorithme de Levenshtein.

## 🎨 Fonctionnalités

### Interface Utilisateur
- ✨ **Design Glassmorphism** avec effets de transparence et flou
- 🎭 **Animations fluides** et transitions CSS
- 🌈 **Gradients dynamiques** en arrière-plan
- 📱 **Responsive Design** pour tous les appareils
- 🎯 **Drag & Drop** pour l'upload de fichiers
- 🔍 **Recherche en temps réel** dans les résultats
- 📊 **Filtres intelligents** par niveau de confiance
- 📄 **Pagination** pour grandes quantités de données

### Fonctionnalités Métier
- 📁 **Multi-feuilles** : Sélection indépendante des feuilles source et cible
- 🤖 **Mapping Automatique** : Algorithme de Levenshtein pour trouver les meilleures correspondances
- ✏️ **Modification Manuelle** : Possibilité de corriger les correspondances
- 📈 **Score de Confiance** : Indicateur visuel de la qualité du mapping
- 💾 **Export Excel** : Téléchargement des résultats en format Excel
- 🎨 **Indicateurs Visuels** : Codes couleur pour identifier rapidement la qualité

## 🚀 Installation

### Prérequis
- Serveur web (Apache, Nginx, ou serveur PHP intégré)
- PHP 7.4 ou supérieur
- Navigateur web moderne (Chrome, Firefox, Safari, Edge)

### Installation Simple

1. **Cloner ou télécharger** le dossier `jquery-php`

2. **Démarrer un serveur PHP** :
   ```bash
   cd jquery-php
   php -S localhost:8000
   ```

3. **Ouvrir dans le navigateur** :
   ```
   http://localhost:8000
   ```

### Installation avec Apache/Nginx

1. Copier le dossier dans votre répertoire web (htdocs, www, etc.)
2. Configurer les permissions :
   ```bash
   chmod 755 jquery-php
   chmod 777 jquery-php/uploads
   chmod 777 jquery-php/exports
   chmod 777 jquery-php/saved_mappings
   ```
3. Accéder via votre navigateur

## 📖 Utilisation

### Étape 1 : Importer un fichier Excel
- Glissez-déposez votre fichier Excel (.xlsx, .xls, .csv)
- Ou cliquez sur "Parcourir les fichiers"

### Étape 2 : Configuration
- **Source** : Sélectionnez la feuille et la colonne à mapper
- **Cible** : Sélectionnez la feuille et la colonne de référence
- Les statistiques (nombre de lignes et valeurs uniques) s'affichent automatiquement

### Étape 3 : Lancer le Mapping
- Cliquez sur "Lancer le Mapping Intelligent"
- L'algorithme analyse et trouve les meilleures correspondances
- Une barre de progression indique l'avancement

### Étape 4 : Vérifier et Modifier
- **Filtres** : Affichez uniquement les correspondances haute/moyenne/faible confiance
- **Recherche** : Trouvez rapidement une valeur spécifique
- **Modification** : Changez manuellement une correspondance via le menu déroulant
- **Score** : Visualisez la confiance de chaque mapping (vert > 80%, orange > 50%, rouge ≤ 50%)

### Étape 5 : Exporter
- Cliquez sur "Exporter en Excel"
- Le fichier contient toutes les correspondances avec leurs scores

## 🎨 Design & UX

### Palette de Couleurs
- **Primary** : Violet (#6366f1) - Actions principales
- **Secondary** : Rose (#ec4899) - Éléments secondaires
- **Success** : Vert (#10b981) - Succès et haute confiance
- **Warning** : Orange (#f59e0b) - Moyenne confiance
- **Danger** : Rouge (#ef4444) - Faible confiance

### Animations
- **Orbes flottants** en arrière-plan
- **Transitions fluides** sur tous les éléments interactifs
- **Effet de survol** sur les cartes et boutons
- **Shimmer effect** sur la barre de progression
- **Bounce animation** sur l'icône d'upload

### Responsive
- **Desktop** : Interface complète avec toutes les fonctionnalités
- **Tablet** : Adaptation de la grille et des espacements
- **Mobile** : Interface optimisée avec navigation simplifiée

## 🔧 Architecture Technique

### Frontend
- **HTML5** : Structure sémantique
- **CSS3** : Glassmorphism, animations, gradients
- **jQuery 3.6** : Manipulation DOM et événements
- **SheetJS (xlsx)** : Lecture et écriture de fichiers Excel

### Backend (Optionnel)
- **PHP 7.4+** : API REST pour opérations serveur
- **Endpoints** :
  - `POST /api.php?action=upload` : Upload de fichier
  - `POST /api.php?action=process` : Traitement côté serveur
  - `POST /api.php?action=export` : Export des résultats
  - `POST /api.php?action=save` : Sauvegarde de configuration
  - `GET /api.php?action=load` : Chargement de configuration

### Algorithme
**Levenshtein Distance** : Calcule la similarité entre deux chaînes
- Distance minimale de modifications (insertion, suppression, substitution)
- Score normalisé entre 0 et 1
- Insensible à la casse

## 📁 Structure des Fichiers

```
jquery-php/
├── index.html          # Page principale
├── styles.css          # Styles et animations
├── app.js             # Logique JavaScript
├── api.php            # Backend PHP (optionnel)
├── uploads/           # Fichiers uploadés (créé automatiquement)
├── exports/           # Fichiers exportés (créé automatiquement)
└── saved_mappings/    # Configurations sauvegardées (créé automatiquement)
```

## 🎯 Fonctionnalités Avancées

### Toast Notifications
- Notifications élégantes pour chaque action
- Types : Success, Error, Info, Warning
- Auto-dismiss après 4 secondes

### Statistiques en Temps Réel
- Nombre de lignes par feuille
- Valeurs uniques par colonne
- Distribution des scores de confiance

### Filtres Intelligents
- **Tous** : Affiche toutes les correspondances
- **Haute confiance** : Score > 80%
- **Moyenne** : Score entre 50% et 80%
- **Faible** : Score ≤ 50%

### Pagination
- 20 résultats par page
- Navigation fluide
- Scroll automatique vers le haut

## 🔒 Sécurité

- Validation des types de fichiers
- Échappement HTML pour prévenir XSS
- Nettoyage automatique des fichiers temporaires
- Noms de fichiers sécurisés

## 🌐 Compatibilité Navigateurs

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Opera 76+

## 📝 Notes de Développement

### Personnalisation des Couleurs
Modifiez les variables CSS dans `styles.css` :
```css
:root {
    --primary: #6366f1;
    --secondary: #ec4899;
    --success: #10b981;
    /* ... */
}
```

### Ajustement de la Pagination
Dans `app.js`, modifiez :
```javascript
const itemsPerPage = 20; // Changez selon vos besoins
```

### Nettoyage Automatique
Ajoutez à votre crontab :
```bash
0 2 * * * curl http://localhost:8000/api.php?cleanup=true
```

## 🐛 Dépannage

### Le fichier ne se charge pas
- Vérifiez le format (xlsx, xls, csv uniquement)
- Assurez-vous que le fichier n'est pas corrompu
- Vérifiez la console du navigateur pour les erreurs

### Les résultats ne s'affichent pas
- Vérifiez que les colonnes sélectionnées contiennent des données
- Ouvrez la console développeur (F12) pour voir les erreurs

### L'export ne fonctionne pas
- Vérifiez que votre navigateur autorise les téléchargements
- Désactivez les bloqueurs de pop-up

## 📄 Licence

Ce projet est libre d'utilisation pour des projets personnels et commerciaux.

## 👨‍💻 Auteur

Développé avec ❤️ pour faciliter le mapping de données Excel

## 🔄 Mises à Jour Futures

- [ ] Support de plus de formats (ODS, Google Sheets)
- [ ] Algorithmes de matching alternatifs (Jaro-Winkler, Soundex)
- [ ] Sauvegarde des configurations de mapping
- [ ] Historique des mappings
- [ ] Mode sombre/clair
- [ ] Internationalisation (i18n)
- [ ] Export en PDF
- [ ] API REST complète

---

**Version** : 1.0.0  
**Date** : Décembre 2024
