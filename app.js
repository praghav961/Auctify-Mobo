import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWvHbZghVZu9aDUO-sHroxOiN0WXZ3AgI",
  authDomain: "cricketauction-df77b.firebaseapp.com",
  databaseURL: "https://cricketauction-df77b-default-rtdb.firebaseio.com",
  projectId: "cricketauction-df77b",
  storageBucket: "cricketauction-df77b.firebasestorage.app",
  messagingSenderId: "1052181366792",
  appId: "1:1052181366792:web:c86af556248567e9f5e9bd",
  measurementId: "G-BF00NXYJJ9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SETTINGS_REF = doc(db, "auction_meta", "settings");
const teamsCol = collection(db, "teams");
const playersCol = collection(db, "players");

const state = {
  settings: null,
  teams: [],
  players: [],
  feed: [],
  prevLiveId: "",
  prevStatusMap: new Map()
};

const $ = id => document.getElementById(id);

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function placeholder(text = "?") {
  return `https://placehold.co/120x120/0f172a/ffffff?text=${encodeURIComponent(text || "?")}`;
}

function getTeamStats(team) {
  const s = state.settings || {};
  const bought = state.players.filter(p => p.status === "Sold" && p.soldToTeamId === team.id);
  const spent = bought.reduce((sum, p) => sum + Number(p.soldPrice || 0), 0);
  const purse = Number(s.teamPurse || team.purse || 0);
  const perTeam = Number(s.playersPerTeam || 0);
  const base = Number(s.basePrice || 0);
  const slotsFilled = bought.length;
  const slotsLeft = Math.max(0, perTeam - slotsFilled);
  const purseLeft = Math.max(0, purse - spent);
  const reserve = Math.max(0, slotsLeft - 1) * base;
  const maxBid = Math.max(0, purseLeft - reserve);

  return { bought, spent, purseLeft, slotsFilled, slotsLeft, maxBid };
}

function pushFeed(text) {
  state.feed.unshift({ text, time: new Date() });
  state.feed = state.feed.slice(0, 30);
  renderFeed();
}

function renderSummary() {
  const s = state.settings || {};
  const sold = state.players.filter(p => p.status === "Sold").length;
  const unsold = state.players.filter(p => p.status === "Unsold").length;
  const pending = state.players.filter(p => !p.status || p.status === "Pending").length;

  $("headerTournament").textContent = s.tournamentName || "Auction";
  $("sTeams").textContent = s.numTeams || state.teams.length || 0;
  $("sPlayers").textContent = s.numPlayers || state.players.length || 0;
  $("sBase").textContent = money(s.basePrice);
  $("sPurse").textContent = money(s.teamPurse);
  $("sRound").textContent = s.currentRound || 1;
  $("sSold").textContent = sold;
  $("sUnsold").textContent = unsold;
  $("sPending").textContent = pending;

  if (s.auctionEnded) {
    $("liveBadge").textContent = "● COMPLETE";
    $("liveBadge").className = "live-badge complete";
  } else {
    $("liveBadge").textContent = "● LIVE";
    $("liveBadge").className = "live-badge online";
  }
}

function renderCurrentPlayer() {
  const liveId = state.settings?.livePlayerId || "";
  const player = state.players.find(p => p.id === liveId);
  const wrap = $("currentPlayerArea");

  if (!player) {
    wrap.innerHTML = `
      <div class="placeholder">👤</div>
      <h3>No Player Loaded</h3>
      <p>${state.settings?.auctionEnded ? "Auction complete." : "Waiting for admin..."}</p>
    `;
    $("currentBadge").textContent = state.settings?.auctionEnded ? "Complete" : "Awaiting";
    return;
  }

  wrap.innerHTML = `
    <img class="player-img" src="${player.imageUrl || placeholder(player.name?.[0])}" alt="${player.name}">
    <div class="base-price">Base Price: ${money(player.basePrice || state.settings?.basePrice)}</div>
    <h3>${player.name}</h3>
    <div class="tags">
      <span>${player.role || "Player"}</span>
      <span>${player.batting || "Batting -"}</span>
      <span>${player.bowling || "Bowling -"}</span>
      <span>Round ${player.auctionRound || state.settings?.currentRound || 1}</span>
    </div>
  `;

  $("currentBadge").textContent = Number(player.reauctionCount || 0) > 0 ? "Re-Auction" : "Live";
}

function renderTeams() {
  const wrap = $("teamsDashboard");
  $("teamCountBadge").textContent = state.teams.length;

  if (!state.teams.length) {
    wrap.innerHTML = `<p class="empty">No teams found.</p>`;
    return;
  }

  wrap.innerHTML = state.teams.map(team => {
    const stats = getTeamStats(team);
    const logo = team.logoUrl || placeholder(team.name?.[0] || "T");
    const roster = stats.bought.length
      ? stats.bought.map(p => `
          <div class="mini-player">
            <img src="${p.imageUrl || placeholder(p.name?.[0])}" alt="${p.name}">
            <span>${p.name}</span>
            <b>${money(p.soldPrice)}</b>
          </div>
        `).join("")
      : `<p class="empty small">No players yet</p>`;

    return `
      <article class="team-card">
        <div class="team-head">
          <img src="${logo}" alt="${team.name}">
          <div>
            <h3>${team.name || "Team"}</h3>
            <p>${stats.slotsFilled}/${state.settings?.playersPerTeam || 0} players</p>
          </div>
        </div>

        <div class="metric-grid">
          <div><span>Purse Left</span><b>${money(stats.purseLeft)}</b></div>
          <div><span>Max Bid</span><b>${money(stats.maxBid)}</b></div>
          <div><span>Spent</span><b>${money(stats.spent)}</b></div>
          <div><span>Slots Left</span><b>${stats.slotsLeft}</b></div>
        </div>

        <div class="roster">${roster}</div>
      </article>
    `;
  }).join("");
}

function statusClass(status) {
  if (status === "Sold") return "sold";
  if (status === "Unsold") return "unsold";
  return "pending";
}

function renderPlayers() {
  const wrap = $("playersList");
  $("playerTableBadge").textContent = state.players.length;

  if (!state.players.length) {
    wrap.innerHTML = `<p class="empty">No players found.</p>`;
    return;
  }

  const sorted = [...state.players].sort((a, b) => Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0));

  wrap.innerHTML = sorted.map((p, i) => `
    <article class="player-row">
      <span class="idx">${i + 1}</span>
      <img src="${p.imageUrl || placeholder(p.name?.[0])}" alt="${p.name}">
      <div class="p-info">
        <h3>${p.name || "Player"}</h3>
        <p>${p.role || "-"} • ${p.batting || "-"} • ${p.bowling || "-"}</p>
      </div>
      <div class="p-side">
        <span class="status ${statusClass(p.status)}">${p.status || "Pending"}</span>
        <b>${p.soldToTeamName || "—"}</b>
        <small>${p.soldPrice ? money(p.soldPrice) : `Round ${p.auctionRound || 1}`}</small>
      </div>
    </article>
  `).join("");
}

function renderFeed() {
  const list = $("feedList");
  $("feedCountBadge").textContent = state.feed.length;

  if (!state.feed.length) {
    list.innerHTML = `<li>Waiting for updates...</li>`;
    return;
  }

  list.innerHTML = state.feed.map(item => `
    <li>
      <span>${item.text}</span>
      <small>${item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
    </li>
  `).join("");
}

function showSoldOverlay(player) {
  $("oName").textContent = player.name || "Player";
  $("oMeta").textContent = `${player.soldToTeamName || "Team"} • ${money(player.soldPrice)}`;
  $("resultOverlay").classList.add("show");
  setTimeout(() => $("resultOverlay").classList.remove("show"), 2600);
}

function detectPlayerChanges(players) {
  players.forEach(player => {
    const oldStatus = state.prevStatusMap.get(player.id);
    const newStatus = player.status || "Pending";

    if (newStatus === "Sold" && oldStatus !== "Sold") {
      pushFeed(`✅ ${player.name} sold to ${player.soldToTeamName} for ${money(player.soldPrice)}`);
      showSoldOverlay(player);
    }

    if (newStatus === "Unsold" && oldStatus !== "Unsold") {
      pushFeed(`❌ ${player.name} marked unsold`);
    }
  });

  state.prevStatusMap = new Map(players.map(p => [p.id, p.status || "Pending"]));
}

function renderAll() {
  renderSummary();
  renderCurrentPlayer();
  renderTeams();
  renderPlayers();
  renderFeed();
}

const screenOrder = ["screenLive", "screenTeams", "screenPlayers"];
let activeScreenIndex = 0;

function switchScreen(id) {
  const nextIndex = screenOrder.indexOf(id);
  if (nextIndex === -1 || nextIndex === activeScreenIndex) return;

  document.querySelectorAll(".screen").forEach((screen, index) => {
    screen.classList.remove("active", "left", "right");

    if (index < nextIndex) screen.classList.add("left");
    if (index > nextIndex) screen.classList.add("right");
  });

  const nextScreen = document.getElementById(id);
  nextScreen.classList.remove("left", "right");
  nextScreen.classList.add("active");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.screen === id);
  });

  activeScreenIndex = nextIndex;
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => switchScreen(tab.dataset.screen));
});

onSnapshot(SETTINGS_REF, snap => {
  state.settings = snap.exists() ? snap.data() : null;

  const liveId = state.settings?.livePlayerId || "";
  if (liveId && liveId !== state.prevLiveId) {
    const player = state.players.find(p => p.id === liveId);
    if (player) pushFeed(`🎯 Now on the block: ${player.name}`);
  }

  state.prevLiveId = liveId;
  renderAll();
});

onSnapshot(teamsCol, snap => {
  state.teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAll();
});

onSnapshot(playersCol, snap => {
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  detectPlayerChanges(players);
  state.players = players;
  renderAll();
});