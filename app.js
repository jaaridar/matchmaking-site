// --- CONFIG ---
const APP_ID = '31f38418-869a-4b4b-8d65-66b3df8ae919';
const SERVER_IP = 'mc.ranked-server.com:19132';

// --- INITIALIZATION ---
import { init, id } from 'https://cdn.jsdelivr.net/npm/@instantdb/core@0.22.116/+esm';
const db = init({ appId: APP_ID });

// --- GLOBAL APP INSTANCE ---
window.app = {
  state: {
    currentPlayerId: null,
    player: null,
    route: 'home', // 'home', 'dashboard', 'leaderboard', 'profile'
    queueing: false,
    timerInterval: null
  },

  // --- NAVIGATION ---
  navigate(route) {
    if (route === this.state.route) return;

    // Auth Guard
    if (!this.state.currentPlayerId && (route === 'dashboard' || route === 'profile')) {
      this.showAuth();
      return;
    }

    console.log('[Router] Navigating to:', route);
    this.state.route = route;

    // Update UI Visibility
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(`view-${route}`);
    if (activeSec) activeSec.classList.add('active');

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });

    // Specific View Renderers
    if (route === 'leaderboard') this.renderLeaderboard();
    if (route === 'profile') this.renderProfile();
    if (route === 'dashboard') this.renderDashboard();
  },

  showAuth() {
    document.getElementById('auth-overlay').classList.add('active');
  },

  hideAuth() {
    document.getElementById('auth-overlay').classList.remove('active');
  },

  // --- AUTH ACTIONS ---
  async handleAuth(e) {
    e.preventDefault();
    const ign = document.getElementById('ign-input').value.trim();
    if (!ign) return;

    this.setAuthStatus('Connecting to network...', 'success');

    try {
      // Generate a unique player ID based on IGN
      const playerId = id();
      
      // Store player data in InstantDB
      await db.transact([
        db.tx.players[playerId].update({
          id: playerId,
          ign: ign,
          elo: 1000,
          wins: 0,
          losses: 0,
          matchesPlayed: 0,
          lastSeen: Date.now(),
          createdAt: Date.now()
        })
      ]);

      // Store session in localStorage
      localStorage.setItem('currentPlayerId', playerId);
      localStorage.setItem('playerIgn', ign);

      this.state.currentPlayerId = playerId;
      this.setAuthStatus('Login successful!', 'success');
      
      // Wait a moment to show success message
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.hideAuth();
      this.navigate('dashboard');
      
    } catch (err) {
      console.error('[Auth Error]', err);
      this.setAuthStatus('Login failed: ' + (err.message || 'Error'), 'error');
    }
  },

  setAuthStatus(msg, type) {
    const el = document.getElementById('auth-status');
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
  },

  // --- TIERS & PROGRESSION ---
  getTier(matches) {
    if (matches >= 200) return { id: 'NETHERITE', label: 'Netherite Rank', class: 'badge-netherite', icon: '🛡️' };
    if (matches >= 50) return { id: 'DIAMOND', label: 'Diamond Rank', class: 'badge-diamond', icon: '💎' };
    if (matches >= 20) return { id: 'GOLD', label: 'Gold Rank', class: 'badge-gold', icon: '🟡' };
    return { id: 'IRON', label: 'Iron Rank', class: 'badge-iron', icon: '⚪' };
  },

  updateUserUI(player) {
    const tier = this.getTier(player.matchesPlayed || 0);

    // Sidebar Update
    document.getElementById('sidebar-user').classList.remove('hidden');
    document.getElementById('login-trigger-btn').classList.add('hidden');
    document.getElementById('sidebar-ign').textContent = player.ign;
    document.getElementById('sidebar-tier').textContent = tier.label;

    // Dashboard/Profile specific global elements
    const badgeEls = [document.getElementById('dash-badge-large'), document.getElementById('prof-tier')];
    badgeEls.forEach(el => {
      if (!el) return;
      el.className = `badge ${tier.class}`;
      if (el.classList.contains('tier-badge-large')) el.classList.add('tier-badge-large');
      el.textContent = tier.label;
    });
  },

  // --- VIEW RENDERERS ---
  renderDashboard() {
    if (!this.state.player) return;
    const p = this.state.player;
    const tier = this.getTier(p.matchesPlayed || 0);

    document.getElementById('dash-ign').textContent = p.ign;
    document.getElementById('dash-elo').textContent = (p.elo || 1000).toLocaleString();
    document.getElementById('dash-wins').textContent = p.wins || 0;
    document.getElementById('dash-losses').textContent = p.losses || 0;

    // Progress Bar
    let target = 20;
    let nextLabel = "Gold Rank";
    if (tier.id === 'GOLD') { target = 50; nextLabel = "Diamond Rank"; }
    if (tier.id === 'DIAMOND') { target = 200; nextLabel = "Netherite Rank"; }
    if (tier.id === 'NETHERITE') { target = 500; nextLabel = "Grandmaster Status"; }

    const perc = Math.min(100, ((p.matchesPlayed || 0) / target) * 100);
    document.getElementById('dash-progress-bar').style.width = `${perc}%`;
    document.getElementById('dash-progress-title').textContent = `ROAD TO ${nextLabel}`;
    document.getElementById('dash-progress-count').textContent = `${p.matchesPlayed || 0} / ${target} Matches`;

    const mot = document.getElementById('dash-motivational');
    if (tier.id === 'IRON') mot.textContent = "Play 20 matches to unlock Gold features!";
    else if (tier.id === 'GOLD') mot.textContent = "Almost there! Unlock the global leaderboard at 50 matches.";
    else mot.textContent = "Compete with top veterans and climb the leaderboard.";
  },

  renderLeaderboard() {
    const matches = this.state.player?.matchesPlayed || 0;
    const locked = matches < 50;

    document.getElementById('lb-locked-overlay').classList.toggle('hidden', !locked);
    document.getElementById('lb-table').classList.toggle('hidden', locked);

    if (!locked) {
      // Subscription for actual LB
      db.subscribeQuery(
        { players: { $: { limit: 10, order: { serverCreatedAt: 'desc' } } } },
        (resp) => {
          if (!resp.data || !resp.data.players) return;
          const tbody = document.getElementById('lb-tbody');
          const sortedPlayers = resp.data.players
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
            .slice(0, 10);
          
          tbody.innerHTML = sortedPlayers.map((p, i) => `
            <tr>
              <td><span class="rank-pill">#${i + 1}</span></td>
              <td style="font-weight:700;">${p.ign}</td>
              <td>${this.getTier(p.matchesPlayed || 0).label}</td>
              <td><span style="color:var(--primary); font-weight:800;">${p.elo || 1000}</span></td>
              <td>${p.wins || 0}</td>
            </tr>
          `).join('');
        }
      );
    }
  },

  renderProfile() {
    if (!this.state.player) return;
    const p = this.state.player;
    const winrate = p.matchesPlayed ? Math.round(((p.wins || 0) / p.matchesPlayed) * 100) : 0;

    document.getElementById('prof-ign').textContent = p.ign;
    document.getElementById('prof-matches').textContent = p.matchesPlayed || 0;
    document.getElementById('prof-winrate').textContent = `${winrate}%`;
  },

  // --- LOGOUT ---
  logout() {
    localStorage.removeItem('currentPlayerId');
    localStorage.removeItem('playerIgn');
    this.state.currentPlayerId = null;
    this.state.player = null;
    window.location.reload();
  }
};

// --- INITIAL SESSION CHECK ---
(async function initSession() {
  const storedPlayerId = localStorage.getItem('currentPlayerId');
  
  if (storedPlayerId) {
    console.log('[App] Restoring session:', storedPlayerId);
    app.state.currentPlayerId = storedPlayerId;
    
    // Subscribe to player data
    db.subscribeQuery(
      { players: { $: { where: { id: storedPlayerId } } } },
      (resp) => {
        if (resp.data && resp.data.players && resp.data.players.length > 0) {
          const player = resp.data.players[0];
          app.state.player = player;
          app.updateUserUI(player);
          
          // If on home, navigate to dashboard
          if (app.state.route === 'home') {
            app.navigate('dashboard');
          } else {
            app.navigate(app.state.route);
          }
        }
      }
    );
  }
})();

// --- EVENT LISTENERS ---
document.getElementById('auth-form').addEventListener('submit', (e) => app.handleAuth(e));
document.getElementById('login-trigger-btn').addEventListener('click', () => app.showAuth());

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    app.navigate(item.dataset.route);
  });
});

document.getElementById('dash-copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(SERVER_IP).then(() => {
    const btn = document.getElementById('dash-copy-btn');
    const oldText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = oldText, 2000);
  });
});

document.getElementById('prof-logout-btn').addEventListener('click', () => {
  app.logout();
});

document.getElementById('join-queue-btn').addEventListener('click', () => {
  const btn = document.getElementById('join-queue-btn');
  const status = document.getElementById('queue-status-text');
  
  app.state.queueing = !app.state.queueing;
  
  if (app.state.queueing) {
    btn.textContent = "LEAVE QUEUE";
    btn.classList.add('btn-ghost');
    btn.classList.remove('btn-primary');
    status.classList.remove('hidden');
    
    let sec = 0;
    app.timerInterval = setInterval(() => {
      sec++;
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      document.getElementById('queue-timer').textContent = `${m}:${s}`;
    }, 1000);
  } else {
    btn.textContent = "JOIN MATCHMAKING";
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    status.classList.add('hidden');
    clearInterval(app.timerInterval);
  }
});

console.log('[App] Portal Initialized.');
