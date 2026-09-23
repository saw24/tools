/**
 * DHIS2 Authentication Module
 * Handles connection, session storage, and UI updates for DHIS2 connectivity.
 */

$(document).ready(function () {
    initDHIS2Auth();
});

function initDHIS2Auth() {
    // Check if already connected
    checkConnectionStatus();

    // Injecter le sélecteur de type d'authentification (Basic / Token)
    injectAuthTypeSelector();

    // Event Listeners
    $('#btnDHIS2Connect').on('click', openLoginModal);
    $('#btnDHIS2Logout').on('click', logoutDHIS2);
    $('#formDHIS2Login').on('submit', handleLoginSubmit);

    // Close modal handlers
    $('.close-auth-modal').on('click', closeLoginModal);
    $('#dhis2LoginModal').on('click', function (e) {
        if (e.target === this) closeLoginModal();
    });
}

/**
 * Injecter dynamiquement dans le modal de connexion :
 * - un sélecteur de type de connexion (Identifiants par défaut / Personal Access Token)
 * - un champ Token (masqué en mode "Identifiants")
 * Cela évite de modifier chaque page HTML incluant le modal.
 */
function injectAuthTypeSelector() {
    const $form = $('#formDHIS2Login');
    if (!$form.length || $('#dhis2AuthType').length) return; // déjà injecté

    const $selectorGroup = $(`
        <div class="auth-form-group">
            <label>Type de connexion</label>
            <div id="dhis2AuthTabs" style="display: flex; gap: 0; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden;">
                <button type="button" id="tabAuthBasic" data-type="basic"
                    style="flex: 1; padding: 8px 12px; border: none; cursor: pointer; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600;">
                    <i class="fas fa-user-lock"></i> Identifiants
                </button>
                <button type="button" id="tabAuthToken" data-type="token"
                    style="flex: 1; padding: 8px 12px; border: none; cursor: pointer; background: #f3f4f6; color: #374151; font-size: 13px; font-weight: 600;">
                    <i class="fas fa-key"></i> Token
                </button>
            </div>
        </div>
    `);

    const $tokenGroup = $(`
        <div class="auth-form-group" id="dhis2TokenGroup" style="display: none;">
            <label for="dhis2TokenInput">Personal Access Token</label>
            <input type="password" id="dhis2TokenInput" class="auth-input" placeholder="d2pat_..."
                autocomplete="off">
            <small style="display: block; margin-top: 4px; color: #6b7280;">
                DHIS2 : Profil utilisateur → Personal access tokens → New token
            </small>
        </div>
    `);

    // Insérer le sélecteur avant le premier champ (URL) et le champ token après les identifiants
    $form.find('.auth-form-group').first().before($selectorGroup);
    $form.find('#dhis2PasswordInput').closest('.auth-form-group').after($tokenGroup);

    // Bascule d'affichage selon l'onglet actif
    function setAuthType(type) {
        const isToken = type === 'token';
        const ACTIVE_BG = '#2563eb', ACTIVE_FG = '#fff';
        const INACTIVE_BG = '#f3f4f6', INACTIVE_FG = '#374151';
        $('#dhis2AuthTabs').data('authType', type);
        $('#dhis2AuthTabs button').each(function () {
            const active = $(this).data('type') === type;
            $(this).css('background', active ? ACTIVE_BG : INACTIVE_BG)
                   .css('color', active ? ACTIVE_FG : INACTIVE_FG);
        });
        $('#dhis2TokenGroup').toggle(isToken);
        $('#dhis2UsernameInput').closest('.auth-form-group').toggle(!isToken);
        $('#dhis2PasswordInput').closest('.auth-form-group').toggle(!isToken);
        // Rendre les champs requis conditionnellement
        $('#dhis2UsernameInput, #dhis2PasswordInput').prop('required', !isToken);
        $('#dhis2TokenInput').prop('required', isToken);
    }
    $('#dhis2AuthTabs button').on('click', function () {
        setAuthType($(this).data('type'));
    });
    window.getDHIS2AuthType = function () {
        return $('#dhis2AuthTabs').data('authType') || 'basic';
    };
}

function checkConnectionStatus() {
    const authConfig = sessionStorage.getItem('dhis2_config');

    if (authConfig) {
        const config = JSON.parse(authConfig);
        showConnectedState(config.url, config.username, config.authType);
    } else {
        showDisconnectedState();
    }
}

function showConnectedState(url, username, authType) {
    $('#btnDHIS2Connect').hide();
    $('#dhis2Status').fadeIn().css('display', 'flex');
    $('#dhis2User').text(username + (authType === 'token' ? ' (token)' : ''));
    $('#dhis2Url').text(new URL(url).hostname);
}

function showDisconnectedState() {
    $('#dhis2Status').hide();
    $('#btnDHIS2Connect').fadeIn().css('display', 'flex');
}

function openLoginModal() {
    hideAuthFeedback(); // Masquer les anciens messages
    $('#dhis2LoginModal').addClass('active');
    $('#dhis2UrlInput').focus();
}

function closeLoginModal() {
    hideAuthFeedback(); // Masquer les messages
    $('#dhis2LoginModal').removeClass('active');
}

async function handleLoginSubmit(e) {
    e.preventDefault();

    const url = $('#dhis2UrlInput').val().trim();
    // Lire le type actif : onglets (boutons) ou fallback sur l'ancien select
    const authType = typeof getDHIS2AuthType === 'function'
        ? getDHIS2AuthType()
        : ($('#dhis2AuthType').val() || 'basic');
    const username = $('#dhis2UsernameInput').val().trim();
    const password = $('#dhis2PasswordInput').val().trim();
    const token = $('#dhis2TokenInput') ? $('#dhis2TokenInput').val().trim() : '';

    // Validation selon le type de connexion
    if (!url) {
        showAuthFeedback('error', 'Champs requis', 'Veuillez saisir l\'URL de l\'instance DHIS2');
        return;
    }
    if (authType === 'token') {
        if (!token) {
            showAuthFeedback('error', 'Champs requis', 'Veuillez saisir votre Personal Access Token');
            return;
        }
        if (!token.startsWith('d2pat_')) {
            showAuthFeedback('warning', 'Format de token inattendu',
                'Les tokens DHIS2 commencent généralement par "d2pat_". Vérifiez la valeur saisie.');
        }
    } else if (!username || !password) {
        showAuthFeedback('error', 'Champs requis', 'Veuillez remplir tous les champs');
        return;
    }

    // Masquer le feedback précédent
    hideAuthFeedback();

    // Désactiver le bouton de soumission
    const $submitBtn = $('#formDHIS2Login button[type="submit"]');
    const originalBtnText = $submitBtn.html();
    $submitBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Connexion...');

    // Afficher un message d'information
    showAuthFeedback('info', 'Connexion en cours...', 'Vérification des identifiants auprès du serveur DHIS2');

    try {
        // Initialiser la session avec le gestionnaire
        await dhis2Session.initialize(url, username, password, authType, token);

        // Tester la connexion réelle
        const testResult = await dhis2Session.testConnection();

        if (testResult.success) {
            // Connexion réussie
            const userName = testResult.user.displayName || testResult.user.username;
            showAuthFeedback('success', 'Connexion réussie', `Bienvenue ${userName} !`);

            // Attendre un peu pour que l'utilisateur voie le message de succès
            setTimeout(() => {
                closeLoginModal();
                checkConnectionStatus();
                hideAuthFeedback();

                // Clear sensitive fields
                $('#dhis2PasswordInput').val('');
                $('#dhis2TokenInput').val('');

                // Afficher un toast de confirmation
                if (typeof showToast === 'function') {
                    showToast('success', 'Connecté', `Session DHIS2 active`);
                }

                // Déclencher un événement personnalisé pour notifier les autres composants
                $(document).trigger('dhis2:connected', [testResult.user]);
            }, 1500);
        } else {
            // Échec de la connexion
            throw new Error(testResult.error || 'Impossible de se connecter à DHIS2');
        }
    } catch (error) {
        console.error('Erreur de connexion DHIS2:', error);

        // Nettoyer la session en cas d'erreur
        dhis2Session.logout();

        // Construire le message d'erreur détaillé
        let errorTitle = 'Échec de la connexion';
        let errorMessage = 'Impossible de se connecter à DHIS2';

        if (error.message) {
            errorMessage = error.message;
        } else if (error.responseJSON && error.responseJSON.message) {
            errorMessage = error.responseJSON.message;
        }

        // Ajouter des détails selon le type d'erreur
        if (errorMessage.includes('401') || errorMessage.includes('Non autorisé')) {
            if (authType === 'token') {
                errorTitle = 'Token invalide';
                errorMessage = 'Ce token est invalide, expiré ou révoqué. Régénérez-le dans votre profil DHIS2 (Personal access tokens) et réessayez.';
            } else {
                errorTitle = 'Identifiants incorrects';
                errorMessage = 'Vérifiez votre nom d\'utilisateur et votre mot de passe. Assurez-vous également que l\'URL de l\'instance DHIS2 est correcte.';
            }
        } else if (errorMessage.includes('cURL') || errorMessage.includes('réseau')) {
            errorTitle = 'Erreur réseau';
            errorMessage = 'Impossible de contacter le serveur DHIS2. Vérifiez votre connexion internet et l\'URL de l\'instance.';
        } else if (errorMessage.includes('timeout')) {
            errorTitle = 'Délai dépassé';
            errorMessage = 'Le serveur DHIS2 met trop de temps à répondre. Réessayez dans quelques instants.';
        }

        showAuthFeedback('error', errorTitle, errorMessage);
    } finally {
        // Réactiver le bouton
        $submitBtn.prop('disabled', false).html(originalBtnText);
    }
}

function logoutDHIS2() {
    if (confirm('Voulez-vous vraiment vous déconnecter de l\'instance DHIS2 ?')) {
        dhis2Session.logout();
        checkConnectionStatus();
        showToast('info', 'Déconnecté', 'Les informations de session ont été effacées');

        // Déclencher un événement personnalisé
        $(document).trigger('dhis2:disconnected');
    }
}

/**
 * Afficher un message de feedback dans le modal de connexion
 * @param {string} type - Type de message: 'success', 'error', 'warning', 'info'
 * @param {string} title - Titre du message
 * @param {string} message - Contenu du message
 */
function showAuthFeedback(type, title, message) {
    const $feedback = $('#authFeedback');
    const $icon = $feedback.find('.feedback-icon i');
    const $title = $('#authFeedbackTitle');
    const $message = $('#authFeedbackMessage');

    // Définir l'icône selon le type
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    // Retirer toutes les classes de type
    $feedback.removeClass('success error warning info');

    // Ajouter la classe du type actuel
    $feedback.addClass(type);

    // Mettre à jour l'icône
    $icon.attr('class', `fas ${icons[type] || icons.info}`);

    // Mettre à jour le contenu
    $title.text(title);
    $message.text(message);

    // Afficher le feedback
    $feedback.fadeIn(300);
}

/**
 * Masquer le message de feedback
 */
function hideAuthFeedback() {
    $('#authFeedback').fadeOut(300);
}

// Exposer globalement pour le bouton de fermeture
window.hideAuthFeedback = hideAuthFeedback;
