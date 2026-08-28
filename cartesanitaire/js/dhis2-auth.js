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

function checkConnectionStatus() {
    const authConfig = sessionStorage.getItem('dhis2_config');

    if (authConfig) {
        const config = JSON.parse(authConfig);
        showConnectedState(config.url, config.username);
    } else {
        showDisconnectedState();
    }
}

function showConnectedState(url, username) {
    $('#btnDHIS2Connect').hide();
    $('#dhis2Status').fadeIn().css('display', 'flex');
    $('#dhis2User').text(username);
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
    const username = $('#dhis2UsernameInput').val().trim();
    const password = $('#dhis2PasswordInput').val().trim();

    if (!url || !username || !password) {
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
        await dhis2Session.initialize(url, username, password);

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
            errorTitle = 'Identifiants incorrects';
            errorMessage = 'Vérifiez votre nom d\'utilisateur et votre mot de passe. Assurez-vous également que l\'URL de l\'instance DHIS2 est correcte.';
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
