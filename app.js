// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.yourserver.com:19132';

// --- INITIALIZATION ---
// Using the latest version (0.22.116) as suggested for better Guest Auth support
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

        // Check if signInAsGuest exists on db.auth
        if (db.auth && typeof db.auth.signInAsGuest === 'function') {
            const result = await db.auth.signInAsGuest();
            user = result.user;
        } else {
            console.warn('[Auth] signInAsGuest not found in this SDK version. Falling back to local ID.');
            // Fallback for older SDK or mismatch: Option 1 - Client Side Guest ID
            user = { id: `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
        }

        if (user) {
            console.log('[Auth] Success. User ID:', user.id);
            // Save IGN and create player profile
            await registerPlayerData(user.id, state.ign);
        } else {
            throw new Error('Sign in failed: No user returned');
        }
    } catch (err) {
        console.error('[Auth Error]', err);
        showStatus('Error: ' + (err.message || 'Please try again.'), 'error');
    }
}

function handleOnAuth(user) {
    if (!user || user.id === state.user?.id) return;

    state.user = user;
    console.log('[Auth State] User detected:', user.id);

    // Subscribe to player data to see if we have a profile
    db.subscribeQuery({ players: { $: { where: { id: user.id } } } }, (resp) => {
        if (resp.error) {
            console.error('[DB Error]', resp.error);
            return;
        }

        const players = resp.data?.players || [];
        if (players.length > 0) {
            state.player = players[0];
            renderDashboard();
            switchView('dashboard');
        } else {
            console.log('[DB] No player profile found for user yet.');
        }
    });
}

async function registerPlayerData(id, ign) {
    console.log('[DB] Upserting player profile for ID:', id, 'IGN:', ign);
    try {
        await db.transact(
            db.tx.players[id].update({
                id,
                ign,
                queued: true,
                createdAt: Date.now()
            })
        );
        console.log('[DB] Player profile saved.');
    } catch (err) {
        console.error('[DB Error]', err);
        showStatus('Failed to save player profile. (Check Instance Permissions)', 'error');
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

    // Auto-hide success messages after 10s
    if (type === 'success') {
        setTimeout(() => {
            if (el.statusMsg.textContent === msg) el.statusMsg.style.display = 'none';
        }, 10000);
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

// Auth state subscription - keeps the app in sync with session
// Note: We use a try-catch for the subscription because different versions might have different structures
try {
    db.subscribeQuery({ _core: { user: {} } }, (resp) => {
        const user = resp.data?._core?.user;
        if (user) {
            handleOnAuth(user);
        } else if (state.user) {
            // Only sign out if we had a user and now don't
            state.user = null;
            state.player = null;
            switchView('auth');
        }
    });
} catch (e) {
    console.warn('[Subs] Could not subscribe to _core.user. Auth detection might be manual only.', e);
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
        showStatus('Logged out (Local Session Cleared)', 'success');
    }
});

// Initial View
switchView('auth');
console.log('[App] Initialized. App ID:', APP_ID);
