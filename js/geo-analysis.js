/**
 * Geo-Interactive Analysis Module
 * 2-Step Workflow: Chargement → Analyse
 * Full-featured CSV analysis with quality checks, hierarchical analysis,
 * chronological comparison, and interactive mapping.
 */

class GeoAnalyzer {
    constructor() {
        this.datasets = [];
        this.currentIndex = -1;
        this.compareIndex = -1;
        this.charts = { types: null, regions: null };
        this.map = null;
        this.markers = null;
        this.filters = { Pays: '', Region: '', District: '', Commune: '', Type: '' };
        this.filteredData = [];
        this.source = 'dhis2';
        this.treeLoaded = false;
        this.dhis2GroupsMap = {};
        this.tileLayers = {};
        this.editMode = false;


        this.bindEvents();
        document.addEventListener('fullscreenchange', () => this._handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this._handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this._handleFullscreenChange());
        this.initDHIS2UI();
        window.geoAnalyzer = this;
    }

    // ==================== EVENT BINDING ====================
    bindEvents() {
        const uploadArea = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        if (uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
            uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                this.loadFiles(e.dataTransfer.files);
            });
        }
        fileInput.addEventListener('change', (e) => this.loadFiles(e.target.files));

        // Step navigation
        document.getElementById('btnAnalyze').addEventListener('click', () => this.goToStep2());
        document.getElementById('btnBackToStep1').addEventListener('click', () => this.goToStep1());

        // Sauvegarde des coordonnées Edit Modal
        const btnSave = document.getElementById('btnSaveCoords');
        if (btnSave) {
            btnSave.onclick = () => this.saveCoordinatesToDHIS2();
        }

        // Toggle mode édition carte
        const btnEditMode = document.getElementById('btnEditMode');
        if (btnEditMode) {
            btnEditMode.addEventListener('click', () => {
                this.editMode = !this.editMode;
                btnEditMode.innerHTML = this.editMode
                    ? '<i class="fas fa-pencil-alt"></i> Mode édition ON'
                    : '<i class="fas fa-pencil-alt"></i> Mode édition OFF';
                btnEditMode.style.background = this.editMode
                    ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                    : 'rgba(255,255,255,0.05)';
                btnEditMode.style.color = this.editMode ? 'white' : '';
                btnEditMode.style.borderColor = this.editMode ? 'transparent' : '';
                this.renderMapMarkers();
                if (this.editMode) {
                    this.showToast('info', 'Mode édition activé', 'Glissez un marqueur pour modifier ses coordonnées.');
                }
            });
        }

        // Tabs
        document.querySelectorAll('.tab-item').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Filters
        ['Pays', 'Region', 'District', 'Commune', 'Type'].forEach(key => {
            document.getElementById(`filter${key}`).addEventListener('change', (e) => {
                this.filters[key] = e.target.value;
                this.onFilterChange(key);
            });
        });
        document.getElementById('btnResetFilters').addEventListener('click', () => this.resetFilters());

        // Geographic level selector
        document.getElementById('geoLevel').addEventListener('change', () => this.renderGeoTable());

        // Compare toggle
        document.getElementById('chkCompare').addEventListener('change', (e) => {
            if (e.target.checked && this.datasets.length > 1) {
                this.compareIndex = this.currentIndex > 0 ? this.currentIndex - 1 : 1;
            } else {
                this.compareIndex = -1;
            }
            this.renderTimeline();
            this.refreshDashboard();
        });

        // Export buttons
        document.getElementById('btnExportErrors').addEventListener('click', () => this.exportCSV('errors'));
        document.getElementById('btnExportAll').addEventListener('click', () => this.exportCSV('all'));

        // Show names toggle
        document.getElementById('chkShowNames').addEventListener('change', () => this.renderMapMarkers());

        // Clusters toggle
        document.getElementById('chkClusters').addEventListener('change', () => this.renderMapMarkers());

        // Fullscreen toggle
        // Fullscreen toggle
        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());

        // Basemap change
        const selBasemap = document.getElementById('selBasemap');
        if (selBasemap) {
            selBasemap.addEventListener('change', (e) => this.switchBasemap(e.target.value));
        }

        // Global Map Search
        const mapSearchInput = document.getElementById('mapSearchInput');
        if (mapSearchInput) {
            let searchTimeout;
            mapSearchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                if (query.length < 3) {
                    document.getElementById('searchSuggestions').style.display = 'none';
                    return;
                }
                searchTimeout = setTimeout(() => this.searchLocation(query), 500);
            });

            // Close suggestions on outside click
            document.addEventListener('click', (e) => {
                const suggestions = document.getElementById('searchSuggestions');
                if (!mapSearchInput.contains(e.target) && !suggestions.contains(e.target)) {
                    suggestions.style.display = 'none';
                }
            });
        }

        // Select All Groups link
        const linkSelectAll = document.getElementById('linkSelectAllGroups');
        if (linkSelectAll) {
            linkSelectAll.addEventListener('click', (e) => {
                e.preventDefault();
                const checks = document.querySelectorAll('#dhis2GroupsChecklist input[type="checkbox"]');
                const allChecked = Array.from(checks).every(c => c.checked);
                checks.forEach(c => c.checked = !allChecked);
                linkSelectAll.textContent = allChecked ? 'Tout cocher' : 'Tout décocher';
            });
        }

        // Source selection (Step 1)
        document.querySelectorAll('.source-tab').forEach(btn => {
            btn.addEventListener('click', () => this.switchSource(btn.dataset.source));
        });

        // DHIS2 Connection
        document.getElementById('btnConnectDHIS2').addEventListener('click', () => this.connectDHIS2());

        // Change account toggle
        document.getElementById('btnChangeAccount').addEventListener('click', () => {
            document.getElementById('dhis2LoginForm').style.display = 'grid';
            document.getElementById('dhis2StatusCard').style.display = 'none';
        });

        // Tree interactions (Event Delegation)
        const treeContainer = document.getElementById('orgUnitTreeContainer');
        treeContainer.addEventListener('click', (e) => {
            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                e.stopPropagation();
                this.handleTreeToggle(toggle);
                return;
            }

            const nodeContent = e.target.closest('.tree-node-content');
            if (nodeContent) {
                this.handleTreeNodeSelect(nodeContent);
            }
        });
    }

    handleTreeToggle(toggle) {
        const li = toggle.closest('li');
        const ul = li.querySelector('ul');
        const icon = toggle.querySelector('i');
        const id = li.dataset.id;

        if (ul) {
            const isHidden = ul.style.display === 'none';
            ul.style.display = isHidden ? 'block' : 'none';
            icon.className = isHidden ? 'fas fa-caret-down' : 'fas fa-caret-right';
        } else {
            this.loadTreeChildren(id, li);
            icon.className = 'fas fa-caret-down';
        }
    }

    handleTreeNodeSelect(nodeContent) {
        document.querySelectorAll('.tree-node-content').forEach(el => el.classList.remove('selected'));
        nodeContent.classList.add('selected');
        const id = nodeContent.parentElement.dataset.id;
        const path = nodeContent.parentElement.dataset.path;
        const name = nodeContent.querySelector('.node-text').innerText;
        document.getElementById('parentIdInput').value = id;
        document.getElementById('parentPathInput').value = path;
        document.getElementById('parentNameDisplay').value = name;
    }

    initDHIS2UI() {
        if (dhis2Session.isConnected()) {
            this.updateDHIS2UI(true);
            this.loadTree();
            this.loadDHIS2Groups();
        }
    }

    async loadDHIS2Groups() {
        const container = document.getElementById('dhis2GroupsChecklist');
        const validationSelect = document.getElementById('dhis2ValidationGroup');
        if (!container) return;

        try {
            const data = await dhis2Session.get('/api/organisationUnitGroups.json', {
                fields: 'id,displayName',
                paging: false
            });

            if (data.organisationUnitGroups) {
                const groups = data.organisationUnitGroups.sort((a, b) => a.displayName.localeCompare(b.displayName));

                container.innerHTML = '';
                validationSelect.innerHTML = '<option value="">Aucun (Bornes fixes)</option>';

                groups.forEach(group => {
                    this.dhis2GroupsMap[group.id] = group.displayName;

                    // Group Checklist
                    const item = document.createElement('div');
                    item.className = 'checkbox-item';
                    item.innerHTML = `
                        <input type="checkbox" id="grp-${group.id}" value="${group.id}">
                        <label for="grp-${group.id}">${group.displayName}</label>
                    `;
                    container.appendChild(item);

                    // Validation Select
                    const optV = document.createElement('option');
                    optV.value = group.id;
                    optV.textContent = group.displayName;
                    validationSelect.appendChild(optV);
                });
            }
        } catch (e) {
            console.error('Error loading DHIS2 groups:', e);
            container.innerHTML = '<div style="padding:10px; color:#ef4444; font-size:12px;">Erreur de chargement des groupes</div>';
            validationSelect.innerHTML = '<option value="">Erreur</option>';
        }
    }

    updateDHIS2UI(isConnected) {
        const statusCard = document.getElementById('dhis2StatusCard');
        const loginForm = document.getElementById('dhis2LoginForm');
        const config = dhis2Session.getConfig();

        if (isConnected && config) {
            statusCard.style.display = 'block';
            loginForm.style.display = 'none';
            document.getElementById('dhis2Url').value = config.url;
            document.getElementById('dhis2User').value = config.username;
            document.getElementById('dhis2ConnectionInfo').innerText = `Instance: ${config.url} | Utilisateur: ${config.username}`;
        } else {
            statusCard.style.display = 'none';
            loginForm.style.display = 'grid';
        }
    }

    async loadTree() {
        if (this.treeLoaded) return;
        const container = document.getElementById('orgUnitTreeContainer');
        try {
            const data = await dhis2Session.get('/api/organisationUnits.json', {
                level: 1,
                fields: 'id,displayName,path,children::isNotEmpty',
                paging: false
            });

            container.innerHTML = '';
            const rootUl = document.createElement('ul');
            rootUl.className = 'tree-ul root-ul';

            data.organisationUnits.sort((a, b) => a.displayName.localeCompare(b.displayName));
            data.organisationUnits.forEach(ou => {
                rootUl.appendChild(this.renderTreeNode(ou));
            });
            container.appendChild(rootUl);
            this.treeLoaded = true;
        } catch (e) {
            console.error('Tree root error:', e);
            container.innerHTML = `<p style="color:#ef4444; padding:10px; font-size:12px;">Erreur lors du chargement de l'arbre: ${e.message}</p>`;
        }
    }

    async loadTreeChildren(parentId, li) {
        try {
            const data = await dhis2Session.get(`/api/organisationUnits/${parentId}.json`, {
                fields: 'children[id,displayName,path,children::isNotEmpty]'
            });
            const children = data.children;
            if (children && children.length > 0) {
                children.sort((a, b) => a.displayName.localeCompare(b.displayName));
                const ul = document.createElement('ul');
                ul.className = 'tree-ul';
                children.forEach(child => ul.appendChild(this.renderTreeNode(child)));
                li.appendChild(ul);
            } else {
                const toggle = li.querySelector('.tree-toggle');
                if (toggle) toggle.style.opacity = '0.2';
            }
        } catch (e) {
            console.error('Tree children error:', e);
            this.showToast('error', 'Erreur Tree', `Impossible de charger les sous-niveaux: ${e.message}`);
        }
    }

    renderTreeNode(ou) {
        const hasChildren = ou.children === true || (Array.isArray(ou.children) && ou.children.length > 0) || ou.children === undefined;
        const li = document.createElement('li');
        li.dataset.id = ou.id;
        li.dataset.path = ou.path;

        const toggleHtml = !hasChildren ?
            '<span class="tree-toggle" style="opacity:0"></span>' :
            '<span class="tree-toggle"><i class="fas fa-caret-right"></i></span>';

        li.innerHTML = `
            <div class="tree-node-content">
                ${toggleHtml}
                <i class="fas ${hasChildren ? 'fa-folder' : 'fa-circle'} tree-icon" style="font-size: ${hasChildren ? '14px' : '8px'}"></i>
                <span class="node-text">${ou.displayName}</span>
            </div>
        `;
        return li;
    }

    switchSource(source) {
        this.source = source;
        document.querySelectorAll('.source-tab').forEach(b => b.classList.toggle('active', b.dataset.source === source));
        document.getElementById('sourceFileContent').style.display = source === 'file' ? 'block' : 'none';
        document.getElementById('sourceDHIS2Content').style.display = source === 'dhis2' ? 'block' : 'none';

        if (source === 'dhis2' && dhis2Session.isConnected()) {
            this.updateDHIS2UI(true);
            this.loadTree();
            this.loadDHIS2Groups();
        }

        // Disable analyze button if switching to dhis2 and not connected
        if (source === 'file') {
            document.getElementById('btnAnalyze').disabled = this.datasets.length === 0;
        } else {
            const hasDHIS2 = this.datasets.some(d => d.source === 'dhis2');
            document.getElementById('btnAnalyze').disabled = !hasDHIS2;
        }
    }

    async connectDHIS2() {
        const isLoginFormVisible = document.getElementById('dhis2LoginForm').style.display !== 'none';

        const url = document.getElementById('dhis2Url').value;
        const user = document.getElementById('dhis2User').value;
        const pass = document.getElementById('dhis2Password').value;

        // Reading groups from checkboxes
        const checks = document.querySelectorAll('#dhis2GroupsChecklist input[type="checkbox"]:checked');
        const selectedGroupIds = Array.from(checks).map(c => c.value);

        const validationGroupId = document.getElementById('dhis2ValidationGroup').value;
        const parentId = document.getElementById('parentIdInput').value;
        const parentPath = document.getElementById('parentPathInput').value;
        const includeDescendants = document.getElementById('includeDescendantsCheck').checked;

        if (isLoginFormVisible && (!url || !user)) {
            this.showToast('error', 'Erreur de connexion', 'Veuillez remplir l\'URL et l\'utilisateur');
            return;
        }

        if (!parentId) {
            this.showToast('warning', 'Unité requise', 'Veuillez sélectionner une unité dans l\'arbre');
            return;
        }

        const btn = document.getElementById('btnConnectDHIS2');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synchronisation...';

        try {
            // Si le formulaire est visible, on re-init la session
            if (isLoginFormVisible && pass) {
                await dhis2Session.initialize(url, user, pass);
            }

            const conn = await dhis2Session.testConnection();
            if (!conn.success) throw new Error(conn.error);

            this.showToast('success', 'Session Active', `Instance: ${url}`);
            this.updateDHIS2UI(true);
            this.loadTree();
            this.loadDHIS2Groups();

            // Charger les données
            await this.loadFromDHIS2(parentId, parentPath, selectedGroupIds, validationGroupId, includeDescendants);

        } catch (err) {
            this.showToast('error', 'Échec DHIS2', err.message);
            this.updateDHIS2UI(false);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    async loadFromDHIS2(parentId, parentPath, groupIds, validationGroupId, includeDescendants) {
        this.showToast('info', 'Récupération DHIS2', `Chargement progressif des structures...`);

        const btn = document.getElementById('btnConnectDHIS2');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extraction...';

        try {
            let allUnits = [];
            const pageSize = 250;

            // 1. Extraction Séquentielle par Groupe
            const targetGroupIds = groupIds && groupIds.length > 0 ? groupIds : [null];

            for (const gid of targetGroupIds) {
                let page = 1;
                let hasMore = true;
                const groupName = gid ? (this.dhis2GroupsMap[gid] || gid) : 'Toutes';

                while (hasMore) {
                    // Silencing intermediate page toasts for a cleaner UI
                    // this.showToast('info', 'Extraction', `Groupe: ${groupName} - Page ${page}...`);

                    const params = [
                        ['fields', 'id,displayName,geometry,ancestors[id,displayName,level],organisationUnitGroups[id,displayName]'],
                        ['paging', 'true'],
                        ['pageSize', pageSize],
                        ['page', page]
                    ];

                    if (includeDescendants) {
                        params.push(['descendants', 'true']);
                        params.push(['root', parentId]);
                        if (parentPath) params.push(['filter', `path:like:${parentPath}`]);
                        if (gid) params.push(['filter', `organisationUnitGroups.id:eq:${gid}`]);
                    } else {
                        // Unité seule : une seule page
                        hasMore = false;
                    }

                    const response = await dhis2Session.get(
                        includeDescendants ? '/api/organisationUnits.json' : `/api/organisationUnits/${parentId}.json`,
                        params
                    );

                    const units = includeDescendants ? (response.organisationUnits || []) : (response ? [response] : []);
                    allUnits = allUnits.concat(units);

                    // Vérifier s'il y a une page suivante
                    if (includeDescendants && response.pager && response.pager.page < response.pager.pageCount) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                }
            }

            // Dé-doublonner au cas où une unité appartient à plusieurs groupes selectionnés
            const uniqueUnitsMap = new Map();
            allUnits.forEach(u => uniqueUnitsMap.set(u.id, u));
            const units = Array.from(uniqueUnitsMap.values());

            // 2. Charger les polygones de validation
            let validationPolygons = [];
            if (validationGroupId) {
                this.showToast('info', 'Validation', 'Contours de référence...');
                const vParams = [
                    ['fields', 'id,displayName,geometry'],
                    ['paging', 'false'],
                    ['filter', `organisationUnitGroups.id:eq:${validationGroupId}`]
                ];
                if (parentPath && includeDescendants) {
                    vParams.push(['filter', `path:like:${parentPath}`]);
                }
                const vResponse = await dhis2Session.get('/api/organisationUnits.json', vParams);
                validationPolygons = (vResponse.organisationUnits || []).filter(ou =>
                    ou.geometry && (ou.geometry.type === 'Polygon' || ou.geometry.type === 'MultiPolygon')
                );
            }

            if (units.length === 0) throw new Error('Aucune unité d\'organisation trouvée.');

            // Préparer les noms de types pour le mapping
            const groupMetadata = groupIds.reduce((acc, id) => {
                acc[id] = this.dhis2GroupsMap[id];
                return acc;
            }, {});

            const transformed = this.transformDHIS2ToJSON(units, groupMetadata);
            const processed = this.processData(transformed, validationPolygons);

            // Remplacer l'ancien dataset DHIS2 si existant, sinon ajouter
            const dhis2DatasetIndex = this.datasets.findIndex(d => d.source === 'dhis2');
            const dataset = {
                name: `DHIS2 - ${document.getElementById('parentNameDisplay').value}${includeDescendants ? ' (Descendants)' : ''}`,
                date: Date.now(),
                source: 'dhis2',
                raw: transformed,
                validationPolygons: validationPolygons,
                ...processed
            };

            if (dhis2DatasetIndex >= 0) {
                this.datasets[dhis2DatasetIndex] = dataset;
            } else {
                this.datasets.push(dataset);
            }

            this.showToast('success', 'DHIS2 synchronisé', `${processed.stats.total} structures récupérées`);
            this.renderLoadedFiles();
            document.getElementById('btnAnalyze').disabled = false;

        } catch (err) {
            this.showToast('error', 'Erreur chargement', err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    transformDHIS2ToJSON(ous, groupMetadata = {}) {
        return ous.map(ou => {
            // Déterminer le type basé sur le groupe d'appartenance
            let typeLabel = 'Unité DHIS2';
            if (ou.organisationUnitGroups && ou.organisationUnitGroups.length > 0) {
                const matchedGroups = ou.organisationUnitGroups
                    .filter(g => groupMetadata[g.id])
                    .map(g => groupMetadata[g.id]);
                if (matchedGroups.length > 0) typeLabel = matchedGroups.join(', ');
                else typeLabel = ou.organisationUnitGroups[0].displayName;
            }

            const row = {
                Structure: ou.displayName,
                Type: typeLabel,
                Pays: 'Niger',
                Region: '',
                District: '',
                Commune: '',
                Aire: '',
                Longitude: '',
                Latitude: '',
                _id_dhis2: ou.id
            };

            // Extraire la hiérarchie des ancêtres
            const ancestors = ou.ancestors || [];
            ancestors.forEach(anc => {
                const lvl = parseInt(anc.level);
                if (lvl === 1) row.Pays = anc.displayName;
                if (lvl === 2) row.Region = anc.displayName;
                if (lvl === 3) row.District = anc.displayName;
                if (lvl === 4) row.Commune = anc.displayName;
                if (lvl === 5) row.Aire = anc.displayName;
            });

            // Si l'unité elle-même est à un niveau spécifique
            const selfLvl = ancestors.length + 1;
            if (selfLvl === 2) row.Region = ou.displayName;
            if (selfLvl === 3) row.District = ou.displayName;
            if (selfLvl === 4) row.Commune = ou.displayName;
            if (selfLvl === 5) row.Aire = ou.displayName;

            // Coordonnées
            if (ou.geometry && ou.geometry.type === 'Point') {
                row.Longitude = ou.geometry.coordinates[0];
                row.Latitude = ou.geometry.coordinates[1];
            }

            return row;
        });
    }

    // ==================== STEP NAVIGATION ====================
    goToStep2() {
        if (this.datasets.length === 0) return;

        // Sort datasets chronologically
        this.datasets.sort((a, b) => a.date - b.date);
        this.currentIndex = this.datasets.length - 1;

        if (this.datasets.length > 1) {
            this.compareIndex = this.currentIndex - 1;
            document.getElementById('chkCompare').checked = true;
            document.getElementById('timelineBar').style.display = 'flex';
        }

        // Update step indicator
        this.setStepActive(2);

        // Show/hide sections
        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = '';

        // Build dashboard
        this.renderTimeline();
        this.populateAllFilters();
        this.refreshDashboard();

        this.showToast('success', 'Analyse terminée', `${this.getCurrentDS().stats.total} structures analysées avec succès.`);
    }

    goToStep1() {
        this.setStepActive(1);
        document.getElementById('step2').style.display = 'none';
        document.getElementById('step1').style.display = '';
    }

    setStepActive(activeStep) {
        document.querySelectorAll('.step-item').forEach(el => {
            const step = parseInt(el.dataset.step);
            el.classList.remove('active', 'completed');
            if (step < activeStep) el.classList.add('completed');
            else if (step === activeStep) el.classList.add('active');
        });
    }

    // ==================== FILE LOADING ====================
    async loadFiles(files) {
        const fileList = Array.from(files);
        for (const file of fileList) {
            await this.parseFile(file);
        }
        this.renderLoadedFiles();
        document.getElementById('btnAnalyze').disabled = this.datasets.length === 0;
    }

    parseFile(file) {
        const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

        return new Promise((resolve) => {
            if (isExcel) {
                this.parseExcel(file).then(data => {
                    const processed = this.processData(data);
                    this.datasets.push({
                        name: file.name,
                        date: this.extractDate(file.name),
                        source: 'file',
                        raw: data,
                        ...processed
                    });
                    this.showToast('success', 'Fichier Excel chargé', `${file.name} — ${processed.stats.total} structures`);
                    resolve();
                }).catch(err => {
                    this.showToast('error', 'Erreur Excel', `Impossible de lire ${file.name}`);
                    resolve();
                });
            } else {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: 'UTF-8',
                    complete: (results) => {
                        const data = this.normalizeRows(results.data);
                        const processed = this.processData(data);
                        this.datasets.push({
                            name: file.name,
                            date: this.extractDate(file.name),
                            source: 'file',
                            raw: results.data,
                            ...processed
                        });
                        this.showToast('success', 'Fichier CSV chargé', `${file.name} — ${processed.stats.total} structures`);
                        resolve();
                    }
                });
            }
        });
    }

    normalizeRows(json) {
        return json.map(row => {
            const norm = {};
            for (let originalKey in row) {
                const val = row[originalKey];
                const k = originalKey.toString().trim()
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '');

                // Mapping flou pour les colonnes critiques
                if (k === 'latitude' || k === 'lat') norm['Latitude'] = val;
                else if (k === 'longitude' || k === 'lon' || k === 'long') norm['Longitude'] = val;
                else if (k === 'pays') norm['Pays'] = val;
                else if (k === 'region' || k === 'regions') norm['Region'] = val;
                else if (k === 'district' || k === 'districts') norm['District'] = val;
                else if (k === 'commune' || k === 'communes') norm['Commune'] = val;
                else if (k === 'aire' || k === 'aires') norm['Aire'] = val;
                else if (k === 'structure' || k === 'nom' || k === 'nomdestructure' || k === 'organisationunit') norm['Structure'] = val;
                else if (k === 'type' || k === 'typedestructure') norm['Type'] = val;
                else norm[originalKey] = val;
            }
            return norm;
        });
    }

    parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Heuristique : Trouver la feuille qui a le plus grand nombre de lignes remplies
                    let bestSheetName = workbook.SheetNames[0];
                    let maxRows = -1;

                    workbook.SheetNames.forEach(name => {
                        const sheet = workbook.Sheets[name];
                        const ref = sheet['!ref'];
                        if (ref) {
                            const range = XLSX.utils.decode_range(ref);
                            const rowCount = range.e.r - range.s.r;
                            if (rowCount > maxRows) {
                                maxRows = rowCount;
                                bestSheetName = name;
                            }
                        }
                    });

                    const worksheet = workbook.Sheets[bestSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, {
                        defval: "",
                        raw: true,
                        blankrows: false
                    });

                    // Normalisation intelligente des colonnes
                    const normalized = this.normalizeRows(json);

                    resolve(normalized);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    extractDate(filename) {
        const m = filename.match(/(\d{4})[-_](\d{2})/);
        if (m) return new Date(m[1], m[2] - 1).getTime();
        const months = { jan: 0, fev: 1, feb: 1, mar: 2, avr: 3, apr: 3, mai: 4, may: 4, jun: 5, jui: 6, jul: 6, aou: 7, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const m2 = filename.toLowerCase().match(/(jan|fev|feb|mar|avr|apr|mai|may|jun|jui|jul|aou|aug|sep|oct|nov|dec)\w*[-_\s]?(\d{4})/);
        if (m2) return new Date(parseInt(m2[2]), months[m2[1]]).getTime();
        return Date.now();
    }

    // ==================== DATA PROCESSING ====================
    // Bornes géographiques par région du Niger (resserrées pour plus de précision)
    static BOUNDS_COUNTRY = { latMin: 11.69, latMax: 23.53, lonMin: 0.16, lonMax: 15.99 };
    static BOUNDS_REGION = {
        'agadez': { latMin: 15.1, latMax: 23.5, lonMin: 4.8, lonMax: 15.9 },
        'diffa': { latMin: 13.1, latMax: 18.6, lonMin: 10.5, lonMax: 15.8 },
        'dosso': { latMin: 11.7, latMax: 14.1, lonMin: 2.1, lonMax: 4.6 },
        'maradi': { latMin: 12.9, latMax: 15.4, lonMin: 6.2, lonMax: 8.5 },
        'niamey': { latMin: 13.4, latMax: 13.6, lonMin: 2.0, lonMax: 2.2 },
        'tahoua': { latMin: 13.4, latMax: 20.2, lonMin: 3.8, lonMax: 6.9 },
        'tillaberi': { latMin: 11.9, latMax: 15.6, lonMin: 0.2, lonMax: 3.5 },
        'tillabéri': { latMin: 11.9, latMax: 15.6, lonMin: 0.2, lonMax: 3.5 },
        'zinder': { latMin: 12.8, latMax: 17.5, lonMin: 7.7, lonMax: 11.8 },
    };

    getBoundsForRegion(regionName) {
        if (!regionName) return GeoAnalyzer.BOUNDS_COUNTRY;
        const key = regionName.toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // retire les accents
        return GeoAnalyzer.BOUNDS_REGION[key]
            || GeoAnalyzer.BOUNDS_REGION[regionName.toLowerCase().trim()]
            || GeoAnalyzer.BOUNDS_COUNTRY;
    }

    processData(rows, referencePolygons = []) {
        const stats = { total: 0, geolocated: 0, missing: 0, invalid: 0, duplicates: 0 };
        const errors = [];
        const coordMap = new Map();
        const processed = [];

        rows.forEach((row) => {
            const lat = parseFloat(row.Latitude);
            const lon = parseFloat(row.Longitude);
            const hasCoords = !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);

            let status = 'ok';
            let errorMsg = null;

            stats.total++;

            if (!hasCoords) {
                stats.missing++;
                status = 'missing';
                errorMsg = 'Coordonnées manquantes';
            } else {
                // 1. Validation PAYS (Niger)
                const C = GeoAnalyzer.BOUNDS_COUNTRY;
                const isOutOfCountry = lat < C.latMin || lat > C.latMax || lon < C.lonMin || lon > C.lonMax;

                // 2. Validation RÉGION / CONTENEUR
                let isOutOfRegion = false;
                let regionLabel = row.Region || 'du Niger (Pays)';

                if (referencePolygons && referencePolygons.length > 0) {
                    // Validation dynamique par Polygone - CORRECTION : Strict matching par région
                    const point = [lon, lat];
                    const structureRegion = (row.Region || "").trim().toLowerCase();

                    // On cherche le polygone qui correspond à la région de la structure
                    const regionPoly = referencePolygons.find(poly => {
                        const polyName = (poly.displayName || "").trim().toLowerCase();
                        return polyName === structureRegion ||
                            polyName.includes(structureRegion) ||
                            structureRegion.includes(polyName);
                    });

                    if (regionPoly) {
                        const isInside = regionPoly.geometry.type === 'Polygon' ?
                            this.isPointInPolygon(point, regionPoly.geometry.coordinates) :
                            regionPoly.geometry.coordinates.some(p => this.isPointInPolygon(point, p));

                        if (!isInside) {
                            isOutOfRegion = true;
                            errorMsg = `Hors des limites réelles de la région ${row.Region}`;
                        }
                    } else {
                        // Pas de polygone spécifique trouvé pour cette région parmi ceux chargés
                        // On vérifie si le point est dans AU MOINS UN polygone chargé (fallback large)
                        const isInsideAny = referencePolygons.some(poly => {
                            if (poly.geometry.type === 'Polygon') {
                                return this.isPointInPolygon(point, poly.geometry.coordinates);
                            } else if (poly.geometry.type === 'MultiPolygon') {
                                return poly.geometry.coordinates.some(p => this.isPointInPolygon(point, p));
                            }
                            return false;
                        });

                        if (!isInsideAny) {
                            isOutOfRegion = true;
                            errorMsg = `Hors des limites des conteneurs DHIS2 sélectionnés`;
                        }
                    }
                } else {
                    // Fallback: Validation par bornes rectangulaires fixes
                    const B = this.getBoundsForRegion(row.Region);
                    isOutOfRegion = lat < B.latMin || lat > B.latMax || lon < B.lonMin || lon > B.lonMax;
                    if (isOutOfRegion) {
                        errorMsg = `Hors des bornes de la région ${regionLabel}`;
                    }
                }

                if (isOutOfCountry) {
                    stats.invalid++;
                    status = 'invalid';
                    errorMsg = `Hors des frontières du Niger (Lat: ${lat}, Lon: ${lon})`;
                } else if (isOutOfRegion) {
                    stats.invalid++;
                    status = 'invalid';
                    // errorMsg déjà défini plus haut
                } else {
                    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
                    const count = coordMap.get(key) || 0;
                    coordMap.set(key, count + 1);
                    if (count > 0) {
                        stats.duplicates++;
                        status = 'duplicate';
                        errorMsg = 'Coordonnées dupliquées (doublet geographique)';
                    } else {
                        stats.geolocated++;
                    }
                }
            }

            const entry = {
                ...row,
                _lat: lat, _lon: lon, _hasCoords: hasCoords,
                _status: status, _error: errorMsg,
                _id: `${(row.Region || '')}|${(row.District || '')}|${(row.Structure || '')}`.toLowerCase()
            };

            processed.push(entry);
            if (errorMsg) errors.push(entry);
        });

        return { data: processed, errors, stats };
    }

    // ==================== SPATIAL UTILS ====================
    /**
     * Ray Casting Algorithm for Point-in-Polygon validation
     * Supports both arrays of [lon, lat] and GeoJSON polygons
     */
    isPointInPolygon(point, polygon) {
        // point: [lon, lat]
        // polygon: [[[lon, lat], ...]] (coordinates of a Polygon)
        const x = point[0], y = point[1];
        let inside = false;

        // On itère sur tous les anneaux du polygone (le premier est l'extérieur)
        for (let i = 0; i < polygon.length; i++) {
            const ring = polygon[i];
            for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
                const xi = ring[j][0], yi = ring[j][1];
                const xj = ring[k][0], yj = ring[k][1];

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
        }
        return inside;
    }

    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        };

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('hide');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    // ==================== EDIT COORDINATES ====================
    openEditModal(id, name, lat, lon) {
        document.getElementById('editStructId').value = id;
        document.getElementById('modalStructureName').textContent = name;
        document.getElementById('editLat').value = lat || '';
        document.getElementById('editLon').value = lon || '';
        document.getElementById('editCoordsModal').style.display = 'flex';
    }

    async saveCoordinatesToDHIS2() {
        const id = document.getElementById('editStructId').value;
        const lat = parseFloat(document.getElementById('editLat').value);
        const lon = parseFloat(document.getElementById('editLon').value);
        const btn = document.getElementById('btnSaveCoords');

        if (isNaN(lat) || isNaN(lon)) {
            this.showToast('error', 'Données invalides', 'Veuillez saisir des coordonnées valides.');
            return;
        }

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

        try {
            // 1. Récupérer d'abord l'objet complet pour conserver les champs obligatoires (name, shortName, openingDate)
            // car DHIS2 peut les exiger même lors d'une mise à jour de géométrie seule sur certaines versions.
            const currentOU = await dhis2Session.get(`/api/organisationUnits/${id}`, {
                fields: 'id,name,shortName,openingDate,parent'
            });

            if (!currentOU || !currentOU.id) {
                throw new Error("Impossible de récupérer les détails de la structure depuis DHIS2.");
            }

            // 2. Mettre à jour la géométrie sur l'objet récupéré
            currentOU.geometry = {
                type: "Point",
                coordinates: [lon, lat]
            };

            // 3. Envoyer la mise à jour via PUT (remplacement complet de l'objet avec les données préservées)
            await dhis2Session.put(`/api/organisationUnits/${id}`, currentOU);

            // 4. Mettre à jour localement les datasets pour refléter le changement sans recharger tout
            this.datasets.forEach(ds => {
                ds.data.forEach(row => {
                    if (row._id_dhis2 === id) {
                        row.Latitude = lat;
                        row.Longitude = lon;
                        row._lat = lat;
                        row._lon = lon;
                        row._hasCoords = true;
                        // On pourrait recalculer le status ici si besoin,
                        // mais simplifions en disant que l'utilisateur sait ce qu'il fait.
                        row._status = 'ok';
                        row._error = null;
                    }
                });

                // Recalculer les stats globales du dataset si nécessaire
                const stats = this.computeStats(ds.data);
                ds.stats = { ...ds.stats, ...stats };
            });

            this.showToast('success', 'Enregistré', 'Coordonnées mises à jour avec succès dans DHIS2.');
            document.getElementById('editCoordsModal').style.display = 'none';

            // 3. Rafraîchir l'interface
            this.refreshDashboard();

        } catch (err) {
            console.error('Error saving coordinates:', err);
            this.showToast('error', 'Erreur de sauvegarde', err.message || 'Impossible de sauvegarder dans DHIS2.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // ==================== FILE LIST RENDERING ====================
    renderLoadedFiles() {
        const container = document.getElementById('loadedFiles');
        container.innerHTML = '';
        this.datasets.forEach((ds, idx) => {
            const el = document.createElement('div');
            el.className = 'loaded-file-item';

            let icon = 'fa-file-csv';
            if (ds.source === 'dhis2') icon = 'fa-plug';
            else if (ds.name.toLowerCase().endsWith('.xlsx') || ds.name.toLowerCase().endsWith('.xls')) icon = 'fa-file-excel';

            el.innerHTML = `
                <i class="fas ${icon}"></i>
                <div>
                    <div class="file-name">${ds.name}</div>
                    <div class="file-rows">${ds.stats.total} structures</div>
                </div>
                <button class="btn-remove" data-idx="${idx}" title="Retirer ce fichier"><i class="fas fa-times"></i></button>
            `;
            el.querySelector('.btn-remove').addEventListener('click', () => {
                const removedDS = this.datasets[idx];
                this.datasets.splice(idx, 1);
                this.renderLoadedFiles();

                if (removedDS.source === 'dhis2') {
                    // Si on retire DHIS2, on peut vouloir rafraîchir l'UI de connexion
                    document.querySelector('.dhis2-form').style.display = 'grid';
                    document.getElementById('dhis2StatusCard').style.display = 'none';
                }

                document.getElementById('btnAnalyze').disabled = this.datasets.length === 0;
            });
            container.appendChild(el);
        });
    }

    getCurrentDS() { return this.datasets[this.currentIndex]; }
    getCompareDS() { return this.compareIndex >= 0 ? this.datasets[this.compareIndex] : null; }

    // ==================== TIMELINE ====================
    renderTimeline() {
        const container = document.getElementById('timelineChips');
        container.innerHTML = '';
        this.datasets.forEach((ds, idx) => {
            const chip = document.createElement('button');
            let cls = 'timeline-chip';
            if (idx === this.currentIndex) cls += ' active';
            else if (idx === this.compareIndex) cls += ' compare';
            chip.className = cls;
            chip.textContent = ds.name.replace(/\.csv$/i, '').substring(0, 20);
            chip.addEventListener('click', () => {
                if (document.getElementById('chkCompare').checked && idx !== this.currentIndex) {
                    this.compareIndex = idx;
                } else {
                    this.currentIndex = idx;
                    if (this.datasets.length > 1 && document.getElementById('chkCompare').checked) {
                        this.compareIndex = idx > 0 ? idx - 1 : 1;
                    }
                }
                this.renderTimeline();
                this.populateAllFilters();
                this.refreshDashboard();
            });
            container.appendChild(chip);
        });
    }

    // ==================== FILTERS ====================
    populateAllFilters() {
        const ds = this.getCurrentDS();
        const data = ds.data;

        this.populateFilter('filterPays', data, 'Pays', 'Tous');
        this.populateFilter('filterRegion', data, 'Region', 'Toutes');
        this.populateFilter('filterDistrict', data, 'District', 'Tous');
        this.populateFilter('filterCommune', data, 'Commune', 'Toutes');
        this.populateFilter('filterType', data, 'Type', 'Tous');
    }

    populateFilter(selectId, data, field, allLabel) {
        const select = document.getElementById(selectId);
        const current = select.value;
        const values = [...new Set(data.map(r => r[field]).filter(Boolean))].sort();
        select.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
        if (values.includes(current)) select.value = current;
        else { select.value = ''; this.filters[field] = ''; }
    }

    onFilterChange(changedKey) {
        const cascade = ['Pays', 'Region', 'District', 'Commune', 'Type'];
        const idx = cascade.indexOf(changedKey);
        const filtered = this.getFilteredData();

        for (let i = idx + 1; i < cascade.length - 1; i++) {
            const key = cascade[i];
            this.filters[key] = '';
            this.populateFilter(`filter${key}`, filtered, key, key === 'Region' ? 'Toutes' : key === 'Commune' ? 'Toutes' : 'Tous');
        }

        this.refreshDashboard();
    }

    resetFilters() {
        Object.keys(this.filters).forEach(k => this.filters[k] = '');
        this.populateAllFilters();
        this.refreshDashboard();
    }

    getFilteredData() {
        const ds = this.getCurrentDS();
        return ds.data.filter(row => {
            if (this.filters.Pays && row.Pays !== this.filters.Pays) return false;
            if (this.filters.Region && row.Region !== this.filters.Region) return false;
            if (this.filters.District && row.District !== this.filters.District) return false;
            if (this.filters.Commune && row.Commune !== this.filters.Commune) return false;
            if (this.filters.Type && row.Type !== this.filters.Type) return false;
            return true;
        });
    }

    // ==================== DASHBOARD REFRESH ====================
    refreshDashboard() {
        this.filteredData = this.getFilteredData();
        const compare = this.getCompareDS();

        this.updateKPIs(this.filteredData, compare);
        this.updateCharts(this.filteredData);
        this.renderTypeTable(this.filteredData);
        this.renderGeoTable();
        this.renderErrorTable(this.filteredData);
        this.renderDataTable(this.filteredData);
        this.updateMap(this.filteredData, compare);
    }

    // ==================== KPIs ====================
    updateKPIs(data, compareDS) {
        const s = this.computeStats(data);
        const rate = s.total > 0 ? (s.geolocated / s.total * 100).toFixed(1) : 0;

        document.getElementById('kpiTotal').textContent = s.total.toLocaleString();
        document.getElementById('kpiGeo').textContent = s.geolocated.toLocaleString();
        document.getElementById('kpiMissing').textContent = s.missing.toLocaleString();
        document.getElementById('kpiRate').textContent = `${rate}%`;
        document.getElementById('kpiInvalid').textContent = s.invalid.toLocaleString();
        document.getElementById('kpiDuplicates').textContent = s.duplicates.toLocaleString();

        if (compareDS) {
            const cData = compareDS.data.filter(row => {
                if (this.filters.Pays && row.Pays !== this.filters.Pays) return false;
                if (this.filters.Region && row.Region !== this.filters.Region) return false;
                if (this.filters.District && row.District !== this.filters.District) return false;
                if (this.filters.Commune && row.Commune !== this.filters.Commune) return false;
                if (this.filters.Type && row.Type !== this.filters.Type) return false;
                return true;
            });
            const cs = this.computeStats(cData);
            const cRate = cs.total > 0 ? (cs.geolocated / cs.total * 100).toFixed(1) : 0;

            this.renderDelta('kpiDeltaTotal', s.total, cs.total);
            this.renderDelta('kpiDeltaGeo', s.geolocated, cs.geolocated);
            this.renderDelta('kpiDeltaMissing', s.missing, cs.missing, true);
            this.renderDelta('kpiDeltaRate', parseFloat(rate), parseFloat(cRate), false, '%');
            this.renderDelta('kpiDeltaInvalid', s.invalid, cs.invalid, true);
            this.renderDelta('kpiDeltaDuplicates', s.duplicates, cs.duplicates, true);
        } else {
            document.querySelectorAll('.kpi-delta').forEach(el => { el.textContent = ''; el.className = 'kpi-delta neutral'; });
        }
    }

    computeStats(data) {
        const stats = { total: 0, geolocated: 0, missing: 0, invalid: 0, duplicates: 0 };
        data.forEach(r => {
            stats.total++;
            if (r._status === 'ok') stats.geolocated++;
            else if (r._status === 'missing') stats.missing++;
            else if (r._status === 'invalid') stats.invalid++;
            else if (r._status === 'duplicate') stats.duplicates++;
        });
        return stats;
    }

    renderDelta(id, current, previous, inverse = false, suffix = '') {
        const el = document.getElementById(id);
        const diff = current - previous;
        if (diff === 0) {
            el.innerHTML = '<i class="fas fa-equals"></i> 0';
            el.className = 'kpi-delta neutral';
            return;
        }
        const isUp = diff > 0;
        const isGood = inverse ? !isUp : isUp;
        el.className = `kpi-delta ${isGood ? 'up' : 'down'}`;
        el.innerHTML = `<i class="fas fa-arrow-${isUp ? 'up' : 'down'}"></i> ${isUp ? '+' : ''}${diff.toLocaleString()}${suffix}`;
    }

    // ==================== CHARTS ====================
    updateCharts(data) {
        this.renderTypesChart(data);
        this.renderRegionsChart(data);
    }

    renderTypesChart(data) {
        const ctx = document.getElementById('chartTypes').getContext('2d');
        if (this.charts.types) this.charts.types.destroy();

        const types = {};
        data.forEach(r => { types[r.Type || 'Inconnu'] = (types[r.Type || 'Inconnu'] || 0) + 1; });

        const labels = Object.keys(types).sort();
        const values = labels.map(l => types[l]);
        const colors = labels.map((_, i) => `hsl(${(i * 360 / labels.length + 220) % 360}, 70%, 60%)`);

        this.charts.types = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Nombre de structures', data: values, backgroundColor: colors, borderRadius: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1' } },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
                }
            }
        });
    }

    renderRegionsChart(data) {
        const ctx = document.getElementById('chartRegions').getContext('2d');
        if (this.charts.regions) this.charts.regions.destroy();

        const regions = {};
        data.forEach(r => {
            const reg = r.Region || 'Inconnue';
            if (!regions[reg]) regions[reg] = { total: 0, geo: 0 };
            regions[reg].total++;
            if (r._status === 'ok') regions[reg].geo++;
        });

        const labels = Object.keys(regions).sort();
        const values = labels.map(l => regions[l].total > 0 ? (regions[l].geo / regions[l].total * 100).toFixed(1) : 0);
        const colors = values.map(v => v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444');

        this.charts.regions = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Taux (%)', data: values, backgroundColor: colors, borderRadius: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: labels.length > 10 ? 'y' : 'x',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}%` } } },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, ...(labels.length <= 10 ? { beginAtZero: true, max: 100 } : {}) },
                    y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, ...(labels.length > 10 ? { beginAtZero: true, max: 100 } : {}) }
                }
            }
        });
    }

    // ==================== ANALYSIS TABLES ====================
    renderTypeTable(data) {
        const types = {};
        data.forEach(r => {
            const t = r.Type || 'Inconnu';
            if (!types[t]) types[t] = { total: 0, geo: 0, missing: 0, invalid: 0, duplicate: 0 };
            types[t].total++;
            if (r._status === 'ok') types[t].geo++;
            else if (r._status === 'missing') types[t].missing++;
            else if (r._status === 'invalid') types[t].invalid++;
            else if (r._status === 'duplicate') types[t].duplicate++;
        });

        const tbody = document.querySelector('#tableByType tbody');
        tbody.innerHTML = Object.keys(types).sort().map(t => {
            const { total, geo, missing, invalid, duplicate } = types[t];
            const rate = total > 0 ? (geo / total * 100).toFixed(1) : 0;
            return `<tr>
                <td style="font-weight: 600; color: var(--text-primary);">${t}</td>
                <td>${total}</td>
                <td style="color: #10b981;">${geo}</td>
                <td style="color: #ef4444;">${missing}</td>
                <td style="color: #f59e0b;">${invalid}</td>
                <td style="color: #8b5cf6;">${duplicate}</td>
                <td>${this.rateBarHTML(rate)}</td>
            </tr>`;
        }).join('');
    }

    renderGeoTable() {
        const level = document.getElementById('geoLevel').value;
        const data = this.getFilteredData();
        const groups = {};
        data.forEach(r => {
            const key = r[level] || 'Inconnu';
            if (!groups[key]) groups[key] = { total: 0, geo: 0, missing: 0, invalid: 0, duplicate: 0 };
            groups[key].total++;
            if (r._status === 'ok') groups[key].geo++;
            else if (r._status === 'missing') groups[key].missing++;
            else if (r._status === 'invalid') groups[key].invalid++;
            else if (r._status === 'duplicate') groups[key].duplicate++;
        });

        const tbody = document.querySelector('#tableGeoLevel tbody');
        tbody.innerHTML = Object.keys(groups).sort().map(k => {
            const { total, geo, missing, invalid, duplicate } = groups[k];
            const rate = total > 0 ? (geo / total * 100).toFixed(1) : 0;
            return `<tr>
                <td style="font-weight: 600; color: var(--text-primary);">${k}</td>
                <td>${total}</td>
                <td style="color: #10b981;">${geo}</td>
                <td style="color: #ef4444;">${missing}</td>
                <td style="color: #f59e0b;">${invalid}</td>
                <td style="color: #8b5cf6;">${duplicate}</td>
                <td>${this.rateBarHTML(rate)}</td>
            </tr>`;
        }).join('');
    }

    rateBarHTML(rate) {
        const cls = rate >= 80 ? 'high' : rate >= 50 ? 'mid' : 'low';
        const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
        return `<div class="geo-rate-bar">
            <div class="rate-track"><div class="rate-fill ${cls}" style="width: ${rate}%"></div></div>
            <span class="rate-label" style="color: ${color};">${rate}%</span>
        </div>`;
    }

    // ==================== ERROR TABLE ====================
    renderErrorTable(data) {
        const errors = data.filter(r => r._error);
        document.getElementById('errorCount').textContent = `${errors.length} erreurs`;

        const tbody = document.querySelector('#tableErrors tbody');
        if (errors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-check-circle" style="font-size: 2rem; color: #10b981; display: block; margin-bottom: 12px;"></i>Aucune erreur détectée 🎉</td></tr>';
            return;
        }

        tbody.innerHTML = errors.slice(0, 200).map(r => {
            const badgeClass = r._status === 'missing' ? 'badge-error' : r._status === 'invalid' ? 'badge-warn' : 'badge-info';
            return `<tr>
                <td style="font-weight: 500; color: var(--text-primary);">${r.Structure || 'N/A'}</td>
                <td>${r.Type || 'N/A'}</td>
                <td>${[r.Region, r.District, r.Commune].filter(Boolean).join(' / ')}</td>
                <td><span class="badge ${badgeClass}">${r._error}</span></td>
                <td>${r.Latitude || 'N/A'}</td>
                <td>${r.Longitude || 'N/A'}</td>
            </tr>`;
        }).join('');
    }

    // ==================== DATA TABLE ====================
    renderDataTable(data) {
        document.getElementById('dataCount').textContent = `${data.length} structures`;
        const tbody = document.querySelector('#tableData tbody');

        tbody.innerHTML = data.slice(0, 500).map(r => {
            let badgeHTML;
            if (r._status === 'ok') badgeHTML = '<span class="badge badge-ok"><i class="fas fa-check"></i> OK</span>';
            else if (r._status === 'missing') badgeHTML = '<span class="badge badge-error"><i class="fas fa-times"></i> Manquant</span>';
            else if (r._status === 'invalid') badgeHTML = '<span class="badge badge-warn"><i class="fas fa-exclamation"></i> Invalide</span>';
            else badgeHTML = '<span class="badge badge-info"><i class="fas fa-clone"></i> Doublon</span>';

            return `<tr>
                <td>${r.Pays || ''}</td>
                <td>${r.Region || ''}</td>
                <td>${r.District || ''}</td>
                <td>${r.Commune || ''}</td>
                <td>${r.Aire || ''}</td>
                <td style="font-weight: 500; color: var(--text-primary);">${r.Structure || ''}</td>
                <td>${r.Type || ''}</td>
                <td>${r.Longitude || ''}</td>
                <td>${r.Latitude || ''}</td>
                <td>${badgeHTML}</td>
            </tr>`;
        }).join('');
    }

    // ==================== MAP ====================
    initMap() {
        if (this.map) return;
        this.map = L.map('geoMap').setView([13.5, 2.1], 6);

        // Définition des couches de fond
        this.tileLayers = {
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
            }),
            roadmap: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }), // Par défaut OSM si Google n'est pas dispo sans clé, sinon Esri Streets
            none: L.layerGroup()
        };

        // Fallback for roadmap if needed (Esri World Street Map)
        this.tileLayers.roadmap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
        });

        const initialBasemap = document.getElementById('selBasemap') ? document.getElementById('selBasemap').value : 'osm';
        this.tileLayers[initialBasemap].addTo(this.map);

        this.markers = L.markerClusterGroup({
            maxClusterRadius: 100,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: function (cluster) {
                const childCount = cluster.getChildCount();
                let c = ' marker-cluster-';
                if (childCount < 50) {
                    c += 'small';
                } else if (childCount < 100) {
                    c += 'medium';
                } else {
                    c += 'large';
                }

                return new L.DivIcon({
                    html: '<div><span>' + childCount + '</span></div>',
                    className: 'marker-cluster' + c,
                    iconSize: new L.Point(40, 40)
                });
            }
        });
        this.map.addLayer(this.markers);
    }

    switchBasemap(type) {
        if (!this.map || !this.tileLayers[type]) return;

        // Supprimer toutes les couches de fond actuelles
        Object.values(this.tileLayers).forEach(layer => {
            if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
        });

        // Ajouter la nouvelle
        this.tileLayers[type].addTo(this.map);
    }

    toggleFullscreen() {
        const container = document.getElementById('mapFullscreenContainer');
        const btn = document.getElementById('btnFullscreen');

        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
                // Fallback to fake fullscreen if native fails
                this._toggleFakeFullscreen(container, btn, true);
            });
        } else {
            document.exitFullscreen();
        }
    }

    _toggleFakeFullscreen(container, btn, isFS) {
        container.classList.toggle('fullscreen', isFS);
        document.body.classList.toggle('is-map-fullscreen', isFS);
        btn.innerHTML = isFS ? '<i class="fas fa-compress"></i> Quitter' : '<i class="fas fa-expand"></i> Plein écran';
        document.body.style.overflow = isFS ? 'hidden' : '';
        setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 300);
    }

    _handleFullscreenChange() {
        const container = document.getElementById('mapFullscreenContainer');
        const btn = document.getElementById('btnFullscreen');
        const isFS = !!document.fullscreenElement;

        container.classList.toggle('fullscreen', isFS);
        document.body.classList.toggle('is-map-fullscreen', isFS);

        btn.innerHTML = isFS ? '<i class="fas fa-compress"></i> Quitter le plein écran' : '<i class="fas fa-expand"></i> Plein écran';

        // Sync scroll behavior
        document.body.style.overflow = isFS ? 'hidden' : '';

        // Recalculate map size
        setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 100);
        setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
    }

    updateMap(data, compareDS) {
        // Store pending data; actual rendering happens when the map tab is shown
        this._pendingMapData = data;
        this._pendingMapCompare = compareDS;

        // Only render if the map tab is currently visible
        const mapPanel = document.getElementById('panel-map');
        if (mapPanel.classList.contains('active')) {
            this.renderMapMarkers();
        }
    }

    renderMapMarkers() {
        const data = this._pendingMapData || [];
        const compareDS = this._pendingMapCompare || null;
        const showNames = document.getElementById('chkShowNames').checked;
        const useClusters = document.getElementById('chkClusters').checked;

        this.initMap();
        this.map.invalidateSize();

        // Gérer la visibilité de la légende des clusters
        const clusterLegend = document.getElementById('clusterLegend');
        const clusterLegendItems = document.querySelectorAll('.cluster-legend-item');
        if (clusterLegend) clusterLegend.style.display = useClusters ? '' : 'none';
        clusterLegendItems.forEach(el => el.style.display = useClusters ? '' : 'none');

        // Nettoyer
        this.markers.clearLayers();
        if (this._nonClusteredLayer) {
            this.map.removeLayer(this._nonClusteredLayer);
        }
        if (this._polygonsLayer) {
            this.map.removeLayer(this._polygonsLayer);
        }
        this._nonClusteredLayer = L.layerGroup();

        // Render polygons de validation (contours)
        const currentDS = this.getCurrentDS();
        if (currentDS && currentDS.validationPolygons && currentDS.validationPolygons.length > 0) {
            this._polygonsLayer = L.geoJSON(currentDS.validationPolygons.map(p => ({
                type: 'Feature',
                geometry: p.geometry,
                properties: { name: p.displayName }
            })), {
                style: {
                    color: '#10b981',
                    weight: 2,
                    fillColor: '#10b981',
                    fillOpacity: 0.1,
                    dashArray: '5, 5'
                }
            }).bindPopup(layer => `<b>Conteneur :</b> ${layer.feature.properties.name}`)
                .bindTooltip(layer => layer.feature.properties.name, {
                    permanent: true,
                    direction: 'center',
                    className: 'boundary-label-tooltip'
                })
                .addTo(this.map);
        }

        const compareIds = compareDS ? new Set(compareDS.data.filter(r => r._status === 'ok').map(r => r._id)) : null;
        const validData = data.filter(r => r._hasCoords);

        validData.forEach(r => {
            let color = '#10b981'; // Vert par défaut (Existant)
            let statusLabel = 'Existant';

            if (r._status === 'invalid') { color = '#ef4444'; statusLabel = 'Invalide'; }
            else if (r._status === 'duplicate') { color = '#8b5cf6'; statusLabel = 'Doublon'; }
            else if (compareIds && !compareIds.has(r._id)) { color = '#3b82f6'; statusLabel = 'Nouveau'; }

            const isDHIS2Marker = !!r._id_dhis2;
            const isEditMode = this.editMode && isDHIS2Marker;

            let marker;
            if (isEditMode) {
                // En mode édition : marqueur classique draggable avec icône pin colorée
                const pinIcon = L.divIcon({
                    className: '',
                    html: `<div style="
                        width: 28px; height: 28px;
                        background: ${color};
                        border: 3px solid white;
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                        cursor: grab;
                    "></div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 28]
                });
                marker = L.marker([r._lat, r._lon], { draggable: true, icon: pinIcon });

                marker.on('dragend', (e) => {
                    const newLatLng = e.target.getLatLng();
                    const newLat = newLatLng.lat.toFixed(6);
                    const newLon = newLatLng.lng.toFixed(6);
                    const name = r.Structure || 'cette structure';

                    if (!confirm(`Déplacer "${name}" vers :\nLat: ${newLat}\nLon: ${newLon}\n\nEnregistrer dans DHIS2 ?`)) {
                        // Annuler: remettre le marqueur à sa position d'origine
                        e.target.setLatLng([r._lat, r._lon]);
                        return;
                    }

                    // Pré-remplir et déclencher la sauvegarde
                    document.getElementById('editStructId').value = r._id_dhis2;
                    document.getElementById('editLat').value = newLat;
                    document.getElementById('editLon').value = newLon;
                    this.saveCoordinatesToDHIS2();
                });
            } else {
                // Mode normal : cercle coloré (comportement existant)
                marker = L.circleMarker([r._lat, r._lon], {
                    radius: 7, fillColor: color, color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85
                });
            }

            marker.bindPopup(`
                <div style="font-family: Inter, sans-serif; min-width: 200px;">
                    <strong style="font-size: 14px;">${r.Structure || 'N/A'}</strong><br>
                    <span style="font-size: 12px; color: #666;">
                        <b>Type :</b> ${r.Type || 'N/A'}<br>
                        <b>Région :</b> ${r.Region || 'N/A'}<br>
                        <b>District :</b> ${r.District || 'N/A'}<br>
                        <b>Commune :</b> ${r.Commune || 'N/A'}<br>
                        <b>Statut :</b> ${statusLabel}<br>
                        <b>Lat/Lon :</b> ${r._lat.toFixed(5)}, ${r._lon.toFixed(5)}
                    </span>
                    ${r._id_dhis2 ? `
                    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee; text-align: center;">
                        <button class="btn-edit-coords" 
                                data-id="${r._id_dhis2}" 
                                data-name="${(r.Structure || '').replace(/'/g, "\\'")}" 
                                data-lat="${r._lat}" 
                                data-lon="${r._lon}"
                                style="padding: 6px 12px; background: var(--gradient-primary); color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-edit"></i> Editer les coordonnées
                        </button>
                    </div>
                    ` : ''}
                </div>
            `);

            if (showNames && r.Structure) {
                marker.bindTooltip(r.Structure, {
                    permanent: true,
                    direction: 'right',
                    offset: [10, 0],
                    className: 'geo-label-tooltip'
                });
            }

            if (useClusters) {
                this.markers.addLayer(marker);
            } else {
                this._nonClusteredLayer.addLayer(marker);
            }

            // Gérer le clic sur le bouton Editer dans la popup
            marker.on('popupopen', () => {
                const btn = document.querySelector('.btn-edit-coords');
                if (btn) {
                    btn.onclick = (e) => {
                        const { id, name, lat, lon } = btn.dataset;
                        this.openEditModal(id, name, parseFloat(lat), parseFloat(lon));
                    };
                }
            });
        });

        if (!useClusters) {
            this._nonClusteredLayer.addTo(this.map);
        }

        // Toujours forcer un invalidateSize au cas où le container aurait changé
        setTimeout(() => {
            if (!this.map) return;
            this.map.invalidateSize();

            if (validData.length > 0) {
                // Filtrer les coordonnées extrêmes pour éviter de dézoomer sur le monde entier
                // (ex: erreurs de saisie Lat: 0.0001 qui zooment sur le golfe de Guinée)
                const reasonableBounds = L.latLngBounds(
                    validData.filter(r =>
                        r._lat > 4 && r._lat < 25 &&
                        r._lon > -5 && r._lon < 20
                    ).map(r => [r._lat, r._lon])
                );

                if (reasonableBounds.isValid()) {
                    this.map.fitBounds(reasonableBounds, { padding: [30, 30] });
                } else {
                    // Fallback sur toutes les données si aucune n'est dans la zone "raisonnable"
                    const allBounds = useClusters ? this.markers.getBounds() : this._nonClusteredLayer.getBounds();
                    if (allBounds.isValid()) {
                        this.map.fitBounds(allBounds, { padding: [30, 30] });
                    }
                }
            }
        }, 500); // Augmenté à 500ms pour laisser le DOM se stabiliser
    }

    // ==================== TAB SWITCHING ====================
    switchTab(tabId) {
        document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`panel-${tabId}`).classList.add('active');

        if (tabId === 'map') {
            // Render map markers now that the container is visible
            // On augmente le délai pour assurer que le panel est bien affiché et mesurable
            setTimeout(() => this.renderMapMarkers(), 400);
        }
    }

    // ==================== EXPORTS ====================
    exportCSV(type) {
        const ds = this.getCurrentDS();
        let exportData;
        let filename;

        if (type === 'errors') {
            exportData = this.filteredData.filter(r => r._error).map(r => ({
                UID: r._id_dhis2 || '', Structure: r.Structure, Type: r.Type,
                Pays: r.Pays, Region: r.Region, District: r.District,
                Commune: r.Commune, Aire: r.Aire,
                Latitude: r.Latitude, Longitude: r.Longitude,
                Erreur: r._error
            }));
            filename = `erreurs_sig_${ds.name}`;
        } else {
            exportData = this.filteredData.map(r => ({
                UID: r._id_dhis2 || '',
                Pays: r.Pays, Region: r.Region, District: r.District,
                Commune: r.Commune, Aire: r.Aire, Structure: r.Structure,
                Type: r.Type, Longitude: r.Longitude, Latitude: r.Latitude,
                Statut: r._status === 'ok' ? 'OK' : r._error
            }));
            filename = `export_complet_${ds.name}`;
        }

        if (exportData.length === 0) {
            this.showToast('warning', 'Rien à exporter', 'Aucune donnée correspondant aux filtres actuels.');
            return;
        }

        const csv = Papa.unparse(exportData);
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename.endsWith('.csv') ? filename : filename + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);

        this.showToast('success', 'Export réussi', `${exportData.length} lignes exportées.`);
    }

    // ==================== TOASTS ====================
    showToast(type, title, message) {
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--bg-secondary); border: 1px solid ${colors[type]}40; border-left: 4px solid ${colors[type]}; border-radius: 12px; margin-bottom: 8px; animation: fadeInUp 0.3s ease; color: var(--text-primary); box-shadow: var(--shadow-lg);`;
        toast.innerHTML = `<i class="fas ${icons[type]}" style="color: ${colors[type]}; font-size: 18px;"></i><div><div style="font-weight: 600; font-size: 14px;">${title}</div><div style="color: var(--text-secondary); font-size: 13px;">${message}</div></div>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    }
    async searchLocation(query) {
        const loader = document.getElementById('searchLoader');
        const suggestionsBox = document.getElementById('searchSuggestions');

        try {
            loader.style.display = 'block';

            // Nominatim API call
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
            const data = await response.json();

            loader.style.display = 'none';

            if (data && data.length > 0) {
                suggestionsBox.innerHTML = data.map(item => `
                    <div class="search-suggestion-item" 
                         onclick="window.geoAnalyzer.handleSearchSuggestionClick(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}')">
                        <span class="suggestion-name">${item.display_name.split(',')[0]}</span>
                        <span class="suggestion-address">${item.display_name.split(',').slice(1).join(',')}</span>
                    </div>
                `).join('');
                suggestionsBox.style.display = 'block';
            } else {
                suggestionsBox.style.display = 'none';
            }
        } catch (err) {
            console.error('Search error:', err);
            loader.style.display = 'none';
            suggestionsBox.style.display = 'none';
        }
    }

    handleSearchSuggestionClick(lat, lon, name) {
        const suggestionsBox = document.getElementById('searchSuggestions');
        suggestionsBox.style.display = 'none';

        if (this.map) {
            // Remove previous search marker
            if (this._searchMarker) this.map.removeLayer(this._searchMarker);

            // Center map
            this.map.setView([lat, lon], 14);

            // Add custom search marker
            const searchIcon = L.divIcon({
                className: '',
                html: `<div style="width: 32px; height: 32px; background: var(--primary); border: 3px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
                        <i class="fas fa-search" style="transform: rotate(45deg); color: white; font-size: 14px;"></i>
                       </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            });

            const popupContent = `
                <div style="font-family: 'Inter', sans-serif; min-width: 200px; padding: 5px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-primary); font-size: 14px;">${name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">
                        <b>Latitude :</b> ${lat.toFixed(6)}<br>
                        <b>Longitude :</b> ${lon.toFixed(6)}
                    </div>
                    <button onclick="window.geoAnalyzer.copyToClipboard('${lat.toFixed(6)}, ${lon.toFixed(6)}')" 
                        style="width: 100%; padding: 8px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-copy"></i> Copier les coordonnées
                    </button>
                </div>
            `;

            this._searchMarker = L.marker([lat, lon], { icon: searchIcon })
                .bindPopup(popupContent)
                .addTo(this.map)
                .openPopup();
        }
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('success', 'Copié !', 'Les coordonnées ont été copiées dans le presse-papier.');
        }).catch(err => {
            console.error('Erreur lors de la copie :', err);
            this.showToast('error', 'Erreur', 'Impossible de copier les coordonnées.');
        });
    }
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.geoApp = new GeoAnalyzer();
});
