// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.yourserver.com:19132';

import { init } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';

const db = init({ appId: APP_ID });

// --- STATE ---
let state = {
    user: null,
    player: null,
    currentTier: 'IRON' // IRON, GOLD, DIAMOND, NETHERITE
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
    // 0-19: IRON
    // 20-49: GOLD 
    // 50-199: DIAMOND
    // 200+: NETHERITE

    // Assuming the user meant:
    // First progression 0-20 (Reach 20 to unlock next)
    // Second 50
    // Third 200

    if (matches >= 200) return 'NETHERITE';
    if (matches >= 50) return 'DIAMOND';
    if (matches >= 20) return 'GOLD';
    return 'IRON';
}

function updateGamification(player) {
    const matches = player.matchesPlayed || 0;
    const tier = calculateTier(matches);
    state.currentTier = tier;

    // 1. Update Badge
    updateBadge(tier);

    // 2. Update Progress Bar
    updateProgress(matches, tier);

    // 3. Unlock Features

    // IRON (0-19): Basic View
    if (tier === 'IRON') {
        el.statsGrid.classList.add('hidden');
        el.leaderboardContainer.classList.add('locked-feature');
        el.leaderboardLock.style.display = 'flex';
        el.leaderboardLock.querySelector('.lock-text').textContent = 'Reach DIAMOND Tier to Unlock';
        el.leaderboardLock.querySelector('div:last-child').textContent = '(50+ Matches)';
    }
    // GOLD (20-49): Stats Unlock
    else if (tier === 'GOLD') {
        el.statsGrid.classList.remove('hidden');
        el.leaderboardContainer.classList.add('locked-feature');
        el.leaderboardLock.style.display = 'flex';

        // Populate stats
        renderStats(player);
    }
    // DIAMOND (50-199): Leaderboard Unlock
    else if (tier === 'DIAMOND') {
        el.statsGrid.classList.remove('hidden');
        el.leaderboardContainer.classList.remove('locked-feature');
        el.leaderboardLock.style.display = 'none';

        // Populate stats & leaderboard
        renderStats(player);
        renderMockLeaderboard();
    }
    // NETHERITE (200+): Elite Status
    else {
        el.statsGrid.classList.remove('hidden');
        el.leaderboardContainer.classList.remove('locked-feature');
        el.leaderboardLock.style.display = 'none';

        renderStats(player);
        renderMockLeaderboard();
    }
}

function renderStats(player) {
    el.eloDisplay.textContent = player.elo || 1000;
    const wins = player.wins || 0;
    const losses = player.losses || 0;
    el.recordDisplay.textContent = `${wins} Wins - ${losses} Losses`;
}

function updateBadge(tier) {
    el.tierBadge.className = 'badge'; // reset
    if (tier === 'IRON') {
        el.tierBadge.classList.add('badge-iron');
        el.tierBadge.innerHTML = '⚪ Iron';
    } else if (tier === 'GOLD') {
        el.tierBadge.classList.add('badge-gold');
        el.tierBadge.innerHTML = '🟡 Gold';
    } else if (tier === 'DIAMOND') {
        el.tierBadge.classList.add('badge-diamond');
        el.tierBadge.innerHTML = '💎 Diamond';
    } else if (tier === 'NETHERITE') {
        el.tierBadge.classList.add('badge-netherite');
        el.tierBadge.innerHTML = '🛡️ Netherite';
    }
}

function updateProgress(matches, tier) {
    let target = 20;
    let current = matches;
    let label = "Road to Gold";
    let msg = "Play 20 matches to unlock your stats.";

    if (tier === 'GOLD') {
        target = 50;
        label = "Road to Diamond";
        msg = "Reach 50 matches to unlock Global Leaderboard.";
    } else if (tier === 'DIAMOND') {
        target = 200;
        label = "Road to Netherite";
        msg = "Prove your endurance. Become a Legend.";
    } else if (tier === 'NETHERITE') {
        target = 1000;
        label = "Living Legend";
        msg = "You are among the elite.";
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
            updateGamification(p);
        } else {
            // New player default state logic
            updateGamification({ matchesPlayed: 0 });
        }
    });
}

function renderMockLeaderboard() {
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
    location.reload();
});
