#!/bin/bash

# Excel Mapping - Quick Start Script
# This script starts a local PHP development server

echo "🚀 Démarrage de l'application Excel Mapping..."
echo ""

# Check if PHP is installed
if ! command -v php &> /dev/null
then
    echo "❌ PHP n'est pas installé. Veuillez installer PHP 7.4 ou supérieur."
    exit 1
fi

# Get PHP version
PHP_VERSION=$(php -v | head -n 1 | cut -d " " -f 2 | cut -d "." -f 1,2)
echo "✅ PHP version: $PHP_VERSION"

# Create necessary directories
echo "📁 Création des dossiers nécessaires..."
mkdir -p uploads exports saved_mappings

# Set permissions
echo "🔒 Configuration des permissions..."
chmod 755 uploads exports saved_mappings

# Start PHP server
PORT=8000
echo ""
echo "🌐 Démarrage du serveur sur http://localhost:$PORT"
echo "📝 Appuyez sur Ctrl+C pour arrêter le serveur"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

php -S localhost:$PORT
