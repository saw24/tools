/**
 * Data Values Deletion Module
 * Handles identification and mass deletion of data values in DHIS2.
 */

$(document).ready(function () {
    initDataDeletion();
});

const appState = {
    dataElements: [],
    selectedDataElements: new Set(),
    orgUnit: {
        id: null,
        name: null
    },
    periods: [],
    selectedPeriods: new Set(),
    identifiedValues: [],
    cocMap: new Map(), // Cache for Category Option Combo names
    aocMap: new Map(), // Cache for Attribute Option Combo names
    filter: {
        treeLoaded: false,
        periodsLoaded: false
    }
};

function initDataDeletion() {
    // Listen for DHIS2 connection
    $(document).on('dhis2:connected', function (e, user) {
        checkConnection();
    });

    // Initial check
    checkConnection();

    // Step 1: Data Element Events
    $('#deSearchInput').on('input', function () {
        renderDataElements($(this).val());
    });

    $('#btnSelectAllDE').on('click', () => {
        $('.de-checkbox').prop('checked', true);
        updateDESelection();
    });

    $('#btnDeselectAllDE').on('click', () => {
        $('.de-checkbox').prop('checked', false);
        updateDESelection();
    });

    $(document).on('change', '.de-checkbox', updateDESelection);

    $(document).on('click', '.data-element-item', function (e) {
        if (!$(e.target).is('input')) {
            const checkbox = $(this).find('input');
            checkbox.prop('checked', !checkbox.prop('checked'));
            updateDESelection();
        }
    });

    // Step 2: Org Unit Tree Events
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

    // Navigation
    $('#nextToStep2').on('click', () => {
        if (appState.selectedDataElements.size === 0) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins un élément de données.');
            return;
        }

        if (!appState.filter.treeLoaded) {
            loadOrgUnitTree();
        }

        goToStep(2);
    });

    $('#nextToStep3').on('click', () => {
        if (!appState.orgUnit.id) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner une unité d\'organisation parente.');
            return;
        }

        if (!appState.filter.periodsLoaded) {
            generatePeriods();
        }

        goToStep(3);
    });

    $('#nextToStep4').on('click', () => {
        if (appState.selectedPeriods.size === 0) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins une période.');
            return;
        }

        goToStep(4);
        identifyData();
    });

    $('#btnExportJSON').on('click', exportJSONBackup);
    $('#btnExportExcel').on('click', exportExcelTable);

    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#backToStep3').on('click', () => goToStep(3));

    // Period Events
    $('#periodSearchInput').on('input', function () {
        renderPeriods($(this).val());
    });

    $('#btnDeselectAllPeriods').on('click', () => {
        $('.period-checkbox').prop('checked', false);
        updatePeriodSelection();
    });

    $(document).on('change', '.period-checkbox', updatePeriodSelection);

    $(document).on('click', '.period-item', function (e) {
        if (!$(e.target).is('input')) {
            const checkbox = $(this).find('input');
            checkbox.prop('checked', !checkbox.prop('checked'));
            updatePeriodSelection();
        }
    });

    // Preset Handlers
    $('#presetThisYear').on('click', () => selectPresetPeriods('thisYear'));
    $('#presetLastYear').on('click', () => selectPresetPeriods('lastYear'));
    $('#presetLast12Months').on('click', () => selectPresetPeriods('last12Months'));

    $('#confirmDeletionCheck').on('change', function () {
        $('#btnLaunchDeletion').prop('disabled', !$(this).is(':checked'));
    });

    $('#previewSearchInput').on('input', function() {
        const query = $(this).val().toLowerCase();
        $('#dataPreviewTable tbody tr').each(function() {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.indexOf(query) > -1);
        });
    });

    $(document).on('change', '#selectAllPreview', function() {
        const isChecked = $(this).is(':checked');
        $('.row-checkbox:visible').prop('checked', isChecked);
        $('.row-checkbox:visible').closest('tr').toggleClass('selected', isChecked);
    });

    $(document).on('change', '.row-checkbox', function() {
        $(this).closest('tr').toggleClass('selected', $(this).is(':checked'));
        
        // Update select all state
        const total = $('.row-checkbox:visible').length;
        const checked = $('.row-checkbox:visible:checked').length;
        $('#selectAllPreview').prop('checked', total === checked && total > 0);
    });

    $('#btnLaunchDeletion').on('click', launchDeletionProcess);

    // Org Unit Search Logic
    let searchTimeout;
    $('#ouSearchInput').on('input', function () {
        const query = $(this).val();
        clearTimeout(searchTimeout);
        if (query.length < 3) {
            $('#ouSearchResults').hide();
            return;
        }

        searchTimeout = setTimeout(() => searchOrgUnits(query), 500);
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('.search-wrapper').length) {
            $('#ouSearchResults').hide();
        }
    });

    $(document).on('click', '.ou-search-item', function () {
        const id = $(this).data('id');
        const name = $(this).data('name');

        appState.orgUnit.id = id;
        appState.orgUnit.name = name;
        $('#selectedOrgUnitName').val(name);
        $('#ouSearchResults').hide();
        $('#ouSearchInput').val('');

        // Highlight in tree if possible (optional, maybe complex if deep)
        $('.tree-node-content').removeClass('selected');
        $(`li[data-id="${id}"] > .tree-node-content`).addClass('selected');
    });
}

function checkConnection() {
    if (!dhis2Session.isConnected()) {
        $('#step1, .step-indicator').hide();
        showToast('error', 'Session DHIS2 requise', 'Vous allez être redirigé vers la page d\'accueil pour vous connecter...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    } else {
        $('#loginRequiredBox').remove();
        $('#step1, .step-indicator').show();
        enableModule();
    }
}

async function enableModule() {
    $('#dhis2Status').css('display', 'flex');
    if (appState.dataElements.length === 0) {
        loadDataElements();
    }
}

async function loadDataElements() {
    const container = $('#deListContainer');
    try {
        const data = await dhis2Session.get('/api/dataElements', {
            paging: false,
            fields: 'id,displayName',
            filter: 'domainType:eq:AGGREGATE' // Usually we delete aggregate data
        });

        appState.dataElements = data.dataElements.sort((a, b) => a.displayName.localeCompare(b.displayName));
        renderDataElements();
    } catch (e) {
        console.error(e);
        container.html('<div class="text-error">Erreur de chargement des éléments.</div>');
    }
}

function renderDataElements(searchTerm = '') {
    const container = $('#deListContainer');
    container.empty();

    const filtered = appState.dataElements.filter(de =>
        de.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        de.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filtered.length === 0) {
        container.append('<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun élément trouvé.</div>');
        return;
    }

    filtered.forEach(de => {
        const isSelected = appState.selectedDataElements.has(de.id);
        const item = $(`
            <div class="data-element-item ${isSelected ? 'selected' : ''}" data-id="${de.id}">
                <input type="checkbox" class="de-checkbox" value="${de.id}" ${isSelected ? 'checked' : ''}>
                <div class="de-info">
                    <span class="de-name">${de.displayName}</span>
                    <span class="de-id">${de.id}</span>
                </div>
            </div>
        `);
        container.append(item);
    });
}

function updateDESelection() {
    appState.selectedDataElements.clear();
    $('.de-checkbox:checked').each(function () {
        appState.selectedDataElements.add($(this).val());
    });

    $('#deSelectionCount').text(`${appState.selectedDataElements.size} élément(s) sélectionné(s)`);

    // Highlight selected rows
    $('.data-element-item').removeClass('selected');
    $('.de-checkbox:checked').closest('.data-element-item').addClass('selected');
}

// Tree Logic (copied/adapted from export-metadata-orgunits.js)
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

async function searchOrgUnits(query) {
    const resultsContainer = $('#ouSearchResults');
    resultsContainer.html('<div style="padding:15px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Recherche...</div>').show();

    try {
        const data = await dhis2Session.get('/api/organisationUnits', {
            filter: `displayName:ilike:${query}`,
            fields: 'id,displayName,path',
            pageSize: 10
        });

        renderOUSearchResults(data.organisationUnits);
    } catch (e) {
        console.error(e);
        resultsContainer.html('<div style="padding:15px; color:var(--error-color);">Erreur lors de la recherche.</div>');
    }
}

function renderOUSearchResults(units) {
    const resultsContainer = $('#ouSearchResults');
    resultsContainer.empty();

    if (!units || units.length === 0) {
        resultsContainer.html('<div style="padding:15px; text-align:center; color:var(--text-muted);">Aucun résultat.</div>');
        return;
    }

    units.forEach(ou => {
        const item = $(`
            <div class="ou-search-item" data-id="${ou.id}" data-name="${ou.displayName}">
                <strong>${ou.displayName}</strong>
                <span class="ou-path">${ou.id}</span>
            </div>
        `);
        resultsContainer.append(item);
    });
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
        showToast('error', 'Erreur', 'Impossible de charger les enfants');
    }
}

function renderTreeNode(ou) {
    const hasChildren = ou.children === true || (Array.isArray(ou.children) && ou.children.length > 0) || ou.children === undefined;
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

// Period Functions
function generatePeriods() {
    const periods = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    // Last 5 years
    for (let y = currentYear; y >= currentYear - 5; y--) {
        // Year
        periods.push({ id: `${y}`, name: `${y} (Annuel)` });

        // Months
        for (let m = 12; m >= 1; m--) {
            const mStr = m < 10 ? `0${m}` : `${m}`;
            const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
            periods.push({ id: `${y}${mStr}`, name: `${monthNames[m - 1]} ${y}` });
        }
    }

    appState.periods = periods;
    appState.filter.periodsLoaded = true;
    renderPeriods();
}

function renderPeriods(searchTerm = '') {
    const container = $('#periodListContainer');
    container.empty();

    const filtered = appState.periods.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.forEach(p => {
        const isSelected = appState.selectedPeriods.has(p.id);
        const item = $(`
            <div class="data-element-item period-item ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                <input type="checkbox" class="period-checkbox" value="${p.id}" ${isSelected ? 'checked' : ''}>
                <div class="de-info">
                    <span class="de-name">${p.name}</span>
                    <span class="de-id">${p.id}</span>
                </div>
            </div>
        `);
        container.append(item);
    });
}

function updatePeriodSelection() {
    appState.selectedPeriods.clear();
    $('.period-checkbox:checked').each(function () {
        appState.selectedPeriods.add($(this).val());
    });

    $('.period-item').removeClass('selected');
    $('.period-checkbox:checked').closest('.period-item').addClass('selected');
}

function selectPresetPeriods(type) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const toSelect = [];

    if (type === 'thisYear') {
        toSelect.push(`${currentYear}`);
        for (let m = 1; m <= 12; m++) toSelect.push(`${currentYear}${m < 10 ? '0' + m : m}`);
    } else if (type === 'lastYear') {
        const lastYear = currentYear - 1;
        toSelect.push(`${lastYear}`);
        for (let m = 1; m <= 12; m++) toSelect.push(`${lastYear}${m < 10 ? '0' + m : m}`);
    } else if (type === 'last12Months') {
        let y = currentYear;
        let m = currentMonth;
        for (let i = 0; i < 12; i++) {
            toSelect.push(`${y}${m < 10 ? '0' + m : m}`);
            m--;
            if (m === 0) { m = 12; y--; }
        }
    }

    $('.period-checkbox').each(function () {
        if (toSelect.includes($(this).val())) $(this).prop('checked', true);
    });
    updatePeriodSelection();
}

/**
 * Fetches names for all Category Option Combos and Attribute Option Combos found in identified values
 */
async function fetchMetadataForIdentifiedValues() {
    const cocIds = [...new Set(appState.identifiedValues.map(v => v.categoryOptionCombo))];
    const aocIds = [...new Set(appState.identifiedValues.map(v => v.attributeOptionCombo))];
    
    const missingCOCs = cocIds.filter(id => !appState.cocMap.has(id));
    const missingAOCs = aocIds.filter(id => !appState.aocMap.has(id));
    
    if (missingCOCs.length === 0 && missingAOCs.length === 0) return;

    try {
        // Fetch COC names
        if (missingCOCs.length > 0) {
            // DHIS2 might have limits on filter length, so we batch if necessary
            const chunkSize = 100;
            for (let i = 0; i < missingCOCs.length; i += chunkSize) {
                const chunk = missingCOCs.slice(i, i + chunkSize);
                const data = await dhis2Session.get('/api/categoryOptionCombos', {
                    filter: `id:in:[${chunk.join(',')}]`,
                    fields: 'id,displayName',
                    paging: false
                });
                data.categoryOptionCombos.forEach(coc => appState.cocMap.set(coc.id, coc.displayName));
            }
        }

        // Fetch AOC names (usually same metadata type)
        if (missingAOCs.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < missingAOCs.length; i += chunkSize) {
                const chunk = missingAOCs.slice(i, i + chunkSize);
                const data = await dhis2Session.get('/api/categoryOptionCombos', {
                    filter: `id:in:[${chunk.join(',')}]`,
                    fields: 'id,displayName',
                    paging: false
                });
                data.categoryOptionCombos.forEach(aoc => appState.aocMap.set(aoc.id, aoc.displayName));
            }
        }
    } catch (e) {
        console.warn('Could not fetch some COC/AOC metadata:', e);
    }
}

async function identifyData() {
    $('#identificationLoading').show();
    $('#previewContainer').hide();
    $('#btnLaunchDeletion').prop('disabled', true);
    $('#confirmDeletionCheck').prop('checked', false);

    const progressBar = $('#identificationProgressBar');
    const totalValuesFoundText = $('#totalValuesFound');

    appState.identifiedValues = [];
    const deList = Array.from(appState.selectedDataElements);
    const periodList = Array.from(appState.selectedPeriods);
    const chunkSize = 50;

    try {
        for (let i = 0; i < deList.length; i += chunkSize) {
            const chunk = deList.slice(i, i + chunkSize);
            const chunkIds = chunk.join(',');

            const response = await dhis2Session.get('/api/dataValueSets.json', {
                dataElement: chunkIds,
                orgUnit: appState.orgUnit.id,
                period: periodList,
                children: true,
                paging: false
            });

            if (response.dataValues && response.dataValues.length > 0) {
                appState.identifiedValues = appState.identifiedValues.concat(response.dataValues);
            }

            const progress = Math.round(((i + chunk.length) / deList.length) * 100);
            progressBar.css('width', `${progress}%`);
        }

        totalValuesFoundText.text(appState.identifiedValues.length);

        if (appState.identifiedValues.length > 0) {
            // NEW: Fetch metadata for COCs before rendering
            await fetchMetadataForIdentifiedValues();
            
            renderCrosstabTable();
            $('#identificationLoading').hide();
            $('#previewContainer').fadeIn();
        } else {
            $('#identificationLoading').html(`
                <div style="text-align:center; padding:20px;">
                    <i class="fas fa-info-circle" style="font-size:48px; color:var(--text-muted); margin-bottom:15px;"></i>
                    <h4>Aucune donnée trouvée</h4>
                    <p>Aucune valeur ne correspond aux critères sélectionnés (Éléments, Unité, Périodes).</p>
                    <button class="btn btn-secondary" style="margin-top:15px;" onclick="goToStep(3)">Retourner aux périodes</button>
                </div>
            `);
        }
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de récupérer les données : ' + e.message);
        $('#identificationLoading').html('<p class="text-error">Une erreur est survenue lors de la récupération.</p>');
    }
}

function renderCrosstabTable() {
    const table = $('#dataPreviewTable');
    table.empty();

    const deMap = new Map();
    appState.dataElements.forEach(de => deMap.set(de.id, de.displayName));

    const periodMap = new Map();
    appState.periods.forEach(p => periodMap.set(p.id, p.name));

    // Dimensions: 
    // Rows: Unique (DataElement + COC + AOC)
    // Columns: Unique Periods
    
    // Create a composite key for rows
    const uniqueRowKeys = [...new Set(appState.identifiedValues.map(v => 
        `${v.dataElement}|${v.categoryOptionCombo}|${v.attributeOptionCombo}`
    ))];
    
    const uniquePeriods = [...new Set(appState.identifiedValues.map(v => v.period))].sort();

    // Map values: [rowKey][period] = value
    const dataGrid = {};
    appState.identifiedValues.forEach(v => {
        const rowKey = `${v.dataElement}|${v.categoryOptionCombo}|${v.attributeOptionCombo}`;
        if (!dataGrid[rowKey]) dataGrid[rowKey] = {};
        dataGrid[rowKey][v.period] = v.value; // Keep raw value
    });

    // Build Header
    const thead = $('<thead></thead>');
    const headerRow = $('<tr></tr>');
    headerRow.append(`
        <th>
            <div style="display:flex; align-items:center;">
                <input type="checkbox" id="selectAllPreview" class="row-checkbox" checked>
                Élément & Catégories
            </div>
        </th>
    `);
    uniquePeriods.forEach(p => {
        headerRow.append(`<th>${periodMap.get(p) || p}</th>`);
    });
    thead.append(headerRow);
    table.append(thead);

    // Build Body
    const tbody = $('<tbody></tbody>');
    
    // Sort rows by DE name then COC name
    uniqueRowKeys.sort((a, b) => {
        const [deA, cocA] = a.split('|');
        const [deB, cocB] = b.split('|');
        const nameA = (deMap.get(deA) || deA) + (appState.cocMap.get(cocA) || cocA);
        const nameB = (deMap.get(deB) || deB) + (appState.cocMap.get(cocB) || cocB);
        return nameA.localeCompare(nameB);
    });

    uniqueRowKeys.forEach(rowKey => {
        const [deId, cocId, aocId] = rowKey.split('|');
        const deName = deMap.get(deId) || deId;
        const cocName = appState.cocMap.get(cocId) || cocId;
        const aocName = appState.aocMap.get(aocId) || aocId;
        
        const row = $('<tr class="selected"></tr>');
        row.attr('data-rowkey', rowKey);
        
        // Display cell with DE and COC info
        let metaHtml = `<div style="display:flex; align-items:center;">
            <input type="checkbox" class="row-checkbox" checked>
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-weight:600; color:#ffffff;">${deName}</span>
                <div style="font-size:11px; color:#667eea; display:flex; flex-wrap:wrap; gap:8px;">
                    <span><i class="fas fa-tags"></i> ${cocName}</span>`;
        
        // Only show AOC if it's not the default one
        if (aocName.toLowerCase() !== 'default' && aocId !== 'Hll16zIfmUv') {
            metaHtml += `<span style="color:#10b981;"><i class="fas fa-layer-group"></i> ${aocName}</span>`;
        }
        
        metaHtml += `</div></div></div>`;
        
        row.append(`<td>${metaHtml}</td>`);

        uniquePeriods.forEach(p => {
            const val = dataGrid[rowKey][p];
            if (val === undefined) {
                row.append('<td style="color:rgba(255,255,255,0.2); text-align:center;">-</td>');
            } else {
                row.append(`<td style="text-align:right; font-family: monospace; font-weight: 500;">${val}</td>`);
            }
        });
        tbody.append(row);
    });
    table.append(tbody);
}

function exportJSONBackup() {
    const data = {
        dataValues: appState.identifiedValues
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `backup_dhis2_deletion_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'Backup JSON', 'Le fichier de sauvegarde a été généré.');
}

function exportExcelTable() {
    const table = document.getElementById('dataPreviewTable');
    const wb = XLSX.utils.table_to_book(table, { sheet: "Preview" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `apercu_donnees_suppression_${timestamp}.xlsx`);
    showToast('success', 'Excel Export', 'Le tableau a été exporté sous Excel.');
}

async function launchDeletionProcess() {
    goToStep(5);

    const logs = $('#executionLogs');
    const progressBar = $('#deletionProgressBar');
    const progressText = $('#deletionProgressText');

    logs.empty();
    addLog('Démarrage de la suppression finale...', 'info');

    try {
        $('#execStepDelete').addClass('active');

        // Filter identified values to only include those whose row is selected in the preview table
        const selectedRowKeys = new Set();
        $('#dataPreviewTable tbody tr').each(function() {
            if ($(this).find('.row-checkbox').is(':checked')) {
                selectedRowKeys.add($(this).data('rowkey'));
            }
        });

        const allDataValues = appState.identifiedValues.filter(v => {
            const rowKey = `${v.dataElement}|${v.categoryOptionCombo}|${v.attributeOptionCombo}`;
            return selectedRowKeys.has(rowKey);
        });

        if (allDataValues.length === 0) {
            addLog('Aucune valeur sélectionnée pour la suppression.', 'warning');
            $('#execStepDelete').removeClass('active');
            $('#finalActions').fadeIn();
            return;
        }

        addLog(`Préparation de la suppression de ${allDataValues.length} valeurs sélectionnées...`, 'info');

        const importBatchSize = 1000;
        let deletedCount = 0;

        for (let i = 0; i < allDataValues.length; i += importBatchSize) {
            const batch = allDataValues.slice(i, i + importBatchSize).map(val => ({
                dataElement: val.dataElement,
                period: val.period,
                orgUnit: val.orgUnit,
                categoryOptionCombo: val.categoryOptionCombo,
                attributeOptionCombo: val.attributeOptionCombo,
                value: ""
            }));

            addLog(`Suppression du lot ${Math.floor(i / importBatchSize) + 1} (${batch.length} valeurs)...`);

            const payload = { dataValues: batch };

            try {
                const result = await dhis2Session.post('/api/dataValueSets?importStrategy=DELETE', payload);

                if (result.status === 'SUCCESS' || result.status === 'OK' || result.importCount) {
                    deletedCount += batch.length;
                    addLog(`Lot supprimé avec succès.`, 'success');
                } else {
                    addLog(`Erreur lors de la suppression : ${result.description || 'Vérifiez les logs serveur.'}`, 'error');
                }
            } catch (err) {
                const errMsg = err.message || 'Erreur inconnue';
                addLog(`Erreur du lot : ${errMsg}`, 'error');

                if (err.data && err.data.response && err.data.response.conflicts) {
                    err.data.response.conflicts.forEach(c => {
                        addLog(`Conflit : ${c.value || 'Données verrouillées ou autre conflit'}`, 'error');
                    });
                }
            }

            const progress = Math.round(((i + batch.length) / allDataValues.length) * 100);
            progressBar.css('width', `${progress}%`);
            progressText.text(`Suppression : ${deletedCount} / ${allDataValues.length} valeurs...`);
        }

        $('#execStepDelete').removeClass('active').addClass('completed');
        addLog('Le processus est terminé.', 'success');
        progressText.text(`Terminé : ${deletedCount} valeurs traitées.`);

        showToast('info', 'Processus terminé', `${deletedCount} valeurs traitées. Consultez les logs pour le détail.`);

    } catch (e) {
        console.error(e);
        addLog(`Erreur critique : ${e.message}`, 'error');
        showToast('error', 'Erreur', 'Le processus a été interrompu.');
    } finally {
        $('#finalActions').fadeIn();
    }
}

function addLog(message, type = '') {
    const logs = $('#executionLogs');
    const time = new Date().toLocaleTimeString();
    const logEntry = $(`<div class="log-entry"><span class="log-time">[${time}]</span> <span class="log-${type}">${message}</span></div>`);
    logs.append(logEntry);
    logs.scrollTop(logs[0].scrollHeight);
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

function showToast(type, title, message) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const toast = $(`<div class="toast toast-${type}"><i class="fas ${icons[type]}"></i><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div></div>`);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(300, function () { $(this).remove(); }), 4000);
}
