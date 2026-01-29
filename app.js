// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.yourserver.com:19132';

import { init } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';

const db = init({ appId: APP_ID });

// --- STATE ---
let state = {
    user: null,
    player: null,
    currentTier: 'ROOKIE' // ROOKIE, PLAYER, VETERAN
};

// --- DOM ELEMENTS ---
const el = {
    authSection: document.getElementById('auth-section'),
    dashboardSection: document.getElementById('dashboard-section'),
    authForm: document.getElementById('auth-form'),
    ignInput: document.getElementById('ign'),
    statusMsg: document.getElementById('status-msg'),

    // Dashboard Components
    displayIgn: document.getElementById('display-ign'),
    tierBadge: document.getElementById('tier-badge'),
    progressBar: document.getElementById('tier-progress-bar'),
    progressCount: document.getElementById('progress-count'),
    nextRankTitle: document.getElementById('next-rank-title'),
    motivationalMsg: document.getElementById('motivational-msg'),

    // Stats
    statsGrid: document.getElementById('stats-grid'),
    eloDisplay: document.getElementById('elo-display'),
    recordDisplay: document.getElementById('record-display'),

    // Features
    leaderboardContainer: document.getElementById('leaderboard-container'),
    leaderboardLock: document.getElementById('leaderboard-lock'),
    leaderboardList: document.getElementById('leaderboard-list'),

    // Actions
    logoutBtn: document.getElementById('logout-btn'),
    serverCmd: document.getElementById('server-cmd'),
    copyBtn: document.getElementById('copy-btn')
};

// --- AUTH LOGIC ---
async function handleLogin(e) {
    e.preventDefault();
    const ign = el.ignInput.value.trim();
    if (!ign) return;

    el.statusMsg.textContent = "Creating your profile...";
    el.statusMsg.style.display = 'block';

    try {
        let user;
        // Robust Auth Fallback
        if (db.auth && typeof db.auth.signInAsGuest === 'function') {
            const res = await db.auth.signInAsGuest();
            user = res.user;
        } else {
            console.warn('Auth fallback used');
            user = { id: `guest-${Date.now()}` }; // Local dev fallback
        }

        if (user) {
            // Immediate transition
            state.user = user;

            // Init or Fetch Profile
            await initPlayerProfile(user.id, ign);

            // Enter Dashboard
            enterDashboard(ign);
        }
    } catch (err) {
        console.error(err);
        el.statusMsg.textContent = "Connection failed. Please try again.";
        el.statusMsg.className = "status-msg error";
    }
}

async function initPlayerProfile(id, ign) {
    // We update the profile to ensure latest IGN is saved
    // In a real app, we'd check if it exists first to not overwrite stats
    // For this demo, we assume the backend handles "create if not exists" or we use a merge logic

    // Check if exists first (simulation using subscription would be cleaner, but we do quick write here)
    // We will blindly update IGN but keep other stats if they existed (in real DB logic)
    // Here we just write because InstantDB merge depends on permissions/setup.

    // For this frontend-first demo, we'll rely on the subscription to pull actual playing stats
    await db.transact(
        db.tx.players[id].update({
            id,
            ign,
            lastSeen: Date.now()
        })
    );
}

// --- PROGRESSION LOGIC ---
function calculateTier(matches) {
    if (matches >= 10) return 'VETERAN';
    if (matches >= 5) return 'PLAYER';
    return 'ROOKIE';
}

function updateGamification(player) {
    const matches = player.matchesPlayed || 0; // Default to 0
    const tier = calculateTier(matches);
    state.currentTier = tier;

    // 1. Update Badge
    updateBadge(tier);

    // 2. Update Progress Bar
    updateProgress(matches, tier);

    // 3. Unlock Features
    if (tier === 'ROOKIE') {
        el.statsGrid.classList.add('hidden');
        el.leaderboardContainer.classList.add('locked-feature');
        el.leaderboardLock.style.display = 'flex';
    } else if (tier === 'PLAYER') {
        el.statsGrid.classList.remove('hidden');
        el.leaderboardContainer.classList.add('locked-feature');
        el.leaderboardLock.style.display = 'flex';

        // Populate stats
        el.eloDisplay.textContent = player.elo || 1000;
        const wins = player.wins || 0;
        const losses = player.losses || 0;
        el.recordDisplay.textContent = `${wins} Wins - ${losses} Losses`;
    } else { // VETERAN
        el.statsGrid.classList.remove('hidden');
        el.leaderboardContainer.classList.remove('locked-feature');
        el.leaderboardLock.style.display = 'none';

        // Populate stats & leaderboard
        el.eloDisplay.textContent = player.elo || 1000;
        // In real app, we'd fetch leaderboard list here
        renderMockLeaderboard();
    }
}

function updateBadge(tier) {
    el.tierBadge.className = 'badge'; // reset
    if (tier === 'ROOKIE') {
        el.tierBadge.classList.add('badge-rookie');
        el.tierBadge.innerHTML = '🔵 Rookie';
    } else if (tier === 'PLAYER') {
        el.tierBadge.classList.add('badge-player');
        el.tierBadge.innerHTML = '🟢 Player';
    } else {
        el.tierBadge.classList.add('badge-veteran');
        el.tierBadge.innerHTML = '🟡 Veteran';
    }
}

function updateProgress(matches, tier) {
    let target = 5;
    let current = matches;
    let label = "Road to Player Tier";
    let msg = "Play 5 matches to unlock your stats.";

    if (tier === 'PLAYER') {
        target = 10;
        label = "Road to Veteran";
        msg = "Reach 10 matches to unlock the Global Leaderboard.";
    } else if (tier === 'VETERAN') {
        target = 100; // Arbitrary high number for veteran
        label = "Season Progress";
        msg = "Climb the ranks and become a legend.";
    }

    const percentage = Math.min(100, (current / target) * 100);
    el.progressBar.style.width = `${percentage}%`;
    el.progressCount.textContent = `${current} / ${target} Matches`;
    el.nextRankTitle.textContent = label;
    el.motivationalMsg.textContent = msg;
}

// --- UI TRIGGERS ---
function enterDashboard(ign) {
    el.authSection.classList.add('hidden');
    el.dashboardSection.classList.remove('hidden');
    el.displayIgn.textContent = ign;
    el.serverCmd.textContent = `/connect ${SERVER_IP}`;

    // Subscribe to live data logic
    startSubscription(state.user.id);
}

function startSubscription(userId) {
    // Subscribe to SELF
    db.subscribeQuery({ players: { $: { where: { id: userId } } } }, (resp) => {
        if (!resp.data) return;
        const p = resp.data.players[0];
        if (p) {
            // Apply gamification updates based on live data
            updateGamification(p);
        } else {
            // New player default state logic
            updateGamification({ matchesPlayed: 0 }); // Init visual state 0
        }
    });
}

function renderMockLeaderboard() {
    // Only called if unlocked
    const mocks = [
        { name: "SpeedDemon", elo: 2100 },
        { name: "BlockMaster", elo: 1950 },
        { name: "NetherKing", elo: 1840 }
    ];

    el.leaderboardList.innerHTML = mocks.map((p, i) => `
        <li class="leaderboard-item">
            <span><span class="rank-num">#${i + 1}</span> ${p.name}</span>
            <span style="color: var(--primary); font-weight:700;">${p.elo}</span>
        </li>
    `).join('');
}

// --- EVENTS ---
el.authForm.addEventListener('submit', handleLogin);
el.copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(el.serverCmd.innerText);
    el.copyBtn.textContent = "Copied!";
    setTimeout(() => el.copyBtn.innerText = "Copy", 2000);
});
el.logoutBtn.addEventListener('click', () => {
    location.reload(); // Simple logout for now/Guest mode
});
