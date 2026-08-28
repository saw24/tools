/**
 * Data Approvals Module — DHIS2 Tools
 * Supports two selection modes:
 *   - "workflow" : select approval workflows directly (wf param)
 *   - "dataset"  : select datasets, uses "ds" param for scoped approval (backward compat mode)
 *
 * API Docs from user:
 *   Approve: POST /api/dataApprovals?ds={dsId}&pe={pe}&ou={ouId}&aoc={aoc}
 *   Unapprove: DELETE /api/dataApprovals?ds={dsId}&pe={pe}&ou={ouId}&aoc={aoc}
 *   Bulk (Workflow): POST /api/dataApprovals/approvals | POST /api/dataApprovals/unapprovals
 */

'use strict';

/* ══════════════════════════════════════════
   State
══════════════════════════════════════════ */
const appState = {
    selectionMode: 'workflow',   // 'workflow' | 'dataset'
    workflows: [],               // { id, displayName, periodType }
    datasets: [],               // { id, displayName }
    selectedItems: new Set(),    // workflow IDs OR dataset IDs
    dsWorkflowMap: {},           // Cache: dsId → { wfId, wfName, dsName }
    orgUnit: { id: null, name: null },
    periods: [],
    selectedPeriods: new Set(),
    filter: { treeLoaded: false, periodsLoaded: false },
    statusRows: []
};

/* ══════════════════════════════════════════
   Init
══════════════════════════════════════════ */
$(document).ready(function () {
    checkConnection();
    bindEvents();
});

function checkConnection() {
    if (!dhis2Session.isConnected()) {
        $('#step1, .step-indicator').hide();
        showToast('error', 'Session DHIS2 requise', 'Redirection vers l\'accueil...');
        setTimeout(() => { window.location.href = 'index.html'; }, 3000);
    } else {
        $('#step1, .step-indicator').show();
        $('#dhis2Status').css('display', 'flex');
        loadWorkflows();
    }
}

function bindEvents() {
    $('#modeWorkflow').on('click', () => switchMode('workflow'));
    $('#modeDataset').on('click', () => switchMode('dataset'));

    $('#nextToStep2').on('click', () => {
        if (appState.selectedItems.size === 0)
            return showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins un élément.');
        if (!appState.filter.treeLoaded) loadOrgUnitTree();
        goToStep(2);
    });
    $('#nextToStep3').on('click', () => {
        if (!appState.orgUnit.id)
            return showToast('warning', 'Sélection manquante', 'Veuillez sélectionner une unité d\'organisation.');
        if (!appState.filter.periodsLoaded) generatePeriods();
        goToStep(3);
    });
    $('#nextToStep4').on('click', () => {
        if (appState.selectedPeriods.size === 0)
            return showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins une période.');
        goToStep(4);
        loadApprovalStatus();
    });
    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#backToStep3').on('click', () => goToStep(3));
    $('#btnRefreshStatus').on('click', loadApprovalStatus);

    $('#btnSelectAllDS').on('click', () => { $('.ds-checkbox').prop('checked', true); updateItemSelection(); });
    $('#btnDeselectAllDS').on('click', () => { $('.ds-checkbox').prop('checked', false); updateItemSelection(); });
    $(document).on('change', '.ds-checkbox', updateItemSelection);
    $(document).on('click', '.ds-item', function (e) {
        if (!$(e.target).is('input')) {
            const cb = $(this).find('input');
            cb.prop('checked', !cb.prop('checked'));
            updateItemSelection();
        }
    });
    $('#dsSearchInput').on('input', function () { renderList($(this).val()); });

    // Org Unit Tree
    $(document).on('click', '.tree-toggle', function (e) {
        e.stopPropagation();
        const li = $(this).closest('li');
        const ul = li.children('ul');
        const icon = $(this).find('i');
        if (ul.length > 0) { ul.slideToggle(); icon.toggleClass('fa-caret-right fa-caret-down'); }
        else { loadTreeChildren(li.data('id'), li); icon.removeClass('fa-caret-right').addClass('fa-caret-down'); }
    });
    $(document).on('click', '.tree-node-content', function () {
        $('.tree-node-content').removeClass('selected');
        $(this).addClass('selected');
        appState.orgUnit.id = $(this).parent().data('id');
        appState.orgUnit.name = $(this).find('.node-text').text();
        $('#selectedOrgUnitName').val(appState.orgUnit.name);
    });
    let ouTimeout;
    $('#ouSearchInput').on('input', function () {
        clearTimeout(ouTimeout);
        const q = $(this).val();
        if (q.length < 3) { $('#ouSearchResults').hide(); return; }
        ouTimeout = setTimeout(() => searchOrgUnits(q), 500);
    });
    $(document).on('click', function (e) {
        if (!$(e.target).closest('.search-wrapper').length) $('#ouSearchResults').hide();
    });
    $(document).on('click', '.ou-search-item', function () {
        appState.orgUnit.id = $(this).data('id');
        appState.orgUnit.name = $(this).data('name');
        $('#selectedOrgUnitName').val(appState.orgUnit.name);
        $('#ouSearchResults').hide();
        $('#ouSearchInput').val('');
        $('.tree-node-content').removeClass('selected');
    });

    // Periods
    $('#periodSearchInput').on('input', function () { renderPeriods($(this).val()); });
    $('#btnDeselectAllPeriods').on('click', () => { $('.period-checkbox').prop('checked', false); updatePeriodSelection(); });
    $('#presetThisYear').on('click', () => selectPresetPeriods('thisYear'));
    $('#presetLastYear').on('click', () => selectPresetPeriods('lastYear'));
    $('#presetLast12Months').on('click', () => selectPresetPeriods('last12Months'));
    $(document).on('change', '.period-checkbox', updatePeriodSelection);

    // Actions
    $('#selectAllRows').on('change', function () {
        $('#approvalTableBody input[type="checkbox"]').prop('checked', $(this).is(':checked'));
    });
    $('#btnApproveSelected').on('click', () => bulkAction('approve'));
    $('#btnUnapproveSelected').on('click', () => bulkAction('unapprove'));
    $('#btnUnacceptSelected').on('click', () => bulkAction('unaccept'));
}

/* ══════════════════════════════════════════
   Mode Switch
══════════════════════════════════════════ */
function switchMode(mode) {
    if (appState.selectionMode === mode) return;
    appState.selectionMode = mode;
    appState.selectedItems.clear();
    updateItemSelection();

    if (mode === 'workflow') {
        $('#modeWorkflow').addClass('active');
        $('#modeDataset').removeClass('active');
        $('#modeInfoText').text('Mode Workflow : sélectionnez le workflow d\'approbation directement.');
        renderList();
    } else {
        $('#modeDataset').addClass('active');
        $('#modeWorkflow').removeClass('active');
        $('#modeInfoText').text('Mode Dataset : sélection par ensemble de données (plus précis).');
        if (appState.datasets.length === 0) loadDatasets();
        else renderList();
    }
}

/* ══════════════════════════════════════════
   Step 1 — Load Data
══════════════════════════════════════════ */
async function loadWorkflows() {
    const container = $('#dsListContainer');
    container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>');
    try {
        const data = await dhis2Session.get('/api/dataApprovalWorkflows', { paging: false, fields: 'id,displayName,periodType' });
        appState.workflows = (data.dataApprovalWorkflows || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        renderList();
    } catch (e) { container.html('<div class="text-error">Erreur workflows.</div>'); }
}

async function loadDatasets() {
    const container = $('#dsListContainer');
    container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>');
    try {
        const data = await dhis2Session.get('/api/dataSets', { paging: false, fields: 'id,displayName,workflow[id,displayName]' });
        appState.datasets = (data.dataSets || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        renderList();
    } catch (e) { container.html('<div class="text-error">Erreur datasets.</div>'); }
}

function renderList(searchTerm = '') {
    const container = $('#dsListContainer');
    container.empty();
    const isDS = appState.selectionMode === 'dataset';
    const items = isDS ? appState.datasets : appState.workflows;
    const q = (searchTerm || '').toLowerCase();

    const filtered = items.filter(it => it.displayName.toLowerCase().includes(q) || it.id.toLowerCase().includes(q));
    if (!filtered.length) { container.append('<div style="padding:20px; text-align:center;">Aucun élément.</div>'); return; }

    filtered.forEach(it => {
        const isSelected = appState.selectedItems.has(it.id);
        const wfBadge = (isDS && it.workflow) ? `<span class="ds-badge-wf">${it.workflow.displayName}</span>` : '';
        container.append(`
            <div class="selectable-item ds-item ${isSelected ? 'selected' : ''}" data-id="${it.id}">
                <input type="checkbox" class="ds-checkbox" value="${it.id}" ${isSelected ? 'checked' : ''}>
                <div class="item-info">
                    <span class="item-name">${it.displayName}${wfBadge}</span>
                    <span class="item-id">${it.id}</span>
                </div>
            </div>
        `);
    });
}

function updateItemSelection() {
    appState.selectedItems.clear();
    $('.ds-checkbox:checked').each(function () { appState.selectedItems.add($(this).val()); });
    $('.ds-item').removeClass('selected');
    $('.ds-checkbox:checked').closest('.ds-item').addClass('selected');
    const label = appState.selectionMode === 'dataset' ? 'dataset(s)' : 'workflow(s)';
    $('#dsSelectionCount').text(`${appState.selectedItems.size} ${label} sélectionné(s)`);
}

/* ══════════════════════════════════════════
   Step 2 — Org Units
══════════════════════════════════════════ */
async function loadOrgUnitTree() {
    const container = $('#orgUnitTreeContainer');
    try {
        const data = await dhis2Session.get('/api/organisationUnits', { level: 1, fields: 'id,displayName,children::isNotEmpty', paging: false });
        container.empty();
        const rootUl = $('<ul class="tree-ul root-ul"></ul>');
        data.organisationUnits.sort((a, b) => a.displayName.localeCompare(b.displayName)).forEach(ou => rootUl.append(renderTreeNode(ou)));
        container.append(rootUl);
        appState.filter.treeLoaded = true;
    } catch (e) { container.html('<p class="text-error">Erreur arbre.</p>'); }
}

async function loadTreeChildren(parentId, parentLi) {
    try {
        const data = await dhis2Session.get(`/api/organisationUnits/${parentId}`, { fields: 'children[id,displayName,children::isNotEmpty]' });
        const children = (data.children || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        if (children.length) {
            const ul = $('<ul class="tree-ul" style="display:none;"></ul>');
            children.forEach(c => ul.append(renderTreeNode(c)));
            parentLi.append(ul);
            ul.slideDown();
        }
    } catch (e) { }
}

function renderTreeNode(ou) {
    const isLeaf = !ou.children;
    return $(`
        <li data-id="${ou.id}">
            <div class="tree-node-content">
                <span class="tree-toggle">${isLeaf ? '' : '<i class="fas fa-caret-right"></i>'}</span>
                <i class="fas ${isLeaf ? 'fa-circle' : 'fa-folder'} tree-icon" style="${isLeaf ? 'font-size:8px;' : ''}"></i>
                <span class="node-text">${ou.displayName}</span>
            </div>
        </li>
    `);
}

async function searchOrgUnits(query) {
    const rc = $('#ouSearchResults').html('<div style="padding:10px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>').show();
    try {
        const data = await dhis2Session.get('/api/organisationUnits', { filter: `displayName:ilike:${query}`, fields: 'id,displayName', pageSize: 15 });
        rc.empty();
        if (!data.organisationUnits?.length) { rc.html('<div style="padding:10px;">Aucun résultat.</div>'); return; }
        data.organisationUnits.forEach(ou => {
            rc.append(`<div class="ou-search-item" data-id="${ou.id}" data-name="${ou.displayName}"><strong>${ou.displayName}</strong><span class="ou-path">${ou.id}</span></div>`);
        });
    } catch (e) { rc.hide(); }
}

/* ══════════════════════════════════════════
   Step 3 — Periods
══════════════════════════════════════════ */
function generatePeriods() {
    const periods = [];
    const cy = new Date().getFullYear();
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let y = cy; y >= cy - 5; y--) {
        periods.push({ id: `${y}`, name: `${y} (Annuel)` });
        for (let q = 4; q >= 1; q--) periods.push({ id: `${y}Q${q}`, name: `T${q} ${y}` });
        for (let m = 12; m >= 1; m--) {
            periods.push({ id: `${y}${m < 10 ? '0' + m : m}`, name: `${months[m - 1]} ${y}` });
        }
        // Weeks (checking if W53 exists)
        const hasW53 = (year) => {
            const date = new Date(year, 11, 28); // Dec 28th is always in the last week
            const day = date.getDay(); // 0: Sun, 1: Mon, ..., 4: Thu
            // Year has 53 weeks if Dec 28 is a Thursday, or Wednesday in a leap year
            // This is a common formula for ISO weeks
            const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
            return (day === 4 || (isLeap && day === 3));
        };
        const maxWeeks = hasW53(y) ? 53 : 52;
        for (let w = maxWeeks; w >= 1; w--) {
            periods.push({ id: `${y}W${w}`, name: `S${w} - ${y}` });
        }
    }
    appState.periods = periods;
    appState.filter.periodsLoaded = true;
    renderPeriods();
}

function renderPeriods(searchTerm = '') {
    const container = $('#periodListContainer').empty();
    const q = searchTerm.toLowerCase();
    appState.periods.filter(p => p.name.toLowerCase().includes(q) || p.id.includes(q)).forEach(p => {
        const isSelected = appState.selectedPeriods.has(p.id);
        container.append(`
            <div class="selectable-item period-item ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                <input type="checkbox" class="period-checkbox" value="${p.id}" ${isSelected ? 'checked' : ''}>
                <div class="item-info"><span class="item-name">${p.name}</span><span class="item-id">${p.id}</span></div>
            </div>
        `);
    });
}

function updatePeriodSelection() {
    appState.selectedPeriods.clear();
    $('.period-checkbox:checked').each(function () { appState.selectedPeriods.add($(this).val()); });
    $('#periodSelectionCount').text(`${appState.selectedPeriods.size} période(s) sélectionnée(s)`);
}

function selectPresetPeriods(type) {
    const now = new Date(), cy = now.getFullYear();
    const toSelect = [];
    if (type === 'thisYear') { toSelect.push(`${cy}`); for (let m = 1; m <= 12; m++) toSelect.push(`${cy}${m < 10 ? '0' + m : m}`); }
    else if (type === 'lastYear') { const ly = cy - 1; toSelect.push(`${ly}`); for (let m = 1; m <= 12; m++) toSelect.push(`${ly}${m < 10 ? '0' + m : m}`); }
    $('.period-checkbox').each(function () { if (toSelect.includes($(this).val())) $(this).prop('checked', true); });
    updatePeriodSelection();
}

/* ══════════════════════════════════════════
   Step 4 — Status & Actions
══════════════════════════════════════════ */
async function resolveWorkflows() {
    const isDS = appState.selectionMode === 'dataset';
    const results = [];
    for (const id of appState.selectedItems) {
        if (!isDS) {
            const wf = appState.workflows.find(w => w.id === id);
            results.push({ wfId: id, wfName: wf?.displayName || id, dsId: null, dsName: null });
        } else {
            // Find in current data or fetch
            let ds = appState.datasets.find(d => d.id === id);
            if (!ds || !ds.workflow) {
                try { ds = await dhis2Session.get(`/api/dataSets/${id}`, { fields: 'id,displayName,workflow[id,displayName]' }); } catch (e) { }
            }
            if (ds?.workflow) {
                results.push({ wfId: ds.workflow.id, wfName: ds.workflow.displayName, dsId: ds.id, dsName: ds.displayName });
            } else {
                addLog(`⚠ Dataset ${id} : aucun workflow. Ignoré.`, 'warning');
            }
        }
    }
    return results;
}

async function loadApprovalStatus() {
    $('#statusLoading').show(); $('#statusResults').hide(); showLogs(true);
    addLog('Résolution des contextes...', 'info');

    const contextList = await resolveWorkflows();
    const peIds = Array.from(appState.selectedPeriods);
    const ouId = appState.orgUnit.id;
    const allRows = [];
    const total = contextList.length * peIds.length;
    let done = 0;

    for (const ctx of contextList) {
        for (const pe of peIds) {
            try {
                // Use ds parameter if in dataset mode for more precision
                const params = ctx.dsId ? { ds: ctx.dsId, pe, ou: ouId } : { wf: ctx.wfId, pe, ou: ouId };
                const resp = await dhis2Session.get('/api/dataApprovals', params);
                const items = Array.isArray(resp) ? resp : [resp];
                items.forEach(item => {
                    if (!item?.state) return;
                    allRows.push({
                        wfId: ctx.wfId, wfName: ctx.wfName,
                        dsId: ctx.dsId, dsName: ctx.dsName,
                        ouId: item.ou?.id || ouId, ouName: item.ou?.displayName || appState.orgUnit.name,
                        pe, aoc: item.aoc?.id || 'HllvX50cXC0',
                        state: item.state
                    });
                });
            } catch (e) {
                allRows.push({
                    wfId: ctx.wfId, wfName: ctx.wfName, dsId: ctx.dsId, dsName: ctx.dsName,
                    ouId, ouName: appState.orgUnit.name, pe, aoc: 'HllvX50cXC0', state: 'UNAPPROVABLE'
                });
            }
            done++;
            $('#statusProgressBar').css('width', `${Math.round((done / total) * 100)}%`);
        }
    }
    appState.statusRows = allRows;
    renderStatusTable(allRows);
    $('#statusLoading').hide(); $('#statusResults').show();
}

const STATE_LABELS = {
    APPROVED_HERE: { label: 'Approuvé ici', icon: 'fa-check-circle', cls: 'APPROVED_HERE' },
    ACCEPTED_HERE: { label: 'Accepté ici', icon: 'fa-check-double', cls: 'ACCEPTED_HERE' },
    APPROVED_ABOVE: { label: 'Approuvé en amont', icon: 'fa-arrow-up', cls: 'APPROVED_ABOVE' },
    UNAPPROVED: { label: 'Non approuvé', icon: 'fa-circle', cls: 'UNAPPROVED' },
    UNAPPROVABLE: { label: 'Non approbable', icon: 'fa-ban', cls: 'UNAPPROVABLE' },
    READY_FOR_APPROVAL: { label: 'Prêt pour approbation', icon: 'fa-hourglass-half', cls: 'READY_FOR_APPROVAL' },
    UNAPPROVED_READY: { label: 'Prêt pour approbation', icon: 'fa-hourglass-half', cls: 'READY_FOR_APPROVAL' },
    PARTIALLY_APPROVED: { label: 'Partiellement approuvé', icon: 'fa-adjust', cls: 'WAITING_FOR_LOWER_LEVEL_ORG_UNITS' },
    WAITING_FOR_LOWER_LEVEL_ORG_UNITS: { label: 'Attend niveaux inférieurs', icon: 'fa-clock', cls: 'WAITING_FOR_LOWER_LEVEL_ORG_UNITS' },
};

function renderStatusTable(rows) {
    const isDS = appState.selectionMode === 'dataset';
    const thead = $('#approvalTable thead').empty().append(`
        <tr>
            <th></th><th>Unité d'Org.</th>${isDS ? '<th>Dataset</th>' : ''}<th>Workflow</th><th>Période</th><th>Statut</th>
        </tr>
    `);
    const tbody = $('#approvalTableBody').empty();
    if (!rows.length) { tbody.append(`<tr><td colspan="${isDS ? 6 : 5}" style="text-align:center;">Aucun résultat.</td></tr>`); return; }

    rows.forEach((row, idx) => {
        const s = STATE_LABELS[row.state] || { label: row.state, icon: 'fa-question', cls: 'UNAPPROVED' };
        tbody.append(`
            <tr data-idx="${idx}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-idx="${idx}"></td>
                <td>${row.ouName}</td>
                ${isDS ? `<td>${row.dsName || '—'}</td>` : ''}
                <td title="${row.wfId}">${row.wfName}</td>
                <td>${row.pe}</td>
                <td><span class="badge-status badge-${s.cls}"><i class="fas ${s.icon}"></i> ${s.label}</span></td>
            </tr>
        `);
    });
    buildSummary(rows);
}

function buildSummary(rows) {
    const counts = {}; rows.forEach(r => { counts[r.state] = (counts[r.state] || 0) + 1; });
    const summary = $('#statusSummary').empty().append(`<span>Total : <strong>${rows.length}</strong></span>`);
    Object.entries(counts).forEach(([state, cnt]) => {
        const s = STATE_LABELS[state] || { label: state };
        summary.append(`<span>${s.label} : <strong>${cnt}</strong></span>`);
    });
}

async function bulkAction(action) {
    const selectedIdxs = [];
    $('.row-checkbox:checked').each(function () { selectedIdxs.push(parseInt($(this).data('idx'))); });
    if (!selectedIdxs.length) return showToast('warning', 'Aucune sélection', 'Cochez des lignes.');

    showLogs(true);
    addLog(`Démarrage : ${action} sur ${selectedIdxs.length} ligne(s)...`, 'info');
    $('#bulkProgressWrap').show();

    let successCount = 0, errorCount = 0, done = 0;
    for (const idx of selectedIdxs) {
        const row = appState.statusRows[idx];
        // Priority to 'ds' if we are in dataset mode for scoped approval
        const contextParam = row.dsId ? `ds=${row.dsId}` : `wf=${row.wfId}`;
        const params = `?${contextParam}&pe=${row.pe}&ou=${row.ouId}&aoc=${row.aoc}`;

        try {
            if (action === 'approve') {
                // Following documentation: POST /api/dataApprovals?ds=...&pe=...&ou=...
                await dhis2Session.post(`/api/dataApprovals${params}`);
            } else if (action === 'unapprove') {
                if (row.state === 'ACCEPTED_HERE') await dhis2Session.delete(`/api/dataAcceptances${params}`);
                await dhis2Session.delete(`/api/dataApprovals${params}`);
            } else if (action === 'unaccept') {
                await dhis2Session.delete(`/api/dataAcceptances${params}`);
            }
            addLog(`✓ ${row.ouName} | ${row.pe} : Succès`, 'success');
            successCount++;
        } catch (err) {
            console.error(err);
            const msg = err.data?.message || err.message || 'Erreur inconnue';
            addLog(`✗ ${row.ouName} | ${row.pe} : ${msg}`, 'error');
            errorCount++;
        }
        done++;
        $('#bulkProgressBar').css('width', `${Math.round((done / selectedIdxs.length) * 100)}%`);
    }

    showToast(errorCount === 0 ? 'success' : 'warning', 'Action terminée', `${successCount} succès, ${errorCount} erreurs.`);
    loadApprovalStatus();
}

function goToStep(step) {
    $('.step-content').hide(); $(`#step${step}`).fadeIn();
    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= step; i++) {
        $(`.step-item[data-step="${i}"]`).addClass(i === step ? 'active' : 'completed');
    }
}

function showLogs(v) { v ? $('#executionLogs').show() : $('#executionLogs').hide(); }
function addLog(m, t = '') {
    const l = $('#executionLogs');
    l.append(`<div class="log-entry"><span class="log-time">[${new Date().toLocaleTimeString()}]</span> <span class="log-${t}">${m}</span></div>`);
    l.scrollTop(l[0].scrollHeight);
}

function showToast(type, title, message) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const toast = $(`<div class="toast toast-${type}"><i class="fas ${icons[type]}"></i><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div></div>`);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(300, function () { $(this).remove(); }), 4000);
}
