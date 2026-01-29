// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.ranked-server.com:19132';

// --- INIT ---
import { init } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';
const db = init({ appId: APP_ID });

window.app = {
    state: {
        user: null,
        player: null,
        route: 'home',
        queueing: false,
        timer: null
    },

    // --- NAV ---
    navigate(route) {
        // Auth Guard
        if (!this.state.user && (route === 'dashboard')) {
            this.showAuth();
            return;
        }

        console.log('Navigating:', route);

        // Hide All Views
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${route}`).classList.remove('hidden');

        // Update Nav Link Active
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const link = document.querySelector(`.nav-link[data-route="${route}"]`);
        if (link) link.classList.add('active');

        this.state.route = route;

        // Render
        if (route === 'dashboard') this.renderDashboard();
        if (route === 'leaderboard') this.renderLeaderboard();
    },

    showAuth() { document.getElementById('auth-modal').style.display = 'flex'; },
    hideAuth() { document.getElementById('auth-modal').style.display = 'none'; },

    // --- AUTH ---
    async handleLogin(e) {
        e.preventDefault();
        const ign = document.getElementById('ign-input').value.trim();
        if (!ign) return;

        document.getElementById('auth-msg').textContent = "Connecting...";

        try {
            let user;
            if (db.auth && typeof db.auth.signInAsGuest === 'function') {
                const res = await db.auth.signInAsGuest();
                user = res.user;
            } else {
                user = { id: `manual-${Date.now()}` }; // Fallback
            }

            if (user) {
                // Init Profile
                await db.transact(db.tx.players[user.id].update({ id: user.id, ign, lastSeen: Date.now() }));
                this.hideAuth();
                this.navigate('dashboard');
            }
        } catch (err) {
            console.error(err);
            document.getElementById('auth-msg').textContent = "Login Failed";
        }
    },

    // --- LOGIC ---
    renderDashboard() {
        if (!this.state.player) return;
        const p = this.state.player;
        const tier = this.getTier(p.matchesPlayed || 0);

        document.getElementById('dash-ign').textContent = p.ign;
        document.getElementById('dash-tier').textContent = tier.label;
        document.getElementById('dash-tier').style.color = tier.color;

        document.getElementById('dash-wins').textContent = p.wins || 0;
        document.getElementById('dash-losses').textContent = p.losses || 0;
        document.getElementById('dash-elo').textContent = p.elo || 1000;

        // Progress
        let target = 20;
        let next = "GOLD";
        if (tier.id === 'GOLD') { target = 50; next = "DIAMOND"; }
        if (tier.id === 'DIAMOND') { target = 200; next = "NETHERITE"; }

        const count = p.matchesPlayed || 0;
        const pct = Math.min(100, (count / target) * 100);

        document.getElementById('dash-prog-bar').style.width = `${pct}%`;
        document.getElementById('dash-prog-title').textContent = `ROAD TO ${next}`;
        document.getElementById('dash-prog-count').textContent = `${count}/${target}`;
    },

    renderLeaderboard() {
        const p = this.state.player;
        const unlocked = (p && (p.matchesPlayed || 0) >= 50);

        if (unlocked) {
            document.getElementById('lb-locked').classList.add('hidden');
            document.getElementById('lb-table').classList.remove('hidden');
            // Mock Data for View
            const tbody = document.getElementById('lb-body');
            tbody.innerHTML = `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 1rem;">#1</td>
                    <td style="padding: 1rem; font-weight:bold;">Dream</td>
                    <td style="padding: 1rem; color: #a8a29e;">NETHERITE</td>
                    <td style="padding: 1rem; color: #3b9dff;">2450</td>
                </tr>
            `;
        } else {
            document.getElementById('lb-locked').classList.remove('hidden');
            document.getElementById('lb-table').classList.add('hidden');
        }
    },

    getTier(matches) {
        if (matches >= 200) return { id: 'NETHERITE', label: 'NETHERITE', color: '#a8a29e' };
        if (matches >= 50) return { id: 'DIAMOND', label: 'DIAMOND', color: '#22d3ee' };
        if (matches >= 20) return { id: 'GOLD', label: 'GOLD', color: '#fbbf24' };
        return { id: 'IRON', label: 'IRON', color: '#cbd5e1' };
    }
};

// --- EVENTS ---
document.getElementById('auth-form').addEventListener('submit', (e) => app.handleLogin(e));
document.getElementById('dash-logout').addEventListener('click', () => location.reload()); // Simple logout

// Session Check
db.subscribeQuery({ _core: { user: {} } }, (resp) => {
    const user = resp.data?._core?.user;
    if (user && !app.state.user) {
        app.state.user = user;
        // Update Nav UI
        document.getElementById('nav-action-btn').classList.add('hidden');
        document.getElementById('nav-user-info').classList.remove('hidden');

        // Fetch Profile
        db.subscribeQuery({ players: { $: { where: { id: user.id } } } }, (pResp) => {
            const p = pResp.data?.players[0];
            if (p) {
                app.state.player = p;
                document.getElementById('nav-ign').textContent = p.ign;
                if (app.state.route === 'home') app.navigate('dashboard');
            }
        });
    }
});

// Queue Button
document.getElementById('queue-btn').addEventListener('click', () => {
    const btn = document.getElementById('queue-btn');
    const status = document.getElementById('queue-status');
    app.state.queueing = !app.state.queueing;

    if (app.state.queueing) {
        btn.textContent = "LEAVE QUEUE";
        btn.style.background = "#333";
        status.classList.remove('hidden');
        // Timer logic
        let sec = 0;
        app.state.timer = setInterval(() => {
            sec++;
            const m = Math.floor(sec / 60).toString().padStart(2, '0');
            const s = (sec % 60).toString().padStart(2, '0');
            document.getElementById('queue-timer').textContent = `${m}:${s}`;
        }, 1000);
    } else {
        btn.textContent = "JOIN QUEUE";
        btn.style.background = ""; // reset to css
        status.classList.add('hidden');
        clearInterval(app.state.timer);
    }
});
