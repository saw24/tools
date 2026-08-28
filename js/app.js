// ==================== GLOBAL STATE ====================
let workbook = null;
let sheetNames = [];
let sourceSheetData = { headers: [], data: [], uniqueValues: [] };
let targetSheetData = { headers: [], data: [], uniqueValues: [] };
let mappingResults = [];
let filteredResults = [];
let currentPage = 1;
const itemsPerPage = getConfig('itemsPerPage') || 20;
let strictMode = false;
let aiMappingEnabled = false;

// ==================== INITIALIZATION ====================
$(document).ready(function () {
    initializeAiSettings();
    initializeEventListeners();
    showToast('info', 'Bienvenue', 'Importez un fichier Excel pour commencer');
});

function initializeEventListeners() {
    // File upload
    $('#fileInput').on('change', handleFileSelect);

    // Drag and drop
    const uploadArea = $('#uploadArea');
    uploadArea.on('dragover', handleDragOver);
    uploadArea.on('dragleave', handleDragLeave);
    uploadArea.on('drop', handleDrop);
    uploadArea.on('click', () => $('#fileInput').click());

    // Sheet and column selection
    $('#sourceSheet').on('change', handleSourceSheetChange);
    $('#targetSheet').on('change', handleTargetSheetChange);
    $('#sourceColumn').on('change', handleSourceColumnChange);
    $('#targetColumn').on('change', handleTargetColumnChange);

    // Step navigation
    $('#nextToStep2').on('click', () => goToStep(2));
    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));

    // Mapping button
    $('#mapButton').on('click', performMapping);

    // Export buttons
    $('#exportButton').on('click', exportResults);
    $('#exportButton2').on('click', exportResults);

    // Export Modal Actions
    $('#btnSimpleExport').on('click', performSimpleExport);
    $('#btnEnrichedExport').on('click', performEnrichedExport);
    $('.close-modal').on('click', () => $('#exportModal').fadeOut());
    $('#exportModal').on('click', function (e) {
        if (e.target === this) $(this).fadeOut();
    });

    // Search
    $('#searchInput').on('input', handleSearch);

    // Filter tabs
    $('.filter-tab').on('click', handleFilterChange);

    // Pagination
    $('#prevPage').on('click', () => changePage(-1));
    $('#nextPage').on('click', () => changePage(1));

    // Mapping mode toggle
    $('#modeIntelligent').on('click', () => setMappingMode(false));
    $('#modeStrict').on('click', () => setMappingMode(true));
    $('#enableAiMapping').on('change', handleAiToggle);
    $('#aiProvider').on('change', handleAiProviderChange);
}

// ==================== STEP NAVIGATION ====================
let currentStep = 1;

function goToStep(step) {
    // Hide all steps
    $('.step-content').fadeOut(300);

    // Update step indicator
    $('.step-item').removeClass('active completed');

    // Mark completed steps
    for (let i = 1; i < step; i++) {
        $(`.step-item[data-step="${i}"]`).addClass('completed');
    }

    // Mark active step
    $(`.step-item[data-step="${step}"]`).addClass('active');

    // Show target step
    setTimeout(() => {
        $(`#step${step}`).fadeIn(300);
        currentStep = step;

        // Scroll to top
        $('html, body').animate({ scrollTop: 0 }, 300);
    }, 300);
}

// ==================== FILE HANDLING ====================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).addClass('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass('drag-over');

    const file = e.originalEvent.dataTransfer.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    // Validate file type
    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showToast('error', 'Erreur', 'Format de fichier non valide. Utilisez .xlsx, .xls ou .csv');
        return;
    }

    // Show file info
    $('#fileName').text(file.name);
    $('#fileSize').text(formatFileSize(file.size));
    $('#filePreview').fadeIn();

    // Read file
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            workbook = XLSX.read(data, { type: 'array' });
            sheetNames = workbook.SheetNames;

            populateSheetSelectors();
            $('#step1Actions').fadeIn();

            showToast('success', 'Succès', `Fichier chargé avec ${sheetNames.length} feuille(s)`);

            // Auto-advance to step 2 after a short delay
            setTimeout(() => {
                goToStep(2);
            }, 1000);
        } catch (error) {
            showToast('error', 'Erreur', 'Impossible de lire le fichier Excel');
            console.error(error);
        }
    };

    reader.readAsArrayBuffer(file);
}

function removeFile() {
    workbook = null;
    sheetNames = [];
    sourceSheetData = { headers: [], data: [], uniqueValues: [] };
    targetSheetData = { headers: [], data: [], uniqueValues: [] };
    mappingResults = [];

    $('#fileInput').val('');
    $('#filePreview').fadeOut();
    $('#step1Actions').fadeOut();
    goToStep(1);

    showToast('info', 'Info', 'Fichier supprimé');
}

// ==================== SHEET HANDLING ====================
function populateSheetSelectors() {
    const sourceSelect = $('#sourceSheet');
    const targetSelect = $('#targetSheet');

    sourceSelect.empty().append('<option value="">Sélectionnez une feuille...</option>');
    targetSelect.empty().append('<option value="">Sélectionnez une feuille...</option>');

    sheetNames.forEach(name => {
        sourceSelect.append(`<option value="${name}">${name}</option>`);
        targetSelect.append(`<option value="${name}">${name}</option>`);
    });

    // Auto-select first sheet
    if (sheetNames.length > 0) {
        sourceSelect.val(sheetNames[0]).trigger('change');
        targetSelect.val(sheetNames[0]).trigger('change');
    }
}

function handleSourceSheetChange() {
    const sheetName = $(this).val();
    if (sheetName) {
        parseSheetData(sheetName, 'source');
        $('#sourceColumn').prop('disabled', false);
    } else {
        $('#sourceColumn').prop('disabled', true).empty().append('<option value="">Sélectionnez une colonne...</option>');
    }
    updateMapButton();
}

function handleTargetSheetChange() {
    const sheetName = $(this).val();
    if (sheetName) {
        parseSheetData(sheetName, 'target');
        $('#targetColumn').prop('disabled', false);
    } else {
        $('#targetColumn').prop('disabled', true).empty().append('<option value="">Sélectionnez une colonne...</option>');
    }
    updateMapButton();
}

function parseSheetData(sheetName, type) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const objectData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length > 0) {
        const headers = jsonData[0];
        const data = objectData;

        const sheetData = {
            headers: headers,
            data: data,
            uniqueValues: []
        };

        if (type === 'source') {
            sourceSheetData = sheetData;
            populateColumnSelector('#sourceColumn', headers);
            $('#sourceRowCount').text(data.length);
        } else {
            targetSheetData = sheetData;
            populateColumnSelector('#targetColumn', headers);
            $('#targetRowCount').text(data.length);
        }
    }
}

function populateColumnSelector(selector, headers) {
    const $select = $(selector);
    $select.empty().append('<option value="">Sélectionnez une colonne...</option>');

    headers.forEach(header => {
        $select.append(`<option value="${header}">${header}</option>`);
    });
}

function handleSourceColumnChange() {
    const column = $(this).val();
    if (column) {
        const uniqueValues = getUniqueValues(sourceSheetData.data, column);
        sourceSheetData.uniqueValues = uniqueValues;
        $('#sourceUniqueCount').text(uniqueValues.length);
    }
    updateMapButton();
}

function handleTargetColumnChange() {
    const column = $(this).val();
    if (column) {
        const uniqueValues = getUniqueValues(targetSheetData.data, column);
        targetSheetData.uniqueValues = uniqueValues;
        $('#targetUniqueCount').text(uniqueValues.length);
    }
    updateMapButton();
}

function getUniqueValues(data, column) {
    const values = data.map(row => String(row[column] || '')).filter(v => v);
    return [...new Set(values)];
}

function updateMapButton() {
    const sourceCol = $('#sourceColumn').val();
    const targetCol = $('#targetColumn').val();
    $('#mapButton').prop('disabled', !sourceCol || !targetCol);
}

// ==================== AI SETTINGS ====================
function initializeAiSettings() {
    const aiConfig = getConfig('aiMapping') || {};
    aiMappingEnabled = !!aiConfig.enabled;

    $('#enableAiMapping').prop('checked', aiMappingEnabled);
    $('#aiProvider').val(aiConfig.provider || 'ollama');
    $('#aiModel').val(aiConfig.model || 'llama3.1');
    $('#aiBaseUrl').val(aiConfig.baseUrl || 'http://localhost:11434');
    $('#aiToken').val(aiConfig.token || '');

    syncAiSettingsUi();
}

function handleAiToggle() {
    aiMappingEnabled = $('#enableAiMapping').is(':checked');
    setConfig('aiMapping.enabled', aiMappingEnabled);
    syncAiSettingsUi();
}

function handleAiProviderChange() {
    const provider = $('#aiProvider').val();
    const defaultBaseUrl = provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com';
    $('#aiBaseUrl').val(defaultBaseUrl);
    syncAiSettingsUi();
}

function syncAiSettingsUi() {
    const provider = $('#aiProvider').val() || 'ollama';
    $('#aiSettingsFields').toggle(aiMappingEnabled);
    $('#aiTokenField').toggle(provider !== 'ollama');
}

function readAiSettings() {
    return {
        enabled: aiMappingEnabled,
        provider: ($('#aiProvider').val() || 'ollama').trim(),
        model: ($('#aiModel').val() || '').trim(),
        baseUrl: ($('#aiBaseUrl').val() || '').trim(),
        token: ($('#aiToken').val() || '').trim(),
        apiUrl: getConfig('aiMapping.apiUrl') || 'api/ai-mapping.php',
        maxRows: getConfig('aiMapping.maxRows') || 200,
        candidateLimit: getConfig('aiMapping.candidateLimit') || 12,
        minBaselineScore: getConfig('aiMapping.minBaselineScore') || 0.92,
        batchSize: getConfig('aiMapping.batchSize') || 25,
        temperature: getConfig('aiMapping.temperature') ?? 0.1
    };
}

// ==================== MAPPING MODE ====================
function setMappingMode(isStrict) {
    strictMode = isStrict;
    $('#modeIntelligent').toggleClass('active', !isStrict);
    $('#modeStrict').toggleClass('active', isStrict);
    $('#aiSettingsPanel').toggle(!isStrict);
    if (isStrict) {
        $('#mapButtonIcon').attr('class', 'fas fa-equals');
        $('#mapButtonLabel').text('Lancer le Mapping Strict');
        $('#progressTitle').text('Mapping strict en cours...');
        $('#progressDescription').text('Recherche de correspondances exactes');
    } else {
        $('#mapButtonIcon').attr('class', 'fas fa-magic');
        $('#mapButtonLabel').text('Lancer le Mapping Intelligent');
        $('#progressTitle').text('Analyse en cours...');
        $('#progressDescription').text('Calcul des correspondances avec l\'algorithme de Levenshtein');
    }
}

// ==================== MAPPING ALGORITHM ====================
function performMapping() {
    const sourceCol = $('#sourceColumn').val();
    const targetCol = $('#targetColumn').val();

    if (!sourceCol || !targetCol) return;

    // Show progress
    goToStep(3);
    $('#step3 .glass-card').hide();
    $('#progressSection').fadeIn();

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 2;
        if (progress >= 90) {
            clearInterval(progressInterval);
        }
        updateProgress(progress);
    }, 50);

    // Perform mapping with delay to show animation
    setTimeout(async () => {
        const sourceValues = sourceSheetData.uniqueValues;
        const targetValues = targetSheetData.uniqueValues;
        const aiSettings = readAiSettings();

        try {
            mappingResults = createBaselineMapping(sourceValues, targetValues);

            if (!strictMode && aiSettings.enabled) {
                $('#progressDescription').text('Amélioration des correspondances avec l\'IA');
                updateProgress(92);
                mappingResults = await enhanceMappingWithAi(mappingResults, targetValues, aiSettings);
            }
        } catch (error) {
            console.error('Critical mapping error:', error);
            showToast('error', 'Erreur', 'Une erreur est survenue lors du mapping IA ou local');
        }

        clearInterval(progressInterval);
        updateProgress(100);

        setTimeout(() => {
            $('#progressSection').fadeOut();
            displayResults();
            showToast('success', 'Terminé', `${mappingResults.length} correspondances trouvées`);
        }, 500);
    }, 1000);
}

function createBaselineMapping(sourceValues, targetValues) {
    return sourceValues.map(sourceVal => {
        let bestMatch = '';
        let bestScore = 0;

        try {
            if (strictMode) {
                const exactMatch = targetValues.find(targetVal =>
                    normalizeForMatching(sourceVal) === normalizeForMatching(targetVal)
                );
                if (exactMatch) {
                    bestMatch = exactMatch;
                    bestScore = 1.0;
                }
            } else {
                const bestCandidate = findBestLocalMatch(sourceVal, targetValues);
                bestScore = bestCandidate.score;
                bestMatch = bestScore >= getMinAcceptedScore() ? bestCandidate.value : '';
            }
        } catch (err) {
            console.error('Error mapping value:', sourceVal, err);
        }

        return {
            source: sourceVal,
            target: bestMatch,
            score: bestScore,
            manual: false,
            method: strictMode ? 'strict' : 'local'
        };
    });
}

function getMinAcceptedScore() {
    const configuredScore = Number(getConfig('matching.minAcceptedScore'));
    return Number.isFinite(configuredScore) ? configuredScore : 0.45;
}

function findBestLocalMatch(sourceValue, targetValues) {
    return targetValues
        .map(targetValue => buildMatchCandidate(sourceValue, targetValue))
        .sort(compareMatchCandidates)[0] || { value: '', score: 0 };
}

async function enhanceMappingWithAi(results, targetValues, settings) {
    if (!settings.model) {
        showToast('warning', 'IA ignorée', 'Veuillez renseigner le modèle IA à utiliser');
        return results;
    }

    const rows = results
        .filter(result => result.score < settings.minBaselineScore)
        .slice(0, settings.maxRows)
        .map(result => ({
            source: result.source,
            currentTarget: result.target,
            currentScore: result.score,
            candidates: getTopCandidates(result.source, targetValues, settings.candidateLimit)
        }));

    if (!rows.length) return results;

    if (results.length > settings.maxRows) {
        showToast('info', 'IA limitée', `Les ${settings.maxRows} premières correspondances faibles ont été envoyées à l'IA`);
    }

    const decisions = [];
    const batchSize = Math.max(1, settings.batchSize);
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        try {
            const response = await fetch(settings.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: settings.provider,
                    model: settings.model,
                    baseUrl: settings.baseUrl,
                    token: settings.token,
                    temperature: settings.temperature,
                    rows: batch
                })
            });

            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Réponse IA invalide');
            }
            decisions.push(...(payload.data?.mappings || []));
        } catch (error) {
            console.error('AI mapping batch failed:', error);
            showToast('warning', 'IA ignorée', error.message || 'Le mapping local a été conservé');
            return results;
        }
    }

    return mergeAiDecisions(results, decisions, targetValues);
}

function getTopCandidates(sourceValue, targetValues, limit) {
    return targetValues
        .map(value => buildMatchCandidate(sourceValue, value))
        .sort(compareMatchCandidates)
        .slice(0, limit);
}

function mergeAiDecisions(results, decisions, targetValues) {
    const targetSet = new Set(targetValues);
    const decisionsBySource = new Map();
    decisions.forEach(item => {
        if (item && typeof item.source === 'string') {
            decisionsBySource.set(item.source, item);
        }
    });

    return results.map(result => {
        const decision = decisionsBySource.get(result.source);
        if (!decision || !decision.target || !targetSet.has(decision.target)) {
            return result;
        }

        const aiScore = Number(decision.score);
        let normalizedAiScore = Number.isFinite(aiScore) ? Math.max(0, Math.min(1, aiScore)) : Math.max(result.score, 0.75);
        if (normalizedAiScore < 0.5) {
            normalizedAiScore = Math.max(result.score, 0.75);
        }

        return {
            ...result,
            target: decision.target,
            score: normalizedAiScore,
            manual: false,
            method: 'ai',
            reason: decision.reason || ''
        };
    });
}

function buildMatchCandidate(sourceValue, targetValue) {
    const source = normalizeForMatching(sourceValue);
    const target = normalizeForMatching(targetValue);
    const sourceWords = extractWords(source);
    const targetWords = extractWords(target);
    const score = calculateSimilarity(sourceValue, targetValue);
    const wordScore = calculateWordMatchScore(sourceWords, targetWords);
    const partialScore = calculatePartialMatch(sourceWords, targetWords);
    const sourceCoverage = calculateSourceWordCoverage(sourceWords, targetWords);
    const codeScore = calculateCodeMatchScore(source, target);
    const codePenalty = calculateCodeConflictPenalty(source, target);
    const outcomeScore = calculateOutcomeMatchScore(source, target);
    const outcomePenalty = calculateOutcomeConflictPenalty(source, target);
    const lengthCloseness = calculateLengthCloseness(source, target);
    const tieBreakScore = (
        (codeScore * 4) +
        (outcomeScore * 3) +
        (sourceCoverage * 3) +
        (wordScore * 2) +
        partialScore +
        lengthCloseness
    ) - codePenalty - outcomePenalty;

    return {
        value: targetValue,
        score,
        tieBreakScore,
        sourceCoverage,
        wordScore,
        partialScore,
        codeScore,
        codePenalty,
        outcomeScore,
        outcomePenalty,
        lengthCloseness
    };
}

function compareMatchCandidates(a, b) {
    const scoreDelta = b.score - a.score;
    if (Math.abs(scoreDelta) > 0.03) return scoreDelta;

    const tieDelta = b.tieBreakScore - a.tieBreakScore;
    if (Math.abs(tieDelta) > 0.001) return tieDelta;

    const coverageDelta = b.sourceCoverage - a.sourceCoverage;
    if (Math.abs(coverageDelta) > 0.001) return coverageDelta;

    return a.value.length - b.value.length;
}

function calculateSimilarity(str1, str2) {
    const s1 = normalizeForMatching(str1);
    const s2 = normalizeForMatching(str2);
    const finalizeScore = score => applyOutcomeConstraint(score, s1, s2);

    // 1. Exact match
    if (s1 === s2) return finalizeScore(1.0);

    // 2. One contains the other
    if (s1.includes(s2) || s2.includes(s1)) return finalizeScore(0.95);

    // 3. Extract words and clean them
    const words1 = extractWords(s1);
    const words2 = extractWords(s2);

    // 4. Strong exact match on disease/classification codes.
    const codeScore = calculateCodeMatchScore(s1, s2);
    if (codeScore > 0.9) return finalizeScore(codeScore);

    // 5. Check for meaningful acronym/word inclusions (e.g., "TSSI" in "N_TSSI")
    const acronymScore = checkAcronymMatch(words1, words2, s1, s2);
    if (acronymScore > 0.85) return finalizeScore(acronymScore);

    // 6. Word-based matching
    const wordMatchScore = calculateWordMatchScore(words1, words2);
    if (wordMatchScore > 0.8) return finalizeScore(wordMatchScore);

    // 7. Partial word matching (e.g., "Matrone" matches "N_Matrone")
    const partialScore = calculatePartialMatch(words1, words2);
    if (partialScore > 0.8) return finalizeScore(partialScore);

    // 8. Fuzzy matching with Levenshtein (fallback)
    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;

    const levenshteinScore = (maxLength - distance) / maxLength;

    // Return the best score from all methods
    const rawScore = Math.max(codeScore, acronymScore, wordMatchScore, partialScore, levenshteinScore);
    return finalizeScore(rawScore);
}

function normalizeForMatching(value) {
    let normalized = String(value || '').toLowerCase().trim();
    if (getConfig('matching.normalizeAccents')) {
        normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return normalized.replace(/\s+/g, ' ');
}

// Extract meaningful words from a string
function extractWords(str) {
    const stopWords = [
        'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en',
        'par', 'pour', 'sur', 'dans', 'vers', 'avec', 'sans', 'sous', 'chez', 'ne', 'se', 'ce',
        'ces', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'votre',
        'leur', 'leurs', 'qui', 'que', 'quoi', 'dont', 'quand', 'comment', 'pourquoi', 'quel',
        'quelle', 'quels', 'quelles',
        'cas', 'deces', 'cim', 'cim10', 'curatif', 'total', 'nombre', 'nb', 'n'
    ];

    if (!str) return [];

    return str
        .toLowerCase()
        .replace(/[()\[\]{}<>]/g, ' ') // Remove brackets explicitly
        .replace(/[_\-\/\\|.,;:!?*+^$]/g, ' ') // Remove separators and regex special chars
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
        .split(/\s+/)
        .filter(word => word.length > 1 && !stopWords.includes(word))
        .map(word => word.trim());
}

function calculateCodeMatchScore(str1, str2) {
    const codes1 = extractClassificationCodes(str1);
    const codes2 = extractClassificationCodes(str2);
    if (!codes1.length || !codes2.length) return 0;

    const codeSet2 = new Set(codes2);
    const hasExactCode = codes1.some(code => codeSet2.has(code));
    return hasExactCode ? 0.97 : 0;
}

function calculateCodeConflictPenalty(str1, str2) {
    const codes1 = extractClassificationCodes(str1);
    const codes2 = extractClassificationCodes(str2);
    if (!codes1.length || !codes2.length) return 0;

    const codeSet2 = new Set(codes2);
    return codes1.some(code => codeSet2.has(code)) ? 0 : 2;
}

function extractClassificationCodes(str) {
    const matches = str.match(/\b[a-z]\d{2}(?:\.\d+)?[a-z]?\b/g) || [];
    return [...new Set(matches)];
}

function isWeakMatchingWord(word) {
    return ['cas', 'deces', 'cim', 'cim10', 'curatif', 'total', 'nombre', 'nb', 'n'].includes(word);
}

function extractOutcomeType(str) {
    const words = str.split(/\s+/);
    if (words.includes('deces')) return 'deces';
    if (words.includes('cas')) return 'cas';
    return '';
}

function calculateOutcomeMatchScore(str1, str2) {
    const outcome1 = extractOutcomeType(str1);
    const outcome2 = extractOutcomeType(str2);
    if (!outcome1 || !outcome2) return 0;
    return outcome1 === outcome2 ? 1 : 0;
}

function calculateOutcomeConflictPenalty(str1, str2) {
    const outcome1 = extractOutcomeType(str1);
    const outcome2 = extractOutcomeType(str2);
    if (!outcome1 || !outcome2 || outcome1 === outcome2) return 0;
    return 4;
}

function applyOutcomeConstraint(score, str1, str2) {
    return calculateOutcomeConflictPenalty(str1, str2) ? Math.min(score, 0.42) : score;
}

function calculateSourceWordCoverage(sourceWords, targetWords) {
    if (!sourceWords.length || !targetWords.length) return 0;

    let covered = 0;
    sourceWords.forEach(sourceWord => {
        const hasMatch = targetWords.some(targetWord => {
            if (sourceWord === targetWord) return true;
            if (sourceWord.length >= 4 && targetWord.length >= 4) {
                return sourceWord.includes(targetWord) || targetWord.includes(sourceWord);
            }
            return false;
        });
        if (hasMatch) covered += 1;
    });

    return covered / sourceWords.length;
}

function calculateLengthCloseness(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;

    return 1 - (Math.abs(str1.length - str2.length) / maxLength);
}

// Helper to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check if one string is an acronym of another
function checkAcronymMatch(words1, words2, str1, str2) {
    // Check if any word from one set appears in the other string
    for (let word of words1) {
        if (word.length >= 4 && !isWeakMatchingWord(word)) {
            const escapedWord = escapeRegExp(word);

            // Check if this word appears in str2 (simple includes is safe)
            if (str2.includes(word)) {
                return 0.9;
            }

            // Check if str2 contains this word with prefix/suffix using safe regex
            try {
                const pattern = new RegExp(`[^a-z]${escapedWord}[^a-z]|^${escapedWord}[^a-z]|[^a-z]${escapedWord}$|^${escapedWord}$`, 'i');
                if (pattern.test(str2)) {
                    return 0.9;
                }
            } catch (e) {
                console.warn('Regex error for word:', word, e);
            }
        }
    }

    for (let word of words2) {
        if (word.length >= 4 && !isWeakMatchingWord(word)) {
            const escapedWord = escapeRegExp(word);

            if (str1.includes(word)) {
                return 0.9;
            }

            try {
                const pattern = new RegExp(`[^a-z]${escapedWord}[^a-z]|^${escapedWord}[^a-z]|[^a-z]${escapedWord}$|^${escapedWord}$`, 'i');
                if (pattern.test(str1)) {
                    return 0.9;
                }
            } catch (e) {
                console.warn('Regex error for word:', word, e);
            }
        }
    }

    return 0;
}

// Calculate score based on word matches
function calculateWordMatchScore(words1, words2) {
    if (words1.length === 0 || words2.length === 0) return 0;

    let matchCount = 0;
    let totalWords = Math.max(words1.length, words2.length);

    // Count exact word matches
    for (let word1 of words1) {
        for (let word2 of words2) {
            if (word1 === word2 && word1.length >= 3) {
                matchCount += 1;
            } else if (word1.length >= 4 && word2.length >= 4) {
                // Partial word match
                if (word1.includes(word2) || word2.includes(word1)) {
                    matchCount += 0.8;
                }
            }
        }
    }

    return Math.min(matchCount / totalWords, 1.0);
}

// Calculate partial matching score
function calculatePartialMatch(words1, words2) {
    let maxScore = 0;

    // Check each word from set 1 against each word from set 2
    for (let word1 of words1) {
        for (let word2 of words2) {
            if (word1.length < 3 || word2.length < 3) continue;

            // Check if one word contains the other
            if (word1.includes(word2)) {
                const score = word2.length / word1.length;
                maxScore = Math.max(maxScore, score * 0.85);
            } else if (word2.includes(word1)) {
                const score = word1.length / word2.length;
                maxScore = Math.max(maxScore, score * 0.85);
            }

            // Check for similar beginnings (at least 4 chars)
            if (word1.length >= 4 && word2.length >= 4) {
                const minLen = Math.min(word1.length, word2.length);
                let commonPrefix = 0;
                for (let i = 0; i < minLen; i++) {
                    if (word1[i] === word2[i]) {
                        commonPrefix++;
                    } else {
                        break;
                    }
                }
                if (commonPrefix >= 4) {
                    const score = commonPrefix / Math.max(word1.length, word2.length);
                    maxScore = Math.max(maxScore, score * 0.8);
                }
            }
        }
    }

    return maxScore;
}

function levenshteinDistance(str1, str2) {
    // Optimization: truncate very long strings to avoid performance issues/crashes
    const s1 = str1.length > 255 ? str1.substring(0, 255) : str1;
    const s2 = str2.length > 255 ? str2.substring(0, 255) : str2;

    const matrix = [];

    for (let i = 0; i <= s2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= s1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
        for (let j = 1; j <= s1.length; j++) {
            if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[s2.length][s1.length];
}

function updateProgress(percent) {
    $('#progressFill').css('width', percent + '%');
    $('#progressText').text(Math.round(percent) + '%');
}

// ==================== RESULTS DISPLAY ====================
function displayResults() {
    filteredResults = [...mappingResults];
    updateFilterCounts();
    renderResults();
    $('#step3 .glass-card').fadeIn();
}

function renderResults() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageResults = filteredResults.slice(start, end);

    const tbody = $('#resultsTableBody');
    tbody.empty();

    pageResults.forEach((result, index) => {
        const globalIndex = start + index + 1;
        const mappingIndex = mappingResults.findIndex(item => item.source === result.source);

        const scoreClass = getScoreClass(result.score);
        const scorePercent = Math.round(result.score * 100);

        const row = `
            <tr data-index="${mappingIndex}">
                <td class="col-index">${globalIndex}</td>
                <td class="col-source">${escapeHtml(result.source)}</td>
                <td class="col-target">
                    <select class="mapping-select" data-index="${mappingIndex}">
                        <option value="">Aucune correspondance</option>
                        ${result.target ? `<option value="${escapeHtml(result.target)}" selected>${escapeHtml(result.target)}</option>` : ''}
                        ${targetSheetData.uniqueValues
                .filter(v => v !== result.target)
                .map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
                .join('')}
                    </select>
                </td>
                <td class="col-score">
                    <div class="score-badge score-${scoreClass}">
                        <span>${scorePercent}%</span>
                        <div class="score-bar">
                            <div class="score-fill ${scoreClass}" style="width: ${scorePercent}%"></div>
                        </div>
                    </div>
                </td>
                <td class="col-status">
                    ${getStatusHtml(result)}
                </td>
            </tr>
        `;

        tbody.append(row);
    });

    // Attach change handlers
    $('.mapping-select').on('change', handleMappingChange);

    // Initialize Select2 for searchable selects
    // Initialize Select2 for searchable selects
    $('.mapping-select').select2({
        width: '100%',
        placeholder: 'Sélectionnez une valeur...',
        allowClear: true,
        theme: 'classic',
        dropdownAutoWidth: true,
        minimumInputLength: 3,
        matcher: function (params, data) {
            const search = $.trim(params.term || '');
            if (search.length < 3) return null;
            if (typeof data.text === 'undefined') return null;
            if (data.text.toLowerCase().indexOf(search.toLowerCase()) > -1) return data;
            return null;
        }
    }).on('select2:open', function (e) {
        // Focus search field on open
        document.querySelector('.select2-search__field').focus();
    });

    // Update pagination
    updatePagination();

    // Update results count
    $('#resultsCount').text(`${filteredResults.length} entrée${filteredResults.length > 1 ? 's' : ''}`);
}

function getStatusHtml(result) {
    if (!result.target) {
        return '<span class="status-badge status-unmapped"><i class="fas fa-ban"></i> Non mappé</span>';
    }
    if (result.manual) {
        return '<span class="status-badge status-manual"><i class="fas fa-hand-pointer"></i> Manuel</span>';
    }
    if (result.method === 'ai') {
        return '<span class="status-badge status-auto"><i class="fas fa-brain"></i> IA</span>';
    }
    return '<span class="status-badge status-auto"><i class="fas fa-robot"></i> Automatique</span>';
}

function handleMappingChange(e) {
    const index = $(this).data('index');
    const newValue = $(this).val();
    const sourceValue = mappingResults[index].source;

    // Update data model
    mappingResults[index].target = newValue;
    mappingResults[index].manual = !!newValue;

    // Recalculate score
    let newScore = 0;
    if (newValue) {
        newScore = calculateSimilarity(sourceValue, newValue);
    }
    mappingResults[index].score = newScore;

    const row = $(this).closest('tr');

    // Update status badge
    const statusBadge = row.find('.status-badge');
    if (!newValue) {
        statusBadge
            .removeClass('status-auto status-manual')
            .addClass('status-unmapped')
            .html('<i class="fas fa-ban"></i> Non mappé');
    } else {
        statusBadge
            .removeClass('status-unmapped status-auto status-manual')
            .addClass('status-manual')
            .html('<i class="fas fa-hand-pointer"></i> Manuel');
    }

    // Update score badge
    const scoreClass = getScoreClass(newScore);
    const scorePercent = Math.round(newScore * 100);

    const scoreBadge = row.find('.score-badge');
    scoreBadge.removeClass('score-high score-medium score-low').addClass(`score-${scoreClass}`);
    scoreBadge.find('span').text(`${scorePercent}%`);
    scoreBadge.find('.score-fill')
        .removeClass('high medium low')
        .addClass(scoreClass)
        .css('width', `${scorePercent}%`);
}

function getScoreClass(score) {
    if (score > 0.8) return 'high';
    if (score > 0.5) return 'medium';
    return 'low';
}



// ==================== FILTERING & SEARCH ====================
function handleFilterChange(e) {
    $('.filter-tab').removeClass('active');
    $(this).addClass('active');

    const filter = $(this).data('filter');

    if (filter === 'all') {
        filteredResults = [...mappingResults];
    } else if (filter === 'high') {
        filteredResults = mappingResults.filter(r => r.score > 0.8);
    } else if (filter === 'medium') {
        filteredResults = mappingResults.filter(r => r.score > 0.5 && r.score <= 0.8);
    } else if (filter === 'low') {
        filteredResults = mappingResults.filter(r => r.score <= 0.5);
    }

    currentPage = 1;
    renderResults();
}

function handleSearch(e) {
    const query = $(this).val().toLowerCase();

    if (!query) {
        filteredResults = [...mappingResults];
    } else {
        filteredResults = mappingResults.filter(r =>
            r.source.toLowerCase().includes(query) ||
            String(r.target || '').toLowerCase().includes(query)
        );
    }

    currentPage = 1;
    renderResults();
}

function updateFilterCounts() {
    const all = mappingResults.length;
    const high = mappingResults.filter(r => r.score > 0.8).length;
    const medium = mappingResults.filter(r => r.score > 0.5 && r.score <= 0.8).length;
    const low = mappingResults.filter(r => r.score <= 0.5).length;

    $('#countAll').text(all);
    $('#countHigh').text(high);
    $('#countMedium').text(medium);
    $('#countLow').text(low);
}

// ==================== PAGINATION ====================
function updatePagination() {
    const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

    $('#pageInfo').text(`Page ${currentPage} sur ${totalPages}`);
    $('#prevPage').prop('disabled', currentPage === 1);
    $('#nextPage').prop('disabled', currentPage === totalPages || totalPages === 0);
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderResults();

        // Smooth scroll to top of table
        $('html, body').animate({
            scrollTop: $('#resultsTable').offset().top - 100
        }, 300);
    }
}

// ==================== EXPORT ====================
// ==================== EXPORT ====================
function exportResults() {
    $('#exportModal').fadeIn();
}

function performSimpleExport() {
    const sourceSheet = $('#sourceSheet').val();
    const targetSheet = $('#targetSheet').val();
    const sourceCol = $('#sourceColumn').val();
    const targetCol = $('#targetColumn').val();

    const exportData = mappingResults.map(r => ({
        [`Source: ${sourceSheet} - ${sourceCol}`]: r.source,
        [`Mapped: ${targetSheet} - ${targetCol}`]: r.target,
        'Status': r.manual ? 'Manuel' : (r.method === 'ai' ? 'IA' : 'Automatique')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapping Results');

    const filename = `mapping_${sourceSheet}_${targetSheet}_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, filename);

    $('#exportModal').fadeOut();
    showToast('success', 'Exporté', 'Table de correspondance exportée avec succès');
}

function performEnrichedExport() {
    const sourceSheet = $('#sourceSheet').val();
    const targetSheet = $('#targetSheet').val();
    const sourceCol = $('#sourceColumn').val();
    const targetCol = $('#targetColumn').val();

    // Create a mapping dictionary for fast lookup
    const mappingDict = {};
    mappingResults.forEach(r => {
        mappingDict[r.source] = r.target;
    });

    // Create a target data dictionary for fast lookup (first match)
    const targetDataDict = {};
    targetSheetData.data.forEach(row => {
        const key = String(row[targetCol] || '');
        if (key && !targetDataDict[key]) {
            targetDataDict[key] = row;
        }
    });

    // Merge data
    const mergedData = sourceSheetData.data.map(sourceRow => {
        const sourceKey = String(sourceRow[sourceCol] || '');
        const mappedKey = mappingDict[sourceKey];

        // Start with source row data
        const newRow = { ...sourceRow };

        // Add target row data if mapping exists
        if (mappedKey && targetDataDict[mappedKey]) {
            const targetRow = targetDataDict[mappedKey];
            Object.keys(targetRow).forEach(key => {
                // Avoid overwriting source columns if names collide, prefix with "Target_"
                const newKey = newRow.hasOwnProperty(key) ? `Target_${key}` : key;
                newRow[newKey] = targetRow[key];
            });
        }

        // Add mapping status
        const mappingResult = mappingResults.find(r => r.source === sourceKey);
        newRow['Mapping_Status'] = mappedKey ? (mappingResult?.manual ? 'Manuel' : (mappingResult?.method === 'ai' ? 'IA' : 'Automatique')) : 'Non mappé';
        newRow['Mapped_Value'] = mappedKey || '';

        return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(mergedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Données Enrichies');

    const filename = `enriched_${sourceSheet}_${targetSheet}_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, filename);

    $('#exportModal').fadeOut();
    showToast('success', 'Exporté', 'Données enrichies exportées avec succès');
}

// ==================== UTILITIES ====================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function showToast(type, title, message) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    const toast = $(`
        <div class="toast toast-${type}">
            <i class="fas ${icons[type]}"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        </div>
    `);

    $('#toastContainer').append(toast);

    setTimeout(() => {
        toast.fadeOut(300, function () {
            $(this).remove();
        });
    }, 4000);
}
