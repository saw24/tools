<?php
/**
 * DHIS2 Proxy API — délègue à l'implémentation unique de la racine du projet
 * (../../api/dhis2-proxy.php) pour ne plus maintenir deux copies indépendantes
 * qui divergeaient silencieusement (masquage du token dans les logs, timeout,
 * détail d'erreur DHIS2... — voir DHIS2_URLS.md).
 */
require __DIR__ . '/../../api/dhis2-proxy.php';
