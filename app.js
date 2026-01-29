// --- CONFIGURATION & ENV ---
// 3-LAYER ARCHITECTURE REFIT
const SERVER_IP = 'mc.ranked-server.com:19132';

// --- ERROR HANDLING & LOGGING ---
const logger = {
    error: (context, error) => {
        console.error(`[${context}]`, error);
        // Alert user for immediate feedback during this phase
        if (['Auth', 'Registration', 'Email'].includes(context)) {
            alert(`Error in ${context}: ${error.message || error}`);
        }
    },
    log: (context, message) => {
        console.log(`[${context}]`, message);
    }
};

// --- GLOBAL APP INSTANCE ---
window.app = {
    state: {
        user: null,
        route: 'home',
        queueing: false,
        timer: null
    },

    async init() {
        try {
            logger.log('App', 'Initializing (3-Layer Mode)...');

            // Load user from API
            await this.loadUser();

            // Bind all event listeners
            this.bindEvents();

            logger.log('App', 'Initialization complete');
        } catch (error) {
            logger.error('App Init', error);
        }
    },

    async loadUser() {
        try {
            const res = await fetch('/api/me');
            if (res.status === 401) {
                logger.log('Auth', 'No active session');
                this.state.user = null;
                this.updateGlobalUserUI(null);
                return;
            }

            if (!res.ok) throw new Error('Failed to load user profile');

            const data = await res.json();
            this.state.user = data.user;
            logger.log('Auth', `Logged in: ${this.state.user.discordUsername} (${this.state.user.status})`);

            this.handleUserStatus(this.state.user);
            this.updateGlobalUserUI(this.state.user);

        } catch (error) {
            logger.error('LoadUser', error);
        }
    },

    handleUserStatus(user) {
        // Clear all modals first
        document.querySelectorAll('[id$="-modal"]').forEach(el => el.classList.add('hidden'));

        if (user.status === 'needsEmail') {
            this.showEmailModal(user);
        } else if (user.status === 'needsIGN') {
            this.showRegistrationModal(user);
        } else if (user.status === 'earlyAccess') {
            logger.log('App', 'User has Early Access');
        }
    },

    // --- EVENT BINDING ---
    bindEvents() {
        try {
            // Navigation
            document.querySelectorAll('[data-navigate]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.navigate(el.getAttribute('data-navigate'));
                });
            });

            // Login
            document.querySelectorAll('[data-action="login"]').forEach(el => {
                el.addEventListener('click', () => {
                    window.location.href = '/api/discord-auth';
                });
            });

            // Logout
            document.querySelectorAll('[data-action="logout"]').forEach(el => {
                el.addEventListener('click', () => this.logout());
            });

            // Email Flows
            const emailSendForm = document.getElementById('email-send-form');
            if (emailSendForm) {
                emailSendForm.addEventListener('submit', (e) => this.sendVerificationEmail(e));
            }

            const emailVerifyForm = document.getElementById('email-verify-form');
            if (emailVerifyForm) {
                emailVerifyForm.addEventListener('submit', (e) => this.verifyEmail(e));
            }

            const resendBtn = document.getElementById('resend-btn');
            if (resendBtn) {
                resendBtn.addEventListener('click', () => {
                    document.getElementById('email-step-2').classList.add('hidden');
                    document.getElementById('email-step-1').classList.remove('hidden');
                });
            }

            // Registration (IGN)
            const regForm = document.getElementById('register-form');
            if (regForm) {
                regForm.addEventListener('submit', (e) => this.saveIGN(e));
            }

            // Copy IP
            const copyBtn = document.getElementById('copy-ip-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => this.copyIP());
            }

            // Queue
            const queueBtn = document.getElementById('queue-btn');
            if (queueBtn) {
                queueBtn.addEventListener('click', () => this.toggleQueue());
            }

        } catch (error) {
            logger.error('Event Binding', error);
        }
    },

    // --- NAVIGATION ---
    navigate(route) {
        if (route === 'dashboard' && !this.state.user) {
            window.location.href = '/api/discord-auth';
            return;
        }

        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        const view = document.getElementById(`view-${route}`);
        if (view) view.classList.remove('hidden');

        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const link = document.querySelector(`.nav-link[data-route="${route}"]`);
        if (link) link.classList.add('active');

        this.state.route = route;
        if (route === 'dashboard') this.renderDashboard();
        if (route === 'leaderboard') this.renderLeaderboard();
    },

    async logout() {
        // Since we used HttpOnly cookies, we'll need to clear it via backend or expire it
        // We'll redirect to a logout endpoint that clears the cookie
        window.location.href = '/api/logout';
    },

    // --- STEP: EMAIL ---
    showEmailModal(user) {
        const modal = document.getElementById('email-modal');
        if (modal) modal.classList.remove('hidden');
        document.getElementById('email-input').value = user.email || '';
    },

    async sendVerificationEmail(e) {
        e.preventDefault();
        const email = document.getElementById('email-input').value;
        try {
            const res = await fetch('/api/auth/email-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            if (!res.ok) throw new Error('Failed to send email');

            document.getElementById('display-email').textContent = email;
            document.getElementById('email-step-1').classList.add('hidden');
            document.getElementById('email-step-2').classList.remove('hidden');
        } catch (error) {
            logger.error('Email', error);
        }
    },

    async verifyEmail(e) {
        e.preventDefault();
        const code = document.getElementById('code-input').value;
        try {
            const res = await fetch('/api/auth/email-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            if (!res.ok) throw new Error('Invalid or expired code');

            // Success: Reload user to get new status
            await this.loadUser();
        } catch (error) {
            logger.error('Email', error);
        }
    },

    // --- STEP: IGN ---
    showRegistrationModal(user) {
        const modal = document.getElementById('register-modal');
        if (modal) modal.classList.remove('hidden');
    },

    async saveIGN(e) {
        e.preventDefault();
        const ign = document.getElementById('reg-ign-input').value;
        try {
            const res = await fetch('/api/profile/save-ign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ign })
            });
            if (!res.ok) throw new Error('Failed to save IGN');

            await this.loadUser();
        } catch (error) {
            logger.error('Registration', error);
        }
    },

    // --- UI UPDATES ---
    updateGlobalUserUI(user) {
        const btn = document.getElementById('discord-login-btn');
        const info = document.getElementById('nav-user-info');
        const ignEl = document.getElementById('nav-ign');
        const avatarImg = document.getElementById('nav-avatar');

        if (!user) {
            if (btn) btn.textContent = "LOGIN";
            if (info) info.classList.add('hidden');
            return;
        }

        if (user.status === 'earlyAccess') {
            if (btn) {
                btn.textContent = "PLAY";
                btn.setAttribute('data-navigate', 'dashboard');
            }
            if (info) info.classList.remove('hidden');
            if (ignEl) ignEl.textContent = user.ign || 'Rookie';
            if (avatarImg && user.avatar) {
                avatarImg.src = user.avatar;
                avatarImg.style.display = 'block';
            }
        } else {
            // Processing status
            if (btn) btn.textContent = "FINISH SETUP";
        }
    },

    renderDashboard() {
        const user = this.state.user;
        if (!user || user.status !== 'earlyAccess') return;

        this.setElementContent('dash-ign', user.ign);
        this.setElementContent('dash-avatar', (el) => {
            if (user.avatar) {
                el.src = user.avatar;
                el.style.display = 'block';
            }
        });

        this.setElementContent('dash-tier', 'IRON TIER');
    },

    renderLeaderboard() {
        const user = this.state.user;
        const unlocked = user && user.status === 'earlyAccess';
        this.toggleElement('lb-locked', !unlocked);
        this.toggleElement('lb-table', unlocked);
    },

    // --- UTILITIES ---
    setElementContent(id, content, callback) {
        const el = document.getElementById(id);
        if (el) {
            if (typeof content === 'string' || typeof content === 'number') el.textContent = content;
            if (callback) callback(el);
        }
    },

    toggleElement(id, show) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !show);
    },

    copyIP() {
        navigator.clipboard.writeText(SERVER_IP);
        const btn = document.getElementById('copy-ip-btn');
        if (btn) {
            const old = btn.textContent;
            btn.textContent = "[COPIED!]";
            setTimeout(() => btn.textContent = old, 2000);
        }
    },

    toggleQueue() {
        this.state.queueing = !this.state.queueing;
        const btn = document.getElementById('queue-btn');
        const status = document.getElementById('queue-status');
        if (this.state.queueing) {
            btn.textContent = "LEAVE QUEUE";
            status.classList.remove('hidden');
            let s = 0;
            this.state.timer = setInterval(() => {
                s++;
                const m = Math.floor(s / 60).toString().padStart(2, '0');
                const sec = (s % 60).toString().padStart(2, '0');
                document.getElementById('queue-timer').textContent = `${m}:${sec}`;
            }, 1000);
        } else {
            btn.textContent = "JOIN QUEUE";
            status.classList.add('hidden');
            clearInterval(this.state.timer);
        }
    }
};

// INITIALIZE
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}
