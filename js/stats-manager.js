/**
 * Stats Manager - Handles visit tracking and dashboard statistics
 */

const StatsManager = {
    apiUrl: 'api/stats.php',

    /**
     * Track a visit to a module
     * @param {string} moduleName - Name of the module
     * @param {string} modulePath - Relative path or unique identifier
     */
    trackVisit: async function (moduleName, modulePath) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'track_visit',
                    moduleName: moduleName,
                    modulePath: modulePath
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Stats Tracking Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get all module statistics (inclut les modules jamais visités)
     */
    getStats: async function () {
        try {
            const response = await fetch(`${this.apiUrl}?action=get_stats`);
            return await response.json();
        } catch (error) {
            console.error('Fetch Stats Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get daily visit counts for the activity chart
     * @param {number} days - Number of trailing days to include (default 14)
     */
    getTimeseries: async function (days = 14) {
        try {
            const response = await fetch(`${this.apiUrl}?action=get_visits_timeseries&days=${days}`);
            return await response.json();
        } catch (error) {
            console.error('Fetch Timeseries Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Initialize statistics database (one-time setup)
     */
    initDB: async function () {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'init' })
            });
            return await response.json();
        } catch (error) {
            console.error('Stats Init Error:', error);
            return { success: false, error: error.message };
        }
    }
};

// Auto-track module clicks and page views
$(document).ready(function () {
    // Only track if we are on index.html
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname === '') {
        // Track Home Page Visit only ONCE per session
        if (!sessionStorage.getItem('home_visited')) {
            StatsManager.trackVisit('Tableau de Bord (Index)', 'index.html');
            sessionStorage.setItem('home_visited', 'true');
        }

        // Track clicks on modules
        $('.modules-grid').on('click', '.module-card', function () {
            const moduleName = $(this).find('.module-title').text().trim();
            const modulePath = $(this).attr('href');

            if (moduleName && modulePath) {
                StatsManager.trackVisit(moduleName, modulePath);
            }
        });
    }
});
