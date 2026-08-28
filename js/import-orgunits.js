/**
 * Org Unit Import Module logic
 */

const appState = {
    step: 1,
    file: null,
    fileType: null, // 'xlsx' or 'json'
    entityType: 'organisationUnits',
    wb: null, // Workbook
    sheetData: null, // parsed excel data
    jsonData: null, // parsed json data
    mapping: {}, // excelHeader -> dhis2Field
    dryRunResults: null,
    importStats: { created: 0, updated: 0, ignored: 0, total: 0 }
};

// Field Definitions for Mapping
const FIELD_DEFINITIONS = {
    organisationUnits: [
        { id: 'name', name: 'Nom (Requis)', required: true },
        { id: 'shortName', name: 'Nom Court (Requis)', required: true },
        { id: 'openingDate', name: 'Date Ouverture (Requis)', required: true },
        { id: 'code', name: 'Code', required: false },
        { id: 'id', name: 'UID (Mise à jour)', required: false },
        { id: 'parent', name: 'Parent (UID/Code/Nom)', required: true },
        { id: 'description', name: 'Description', required: false },
        { id: 'comment', name: 'Commentaire', required: false },
        { id: 'contactPerson', name: 'Personne Contact', required: false },
        { id: 'address', name: 'Adresse', required: false },
        { id: 'email', name: 'Email', required: false },
        { id: 'phoneNumber', name: 'Téléphone', required: false }
    ]
};

$(document).ready(function () {
    appState.goToStep = goToStep; // Expose to global for HTML onclicks
    initMetadataImport();
});

function initMetadataImport() {
    // Auth Check
    $(document).on('dhis2:connected', () => checkStep());
    if (dhis2Session.isConnected()) checkStep();
    else window.location.href = 'index.html'; // Or show toast

    // File Upload
    const $dropZone = $('#uploadArea');

    $dropZone.on('dragover', (e) => { e.preventDefault(); $dropZone.addClass('dragover'); });
    $dropZone.on('dragleave', () => $dropZone.removeClass('dragover'));
    $dropZone.on('drop', (e) => {
        e.preventDefault();
        $dropZone.removeClass('dragover');
        handleFile(e.originalEvent.dataTransfer.files[0]);
    });

    $dropZone.on('click', () => $('#fileInput').click());
    $('#fileInput').on('change', (e) => handleFile(e.target.files[0]));

    $('#btnRemoveFile').on('click', (e) => {
        e.stopPropagation();
        resetFile();
    });

    // Navigation Buttons
    $('#btnToMapping').on('click', () => goToStep(2));

    $('#btnToDryRun').on('click', () => {
        if (validateMapping()) goToStep(3);
    });

    $('#btnRunDryRun').on('click', runDryRun);
    $('#btnToImport').on('click', () => goToStep(4));
    $('#btnRunImport').on('click', runImport);
}

function checkStep() {
    $('#dhis2Status').css('display', 'flex');
}

function handleFile(file) {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'json') {
        appState.fileType = 'json';
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                appState.jsonData = JSON.parse(e.target.result);
                fileReady(file.name);
            } catch (err) {
                showToast('error', 'JSON Invalide', err.message);
            }
        };
        reader.readAsText(file);
    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        appState.fileType = 'xlsx';
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            appState.wb = XLSX.read(data, { type: 'array' });
            fileReady(file.name);
        };
        reader.readAsArrayBuffer(file);
    } else {
        showToast('error', 'Format non supporté', 'Utilisez .xlsx, .xls, .csv ou .json');
    }
}

function fileReady(name) {
    appState.file = name;
    $('#uploadArea').hide();
    $('#fileInfo').css('display', 'inline-flex');
    $('#fileName').text(name);
    $('#btnToMapping').prop('disabled', false);

    showToast('success', 'Fichier chargé', `${name} prêt à être traité.`);
}

function resetFile() {
    appState.file = null;
    appState.sheetData = null;
    appState.jsonData = null;
    appState.wb = null;
    $('#fileInput').val('');

    $('#fileInfo').hide();
    $('#uploadArea').show();
    $('#btnToMapping').prop('disabled', true);
}

function goToStep(step) {
    appState.step = step;
    $('.step-content').hide();
    $(`#step${step}`).fadeIn();

    // Update Indicators
    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= step; i++) {
        if (i === step) $(`.step-item[data-step="${i}"]`).addClass('active');
        else $(`.step-item[data-step="${i}"]`).addClass('completed');
    }

    // Step specific logic
    if (step === 2) loadMappingStep();
}

function loadMappingStep() {
    // If JSON, skip mapping logic mostly, show preview
    if (appState.fileType === 'json') {
        $('#mappingContainer').hide();
        $('#jsonPreviewContainer').show();
        $('#jsonPreview').text(JSON.stringify(appState.jsonData, null, 2).substring(0, 1000) + '...');
        $('#sourceFormatBadge').text('JSON');
        return;
    }

    // If Excel
    $('#mappingContainer').show();
    $('#jsonPreviewContainer').hide();
    $('#sourceFormatBadge').text('EXCEL');

    // Parse first sheet
    const wsName = appState.wb.SheetNames[0];
    const ws = appState.wb.Sheets[wsName];
    // Read header row
    appState.sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (!appState.sheetData || appState.sheetData.length === 0) {
        showToast('error', 'Fichier vide', 'Aucune donnée trouvée.');
        return;
    }

    const headers = appState.sheetData[0];
    const sampleRow = appState.sheetData[1] || [];

    const tbody = $('#mappingTableBody');
    tbody.empty();

    const targetFields = FIELD_DEFINITIONS[appState.entityType];

    headers.forEach((header, index) => {
        // Auto-map logic (simple exact match or levenshtein)
        let matchedField = '';
        const lowerHeader = header.toLowerCase();

        const perfectMatch = targetFields.find(f => f.id.toLowerCase() === lowerHeader || f.name.toLowerCase() === lowerHeader);
        if (perfectMatch) matchedField = perfectMatch.id;

        let options = `<option value="">-- Ignorer --</option>`;
        targetFields.forEach(f => {
            const selected = f.id === matchedField ? 'selected' : '';
            const req = f.required ? '*' : '';
            options += `<option value="${f.id}" ${selected}>${f.name} ${req}</option>`;
        });

        const row = `
            <tr>
                <td><strong>${header}</strong></td>
                <td class="text-muted"><small>${sampleRow[index] || ''}</small></td>
                <td>
                    <select class="mapping-select" data-col-index="${index}">
                        ${options}
                    </select>
                </td>
                <td><i class="fas fa-arrow-right text-muted"></i></td>
            </tr>
        `;
        tbody.append(row);
    });
}

function validateMapping() {
    if (appState.fileType === 'json') return true;

    const mapping = {};
    $('.mapping-select').each(function () {
        const val = $(this).val();
        if (val) {
            const colIndex = $(this).data('col-index');
            mapping[colIndex] = val;
        }
    });

    appState.mapping = mapping;

    // Check required fields
    const targetFields = FIELD_DEFINITIONS[appState.entityType];
    const missing = [];

    targetFields.filter(f => f.required).forEach(f => {
        if (!Object.values(mapping).includes(f.id)) {
            missing.push(f.name);
        }
    });

    if (missing.length > 0) {
        showToast('warning', 'Champs manquants', `Veuillez mapper : ${missing.join(', ')}`);
        return false;
    }

    return true;
}

function processExcelData() {
    // Convert sheet data to objects based on mapping
    const rows = appState.sheetData.slice(1); // skip header
    const importItems = [];

    rows.forEach(row => {
        if (row.length === 0) return;
        const item = {};
        let hasData = false;

        Object.keys(appState.mapping).forEach(colIndex => {
            const fieldId = appState.mapping[colIndex];
            const val = row[colIndex];
            if (val !== undefined && val !== null && val !== '') {
                item[fieldId] = val;
                hasData = true;
            }
        });

        if (hasData) importItems.push(item);
    });

    return importItems;
}

async function runDryRun() {
    const log = $('#dryRunLog');
    log.empty();
    logEntry('Démarrage de la simulation...', 'system');

    let items = [];
    if (appState.fileType === 'json') {
        const key = appState.entityType; // 'users' or 'organisationUnits'
        // DHIS2 JSON usually has root key matching entity type plural
        if (appState.jsonData[key]) {
            items = appState.jsonData[key];
        } else if (Array.isArray(appState.jsonData)) {
            items = appState.jsonData;
        } else {
            // Try to find any array
            const firstKey = Object.keys(appState.jsonData)[0];
            if (Array.isArray(appState.jsonData[firstKey])) items = appState.jsonData[firstKey];
        }
        logEntry(`Source JSON détectée: ${items.length} objets found.`, 'info');
    } else {
        items = processExcelData();
        logEntry(`Source Excel convertie: ${items.length} lignes traitées.`, 'info');
    }

    if (items.length === 0) {
        logEntry('Aucun objet à importer.', 'error');
        return;
    }

    // Simulate API calls or Logic check
    // We can use /api/metadata?dryRun=true&importStrategy=CREATE_AND_UPDATE
    // This is the best way to get real feedback

    logEntry('Envoi au serveur pour validation (Dry Run)...', 'info');

    const payload = {};
    payload[appState.entityType] = items;

    try {
        const response = await dhis2Session.post('/api/metadata?dryRun=true&importStrategy=CREATE_AND_UPDATE', payload);

        renderImportReport(response, log);

        if (response.status === 'OK' || response.status === 'WARNING') {
            $('#btnToImport').prop('disabled', false);
            logEntry('Simulation terminée. Prêt pour import.', 'success');
        } else {
            $('#btnToImport').prop('disabled', true);
            logEntry('Simulation échouée. Corrigez les erreurs.', 'error');
        }

    } catch (err) {
        logEntry(`Erreur réseau/serveur: ${err.message}`, 'error');
        console.error(err);
    }
}

async function runImport() {
    const $btn = $('#btnRunImport');
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Import en cours...');

    $('#importProgress').show();
    $('#importStats').hide();

    // Re-prepare payload
    let items = [];
    if (appState.fileType === 'json') {
        const key = appState.entityType;
        if (appState.jsonData[key]) items = appState.jsonData[key];
        else items = appState.jsonData[Object.keys(appState.jsonData)[0]]; // naive fallback
    } else {
        items = processExcelData();
    }

    const payload = {};
    payload[appState.entityType] = items;

    try {
        const response = await dhis2Session.post('/api/metadata?importStrategy=CREATE_AND_UPDATE', payload);

        // Show Stats
        $('#statCreated').text(response.stats.created);
        $('#statUpdated').text(response.stats.updated);
        $('#statIgnored').text(response.stats.ignored);
        $('#importStats').css('display', 'flex');

        if (response.status === 'OK') {
            showToast('success', 'Import Réussi', `${response.stats.created} créés, ${response.stats.updated} mis à jour.`);
        } else {
            showToast('warning', 'Import terminé avec avertissements', 'Vérifiez le rapport.');
        }

        $btn.html('<i class="fas fa-check"></i> Terminé');

    } catch (err) {
        showToast('error', 'Echec Import', err.message);
        $btn.prop('disabled', false).html('<i class="fas fa-redo"></i> Réessayer');
    }
}

function renderImportReport(response, logContainer) {
    if (response.stats) {
        logEntry(`Stats: Created=${response.stats.created}, Updated=${response.stats.updated}, Ignored=${response.stats.ignored}, Deleted=${response.stats.deleted}`, 'info');
    }

    if (response.typeReports) {
        response.typeReports.forEach(tr => {
            logEntry(`Type: ${tr.klass}`, 'info');
            if (tr.objectReports) {
                tr.objectReports.forEach(or => {
                    or.errorReports.forEach(er => {
                        logEntry(`[${or.klass} ${or.index}] Error: ${er.message} (Code: ${er.errorCode})`, 'error');
                    });
                });
            }
        });
    }
}

function logEntry(msg, type = 'info') {
    const div = $(`<div class="log-entry ${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`);
    $('#dryRunLog').append(div);
    $('#dryRunLog').scrollTop($('#dryRunLog')[0].scrollHeight);
}
