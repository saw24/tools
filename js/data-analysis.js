$(document).ready(function () {
    // State
    const state = {
        step: 1,
        dbConfig: {},
        selectedTable: '',
        tables: [],
        columns: [],
        selectedColumns: [],
        data: []
    };

    // Navigation
    function showStep(step) {
        $('.step-content').hide();
        $(`#step${step}`).fadeIn();

        // Update indicator
        $('.step-item').removeClass('active completed');
        for (let i = 1; i < step; i++) {
            $(`.step-item[data-step="${i}"]`).addClass('completed');
        }
        $(`.step-item[data-step="${step}"]`).addClass('active');

        state.step = step;

        // Auto scroll to top
        window.scrollTo(0, 0);
    }

    // Step 1: Connect
    $('#btnConnect').click(function () {
        const type = $('#dbType').val();
        const host = $('#dbHost').val();
        const port = $('#dbPort').val();
        const name = $('#dbName').val();
        const user = $('#dbUser').val();
        const password = $('#dbPassword').val();

        if (!host || !name || !user) {
            showToast('error', 'Erreur', 'Veuillez remplir tous les champs obligatoires');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.html('<i class="fas fa-spinner fa-spin"></i> Connexion...').prop('disabled', true);

        state.dbConfig = { type, host, port, name, user, password };

        $.ajax({
            url: 'api/data_analysis.php',
            method: 'POST',
            data: JSON.stringify({
                action: 'connect',
                dbConfig: state.dbConfig
            }),
            contentType: 'application/json',
            success: function (response) {
                if (response.success) {
                    state.tables = response.data.tables;
                    populateTableSelect();
                    showToast('success', 'Connecté', 'Connexion réussie à la base de données');
                    showStep(2);
                } else {
                    showToast('error', 'Erreur de connexion', response.error);
                }
            },
            error: function () {
                showToast('error', 'Erreur', 'Impossible de contacter le serveur');
            },
            complete: function () {
                btn.html(originalText).prop('disabled', false);
            }
        });
    });

    function populateTableSelect() {
        const select = $('#tableSelect');
        select.empty();
        select.append('<option value="">Sélectionnez une table...</option>');
        state.tables.forEach(table => {
            select.append(`<option value="${table}">${table}</option>`);
        });
    }

    // Step 2: Select Table & Columns
    $('#tableSelect').change(function () {
        const table = $(this).val();
        state.selectedTable = table;

        if (table) {
            fetchColumns(table);
        } else {
            $('#columnSelectionContainer').slideUp();
            state.columns = [];
        }
    });

    function fetchColumns(table) {
        state.columns = [];
        $('#columnSelectionContainer').hide();

        $.ajax({
            url: 'api/data_analysis.php',
            method: 'POST',
            data: JSON.stringify({
                action: 'get_columns',
                dbConfig: state.dbConfig,
                table: table
            }),
            contentType: 'application/json',
            success: function (response) {
                if (response.success) {
                    state.columns = response.data.columns;
                    renderColumnCheckboxes();
                    populateSortingSelect();
                    $('#columnSelectionContainer').slideDown();
                } else {
                    showToast('error', 'Erreur', response.error);
                }
            }
        });
    }

    function renderColumnCheckboxes() {
        const container = $('#columnsCheckboxList');
        container.empty();

        state.columns.forEach(col => {
            container.append(`
                <label class="checkbox-card">
                    <input type="checkbox" name="columns" value="${col}" checked>
                    <span>${col}</span>
                </label>
            `);
        });
    }

    // Select/Deselect All Columns
    $('#selectAllCols').click(function (e) {
        e.preventDefault();
        $('input[name="columns"]').prop('checked', true);
    });

    $('#deselectAllCols').click(function (e) {
        e.preventDefault();
        $('input[name="columns"]').prop('checked', false);
    });

    // Go to Filters
    $('#nextToStep3').click(function () {
        if (!state.selectedTable) {
            showToast('error', 'Attention', 'Veuillez sélectionner une table');
            return;
        }

        // Capture selected columns
        const selected = [];
        $('input[name="columns"]:checked').each(function () {
            selected.push($(this).val());
        });

        if (selected.length === 0) {
            showToast('error', 'Attention', 'Veuillez sélectionner au moins une colonne');
            return;
        }

        state.selectedColumns = selected;
        showStep(3);
    });

    function populateSortingSelect() {
        const select = $('#filterOrderBy');
        select.empty();
        select.append('<option value="">Aucun tri</option>');
        state.columns.forEach(col => {
            select.append(`<option value="${col}">${col}</option>`);
        });
    }

    // Step 3: Filters -> Step 4: Access Results
    $('#nextToStep4').click(function () {
        loadData();
    });

    function loadData() {
        const where = $('#filterWhere').val();
        const orderBy = $('#filterOrderBy').val();
        const orderDir = $('#filterOrderDir').val();
        const limit = $('#filterLimit').val();

        const btn = $('#nextToStep4');
        const originalText = btn.html();
        btn.html('<i class="fas fa-spinner fa-spin"></i> Chargement...').prop('disabled', true);

        $.ajax({
            url: 'api/data_analysis.php',
            method: 'POST',
            data: JSON.stringify({
                action: 'query',
                dbConfig: state.dbConfig,
                table: state.selectedTable,
                columns: state.selectedColumns, // Send selected columns
                where,
                orderBy,
                orderDir,
                limit
            }),
            contentType: 'application/json',
            success: function (response) {
                if (response.success) {
                    state.data = response.data.rows;
                    renderTable(state.data);
                    showStep(4);
                } else {
                    showToast('error', 'Erreur SQL', response.error);
                }
            },
            error: function () {
                showToast('error', 'Erreur', 'Erreur lors du chargement des données');
            },
            complete: function () {
                btn.html(originalText).prop('disabled', false);
            }
        });
    }

    function renderTable(rows) {
        const thead = $('#tableHeader');
        const tbody = $('#tableBody');
        thead.empty();
        tbody.empty();

        if (rows.length === 0) {
            tbody.html('<tr><td colspan="100%" class="text-center">Aucune donnée trouvée</td></tr>');
            return;
        }

        // Use selected columns order if available, else keys from first row headers
        const columns = state.selectedColumns.length > 0 ? state.selectedColumns : Object.keys(rows[0]);

        // Header
        columns.forEach(col => {
            thead.append(`<th>${col}</th>`);
        });

        // Body
        rows.forEach(row => {
            let tr = '<tr>';
            columns.forEach(col => {
                const val = row[col];
                tr += `<td>${val !== null && val !== undefined ? val : '<em>NULL</em>'}</td>`;
            });
            tr += '</tr>';
            tbody.append(tr);
        });
    }

    // Helper: Generate Filename with Timestamp
    function getFilename(extension) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS

        return `${state.selectedTable}_alert_${dateStr}_${timeStr}.${extension}`;
    }

    // Exports
    $('#btnExportJson').click(function () {
        if (!state.data.length) return;

        const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getFilename('json');
        a.click();
        window.URL.revokeObjectURL(url);
    });

    $('#btnExportExcel').click(function () {
        if (!state.data.length) return;

        const ws = XLSX.utils.json_to_sheet(state.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, getFilename('xlsx'));
    });

    // Navigation buttons
    $('#backToStep1').click(() => showStep(1));
    $('#backToStep2').click(() => showStep(2));
    $('#backToStep3').click(() => showStep(3));
});
