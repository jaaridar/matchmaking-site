// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.yourserver.com:19132';

// --- INITIALIZATION ---
import { init } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';

const db = init({ appId: APP_ID });

// --- STATE MANAGEMENT ---
let state = {
    user: null,
    player: null,
    view: 'auth', // 'auth', 'dashboard'
    ign: ''
};

// --- DOM ELEMENTS ---
const el = {
    authSection: document.getElementById('auth-section'),
    dashboardSection: document.getElementById('dashboard-section'),
    authForm: document.getElementById('auth-form'),
    ignInput: document.getElementById('ign'),
    statusMsg: document.getElementById('status-msg'),
    displayIgn: document.getElementById('display-ign'),
    queueStatus: document.getElementById('queue-status'),
    serverCmd: document.getElementById('server-command'),
    copyBtn: document.getElementById('copy-btn'),
    leaderboard: document.getElementById('leaderboard-list'),
    logoutBtn: document.getElementById('logout-btn')
};

// --- AUTH LOGIC ---
async function handleGuestSignIn(e) {
    if (e) e.preventDefault();
    state.ign = el.ignInput.value.trim();

    if (!state.ign) return showStatus('Please enter your Minecraft IGN.', 'error');

    showStatus('Creating your account... Please wait.', 'success');

    try {
        console.log('[Auth] Attempting Guest Sign-In with IGN:', state.ign);

        let user;

        if (db.auth && typeof db.auth.signInAsGuest === 'function') {
            const result = await db.auth.signInAsGuest();
            user = result.user;
        } else {
            console.warn('[Auth] signInAsGuest not found. Using fallback.');
            user = { id: `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
        }

        if (user) {
            console.log('[Auth] Success. User ID:', user.id);
            // 1. Immediately switch to dashboard view to show progress
            switchView('dashboard');
            el.displayIgn.textContent = state.ign;
            el.queueStatus.textContent = 'Setting up...';

            // 2. Register/Update profile
            await registerPlayerData(user.id, state.ign);

            // 3. Trigger data subscription
            handleOnAuth(user);
        } else {
            throw new Error('Sign in failed: No user returned');
        }
    } catch (err) {
        console.error('[Auth Error]', err);
        showStatus('Error: ' + (err.message || 'Please try again.'), 'error');
        switchView('auth');
    }
}

function handleOnAuth(user) {
    if (!user) return;

    // Update local state
    state.user = user;
    console.log('[Auth State] Handling user:', user.id);

    // Switch to dashboard immediately if we have a user
    switchView('dashboard');

    // Subscribe to player data to stay in sync
    db.subscribeQuery({ players: { $: { where: { id: user.id } } } }, (resp) => {
        if (resp.error) {
            console.error('[DB Error]', resp.error);
            return;
        }

        const players = resp.data?.players || [];
        if (players.length > 0) {
            state.player = players[0];
            renderDashboard();
        } else {
            console.log('[DB] Waiting for player profile to propagate...');
            // If we have local IGN, show it while we wait
            if (state.ign) {
                el.displayIgn.textContent = state.ign;
                el.queueStatus.textContent = 'Synchronizing...';
            }
        }
    });
}

async function registerPlayerData(id, ign) {
    console.log('[DB] Upserting profile:', ign);
    try {
        await db.transact(
            db.tx.players[id].update({
                id,
                ign,
                queued: true,
                createdAt: Date.now()
            })
        );
        console.log('[DB] Profile transaction sent.');
    } catch (err) {
        console.error('[DB Error]', err);
        showStatus('Failed to sync profile. Check DB permissions!', 'error');
    }
}

// --- UI LOGIC ---
function switchView(view) {
    state.view = view;
    el.authSection.classList.add('hidden');
    el.dashboardSection.classList.add('hidden');

    if (view === 'auth') {
        el.authSection.classList.remove('hidden');
    } else if (view === 'dashboard') {
        el.dashboardSection.classList.remove('hidden');
    }
}

function showStatus(msg, type) {
    el.statusMsg.textContent = msg;
    el.statusMsg.className = `status-msg ${type}`;
    el.statusMsg.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            if (el.statusMsg.textContent === msg) el.statusMsg.style.display = 'none';
        }, 5000);
    }
}

function renderDashboard() {
    if (!state.player) return;

    el.displayIgn.textContent = state.player.ign;

    if (state.player.queued) {
        el.queueStatus.textContent = 'In Queue';
        el.queueStatus.className = 'status-badge queued';
    } else {
        el.queueStatus.textContent = 'Idle';
        el.queueStatus.className = 'status-badge';
    }

    el.serverCmd.textContent = `/connect ${SERVER_IP}`;
}

// --- SUBSCRIPTIONS ---

// Auth state subscription for persistence
try {
    db.subscribeQuery({ _core: { user: {} } }, (resp) => {
        const user = resp.data?._core?.user;
        if (user) {
            handleOnAuth(user);
        } else if (state.user) {
            state.user = null;
            state.player = null;
            switchView('auth');
        }
    });
} catch (e) {
    console.warn('[Subs] Auth persistence subscription inactive.');
}

// Leaderboard subscription
db.subscribeQuery({ players: { $: { limit: 5, order: { server: 'createdAt', direction: 'desc' } } } }, (resp) => {
    if (resp.data) {
        const players = resp.data.players || [];
        el.leaderboard.innerHTML = '';
        players.forEach((p, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span><span class="rank">#${i + 1}</span> ${p.ign}</span> <span>${p.queued ? '🎮' : '💤'}</span>`;
            el.leaderboard.appendChild(li);
        });
    }
});

// --- EVENT LISTENERS ---
el.authForm.addEventListener('submit', handleGuestSignIn);

el.copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(el.serverCmd.textContent).then(() => {
        const original = el.copyBtn.textContent;
        el.copyBtn.textContent = 'Copied!';
        el.copyBtn.style.background = 'var(--success-color)';
        setTimeout(() => {
            el.copyBtn.textContent = original;
            el.copyBtn.style.background = '';
        }, 2000);
    });
});

el.logoutBtn.addEventListener('click', () => {
    if (db.auth && typeof db.auth.signOut === 'function') {
        db.auth.signOut();
    } else {
        state.user = null;
        state.player = null;
        switchView('auth');
    }
});

// Initial View
switchView('auth');
console.log('[App] Matchmaking ready.');
