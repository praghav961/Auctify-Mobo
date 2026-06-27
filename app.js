import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ─────────────────────────────────────────────
   FIREBASE CONFIG
───────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyCWvHbZghVZu9aDUO-sHroxOiN0WXZ3AgI",
  authDomain:        "cricketauction-df77b.firebaseapp.com",
  databaseURL:       "https://cricketauction-df77b-default-rtdb.firebaseio.com",
  projectId:         "cricketauction-df77b",
  storageBucket:     "cricketauction-df77b.firebasestorage.app",
  messagingSenderId: "1052181366792",
  appId:             "1:1052181366792:web:c86af556248567e9f5e9bd",
  measurementId:     "G-BF00NXYJJ9"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const num   = v => Number(v) || 0;
const money = v => num(v).toLocaleString("en-IN");
const esc   = v =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const ph = (text, size = 60) =>
  `https://placehold.co/${size}x${size}/0f172a/ffffff?text=${encodeURIComponent(
    String(text || "?").trim().charAt(0).toUpperCase()
  )}`;

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
const S = {
  settings:      null,
  teams:         [],
  players:       [],
  feed:          [],
  prevMap:       new Map(),
  prevLiveId:    "",
  playersReady:  false,
  settingsReady: false,
  activeTab:     0
};

let overlayTimer = null;

/* ─────────────────────────────────────────────
   TAB SWITCHING (with smooth animation)
───────────────────────────────────────────── */
function switchTab(next) {
  if (next === S.activeTab) return;

  const prev   = S.activeTab;
  const goRight = next > prev;

  const prevScreen = $(`screen${prev}`);
  const nextScreen = $(`screen${next}`);

  // Slide out current
  prevScreen.classList.remove("active");
  prevScreen.classList.add(goRight ? "slide-left" : "");
  if (!goRight) {
    prevScreen.style.transform = "translateX(40px)";
    prevScreen.style.opacity   = "0";
  }

  // Prepare next (off-screen in the right direction)
  nextScreen.style.transition = "none";
  nextScreen.style.transform  = `translateX(${goRight ? "40px" : "-40px"})`;
  nextScreen.style.opacity    = "0";
  nextScreen.style.visibility = "visible";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      nextScreen.style.transition = "";
      nextScreen.style.transform  = "translateX(0)";
      nextScreen.style.opacity    = "1";
      nextScreen.classList.add("active");

      // Reset prev
      setTimeout(() => {
        prevScreen.classList.remove("slide-left");
        prevScreen.style.transform  = "";
        prevScreen.style.opacity    = "";
        prevScreen.style.visibility = "";
      }, 320);
    });
  });

  // Update tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i === next);
  });

  S.activeTab = next;
}

/* ─────────────────────────────────────────────
   TEAM STATS
───────────────────────────────────────────── */
function calcStats(team) {
  const s         = S.settings || {};
  const basePrice = num(s.basePrice);
  const teamPurse = num(s.teamPurse);
  const maxSlots  = num(s.playersPerTeam);

  const bought = S.players
    .filter(p => p.status === "Sold" && p.soldToTeamId === team.id)
    .sort((a, b) => num(b.soldPrice) - num(a.soldPrice));

  const spent      = bought.reduce((t, p) => t + num(p.soldPrice), 0);
  const purseLeft  = Math.max(0, teamPurse - spent);
  const filled     = bought.length;
  const slotsLeft  = Math.max(0, maxSlots - filled);
  const reserve    = Math.max(0, slotsLeft - 1) * basePrice;
  const maxBid     = Math.max(0, purseLeft - reserve);

  return { bought, spent, purseLeft, filled, slotsLeft, maxBid };
}

/* ─────────────────────────────────────────────
   FEED
───────────────────────────────────────────── */
function addFeed(html) {
  S.feed.unshift(html);
  if (S.feed.length > 30) S.feed.length = 30;
  renderFeed();
}

function renderFeed() {
  const ul = $("feedList");
  $("feedCount").textContent = S.feed.length;
  if (!S.feed.length) {
    ul.innerHTML = `<li class="feed-empty">Waiting for updates...</li>`;
    return;
  }
  ul.innerHTML = S.feed.map(item => `<li>${item}</li>`).join("");
}

/* ─────────────────────────────────────────────
   SCORE STRIP
───────────────────────────────────────────── */
function renderSummary() {
  const s = S.settings;
  if (!s) {
    $("hTournament").textContent = "Not connected";
    $("hLiveBadge").textContent  = "● OFFLINE";
    return;
  }
  const sold    = S.players.filter(p => p.status === "Sold").length;
  const unsold  = S.players.filter(p => p.status === "Unsold").length;
  const pending = S.players.filter(p => p.status === "Pending").length;

  $("hTournament").textContent  = s.tournamentName || "My Tournament";
  $("hLiveBadge").textContent   = s.auctionEnded ? "● ENDED" : "● LIVE";
  $("sTeams").textContent       = num(s.numTeams);
  $("sPlayers").textContent     = num(s.numPlayers) || S.players.length;
  $("sPerTeam").textContent     = num(s.playersPerTeam);
  $("sBase").textContent        = money(s.basePrice);
  $("sPurse").textContent       = money(s.teamPurse);
  $("sRound").textContent       = num(s.currentRound || 1);
  $("sSold").textContent        = sold;
  $("sUnsold").textContent      = unsold;
  $("sPending").textContent     = pending;
  document.title                = `${s.tournamentName || "Auction"} — Live`;
}

/* ─────────────────────────────────────────────
   SCREEN 0: LIVE PLAYER
───────────────────────────────────────────── */
function renderLivePlayer() {
  const area   = $("livePlayerArea");
  const badge  = $("liveBadge");
  const liveId = S.settings?.livePlayerId || "";
  const player = liveId ? S.players.find(p => p.id === liveId) : null;

  if (!player) {
    const pending = S.players.filter(p => p.status === "Pending").length;
    badge.textContent = S.settings?.auctionEnded ? "ENDED" : "AWAITING";
    area.innerHTML = `
      <div class="lp-placeholder">👤</div>
      <div class="lp-name">No Player Loaded</div>
      <div class="lp-desc">${pending ? `${pending} player(s) pending` : "Waiting for admin to load next player."}</div>
    `;
    return;
  }

  const isReauction = num(player.reauctionCount) > 0;
  badge.textContent  = isReauction ? "RE-AUCTION" : "BIDDING LIVE";

  const imgSrc = player.imageUrl || ph(player.name, 150);
  const base   = player.basePrice || S.settings?.basePrice || 0;

  area.innerHTML = `
    <img
      class="lp-img"
      src="${esc(imgSrc)}"
      alt="${esc(player.name)}"
      onerror="this.src='${ph(player.name, 150)}'">
    <div class="lp-name">${esc(player.name || "Player")}</div>
    <div class="lp-tags">
      ${player.batting  ? `<span class="lp-tag">🏏 ${esc(player.batting)}</span>` : ""}
      ${player.bowling  ? `<span class="lp-tag">🎯 ${esc(player.bowling)}</span>` : ""}
      ${player.role     ? `<span class="lp-tag">⭐ ${esc(player.role)}</span>`    : ""}
      <span class="lp-tag">Round ${num(player.auctionRound || 1)}</span>
      ${isReauction ? `<span class="lp-tag">♻️ Re-auction</span>` : ""}
    </div>
    <div class="lp-price">Base Price: ₹ ${money(base)}</div>
  `;
}

/* ─────────────────────────────────────────────
   SCREEN 1: TEAMS
───────────────────────────────────────────── */
function renderTeams() {
  const wrap = $("teamsContainer");
  $("teamCountBadge").textContent = S.teams.length;

  if (!S.teams.length) {
    wrap.innerHTML = `<div class="load-msg">No teams found.</div>`;
    return;
  }

  wrap.innerHTML = S.teams.map(team => {
    const st = calcStats(team);

    const logoSrc = team.logoUrl || ph(team.name, 80);

    const rosterHtml = st.bought.length
      ? st.bought.map(p => {
          const imgSrc = p.imageUrl || ph(p.name, 40);
          return `
            <div class="mini-p">
              <img src="${esc(imgSrc)}" alt="${esc(p.name)}" onerror="this.src='${ph(p.name, 40)}'">
              <div>
                <div class="mini-p-name">${esc(p.name || "Player")}</div>
                <div class="mini-p-role">${esc(p.role || "")}</div>
              </div>
              <div class="mini-p-price">₹${money(p.soldPrice)}</div>
            </div>
          `;
        }).join("")
      : `<div class="empty-roster">No players bought yet</div>`;

    return `
      <div class="team-card">
        <div class="team-card-head">
          <img class="team-logo" src="${esc(logoSrc)}" alt="${esc(team.name)}" onerror="this.src='${ph(team.name, 80)}'">
          <div>
            <div class="team-name">${esc(team.name || "Team")}</div>
            <div class="team-sub">Owner: ${esc(team.ownerName || "—")}</div>
          </div>
        </div>
        <div class="team-metrics">
          <div class="tm-box green">
            <span class="v">₹${money(st.purseLeft)}</span>
            <span class="l">Purse Left</span>
          </div>
          <div class="tm-box blue">
            <span class="v">${st.filled}</span>
            <span class="l">Bought</span>
          </div>
          <div class="tm-box purple">
            <span class="v">${st.slotsLeft}</span>
            <span class="l">Slots Left</span>
          </div>
          <div class="tm-box gold">
            <span class="v">₹${money(st.maxBid)}</span>
            <span class="l">Max Bid</span>
          </div>
        </div>
        <div class="roster-label">SQUAD (${st.filled})</div>
        <div class="team-roster">${rosterHtml}</div>
      </div>
    `;
  }).join("");
}

/* ─────────────────────────────────────────────
   SCREEN 2: PLAYERS (strict auction order)
───────────────────────────────────────────── */
function renderPlayers() {
  const wrap = $("playersContainer");
  $("playerCountBadge").textContent = S.players.length;

  if (!S.players.length) {
    wrap.innerHTML = `<div class="load-msg">No players found.</div>`;
    return;
  }

  /*
   * Sort STRICTLY by auctionOrder (the order set while recording players).
   * Players with no order fall to the end.
   */
  const sorted = [...S.players].sort((a, b) => {
    const ao = num(a.auctionOrder);
    const bo = num(b.auctionOrder);
    if (ao === 0 && bo === 0) return 0;
    if (ao === 0) return 1;
    if (bo === 0) return -1;
    return ao - bo;
  });

  wrap.innerHTML = sorted.map((p, idx) => {
    const status   = p.status || "Pending";
    const chipCls  = status === "Sold" ? "sold" : status === "Unsold" ? "unsold" : "pending";
    const imgSrc   = p.imageUrl || ph(p.name, 50);
    const priceVal = status === "Sold" ? `₹${money(p.soldPrice)}` : "—";
    const priceCls = status === "Sold" ? "" : "dim";
    const subText  = [p.role, p.batting, p.bowling].filter(Boolean).join(" • ");

    return `
      <div class="player-row">
        <div class="pr-idx">${idx + 1}</div>
        <img class="pr-img" src="${esc(imgSrc)}" alt="${esc(p.name)}" onerror="this.src='${ph(p.name, 50)}'">
        <div class="pr-info">
          <div class="pr-name">${esc(p.name || "Player")}</div>
          <div class="pr-sub">${esc(subText || `Round ${num(p.auctionRound || 1)}`)}</div>
        </div>
        <div class="pr-right">
          <span class="pr-chip ${chipCls}">${esc(status)}</span>
          <span class="pr-price ${priceCls}">${priceVal}</span>
        </div>
      </div>
    `;
  }).join("");
}

/* ─────────────────────────────────────────────
   CONFETTI
───────────────────────────────────────────── */
const CF_COLORS = [
  "#22c55e","#16a34a","#fbbf24","#f97316",
  "#86efac","#4ade80","#fde68a","#ffffff","#38bdf8"
];

function launchConfetti() {
  const box = $("confettiBox");
  box.innerHTML = "";
  for (let i = 0; i < 55; i++) {
    const el = document.createElement("div");
    el.className = "cf";
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${CF_COLORS[Math.floor(Math.random() * CF_COLORS.length)]};
      width: ${5 + Math.random() * 6}px;
      height: ${9 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
      animation-duration: ${2.0 + Math.random() * 1.8}s;
      animation-delay: ${Math.random() * 0.5}s;
    `;
    box.appendChild(el);
  }
  setTimeout(() => { box.innerHTML = ""; }, 4500);
}

/* ─────────────────────────────────────────────
   RESULT OVERLAY
───────────────────────────────────────────── */
function showOverlay(type, player) {
  clearTimeout(overlayTimer);

  const overlay = $("resultOverlay");
  overlay.classList.remove("show", "sold", "unsold");

  $("oBadge").textContent = type === "Sold" ? "✅  SOLD" : "❌  UNSOLD";
  $("oName").textContent  = player.name || "Player";
  $("oMeta").textContent  = type === "Sold"
    ? `${player.soldToTeamName || "Team"}  •  ₹ ${money(player.soldPrice)}`
    : "No winning bid";

  overlay.classList.add(type === "Sold" ? "sold" : "unsold");

  if (type === "Sold") launchConfetti();
  else $("confettiBox").innerHTML = "";

  void overlay.offsetWidth; // force reflow
  overlay.classList.add("show");

  overlayTimer = setTimeout(() => {
    overlay.classList.remove("show");
  }, 3200);
}

/* ─────────────────────────────────────────────
   SETTINGS HANDLER
───────────────────────────────────────────── */
function onSettings(data) {
  const prevLiveId = S.prevLiveId;
  const nextLiveId = data?.livePlayerId || "";

  S.settings = data;

  renderSummary();
  renderLivePlayer();
  renderTeams();

  if (S.settingsReady && nextLiveId && nextLiveId !== prevLiveId) {
    const p = S.players.find(pl => pl.id === nextLiveId);
    if (p) addFeed(`🎯 Now on block: <strong>${esc(p.name)}</strong>`);
  }

  S.prevLiveId    = nextLiveId;
  S.settingsReady = true;
}

/* ─────────────────────────────────────────────
   PLAYERS HANDLER
───────────────────────────────────────────── */
function onPlayers(list) {
  if (S.playersReady) {
    for (const p of list) {
      const prev = S.prevMap.get(p.id);
      if (!prev) continue;

      if (prev.status !== p.status) {
        if (p.status === "Sold") {
          addFeed(`✅ <strong>${esc(p.name)}</strong> → <strong>${esc(p.soldToTeamName || "Team")}</strong> for ₹${money(p.soldPrice)}`);
          showOverlay("Sold", p);
        } else if (p.status === "Unsold") {
          addFeed(`❌ <strong>${esc(p.name)}</strong> went unsold`);
          showOverlay("Unsold", p);
        } else if (p.status === "Pending" && prev.status === "Unsold") {
          addFeed(`♻️ <strong>${esc(p.name)}</strong> moved to re-auction`);
        }
      }

      if (num(p.auctionRound) > num(prev.auctionRound)) {
        addFeed(`🔄 <strong>${esc(p.name)}</strong> → Round ${num(p.auctionRound)}`);
      }
    }
  }

  S.players      = list;
  S.prevMap      = new Map(list.map(p => [p.id, { ...p }]));
  S.playersReady = true;

  renderSummary();
  renderLivePlayer();
  renderTeams();
  renderPlayers();
}

/* ─────────────────────────────────────────────
   TEAMS HANDLER
───────────────────────────────────────────── */
function onTeams(list) {
  S.teams = list;
  renderTeams();
}

/* ─────────────────────────────────────────────
   TABS — EVENT LISTENERS
───────────────────────────────────────────── */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(Number(btn.dataset.tab));
  });
});

/* ─────────────────────────────────────────────
   BOOT — FIRESTORE LISTENERS
───────────────────────────────────────────── */
function boot() {
  // Settings
  onSnapshot(
    doc(db, "auction_meta", "settings"),
    snap => onSettings(snap.exists() ? snap.data() : null),
    err  => console.error("Settings:", err)
  );

  // Teams
  onSnapshot(
    collection(db, "teams"),
    snap => onTeams(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error("Teams:", err)
  );

  // Players
  onSnapshot(
    collection(db, "players"),
    snap => onPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error("Players:", err)
  );
}

boot();
