/**
 * Module : Export de Valeurs de Données DHIS2
 * Exporte des dataValues au format XLSX, CSV ou JSON en respectant
 * strictement la structure acceptée par DHIS2 pour l'import
 * (dataValueSet : dataElement, period, orgUnit, categoryOptionCombo,
 * attributeOptionCombo, value, storedBy, lastUpdated, comment, followup).
 */

const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/* ==========================================================================
   PeriodUtils : génération / description des identifiants de périodes DHIS2
   ========================================================================== */
const PeriodUtils = (() => {
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = (d.getUTCDay() + 6) % 7; // Lundi = 0
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
        firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
        const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
        return { isoYear: d.getUTCFullYear(), week };
    }

    function weeksInISOYear(y) {
        return getISOWeek(new Date(y, 11, 28)).week;
    }

    function dailyId(date) {
        return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
    }
    function weeklyId(date) {
        const { isoYear, week } = getISOWeek(date);
        return `${isoYear}W${week}`;
    }

    // Décale un "index d'unité" (mois/bimestre/trimestre/semestre/année) dans le temps
    function shiftUnit(year, idx0, unitsPerYear, delta) {
        const total = year * unitsPerYear + idx0 + delta;
        const newYear = Math.floor(total / unitsPerYear);
        return [newYear, total - newYear * unitsPerYear];
    }

    function monthId(year, idx0) { return `${year}${pad2(idx0 + 1)}`; }
    function bimonthId(year, idx0) { return `${year}${pad2(idx0 * 2 + 1)}B`; }
    function quarterId(year, idx0) { return `${year}Q${idx0 + 1}`; }
    function sixmonthId(year, idx0) { return `${year}S${idx0 + 1}`; }
    function yearId(year) { return `${year}`; }

    function describe(id) {
        if (!id) return '';
        let m;
        if (/^\d{8}$/.test(id)) {
            return `${id.slice(6, 8)}/${id.slice(4, 6)}/${id.slice(0, 4)}`;
        }
        if (/^\d{4}W\d{1,2}$/.test(id)) {
            const [y, w] = id.split('W');
            return `Semaine ${w}, ${y}`;
        }
        if ((m = id.match(/^(\d{4})(\d{2})B$/))) {
            const y = m[1], start = parseInt(m[2], 10);
            return `${monthNames[start - 1]}-${monthNames[start] || monthNames[0]} ${y}`;
        }
        if ((m = id.match(/^(\d{4})Q([1-4])$/))) {
            return `Trimestre ${m[2]} ${m[1]}`;
        }
        if ((m = id.match(/^(\d{4})S([1-2])$/))) {
            return `Semestre ${m[2]} ${m[1]}`;
        }
        if (/^\d{6}$/.test(id)) {
            const y = id.slice(0, 4), mo = parseInt(id.slice(4, 6), 10);
            return `${monthNames[mo - 1]} ${y}`;
        }
        if (/^\d{4}$/.test(id)) return id;
        return id;
    }

    function generateFixed(type, years) {
        const list = [];
        years.forEach(y => {
            if (type === 'Monthly') {
                for (let i = 0; i < 12; i++) list.push(monthId(y, i));
            } else if (type === 'BiMonthly') {
                for (let i = 0; i < 6; i++) list.push(bimonthId(y, i));
            } else if (type === 'Quarterly') {
                for (let i = 0; i < 4; i++) list.push(quarterId(y, i));
            } else if (type === 'SixMonthly') {
                for (let i = 0; i < 2; i++) list.push(sixmonthId(y, i));
            } else if (type === 'Yearly') {
                list.push(yearId(y));
            } else if (type === 'Weekly') {
                const wk = weeksInISOYear(y);
                for (let w = 1; w <= wk; w++) list.push(`${y}W${w}`);
            }
        });
        return [...new Set(list)].sort().reverse();
    }

    // Renvoie {start:Date, end:Date} = les bornes calendaires couvertes par un identifiant de
    // période DHIS2, quel que soit son type. Utilisé pour interroger dataValueSets par
    // startDate/endDate plutôt que par identifiant exact (voir computeContiguousDateRange).
    function periodRange(id) {
        let m;
        if (/^\d{8}$/.test(id)) {
            const y = +id.slice(0, 4), mo = +id.slice(4, 6), d = +id.slice(6, 8);
            const day = new Date(y, mo - 1, d);
            return { start: day, end: day };
        }
        if ((m = id.match(/^(\d{4})W(\d{1,2})$/))) {
            const isoYear = +m[1], week = +m[2];
            const jan4 = new Date(isoYear, 0, 4);
            const jan4Day = (jan4.getDay() + 6) % 7; // Lundi = 0
            const week1Monday = new Date(jan4);
            week1Monday.setDate(jan4.getDate() - jan4Day);
            const start = new Date(week1Monday);
            start.setDate(week1Monday.getDate() + (week - 1) * 7);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return { start, end };
        }
        if ((m = id.match(/^(\d{4})(\d{2})B$/))) {
            const y = +m[1], startMonth = +m[2];
            return { start: new Date(y, startMonth - 1, 1), end: new Date(y, startMonth + 1, 0) };
        }
        if ((m = id.match(/^(\d{4})Q([1-4])$/))) {
            const y = +m[1], startMonth = (+m[2] - 1) * 3;
            return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 3, 0) };
        }
        if ((m = id.match(/^(\d{4})S([1-2])$/))) {
            const y = +m[1], startMonth = (+m[2] - 1) * 6;
            return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 6, 0) };
        }
        if (/^\d{6}$/.test(id)) {
            const y = +id.slice(0, 4), mo = +id.slice(4, 6);
            return { start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) };
        }
        if (/^\d{4}$/.test(id)) {
            const y = +id;
            return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
        }
        return null;
    }

    function isoDate(d) {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    // Si l'union des périodes sélectionnées forme UN seul bloc calendaire continu (sans trou),
    // renvoie {start, end} au format AAAA-MM-JJ, prêt pour les paramètres startDate/endDate de
    // /api/dataValueSets. DHIS2 y sélectionne alors toutes les valeurs dont la période est
    // entièrement comprise dans cet intervalle, quel que soit son propre periodType : cela
    // évite le piège des identifiants qui ne correspondent pas exactement (ex: "202608" ne
    // matche jamais une donnée stockée en "2026W31"). Renvoie null si non calculable (aucune
    // période, identifiant non reconnu, ou trou entre deux blocs) : il faut alors repasser par
    // une requête avec des identifiants de période exacts.
    function contiguousDateRange(periodIds) {
        if (!periodIds || periodIds.length === 0) return null;
        const ranges = periodIds.map(periodRange);
        if (ranges.some(r => !r)) return null;
        ranges.sort((a, b) => a.start - b.start);
        let curEnd = ranges[0].end;
        const globalStart = ranges[0].start;
        const ONE_DAY = 24 * 3600 * 1000;
        for (let i = 1; i < ranges.length; i++) {
            const r = ranges[i];
            if (r.start - curEnd > ONE_DAY) return null; // trou détecté
            if (r.end > curEnd) curEnd = r.end;
        }
        return { start: isoDate(globalStart), end: isoDate(curEnd) };
    }

    function generateDaily(fromStr, toStr) {
        if (!fromStr || !toStr) return [];
        const from = new Date(fromStr), to = new Date(toStr);
        if (isNaN(from) || isNaN(to) || from > to) return [];
        const list = [];
        const d = new Date(from);
        let count = 0;
        while (d <= to && count < 731) {
            list.push(dailyId(d));
            d.setDate(d.getDate() + 1);
            count++;
        }
        return list.reverse();
    }

    return {
        pad2, getISOWeek, weeksInISOYear, dailyId, weeklyId, shiftUnit,
        monthId, bimonthId, quarterId, sixmonthId, yearId, describe,
        generateFixed, generateDaily, periodRange, isoDate, contiguousDateRange
    };
})();

/* ==========================================================================
   Périodes relatives (façon sélecteur de périodes DHIS2)
   ========================================================================== */
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

function lastNDays(n) {
    const ids = [];
    for (let i = n; i >= 1; i--) ids.push(PeriodUtils.dailyId(addDays(new Date(), -i)));
    return ids;
}
function lastNWeeks(n) {
    const ids = [];
    for (let i = n; i >= 1; i--) ids.push(PeriodUtils.weeklyId(addDays(new Date(), -7 * i)));
    return [...new Set(ids)];
}
function currentUnitIndex(unitsPerYear) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexé
    const idx0 = Math.floor(m / (12 / unitsPerYear));
    return [y, idx0];
}
function thisUnit(unitsPerYear, idFn) {
    const [y, idx0] = currentUnitIndex(unitsPerYear);
    return [idFn(y, idx0)];
}
function lastNUnits(unitsPerYear, idFn, n) {
    const [y, idx0] = currentUnitIndex(unitsPerYear);
    const ids = [];
    for (let i = n; i >= 1; i--) {
        const [yy, ii] = PeriodUtils.shiftUnit(y, idx0, unitsPerYear, -i);
        ids.push(idFn(yy, ii));
    }
    return ids;
}
const yearIdFn = (y) => PeriodUtils.yearId(y);

const RELATIVE_PERIODS = [
    {
        group: 'Quotidien', items: [
            { key: 'TODAY', label: "Aujourd'hui", resolve: () => [PeriodUtils.dailyId(new Date())] },
            { key: 'YESTERDAY', label: 'Hier', resolve: () => lastNDays(1) },
            { key: 'LAST_3_DAYS', label: '3 derniers jours', resolve: () => lastNDays(3) },
            { key: 'LAST_7_DAYS', label: '7 derniers jours', resolve: () => lastNDays(7) },
            { key: 'LAST_14_DAYS', label: '14 derniers jours', resolve: () => lastNDays(14) },
            { key: 'LAST_30_DAYS', label: '30 derniers jours', resolve: () => lastNDays(30) },
            { key: 'LAST_60_DAYS', label: '60 derniers jours', resolve: () => lastNDays(60) },
            { key: 'LAST_90_DAYS', label: '90 derniers jours', resolve: () => lastNDays(90) },
        ]
    },
    {
        group: 'Hebdomadaire', items: [
            { key: 'THIS_WEEK', label: 'Cette semaine', resolve: () => [PeriodUtils.weeklyId(new Date())] },
            { key: 'LAST_WEEK', label: 'Semaine dernière', resolve: () => lastNWeeks(1) },
            { key: 'LAST_4_WEEKS', label: '4 dernières semaines', resolve: () => lastNWeeks(4) },
            { key: 'LAST_12_WEEKS', label: '12 dernières semaines', resolve: () => lastNWeeks(12) },
            { key: 'LAST_52_WEEKS', label: '52 dernières semaines', resolve: () => lastNWeeks(52) },
        ]
    },
    {
        group: 'Mensuel', items: [
            { key: 'THIS_MONTH', label: 'Ce mois-ci', resolve: () => thisUnit(12, PeriodUtils.monthId) },
            { key: 'LAST_MONTH', label: 'Mois dernier', resolve: () => lastNUnits(12, PeriodUtils.monthId, 1) },
            { key: 'LAST_3_MONTHS', label: '3 derniers mois', resolve: () => lastNUnits(12, PeriodUtils.monthId, 3) },
            { key: 'LAST_6_MONTHS', label: '6 derniers mois', resolve: () => lastNUnits(12, PeriodUtils.monthId, 6) },
            { key: 'LAST_12_MONTHS', label: '12 derniers mois', resolve: () => lastNUnits(12, PeriodUtils.monthId, 12) },
        ]
    },
    {
        group: 'Bimestriel', items: [
            { key: 'THIS_BIMONTH', label: 'Ce bimestre', resolve: () => thisUnit(6, PeriodUtils.bimonthId) },
            { key: 'LAST_BIMONTH', label: 'Bimestre dernier', resolve: () => lastNUnits(6, PeriodUtils.bimonthId, 1) },
            { key: 'LAST_6_BIMONTHS', label: '6 derniers bimestres', resolve: () => lastNUnits(6, PeriodUtils.bimonthId, 6) },
        ]
    },
    {
        group: 'Trimestriel', items: [
            { key: 'THIS_QUARTER', label: 'Ce trimestre', resolve: () => thisUnit(4, PeriodUtils.quarterId) },
            { key: 'LAST_QUARTER', label: 'Trimestre dernier', resolve: () => lastNUnits(4, PeriodUtils.quarterId, 1) },
            { key: 'LAST_4_QUARTERS', label: '4 derniers trimestres', resolve: () => lastNUnits(4, PeriodUtils.quarterId, 4) },
        ]
    },
    {
        group: 'Semestriel', items: [
            { key: 'THIS_SIXMONTH', label: 'Ce semestre', resolve: () => thisUnit(2, PeriodUtils.sixmonthId) },
            { key: 'LAST_SIXMONTH', label: 'Semestre dernier', resolve: () => lastNUnits(2, PeriodUtils.sixmonthId, 1) },
            { key: 'LAST_2_SIXMONTHS', label: '2 derniers semestres', resolve: () => lastNUnits(2, PeriodUtils.sixmonthId, 2) },
        ]
    },
    {
        group: 'Annuel', items: [
            { key: 'THIS_YEAR', label: 'Cette année', resolve: () => thisUnit(1, yearIdFn) },
            { key: 'LAST_YEAR', label: 'Année dernière', resolve: () => lastNUnits(1, yearIdFn, 1) },
            { key: 'LAST_5_YEARS', label: '5 dernières années', resolve: () => lastNUnits(1, yearIdFn, 5) },
            { key: 'LAST_10_YEARS', label: '10 dernières années', resolve: () => lastNUnits(1, yearIdFn, 10) },
        ]
    },
];

/* ==========================================================================
   Etat de l'application
   ========================================================================== */
const appState = {
    // Step 1 : Eléments de données
    deMode: 'direct',
    allDataElements: [],       // cache complet (mode direct)
    allDataSets: [],
    allDataElementGroups: [],
    dataElementsLoaded: false,
    dataSetsLoaded: false,
    dataElementGroupsLoaded: false,
    selectedDE: new Map(),      // id -> { id, displayName, valueType, categoryCombo }
    dePeriodTypeHints: new Map(), // id -> Set(periodType) déduit du/des dataSet(s) utilisé(s) pour l'ajouter

    // Step 2 : Unités d'organisation
    orgUnitTreeLoaded: false,
    selectedOU: new Map(),      // id -> { id, displayName }
    includeChildren: false,

    // Step 3 : Périodes
    periodType: 'Monthly',
    fixedYears: new Set(),
    selectedFixedPeriods: new Set(),
    selectedRelativeKeys: new Set(),
    fixedListCache: [],

    // Step 4 : Aperçu / Export
    identifiedValues: [],
    ouNameMap: new Map(),
    cocMap: new Map(),
    aocMap: new Map(),
    previewCapped: false,
    previewCap: 3000
};

const PREVIEW_HEADER_COLS = ['dataelement', 'period', 'orgunit', 'categoryoptioncombo', 'attributeoptioncombo', 'value', 'storedby', 'lastupdated', 'comment', 'followup'];

$(document).ready(function () {
    initModule();
});

function initModule() {
    $(document).on('dhis2:connected', checkConnection);
    checkConnection();

    initStep1Events();
    initStep2Events();
    initStep3Events();
    initStep4Events();

    $('#nextToStep2').on('click', () => {
        if (appState.selectedDE.size === 0) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins un élément de données.');
            return;
        }
        if (!appState.orgUnitTreeLoaded) loadOrgUnitTree();
        goToStep(2);
    });

    $('#nextToStep3').on('click', () => {
        if (appState.selectedOU.size === 0) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins une unité d\'organisation.');
            return;
        }
        if (appState.fixedListCache.length === 0) renderFixedPeriodList();
        goToStep(3);
    });

    $('#nextToStep4').on('click', () => {
        const finalPeriods = computeFinalPeriods();
        if (finalPeriods.size === 0) {
            showToast('warning', 'Sélection manquante', 'Veuillez sélectionner au moins une période (fixe ou relative).');
            return;
        }
        goToStep(4);
        runPreview();
    });

    $('#backToStep1').on('click', () => goToStep(1));
    $('#backToStep2').on('click', () => goToStep(2));
    $('#backToStep3').on('click', () => goToStep(3));
}

function checkConnection() {
    if (!dhis2Session.isConnected()) {
        $('#step1, .step-indicator').hide();
        showToast('error', 'Session DHIS2 requise', 'Vous allez être redirigé vers la page d\'accueil pour vous connecter...');
        setTimeout(() => { window.location.href = 'index.html'; }, 3000);
    } else {
        $('#step1, .step-indicator').show();
        $('#dhis2Status').css('display', 'flex');
        if (!appState.dataElementsLoaded) loadDataElements();
        if (!appState.dataSetsLoaded) loadDataSets();
        if (!appState.dataElementGroupsLoaded) loadDataElementGroups();
    }
}

function goToStep(step) {
    $('.step-content').hide();
    $(`#step${step}`).fadeIn();
    $('.step-item').removeClass('active completed');
    for (let i = 1; i <= 4; i++) {
        if (i < step) $(`.step-item[data-step="${i}"]`).addClass('completed');
        else if (i === step) $(`.step-item[data-step="${i}"]`).addClass('active');
    }
}

function showToast(type, title, message) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const toast = $(`<div class="toast toast-${type}"><i class="fas ${icons[type]}"></i><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div></div>`);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(300, function () { $(this).remove(); }), 4000);
}

function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/* ==========================================================================
   STEP 1 : Eléments de données
   ========================================================================== */
function initStep1Events() {
    // Onglets de mode
    $(document).on('click', '.de-mode-tab', function () {
        const mode = $(this).data('mode');
        appState.deMode = mode;
        $('.de-mode-tab').removeClass('active');
        $(this).addClass('active');
        $('.de-mode-panel').hide();
        $(`#deModePanel_${mode}`).show();
    });

    // Mode direct : recherche + checkbox = sélection directe
    $('#deSearchInput').on('input', function () { renderDirectDataElements($(this).val()); });
    $(document).on('change', '.de-checkbox', function () {
        const id = $(this).val();
        if ($(this).is(':checked')) {
            const de = appState.allDataElements.find(d => d.id === id);
            if (de) appState.selectedDE.set(id, de);
        } else {
            appState.selectedDE.delete(id);
        }
        updateDESelectionUI();
    });
    $(document).on('click', '.data-element-item', function (e) {
        if (!$(e.target).is('input')) {
            const checkbox = $(this).find('input.de-checkbox');
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        }
    });

    // Mode dataset
    $('#datasetSearchInput').on('input', function () { renderDatasetPickerList($(this).val()); });
    $('#btnAddFromDatasets').on('click', addDataElementsFromDatasets);

    // Mode groupe
    $('#degroupSearchInput').on('input', function () { renderGroupPickerList($(this).val()); });
    $('#btnAddFromGroups').on('click', addDataElementsFromGroups);

    // Panier partagé
    $(document).on('click', '.chip-remove', function () {
        const id = $(this).closest('.chip').data('id');
        appState.selectedDE.delete(id);
        updateDESelectionUI();
    });
    $('#btnClearDESelection').on('click', () => {
        appState.selectedDE.clear();
        updateDESelectionUI();
    });
}

async function loadDataElements() {
    try {
        const data = await dhis2Session.get('/api/dataElements', {
            paging: false,
            fields: 'id,displayName,code,valueType,domainType,categoryCombo[id,displayName]',
            filter: 'domainType:eq:AGGREGATE'
        });
        appState.allDataElements = (data.dataElements || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        appState.dataElementsLoaded = true;
        renderDirectDataElements();
    } catch (e) {
        console.error(e);
        $('#deListContainer').html('<div class="text-error" style="padding:20px;">Erreur de chargement des éléments de données.</div>');
    }
}

async function loadDataSets() {
    try {
        const data = await dhis2Session.get('/api/dataSets', {
            paging: false,
            fields: 'id,displayName,periodType'
        });
        appState.allDataSets = (data.dataSets || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        appState.dataSetsLoaded = true;
        renderDatasetPickerList();
    } catch (e) {
        console.error(e);
        $('#datasetListContainer').html('<div class="text-error" style="padding:20px;">Erreur de chargement des ensembles de données.</div>');
    }
}

async function loadDataElementGroups() {
    try {
        const data = await dhis2Session.get('/api/dataElementGroups', {
            paging: false,
            fields: 'id,displayName'
        });
        appState.allDataElementGroups = (data.dataElementGroups || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
        appState.dataElementGroupsLoaded = true;
        renderGroupPickerList();
    } catch (e) {
        console.error(e);
        $('#degroupListContainer').html('<div class="text-error" style="padding:20px;">Erreur de chargement des groupes.</div>');
    }
}

function renderDirectDataElements(searchTerm = '') {
    const container = $('#deListContainer');
    container.empty();

    if (!appState.dataElementsLoaded) {
        container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement des éléments de données...</div>');
        return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = term
        ? appState.allDataElements.filter(de =>
            de.displayName.toLowerCase().includes(term) ||
            de.id.toLowerCase().includes(term) ||
            (de.code || '').toLowerCase().includes(term))
        : appState.allDataElements;

    if (filtered.length === 0) {
        container.append('<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun élément trouvé.</div>');
        return;
    }

    const limited = filtered.slice(0, 300);
    limited.forEach(de => {
        const isSelected = appState.selectedDE.has(de.id);
        const item = $(`
            <div class="data-element-item ${isSelected ? 'selected' : ''}" data-id="${de.id}">
                <input type="checkbox" class="de-checkbox" value="${de.id}" ${isSelected ? 'checked' : ''}>
                <div class="de-info">
                    <span class="de-name">${de.displayName}</span>
                    <span class="de-id">${de.id}${de.code ? ' · ' + de.code : ''} · ${de.valueType}</span>
                </div>
            </div>
        `);
        container.append(item);
    });

    if (filtered.length > limited.length) {
        container.append(`<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px;">+ ${filtered.length - limited.length} autre(s) résultat(s), affinez votre recherche...</div>`);
    }
}

function renderDatasetPickerList(searchTerm = '') {
    const container = $('#datasetListContainer');
    container.empty();

    if (!appState.dataSetsLoaded) {
        container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement des ensembles de données...</div>');
        return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = term
        ? appState.allDataSets.filter(ds => ds.displayName.toLowerCase().includes(term) || ds.id.toLowerCase().includes(term))
        : appState.allDataSets;

    if (filtered.length === 0) {
        container.append('<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun ensemble trouvé.</div>');
        return;
    }

    filtered.forEach(ds => {
        const item = $(`
            <div class="data-element-item" data-id="${ds.id}">
                <input type="checkbox" class="dataset-checkbox" value="${ds.id}">
                <div class="de-info">
                    <span class="de-name">${ds.displayName}</span>
                    <span class="de-id">${ds.id} · ${ds.periodType || ''}</span>
                </div>
            </div>
        `);
        container.append(item);
    });
}

function renderGroupPickerList(searchTerm = '') {
    const container = $('#degroupListContainer');
    container.empty();

    if (!appState.dataElementGroupsLoaded) {
        container.html('<div class="tree-loading"><i class="fas fa-spinner fa-spin"></i> Chargement des groupes...</div>');
        return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = term
        ? appState.allDataElementGroups.filter(g => g.displayName.toLowerCase().includes(term) || g.id.toLowerCase().includes(term))
        : appState.allDataElementGroups;

    if (filtered.length === 0) {
        container.append('<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucun groupe trouvé.</div>');
        return;
    }

    filtered.forEach(g => {
        const item = $(`
            <div class="data-element-item" data-id="${g.id}">
                <input type="checkbox" class="degroup-checkbox" value="${g.id}">
                <div class="de-info">
                    <span class="de-name">${g.displayName}</span>
                    <span class="de-id">${g.id}</span>
                </div>
            </div>
        `);
        container.append(item);
    });
}

async function addDataElementsFromDatasets() {
    const ids = $('.dataset-checkbox:checked').map(function () { return $(this).val(); }).get();
    if (ids.length === 0) {
        showToast('warning', 'Aucune sélection', 'Cochez au moins un ensemble de données.');
        return;
    }
    const $btn = $('#btnAddFromDatasets');
    const original = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Chargement...');

    try {
        let added = 0;
        for (const chunk of chunkArray(ids, 20)) {
            const data = await dhis2Session.get('/api/dataSets', {
                filter: `id:in:[${chunk.join(',')}]`,
                fields: 'id,displayName,periodType,dataSetElements[dataElement[id,displayName,code,valueType,domainType,categoryCombo[id,displayName]]]',
                paging: false
            });
            (data.dataSets || []).forEach(ds => {
                (ds.dataSetElements || []).forEach(dse => {
                    const de = dse.dataElement;
                    if (!de) return;
                    if (!appState.selectedDE.has(de.id)) added++;
                    appState.selectedDE.set(de.id, de);
                    if (ds.periodType) {
                        if (!appState.dePeriodTypeHints.has(de.id)) appState.dePeriodTypeHints.set(de.id, new Set());
                        appState.dePeriodTypeHints.get(de.id).add(ds.periodType);
                    }
                });
            });
        }
        updateDESelectionUI();
        renderDirectDataElements($('#deSearchInput').val());
        showToast('success', 'Eléments ajoutés', `${added} nouvel(aux) élément(s) ajouté(s) au panier.`);
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger les éléments des ensembles sélectionnés.');
    } finally {
        $btn.prop('disabled', false).html(original);
    }
}

async function addDataElementsFromGroups() {
    const ids = $('.degroup-checkbox:checked').map(function () { return $(this).val(); }).get();
    if (ids.length === 0) {
        showToast('warning', 'Aucune sélection', 'Cochez au moins un groupe d\'éléments de données.');
        return;
    }
    const $btn = $('#btnAddFromGroups');
    const original = $btn.html();
    $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Chargement...');

    try {
        let added = 0;
        for (const chunk of chunkArray(ids, 20)) {
            const data = await dhis2Session.get('/api/dataElementGroups', {
                filter: `id:in:[${chunk.join(',')}]`,
                fields: 'id,displayName,dataElements[id,displayName,code,valueType,domainType,categoryCombo[id,displayName]]',
                paging: false
            });
            (data.dataElementGroups || []).forEach(g => {
                (g.dataElements || []).forEach(de => {
                    if (de && !appState.selectedDE.has(de.id)) added++;
                    if (de) appState.selectedDE.set(de.id, de);
                });
            });
        }
        updateDESelectionUI();
        renderDirectDataElements($('#deSearchInput').val());
        showToast('success', 'Eléments ajoutés', `${added} nouvel(aux) élément(s) ajouté(s) au panier.`);
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger les éléments des groupes sélectionnés.');
    } finally {
        $btn.prop('disabled', false).html(original);
    }
}

function updateDESelectionUI() {
    const count = appState.selectedDE.size;
    $('#deSelectionCount').text(`${count} élément(s) sélectionné(s)`);

    const basket = $('#deBasket');
    basket.empty();
    if (count === 0) {
        basket.html('<div style="padding:10px; color:var(--text-muted); font-size:13px;">Aucun élément sélectionné pour le moment.</div>');
    } else {
        appState.selectedDE.forEach(de => {
            basket.append(`
                <div class="chip" data-id="${de.id}" title="${de.id}">
                    <span>${de.displayName}</span>
                    <i class="fas fa-times chip-remove"></i>
                </div>
            `);
        });
    }

    $('.data-element-item').removeClass('selected');
    $('.de-checkbox').each(function () {
        const isSel = appState.selectedDE.has($(this).val());
        $(this).prop('checked', isSel);
        $(this).closest('.data-element-item').toggleClass('selected', isSel);
    });
}

/* ==========================================================================
   STEP 2 : Unités d'organisation (multi-sélection)
   ========================================================================== */
function initStep2Events() {
    $(document).on('click', '.tree-toggle', function (e) {
        e.stopPropagation();
        const li = $(this).closest('li');
        const ul = li.children('ul');
        const icon = $(this).find('i');

        if (ul.length > 0) {
            ul.slideToggle();
            icon.toggleClass('fa-caret-right fa-caret-down');
        } else {
            loadOUTreeChildren(li.data('id'), li);
            icon.removeClass('fa-caret-right').addClass('fa-caret-down');
        }
    });

    $(document).on('click', '.ou-tree-checkbox', function (e) {
        e.stopPropagation();
        toggleOrgUnit($(this).val(), $(this).siblings('.node-text').text(), $(this).is(':checked'));
    });

    $(document).on('click', '.tree-node-content', function (e) {
        if ($(e.target).is('input')) return;
        const checkbox = $(this).find('.ou-tree-checkbox');
        const newState = !checkbox.prop('checked');
        checkbox.prop('checked', newState);
        toggleOrgUnit(checkbox.val(), checkbox.siblings('.node-text').text(), newState);
    });

    $(document).on('click', '.chip-remove-ou', function () {
        const id = $(this).closest('.chip').data('id');
        appState.selectedOU.delete(id);
        updateOUSelectionUI();
    });
    $('#btnClearOUSelection').on('click', () => {
        appState.selectedOU.clear();
        updateOUSelectionUI();
    });

    $('#includeChildrenCheck').on('change', function () {
        appState.includeChildren = $(this).is(':checked');
    });

    // Recherche d'unités d'organisation
    let searchTimeout;
    $('#ouSearchInput').on('input', function () {
        const query = $(this).val();
        clearTimeout(searchTimeout);
        if (query.length < 2) { $('#ouSearchResults').hide(); return; }
        searchTimeout = setTimeout(() => searchOrgUnits(query), 400);
    });
    $(document).on('click', function (e) {
        if (!$(e.target).closest('.search-wrapper').length) $('#ouSearchResults').hide();
    });
    $(document).on('click', '.ou-search-item', function () {
        toggleOrgUnit($(this).data('id'), $(this).data('name'), true);
        $(this).addClass('added');
    });
}

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
        (data.organisationUnits || []).sort((a, b) => a.displayName.localeCompare(b.displayName)).forEach(ou => {
            rootUl.append(renderOUTreeNode(ou));
        });
        container.append(rootUl);
        appState.orgUnitTreeLoaded = true;
    } catch (e) {
        console.error(e);
        container.html('<p class="text-error">Erreur de chargement de l\'arbre.</p>');
    }
}

async function loadOUTreeChildren(parentId, parentLi) {
    try {
        const data = await dhis2Session.get(`/api/organisationUnits/${parentId}`, {
            fields: 'children[id,displayName,children::isNotEmpty]'
        });
        const children = data.children;
        if (children && children.length > 0) {
            children.sort((a, b) => a.displayName.localeCompare(b.displayName));
            const ul = $('<ul class="tree-ul" style="display:none;"></ul>');
            children.forEach(child => ul.append(renderOUTreeNode(child)));
            parentLi.append(ul);
            ul.slideDown();
        } else {
            parentLi.find('.tree-toggle i').removeClass('fa-caret-down').addClass('fa-caret-right').css('opacity', '0.3');
        }
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de charger les enfants.');
    }
}

function renderOUTreeNode(ou) {
    const hasChildren = ou.children === true || (Array.isArray(ou.children) && ou.children.length > 0) || ou.children === undefined;
    const isLeaf = !hasChildren;
    const toggleHtml = isLeaf ?
        '<span class="tree-toggle" style="opacity:0"></span>' :
        '<span class="tree-toggle"><i class="fas fa-caret-right"></i></span>';
    const isChecked = appState.selectedOU.has(ou.id);

    return $(`
        <li data-id="${ou.id}">
            <div class="tree-node-content ${isChecked ? 'selected' : ''}">
                ${toggleHtml}
                <input type="checkbox" class="ou-tree-checkbox" value="${ou.id}" ${isChecked ? 'checked' : ''}>
                <span class="node-text">${ou.displayName}</span>
            </div>
        </li>
    `);
}

async function searchOrgUnits(query) {
    const resultsContainer = $('#ouSearchResults');
    resultsContainer.html('<div style="padding:15px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Recherche...</div>').show();
    try {
        const data = await dhis2Session.get('/api/organisationUnits', {
            filter: `displayName:ilike:${query}`,
            fields: 'id,displayName,path',
            pageSize: 15
        });
        renderOUSearchResults(data.organisationUnits || []);
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
        const already = appState.selectedOU.has(ou.id);
        const item = $(`
            <div class="ou-search-item ${already ? 'added' : ''}" data-id="${ou.id}" data-name="${ou.displayName}">
                <strong>${ou.displayName}</strong> ${already ? '<i class="fas fa-check" style="color:#10b981; margin-left:6px;"></i>' : ''}
                <span class="ou-path">${ou.id}</span>
            </div>
        `);
        resultsContainer.append(item);
    });
}

function toggleOrgUnit(id, name, checked) {
    if (checked) {
        appState.selectedOU.set(id, { id, displayName: name || id });
    } else {
        appState.selectedOU.delete(id);
    }
    updateOUSelectionUI();
}

function updateOUSelectionUI() {
    const count = appState.selectedOU.size;
    $('#ouSelectionCount').text(`${count} unité(s) sélectionnée(s)`);

    const basket = $('#ouBasket');
    basket.empty();
    if (count === 0) {
        basket.html('<div style="padding:10px; color:var(--text-muted); font-size:13px;">Aucune unité sélectionnée pour le moment.</div>');
    } else {
        appState.selectedOU.forEach(ou => {
            basket.append(`
                <div class="chip" data-id="${ou.id}" title="${ou.id}">
                    <span>${ou.displayName}</span>
                    <i class="fas fa-times chip-remove-ou"></i>
                </div>
            `);
        });
    }

    $('.tree-node-content').removeClass('selected');
    $('.ou-tree-checkbox').each(function () {
        const isSel = appState.selectedOU.has($(this).val());
        $(this).prop('checked', isSel);
        $(this).closest('.tree-node-content').toggleClass('selected', isSel);
    });
}

/* ==========================================================================
   STEP 3 : Périodes (fixes + relatives)
   ========================================================================== */
function initStep3Events() {
    $(document).on('click', '.period-mode-tab', function () {
        const mode = $(this).data('mode');
        $('.period-mode-tab').removeClass('active');
        $(this).addClass('active');
        $('.period-mode-panel').hide();
        $(`#periodModePanel_${mode}`).show();
    });

    $('#periodTypeSelect').on('change', function () {
        appState.periodType = $(this).val();
        $('#dailyRangeRow').toggle(appState.periodType === 'Daily');
        $('#yearPickerRow').toggle(appState.periodType !== 'Daily');
        renderFixedPeriodList();
        updatePeriodTypeWarning();
    });

    $('#btnGenerateDaily').on('click', renderFixedPeriodList);

    $(document).on('change', '.year-check', function () {
        const y = parseInt($(this).val(), 10);
        if ($(this).is(':checked')) appState.fixedYears.add(y);
        else appState.fixedYears.delete(y);
        renderFixedPeriodList();
    });

    $('#periodSearchInput').on('input', function () { renderFixedPeriodListUI($(this).val()); });

    $(document).on('change', '.period-checkbox', function () {
        const id = $(this).val();
        if ($(this).is(':checked')) appState.selectedFixedPeriods.add(id);
        else appState.selectedFixedPeriods.delete(id);
        updatePeriodSummary();
    });
    $(document).on('click', '.period-item', function (e) {
        if (!$(e.target).is('input')) {
            const checkbox = $(this).find('input.period-checkbox');
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        }
    });
    $('#btnDeselectAllFixedPeriods').on('click', () => {
        appState.selectedFixedPeriods.clear();
        renderFixedPeriodListUI($('#periodSearchInput').val());
        updatePeriodSummary();
    });

    $(document).on('change', '.relative-checkbox', function () {
        const key = $(this).val();
        if ($(this).is(':checked')) appState.selectedRelativeKeys.add(key);
        else appState.selectedRelativeKeys.delete(key);
        updatePeriodSummary();
    });

    // Par défaut, présélectionne l'année en cours pour un premier affichage utile
    appState.fixedYears.add(new Date().getFullYear());

    renderYearPicker();
    renderRelativePeriodPanel();
    renderFixedPeriodList();
    updatePeriodSummary();
}

/**
 * Déduit le(s) periodType DHIS2 (Daily, Weekly, Monthly, ...) des éléments actuellement
 * sélectionnés, à partir des indices collectés lors de l'ajout via "Par Ensemble de données"
 * (seule source qui porte cette information ; best-effort, pas garanti pour les autres modes).
 */
function detectDataElementPeriodTypes() {
    const types = new Set();
    appState.selectedDE.forEach((de, id) => {
        const hints = appState.dePeriodTypeHints.get(id);
        if (hints) hints.forEach(t => types.add(t));
    });
    return types;
}

function periodTypeMatches(hintType, selectedType) {
    if (hintType === selectedType) return true;
    // Les variantes hebdomadaires DHIS2 (Weekly, WeeklyWednesday, WeeklyThursday, ...)
    // partagent toutes le même format d'identifiant "AAAAWn".
    if (hintType.startsWith('Weekly') && selectedType === 'Weekly') return true;
    return false;
}

const PERIOD_TYPE_LABELS_FR = {
    Daily: 'Quotidien', Weekly: 'Hebdomadaire', WeeklyWednesday: 'Hebdomadaire (mercredi)',
    WeeklyThursday: 'Hebdomadaire (jeudi)', WeeklySaturday: 'Hebdomadaire (samedi)',
    WeeklySunday: 'Hebdomadaire (dimanche)', BiWeekly: 'Bimensuel', Monthly: 'Mensuel',
    BiMonthly: 'Bimestriel', Quarterly: 'Trimestriel', SixMonthly: 'Semestriel',
    SixMonthlyApril: 'Semestriel (avril)', Yearly: 'Annuel'
};

function frDate(isoStr) {
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
}

function updatePeriodTypeWarning() {
    const box = $('#periodTypeWarning');
    const periodIds = [...computeFinalPeriods()];

    // 1) Si les périodes sélectionnées forment un intervalle continu, l'export interrogera
    // DHIS2 par plage de dates (startDate/endDate) : ça fonctionne quel que soit le periodType
    // réel des données, donc pas besoin d'avertissement.
    const range = PeriodUtils.contiguousDateRange(periodIds);
    if (range) {
        box.removeClass('period-type-warning-error').addClass('period-type-warning-info').html(`
            <i class="fas fa-info-circle"></i>
            Requête optimisée par plage de dates : <strong>${frDate(range.start)} → ${frDate(range.end)}</strong>.
            Cette méthode retrouve les données quel que soit leur type de collecte réel
            (hebdomadaire, mensuel, ...), même s'il diffère du type choisi ci-dessus.
        `).show();
        return;
    }

    // 2) Sinon (sélection non continue), l'export repassera par des identifiants de période
    // exacts : dans ce cas, le type choisi doit correspondre au type de collecte réel.
    const detected = detectDataElementPeriodTypes();
    if (detected.size === 0) { box.hide(); return; }

    const mismatched = [...detected].filter(t => !periodTypeMatches(t, appState.periodType));
    if (mismatched.length === 0) { box.hide(); return; }

    const detectedLabel = mismatched.map(t => PERIOD_TYPE_LABELS_FR[t] || t).join(', ');
    const selectedLabel = PERIOD_TYPE_LABELS_FR[appState.periodType] || appState.periodType;
    box.removeClass('period-type-warning-info').addClass('period-type-warning-error').html(`
        <i class="fas fa-exclamation-triangle"></i>
        Votre sélection de périodes n'est pas continue (des trous existent), l'export interrogera
        donc DHIS2 par identifiants de période exacts plutôt que par plage de dates. Or les
        éléments sélectionnés semblent collectés en périodicité <strong>${detectedLabel}</strong>
        (déduite du/des ensemble(s) de données utilisé(s) pour les ajouter), alors que le type
        choisi ici est <strong>${selectedLabel}</strong>. DHIS2 ne convertit pas les identifiants
        de période d'un type vers un autre : <strong>0 valeur ne sera trouvée</strong> même si les
        dates se recoupent. Sélectionnez le type <strong>${detectedLabel}</strong>, ou complétez
        votre sélection pour supprimer les trous.
    `).show();
}

function renderYearPicker() {
    const container = $('#yearPickerRow');
    container.empty();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= currentYear - 7; y--) {
        const checked = appState.fixedYears.has(y);
        container.append(`
            <label class="year-check-label">
                <input type="checkbox" class="year-check" value="${y}" ${checked ? 'checked' : ''}> ${y}
            </label>
        `);
    }
}

function renderFixedPeriodList() {
    const type = appState.periodType;
    let ids = [];
    if (type === 'Daily') {
        ids = PeriodUtils.generateDaily($('#dailyFrom').val(), $('#dailyTo').val());
    } else {
        ids = PeriodUtils.generateFixed(type, [...appState.fixedYears]);
    }
    appState.fixedListCache = ids.map(id => ({ id, label: PeriodUtils.describe(id) }));
    renderFixedPeriodListUI($('#periodSearchInput').val());
}

function renderFixedPeriodListUI(searchTerm = '') {
    const container = $('#periodListContainer');
    container.empty();

    const term = (searchTerm || '').toLowerCase().trim();
    const filtered = term
        ? appState.fixedListCache.filter(p => p.label.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))
        : appState.fixedListCache;

    if (filtered.length === 0) {
        container.append('<div style="padding: 20px; text-align: center; color: var(--text-muted);">Aucune période. Choisissez un type et une (des) année(s), ou une plage de dates.</div>');
        return;
    }

    filtered.forEach(p => {
        const isSelected = appState.selectedFixedPeriods.has(p.id);
        container.append(`
            <div class="data-element-item period-item ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                <input type="checkbox" class="period-checkbox" value="${p.id}" ${isSelected ? 'checked' : ''}>
                <div class="de-info">
                    <span class="de-name">${p.label}</span>
                    <span class="de-id">${p.id}</span>
                </div>
            </div>
        `);
    });
}

function renderRelativePeriodPanel() {
    const container = $('#relativePeriodContainer');
    container.empty();
    RELATIVE_PERIODS.forEach(group => {
        const groupEl = $(`<div class="relative-group"><h4>${group.group}</h4><div class="relative-items"></div></div>`);
        const itemsEl = groupEl.find('.relative-items');
        group.items.forEach(item => {
            const isChecked = appState.selectedRelativeKeys.has(item.key);
            itemsEl.append(`
                <label class="relative-check-label">
                    <input type="checkbox" class="relative-checkbox" value="${item.key}" ${isChecked ? 'checked' : ''}>
                    ${item.label}
                </label>
            `);
        });
        container.append(groupEl);
    });
}

function computeFinalPeriods() {
    const ids = new Set(appState.selectedFixedPeriods);
    appState.selectedRelativeKeys.forEach(key => {
        const def = RELATIVE_PERIODS.flatMap(g => g.items).find(i => i.key === key);
        if (def) def.resolve().forEach(id => ids.add(id));
    });
    return ids;
}

function updatePeriodSummary() {
    const finalPeriods = computeFinalPeriods();
    $('#periodSummary').text(`${finalPeriods.size} période(s) au total (fixes + relatives résolues)`);
    updatePeriodTypeWarning();
}

/* ==========================================================================
   STEP 4 : Aperçu et Export
   ========================================================================== */
function initStep4Events() {
    $('#previewSearchInput').on('input', function () {
        const query = $(this).val().toLowerCase();
        $('#dataPreviewTable tbody tr').each(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(query) > -1);
        });
    });

    $(document).on('change', '#selectAllPreview', function () {
        const isChecked = $(this).is(':checked');
        $('.row-checkbox:visible').prop('checked', isChecked).closest('tr').toggleClass('selected', isChecked);
    });
    $(document).on('change', '.row-checkbox', function () {
        $(this).closest('tr').toggleClass('selected', $(this).is(':checked'));
    });

    $('#exportHeaderCheck').on('change', function () { /* juste un flag lu au moment de l'export */ });

    $('#btnExportJSON').on('click', () => exportData('json'));
    $('#btnExportCSV').on('click', () => exportData('csv'));
    $('#btnExportXLSX').on('click', () => exportData('xlsx'));
}

async function runPreview() {
    $('#previewLoading').show();
    $('#previewContainer').hide();
    appState.identifiedValues = [];

    const deIds = [...appState.selectedDE.keys()];
    const ouIds = [...appState.selectedOU.keys()];
    const periodIds = [...computeFinalPeriods()];

    $('#summaryDECount').text(deIds.length);
    $('#summaryOUCount').text(ouIds.length);
    $('#summaryPeCount').text(periodIds.length);

    // Si les périodes sélectionnées forment un intervalle continu, on interroge DHIS2 par
    // startDate/endDate plutôt que par identifiants de période exacts : DHIS2 renvoie alors
    // toutes les valeurs dont la période est entièrement comprise dans l'intervalle, quel que
    // soit son propre periodType (hebdomadaire, mensuel, ...). Cela évite le piège des
    // identifiants qui ne correspondent jamais entre deux types de période différents.
    const dateRange = PeriodUtils.contiguousDateRange(periodIds);

    const deChunks = chunkArray(deIds, 50);
    const ouChunks = chunkArray(ouIds, 100);
    const peChunks = dateRange ? [null] : chunkArray(periodIds, 100);
    const totalRequests = deChunks.length * ouChunks.length * peChunks.length;
    let done = 0;

    const progressBar = $('#previewProgressBar');
    progressBar.css('width', '0%');

    try {
        for (const deChunk of deChunks) {
            for (const ouChunk of ouChunks) {
                for (const peChunk of peChunks) {
                    const params = new URLSearchParams();
                    deChunk.forEach(id => params.append('dataElement', id));
                    ouChunk.forEach(id => params.append('orgUnit', id));
                    if (dateRange) {
                        params.append('startDate', dateRange.start);
                        params.append('endDate', dateRange.end);
                    } else {
                        peChunk.forEach(id => params.append('period', id));
                    }
                    if (appState.includeChildren) params.append('children', 'true');
                    params.append('paging', 'false');

                    const response = await dhis2Session.get(`/api/dataValueSets.json?${params.toString()}`, {});
                    if (response.dataValues && response.dataValues.length > 0) {
                        appState.identifiedValues = appState.identifiedValues.concat(response.dataValues);
                    }

                    done++;
                    progressBar.css('width', `${Math.round((done / totalRequests) * 100)}%`);
                }
            }
        }

        $('#totalValuesFound').text(appState.identifiedValues.length);

        if (appState.identifiedValues.length === 0) {
            $('#previewLoading').html(`
                <div style="text-align:center; padding:20px;">
                    <i class="fas fa-info-circle" style="font-size:48px; color:var(--text-muted); margin-bottom:15px;"></i>
                    <h4>Aucune donnée trouvée</h4>
                    <p>Aucune valeur ne correspond aux critères sélectionnés (éléments, unités, périodes).</p>
                    <button class="btn btn-secondary" style="margin-top:15px;" onclick="goToStep(3)">Retourner aux périodes</button>
                </div>
            `);
            return;
        }

        await fetchPreviewMetadata();
        renderPreviewTable();
        $('#previewLoading').hide();
        $('#previewContainer').fadeIn();
    } catch (e) {
        console.error(e);
        showToast('error', 'Erreur', 'Impossible de récupérer les données : ' + e.message);
        $('#previewLoading').html('<p class="text-error">Une erreur est survenue lors de la récupération des données.</p>');
    }
}

async function fetchPreviewMetadata() {
    const cocIds = [...new Set(appState.identifiedValues.map(v => v.categoryOptionCombo).filter(Boolean))];
    const aocIds = [...new Set(appState.identifiedValues.map(v => v.attributeOptionCombo).filter(Boolean))];
    const ouIds = [...new Set(appState.identifiedValues.map(v => v.orgUnit).filter(Boolean))];

    const missingCOCs = cocIds.filter(id => !appState.cocMap.has(id));
    const missingAOCs = aocIds.filter(id => !appState.aocMap.has(id) && !appState.cocMap.has(id));
    const missingOUs = ouIds.filter(id => !appState.ouNameMap.has(id) && !appState.selectedOU.has(id));

    try {
        for (const chunk of chunkArray(missingCOCs, 100)) {
            const data = await dhis2Session.get('/api/categoryOptionCombos', { filter: `id:in:[${chunk.join(',')}]`, fields: 'id,displayName', paging: false });
            (data.categoryOptionCombos || []).forEach(c => appState.cocMap.set(c.id, c.displayName));
        }
        for (const chunk of chunkArray(missingAOCs, 100)) {
            const data = await dhis2Session.get('/api/categoryOptionCombos', { filter: `id:in:[${chunk.join(',')}]`, fields: 'id,displayName', paging: false });
            (data.categoryOptionCombos || []).forEach(c => appState.aocMap.set(c.id, c.displayName));
        }
        for (const chunk of chunkArray(missingOUs, 100)) {
            const data = await dhis2Session.get('/api/organisationUnits', { filter: `id:in:[${chunk.join(',')}]`, fields: 'id,displayName', paging: false });
            (data.organisationUnits || []).forEach(o => appState.ouNameMap.set(o.id, o.displayName));
        }
    } catch (e) {
        console.warn('Certaines métadonnées de l\'aperçu n\'ont pas pu être chargées :', e);
    }
}

function deName(id) { return (appState.selectedDE.get(id) || {}).displayName || id; }
function ouName(id) { return (appState.selectedOU.get(id) || {}).displayName || appState.ouNameMap.get(id) || id; }
function cocName(id) { return appState.cocMap.get(id) || id; }
function aocName(id) { return appState.aocMap.get(id) || appState.cocMap.get(id) || id; }

function renderPreviewTable() {
    const table = $('#dataPreviewTable');
    table.empty();

    const total = appState.identifiedValues.length;
    appState.previewCapped = total > appState.previewCap;
    const rowsToRender = appState.previewCapped ? appState.identifiedValues.slice(0, appState.previewCap) : appState.identifiedValues;

    $('#previewCapNotice').toggle(appState.previewCapped);
    if (appState.previewCapped) {
        $('#previewCapNotice').html(`<i class="fas fa-info-circle"></i> Aperçu limité aux ${appState.previewCap} premières lignes sur ${total}. La sélection ligne par ligne est désactivée pour ce volume ; l'export inclura l'intégralité des ${total} valeurs récupérées.`);
    }

    const showCheckboxes = !appState.previewCapped;

    const thead = $('<thead></thead>');
    const headerRow = $('<tr></tr>');
    headerRow.append(`<th>${showCheckboxes ? '<input type="checkbox" id="selectAllPreview" checked> ' : ''}Unité d'organisation</th>`);
    headerRow.append('<th>Elément de données</th>');
    headerRow.append('<th>Catégorie</th>');
    headerRow.append('<th>Période</th>');
    headerRow.append('<th>Valeur</th>');
    thead.append(headerRow);
    table.append(thead);

    const tbody = $('<tbody></tbody>');
    rowsToRender.forEach((v, idx) => {
        const row = $('<tr class="selected"></tr>');
        row.attr('data-idx', idx);

        let catLabel = cocName(v.categoryOptionCombo);
        const aoc = aocName(v.attributeOptionCombo);
        if (v.attributeOptionCombo && aoc.toLowerCase() !== 'default' && v.attributeOptionCombo !== v.categoryOptionCombo) {
            catLabel += ` <span style="color:#10b981;">(${aoc})</span>`;
        }

        row.append(`<td>${showCheckboxes ? `<input type="checkbox" class="row-checkbox" checked> ` : ''}${ouName(v.orgUnit)}</td>`);
        row.append(`<td>${deName(v.dataElement)}</td>`);
        row.append(`<td>${catLabel}</td>`);
        row.append(`<td>${PeriodUtils.describe(v.period)}</td>`);
        row.append(`<td style="text-align:right; font-family:monospace;">${v.value}</td>`);
        tbody.append(row);
    });
    table.append(tbody);
}

function getExportRows() {
    if (appState.previewCapped) {
        return appState.identifiedValues;
    }
    const checkedIdx = new Set();
    $('#dataPreviewTable tbody tr').each(function () {
        if ($(this).find('.row-checkbox').is(':checked')) checkedIdx.add(parseInt($(this).data('idx'), 10));
    });
    return appState.identifiedValues.filter((v, idx) => checkedIdx.has(idx));
}

function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

function toImportRow(v) {
    return [
        v.dataElement || '',
        v.period || '',
        v.orgUnit || '',
        v.categoryOptionCombo || '',
        v.attributeOptionCombo || '',
        v.value !== undefined && v.value !== null ? v.value : '',
        v.storedBy || '',
        v.lastUpdated || '',
        v.comment || '',
        v.followup === true ? 'true' : ''
    ];
}

function exportData(format) {
    const rows = getExportRows();
    if (rows.length === 0) {
        showToast('warning', 'Aucune donnée', 'Aucune ligne à exporter (vérifiez votre sélection dans le tableau).');
        return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const includeHeader = $('#exportHeaderCheck').is(':checked');

    if (format === 'json') {
        const payload = {
            dataValues: rows.map(v => {
                const item = {
                    dataElement: v.dataElement,
                    period: v.period,
                    orgUnit: v.orgUnit,
                    categoryOptionCombo: v.categoryOptionCombo,
                    attributeOptionCombo: v.attributeOptionCombo,
                    value: v.value
                };
                if (v.comment) item.comment = v.comment;
                if (v.storedBy) item.storedBy = v.storedBy;
                if (v.followup === true) item.followup = true;
                return item;
            })
        };
        downloadBlob(JSON.stringify(payload, null, 2), 'application/json', `dhis2-export-donnees_${timestamp}.json`);
        showToast('success', 'Export JSON', `${rows.length} valeur(s) exportée(s) au format dataValueSet (import DHIS2).`);
        return;
    }

    const lines = rows.map(v => toImportRow(v).map(csvEscape).join(','));
    if (includeHeader) lines.unshift(PREVIEW_HEADER_COLS.join(','));

    if (format === 'csv') {
        downloadBlob(lines.join('\r\n'), 'text/csv;charset=utf-8', `dhis2-export-donnees_${timestamp}.csv`);
        showToast('success', 'Export CSV', `${rows.length} valeur(s) exportée(s) au format CSV (import DHIS2).`);
        return;
    }

    if (format === 'xlsx') {
        const aoa = rows.map(v => toImportRow(v));
        if (includeHeader) aoa.unshift(PREVIEW_HEADER_COLS);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = PREVIEW_HEADER_COLS.map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DataValues');
        XLSX.writeFile(wb, `dhis2-export-donnees_${timestamp}.xlsx`);
        showToast('success', 'Export Excel', `${rows.length} valeur(s) exportée(s) au format XLSX (import DHIS2).`);
    }
}

function downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
