/**
 * User Export Module
 * Handles export of Users, User Groups, and User Roles in JSON format.
 */

$(document).ready(function () {
    initUserExport();
});

// Available fields configuration
const AVAILABLE_FIELDS = {
    users: [
        { id: 'id', name: 'ID', default: true },
        { id: 'code', name: 'Code', default: false },
        { id: 'firstName', name: 'Prénom', default: true },
        { id: 'surname', name: 'Nom', default: true },
        { id: 'email', name: 'Email', default: true },
        { id: 'phoneNumber', name: 'Téléphone', default: false },
        { id: 'username', name: 'Username (Credentials)', default: true, path: 'userCredentials.username' },
        { id: 'lastLogin', name: 'Dernière connexion', default: false, path: 'userCredentials.lastLogin' },
        { id: 'disabled', name: 'Désactivé', default: false, path: 'userCredentials.disabled' },
        { id: 'accountExpiry', name: 'Expiration Compte', default: false, path: 'userCredentials.accountExpiry' },
        { id: 'userRoles', name: 'Rôles (Credentials)', default: true, path: 'userCredentials.userRoles' },
        { id: 'userGroups', name: 'Groupes d\'utilisateurs', default: true },
        { id: 'organisationUnits', name: 'Unités d\'Organisation', default: true },
        { id: 'dataViewOrganisationUnits', name: 'Unités (Data Capture)', default: false },
        { id: 'teiSearchOrganisationUnits', name: 'Unités (TEI Search)', default: false }
    ],
    userGroups: [
        { id: 'id', name: 'ID', default: true },
        { id: 'name', name: 'Nom', default: true },
        { id: 'code', name: 'Code', default: false },
        { id: 'users', name: 'Membres', default: true }
    ],
    userRoles: [
        { id: 'id', name: 'ID', default: true },
        { id: 'name', name: 'Nom', default: true },
        { id: 'description', name: 'Description', default: false },
        { id: 'authorities', name: 'Autorités', default: true }
    ]
};

const appState = {
    selectedEntities: {
        users: true,
        userGroups: false,
        userRoles: false
    },
    selectedFields: {
        users: [],
        userGroups: [],
        userRoles: []
    }
};

function initUserExport() {
    $(document).on('dhis2:connected', () => enableStep1());

    if (dhis2Session.isConnected()) {
        enableStep1();
    } else {
        if (typeof showToast === 'function') {
            showToast('error', 'Session requise', 'Redirection vers l\'accueil...');
        }
        setTimeout(() => window.location.href = 'index.html', 2000);
    }

    // Step Navigation
    $('#nextToStep2').on('click', () => {
        updateEntitySelection();
        if (!hasSelection()) {
            showToast('error', 'Erreur', 'Sélectionnez au moins une entité.');
            return;
        }
        renderFieldSelection();
        goToStep(2);
    });

    $('#nextToStep3').on('click', () => {
        updateFieldSelection();
        renderSummary();
        goToStep(3);
    });

    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#btnLaunchExport').on('click', launchExport);
}

function enableStep1() {
    $('#dhis2Status').css('display', 'flex');
}

function updateEntitySelection() {
    appState.selectedEntities.users = $('#checkUsers').is(':checked');
    appState.selectedEntities.userGroups = $('#checkUserGroups').is(':checked');
    appState.selectedEntities.userRoles = $('#checkUserRoles').is(':checked');
}

function hasSelection() {
    return Object.values(appState.selectedEntities).some(x => x);
}

function renderFieldSelection() {
    const container = $('#fieldsContainer');
    container.empty();

    const defs = [
        { key: 'users', label: 'Utilisateurs', icon: 'fa-user' },
        { key: 'userGroups', label: 'Groupes', icon: 'fa-users' },
        { key: 'userRoles', label: 'Rôles', icon: 'fa-user-shield' }
    ];

    defs.forEach(def => {
        if (appState.selectedEntities[def.key]) {
            let html = `<div class="fields-group">
                <h3><i class="fas ${def.icon}"></i> ${def.label}</h3>
                <div class="fields-list">`;

            AVAILABLE_FIELDS[def.key].forEach(f => {
                const checked = f.default ? 'checked' : '';
                html += `<label class="field-item">
                    <input type="checkbox" name="f_${def.key}" value="${f.path || f.id}" ${checked}>
                    ${f.name}
                </label>`;
            });

            html += `</div></div>`;
            container.append(html);
        }
    });
}

function updateFieldSelection() {
    ['users', 'userGroups', 'userRoles'].forEach(key => {
        appState.selectedFields[key] = [];
        if (appState.selectedEntities[key]) {
            $(`input[name="f_${key}"]:checked`).each(function () {
                appState.selectedFields[key].push($(this).val());
            });
        }
    });
}

function renderSummary() {
    const ul = $('#exportSummaryList');
    ul.empty();

    if (appState.selectedEntities.users)
        ul.append(`<li><strong>Utilisateurs:</strong> ${appState.selectedFields.users.length} champs</li>`);
    if (appState.selectedEntities.userGroups)
        ul.append(`<li><strong>Groupes:</strong> ${appState.selectedFields.userGroups.length} champs</li>`);
    if (appState.selectedEntities.userRoles)
        ul.append(`<li><strong>Rôles:</strong> ${appState.selectedFields.userRoles.length} champs</li>`);
}

/**
 * Helper to build DHIS2 field params from flat list of dot-notation strings.
 * Example: ['id', 'userCredentials.username', 'userCredentials.password']
 * Returns: 'id,userCredentials[username,password]'
 */
function buildDhis2FieldsParam(fields) {
    const root = {};

    fields.forEach(field => {
        const parts = field.split('.');
        let current = root;
        parts.forEach((part, index) => {
            if (!current[part]) {
                // If it's the last part, mark as leaf (true), otherwise create object
                current[part] = (index === parts.length - 1) ? true : {};
            }
            // If we encounter a node that was previously a leaf but now has children (collision), convert it
            // explicit handling implies we just traverse.
            // Simplified: we assume fields are distinct or subsets.
            current = current[part];
        });
    });

    function stringify(node) {
        if (node === true) return ''; // Should not happen for keys
        const parts = [];
        for (const key in node) {
            if (node[key] === true) {
                parts.push(key);
            } else {
                parts.push(`${key}[${stringify(node[key])}]`);
            }
        }
        return parts.join(',');
    }

    return stringify(root);
}

async function launchExport() {
    const $btn = $('#btnLaunchExport');
    const $progress = $('#progressSection');

    $btn.prop('disabled', true);
    $progress.slideDown();

    try {
        const payload = {};

        if (appState.selectedEntities.users) {
            // Use smart builder for fields
            const fieldsParam = buildDhis2FieldsParam(appState.selectedFields.users);
            console.log('User Fields Param:', fieldsParam);

            const data = await dhis2Session.get('/api/users', {
                fields: fieldsParam,
                paging: false
            });
            payload.users = data.users;
        }

        if (appState.selectedEntities.userGroups) {
            const fieldsParam = buildDhis2FieldsParam(appState.selectedFields.userGroups);
            const data = await dhis2Session.get('/api/userGroups', { fields: fieldsParam, paging: false });
            payload.userGroups = data.userGroups;
        }

        if (appState.selectedEntities.userRoles) {
            const fieldsParam = buildDhis2FieldsParam(appState.selectedFields.userRoles);
            const data = await dhis2Session.get('/api/userRoles', { fields: fieldsParam, paging: false });
            payload.userRoles = data.userRoles;
        }

        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 15);
        downloadJSON(payload, `users_export_${timestamp}.json`);

        showToast('success', 'Export réussi', 'Le fichier a été téléchargé.');

    } catch (err) {
        console.error(err);
        showToast('error', 'Erreur Export', err.message);
    } finally {
        $btn.prop('disabled', false);
        $progress.slideUp();
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
