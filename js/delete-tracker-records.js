/**
 * Tracker Data Records Deletion Module
 * Handles identification and mass deletion of tracker events/records.
 */

$(document).ready(function () {
    initTrackerDeletion();
});

const appState = {
    programs: [],
    selectedProgram: null,
    stages: [],
    selectedStage: 'ALL',
    orgUnit: { id: null, name: null },
    periods: [],
    selectedPeriods: new Set(),
    identifiedEvents: [],
    filter: {
        treeLoaded: false,
        periodsLoaded: false
    }
};

function initTrackerDeletion() {
    $(document).on('dhis2:connected', checkConnection);
    checkConnection();

    // Step 1 Events
    $('#programSelect').on('change', function () {
        const programId = $(this).val();
        if (programId) {
            appState.selectedProgram = programId;
            loadStages(programId);
            $('#nextToStep2').prop('disabled', false);
        } else {
            $('#nextToStep2').prop('disabled', true);
            $('#stageGroup').hide();
        }
    });

    $('#stageSelect').on('change', function () {
        appState.selectedStage = $(this).val();
    });

    // Navigation
    $('#nextToStep2').on('click', () => {
        if (!appState.filter.treeLoaded) loadOrgUnitTree();
        goToStep(2);
    });

    $('#nextToStep3').on('click', () => {
        if (!appState.orgUnit.id) {
            showToast('warning', 'Unité manquante', 'Veuillez sélectionner une unité d\'organisation.');
            return;
        }
        if (!appState.filter.periodsLoaded) generatePeriods();
        goToStep(3);
    });

    $('#nextToStep4').on('click', () => {
        const startDate = $('#startDateInput').val();
        const endDate = $('#endDateInput').val();
        const hasCustomRange = startDate || endDate;

        if (appState.selectedPeriods.size === 0 && !hasCustomRange) {
            showToast('warning', 'Critère temporel manquant', 'Veuillez sélectionner au moins une période ou définir une plage de dates.');
            return;
        }
        goToStep(4);
        identifyRecords();
    });

    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#backToStep3').on('click', () => goToStep(3));

    // Org Unit Search
    let searchTimeout;
    $('#ouSearchInput').on('input', function () {
        const query = $(this).val();
        clearTimeout(searchTimeout);
        if (query.length < 3) { $('#ouSearchResults').hide(); return; }
        searchTimeout = setTimeout(() => searchOrgUnits(query), 500);
    });

    $(document).on('click', '.ou-search-item', function () {
        const id = $(this).data('id');
        const name = $(this).data('name');
        setOrgUnit(id, name);
        $('#ouSearchResults').hide();
    });

    // Periods
    $('#periodSearchInput').on('input', function () { renderPeriods($(this).val()); });
    $(document).on('change', '.period-checkbox', updatePeriodSelection);
    $('#presetThisYear').on('click', () => selectPresetPeriods('thisYear'));
    $('#presetLastYear').on('click', () => selectPresetPeriods('lastYear'));

    // Confirmation & Execution
    $('#confirmDeletionCheck').on('change', function () {
        $('#btnLaunchDeletion').prop('disabled', !$(this).is(':checked'));
    });

    $('#btnLaunchDeletion').on('click', launchDeletionProcess);
    $('#btnExportJSON').on('click', exportJSONBackup);
    $('#btnExportExcel').on('click', exportExcelTable);

    // Tree Expansion & Selection Events (Aligned with delete-data-values.js)
    $(document).on('click', '.tree-toggle', function (e) {
        e.stopPropagation();
        const li = $(this).closest('li');
        const ul = li.children('ul');
        const icon = $(this).find('i');

        if (ul.length > 0) {
            ul.slideToggle();
            icon.toggleClass('fa-caret-right fa-caret-down');
        } else {
            const orgUnitId = li.data('id');
            loadTreeChildren(orgUnitId, li);
            icon.removeClass('fa-caret-right').addClass('fa-caret-down');
        }
    });

    $(document).on('click', '.tree-node-content', function () {
        $('.tree-node-content').removeClass('selected');
        $(this).addClass('selected');

        const id = $(this).parent().data('id');
        const name = $(this).find('.node-text').text();

        appState.orgUnit.id = id;
        appState.orgUnit.name = name;
        $('#selectedOrgUnitName').val(name);
    });
}

function checkConnection() {
    if (!dhis2Session.isConnected()) {
        $('#step1, #stepIndicator').hide();
        showToast('error', 'Session DHIS2 requise', 'Vous allez être redirigé vers la page d\'accueil pour vous connecter...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    } else {
        $('#step1, #stepIndicator').show();
        enableModule();
    }
}

async function enableModule() {
    $('#dhis2Status').css('display', 'flex');
    if (appState.programs.length === 0) {
        loadPrograms();
    }
}

async function loadPrograms() {
    const select = $('#programSelect');
    try {
        const data = await dhis2Session.get('/api/programs', {
            fields: 'id,displayName,programType',
            paging: false
        });

        appState.programs = data.programs.sort((a, b) => a.displayName.localeCompare(b.displayName));
        select.empty().append('<option value="">-- Sélectionnez un programme (Tracker ou Événement) --</option>');

        appState.programs.forEach(p => {
            const typeLabel = p.programType === 'WITH_REGISTRATION' ? 'Tracker' : 'Événement';
            select.append(`<option value="${p.id}">${p.displayName} [${typeLabel}]</option>`);
        });
    } catch (e) {
        console.error(e);
        select.html('<option value="">Erreur de chargement des programmes</option>');
    }
}

async function loadStages(programId) {
    const stageSelect = $('#stageSelect');
    $('#stageGroup').show();
    try {
        const data = await dhis2Session.get('/api/programStages', {
            filter: `program.id:eq:${programId}`,
            fields: 'id,displayName',
            paging: false
        });
        appState.stages = data.programStages;
        stageSelect.empty().append('<option value="ALL">Toutes les étapes du programme</option>');
        appState.stages.sort((a, b) => a.displayName.localeCompare(b.displayName)).forEach(s => {
            stageSelect.append(`<option value="${s.id}">${s.displayName}</option>`);
        });
    } catch (e) {
        console.error(e);
    }
}

// Same Tree Logic as delete-data-values
async function loadOrgUnitTree() {
    const container = $('#orgUnitTreeContainer');
    try {
        const data = await dhis2Session.get('/api/organisationUnits', {
            level: 1,
            fields: 'id,displayName,children::isNotEmpty',
            paging: false
        });
        container.empty();
        const rootUl = $('<ul class="tree-ul root-ul"></ul>');
        data.organisationUnits.sort((a, b) => a.displayName.localeCompare(b.displayName)).forEach(ou => {
            rootUl.append(renderTreeNode(ou));
        });
        container.append(rootUl);
        appState.filter.treeLoaded = true;
    } catch (e) { container.html('<p class="text-error">Erreur</p>'); }
}

async function loadTreeChildren(parentId, parentLi) {
    try {
        const data = await dhis2Session.get(`/api/organisationUnits/${parentId}`, {
            fields: 'children[id,displayName,children::isNotEmpty]'
        });

        const children = data.children;
        if (children && children.length > 0) {
            children.sort((a, b) => a.displayName.localeCompare(b.displayName));
            const ul = $('<ul class="tree-ul" style="display:none;"></ul>');
            children.forEach(child => {
                ul.append(renderTreeNode(child));
            });
            parentLi.append(ul);
            ul.slideDown();
        } else {
            parentLi.find('.tree-toggle i').removeClass('fa-caret-down').addClass('fa-caret-right').css('opacity', '0.3');
        }
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger les unités enfants');
    }
}

function renderTreeNode(ou) {
    const hasChildren = ou.children === true || (Array.isArray(ou.children) && ou.children.length > 0) || ou.children === undefined;
    const isLeaf = !hasChildren;
    const toggleHtml = isLeaf ?
        '<span class="tree-toggle" style="opacity:0"></span>' :
        '<span class="tree-toggle"><i class="fas fa-caret-right"></i></span>';

    const iconClass = isLeaf ? 'fa-circle' : 'fa-folder';

    return $(`
        <li data-id="${ou.id}">
            <div class="tree-node-content">
                ${toggleHtml}
                <i class="fas ${iconClass} tree-icon"></i>
                <span class="node-text">${ou.displayName}</span>
            </div>
        </li>
    `);
}

function setOrgUnit(id, name) {
    appState.orgUnit.id = id;
    appState.orgUnit.name = name;
    $('#selectedOrgUnitName').val(name);
    $('.tree-node-content').removeClass('selected');
    $(`li[data-id="${id}"] > .tree-node-content`).addClass('selected');
}

// Period Logic
function generatePeriods() {
    const periods = [];
    const currentYear = new Date().getFullYear();
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    for (let y = currentYear; y >= currentYear - 3; y--) {
        periods.push({ id: `${y}`, name: `${y} (Annuel)` });
        for (let m = 12; m >= 1; m--) {
            const mStr = m < 10 ? `0${m}` : `${m}`;
            periods.push({ id: `${y}${mStr}`, name: `${monthNames[m - 1]} ${y}` });
        }
    }
    appState.periods = periods;
    appState.filter.periodsLoaded = true;
    renderPeriods();
}

function renderPeriods(searchTerm = '') {
    const container = $('#periodListContainer').empty();
    appState.periods.filter(p => p.name.includes(searchTerm)).forEach(p => {
        const isSelected = appState.selectedPeriods.has(p.id);
        container.append(`
            <div class="item-row ${isSelected ? 'selected' : ''}">
                <input type="checkbox" class="period-checkbox" value="${p.id}" ${isSelected ? 'checked' : ''}>
                <div class="item-info"><span class="item-name">${p.name}</span><span class="item-id">${p.id}</span></div>
            </div>
        `);
    });
}

function updatePeriodSelection() {
    appState.selectedPeriods.clear();
    $('.period-checkbox:checked').each(function () { appState.selectedPeriods.add($(this).val()); });
    renderPeriods($('#periodSearchInput').val());
}

function selectPresetPeriods(type) {
    const year = new Date().getFullYear();
    if (type === 'thisYear') {
        appState.selectedPeriods.add(`${year}`);
        for (let m = 1; m <= 12; m++) appState.selectedPeriods.add(`${year}${m < 10 ? '0' + m : m}`);
    } else {
        const last = year - 1;
        appState.selectedPeriods.add(`${last}`);
        for (let m = 1; m <= 12; m++) appState.selectedPeriods.add(`${last}${m < 10 ? '0' + m : m}`);
    }
    renderPeriods();
}

// Tracker Core Logic
async function identifyRecords() {
    $('#identificationLoading').show();
    $('#previewContainer').hide();
    const progressBar = $('#identificationProgressBar').css('width', '10%');

    appState.identifiedEvents = [];

    const startDate = $('#startDateInput').val();
    const endDate = $('#endDateInput').val();
    const periods = Array.from(appState.selectedPeriods);

    if (!startDate && !endDate && periods.length === 0) {
        showToast('warning', 'Critère temporel manquant', 'Veuillez sélectionner au moins une période ou définir une plage de dates.');
        $('#identificationLoading').hide();
        return;
    }

    try {
        if (startDate || endDate) {
            // Priority to Custom Range
            const params = {
                program: appState.selectedProgram,
                orgUnit: appState.orgUnit.id,
                ouMode: 'DESCENDANTS',
                paging: false,
                fields: 'event,occurredAt,orgUnitName,programStage'
            };
            if (startDate) params.occurredAfter = startDate;
            if (endDate) params.occurredBefore = endDate;
            if (appState.selectedStage !== 'ALL') params.programStage = appState.selectedStage;

            const response = await dhis2Session.get('/api/tracker/events', params);
            if (response.instances) appState.identifiedEvents = response.instances;
            progressBar.css('width', '100%');
        } else {
            // Handle List of Periods
            for (let i = 0; i < periods.length; i++) {
                const pId = periods[i];
                const params = {
                    program: appState.selectedProgram,
                    orgUnit: appState.orgUnit.id,
                    ouMode: 'DESCENDANTS',
                    paging: false,
                    fields: 'event,occurredAt,orgUnitName,programStage'
                };

                // Convert DHIS2 period to dates
                if (pId.length === 4) { // Year
                    params.occurredAfter = `${pId}-01-01`;
                    params.occurredBefore = `${pId}-12-31`;
                } else { // Month
                    const y = pId.substring(0, 4);
                    const m = pId.substring(4, 6);
                    params.occurredAfter = `${y}-${m}-01`;
                    params.occurredBefore = `${y}-${m}-31`;
                }

                if (appState.selectedStage !== 'ALL') params.programStage = appState.selectedStage;

                const response = await dhis2Session.get('/api/tracker/events', params);
                if (response.instances) appState.identifiedEvents = appState.identifiedEvents.concat(response.instances);

                progressBar.css('width', `${Math.round(((i + 1) / periods.length) * 100)}%`);
            }
        }

        $('#totalRecordsFound').text(appState.identifiedEvents.length);
        renderPreviewTable();
        $('#identificationLoading').hide();
        $('#previewContainer').fadeIn();

    } catch (e) {
        console.error(e);
        let errorMsg = e.message || 'Une erreur est survenue';

        // Translate common DHIS2 tracker errors
        if (errorMsg.includes('Selected program is invalid for selected organisation unit')) {
            errorMsg = "Le programme sélectionné n'est pas assigné à l'unité d'organisation sélectionnée.";
        }

        showToast('error', 'Recherche impossible', errorMsg);
        $('#identificationLoading').html(`
            <div style="text-align:center; padding:20px;">
                <i class="fas fa-exclamation-circle" style="font-size:48px; color:#ef4444; margin-bottom:15px;"></i>
                <h4>Erreur lors de la recherche</h4>
                <p>${errorMsg}</p>
                <button class="btn btn-secondary" style="margin-top:15px;" onclick="goToStep(2)">Modifier l'unité d'organisation</button>
            </div>
        `);
    }
}

function renderPreviewTable() {
    const tbody = $('#trackerPreviewTable tbody').empty();

    // Create a map for stage names
    const stageMap = {};
    appState.stages.forEach(s => stageMap[s.id] = s.displayName);

    appState.identifiedEvents.slice(0, 100).forEach(ev => {
        const stageName = stageMap[ev.programStage] || ev.programStage;
        const program = appState.programs.find(p => p.id === appState.selectedProgram);
        const programName = program ? program.displayName : 'N/A';

        tbody.append(`
            <tr>
                <td style="font-family: monospace; font-size: 11px;">${ev.event}</td>
                <td>${ev.occurredAt ? ev.occurredAt.split('T')[0] : 'N/A'}</td>
                <td>${ev.orgUnitName}</td>
                <td><span class="badge" style="background: rgba(102, 126, 234, 0.1); color: #667eea; padding: 2px 6px; border-radius: 4px;">${programName}</span></td>
                <td>${stageName}</td>
                <td style="color: #10b981;"><i class="fas fa-check-circle"></i> Identifié</td>
            </tr>
        `);
    });
    if (appState.identifiedEvents.length > 100) {
        tbody.append(`<tr><td colspan="6" style="text-align:center; background: rgba(255,255,255,0.02); color:var(--text-muted); padding: 15px;">... et ${appState.identifiedEvents.length - 100} autres dossiers</td></tr>`);
    }
}

async function launchDeletionProcess() {
    goToStep(5);
    const logs = $('#executionLogs').empty();
    const progressBar = $('#deletionProgressBar').css('width', '0%');
    const progressText = $('#deletionProgressText');

    addLog('Démarrage de la suppression Tracker...', 'info');

    try {
        const eventsToDelete = appState.identifiedEvents;
        const batchSize = 100; // Tracker API preferred batch size
        let count = 0;

        for (let i = 0; i < eventsToDelete.length; i += batchSize) {
            const batch = eventsToDelete.slice(i, i + batchSize);
            const payload = {
                events: batch.map(e => ({ event: e.event }))
            };

            addLog(`Envoi du lot ${Math.floor(i / batchSize) + 1} (${batch.length} dossiers)...`);

            const result = await dhis2Session.post('/api/tracker?importStrategy=DELETE&async=false', payload);

            if (result.status === 'OK' || result.bundleReport) {
                count += batch.length;
                addLog(`Lot supprimé avec succès.`, 'success');
            } else {
                addLog(`Erreur lot: ${result.message || 'Détails indisponibles'}`, 'error');
            }

            const progress = Math.round(((i + batch.length) / eventsToDelete.length) * 100);
            progressBar.css('width', `${progress}%`);
            progressText.text(`Suppression : ${count} / ${eventsToDelete.length} records...`);
        }

        addLog('Suppression terminée.', 'success');
        showToast('success', 'Terminé', `${count} dossiers ont été supprimés.`);
    } catch (e) {
        addLog('Erreur: ' + e.message, 'error');
    } finally {
        $('#finalActions').show();
    }
}

function addLog(msg, type = '') {
    const time = new Date().toLocaleTimeString();
    $('#executionLogs').append(`<div class="log-entry"><span style="color:#666;">[${time}]</span> <span class="log-${type}">${msg}</span></div>`).scrollTop(99999);
}

function goToStep(s) {
    $('.step-content').hide(); $(`#step${s}`).fadeIn();
    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= s; i++) $(`.step-item[data-step="${i}"]`).addClass(i === s ? 'active' : 'completed');
}

async function exportJSONBackup() {
    if (appState.identifiedEvents.length === 0) return;

    const btn = $('#btnExportJSON');
    const originalHtml = btn.html();
    btn.html('<i class="fas fa-spinner fa-spin"></i> Préparation du backup...').prop('disabled', true);

    showToast('info', 'Backup en cours', 'Récupération des données filtrées pour restauration...');

    // Get current filter criteria (same as identifyRecords)
    const startDate = $('#startDateInput').val();
    const endDate = $('#endDateInput').val();
    const periods = Array.from(appState.selectedPeriods);

    try {
        let fullEvents = [];
        const baseParams = {
            program: appState.selectedProgram,
            orgUnit: appState.orgUnit.id,
            ouMode: 'DESCENDANTS',
            paging: false,
            fields: '*' // Critical: Capture full record for importer
        };
        if (appState.selectedStage !== 'ALL') baseParams.programStage = appState.selectedStage;

        if (startDate || endDate) {
            // Case: Custom Range
            const params = { ...baseParams };
            if (startDate) params.occurredAfter = startDate;
            if (endDate) params.occurredBefore = endDate;

            const response = await dhis2Session.get('/api/tracker/events', params);
            if (response.instances) fullEvents = response.instances;
        } else {
            // Case: List of Periods
            for (let i = 0; i < periods.length; i++) {
                const pId = periods[i];
                const params = { ...baseParams };

                // Convert DHIS2 period to dates
                if (pId.length === 4) { // Year
                    params.occurredAfter = `${pId}-01-01`;
                    params.occurredBefore = `${pId}-12-31`;
                } else { // Month
                    const y = pId.substring(0, 4);
                    const m = pId.substring(4, 6);
                    params.occurredAfter = `${y}-${m}-01`;
                    params.occurredBefore = `${y}-${m}-31`;
                }

                btn.html(`<i class="fas fa-spinner fa-spin"></i> Période ${i + 1}/${periods.length}`);
                const response = await dhis2Session.get('/api/tracker/events', params);
                if (response.instances) fullEvents = fullEvents.concat(response.instances);
            }
        }

        const data = { events: fullEvents };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `backup_tracker_${appState.selectedProgram}_${new Date().toISOString().split('T')[0]}.json`;

        a.href = url;
        a.download = filename;
        a.click();

        showToast('success', 'Backup terminé', `${fullEvents.length} dossiers sauvegardés.`);
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur Backup', 'Impossible d\'exporter les données : ' + e.message);
    } finally {
        btn.html(originalHtml).prop('disabled', false);
    }
}

function exportExcelTable() {
    const table = document.getElementById('trackerPreviewTable');
    if (!table) return;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Preview" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `apercu_tracker_records_${timestamp}.xlsx`);
    showToast('success', 'Export Excel', 'Le tableau a été exporté sous Excel.');
}

function showToast(type, title, msg) {
    const toast = $(`<div class="toast toast-${type}"><i class="fas fa-info-circle"></i><div class="toast-content"><div class="toast-title">${title}</div><div>${msg}</div></div></div>`);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(500, function () { $(this).remove(); }), 4000);
}

// Utility search OU
async function searchOrgUnits(query) {
    const results = $('#ouSearchResults').html('<div style="padding:10px;">Recherche...</div>').show();
    try {
        const data = await dhis2Session.get('/api/organisationUnits', { filter: `displayName:ilike:${query}`, fields: 'id,displayName', pageSize: 10 });
        results.empty();
        data.organisationUnits.forEach(ou => {
            results.append(`<div class="ou-search-item" data-id="${ou.id}" data-name="${ou.displayName}">${ou.displayName} <small style="color:#666;">(${ou.id})</small></div>`);
        });
    } catch (e) { results.hide(); }
}
