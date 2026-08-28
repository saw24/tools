/**
 * Data Migration Module for DHIS2
 * Facilitates migrating data from one Data Element to another with category mapping.
 */

const DataMigration = {
    state: {
        sourceDe: null,
        targetDe: null,
        sourceCocs: [],
        targetCocs: [],
        cocMapping: {}, // sourceCocId -> targetCocId
        selectedOus: [],
        selectedPeriods: [],
        allDataElements: []
    },

    init() {
        console.log("🚀 Data Migration Module Initialized");
        this.bindEvents();
        this.checkConnection();
        this.generatePeriods();
    },

    bindEvents() {
        // Search DEs
        $('#sourceDeSearch').on('input', (e) => this.searchDe(e.target.value, 'source'));
        $('#targetDeSearch').on('input', (e) => this.searchDe(e.target.value, 'target'));

        // Next Buttons
        $('#btnToStep2').on('click', () => this.goToStep(2));
        $('#btnToStep3').on('click', () => this.goToStep(3));
        $('#btnToStep4').on('click', () => this.goToStep(4));

        // Migration Button
        $('#btnStartMigration').on('click', () => this.startMigration());

        // OU Search
        $('#ouSearch').on('input', (e) => this.searchOus(e.target.value));

        // Listen for connection
        $(document).on('dhis2:connected', () => this.onConnected());
    },

    async checkConnection() {
        if (dhis2Session.isConnected()) {
            this.onConnected();
        }
    },

    async onConnected() {
        console.log("✅ Connected to DHIS2, loading metadata...");
        this.addLog("Connecté au serveur DHIS2. Récupération des éléments de données...", "info");
        try {
            const response = await dhis2Session.get('/api/dataElements', {
                fields: 'id,name,categoryCombo[id,name,categoryOptionCombos[id,name]]',
                paging: false
            });
            this.state.allDataElements = response.dataElements || [];
            this.renderDeResults(this.state.allDataElements.slice(0, 50), 'source');
            this.renderDeResults(this.state.allDataElements.slice(0, 50), 'target');
            this.loadOrgUnits();
        } catch (error) {
            console.error("Error loading DEs:", error);
            this.addLog("Erreur lors du chargement des éléments de données: " + error.message, "error");
        }
    },

    searchDe(query, type) {
        if (!query) {
            this.renderDeResults(this.state.allDataElements.slice(0, 50), type);
            return;
        }
        const filtered = this.state.allDataElements.filter(de =>
            de.name.toLowerCase().includes(query.toLowerCase()) ||
            de.id.toLowerCase().includes(query.toLowerCase())
        );
        this.renderDeResults(filtered.slice(0, 50), type);
    },

    renderDeResults(list, type) {
        const container = $(`#${type}DeResults`);
        container.empty();

        if (list.length === 0) {
            container.append('<div style="padding:15px; text-align:center; color:var(--text-muted);">Aucun résultat.</div>');
            return;
        }

        list.forEach(de => {
            const item = $(`
                <div class="de-item ${this.state[`${type}De`]?.id === de.id ? 'selected' : ''}" data-id="${de.id}">
                    <span class="de-name">${de.name}</span>
                    <span class="de-id">${de.id} | ${de.categoryCombo.name}</span>
                </div>
            `);

            item.on('click', () => this.selectDe(de, type));
            container.append(item);
        });
    },

    selectDe(de, type) {
        this.state[`${type}De`] = de;
        $(`#${type}DeResults .de-item`).removeClass('selected');
        $(`#${type}DeResults .de-item[data-id="${de.id}"]`).addClass('selected');

        this.updateStep1Summary();
    },

    updateStep1Summary() {
        const { sourceDe, targetDe } = this.state;
        const summary = $('#selectionSummaryText');
        const btn = $('#btnToStep2');

        if (sourceDe || targetDe) {
            $('#step1Summary').fadeIn();
            let html = '';
            if (sourceDe) html += `<div><strong>Source:</strong> ${sourceDe.name} (${sourceDe.categoryCombo.name})</div>`;
            if (targetDe) html += `<div><strong>Cible:</strong> ${targetDe.name} (${targetDe.categoryCombo.name})</div>`;
            summary.html(html);
        } else {
            $('#step1Summary').hide();
        }

        btn.prop('disabled', !(sourceDe && targetDe));
    },

    async goToStep(step) {
        $('.step-content').hide();
        $(`#step${step}`).fadeIn();

        $('.step-item').removeClass('active');
        $(`.step-item[data-step="${step}"]`).addClass('active');

        if (step === 2) this.initStep2();
        if (step === 3) this.initStep3();
        if (step === 4) this.initStep4();
    },

    initStep2() {
        const { sourceDe, targetDe } = this.state;
        const sourceCocs = sourceDe.categoryCombo.categoryOptionCombos;
        const targetCocs = targetDe.categoryCombo.categoryOptionCombos;

        this.state.sourceCocs = sourceCocs;
        this.state.targetCocs = targetCocs;

        const tbody = $('#mappingTableBody');
        tbody.empty();

        sourceCocs.forEach(sCoc => {
            // Try auto-match by name
            const match = targetCocs.find(tCoc => tCoc.name === sCoc.name) || targetCocs[0];
            this.state.cocMapping[sCoc.id] = match ? match.id : null;

            const row = $(`
                <tr>
                    <td>
                        <div style="font-weight:600;">${sCoc.name}</div>
                        <div class="coc-badge">${sCoc.id}</div>
                    </td>
                    <td class="mapping-arrow"><i class="fas fa-long-arrow-alt-right"></i></td>
                    <td>
                        <select class="mapping-select" data-source-id="${sCoc.id}">
                            ${targetCocs.map(t => `<option value="${t.id}" ${t.id === match?.id ? 'selected' : ''}>${t.name} (${t.id})</option>`).join('')}
                        </select>
                    </td>
                </tr>
            `);

            row.find('select').on('change', (e) => {
                this.state.cocMapping[sCoc.id] = e.target.value;
            });

            tbody.append(row);
        });
    },

    initStep3() {
        // Validation for step 3 button
        this.updateStep3Button();
    },

    updateStep3Button() {
        const canGo = this.state.selectedOus.length > 0 && this.state.selectedPeriods.length > 0;
        $('#btnToStep4').prop('disabled', !canGo);
    },

    async loadOrgUnits() {
        try {
            const response = await dhis2Session.get('/api/organisationUnits', {
                level: 1,
                fields: 'id,displayName,children[id,displayName]'
            });
            this.renderOuTree(response.organisationUnits, $('#ouTree'));
        } catch (error) {
            console.error("Error loading OUs:", error);
        }
    },

    renderOuTree(units, container) {
        const ul = $('<ul style="list-style:none; padding-left:15px;"></ul>');
        units.forEach(ou => {
            const li = $(`
                <li style="margin:5px 0;">
                    <div style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" value="${ou.id}" class="ou-check">
                        <span class="ou-toggle" style="width:15px;">${ou.children?.length ? '▶' : ''}</span>
                        <span class="ou-name">${ou.displayName}</span>
                    </div>
                    <div class="ou-children" style="display:none;"></div>
                </li>
            `);

            li.find('.ou-check').on('change', (e) => {
                const id = e.target.value;
                if (e.target.checked) {
                    if (!this.state.selectedOus.includes(id)) this.state.selectedOus.push(id);
                } else {
                    this.state.selectedOus = this.state.selectedOus.filter(o => o !== id);
                }
                $('#selectedOuInfo').text(`${this.state.selectedOus.length} unités sélectionnées`);
                this.updateStep3Button();
            });

            li.find('.ou-toggle, .ou-name').on('click', async (e) => {
                if (e.target.tagName === 'INPUT') return;
                const childrenArea = li.find('.ou-children');
                const toggle = li.find('.ou-toggle');

                if (childrenArea.is(':visible')) {
                    childrenArea.hide();
                    toggle.text('▶');
                } else {
                    if (childrenArea.is(':empty') && ou.children?.length) {
                        toggle.text('⌛');
                        const fullOu = await dhis2Session.get(`/api/organisationUnits/${ou.id}`, {
                            fields: 'children[id,displayName,children[id,displayName]]'
                        });
                        this.renderOuTree(fullOu.children, childrenArea);
                    }
                    childrenArea.show();
                    toggle.text('▼');
                }
            });

            ul.append(li);
        });
        container.append(ul);
    },

    generatePeriods() {
        const peList = $('#peList');
        const now = new Date();
        const year = now.getFullYear();

        // Last 3 years
        for (let y = year; y >= year - 2; y--) {
            const yearHeader = $(`<div style="padding:10px; background:rgba(255,255,255,0.05); font-weight:700; margin-top:10px;">${y}</div>`);
            peList.append(yearHeader);

            for (let m = 12; m >= 1; m--) {
                const peId = `${y}${m.toString().padStart(2, '0')}`;
                const name = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1));

                const item = $(`
                    <div style="padding:8px 15px; display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" value="${peId}" id="pe_${peId}">
                        <label for="pe_${peId}" style="cursor:pointer; flex:1;">${name}</label>
                    </div>
                `);

                item.find('input').on('change', (e) => {
                    if (e.target.checked) {
                        this.state.selectedPeriods.push(e.target.value);
                    } else {
                        this.state.selectedPeriods = this.state.selectedPeriods.filter(p => p !== e.target.value);
                    }
                    $('#selectedPeCount').text(`${this.state.selectedPeriods.length} périodes sélectionnées`);
                    this.updateStep3Button();
                });

                peList.append(item);
            }
        }
    },

    initStep4() {
        const { sourceDe, targetDe, selectedOus, selectedPeriods } = this.state;
        $('#previewStats').html(`
            <strong>Prêt à migrer:</strong><br>
            Source: ${sourceDe.name}<br>
            Cible: ${targetDe.name}<br>
            Filtres: ${selectedOus.length} unités d'org, ${selectedPeriods.length} périodes.
        `);
    },

    async startMigration() {
        const { sourceDe, targetDe, selectedOus, selectedPeriods, cocMapping } = this.state;

        $('#btnStartMigration').prop('disabled', true);
        $('#migrationProgress').fadeIn();
        this.addLog("Démarrage de la migration...", "info");

        let totalProcessed = 0;
        const totalItems = selectedOus.length * selectedPeriods.length;

        for (const ou of selectedOus) {
            for (const pe of selectedPeriods) {
                try {
                    this.addLog(`Traitement: ${ou} | ${pe}...`, "info");

                    // 1. Fetch data
                    const response = await dhis2Session.get('/api/dataValueSets', {
                        dataElement: sourceDe.id,
                        orgUnit: ou,
                        period: pe
                    });

                    const dataValues = response.dataValues || [];

                    if (dataValues.length === 0) {
                        this.addLog(`Aucune donnée pour ${ou} | ${pe}`, "warning");
                    } else {
                        // 2. Map data
                        const mappedValues = dataValues.map(dv => {
                            return {
                                ...dv,
                                dataElement: targetDe.id,
                                categoryOptionCombo: cocMapping[dv.categoryOptionCombo] || dv.categoryOptionCombo,
                                attributeOptionCombo: dv.attributeOptionCombo // keep original AO if any
                            };
                        });

                        // 3. Push data
                        const pushResult = await dhis2Session.post('/api/dataValueSets', {
                            dataValues: mappedValues
                        });

                        this.addLog(`Migration réussie pour ${ou} | ${pe} (${dataValues.length} valeurs)`, "success");
                    }
                } catch (error) {
                    this.addLog(`Échec pour ${ou} | ${pe}: ${error.message}`, "error");
                }

                totalProcessed++;
                const percent = Math.round((totalProcessed / totalItems) * 100);
                $('#migrationProgressBar').css('width', `${percent}%`);
                $('#migrationProgressText').text(`Progression : ${percent}% (${totalProcessed}/${totalItems})`);
            }
        }

        this.addLog("Migration terminée !", "success");
        $('#btnStartMigration').html('<i class="fas fa-check"></i> Migration Terminée');
        showToast('success', 'Migration terminée', 'Toutes les données ont été traitées.');
    },

    addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const log = $(`
            <div class="log-entry">
                <span class="log-time">[${time}]</span>
                <span class="log-${type}">${message}</span>
            </div>
        `);
        const container = $('#migrationLogs');
        container.append(log);
        container.scrollTop(container[0].scrollHeight);
    },

    searchOus(query) {
        // Basic tree highlight or simple search could be added here
        // For now, let's keep it simple as the tree is dynamic
    }
};

$(document).ready(() => {
    DataMigration.init();
});
