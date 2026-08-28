/**
 * Org Unit Metadata Export Module
 * Handles export of Organisation Units, Groups, and Group Sets in JSON format.
 */

$(document).ready(function () {
    initMetadataExport();
});

// Configuration of available fields
const AVAILABLE_FIELDS = {
    organisationUnits: [
        { id: 'id', name: 'ID', default: true },
        { id: 'name', name: 'Nom', default: true },
        { id: 'shortName', name: 'Nom Court', default: true },
        { id: 'code', name: 'Code', default: true },
        { id: 'description', name: 'Description', default: false },
        { id: 'openingDate', name: 'Date Ouverture', default: true },
        { id: 'closedDate', name: 'Date Fermeture', default: false },
        { id: 'comment', name: 'Commentaire', default: false },
        { id: 'path', name: 'Chemin (Path)', default: true },
        { id: 'level', name: 'Niveau', default: true },
        { id: 'parent', name: 'Parent', default: true },
        { id: 'geometry', name: 'Géométrie', default: true },
        { id: 'attributeValues', name: 'Attributs', default: false },
        { id: 'organisationUnitGroups', name: 'Groupes', default: true }
    ],
    organisationUnitGroups: [
        { id: 'id', name: 'ID', default: true },
        { id: 'name', name: 'Nom', default: true },
        { id: 'shortName', name: 'Nom Court', default: true },
        { id: 'code', name: 'Code', default: true },
        { id: 'groupSet', name: 'Ensemble de groupe', default: true },
        { id: 'organisationUnits', name: 'Unités membres (enfants)', default: true, children: true }
    ],
    organisationUnitGroupSets: [
        { id: 'id', name: 'ID', default: true },
        { id: 'name', name: 'Nom', default: true },
        { id: 'shortName', name: 'Nom Court', default: true },
        { id: 'code', name: 'Code', default: true },
        { id: 'compulsory', name: 'Obligatoire', default: false },
        { id: 'includeSubhierarchyInAnalytics', name: 'Inclure Sub-hiérarchie', default: false },
        { id: 'organisationUnitGroups', name: 'Groupes inclus (enfants)', default: true, children: true }
    ]
};

const appState = {
    selectedEntities: {
        organisationUnits: true,
        organisationUnitGroups: false,
        organisationUnitGroupSets: false
    },
    selectedFields: {
        organisationUnits: [],
        organisationUnitGroups: [],
        organisationUnitGroupSets: []
    },
    filter: {
        type: 'none', // none, level, group, parent
        value: null,
        groupsLoaded: false,
        treeLoaded: false
    },
    preview: {
        loaded: false,
        groups: [],           // [{ id, name, displayName, organisationUnits: [{id, name}] }]
        checkedGroups: {},    // groupId -> true/false
        checkedMembers: {},   // groupId -> { memberId: true/false }
        groupSets: [],        // [{ id, name, displayName, organisationUnitGroups: [{id, name}] }]
        checkedGroupSets: {},          // groupSetId -> true/false
        checkedGroupSetGroups: {}      // groupSetId -> { groupId: true/false }
    }
};

// ---- Import vers une instance cible ----
const TARGET_CONFIG_KEY = 'dhis2_target_config';
const TARGET_CRYPTO_KEY = 'dhis2_target_crypto_key';

let importTargetConfig = null;   // Config cible (url + authHeader) en cours d'import
let targetSavedConfig = null;    // Config cible réutilisable chargée de la session

/**
 * Requête vers une instance DHIS2 cible via le proxy (credentials explicites).
 */
async function targetProxyRequest(target, endpoint, method, body) {
    const requestData = {
        dhis2_url: target.url,
        dhis2_endpoint: endpoint,
        dhis2_method: method,
        dhis2_auth: target.authHeader
    };
    if (body) {
        requestData.dhis2_body = JSON.stringify(body);
    }

    const response = await $.ajax({
        url: 'api/dhis2-proxy.php',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(requestData),
        dataType: 'json'
    });

    if (!response.success) {
        throw new Error(response.message || 'Erreur lors de la requête DHIS2 (cible)');
    }

    return (response.data && response.data.data !== undefined) ? response.data.data : response.data;
}

/**
 * Tester la connexion à l'instance cible.
 */
async function testTargetConnection(target) {
    const data = await targetProxyRequest(target, '/api/me', 'GET');
    return data;
}

/**
 * Récupérer les uids des unités d'organisation existantes dans la cible.
 */
async function getTargetOrgUnitIds(target) {
    const data = await targetProxyRequest(target, '/api/organisationUnits?fields=id&paging=false', 'GET');
    return (data && data.organisationUnits || []).map(o => o.id);
}

/**
 * Récupérer les uids des groupes d'unités existants dans la cible.
 */
async function getTargetGroupIds(target) {
    const data = await targetProxyRequest(target, '/api/organisationUnitGroups?fields=id&paging=false', 'GET');
    return (data && data.organisationUnitGroups || []).map(g => g.id);
}

// ---- Chiffrement / stockage sécurisé de la connexion cible (session) ----
function cryptoAvailable() {
    return typeof crypto !== 'undefined' && crypto.subtle &&
        typeof crypto.subtle.encrypt === 'function' &&
        typeof crypto.subtle.decrypt === 'function';
}

function b64ToBytes(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
}

async function getTargetCryptoKey() {
    let stored = sessionStorage.getItem(TARGET_CRYPTO_KEY);
    let keyBytes;
    if (stored) {
        keyBytes = b64ToBytes(stored);
    } else {
        keyBytes = crypto.getRandomValues(new Uint8Array(32));
        sessionStorage.setItem(TARGET_CRYPTO_KEY, bytesToB64(keyBytes));
    }
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(key, plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(enc)) };
}

async function decryptSecret(key, ivB64, dataB64) {
    const iv = b64ToBytes(ivB64);
    const data = b64ToBytes(dataB64);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
}

async function saveTargetConfig(url, username, password) {
    const stored = {
        url: url.replace(/\/+$/, ''),
        username: username,
        method: 'base64',
        connectedAt: new Date().toISOString()
    };

    if (cryptoAvailable()) {
        const key = await getTargetCryptoKey();
        const enc = await encryptSecret(key, password);
        stored.method = 'aes';
        stored.passwordIv = enc.iv;
        stored.passwordData = enc.data;
    } else {
        // Contexte non sécurisé : obfuscation base64 (protection limitée)
        stored.passwordData = btoa(unescape(encodeURIComponent(password)));
    }

    sessionStorage.setItem(TARGET_CONFIG_KEY, JSON.stringify(stored));
}

async function loadTargetConfig() {
    const raw = sessionStorage.getItem(TARGET_CONFIG_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    let password;

    if (stored.method === 'aes' && cryptoAvailable()) {
        const key = await getTargetCryptoKey();
        password = await decryptSecret(key, stored.passwordIv, stored.passwordData);
    } else {
        password = decodeURIComponent(escape(atob(stored.passwordData)));
    }

    const url = stored.url.replace(/\/+$/, '');
    return {
        url: url,
        username: stored.username,
        password: password,
        authHeader: 'Basic ' + btoa(stored.username + ':' + password)
    };
}

function clearTargetConfig() {
    sessionStorage.removeItem(TARGET_CONFIG_KEY);
    sessionStorage.removeItem(TARGET_CRYPTO_KEY);
}

function initMetadataExport() {
    // Listen for DHIS2 connection
    $(document).on('dhis2:connected', function (e, user) {
        enableStep1();
    });

    // If already connected
    if (dhis2Session.isConnected()) {
        enableStep1();
    } else {
        // Redirect if not connected (consistent behavior)
        if (typeof showToast === 'function') {
            showToast('error', 'Session DHIS2 requise', 'Vous allez être redirigé vers la page d\'accueil pour vous connecter...');
        }
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }

    // Filter UI Logic
    $('#filterTypeSelect').on('change', function () {
        const type = $(this).val();
        appState.filter.type = type;

        $('.filter-input-group').hide();

        if (type === 'level') {
            $('#filterLevelGroup').show();
            appState.filter.value = $('#filterLevelInput').val();
        } else if (type === 'group') {
            $('#filterGroupGroup').show();
            if (!appState.filter.groupsLoaded) {
                loadOrgUnitGroups();
            }
        } else if (type === 'parent') {
            $('#filterParentGroup').show();
            if (!appState.filter.treeLoaded) {
                loadOrgUnitTree();
            }
        } else {
            appState.filter.value = null;
        }
    });

    $('#filterLevelInput').on('change', function () {
        appState.filter.value = $(this).val();
    });

    $('#filterGroupInput').on('change', function () {
        appState.filter.value = $(this).val();
    });

    // Tree Interaction
    $(document).on('click', '.tree-toggle', function (e) {
        e.stopPropagation();
        const li = $(this).closest('li');
        const ul = li.children('ul');
        const icon = $(this).find('i');

        if (ul.length > 0) {
            // Already loaded, just toggle
            ul.slideToggle();
            icon.toggleClass('fa-caret-right fa-caret-down');
        } else {
            // Load children
            const orgUnitId = li.data('id');
            loadTreeChildren(orgUnitId, li);
            icon.removeClass('fa-caret-right').addClass('fa-caret-down');
        }
    });

    $(document).on('click', '.tree-node-content', function () {
        // Selection
        $('.tree-node-content').removeClass('selected');
        $(this).addClass('selected');

        const id = $(this).parent().data('id');
        const name = $(this).find('.node-text').text();

        selectParentNode(id, name);
    });

    $('#btnClearParent').on('click', function () {
        appState.filter.value = null;
        $('#filterParentInput').val('');
        $('#filterParentId').val('');
        $('.tree-node-content').removeClass('selected');
        $(this).hide();
    });

    // Handlers
    $('#nextToStep2').on('click', () => {
        updateSelectionState();
        if (!hasSelection()) {
            showToast('error', 'Attention', 'Veuillez sélectionner au moins un type d\'entité.');
            return;
        }

        // Validate Filter
        if (appState.selectedEntities.organisationUnits && appState.filter.type !== 'none') {
            if (appState.filter.type === 'parent' && !appState.filter.value) {
                showToast('warning', 'Filtre incomplet', 'Veuillez sélectionner un parent dans l\'arbre.');
                return;
            }
            if (appState.filter.type === 'group' && !appState.filter.value) {
                showToast('warning', 'Filtre incomplet', 'Veuillez sélectionner un groupe.');
                return;
            }
        }

        renderFieldSelection();
        goToStep(2);
    });

    $('#nextToPreview').on('click', handleNextToPreview);
    $('#nextToStep4').on('click', () => {
        renderSummary();
        goToStep(4);
    });

    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#backToStep3').on('click', () => goToStep(3));

    $('#btnCheckAllGroups').on('click', checkAllGroups);
    $('#btnUncheckAllGroups').on('click', uncheckAllGroups);

    $('#btnLaunchExport').on('click', launchExport);

    // Import vers une autre instance
    $('.js-open-target-import').on('click', openTargetImportModal);
    $('#btnTestTarget').on('click', testTargetConnectionHandler);
    $('#formTargetImport').on('submit', handleTargetImportSubmit);
}

function enableStep1() {
    $('#dhis2Status').css('display', 'flex');
}

// Tree Functions
async function loadOrgUnitTree() {
    const container = $('#orgUnitTreeContainer');
    // container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>');

    try {
        // Fetch roots. Note: levels usually start at 1. But for universal usage, let's query level 1 or user-assigned roots.
        // Or simply /api/organisationUnits?level=1
        const data = await dhis2Session.get('/api/organisationUnits', {
            level: 1,
            fields: 'id,displayName,children::isNotEmpty',
            paging: false
        });

        container.empty();
        const rootUl = $('<ul class="tree-ul root-ul"></ul>');

        data.organisationUnits.sort((a, b) => a.displayName.localeCompare(b.displayName));

        data.organisationUnits.forEach(ou => {
            rootUl.append(renderTreeNode(ou));
        });

        container.append(rootUl);
        appState.filter.treeLoaded = true;

    } catch (e) {
        console.error(e);
        container.html('<p class="text-error">Erreur de chargement de l\'arbre.</p>');
    }
}

async function loadTreeChildren(parentId, parentLi) {
    // Add temporary loader
    // parentLi.append('<div class="temp-loader" style="padding-left:20px; font-size:12px; color:#888;">Chargement...</div>');

    try {
        const data = await dhis2Session.get(`/api/organisationUnits/${parentId}`, {
            fields: 'children[id,displayName,children::isNotEmpty]'
        });

        const children = data.children;
        // $('.temp-loader').remove();

        if (children && children.length > 0) {
            children.sort((a, b) => a.displayName.localeCompare(b.displayName));

            const ul = $('<ul class="tree-ul" style="display:none;"></ul>');
            children.forEach(child => {
                ul.append(renderTreeNode(child));
            });

            parentLi.append(ul);
            ul.slideDown();
        } else {
            // Turn off caretaker if no children found unexpectedly
            parentLi.find('.tree-toggle i').removeClass('fa-caret-down').addClass('fa-caret-right').css('opacity', '0.3');
        }

    } catch (e) {
        console.error(e);
        // $('.temp-loader').remove();
        showToast('error', 'Erreur', 'Impossible de charger les enfants');
    }
}

function renderTreeNode(ou) {
    const hasChildren = ou.children === true || (Array.isArray(ou.children) && ou.children.length > 0) || ou.children === undefined;
    // DHIS2 children::isNotEmpty returns boolean true/false for 'children' property in recent versions or just presence.
    // If we request children::isNotEmpty, we expect boolean. 
    // However, the initial root fetch returns 'children' as boolean? Let's verify field assumption.
    // Actually standard field `children` returns a collection. `children::isNotEmpty` returns boolean.

    const isLeaf = !hasChildren;

    const toggleHtml = isLeaf ?
        '<span class="tree-toggle" style="opacity:0"></span>' :
        '<span class="tree-toggle"><i class="fas fa-caret-right"></i></span>';

    const iconClass = isLeaf ? 'fa-circle' : 'fa-folder';
    const iconStyle = isLeaf ? 'font-size: 8px;' : '';

    return $(`
        <li data-id="${ou.id}">
            <div class="tree-node-content">
                ${toggleHtml}
                <i class="fas ${iconClass} tree-icon" style="${iconStyle}"></i>
                <span class="node-text">${ou.displayName}</span>
            </div>
        </li>
    `);
}

function selectParentNode(id, name) {
    $('#filterParentInput').val(name);
    $('#filterParentId').val(id);
    $('#btnClearParent').show();

    appState.filter.value = id;
}

async function loadOrgUnitGroups() {
    const selector = $('#filterGroupInput');
    selector.prop('disabled', true).html('<option>Chargement...</option>');

    try {
        const data = await dhis2Session.get('/api/organisationUnitGroups', {
            paging: false,
            fields: 'id,displayName'
        });

        selector.empty().append('<option value="">-- Sélectionner --</option>');

        data.organisationUnitGroups.sort((a, b) => a.displayName.localeCompare(b.displayName)).forEach(g => {
            selector.append(`<option value="${g.id}">${g.displayName}</option>`);
        });

        appState.filter.groupsLoaded = true;
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger les groupes.');
    } finally {
        selector.prop('disabled', false);
    }
}

function updateSelectionState() {
    appState.selectedEntities.organisationUnits = $('#checkOrgUnits').is(':checked');
    appState.selectedEntities.organisationUnitGroups = $('#checkOrgUnitGroups').is(':checked');
    appState.selectedEntities.organisationUnitGroupSets = $('#checkOrgUnitGroupSets').is(':checked');
}

function hasSelection() {
    return Object.values(appState.selectedEntities).some(val => val);
}

function renderFieldSelection() {
    const container = $('#fieldsContainer');
    container.empty();

    const entities = [
        { key: 'organisationUnits', label: 'Unités d\'Organisation', icon: 'fa-sitemap' },
        { key: 'organisationUnitGroups', label: 'Groupes d\'Unités', icon: 'fa-users' },
        { key: 'organisationUnitGroupSets', label: 'Ensembles de Groupes', icon: 'fa-layer-group' }
    ];

    entities.forEach(ent => {
        if (appState.selectedEntities[ent.key]) {
            const fields = AVAILABLE_FIELDS[ent.key];
            let html = `
                <div class="fields-group">
                    <h3><i class="fas ${ent.icon}"></i> ${ent.label}</h3>
                    <div class="fields-list">
            `;

            fields.forEach(field => {
                const checked = field.default ? 'checked' : '';
                html += `
                    <label class="field-item">
                        <input type="checkbox" name="field_${ent.key}" value="${field.id}" ${checked}>
                        ${field.name} <small class="text-muted">(${field.id})</small>
                    </label>
                `;
            });

            html += `
                    </div>
                </div>
            `;
            container.append(html);
        }
    });
}

function updateFieldState() {
    ['organisationUnits', 'organisationUnitGroups', 'organisationUnitGroupSets'].forEach(key => {
        if (appState.selectedEntities[key]) {
            appState.selectedFields[key] = [];
            $(`input[name="field_${key}"]:checked`).each(function () {
                appState.selectedFields[key].push($(this).val());
            });
        } else {
            appState.selectedFields[key] = [];
        }
    });
}

function renderSummary() {
    const list = $('#exportSummaryList');
    list.empty();

    // Org Unit Summary
    if (appState.selectedEntities.organisationUnits) {
        let filterText = 'Aucun filtre (Tout)';
        if (appState.filter.type === 'level') filterText = `Niveau ${appState.filter.value}`;
        else if (appState.filter.type === 'group') {
            const groupName = $('#filterGroupInput option:selected').text();
            filterText = `Groupe "${groupName}"`;
        }
        else if (appState.filter.type === 'parent') filterText = `Parent ${appState.filter.value} + Descendants`;

        list.append(`<li><strong>Unités d'Organisation:</strong> ${appState.selectedFields.organisationUnits.length} champs - Filtre: ${filterText}</li>`);
    } else {
        list.append(`<li><strong>Unités d'Organisation:</strong> Non inclus</li>`);
    }

    if (appState.selectedEntities.organisationUnitGroups) {
        let groupCount = null;
        if (appState.preview.loaded) {
            groupCount = appState.preview.groups.filter(g => appState.preview.checkedGroups[g.id]).length;
        }
        const countText = groupCount !== null ? ` (${groupCount} groupe(s) sélectionné(s))` : '';
        list.append(`<li><strong>Groupes d'Unités:</strong> ${appState.selectedFields.organisationUnitGroups.length} champs sélectionnés${countText}</li>`);
    }
    if (appState.selectedEntities.organisationUnitGroupSets) {
        let gsCount = null;
        if (appState.preview.loaded) {
            gsCount = appState.preview.groupSets.filter(gs => appState.preview.checkedGroupSets[gs.id]).length;
        }
        const gsText = gsCount !== null ? ` (${gsCount} ensemble(s) sélectionné(s))` : '';
        list.append(`<li><strong>Ensembles de Groupes:</strong> ${appState.selectedFields.organisationUnitGroupSets.length} champs sélectionnés${gsText}</li>`);
    }
}

async function handleNextToPreview() {
    updateFieldState();

    const previewGroups = appState.selectedEntities.organisationUnitGroups;
    const previewGroupSets = appState.selectedEntities.organisationUnitGroupSets;

    if (!previewGroups && !previewGroupSets) {
        // Rien à prévisualiser → passer directement à l'export
        renderSummary();
        goToStep(4);
        return;
    }

    try {
        if (!appState.preview.loaded) {
            await loadPreviewData();
        }
        renderPreview();
        goToStep(3);
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger la prévisualisation : ' + e.message);
    }
}

async function loadPreviewData() {
    // Charge les groupes (si l'entité est sélectionnée) et les group sets (si sélectionnés)
    const loadGroups = appState.selectedEntities.organisationUnitGroups;
    const loadGroupSets = appState.selectedEntities.organisationUnitGroupSets;

    if (loadGroups) {
        const data = await dhis2Session.get('/api/organisationUnitGroups', {
            paging: false,
            fields: 'id,name,displayName,organisationUnits[id,name]'
        });

        const groups = (data.organisationUnitGroups || []).slice();
        groups.sort((a, b) => (a.name || a.displayName || '').localeCompare(b.name || b.displayName || ''));

        appState.preview.groups = groups.map(g => {
            const members = (g.organisationUnits || []).slice();
            members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return {
                id: g.id,
                name: g.name || g.displayName || g.id,
                displayName: g.displayName || g.name || g.id,
                organisationUnits: members
            };
        });

        appState.preview.checkedGroups = {};
        appState.preview.checkedMembers = {};
        appState.preview.groups.forEach(g => {
            appState.preview.checkedGroups[g.id] = true;
            appState.preview.checkedMembers[g.id] = {};
            g.organisationUnits.forEach(m => {
                appState.preview.checkedMembers[g.id][m.id] = true;
            });
        });
    }

    if (loadGroupSets) {
        const data = await dhis2Session.get('/api/organisationUnitGroupSets', {
            paging: false,
            fields: 'id,name,displayName,organisationUnitGroups[id,name]'
        });

        const groupSets = (data.organisationUnitGroupSets || []).slice();
        groupSets.sort((a, b) => (a.name || a.displayName || '').localeCompare(b.name || b.displayName || ''));

        appState.preview.groupSets = groupSets.map(gs => {
            const containedGroups = (gs.organisationUnitGroups || []).slice();
            containedGroups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return {
                id: gs.id,
                name: gs.name || gs.displayName || gs.id,
                displayName: gs.displayName || gs.name || gs.id,
                organisationUnitGroups: containedGroups
            };
        });

        appState.preview.checkedGroupSets = {};
        appState.preview.checkedGroupSetGroups = {};
        appState.preview.groupSets.forEach(gs => {
            appState.preview.checkedGroupSets[gs.id] = true;
            appState.preview.checkedGroupSetGroups[gs.id] = {};
            gs.organisationUnitGroups.forEach(g => {
                appState.preview.checkedGroupSetGroups[gs.id][g.id] = true;
            });
        });
    }

    appState.preview.loaded = true;
}

function renderPreview() {
    const container = $('#previewContainer');
    container.empty();

    const hasGroups = appState.selectedEntities.organisationUnitGroups;
    const hasGroupSets = appState.selectedEntities.organisationUnitGroupSets;

    if (hasGroups) {
        const childrenEnabled = appState.selectedFields.organisationUnitGroups.includes('organisationUnits');
        const section = $('<div class="preview-section"></div>');
        section.append('<h3 class="preview-section-title"><i class="fas fa-users"></i> Groupes d\'Unités</h3>');

        if (appState.preview.groups.length === 0) {
            section.append('<p class="text-muted">Aucun groupe d\'unités trouvé sur cette instance.</p>');
        } else {
            const ul = $('<ul class="preview-ul"></ul>');
            appState.preview.groups.forEach(g => {
                ul.append(renderPreviewGroup(g, childrenEnabled));
            });
            section.append(ul);
        }
        container.append(section);
    }

    if (hasGroupSets) {
        const gsChildrenEnabled = appState.selectedFields.organisationUnitGroupSets.includes('organisationUnitGroups');
        const section = $('<div class="preview-section"></div>');
        section.append('<h3 class="preview-section-title"><i class="fas fa-layer-group"></i> Ensembles de Groupes</h3>');

        if (appState.preview.groupSets.length === 0) {
            section.append('<p class="text-muted">Aucun ensemble de groupes trouvé sur cette instance.</p>');
        } else {
            const ul = $('<ul class="preview-ul"></ul>');
            appState.preview.groupSets.forEach(gs => {
                ul.append(renderPreviewGroupSet(gs, gsChildrenEnabled));
            });
            section.append(ul);
        }
        container.append(section);
    }

    updatePreviewCounts();
}

function renderPreviewGroup(g, childrenEnabled) {
    const li = $('<li class="preview-group-li" data-group-id="' + g.id + '"></li>');

    const row = $('<div class="preview-group-row"></div>');

    const hasMembers = g.organisationUnits.length > 0;

    const toggle = $('<span class="preview-toggle"></span>');
    if (hasMembers) {
        toggle.html('<i class="fas fa-caret-right"></i>');
    } else {
        toggle.addClass('preview-toggle-empty');
    }

    const groupCheck = $('<input type="checkbox" class="preview-group-check">')
        .prop('checked', !!appState.preview.checkedGroups[g.id]);

    const icon = $('<i class="fas fa-users preview-group-icon"></i>');
    const label = $('<span class="preview-group-name"></span>').text(g.name);
    const count = $('<span class="preview-group-count"></span>').text(g.organisationUnits.length + ' unité(s)');

    row.append(toggle, groupCheck, icon, label, count);
    li.append(row);

    let membersUl = null;
    if (childrenEnabled) {
        membersUl = $('<ul class="preview-members-ul"></ul>');

        g.organisationUnits.forEach(m => {
            const mli = $('<li class="preview-member-li" data-member-id="' + m.id + '"></li>');
            const mCheck = $('<input type="checkbox" class="preview-member-check">')
                .prop('checked', !!appState.preview.checkedMembers[g.id][m.id]);
            const mIcon = $('<i class="fas fa-circle preview-member-icon"></i>');
            const mLabel = $('<span class="preview-member-name"></span>').text(m.name || m.id);
            const mId = $('<code class="preview-member-id"></code>').text(m.id);
            mli.append(mCheck, mIcon, mLabel, mId);

            mCheck.on('change', function () {
                appState.preview.checkedMembers[g.id][m.id] = $(this).is(':checked');
                updatePreviewCounts();
            });

            membersUl.append(mli);
        });

        li.append(membersUl);
    }

    // Déplier/replier les membres
    function toggleExpansion() {
        if (!hasMembers || !membersUl) return;
        const iconEl = toggle.find('i');
        membersUl.slideToggle();
        iconEl.toggleClass('fa-caret-right fa-caret-down');
    }

    // Case à cocher du groupe
    groupCheck.on('change', function (e) {
        e.stopPropagation();
        const checked = $(this).is(':checked');
        appState.preview.checkedGroups[g.id] = checked;
        li.toggleClass('preview-group-disabled', !checked);
        if (childrenEnabled && membersUl) {
            membersUl.find('.preview-member-check').prop('checked', checked);
            const members = appState.preview.checkedMembers[g.id] || {};
            Object.keys(members).forEach(mid => { members[mid] = checked; });
        }
        updatePreviewCounts();
    });

    // Cliquer sur le noeud (hors case) déroule/affiche les membres
    row.on('click', function (e) {
        if ($(e.target).is('input[type="checkbox"]')) return;
        toggleExpansion();
    });

    return li;
}

function renderPreviewGroupSet(gs, gsChildrenEnabled) {
    const li = $('<li class="preview-group-li" data-group-set-id="' + gs.id + '"></li>');

    const row = $('<div class="preview-group-row"></div>');

    const hasGroups = gs.organisationUnitGroups.length > 0;

    const toggle = $('<span class="preview-toggle"></span>');
    if (hasGroups) {
        toggle.html('<i class="fas fa-caret-right"></i>');
    } else {
        toggle.addClass('preview-toggle-empty');
    }

    const gsCheck = $('<input type="checkbox" class="preview-group-check">')
        .prop('checked', !!appState.preview.checkedGroupSets[gs.id]);

    const icon = $('<i class="fas fa-layer-group preview-group-icon"></i>');
    const label = $('<span class="preview-group-name"></span>').text(gs.name);
    const count = $('<span class="preview-group-count"></span>').text(gs.organisationUnitGroups.length + ' groupe(s)');

    row.append(toggle, gsCheck, icon, label, count);
    li.append(row);

    let groupsUl = null;
    if (gsChildrenEnabled) {
        groupsUl = $('<ul class="preview-members-ul"></ul>');

        gs.organisationUnitGroups.forEach(g => {
            const gli = $('<li class="preview-member-li" data-group-id="' + g.id + '"></li>');
            const gCheck = $('<input type="checkbox" class="preview-member-check">')
                .prop('checked', !!appState.preview.checkedGroupSetGroups[gs.id][g.id]);
            const gIcon = $('<i class="fas fa-users preview-member-icon"></i>');
            const gLabel = $('<span class="preview-member-name"></span>').text(g.name || g.id);
            const gId = $('<code class="preview-member-id"></code>').text(g.id);
            gli.append(gCheck, gIcon, gLabel, gId);

            gCheck.on('change', function () {
                appState.preview.checkedGroupSetGroups[gs.id][g.id] = $(this).is(':checked');
                updatePreviewCounts();
            });

            groupsUl.append(gli);
        });

        li.append(groupsUl);
    }

    // Déplier/replier les groupes contenus
    function toggleExpansion() {
        if (!hasGroups || !groupsUl) return;
        const iconEl = toggle.find('i');
        groupsUl.slideToggle();
        iconEl.toggleClass('fa-caret-right fa-caret-down');
    }

    // Case à cocher de l'ensemble
    gsCheck.on('change', function (e) {
        e.stopPropagation();
        const checked = $(this).is(':checked');
        appState.preview.checkedGroupSets[gs.id] = checked;
        li.toggleClass('preview-group-disabled', !checked);
        if (gsChildrenEnabled && groupsUl) {
            groupsUl.find('.preview-member-check').prop('checked', checked);
            const groups = appState.preview.checkedGroupSetGroups[gs.id] || {};
            Object.keys(groups).forEach(gid => { groups[gid] = checked; });
        }
        updatePreviewCounts();
    });

    // Cliquer sur le noeud (hors case) déroule/affiche les groupes contenus
    row.on('click', function (e) {
        if ($(e.target).is('input[type="checkbox"]')) return;
        toggleExpansion();
    });

    return li;
}

function setAllGroups(checked) {
    if (!appState.preview.loaded) return;
    appState.preview.groups.forEach(g => {
        appState.preview.checkedGroups[g.id] = checked;
        const members = appState.preview.checkedMembers[g.id] || {};
        Object.keys(members).forEach(mid => { members[mid] = checked; });
    });
    appState.preview.groupSets.forEach(gs => {
        appState.preview.checkedGroupSets[gs.id] = checked;
        const groups = appState.preview.checkedGroupSetGroups[gs.id] || {};
        Object.keys(groups).forEach(gid => { groups[gid] = checked; });
    });
    renderPreview();
}

function checkAllGroups() {
    setAllGroups(true);
}

function uncheckAllGroups() {
    setAllGroups(false);
}

function updatePreviewCounts() {
    if (!appState.preview.loaded) return;
    const groups = appState.preview.groups;
    const checkedGroups = groups.filter(g => appState.preview.checkedGroups[g.id]).length;
    let checkedMembers = 0;
    let totalMembers = 0;
    groups.forEach(g => {
        g.organisationUnits.forEach(m => {
            totalMembers++;
            if (appState.preview.checkedMembers[g.id] && appState.preview.checkedMembers[g.id][m.id]) {
                checkedMembers++;
            }
        });
    });

    const groupSets = appState.preview.groupSets;
    const checkedGroupSets = groupSets.filter(gs => appState.preview.checkedGroupSets[gs.id]).length;
    let checkedGsGroups = 0;
    let totalGsGroups = 0;
    groupSets.forEach(gs => {
        gs.organisationUnitGroups.forEach(g => {
            totalGsGroups++;
            if (appState.preview.checkedGroupSetGroups[gs.id] && appState.preview.checkedGroupSetGroups[gs.id][g.id]) {
                checkedGsGroups++;
            }
        });
    });

    $('#previewCounts').text(
        checkedGroups + '/' + groups.length + ' groupes · ' +
        checkedGroupSets + '/' + groupSets.length + ' ensembles · ' +
        (checkedMembers + checkedGsGroups) + '/' + (totalMembers + totalGsGroups) + ' enfants'
    );
}

// ---- Modale d'import cible ----
function openTargetImportModal() {
    $('#targetFeedback').hide();
    $('#targetRecap').html('<p class="text-muted">Le récapitulatif s\'affichera ici après un import.</p>');
    $('#targetRecapCol').removeClass('show');
    $('#btnDoImport').prop('disabled', true);
    importTargetConfig = null;

    // Pré-remplir depuis la config sauvegardée (réutilisation dans la session)
    loadTargetConfig().then((saved) => {
        targetSavedConfig = saved;
        if (saved) {
            $('#targetUrlInput').val(saved.url);
            $('#targetUsernameInput').val(saved.username);
            $('#targetPasswordInput').val('');
            $('#targetSavedBanner')
                .text('Connexion enregistrée détectée pour cette session (' + saved.username + '). Vous pouvez la réutiliser ou en saisir une nouvelle.')
                .show();
        } else {
            $('#targetSavedBanner').hide();
        }
    }).catch(() => {
        targetSavedConfig = null;
        $('#targetSavedBanner').hide();
    });

    $('#targetImportModal').addClass('active');
}

function closeTargetImportModal() {
    $('#targetImportModal').removeClass('active');
}

function showTargetFeedback(type, title, message) {
    const $fb = $('#targetFeedback');
    $fb.removeClass('success error warning info');
    $fb.addClass(type);
    $('#targetFeedbackTitle').text(title);
    $('#targetFeedbackMessage').html(message);
    $fb.fadeIn(200);
}

function hideTargetFeedback() {
    $('#targetFeedback').hide();
}

function buildTargetConfigFromForm() {
    const url = $('#targetUrlInput').val().trim();
    const username = $('#targetUsernameInput').val().trim();
    const password = $('#targetPasswordInput').val();

    let formattedUrl = url;
    if (formattedUrl && !formattedUrl.startsWith('http')) {
        formattedUrl = 'https://' + formattedUrl;
    }
    formattedUrl = formattedUrl.replace(/\/+$/, '');

    if (!formattedUrl || !username) {
        return null;
    }

    if (password) {
        return {
            url: formattedUrl,
            username: username,
            password: password,
            authHeader: 'Basic ' + btoa(username + ':' + password)
        };
    }

    // Réutilisation de la connexion enregistrée (même url + utilisateur)
    if (targetSavedConfig && targetSavedConfig.url.replace(/\/+$/, '') === formattedUrl &&
        targetSavedConfig.username === username) {
        return targetSavedConfig;
    }

    return null; // mot de passe manquant
}

async function testTargetConnectionHandler() {
    hideTargetFeedback();
    const $btn = $('#btnTestTarget');
    const orig = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Test en cours...');

    const config = buildTargetConfigFromForm();
    if (!config) {
        showTargetFeedback('error', 'Informations manquantes',
            'Renseignez l\'URL, l\'utilisateur et le mot de passe (ou utilisez la connexion enregistrée).');
        $btn.prop('disabled', false).html(orig);
        return;
    }

    try {
        const user = await testTargetConnection(config);
        importTargetConfig = config;
        $('#btnDoImport').prop('disabled', false);
        showTargetFeedback('success', 'Connexion réussie',
            'Connecté à l\'instance cible en tant que <strong>' +
            (user.displayName || user.username || user.name) + '</strong>. Vous pouvez importer.');
    } catch (e) {
        console.error(e);
        showTargetFeedback('error', 'Échec de la connexion', e.message);
    } finally {
        $btn.prop('disabled', false).html(orig);
    }
}

async function handleTargetImportSubmit(e) {
    e.preventDefault();
    hideTargetFeedback();

    if (!importTargetConfig) {
        showTargetFeedback('error', 'Connexion non testée', 'Cliquez d\'abord sur « Tester la connexion ».');
        return;
    }

    const $btn = $('#btnDoImport');
    const orig = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Import en cours...');

    try {
        const { payload, ignored } = await buildImportPayload(importTargetConfig);

        if (Object.keys(payload).length === 0) {
            showTargetFeedback('warning', 'Rien à importer', 'Aucune entité sélectionnée à importer.');
            $btn.prop('disabled', false).html(orig);
            return;
        }

        const response = await importToTarget(importTargetConfig, payload);

        // Sauvegarder (chiffrée) pour réutilisation dans la session
        const formCfg = buildTargetConfigFromForm();
        const username = formCfg ? formCfg.username : importTargetConfig.username;
        const password = formCfg ? formCfg.password : importTargetConfig.password;
        await saveTargetConfig(importTargetConfig.url, username, password);

        renderTargetRecap(response, ignored);
        showTargetFeedback('success', 'Import terminé',
            'L\'import vers l\'instance cible a été traité. Voir le récapitulatif ci-dessous.');
    } catch (error) {
        console.error(error);
        showTargetFeedback('error', 'Échec de l\'import', error.message);
    } finally {
        $btn.prop('disabled', false).html(orig);
    }
}

/**
 * Construire le payload d'import depuis les sélections, avec filtrage « intelligent » :
 * on ne référence que les membres (uids) existants dans la cible ou importés dans la même opération.
 * @returns {Promise<{payload: object, ignored: Array}>}
 */
async function buildImportPayload(target) {
    const payload = {};
    const ignored = [];
    let knownOrgUnitIds = null;
    let knownGroupIds = null;

    // La prévisualisation doit être chargée pour appliquer les sélections groupes/ensembles
    if (appState.selectedEntities.organisationUnitGroups || appState.selectedEntities.organisationUnitGroupSets) {
        if (!appState.preview.loaded) {
            await loadPreviewData();
        }
    }

    // 1) Unités d'Organisation
    if (appState.selectedEntities.organisationUnits) {
        const fields = appState.selectedFields.organisationUnits.join(',');
        const params = { fields: fields, paging: false };

        if (appState.filter.type === 'level' && appState.filter.value) {
            params.level = appState.filter.value;
        } else if (appState.filter.type === 'group' && appState.filter.value) {
            params.filter = `organisationUnitGroups.id:eq:${appState.filter.value}`;
        } else if (appState.filter.type === 'parent' && appState.filter.value) {
            params.filter = `path:like:${appState.filter.value}`;
        }

        const data = await dhis2Session.get('/api/organisationUnits', params);
        payload.organisationUnits = (data.organisationUnits || []);
    }

    // 2) Groupes d'Unités
    if (appState.selectedEntities.organisationUnitGroups) {
        if (knownOrgUnitIds === null) {
            const existing = await getTargetOrgUnitIds(target);
            const importedOus = payload.organisationUnits ? payload.organisationUnits.map(o => o.id) : [];
            knownOrgUnitIds = new Set(existing.concat(importedOus));
        }

        const childrenEnabled = appState.selectedFields.organisationUnitGroups.includes('organisationUnits');
        const fields = appState.selectedFields.organisationUnitGroups
            .map(f => f === 'organisationUnits' ? 'organisationUnits[id]' : f)
            .join(',');

        const data = await dhis2Session.get('/api/organisationUnitGroups', { fields: fields, paging: false });
        let groups = (data.organisationUnitGroups || []).filter(g => appState.preview.checkedGroups[g.id]);

        if (childrenEnabled) {
            groups.forEach(g => {
                const memberState = appState.preview.checkedMembers[g.id] || {};
                const kept = [];
                (g.organisationUnits || []).forEach(m => {
                    if (!memberState[m.id]) return; // non coché → exclu
                    if (knownOrgUnitIds.has(m.id)) {
                        kept.push({ id: m.id });
                    } else {
                        ignored.push({
                            type: 'Unité membre',
                            parentType: 'Groupe',
                            parentName: g.name || g.id,
                            id: m.id,
                            name: m.name || m.id,
                            reason: 'Unité non présente dans l\'instance cible'
                        });
                    }
                });
                g.organisationUnits = kept;
            });
        } else {
            groups.forEach(g => { delete g.organisationUnits; });
        }

        payload.organisationUnitGroups = groups;
    }

    // 3) Ensembles de Groupes
    if (appState.selectedEntities.organisationUnitGroupSets) {
        if (knownGroupIds === null) {
            const existing = await getTargetGroupIds(target);
            const importedGroups = payload.organisationUnitGroups ? payload.organisationUnitGroups.map(g => g.id) : [];
            knownGroupIds = new Set(existing.concat(importedGroups));
        }

        const gsChildrenEnabled = appState.selectedFields.organisationUnitGroupSets.includes('organisationUnitGroups');
        const fields = appState.selectedFields.organisationUnitGroupSets
            .map(f => f === 'organisationUnitGroups' ? 'organisationUnitGroups[id]' : f)
            .join(',');

        const data = await dhis2Session.get('/api/organisationUnitGroupSets', { fields: fields, paging: false });
        let groupSets = (data.organisationUnitGroupSets || []).filter(gs => appState.preview.checkedGroupSets[gs.id]);

        if (gsChildrenEnabled) {
            groupSets.forEach(gs => {
                const groupState = appState.preview.checkedGroupSetGroups[gs.id] || {};
                const kept = [];
                (gs.organisationUnitGroups || []).forEach(g => {
                    if (!groupState[g.id]) return; // non coché → exclu
                    if (knownGroupIds.has(g.id)) {
                        kept.push({ id: g.id });
                    } else {
                        ignored.push({
                            type: 'Groupe contenu',
                            parentType: 'Ensemble de groupes',
                            parentName: gs.name || gs.id,
                            id: g.id,
                            name: g.name || g.id,
                            reason: 'Groupe non présent dans l\'instance cible'
                        });
                    }
                });
                gs.organisationUnitGroups = kept;
            });
        } else {
            groupSets.forEach(gs => { delete gs.organisationUnitGroups; });
        }

        payload.organisationUnitGroupSets = groupSets;
    }

    // Normalisation : garantir les propriétés requises par DHIS2 (ex. shortName)
    ['organisationUnits', 'organisationUnitGroups', 'organisationUnitGroupSets'].forEach(k => {
        if (Array.isArray(payload[k])) {
            payload[k].forEach(obj => {
                if (obj && obj.name !== undefined && obj.shortName === undefined) {
                    obj.shortName = obj.name;
                }
            });
        }
    });

    return { payload: payload, ignored: ignored };
}

/**
 * Envoyer le payload d'import vers l'instance cible (endpoint metadata DHIS2).
 * L'import metadata peut répondre en HTTP 409 (conflits/warnings) : on retourne
 * quand même le rapport DHIS2 pour afficher le récapitulatif.
 */
async function importToTarget(target, payload) {
    const requestData = {
        dhis2_url: target.url,
        dhis2_endpoint: '/api/metadata?importStrategy=CREATE_AND_UPDATE',
        dhis2_method: 'POST',
        dhis2_auth: target.authHeader,
        dhis2_body: JSON.stringify(payload)
    };

    const response = await $.ajax({
        url: 'api/dhis2-proxy.php',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(requestData),
        dataType: 'json'
    });

    // Le rapport d'import DHIS2 est dans body.response
    let body = response && response.data ? response.data.data : null;
    if (!body || !body.response) {
        body = response && response.data ? response.data : null;
    }
    if (body && body.response) {
        return body; // import traité (succès ou warning/erreur)
    }

    throw new Error(response.message || 'Échec de l\'import vers l\'instance cible');
}

/**
 * Rendre le récapitulatif de l'import (réponse DHIS2 + membres ignorés).
 */
function renderTargetRecap(response, ignored) {
    const r = (response && response.response) ? response.response : (response || {});
    const stats = r.stats || {};
    const status = r.status || '?';
    const created = stats.created || 0;
    const updated = stats.updated || 0;
    const ignoredCount = stats.ignored || 0;
    const deleted = stats.deleted || 0;

    const statusUpper = String(status).toUpperCase();
    const statusClass = statusUpper === 'SUCCESS' ? 'recap-success'
        : statusUpper === 'ERROR' ? 'recap-error' : 'recap-warning';

    let html = '<div class="import-recap ' + statusClass + '">';
    html += '<div class="import-recap-status">Statut DHIS2 : <strong>' + escapeHtml(status) + '</strong></div>';
    html += '<div class="import-recap-counts">';
    html += '<span class="count-item count-imported"><i class="fas fa-plus-circle"></i> Importés : ' + created + '</span>';
    html += '<span class="count-item count-updated"><i class="fas fa-sync-alt"></i> Mis à jour : ' + updated + '</span>';
    html += '<span class="count-item count-ignored"><i class="fas fa-exclamation-circle"></i> Ignorés : ' + ignoredCount + '</span>';
    html += '<span class="count-item count-deleted"><i class="fas fa-trash"></i> Supprimés : ' + deleted + '</span>';
    html += '</div>';

    // Détail par type (typeReports) avec erreurs DHIS2
    const typeReports = r.typeReports || [];
    if (typeReports.length) {
        html += '<div class="import-recap-types"><strong>Détail par type :</strong><ul>';
        typeReports.forEach(tr => {
            const name = tr.klass || tr.type || '?';
            const trStats = tr.stats || {};
            html += '<li>' + escapeHtml(name) + ' — créés: ' + (trStats.created || 0) +
                ', mis à jour: ' + (trStats.updated || 0) + ', ignorés: ' + (trStats.ignored || 0) + '</li>';

            // Erreurs DHIS2 (ex. propriétés requises manquantes)
            const objectReports = tr.objectReports || [];
            objectReports.forEach(or => {
                const errs = or.errorReports || [];
                errs.slice(0, 3).forEach(er => {
                    html += '<li class="recap-error-detail"><code>' + escapeHtml(or.uid || '') + '</code> — ' +
                        escapeHtml(er.message || '') + '</li>';
                });
            });
        });
        html += '</ul></div>';
    }

    // Membres ignorés (filtrés avant envoi)
    if (ignored && ignored.length) {
        html += '<div class="import-recap-ignored"><strong>Membres ignorés (' + ignored.length + ') :</strong>';
        html += '<ul class="ignored-list">';
        ignored.forEach(ig => {
            html += '<li><span class="ignored-name">' + escapeHtml(ig.name) + '</span> <code>' + escapeHtml(ig.id) +
                '</code> — dans « ' + escapeHtml(ig.parentName) + ' » (' + escapeHtml(ig.parentType) + ') : ' +
                escapeHtml(ig.reason) + '</li>';
        });
        html += '</ul></div>';
    } else {
        html += '<div class="import-recap-ignored-empty"><i class="fas fa-check"></i> Aucun membre ignoré.</div>';
    }

    html += '</div>';

    $('#targetRecap').html(html);
    $('#targetRecapCol').addClass('show');
}

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function launchExport() {
    const $btn = $('#btnLaunchExport');
    const $progress = $('#progressSection');
    const $status = $('#progressStatus');
    const $result = $('#resultSection');

    $btn.prop('disabled', true);
    $progress.slideDown();
    $result.slideUp();

    try {
        const payload = {};

        // Helper to delay if needed avoiding rate limits? Or just sequential

        if (appState.selectedEntities.organisationUnits) {
            $status.text('Récupération des Unités d\'Organisation...');
            const fields = appState.selectedFields.organisationUnits.join(',');

            // Build Params
            const params = {
                fields: fields,
                paging: false
            };

            // Apply Filters
            if (appState.filter.type === 'level' && appState.filter.value) {
                params.level = appState.filter.value;
            } else if (appState.filter.type === 'group' && appState.filter.value) {
                // Using filter param for group
                params.filter = `organisationUnitGroups.id:eq:${appState.filter.value}`;
            } else if (appState.filter.type === 'parent' && appState.filter.value) {
                // If we want parent + descendants, we can use path:like:UID
                // Note: path contains /UID/... so like:UID matches if UID is unique enough, but better path:like:/UID
                // But DHIS2 root path is /UID
                // Safer: filter=path:like:UID 
                params.filter = `path:like:${appState.filter.value}`;
            }

            const data = await dhis2Session.get('/api/organisationUnits', params);
            payload.organisationUnits = data.organisationUnits;
        }

        if (appState.selectedEntities.organisationUnitGroups) {
            $status.text('Récupération des Groupes...');
            const childrenEnabled = appState.selectedFields.organisationUnitGroups.includes('organisationUnits');

            // Transformer le champ 'organisationUnits' (enfants) en organisationUnits[id] (uids uniquement)
            const fields = appState.selectedFields.organisationUnitGroups
                .map(f => f === 'organisationUnits' ? 'organisationUnits[id]' : f)
                .join(',');

            // Garantir la prévisualisation chargée pour appliquer les sélections
            if (!appState.preview.loaded) {
                await loadPreviewData();
            }

            const data = await dhis2Session.get('/api/organisationUnitGroups', {
                fields: fields,
                paging: false
            });

            let groups = (data.organisationUnitGroups || []).slice();

            // Ne garder que les groupes cochés dans la prévisualisation
            groups = groups.filter(g => appState.preview.checkedGroups[g.id]);

            if (childrenEnabled) {
                groups.forEach(g => {
                    const memberState = appState.preview.checkedMembers[g.id] || {};
                    if (Array.isArray(g.organisationUnits)) {
                        g.organisationUnits = g.organisationUnits
                            .filter(m => memberState[m.id])
                            .map(m => ({ id: m.id }));
                    } else {
                        g.organisationUnits = [];
                    }
                });
            } else {
                // Champ enfants désactivé → supprimer les membres de l'export
                groups.forEach(g => { delete g.organisationUnits; });
            }

            payload.organisationUnitGroups = groups;
        }

        if (appState.selectedEntities.organisationUnitGroupSets) {
            $status.text('Récupération des Ensembles de Groupes...');
            const gsChildrenEnabled = appState.selectedFields.organisationUnitGroupSets.includes('organisationUnitGroups');

            // Transformer le champ 'organisationUnitGroups' en organisationUnitGroups[id] (uids uniquement)
            const fields = appState.selectedFields.organisationUnitGroupSets
                .map(f => f === 'organisationUnitGroups' ? 'organisationUnitGroups[id]' : f)
                .join(',');

            // Garantir la prévisualisation chargée pour appliquer les sélections
            if (!appState.preview.loaded) {
                await loadPreviewData();
            }

            const data = await dhis2Session.get('/api/organisationUnitGroupSets', {
                fields: fields,
                paging: false
            });

            let groupSets = (data.organisationUnitGroupSets || []).slice();

            // Ne garder que les ensembles cochés dans la prévisualisation
            groupSets = groupSets.filter(gs => appState.preview.checkedGroupSets[gs.id]);

            if (gsChildrenEnabled) {
                groupSets.forEach(gs => {
                    const groupState = appState.preview.checkedGroupSetGroups[gs.id] || {};
                    if (Array.isArray(gs.organisationUnitGroups)) {
                        gs.organisationUnitGroups = gs.organisationUnitGroups
                            .filter(g => groupState[g.id])
                            .map(g => ({ id: g.id }));
                    } else {
                        gs.organisationUnitGroups = [];
                    }
                });
            } else {
                // Champ enfants désactivé → supprimer les groupes de l'export
                groupSets.forEach(gs => { delete gs.organisationUnitGroups; });
            }

            payload.organisationUnitGroupSets = groupSets;
        }

        $status.text('Génération du fichier...');

        // Generate dynamic filename
        const now = new Date();
        const timestamp = now.getFullYear() +
            ('0' + (now.getMonth() + 1)).slice(-2) +
            ('0' + now.getDate()).slice(-2) + '_' +
            ('0' + now.getHours()).slice(-2) +
            ('0' + now.getMinutes()).slice(-2);

        let filterPart = 'all';
        if (appState.selectedEntities.organisationUnits && appState.filter.type !== 'none') {
            filterPart = appState.filter.type;
            if (appState.filter.value) {
                // simple sanitize
                filterPart += '-' + appState.filter.value.replace(/[^a-zA-Z0-9]/g, '');
            }
        }

        const filename = `metadata_orgunits_${filterPart}_${timestamp}.json`;

        // Trigger download
        downloadJSON(payload, filename);

        $progress.slideUp();
        $result.slideDown();
        showToast('success', 'Terminé', 'Export téléchargé avec succès');

    } catch (error) {
        console.error(error);
        showToast('error', 'Erreur', 'L\'export a échoué: ' + error.message);
        $progress.slideUp();
    } finally {
        $btn.prop('disabled', false);
    }
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function goToStep(step) {
    $('.step-content').hide();
    $(`#step${step}`).fadeIn();

    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= step; i++) {
        if (i === step) $(`.step-item[data-step="${i}"]`).addClass('active');
        else $(`.step-item[data-step="${i}"]`).addClass('completed');
    }
}
