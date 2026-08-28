'use strict';

(() => {
    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const state = {
        selectedOrgUnit: null,
        selectedOrgUnitGroup: null,
        metadata: {},
        cocMetadata: {},
        constantMetadata: {}, // Metadata for C{...}
        dataSetMetadata: {},  // Metadata for R{...}
        dataElementOrder: [],
        constantOrder: [],     // UIDs of constants found in expression
        reportingRateOrder: [], // UIDs for R{...}
        dataValues: {},
        constantValues: {}, // Values for C{...}
        periodType: 'quarterly'
    };

    let orgUnitSearchTimer = null;
    let notificationTimer = null;

    window.showToast = window.showToast || function (type, title, message) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = $(
            `<div class="toast toast-${type}">` +
            `<i class="fas ${icons[type] || icons.info}"></i>` +
            `<div class="toast-content">` +
            `<div class="toast-title">${title}</div>` +
            `<div class="toast-message">${message}</div>` +
            `</div></div>`
        );

        $('#toastContainer').append(toast);
        setTimeout(() => toast.fadeOut(300, () => toast.remove()), 4200);
    };

    $(document).ready(() => {
        initializeControls();
        bindEvents();
        refreshExpressionPreview();

        if (!window.dhis2Session || !dhis2Session.isConnected()) {
            showToast('info', 'Identification', 'Veuillez vous connecter pour utiliser les fonctionnalités DHIS2.');
        }

        // Listen for successful connection from the modal
        $(document).on('dhis2:connected', () => {
            showToast('success', 'Connecté', 'Session DHIS2 active. Vous pouvez maintenant calculer vos expressions.');
        });
    });

    function initializeControls() {
        const $monthSelect = $('#periodMonthSelect');
        $monthSelect.empty();
        monthNames.forEach((label, index) => {
            const value = String(index + 1).padStart(2, '0');
            $monthSelect.append(`<option value="${value}">${label}</option>`);
        });

        const now = new Date();
        $('#periodYearInput').val(now.getFullYear());
        $monthSelect.val(String(now.getMonth() + 1).padStart(2, '0'));
        state.periodType = $('#periodTypeSelect').val();
        updatePeriodControls();
    }

    function bindEvents() {
        $('#periodTypeSelect').on('change', () => {
            state.periodType = $('#periodTypeSelect').val();
            updatePeriodControls();
        });

        $('#expressionInput').on('input', () => refreshExpressionPreview());

        $('#btnEvaluateExpression').on('click', async () => {
            await evaluateExpression();
        });

        $('#orgUnitSearchInput').on('input', (event) => {
            const query = event.target.value.trim();
            if (query.length < 2) {
                hideOrgUnitSuggestions();
                return;
            }
            if (orgUnitSearchTimer) clearTimeout(orgUnitSearchTimer);
            orgUnitSearchTimer = setTimeout(() => {
                searchOrgUnits(query);
            }, 340);
        });

        $('#orgUnitGroupSearchInput').on('input', (event) => {
            const query = event.target.value.trim();
            if (query.length < 2) {
                hideOrgUnitGroupSuggestions();
                return;
            }
            if (orgUnitSearchTimer) clearTimeout(orgUnitSearchTimer);
            orgUnitSearchTimer = setTimeout(() => {
                searchOrgUnitGroups(query);
            }, 340);
        });
    }

    function updatePeriodControls() {
        const type = state.periodType;
        $('#monthSelectGroup').toggle(type === 'monthly');
        $('#quarterSelectGroup').toggle(type === 'quarterly');
        $('#periodMonthSelect, #periodQuarterSelect').prop('disabled', false);
    }

    async function evaluateExpression() {
        const expression = $('#expressionInput').val().trim();
        if (!expression) {
            showToast('warning', 'Expression manquante', 'Veuillez saisir une expression DHIS2.');
            return;
        }

        const period = resolvePeriodCode();
        if (!period) {
            showToast('warning', 'Période manquante', 'Veuillez renseigner une année valide et/ou une période personnalisée.');
            return;
        }

        if (!state.selectedOrgUnit && !state.selectedOrgUnitGroup) {
            showToast('warning', 'Structure manquante', 'Sélectionnez une unité d\'organisation ou un groupe de structures.');
            return;
        }

        const { tokens, constantTokens, reportingRateTokens, baseIds } = extractDataElementTokens(expression);
        if (!tokens.length && !constantTokens.length && !reportingRateTokens.length) {
            showToast('warning', 'Identifiants manquants', 'Aucun élément de donnée, constante ou formulaire identifié dans l\'expression.');
            return;
        }

        state.dataElementOrder = tokens;
        setLoading(true);

        try {
            const { deMetadata, cocMetadata, dataSetMetadata } = await fetchMetadata(tokens, reportingRateTokens);
            state.metadata = deMetadata;
            state.cocMetadata = cocMetadata;
            state.dataSetMetadata = dataSetMetadata;
            refreshExpressionPreview();

            const dataStore = await fetchDataValues(
                tokens,
                reportingRateTokens,
                baseIds,
                period,
                state.selectedOrgUnit?.id,
                state.selectedOrgUnitGroup?.id
            );
            state.dataValues = dataStore;

            // 2. Fetch constants if any
            if (constantTokens.length) {
                const constants = await fetchConstantMetadata(constantTokens);
                state.constantMetadata = constants;
                state.constantValues = constants; // Analytics are not needed for constants
            } else {
                state.constantMetadata = {};
                state.constantValues = {};
            }

            const evaluation = computeExpressionResult(expression, tokens, constantTokens, reportingRateTokens, dataStore, state.constantValues);
            const periodLabel = formatPeriodLabel(period, state.periodType);
            renderResult(evaluation, periodLabel);
            renderDataElementsTable(deMetadata, cocMetadata, dataStore, state.constantMetadata, dataSetMetadata);
        } catch (error) {
            console.error(error);
            setEvaluationError('Impossible de calculer l\'expression : ' + (error.message || 'Erreur inattendue.'));
            showToast('error', 'Erreur', error.message || 'Merci de vérifier vos paramètres et de réessayer.');
        } finally {
            setLoading(false);
        }
    }

    async function fetchMetadata(tokens, reportingRateTokens) {
        const deIds = new Set();
        const cocIds = new Set();
        const dataSetIds = new Set();

        tokens.forEach(token => {
            const parts = token.split('.');
            if (parts[0]) deIds.add(parts[0]);
            if (parts[1]) cocIds.add(parts[1]);
        });

        reportingRateTokens.forEach(token => {
            const dsId = token.split('.')[0];
            if (dsId) dataSetIds.add(dsId);
        });

        const deIdsArray = Array.from(deIds);
        const cocIdsArray = Array.from(cocIds);
        const dsIdsArray = Array.from(dataSetIds);

        const [deResponse, cocResponse, dsResponse] = await Promise.all([
            deIdsArray.length ? dhis2Session.getDataElements({
                fields: 'id,displayName,name',
                filter: `id:in:[${deIdsArray.join(',')}]`,
                paging: false
            }) : Promise.resolve({ dataElements: [] }),
            cocIdsArray.length ? dhis2Session.getMetadata('categoryOptionCombos', {
                fields: 'id,displayName,name',
                filter: `id:in:[${cocIdsArray.join(',')}]`,
                paging: false
            }) : Promise.resolve({ categoryOptionCombos: [] }),
            dsIdsArray.length ? dhis2Session.get('/api/dataSets.json', {
                fields: 'id,displayName,name',
                filter: `id:in:[${dsIdsArray.join(',')}]`,
                paging: false
            }) : Promise.resolve({ dataSets: [] })
        ]);

        const deMetadata = {};
        (deResponse.dataElements || []).forEach(el => { deMetadata[el.id] = el; });

        const cocMetadata = {};
        (cocResponse.categoryOptionCombos || []).forEach(coc => { cocMetadata[coc.id] = coc; });

        const dataSetMetadata = {};
        (dsResponse.dataSets || []).forEach(ds => { dataSetMetadata[ds.id] = ds; });

        return { deMetadata, cocMetadata, dataSetMetadata };
    }

    async function fetchDataValues(tokens, reportingRateTokens, baseIds, period, orgUnitId, orgUnitGroupId) {
        if (!tokens.length && !baseIds.length && !reportingRateTokens.length) return {};

        // dx: DataElements/COCs
        const dxTokens = Array.from(new Set([...tokens, ...baseIds]));

        // dx: Reporting rates
        const dxRR = (reportingRateTokens || []).map(token => {
            // Mapping standard types if possible
            return token;
        });

        const allDx = [...dxTokens, ...dxRR];

        const params = {
            dimension: [
                `dx:${allDx.join(';')}`,
                `pe:${period}`
            ],
            displayProperty: 'NAME',
            skipMeta: true,
            includeMetadataDetails: true
        };

        if (orgUnitGroupId) {
            params.dimension.push(`ou:OU_GROUP-${orgUnitGroupId}`);
        } else if (orgUnitId) {
            params.dimension.push(`ou:${orgUnitId}`);
        } else {
            return {};
        }

        // Appel à l'API Analytics (identique au Visualiseur DHIS2)
        // Cela permet d'avoir les données agrégées (sommes, moyennes, hierarchy...)
        const response = await dhis2Session.get('/api/analytics.json', params);

        const store = {};
        if (response && response.rows) {
            const headerIndex = {};
            response.headers.forEach((h, i) => headerIndex[h.name] = i);

            const dxIdx = headerIndex['dx'];
            const valIdx = headerIndex['value'];

            response.rows.forEach(row => {
                const dx = row[dxIdx];
                const val = row[valIdx];
                const normalized = Number(val);

                // On accumule (au cas où analytics renverrait plusieurs lignes pour un même dx)
                if (!store[dx]) {
                    store[dx] = { numeric: 0, hasNumeric: false, raw: val };
                }
                if (!Number.isNaN(normalized)) {
                    store[dx].numeric += normalized;
                    store[dx].hasNumeric = true;
                }
            });
        }
        return store;
    }

    function computeExpressionResult(expression, ids, constantIds, reportingRateIds, dataStore, constantValues) {
        const missing = [];
        const nonNumeric = [];

        [...ids, ...reportingRateIds].forEach(id => {
            const record = dataStore[id];
            if (!record) {
                missing.push(id);
                return;
            }
            if (!record.hasNumeric) {
                nonNumeric.push(id);
            }
        });

        constantIds.forEach(id => {
            if (!constantValues[id]) missing.push('Constant: ' + id);
        });

        let valueExpression = expression.replace(/#{([^}]+)}/g, (match, token) => {
            const value = dataStore[token]?.numeric;
            return Number.isFinite(value) ? value : 0;
        });

        valueExpression = valueExpression.replace(/C{([^}]+)}/g, (match, token) => {
            const value = constantValues[token]?.numeric;
            return Number.isFinite(value) ? value : 0;
        });

        valueExpression = valueExpression.replace(/R{([^}]+)}/g, (match, token) => {
            const value = dataStore[token]?.numeric;
            return Number.isFinite(value) ? value : 0;
        });

        // Traduction des opérateurs et fonctions DHIS2 vers JS
        const translated = valueExpression
            .replace(/\bif\s*\(/gi, '__IF__(')
            .replace(/\bd2:condition\s*\(/gi, '__IF__(')
            .replace(/\bAND\b/g, '&&')
            .replace(/\bOR\b/g, '||')
            .replace(/\bNOT\b/g, '!')
            .replace(/([^<>!])=([^=<>])/g, '$1==$2'); // Support du simple = pour comparaison

        try {
            const evaluator = new Function('__IF__', 'return ' + translated + ';');
            const result = evaluator((condition, truthy, falsy) => (condition ? truthy : falsy));
            return { result, missing, nonNumeric };
        } catch (e) {
            console.error('Translation error. Expression:', translated);
            throw new Error('Erreur de syntaxe dans l\'expression : ' + e.message);
        }
    }

    function renderResult({ result, missing, nonNumeric }, periodLabel) {
        $('#resultValue').text(formatResultNumber(result));
        const unitName = state.selectedOrgUnitGroup?.displayName || state.selectedOrgUnit?.displayName || '—';
        $('#resultMeta').text(`Période : ${periodLabel} · Unité/Groupe : ${unitName}`);

        const comments = [];
        if (missing.length) {
            const labels = missing.map(uid => {
                const parts = uid.split('.');
                const deId = parts[0];
                const cocId = parts[1];
                let label = state.metadata[deId]?.displayName || state.metadata[deId]?.name || deId;
                if (cocId) {
                    const cocName = state.cocMetadata[cocId]?.displayName || state.cocMetadata[cocId]?.name || cocId;
                    label += ` (${cocName})`;
                }
                return label;
            });
            comments.push(`${labels.length} élément(s) sans valeur (${labels.join(', ')})`);
            $('#missingElementsText').text(`Données manquantes : ${labels.join(', ')}`);
            $('#missingElements').show();
        } else {
            $('#missingElements').hide();
        }

        if (nonNumeric.length) {
            const labels = nonNumeric.map(uid => state.metadata[uid]?.displayName || uid);
            comments.push(`${labels.length} valeur(s) non numérique(s) traitées comme 0 (${labels.join(', ')})`);
        }

        $('#resultNote').text(comments.length ? `Attention : ${comments.join(' · ')}` : 'Expression évaluée avec succès.');
    }

    function setEvaluationError(message) {
        $('#resultValue').text('—');
        $('#resultMeta').text('Période : — · Unité : —');
        $('#resultNote').text(message || 'Une erreur est survenue lors du calcul.');
        $('#dataElementsTableBody').html('<tr><td colspan="3" class="data-empty">Aucune donnée à afficher.</td></tr>');
        $('#missingElements').hide();
    }

    function renderDataElementsTable(deMetadata, cocMetadata, dataStore, constantMetadata, dataSetMetadata) {
        const tbody = $('#dataElementsTableBody');
        tbody.empty();

        if (!state.dataElementOrder.length && !state.constantOrder.length && !state.reportingRateOrder.length) {
            tbody.append('<tr><td colspan="3" class="data-empty">Aucune donnée chargée.</td></tr>');
            return;
        }

        // Render Data Elements
        state.dataElementOrder.forEach(uid => {
            const parts = uid.split('.');
            const deId = parts[0];
            const cocId = parts[1];

            let label = deMetadata[deId]?.displayName || deMetadata[deId]?.name || deId;
            if (cocId) {
                const cocName = cocMetadata[cocId]?.displayName || cocMetadata[cocId]?.name || cocId;
                label += ` (${cocName})`;
            }
            const record = dataStore[uid];
            let displayValue = '—';

            if (record) {
                if (record.hasNumeric) {
                    displayValue = formatResultNumber(record.numeric);
                } else if (record.raw !== undefined && record.raw !== null) {
                    displayValue = escapeHtml(String(record.raw));
                }
            }

            tbody.append(`
                <tr>
                    <td><span class="badge" style="background:#4f46e5;font-size:10px;margin-right:5px;">#</span> ${escapeHtml(label)}</td>
                    <td>${escapeHtml(uid)}</td>
                    <td>${displayValue}</td>
                </tr>
            `);
        });

        // Render Reporting Rates
        state.reportingRateOrder.forEach(uid => {
            const parts = uid.split('.');
            const dsId = parts[0];
            const type = parts[1];

            let label = dataSetMetadata[dsId]?.displayName || dataSetMetadata[dsId]?.name || dsId;
            label += ` (${type})`;

            const record = dataStore[uid];
            let displayValue = record?.hasNumeric ? formatResultNumber(record.numeric) : '—';

            tbody.append(`
                <tr>
                    <td><span class="badge" style="background:#f59e0b;font-size:10px;margin-right:5px;">R</span> ${escapeHtml(label)}</td>
                    <td>${escapeHtml(uid)}</td>
                    <td>${displayValue}</td>
                </tr>
            `);
        });

        // Render Constants
        state.constantOrder.forEach(uid => {
            const record = constantMetadata[uid];
            let label = record?.displayName || uid;
            let displayValue = record?.hasNumeric ? formatResultNumber(record.numeric) : '—';

            tbody.append(`
                <tr>
                    <td><span class="badge" style="background:#ec4899;font-size:10px;margin-right:5px;">C</span> ${escapeHtml(label)}</td>
                    <td>${escapeHtml(uid)}</td>
                    <td>${displayValue}</td>
                </tr>
            `);
        });
    }

    function refreshExpressionPreview() {
        const raw = $('#expressionInput').val() || '';
        $('#expressionPreview').html(buildExpressionPreview(raw, state.metadata));
    }

    function buildExpressionPreview(expression, deMetadata) {
        if (!expression.trim()) {
            return 'Aucune expression définie.';
        }

        let step1 = expression.replace(/#{([^}]+)}/g, (match, token, offset) => {
            const parts = token.split('.');
            const deId = parts[0];
            const cocId = parts[1];

            let label = state.metadata[deId]?.displayName || state.metadata[deId]?.name || deId;
            if (cocId) {
                const cocName = state.cocMetadata?.[cocId]?.displayName || state.cocMetadata?.[cocId]?.name || cocId;
                label += ` (${cocName})`;
            }

            return `<span class="token-highlight" style="border-bottom: 2px solid #4f46e5;">${escapeHtml(label)}</span>`;
        });

        let step2 = step1.replace(/C{([^}]+)}/g, (match, token) => {
            let label = state.constantMetadata[token]?.displayName || token;
            return `<span class="token-highlight" style="border-bottom: 2px solid #ec4899;">${escapeHtml(label)}</span>`;
        });

        let step3 = step2.replace(/R{([^}]+)}/g, (match, token) => {
            const dsId = token.split('.')[0];
            const type = token.split('.')[1];
            let label = state.dataSetMetadata[dsId]?.displayName || dsId;
            label += ` (${type})`;
            return `<span class="token-highlight" style="border-bottom: 2px solid #f59e0b;">${escapeHtml(label)}</span>`;
        });

        return step3;
    }

    async function fetchConstantMetadata(constantTokens) {
        if (!constantTokens.length) return {};
        const response = await dhis2Session.get('/api/constants.json', {
            fields: 'id,displayName,value',
            filter: `id:in:[${constantTokens.join(',')}]`,
            paging: false
        });
        const store = {};
        (response.constants || []).forEach(c => {
            store[c.id] = {
                id: c.id,
                displayName: c.displayName,
                numeric: Number(c.value),
                hasNumeric: !isNaN(Number(c.value)),
                raw: c.value
            };
        });
        return store;
    }

    function extractDataElementTokens(expression) {
        const tokens = [];
        const constantTokens = [];
        const reportingRateTokens = [];
        const baseIds = new Set();
        const seenTokens = new Set();

        // Match #{...} including dots for Category Option Combos
        expression.replace(/#{([^}]+)}/g, (_, token) => {
            const sanitized = token?.trim();
            if (sanitized && !seenTokens.has(sanitized)) {
                seenTokens.add(sanitized);
                tokens.push(sanitized);

                // Extract base DE ID (first part)
                const baseId = sanitized.split('.')[0];
                if (baseId) {
                    baseIds.add(baseId);
                }
            }
        });

        // Match C{...} for Constants
        expression.replace(/C{([^}]+)}/g, (_, token) => {
            const sanitized = token?.trim();
            if (sanitized && !seenTokens.has('C:' + sanitized)) {
                seenTokens.add('C:' + sanitized);
                constantTokens.push(sanitized);
            }
        });

        // Match R{...} for Reporting Rates
        expression.replace(/R{([^}]+)}/g, (_, token) => {
            const sanitized = token?.trim();
            if (sanitized && !seenTokens.has('R:' + sanitized)) {
                seenTokens.add('R:' + sanitized);
                reportingRateTokens.push(sanitized);
            }
        });

        state.dataElementOrder = tokens;
        state.constantOrder = constantTokens;
        state.reportingRateOrder = reportingRateTokens;

        return { tokens, constantTokens, reportingRateTokens, baseIds: Array.from(baseIds) };
    }

    function resolvePeriodCode() {
        const manual = $('#manualPeriodInput').val().trim();
        if (manual) return manual;

        const yearValue = $('#periodYearInput').val().trim();
        if (!yearValue || yearValue.length < 4) return null;

        const type = state.periodType;
        if (type === 'monthly') {
            const month = $('#periodMonthSelect').val();
            return `${yearValue}${month}`;
        }

        if (type === 'quarterly') {
            const quarter = $('#periodQuarterSelect').val();
            return `${yearValue}Q${quarter}`;
        }

        return yearValue;
    }

    function formatPeriodLabel(periodCode, type) {
        if (!periodCode) return '—';
        if (/^\d{4}Q[1-4]$/i.test(periodCode)) {
            const year = periodCode.slice(0, 4);
            const quarter = periodCode.slice(5);
            return `Trimestriel · ${type === 'quarterly' ? `Q${quarter} ${year}` : `${year}`}`;
        }

        if (/^\d{6}$/.test(periodCode)) {
            const year = periodCode.slice(0, 4);
            const month = parseInt(periodCode.slice(4), 10);
            const monthLabel = monthNames[month - 1] || periodCode.slice(4);
            return `Mensuel · ${monthLabel} ${year}`;
        }

        if (/^\d{4}$/.test(periodCode)) {
            return `Annuel · ${periodCode}`;
        }

        return periodCode;
    }

    function searchOrgUnits(query) {
        if (!query) return;
        dhis2Session.get('/api/organisationUnits', {
            fields: 'id,displayName',
            filter: `displayName:ilike:${query}`,
            pageSize: 12,
            order: 'displayName:asc'
        }).then(response => {
            const results = (response && response.organisationUnits) || [];
            renderOrgUnitSuggestions(results);
        }).catch(error => {
            console.error(error);
            showToast('error', 'Requête échouée', 'Impossible de chercher les unités d\'organisation.');
        });
    }

    function renderOrgUnitSuggestions(items) {
        const container = $('#orgUnitSuggestions');
        container.empty();
        if (!items.length) {
            container.hide();
            return;
        }

        items.forEach(item => {
            const button = $(`<button type="button">${escapeHtml(item.displayName || item.id)}</button>`);
            button.on('click', () => selectOrgUnit(item));
            container.append(button);
        });
        container.show();
    }

    function selectOrgUnit(item) {
        state.selectedOrgUnit = item;
        state.selectedOrgUnitGroup = null; // Clear other selection
        $('#orgUnitSearchInput').val(item.displayName || item.id);
        $('#orgUnitGroupSearchInput').val('');
        hideOrgUnitSuggestions();
        hideOrgUnitGroupSuggestions();
        renderSelectedOrgUnit();
        renderSelectedOrgUnitGroup();
    }

    function renderSelectedOrgUnit() {
        const wrapper = $('#selectedOrgUnit');
        if (!state.selectedOrgUnit) {
            wrapper.hide().empty();
            return;
        }
        wrapper.html(`${escapeHtml(state.selectedOrgUnit.displayName || state.selectedOrgUnit.id)}` +
            `<span class="remove-orgunit" title="Supprimer">×</span>`);
        wrapper.show();
        wrapper.find('.remove-orgunit').on('click', () => {
            state.selectedOrgUnit = null;
            $('#orgUnitSearchInput').val('');
            renderSelectedOrgUnit();
        });
    }

    function hideOrgUnitSuggestions() {
        $('#orgUnitSuggestions').hide().empty();
    }

    // OU Group Management
    function searchOrgUnitGroups(query) {
        if (!query) return;
        dhis2Session.get('/api/organisationUnitGroups', {
            fields: 'id,displayName',
            filter: `displayName:ilike:${query}`,
            pageSize: 12,
            order: 'displayName:asc'
        }).then(response => {
            const results = (response && response.organisationUnitGroups) || [];
            renderOrgUnitGroupSuggestions(results);
        }).catch(error => {
            console.error(error);
            showToast('error', 'Requête échouée', 'Impossible de chercher les groupes de structures.');
        });
    }

    function renderOrgUnitGroupSuggestions(items) {
        const container = $('#orgUnitGroupSuggestions');
        container.empty();
        if (!items.length) {
            container.hide();
            return;
        }

        items.forEach(item => {
            const button = $(`<button type="button">${escapeHtml(item.displayName || item.id)}</button>`);
            button.on('click', () => selectOrgUnitGroup(item));
            container.append(button);
        });
        container.show();
    }

    function selectOrgUnitGroup(item) {
        state.selectedOrgUnitGroup = item;
        state.selectedOrgUnit = null; // Clear other selection
        $('#orgUnitGroupSearchInput').val(item.displayName || item.id);
        $('#orgUnitSearchInput').val('');
        hideOrgUnitGroupSuggestions();
        hideOrgUnitSuggestions();
        renderSelectedOrgUnitGroup();
        renderSelectedOrgUnit();
    }

    function renderSelectedOrgUnitGroup() {
        const wrapper = $('#selectedOrgUnitGroup');
        if (!state.selectedOrgUnitGroup) {
            wrapper.hide().empty();
            return;
        }
        wrapper.html(`${escapeHtml(state.selectedOrgUnitGroup.displayName || state.selectedOrgUnitGroup.id)}` +
            `<span class="remove-orgunit" title="Supprimer">×</span>`);
        wrapper.show();
        wrapper.find('.remove-orgunit').on('click', () => {
            state.selectedOrgUnitGroup = null;
            $('#orgUnitGroupSearchInput').val('');
            renderSelectedOrgUnitGroup();
        });
    }

    function hideOrgUnitGroupSuggestions() {
        $('#orgUnitGroupSuggestions').hide().empty();
    }

    function setLoading(active) {
        const button = $('#btnEvaluateExpression');
        if (active) {
            button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Calcul en cours...');
        } else {
            button.prop('disabled', false).text('Calculer l\'expression');
        }
    }

    function formatResultNumber(value) {
        if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
            return '—';
        }
        if (typeof value === 'number') {
            return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(value);
        }
        return escapeHtml(String(value));
    }

    function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    function showPageNotification(message, isError = false) {
        const container = $('#expressionNotification');
        container.text(message).css('background', isError ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)').fadeIn(200);
        if (notificationTimer) clearTimeout(notificationTimer);
        notificationTimer = setTimeout(() => container.fadeOut(200), 4000);
    }
})();
