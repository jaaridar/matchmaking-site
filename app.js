// --- CONFIG ---
const APP_ID = 'e9ac4449-93da-4eaf-96f0-78d0e4f548a9';
const SERVER_IP = 'mc.yourserver.com:19132';

// --- INITIALIZATION ---
import { init } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.17.4/+esm';

// We wrap the init to expose it in a way that feels like "new db" if needed, 
// though we use the standard functional init.
const db = init({ appId: APP_ID });

// --- STATE MANAGEMENT ---
let state = {
    user: null,
    player: null,
    view: 'auth', // 'auth', 'verify', 'dashboard'
    authMode: 'register', // 'register', 'login'
    email: '',
    ign: ''
};

// --- DOM ELEMENTS ---
const el = {
    authSection: document.getElementById('auth-section'),
    dashboardSection: document.getElementById('dashboard-section'),
    authForm: document.getElementById('auth-form'),
    verifyForm: document.getElementById('verify-form'),
    emailInput: document.getElementById('email'),
    ignInput: document.getElementById('ign'),
    ignContainer: document.getElementById('ign-field'),
    magicCodeInput: document.getElementById('magic-code'),
    statusMsg: document.getElementById('status-msg'),
    displayIgn: document.getElementById('display-ign'),
    queueStatus: document.getElementById('queue-status'),
    serverCmd: document.getElementById('server-command'),
    copyBtn: document.getElementById('copy-btn'),
    leaderboard: document.getElementById('leaderboard-list'),
    logoutBtn: document.getElementById('logout-btn'),
    toggleAuthMode: document.getElementById('toggle-auth-mode'),
    backToAuth: document.getElementById('back-to-auth')
};

// --- AUTH LOGIC ---

async function handleSendCode(e) {
    if (e) e.preventDefault();

    state.email = el.emailInput.value.trim();
    state.ign = el.ignInput.value.trim();

    if (!state.email) return showStatus('Please enter a valid email.', 'error');
    if (state.authMode === 'register' && !state.ign) return showStatus('IGN is required for registration.', 'error');

    showStatus('Sending magic code... Please wait.', 'success');

    try {
        console.log('[Auth] Sending magic code to:', state.email);
        await db.auth.sendMagicCode({ email: state.email });

        // Save IGN to local storage to persist across the code verification step
        if (state.ign) localStorage.setItem('pending_ign', state.ign);

        switchView('verify');
        showStatus('Code sent! Check your inbox (and spam folder).', 'success');
    } catch (err) {
        console.error('[Auth Error]', err);
        showStatus('Error: ' + (err.message || 'Check your internet or email and try again.'), 'error');
    }
}

async function handleVerifyCode(e) {
    if (e) e.preventDefault();

    const code = el.magicCodeInput.value.trim();
    if (!code || code.length < 6) return showStatus('Please enter the 6-digit code.', 'error');

    showStatus('Verifying code...', 'success');

    try {
        console.log('[Auth] Verifying code for:', state.email);
        await db.auth.signInWithMagicCode({ email: state.email, code });
        // Success handled by subscription
    } catch (err) {
        console.error('[Auth Error]', err);
        showStatus('Invalid or expired code. Please try again.', 'error');
    }
}

function handleOnAuth(user) {
    state.user = user;
    console.log('[Auth] User logged in:', user.id);

    // Check if we have a pending IGN
    const pendingIgn = state.ign || localStorage.getItem('pending_ign') || '';

    // Subscribe to player data
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
        } else if (pendingIgn) {
            // New user, create player record
            registerPlayerData(user.id, user.email, pendingIgn);
        } else {
            // Logged in but no profile and no pending IGN
            // Force them back to register mode to provide IGN
            state.authMode = 'register';
            switchView('auth');
            showStatus('Please provide your IGN to complete setup.', 'error');
        }
    });

    // Cleanup pending data
    localStorage.removeItem('pending_ign');
}

async function registerPlayerData(id, email, ign) {
    console.log('[DB] Registering player profile:', ign);
    try {
        await db.transact(
            db.tx.players[id].update({
                id,
                email,
                ign,
                queued: true,
                createdAt: Date.now()
            })
        );
    } catch (err) {
        console.error('[DB Error]', err);
        showStatus('Failed to save player profile.', 'error');
    }
}

// --- UI LOGIC ---

function switchView(view) {
    state.view = view;
    el.authSection.classList.add('hidden');
    el.dashboardSection.classList.add('hidden');
    el.verifyForm.classList.add('hidden');
    el.authForm.classList.add('hidden');

    if (view === 'auth') {
        el.authSection.classList.remove('hidden');
        el.authForm.classList.remove('hidden');
        if (state.authMode === 'login') el.ignContainer.classList.add('hidden');
        else el.ignContainer.classList.remove('hidden');
    } else if (view === 'verify') {
        el.authSection.classList.remove('hidden');
        el.verifyForm.classList.remove('hidden');
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

// Auth state subscription
db.subscribeQuery({ _core: { user: {} } }, (resp) => {
    const user = resp.data?._core?.user;
    if (user && !state.user) {
        handleOnAuth(user);
    } else if (!user && state.user) {
        state.user = null;
        state.player = null;
        switchView('auth');
    }
});

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

el.authForm.addEventListener('submit', handleSendCode);
el.verifyForm.addEventListener('submit', handleVerifyCode);

el.toggleAuthMode.addEventListener('click', () => {
    state.authMode = state.authMode === 'register' ? 'login' : 'register';
    el.toggleAuthMode.textContent = state.authMode === 'register' ? 'Already have a code? Login' : 'Need to register? Sign Up';
    switchView('auth');
});

el.backToAuth.addEventListener('click', () => {
    switchView('auth');
});

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
    db.auth.signOut();
});

// Initial View
switchView('auth');
console.log('[App] Initialized with App ID:', APP_ID);
