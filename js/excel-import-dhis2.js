/**
 * Excel to DHIS2 Import Module
 * Handles file parsing, column mapping, validation, and data import.
 */

$(document).ready(function () {
    initExcelImport();
});

// State Management
const appState = {
    currentStep: 1,
    datasets: [],
    selectedDataSetId: null,
    selectedDataSetMetadata: null, // Will hold DEs, COCs, etc.
    workbook: null,
    sheetData: [], // Raw JSON from Excel
    excelColumns: [],
    mapping: {
        orgUnitColumn: null,
        periodColumn: null,
        dataElements: {} // { excelColIndex: { dataElementId, categoryOptionComboId } }
    },
    validationResults: [],
    orgUnitsCache: new Map() // cache for validating/mapping OUs
};

function initExcelImport() {
    // Listen for DHIS2 connection
    $(document).on('dhis2:connected', function (e, user) {
        enableStep1();
        loadDataSets();
        // Pre-fetch org units for validation (names & ids)
        loadOrgUnitsCache();
    });

    // If already connected on load
    if (dhis2Session.isConnected()) {
        enableStep1();
        loadDataSets();
        loadOrgUnitsCache();
    } else {
        // Redirect if not connected (as requested)
        if (typeof showToast === 'function') {
            showToast('error', 'Session DHIS2 requise', 'Vous allez être redirigé vers la page d\'accueil pour vous connecter...');
        } else {
            alert('Session DHIS2 requise. Redirection...');
        }

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }

    // Step Navigation
    $('#nextToStep2').on('click', () => goToStep(2));
    $('#backToStep1').on('click', () => goToStep(1));
    $('#nextToStep3').on('click', () => {
        if (appState.sheetData.length === 0) {
            showToast('error', 'Erreur', 'Veuillez importer un fichier valide.');
            return;
        }
        performSmartMapping();
        goToStep(3);
    });
    $('#backToStep2').on('click', () => goToStep(2));
    $('#nextToStep4').on('click', () => {
        saveMappingFromUI();
        goToStep(4);
    });
    $('#backToStep3').on('click', () => goToStep(3));

    // Actions
    $('#dataSetSelect').on('change', function () {
        appState.selectedDataSetId = $(this).val();
        if (appState.selectedDataSetId) {
            $('#dataSetDetails').slideDown();
            $('#nextToStep2').prop('disabled', false);
            fetchDataSetMetadata(appState.selectedDataSetId);
        } else {
            $('#dataSetDetails').slideUp();
            $('#nextToStep2').prop('disabled', true);
        }
    });

    $('#btnDownloadTemplate').on('click', downloadTemplate);
    $('#fileInput').on('change', handleFileUpload);

    // Dry Run & Import
    $('#btnDryRun').on('click', runDryRun);
    $('#btnImport').on('click', runImport);

    // Drag and Drop Events
    const $uploadArea = $('#uploadArea');

    $uploadArea.on('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('active'); // Add active class for visual feedback
    });

    $uploadArea.on('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('active');
    });

    $uploadArea.on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('active');

        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            // Mock standard change event structure
            handleFileUpload({ target: { files: files } });
        }
    });
}

// ==========================================
// Step 1: DataSets & Template
// ==========================================

async function loadDataSets() {
    try {
        const dataSets = await dhis2Session.getDataSets({ paging: false, fields: 'id,displayName' });
        appState.datasets = dataSets.dataSets;

        const $select = $('#dataSetSelect');
        $select.empty().append('<option value="">-- Sélectionnez un formulaire --</option>');

        // Sort alphabetically
        appState.datasets.sort((a, b) => a.displayName.localeCompare(b.displayName));

        appState.datasets.forEach(ds => {
            $select.append(`<option value="${ds.id}">${ds.displayName}</option>`);
        });

        $select.prop('disabled', false).select2(); // Init select2
    } catch (error) {
        showToast('error', 'Erreur', 'Impossible de charger les formulaires : ' + error.message);
    }
}

async function fetchDataSetMetadata(dataSetId) {
    const $btn = $('#btnDownloadTemplate');
    const originalText = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Chargement...');

    try {
        // Fetch detailed metadata: DataElements, CategoryOptionCombos
        const result = await dhis2Session.get(`/api/dataSets/${dataSetId}`, {
            fields: 'id,displayName,dataSetElements[dataElement[id,displayName,code,categoryCombo[id,categoryOptionCombos[id,displayName]]]]'
        });

        appState.selectedDataSetMetadata = result;
        showToast('success', 'Métadonnées chargées', 'Le formulaire est prêt.');
    } catch (error) {
        showToast('error', 'Erreur', 'Impossible de récupérer les détails du formulaire.');
        console.error(error);
    } finally {
        $btn.prop('disabled', false).html(originalText);
    }
}

async function loadOrgUnitsCache() {
    // Optionally fetch all OUs for mapping names to IDs? 
    // This could be heavy. For now we will rely on exact ID match or we can try to fetch small batches.
    // Or we fetch a minimal list: id, displayName.
    // Let's defer this to "Validation" step or do it lazily.
}

function downloadTemplate() {
    if (!appState.selectedDataSetMetadata) return;

    const ds = appState.selectedDataSetMetadata;
    const ws_data = [];

    // Header Row
    const header = ['Organisation Unit ID', 'Period', 'Organisation Unit Name'];

    // Add columns for each DataElement + CategoryOptionCombo
    // Flatten logic: DE Name (CategoryName)
    const flattenedColumns = [];

    ds.dataSetElements.forEach(dse => {
        const de = dse.dataElement;
        const cocs = de.categoryCombo.categoryOptionCombos;

        cocs.forEach(coc => {
            // If default, just DE Name. Else DE Name (COC Name)
            let colName = de.displayName;
            if (coc.displayName !== 'default') {
                colName += ` (${coc.displayName})`;
            }
            // Store meta for identification if they upload this exact template back
            // We can encode ID in a hidden way or just expect user to not change header too much.
            // Better: use a comment or a strict naming convention.
            // For this version, let's just put the readable name. 
            // The Smart Mapping will try to match this back.
            header.push(colName);
        });
    });

    ws_data.push(header);

    // Add an example row
    const exampleRow = ['ImspTQPwCqd', '202310', 'Sierra Leone'];
    for (let i = 3; i < header.length; i++) {
        exampleRow.push(''); // Empty value
    }
    ws_data.push(exampleRow);

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Données");

    // Download
    XLSX.writeFile(wb, `Template_${ds.displayName}.xlsx`);
}

function enableStep1() {
    $('#dhis2Status').css('display', 'flex');
    $('#dataSetSelect').prop('disabled', false);
}

// ==========================================
// Step 2: File Upload
// ==========================================

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    $('#fileName').text(file.name);
    $('#fileSize').text((file.size / 1024).toFixed(2) + ' KB');
    $('#filePreview').slideDown();
    $('#uploadArea').slideUp();
    $('#nextToStep3').prop('disabled', false);

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        appState.workbook = XLSX.read(data, { type: 'array' });

        // Assume first sheet
        const sheetName = appState.workbook.SheetNames[0];
        const worksheet = appState.workbook.Sheets[sheetName];

        // Parse to JSON (Header is row 1)
        appState.sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (appState.sheetData.length > 0) {
            appState.excelColumns = appState.sheetData[0]; // Header row
        }
    };
    reader.readAsArrayBuffer(file);
}

function removeFile() {
    $('#fileInput').val('');
    $('#filePreview').slideUp();
    $('#uploadArea').slideDown();
    $('#nextToStep3').prop('disabled', true);
    appState.sheetData = [];
    appState.excelColumns = [];
}

// ==========================================
// Step 3: Mapping
// ==========================================

function performSmartMapping() {
    if (!appState.selectedDataSetMetadata) return;

    const excelCols = appState.excelColumns;
    const ds = appState.selectedDataSetMetadata;
    const mappingBody = $('#mappingTableBody');
    mappingBody.empty();

    // Build target list from DS
    const targets = [];
    ds.dataSetElements.forEach(dse => {
        const de = dse.dataElement;
        de.categoryCombo.categoryOptionCombos.forEach(coc => {
            targets.push({
                id: de.id,
                cocId: coc.id,
                name: de.displayName,
                cocName: coc.displayName,
                fullName: coc.displayName === 'default' ? de.displayName : `${de.displayName} (${coc.displayName})`
            });
        });
    });

    // Special columns
    let foundOrgUnit = false;
    let foundPeriod = false;

    // Iterate Excel Columns
    excelCols.forEach((colName, index) => {
        if (!colName) return;
        const colLower = colName.toString().toLowerCase();

        // Detect OU and Period
        let mappedTarget = null;
        let isSpecial = false;

        if (!foundOrgUnit && (colLower.includes('organization') || colLower.includes('organisation') || colLower.includes('org unit') || colLower === 'ou')) {
            appState.mapping.orgUnitColumn = index;
            foundOrgUnit = true;
            isSpecial = true;
            addMappingRow(index, colName, 'orgUnit', 'Unitée d\'organisation');
            return;
        }

        if (!foundPeriod && (colLower.includes('period') || colLower.includes('période') || colLower === 'pe')) {
            appState.mapping.periodColumn = index;
            foundPeriod = true;
            isSpecial = true;
            addMappingRow(index, colName, 'period', 'Période');
            return;
        }

        // Try to fuzzy match against DEs
        const bestMatch = findBestMatch(colName, targets);

        // If score is good enough (Levenshtein)
        if (bestMatch && bestMatch.score > 0.6) { // heuristic threshold
            addMappingRow(index, colName, 'data', bestMatch.target);
        } else {
            // Add row but select nothing
            addMappingRow(index, colName, 'ignored', null);
        }
    });

    // Initialize select2 on the generated selects
    $('.mapping-select').select2({ width: '100%' });
}

function addMappingRow(colIndex, colName, type, target) {
    const $tr = $('<tr>');

    // Excel Column
    $tr.append(`<td><strong>${colName}</strong> <br><small class="text-muted">Index: ${colIndex}</small></td>`);

    // Target Select
    let selectHtml = `<select class="form-select mapping-select" data-col-index="${colIndex}">`;
    selectHtml += `<option value="ignore">-- Ignorer cette colonne --</option>`;
    selectHtml += `<option value="orgUnit" ${type === 'orgUnit' ? 'selected' : ''}>Unité d'organisation</option>`;
    selectHtml += `<option value="period" ${type === 'period' ? 'selected' : ''}>Période</option>`;

    appState.selectedDataSetMetadata.dataSetElements.forEach(dse => {
        const de = dse.dataElement;
        // Group by DE
        selectHtml += `<optgroup label="${de.displayName}">`;
        de.categoryCombo.categoryOptionCombos.forEach(coc => {
            const value = `${de.id}|${coc.id}`;
            const isSelected = type === 'data' && target && target.id === de.id && target.cocId === coc.id;
            const label = coc.displayName === 'default' ? de.displayName : `${de.displayName} (${coc.displayName})`;
            selectHtml += `<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`;
        });
        selectHtml += `</optgroup>`;
    });

    selectHtml += `</select>`;

    $tr.append(`<td>${selectHtml}</td>`);

    // Category (Auto-filled by select label mostly, but we can make it explicit)
    $tr.append(`<td><span class="badge ${type === 'ignored' ? 'bg-secondary' : 'bg-success'}">${type === 'data' && target ? target.cocName : '-'}</span></td>`);

    // Status
    const statusIcon = type === 'ignored' ? '<i class="fas fa-ban text-muted"></i>' : '<i class="fas fa-check text-success"></i>';
    $tr.append(`<td>${statusIcon}</td>`);

    $('#mappingTableBody').append($tr);
}

function findBestMatch(query, targets) {
    let bestScore = 0;
    let bestTarget = null;

    targets.forEach(t => {
        const score = similarity(query, t.fullName);
        if (score > bestScore) {
            bestScore = score;
            bestTarget = t;
        }
    });

    return { target: bestTarget, score: bestScore };
}

// Simple Levenshtein-based similarity (0 to 1)
function similarity(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
        return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    var costs = new Array();
    for (var i = 0; i <= s1.length; i++) {
        var lastValue = i;
        for (var j = 0; j <= s2.length; j++) {
            if (i == 0)
                costs[j] = j;
            else {
                if (j > 0) {
                    var newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue),
                            costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0)
            costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function saveMappingFromUI() {
    // Reset mapping
    appState.mapping = {
        orgUnitColumn: null,
        periodColumn: null,
        dataElements: {}
    };

    $('.mapping-select').each(function () {
        const colIndex = parseInt($(this).attr('data-col-index'));
        const value = $(this).val();

        if (value === 'ignore') return;

        if (value === 'orgUnit') {
            appState.mapping.orgUnitColumn = colIndex;
        } else if (value === 'period') {
            appState.mapping.periodColumn = colIndex;
        } else {
            // Data Element | Category Option Combo
            const parts = value.split('|');
            if (parts.length === 2) {
                appState.mapping.dataElements[colIndex] = {
                    de: parts[0],
                    coc: parts[1]
                };
            }
        }
    });
}

// ==========================================
// Step 4: Validation (Dry Run) & Import
// ==========================================

async function runDryRun() {
    const logConsole = $('#dryRunOutput');
    const statusBadge = $('#dryRunStatus');
    const importSection = $('#importSection');

    $('#dryRunLog').slideDown();
    importSection.hide();
    logConsole.empty();
    statusBadge.removeClass('bg-success bg-danger').addClass('bg-warning').text('En cours...');

    logConsole.append('<p>🚀 Démarrage de la simulation...</p>');

    const data = appState.sheetData;
    // Skip header
    const rows = data.slice(1);

    if (appState.mapping.orgUnitColumn === null || appState.mapping.periodColumn === null) {
        logConsole.append('<p class="text-error">❌ Erreur critique: Colonnes Unité d\'organisation ou Période manquantes.</p>');
        statusBadge.removeClass('bg-warning').addClass('bg-danger').text('Échec');
        return;
    }

    let errorCount = 0;
    let validCount = 0;

    // We need to fetch OrgUnits to validate IDs
    // For this prototype, we'll try a search or check valid format (UID 11 chars)
    // If we assume user put IDs:
    const uidRegex = /^[A-Za-z0-9]{11}$/;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowIndex = i + 2; // +1 header +1 0-index

        const ou = row[appState.mapping.orgUnitColumn];
        const pe = row[appState.mapping.periodColumn];

        if (!ou || !pe) {
            logConsole.append(`<p class="text-warning">⚠️ Ligne ${rowIndex}: OU ou Période vide. Ignorée.</p>`);
            continue;
        }

        // Basic format check
        if (!uidRegex.test(ou)) {
            // Maybe it's a code? Warning
            logConsole.append(`<p class="text-warning">⚠️ Ligne ${rowIndex}: L'ID d'organisation "${ou}" ne ressemble pas à un UID DHIS2.</p>`);
        }

        // Check values
        let rowHasData = false;
        for (const [colIndex, map] of Object.entries(appState.mapping.dataElements)) {
            const val = row[colIndex];
            if (val !== undefined && val !== null && val !== '') {
                // Check if number (if strictly number type required?)
                // DHIS2 accepts values mostly.
                validCount++;
                rowHasData = true;
            }
        }

        if (!rowHasData) {
            // logConsole.append(`<p class="text-muted">ℹ️ Ligne ${rowIndex}: Aucune donnée mappée.</p>`);
        }
    }

    if (errorCount === 0) {
        logConsole.append(`<p class="text-success">✅ Simulation terminée. ${validCount} valeurs de données prêtes à importer.</p>`);
        statusBadge.removeClass('bg-warning').addClass('bg-success').text('Succès');
        importSection.slideDown();
    } else {
        logConsole.append(`<p class="text-error">❌ Simulation terminée avec ${errorCount} erreurs.</p>`);
        statusBadge.removeClass('bg-warning').addClass('bg-danger').text('Échec');
    }
}

async function runImport() {
    const $btn = $('#btnImport');
    const originalText = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Importation...');

    const logConsole = $('#dryRunOutput');
    logConsole.append('<hr><p>🚀 Démarrage de l\'importation réelle...</p>');

    try {
        const payload = buildPayload();

        // Send to DHIS2
        const result = await dhis2Session.postDataValues(payload);

        console.log("Import Result:", result);

        // Check for success (support multiple response structures)
        const summary = result.response || result;
        const counts = summary.importCount;

        if ((summary.status === 'OK' || summary.status === 'SUCCESS') && counts) {
            logConsole.append(`<p class="text-success">✅ Import réussi!</p>`);
            logConsole.append(`<p>Importés: ${counts.imported || 0}, Mis à jour: ${counts.updated || 0}, Ignorés: ${counts.ignored || 0}, Supprimés: ${counts.deleted || 0}</p>`);
            showToast('success', 'Succès', 'Données importées avec succès');
        } else if (counts) {
            logConsole.append(`<p class="text-warning">⚠️ Import terminé avec des avertissements.</p>`);
            logConsole.append(`<p>Ignorés: ${counts.ignored || 0}. Vérifiez les conflits.</p>`);
            if (summary.conflicts) {
                summary.conflicts.forEach(c => logConsole.append(`<p class="text-error">Conflit: ${c.object} - ${c.value}</p>`));
            }
        } else {
            // Fallback if structure is completely different
            console.warn("Unexpected response structure:", result);
            if (summary.status === 'OK' || summary.status === 'SUCCESS') {
                logConsole.append(`<p class="text-success">✅ Import apparemment réussi (Pas de détails).</p>`);
            } else {
                throw new Error('Réponse inattendue du serveur: ' + JSON.stringify(summary));
            }
        }

    } catch (error) {
        logConsole.append(`<p class="text-error">❌ Erreur lors de l'import: ${error.message}</p>`);
        showToast('error', 'Erreur', 'Echec de l\'import');
        console.error(error);
    } finally {
        $btn.prop('disabled', false).html(originalText);
    }
}

function buildPayload() {
    const dataValues = [];
    const rows = appState.sheetData.slice(1);

    rows.forEach(row => {
        const ou = row[appState.mapping.orgUnitColumn];
        const pe = row[appState.mapping.periodColumn];

        if (!ou || !pe) return;

        for (const [colIndex, map] of Object.entries(appState.mapping.dataElements)) {
            const val = row[colIndex];
            if (val !== undefined && val !== null && val !== '') {
                dataValues.push({
                    dataElement: map.de,
                    categoryOptionCombo: map.coc,
                    period: pe.toString(), // Ensure string
                    orgUnit: ou,
                    value: val.toString()
                });
            }
        }
    });

    return { dataValues };
}


// Navigation
function goToStep(step) {
    $('.step-content').hide();
    $(`#step${step}`).fadeIn();

    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= step; i++) {
        if (i === step) $(`.step-item[data-step="${i}"]`).addClass('active');
        else $(`.step-item[data-step="${i}"]`).addClass('completed');
    }
}
