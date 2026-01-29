// --- CONFIGURATION & ENV ---
// CACHE_BUST: 2026-01-29T13:38:00 FORCE DEPLOY FIX TX IMPORT
// INTENT: Centralize all IDs and IPs.
// Note: REDIRECT_URI must match the Discord Developer Portal settings exactly.
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.ranked-server.com:19132';
const DISCORD_CLIENT_ID = '1466307300024123627';

// TRAP: This MUST match the Redirect URI set in the Discord Developer Portal.
// We use /api/discord-auth for BOTH local and production for consistency
const REDIRECT_URI = window.location.hostname === 'localhost'
    ? 'http://localhost:5500/api/discord-auth'
    : `${window.location.protocol}//${window.location.host}/api/discord-auth`;

// --- ERROR HANDLING & LOGGING ---
// --- ERROR HANDLING & LOGGING ---
const logger = {
    error: (context, error) => {
        console.error(`[${context}]`, error);
        // CRITICAL: Alert user for immediate feedback during this debug phase
        if (context === 'Registration' || context === 'OAuth Success') {
            alert(`Error in ${context}: ${error.message}`);
        }
    },
    log: (context, message) => {
        console.log(`[${context}]`, message);
    }
};

// --- GLOBAL APP INSTANCE ---
window.app = {
    state: {
        player: null,
        route: 'home',
        pendingDiscordUser: null,
        queueing: false,
        timer: null,
        db: null
    },

    async init() {
        try {
            logger.log('App', 'Initializing...');

            // Dynamically import InstantDB
            const { init, id, tx } = await import('https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm');
            this.state.db = init({ appId: APP_ID });
            this.id = id;
            this.tx = tx; // Store tx specifically for transactions

            logger.log('App', `InstantDB Loaded. ID: ${!!id}, TX: ${!!tx}`);

            // Check for OAuth success parameters
            const urlParams = new URLSearchParams(window.location.search);
            const discordId = urlParams.get('discordId');

            if (discordId) {
                this.handleOAuthSuccess({
                    discordId,
                    username: urlParams.get('username'),
                    avatar: urlParams.get('avatar'),
                    email: urlParams.get('email')
                });
                return;
            }

            // Check Local Session
            const localId = localStorage.getItem('playerId');
            if (localId) {
                logger.log('App', 'Found local session: ' + localId);
                this.subscribeToPlayer(localId);
            } else {
                logger.log('App', 'No session found.');
            }

            // Bind all event listeners
            this.bindEvents();

            logger.log('App', 'Initialization complete');
        } catch (error) {
            logger.error('App Init', error);
            alert('Failed to initialize app. Please refresh the page.');
        }
    },

    // --- EVENT BINDING ---
    bindEvents() {
        try {
            // Navigation links
            document.querySelectorAll('[data-navigate]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const route = el.getAttribute('data-navigate');
                    this.navigate(route);
                });
            });

            // Login buttons
            document.querySelectorAll('[data-action="login"]').forEach(el => {
                el.addEventListener('click', () => this.loginWithDiscord());
            });

            // Logout buttons
            document.querySelectorAll('[data-action="logout"]').forEach(el => {
                el.addEventListener('click', () => this.logout());
            });

            // Registration form
            const regForm = document.getElementById('register-form');
            if (regForm) {
                regForm.addEventListener('submit', (e) => this.completeRegistration(e));
            }

            // Copy IP button
            const copyBtn = document.getElementById('copy-ip-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => this.copyIP());
            }

            // Queue button
            const queueBtn = document.getElementById('queue-btn');
            if (queueBtn) {
                queueBtn.addEventListener('click', () => this.toggleQueue());
            }

            logger.log('Events', 'All event listeners bound');
        } catch (error) {
            logger.error('Event Binding', error);
        }
    },

    // --- NAVIGATION ---
    navigate(route) {
        try {
            // Guard
            if (route === 'dashboard' && !this.state.player) {
                this.loginWithDiscord();
                return;
            }

            logger.log('Nav', route);

            // View Swapping
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            const view = document.getElementById(`view-${route}`);
            if (view) view.classList.remove('hidden');

            // Nav Active State
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            const link = document.querySelector(`.nav-link[data-route="${route}"]`);
            if (link) link.classList.add('active');

            this.state.route = route;

            // Specific Renderers
            if (route === 'dashboard') this.renderDashboard();
            if (route === 'leaderboard') this.renderLeaderboard();
        } catch (error) {
            logger.error('Navigate', error);
        }
    },

    // --- AUTH FLOW ---
    loginWithDiscord() {
        try {
            const scope = encodeURIComponent('identify email');
            const redirect = encodeURIComponent(REDIRECT_URI);
            const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirect}&response_type=code&scope=${scope}`;
            window.location.href = url;
        } catch (error) {
            logger.error('Login', error);
        }
    },

    logout() {
        try {
            localStorage.removeItem('playerId');
            this.state.player = null;
            window.location.href = '/';
        } catch (error) {
            logger.error('Logout', error);
        }
    },

    async handleOAuthSuccess(userData) {
        try {
            logger.log('Auth', `Discord User: ${userData.username}`);

            // INTENT: Link Discord identity to Minecraft IGN.
            this.state.db.subscribeQuery(
                { players: { $: { where: { discordId: userData.discordId } } } },
                (resp) => {
                    if (!resp.data) return;

                    const existingPlayer = resp.data.players[0];
                    if (existingPlayer) {
                        this.loginSuccess(existingPlayer.id);
                    } else {
                        this.state.pendingDiscordUser = userData;
                        this.showRegistrationModal(userData);
                    }
                }
            );
        } catch (error) {
            logger.error('OAuth Success', error);
        }
    },

    showRegistrationModal(discordUser) {
        try {
            const modal = document.getElementById('register-modal');
            if (modal) modal.classList.remove('hidden');

            const userEl = document.getElementById('reg-username');
            if (userEl) userEl.textContent = `Hi, ${discordUser.username}!`;

            if (discordUser.avatar) {
                const img = document.getElementById('reg-avatar');
                if (img) {
                    img.src = discordUser.avatar;
                    img.style.display = 'inline-block';
                }
            }
        } catch (error) {
            logger.error('Show Registration Modal', error);
        }
    },

    async completeRegistration(e) {
        e.preventDefault();
        try {
            if (!this.state.db) throw new Error('Database not initialized');

            const input = document.getElementById('reg-ign-input');
            const ign = input?.value?.trim();
            if (!ign) {
                alert('Please enter your Minecraft name');
                return;
            }

            const discordUser = this.state.pendingDiscordUser;
            if (!discordUser) throw new Error('No pending Discord user found');

            const newId = this.id();
            logger.log('Registration', `Creating player ${ign} with ID ${newId}`);

            await this.state.db.transact(
                this.state.db.tx.players[newId].update({
                    id: newId,
                    discordId: discordUser.discordId,
                    discordUsername: discordUser.username,
                    discordAvatar: discordUser.avatar,
                    email: discordUser.email,
                    ign: ign,
                    elo: 1000,
                    wins: 0,
                    losses: 0,
                    matchesPlayed: 0,
                    createdAt: Date.now(),
                    lastSeen: Date.now()
                })
            );

            logger.log('Registration', 'Transaction success');

            // Hide modal immediately
            document.getElementById('register-modal').classList.add('hidden');

            this.loginSuccess(newId);
        } catch (error) {
            logger.error('Registration', error);
            alert(`Registration failed: ${error.message}`);
        }
    },

    loginSuccess(playerId) {
        try {
            localStorage.setItem('playerId', playerId);
            window.location.href = '/';
        } catch (error) {
            logger.error('Login Success', error);
        }
    },

    // --- DATA HANDLING ---
    subscribeToPlayer(playerId) {
        try {
            this.state.db.subscribeQuery(
                { players: { $: { where: { id: playerId } } } },
                (resp) => {
                    if (!resp.data) return;
                    const p = resp.data.players[0];

                    if (p) {
                        this.state.player = p;
                        this.updateGlobalUserUI(p);
                        if (this.state.route === 'dashboard') this.renderDashboard();
                    } else {
                        localStorage.removeItem('playerId');
                    }
                }
            );
        } catch (error) {
            logger.error('Subscribe Player', error);
        }
    },

    updateGlobalUserUI(p) {
        try {
            // Robust selection: Try data attribute first, then specific IDs
            const btn = document.querySelector('[data-action="login"]') ||
                document.getElementById('nav-action-btn') ||
                document.getElementById('discord-login-btn');

            const info = document.getElementById('nav-user-info');

            if (btn) {
                // Change button to "PLAY"
                btn.textContent = "PLAY";
                btn.removeAttribute('data-action'); // Remove login action
                btn.setAttribute('data-navigate', 'dashboard'); // Set nav action

                // Re-bind click event since we changed attributes
                // Clone and replace to clear old listeners
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.navigate('dashboard');
                });
            }

            if (info) info.classList.remove('hidden');

            const ignEl = document.getElementById('nav-ign');
            if (ignEl) ignEl.textContent = p.ign;

            if (p.discordAvatar) {
                const img = document.getElementById('nav-avatar');
                if (img) {
                    img.src = p.discordAvatar;
                    img.style.display = 'block';
                }
            }
        } catch (error) {
            logger.error('Update UI', error);
        }
    },

    // --- RENDERERS ---
    renderDashboard() {
        try {
            if (!this.state.player) return;
            const p = this.state.player;
            const tier = this.getTier(p.matchesPlayed || 0);

            this.setElementContent('dash-avatar', (el) => {
                if (p.discordAvatar) {
                    el.src = p.discordAvatar;
                    el.style.display = 'block';
                }
            });

            this.setElementContent('dash-ign', p.ign);
            this.setElementContent('dash-tier', tier.label, (el) => {
                el.style.color = tier.color;
            });

            this.setElementContent('dash-wins', p.wins || 0);
            this.setElementContent('dash-losses', p.losses || 0);
            this.setElementContent('dash-elo', p.elo || 1000);

            let target = 20, next = "GOLD";
            if (tier.id === 'GOLD') { target = 50; next = "DIAMOND"; }
            if (tier.id === 'DIAMOND') { target = 200; next = "NETHERITE"; }

            const count = p.matchesPlayed || 0;
            const pct = Math.min(100, (count / target) * 100);

            this.setElementContent('dash-prog-bar', null, (el) => {
                el.style.width = `${pct}%`;
            });
            this.setElementContent('dash-prog-title', `ROAD TO ${next}`);
            this.setElementContent('dash-prog-count', `${count}/${target}`);
        } catch (error) {
            logger.error('Render Dashboard', error);
        }
    },

    renderLeaderboard() {
        try {
            const p = this.state.player;
            const unlocked = (p && (p.matchesPlayed || 0) >= 50);

            this.toggleElement('lb-locked', !unlocked);
            this.toggleElement('lb-table', unlocked);
        } catch (error) {
            logger.error('Render Leaderboard', error);
        }
    },

    // --- UTILITY FUNCTIONS ---
    setElementContent(id, content, callback) {
        const el = document.getElementById(id);
        if (el) {
            if (content !== null && content !== undefined) {
                el.textContent = content;
            }
            if (callback) callback(el);
        }
    },

    toggleElement(id, show) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('hidden', !show);
        }
    },

    getTier(matches) {
        if (matches >= 200) return { id: 'NETHERITE', label: 'NETHERITE', color: '#a8a29e' };
        if (matches >= 50) return { id: 'DIAMOND', label: 'DIAMOND', color: '#22d3ee' };
        if (matches >= 20) return { id: 'GOLD', label: 'GOLD', color: '#fbbf24' };
        return { id: 'IRON', label: 'IRON', color: '#cbd5e1' };
    },

    // --- QUEUE & ACTIONS ---
    copyIP() {
        try {
            navigator.clipboard.writeText(SERVER_IP);
            const btn = document.getElementById('copy-ip-btn');
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = "[COPIED!]";
                setTimeout(() => btn.textContent = originalText, 2000);
            }
        } catch (error) {
            logger.error('Copy IP', error);
        }
    },

    toggleQueue() {
        try {
            this.state.queueing = !this.state.queueing;
            const btn = document.getElementById('queue-btn');
            const status = document.getElementById('queue-status');

            if (this.state.queueing) {
                if (btn) btn.textContent = "LEAVE QUEUE";
                if (status) status.classList.remove('hidden');

                let sec = 0;
                this.state.timer = setInterval(() => {
                    sec++;
                    const m = Math.floor(sec / 60).toString().padStart(2, '0');
                    const s = (sec % 60).toString().padStart(2, '0');
                    this.setElementContent('queue-timer', `${m}:${s}`);
                }, 1000);
            } else {
                if (btn) btn.textContent = "JOIN QUEUE";
                if (status) status.classList.add('hidden');
                clearInterval(this.state.timer);
            }
        } catch (error) {
            logger.error('Toggle Queue', error);
        }
    }
};

// --- INITIALIZATION ---
// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}
