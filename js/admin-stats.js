/**
 * Administration des modules (Statistiques d'Utilisation) — admin/stats.html
 * CRUD sur t_modules via api/admin-modules.php, protégé par un jeton
 * (Authorization: Bearer <token>) stocké en sessionStorage côté navigateur,
 * comme les identifiants DHIS2 gérés par dhis2-session-manager.js.
 */

const AdminModules = {
    apiUrl: '../api/admin-modules.php',
    tokenKey: 'dhis2tools_admin_token',

    getToken: function () {
        return sessionStorage.getItem(this.tokenKey) || '';
    },

    setToken: function (token) {
        sessionStorage.setItem(this.tokenKey, token);
    },

    clearToken: function () {
        sessionStorage.removeItem(this.tokenKey);
    },

    isConnected: function () {
        return this.getToken() !== '';
    },

    request: async function (action, body) {
        const response = await fetch(`${this.apiUrl}?action=${encodeURIComponent(action)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getToken()}`
            },
            body: JSON.stringify({ action, ...body })
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            return { success: false, message: `Réponse invalide du serveur (HTTP ${response.status}).` };
        }

        if (response.status === 401) {
            this.clearToken();
        }

        return data;
    },

    list: function () { return this.request('list', {}); },
    create: function (mod) { return this.request('create', mod); },
    update: function (mod) { return this.request('update', mod); },
    remove: function (id, hard) { return this.request('delete', { id, hard: !!hard }); }
};

let allModules = [];
let editingId = null;

$(document).ready(function () {
    if (AdminModules.isConnected()) {
        showApp();
    } else {
        showGate();
    }

    $('#adminGateForm').on('submit', async function (e) {
        e.preventDefault();
        const token = $('#adminTokenInput').val().trim();
        if (!token) return;

        AdminModules.setToken(token);
        const result = await AdminModules.list();

        if (result.success) {
            showApp();
            renderModules(result.data);
        } else {
            AdminModules.clearToken();
            showToast('error', 'Accès refusé', result.message || 'Jeton invalide.');
        }
    });

    $('#btnLogout').on('click', function () {
        AdminModules.clearToken();
        showGate();
    });

    $('#btnAddModule').on('click', () => openForm());
    $('#btnCancelForm').on('click', () => closeForm());

    $('#moduleForm').on('submit', async function (e) {
        e.preventDefault();
        await saveModule();
    });

    $('#adminSearchInput').on('input', function () {
        renderTable($(this).val());
    });

    $(document).on('click', '.btn-edit-module', function () {
        const id = parseInt($(this).data('id'), 10);
        const mod = allModules.find(m => m.id === id);
        if (mod) openForm(mod);
    });

    $(document).on('click', '.btn-toggle-active', async function () {
        const id = parseInt($(this).data('id'), 10);
        const mod = allModules.find(m => m.id === id);
        if (!mod) return;

        const result = await AdminModules.update({
            id: mod.id,
            module_path: mod.module_path,
            module_name: mod.module_name,
            category: mod.category,
            icon_class: mod.icon_class,
            is_active: mod.is_active ? 0 : 1
        });

        if (result.success) {
            showToast('success', 'Mis à jour', mod.is_active ? 'Module désactivé.' : 'Module réactivé.');
            await reload();
        } else {
            handleApiError(result);
        }
    });

    $(document).on('click', '.btn-delete-module', async function () {
        const id = parseInt($(this).data('id'), 10);
        const mod = allModules.find(m => m.id === id);
        if (!mod) return;

        const confirmed = confirm(
            `Supprimer DÉFINITIVEMENT « ${mod.module_name} » ?\n\n` +
            `Ceci efface aussi tout son historique de visites (${mod.visit_count} visite(s)). ` +
            `Action irréversible.\n\nPréférez le bouton "Désactiver" si vous voulez juste le ` +
            `masquer sans perdre l'historique.`
        );
        if (!confirmed) return;

        const result = await AdminModules.remove(id, true);
        if (result.success) {
            showToast('success', 'Supprimé', `« ${mod.module_name} » a été supprimé définitivement.`);
            await reload();
        } else {
            handleApiError(result);
        }
    });
});

function showGate() {
    $('#adminGate').show();
    $('#adminApp').hide();
    $('#adminTokenInput').val('').focus();
}

function showApp() {
    $('#adminGate').hide();
    $('#adminApp').show();
    reload();
}

async function reload() {
    const result = await AdminModules.list();
    if (result.success) {
        renderModules(result.data);
    } else {
        handleApiError(result);
    }
}

function handleApiError(result) {
    showToast('error', 'Erreur', result.message || 'Une erreur est survenue.');
    if (!AdminModules.isConnected()) {
        showGate();
    }
}

function renderModules(data) {
    allModules = data;
    updateCategoryDatalist(data);
    renderTable($('#adminSearchInput').val());
}

function updateCategoryDatalist(data) {
    const categories = [...new Set(data.map(m => m.category).filter(Boolean))].sort();
    const $list = $('#categoryList');
    $list.empty();
    categories.forEach(c => $list.append(`<option value="${c}">`));
}

function timeAgoFr(dateStr) {
    if (!dateStr) return 'Jamais';
    const d = new Date(dateStr.replace(' ', 'T'));
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `il y a ${diffD} j`;
    return d.toLocaleDateString('fr-FR');
}

function renderTable(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const filtered = term
        ? allModules.filter(m =>
            m.module_name.toLowerCase().includes(term) ||
            m.module_path.toLowerCase().includes(term) ||
            (m.category || '').toLowerCase().includes(term))
        : allModules;

    const $body = $('#adminTableBody');
    $body.empty();

    $('#adminCount').text(`${allModules.length} module(s) au total`);

    if (filtered.length === 0) {
        $body.append('<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Aucun module ne correspond.</td></tr>');
        return;
    }

    filtered.forEach(m => {
        const activeBadge = m.is_active
            ? '<span class="admin-badge admin-badge-active">Actif</span>'
            : '<span class="admin-badge admin-badge-inactive">Inactif</span>';

        $body.append(`
            <tr class="${m.is_active ? '' : 'row-inactive'}">
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas ${m.icon_class || 'fa-cube'}" style="width:20px; text-align:center; color:#667eea;"></i>
                        <div>
                            <div style="font-weight:600;">${m.module_name}</div>
                            <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">${m.module_path}</div>
                        </div>
                    </div>
                </td>
                <td><span class="admin-category-tag">${m.category || 'Autre'}</span></td>
                <td>${activeBadge}</td>
                <td style="text-align:right; font-weight:600;">${m.visit_count}</td>
                <td>${timeAgoFr(m.last_visit)}</td>
                <td style="text-align:right;">
                    <button class="btn btn-sm btn-edit-module" data-id="${m.id}" title="Modifier">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-toggle-active" data-id="${m.id}" title="${m.is_active ? 'Désactiver' : 'Réactiver'}">
                        <i class="fas ${m.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-delete-module" data-id="${m.id}" title="Supprimer définitivement">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `);
    });
}

function openForm(mod) {
    editingId = mod ? mod.id : null;

    $('#formTitle').text(mod ? 'Modifier le module' : 'Ajouter un module');
    $('#fieldPath').val(mod ? mod.module_path : '').prop('disabled', false);
    $('#fieldName').val(mod ? mod.module_name : '');
    $('#fieldCategory').val(mod ? mod.category : '');
    $('#fieldIcon').val(mod ? mod.icon_class : 'fa-cube');
    $('#fieldActive').prop('checked', mod ? !!mod.is_active : true);

    updateIconPreview();
    $('#moduleFormPanel').fadeIn();
    $('#fieldPath').focus();
}

function closeForm() {
    $('#moduleFormPanel').fadeOut();
    editingId = null;
}

$(document).on('input', '#fieldIcon', updateIconPreview);
function updateIconPreview() {
    const icon = $('#fieldIcon').val().trim() || 'fa-cube';
    $('#iconPreview').attr('class', `fas ${icon}`);
}

async function saveModule() {
    const payload = {
        module_path: $('#fieldPath').val().trim(),
        module_name: $('#fieldName').val().trim(),
        category: $('#fieldCategory').val().trim(),
        icon_class: $('#fieldIcon').val().trim(),
        is_active: $('#fieldActive').is(':checked') ? 1 : 0
    };

    const $btn = $('#moduleForm button[type="submit"]');
    const original = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enregistrement...');

    try {
        const result = editingId
            ? await AdminModules.update({ id: editingId, ...payload })
            : await AdminModules.create(payload);

        if (result.success) {
            showToast('success', 'Enregistré', editingId ? 'Module mis à jour.' : 'Module ajouté.');
            closeForm();
            await reload();
        } else {
            handleApiError(result);
        }
    } finally {
        $btn.prop('disabled', false).html(original);
    }
}

function showToast(type, title, message) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const toast = $(`<div class="toast toast-${type}"><i class="fas ${icons[type]}"></i><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div></div>`);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(300, function () { $(this).remove(); }), 4000);
}
