/**
 * Interaction Manager - Handles comments and notifications for modules
 */

const InteractionManager = {
    apiUrl: 'api/interactions.php',

    /**
     * Get all ratings for dashboard
     */
    getAllRatings: async function () {
        try {
            const response = await fetch(`${this.apiUrl}?action=get_all_ratings`);
            return await response.json();
        } catch (error) {
            console.error('Fetch All Ratings Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get comments for a specific module
     */
    getComments: async function (modulePath) {
        try {
            const response = await fetch(`${this.apiUrl}?action=get_comments&modulePath=${encodeURIComponent(modulePath)}`);
            return await response.json();
        } catch (error) {
            console.error('Fetch Comments Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Initialize DB if needed
     */
    initDB: async function () {
        try {
            await fetch(`${this.apiUrl}?action=init`);
        } catch (error) {
            console.error('Init DB Error:', error);
        }
    },

    /**
     * Get rating stats for a specific module
     */
    getRatingStats: async function (modulePath) {
        try {
            const response = await fetch(`${this.apiUrl}?action=get_rating_stats&modulePath=${encodeURIComponent(modulePath)}`);
            return await response.json();
        } catch (error) {
            console.error('Fetch Rating Stats Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Add a comment and/or rating to a module
     */
    addComment: async function (modulePath, userName, commentText, rating = 0) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_comment',
                    modulePath,
                    userName,
                    commentText,
                    rating
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Add Comment Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get active notifications
     */
    getNotifications: async function (modulePath = null) {
        try {
            let url = `${this.apiUrl}?action=get_notifications`;
            if (modulePath) url += `&modulePath=${encodeURIComponent(modulePath)}`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Fetch Notifications Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Initialize UI elements for interactions
     */
    initUI: function () {
        this.initDB();
        this.injectStyles();
        if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname === '') {
            this.initDashboardUI();
        } else {
            this.initModuleUI();
        }
    },

    injectStyles: function () {
        if ($('#interactionStyles').length) return;
        const styles = `
            <style id="interactionStyles">
                .notification-badge {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: #ff4757;
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid var(--bg-dark);
                    font-weight: bold;
                    z-index: 10;
                }
                .comment-button {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: var(--primary-gradient);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 1000;
                    transition: transform 0.3s ease;
                }
                .comment-button:hover { transform: scale(1.1); }
                
                .interaction-modal {
                    display: none;
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(5px);
                    z-index: 2000;
                    align-items: center;
                    justify-content: center;
                }
                .interaction-modal-content {
                    background: var(--bg-dark);
                    width: 90%;
                    max-width: 600px;
                    border-radius: 20px;
                    border: 1px solid var(--border-color);
                    padding: 30px;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                .comment-item {
                    background: var(--bg-card);
                    padding: 15px;
                    border-radius: 12px;
                    margin-bottom: 15px;
                    border: 1px solid var(--border-color);
                }
                .comment-user { font-weight: 700; color: #667eea; margin-bottom: 5px; }
                .comment-date { font-size: 11px; color: var(--text-muted); }
                .comment-form textarea {
                    width: 100%;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 15px;
                    color: white;
                    margin-bottom: 15px;
                    resize: none;
                }
                
                /* Star Rating Styles */
                .star-rating {
                    display: flex;
                    flex-direction: row-reverse;
                    justify-content: flex-end;
                    margin-bottom: 15px;
                }
                .star-rating input { display: none; }
                .star-rating label {
                    font-size: 24px;
                    color: #444;
                    cursor: pointer;
                    transition: color 0.2s;
                    margin-right: 5px;
                }
                .star-rating label:before { content: '\\f005'; font-family: 'Font Awesome 6 Free'; font-weight: 900; }
                .star-rating input:checked ~ label { color: #f1c40f; }
                .star-rating label:hover, .star-rating label:hover ~ label { color: #f1c40f; }
                
                .star-display { color: #f1c40f; font-size: 12px; margin-bottom: 5px; }
                .average-rating-box {
                    background: rgba(241, 196, 15, 0.1);
                    border: 1px solid rgba(241, 196, 15, 0.3);
                    padding: 15px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                .avg-score { font-size: 24px; font-weight: 800; color: #f1c40f; }
                .avg-stars { color: #f1c40f; }
                .avg-count { font-size: 12px; color: var(--text-muted); }
                
                /* Dashboard Small Rating Styles */
                .module-card-rating {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-top: 8px;
                    font-size: 11px;
                    color: var(--text-muted);
                }
                .small-stars { color: #f1c40f; font-size: 10px; }
                .rating-value { color: #f1c40f; font-weight: 700; }
            </style>
        `;
        $('head').append(styles);
    },

    initDashboardUI: async function () {
        // 1. Get Notifications
        const result = await this.getNotifications();
        if (result.success && result.data) {
            const $globalContainer = $('#globalNotifications');
            let hasGlobal = false;

            result.data.forEach(notif => {
                if (notif.module_path) {
                    const $card = $(`.module-card[href="${notif.module_path}"]`);
                    if ($card.length) {
                        if (!$card.find('.notification-badge').length) {
                            $card.append('<div class="notification-badge">!</div>');
                        }
                    }
                } else {
                    hasGlobal = true;
                    const icon = notif.type === 'warning' ? 'exclamation-triangle' : (notif.type === 'success' ? 'check-circle' : 'info-circle');
                    $globalContainer.append(`
                        <div class="global-notif ${notif.type}">
                            <div class="global-notif-icon">
                                <i class="fas fa-${icon}"></i>
                            </div>
                            <div class="global-notif-content">
                                <div class="global-notif-title">${notif.title || 'Information'}</div>
                                <div class="global-notif-msg">${notif.message}</div>
                            </div>
                            <i class="fas fa-times" style="cursor: pointer; opacity: 0.5;" onclick="$(this).parent().fadeOut()"></i>
                        </div>
                    `);
                }
            });

            if (hasGlobal) $globalContainer.show();
        }

        // 2. Get All Ratings for Dashboard
        const ratingsRes = await this.getAllRatings();
        if (ratingsRes.success && ratingsRes.data) {
            ratingsRes.data.forEach(rating => {
                const $card = $(`.module-card[href="${rating.module_path}"]`);
                if ($card.length && rating.rating_count > 0) {
                    // Generate small stars
                    let starsHtml = '';
                    const score = rating.average_rating;
                    for (let i = 1; i <= 5; i++) {
                        if (i <= Math.floor(score)) {
                            starsHtml += '<i class="fas fa-star"></i>';
                        } else if (i === Math.ceil(score) && score % 1 !== 0) {
                            starsHtml += '<i class="fas fa-star-half-alt"></i>';
                        } else {
                            starsHtml += '<i class="far fa-star"></i>';
                        }
                    }

                    const ratingHtml = `
                        <div class="module-card-rating">
                            <span class="small-stars">${starsHtml}</span>
                            <span class="rating-value">${score}</span>
                            <span>(${rating.rating_count})</span>
                        </div>
                    `;

                    // On injecte après la description du module
                    $card.find('p').after(ratingHtml);
                }
            });
        }
    },

    initModuleUI: function () {
        const modulePath = window.location.pathname.split('/').pop() || 'index.html';

        // Add Comment Button
        const $btn = $('<div class="comment-button" title="Commentaires et Feedback"><i class="fas fa-comments"></i></div>');
        $('body').append($btn);

        // Modal structure
        const modalHtml = `
            <div class="interaction-modal" id="interactionModal">
                <div class="interaction-modal-content">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;"><i class="fas fa-comments"></i> Commentaires</h2>
                        <i class="fas fa-times" id="closeInteractionModal" style="cursor: pointer; font-size: 24px;"></i>
                    </div>
                    
                    <div id="averageRating" style="display: none;"></div>
                    
                    <div id="commentsList" style="margin-bottom: 30px;">
                        <p class="text-muted">Chargement des commentaires...</p>
                    </div>

                    <div class="comment-form">
                        <h3 style="margin-bottom: 15px;">Évaluer ce module</h3>
                        
                        <div class="star-rating">
                            <input type="radio" id="star5" name="rating" value="5"><label for="star5" title="Excellent"></label>
                            <input type="radio" id="star4" name="rating" value="4"><label for="star4" title="Très bon"></label>
                            <input type="radio" id="star3" name="rating" value="3"><label for="star3" title="Bon"></label>
                            <input type="radio" id="star2" name="rating" value="2"><label for="star2" title="Moyen"></label>
                            <input type="radio" id="star1" name="rating" value="1"><label for="star1" title="Médiocre"></label>
                        </div>

                        <input type="text" id="commentUser" placeholder="Votre nom" class="auth-input" style="width: 100%; margin-bottom: 15px; background: var(--bg-card); border: 1px solid var(--border-color); color: white; padding: 10px; border-radius: 8px;">
                        <textarea id="commentText" placeholder="Votre commentaire (optionnel)..." rows="3"></textarea>
                        <button id="submitComment" class="auth-btn connect" style="width: 100%;">Envoyer mon évaluation</button>
                    </div>
                </div>
            </div>
        `;
        $('body').append(modalHtml);

        $btn.on('click', () => {
            $('#interactionModal').css('display', 'flex');
            this.refreshComments(modulePath);
        });

        $('#closeInteractionModal').on('click', () => {
            $('#interactionModal').hide();
        });

        $('#submitComment').on('click', async () => {
            const user = $('#commentUser').val() || 'Anonyme';
            const text = $('#commentText').val();
            const rating = parseInt($('input[name="rating"]:checked').val() || 0);

            if (!text && rating === 0) {
                alert('Veuillez au moins donner une note ou un commentaire.');
                return;
            }

            const res = await this.addComment(modulePath, user, text, rating);
            if (res.success) {
                $('#commentText').val('');
                $('input[name="rating"]').prop('checked', false);
                this.refreshComments(modulePath);
            } else {
                alert('Erreur: ' + res.message);
            }
        });
    },

    refreshComments: async function (modulePath) {
        this.refreshRatingStats(modulePath);
        const result = await this.getComments(modulePath);
        const $list = $('#commentsList');
        $list.empty();

        if (result.success && result.data.length > 0) {
            result.data.forEach(c => {
                const date = new Date(c.created_at).toLocaleString('fr-FR');
                let stars = '';
                if (c.rating > 0) {
                    stars = '<div class="star-display">';
                    for (let i = 1; i <= 5; i++) {
                        stars += `<i class="${i <= c.rating ? 'fas' : 'far'} fa-star"></i>`;
                    }
                    stars += '</div>';
                }

                $list.append(`
                    <div class="comment-item">
                        <div class="comment-user">${c.user_name}</div>
                        ${stars}
                        <div>${c.comment_text || ''}</div>
                        <div class="comment-date">${date}</div>
                    </div>
                `);
            });
        } else {
            $list.append('<p class="text-muted">Aucune évaluation pour le moment. Soyez le premier !</p>');
        }
    },

    refreshRatingStats: async function (modulePath) {
        const result = await this.getRatingStats(modulePath);
        const $avgBox = $('#averageRating');

        if (result.success && result.data && result.data.rating_count > 0) {
            const stats = result.data;
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= Math.floor(stats.average_rating)) {
                    stars += '<i class="fas fa-star"></i>';
                } else if (i === Math.ceil(stats.average_rating) && stats.average_rating % 1 !== 0) {
                    stars += '<i class="fas fa-star-half-alt"></i>';
                } else {
                    stars += '<i class="far fa-star"></i>';
                }
            }

            $avgBox.html(`
                <div class="average-rating-box">
                    <div class="avg-score">${stats.average_rating}</div>
                    <div style="flex-grow: 1;">
                        <div class="avg-stars">${stars}</div>
                        <div class="avg-count">${stats.rating_count} évaluation(s)</div>
                    </div>
                </div>
            `).show();
        } else {
            $avgBox.hide();
        }
    }
};

$(document).ready(() => InteractionManager.initUI());
