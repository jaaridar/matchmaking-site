// --- CONFIGURATION & ENV ---
// INTENT: Centralize all IDs and IPs.
// Note: REDIRECT_URI must match the Discord Developer Portal settings exactly.
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.ranked-server.com:19132';
const DISCORD_CLIENT_ID = '1466307300024123627';

// INTENT: Handle local development vs production callback URLs automatically.
// TRAP: This MUST match the Redirect URI set in the Discord Developer Portal.
const REDIRECT_URI = window.location.hostname === 'localhost'
    ? 'http://localhost:5500/api/discord-auth'
    : 'https://matchmaking-site.vercel.app/api/discord-auth';

import { init, id } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';
const db = init({ appId: APP_ID });

window.app = {
    state: {
        player: null,
        route: 'home',
        pendingDiscordUser: null, // Temp storage during registration
        queueing: false,
        timer: null
    },

    async init() {
        console.log('[App] Initializing...');

        // Check for success/error parameters after OAuth flow
        // The API redirects here after processing
        const urlParams = new URLSearchParams(window.location.search);
        const discordId = urlParams.get('discordId');

        if (discordId) {
            this.handleOAuthSuccess(Object.fromEntries(urlParams));
            return;
        }

        // Check Local Session
        const localId = localStorage.getItem('playerId');
        if (localId) {
            console.log('[App] Found local session:', localId);
            this.subscribeToPlayer(localId);
        } else {
            console.log('[App] No session found.');
        }
    },

    // --- NAVIGATION ---
    navigate(route, event) {
        if (event) event.preventDefault();

        // Guard
        if (route === 'dashboard' && !this.state.player) {
            this.loginWithDiscord();
            return;
        }

        console.log('[Nav]', route);

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
    },

    // --- AUTH FLOW ---
    loginWithDiscord() {
        const scope = encodeURIComponent('identify email');
        const redirect = encodeURIComponent(REDIRECT_URI);
        const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirect}&response_type=code&scope=${scope}`;
        window.location.href = url;
    },

    logout() {
        localStorage.removeItem('playerId');
        this.state.player = null;
        window.location.href = '/';
    },

    async handleOAuthSuccess(userData) {
        // INTENT: Link Discord identity to Minecraft IGN.
        db.subscribeQuery({ players: { $: { where: { discordId: userData.discordId } } } }, (resp) => {
            if (!resp.data) return;

            const existingPlayer = resp.data.players[0];
            if (existingPlayer) {
                this.loginSuccess(existingPlayer.id);
            } else {
                this.state.pendingDiscordUser = userData;
                this.showRegistrationModal(userData);
            }
        });
    },

    showRegistrationModal(discordUser) {
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
    },

    async completeRegistration(e) {
        e.preventDefault();
        const ign = document.getElementById('reg-ign-input').value.trim();
        if (!ign) return;

        const discordUser = this.state.pendingDiscordUser;
        const newId = id();

        try {
            await db.transact(db.tx.players[newId].update({
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
            }));

            this.loginSuccess(newId);
        } catch (err) {
            console.error('[Reg Error]', err);
            alert('Registration failed.');
        }
    },

    loginSuccess(playerId) {
        localStorage.setItem('playerId', playerId);
        window.location.href = '/';
    },

    // --- DATA HANDLING ---
    subscribeToPlayer(playerId) {
        db.subscribeQuery({ players: { $: { where: { id: playerId } } } }, (resp) => {
            if (!resp.data) return;
            const p = resp.data.players[0];

            if (p) {
                this.state.player = p;
                this.updateGlobalUserUI(p);
                if (this.state.route === 'dashboard') this.renderDashboard();
            } else {
                localStorage.removeItem('playerId');
            }
        });
    },

    updateGlobalUserUI(p) {
        const btn = document.getElementById('discord-login-btn');
        const info = document.getElementById('nav-user-info');

        if (btn) {
            btn.textContent = "PLAY";
            btn.onclick = () => app.navigate('dashboard');
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
    },

    // --- RENDERERS ---
    renderDashboard() {
        if (!this.state.player) return;
        const p = this.state.player;
        const tier = this.getTier(p.matchesPlayed || 0);

        const avatar = document.getElementById('dash-avatar');
        if (avatar && p.discordAvatar) {
            avatar.src = p.discordAvatar;
            avatar.style.display = 'block';
        }

        const ign = document.getElementById('dash-ign');
        if (ign) ign.textContent = p.ign;

        const tierEl = document.getElementById('dash-tier');
        if (tierEl) {
            tierEl.textContent = tier.label;
            tierEl.style.color = tier.color;
        }

        ['wins', 'losses', 'elo'].forEach(stat => {
            const el = document.getElementById(`dash-${stat}`);
            if (el) el.textContent = p[stat] || (stat === 'elo' ? 1000 : 0);
        });

        let target = 20; let next = "GOLD";
        if (tier.id === 'GOLD') { target = 50; next = "DIAMOND"; }
        if (tier.id === 'DIAMOND') { target = 200; next = "NETHERITE"; }

        const count = p.matchesPlayed || 0;
        const pct = Math.min(100, (count / target) * 100);

        const bar = document.getElementById('dash-prog-bar');
        if (bar) bar.style.width = `${pct}%`;

        const title = document.getElementById('dash-prog-title');
        if (title) title.textContent = `ROAD TO ${next}`;

        const countEl = document.getElementById('dash-prog-count');
        if (countEl) countEl.textContent = `${count}/${target}`;
    },

    renderLeaderboard() {
        const p = this.state.player;
        const unlocked = (p && (p.matchesPlayed || 0) >= 50);

        const lockedEl = document.getElementById('lb-locked');
        const tableEl = document.getElementById('lb-table');

        if (lockedEl) lockedEl.classList.toggle('hidden', unlocked);
        if (tableEl) tableEl.classList.toggle('hidden', !unlocked);
    },

    getTier(matches) {
        if (matches >= 200) return { id: 'NETHERITE', label: 'NETHERITE', color: '#a8a29e' };
        if (matches >= 50) return { id: 'DIAMOND', label: 'DIAMOND', color: '#22d3ee' };
        if (matches >= 20) return { id: 'GOLD', label: 'GOLD', color: '#fbbf24' };
        return { id: 'IRON', label: 'IRON', color: '#cbd5e1' };
    }
};

// --- GLOBAL EVENTS ---
const regForm = document.getElementById('register-form');
if (regForm) regForm.addEventListener('submit', (e) => app.completeRegistration(e));

const copyBtn = document.getElementById('copy-ip-btn');
if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(SERVER_IP);
        copyBtn.textContent = "[COPIED!]";
        setTimeout(() => copyBtn.textContent = "[COPY]", 2000);
    });
}

const queueBtn = document.getElementById('queue-btn');
if (queueBtn) {
    queueBtn.addEventListener('click', () => {
        app.state.queueing = !app.state.queueing;
        const status = document.getElementById('queue-status');

        if (app.state.queueing) {
            queueBtn.textContent = "LEAVE QUEUE";
            if (status) status.classList.remove('hidden');
            let sec = 0;
            app.state.timer = setInterval(() => {
                sec++;
                const m = Math.floor(sec / 60).toString().padStart(2, '0');
                const s = (sec % 60).toString().padStart(2, '0');
                const timerEl = document.getElementById('queue-timer');
                if (timerEl) timerEl.textContent = `${m}:${s}`;
            }, 1000);
        } else {
            queueBtn.textContent = "JOIN QUEUE";
            if (status) status.classList.add('hidden');
            clearInterval(app.state.timer);
        }
    });
}

app.init();
