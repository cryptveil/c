// public/src/ui.js
// DOM wiring only -- no gameplay logic lives here. Every control calls back
// into main.js via the `on` callbacks object; nothing in this file is a
// decorative button that silently does nothing.

import { WEAPONS, ARMOR } from '../../shared/rules.js';
import { CHARACTERS } from '../../shared/data.js';

const $ = (id) => document.getElementById(id);

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

export function initMenu(on) {
  $('btnPractice').onclick = () => on.startOffline('practice');
  $('btnUnranked').onclick = () => on.startOffline('unranked');
  $('btnCompetitiveLocal').onclick = () => on.startOffline('competitive');
  $('btnFindMatch').onclick = () => { showScreen('screenQueue'); on.joinQueue(); };
  $('btnCancelQueue').onclick = () => { on.leaveQueue(); showScreen('screenMain'); };
  $('btnCreateLobby').onclick = () => on.createLobby();
  $('btnJoinLobby').onclick = () => { const code = $('lobbyCodeInput').value.trim().toUpperCase(); if (code) on.joinLobby(code); };
  $('btnStartLobby').onclick = () => on.startLobby();
  $('btnSettings').onclick = () => showScreen('screenSettings');
  $('btnSettingsBack').onclick = () => showScreen('screenMain');

  $('qualityRange').oninput = (e) => on.setQuality(parseFloat(e.target.value));
  $('sensRange').oninput = (e) => on.setSensitivity(parseFloat(e.target.value));
}

export function renderMapGrid(maps, selectedId, onSelect) {
  const grid = $('mapGrid'); grid.innerHTML = '';
  maps.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mapCard' + (m.id === selectedId ? ' selected' : '');
    card.innerHTML = `<div class="mapName">${m.name}${m.flagship ? ' <span class="tag">FLAGSHIP</span>' : ' <span class="tag proto">PROTOTYPE</span>'}</div><div class="mapDesc">${m.desc}</div>`;
    card.onclick = () => onSelect(m.id);
    grid.appendChild(card);
  });
}

export function populateCharacterGrid(onSelect) {
  const grid = $('charGrid'); if (!grid) return;
  grid.innerHTML = '';
  CHARACTERS.forEach(c => {
    const card = document.createElement('div');
    card.className = 'charCard';
    card.style.setProperty('--accent', '#' + c.color.toString(16).padStart(6, '0'));
    card.innerHTML = `<div class="charName">${c.name}</div><div class="charRole">${c.role}</div><div class="charTag">${c.tagline}</div>`;
    card.onclick = () => { document.querySelectorAll('.charCard').forEach(x => x.classList.remove('selected')); card.classList.add('selected'); onSelect(c.id); };
    grid.appendChild(card);
  });
}

export function updateHUD(d) {
  $('hpVal').textContent = Math.max(0, Math.round(d.hp));
  $('hpBar').style.width = Math.max(0, d.hp) + '%';
  $('armorVal').textContent = Math.round(d.armor);
  $('ammoVal').textContent = `${d.ammo}/${d.reserve}`;
  $('weaponName').textContent = d.weaponName;
  $('creditsVal').textContent = d.credits;
  $('roundTimer').textContent = formatClock(d.timeLeft);
  $('roundPhase').textContent = d.phase.toUpperCase();
  $('roundNum').textContent = `ROUND ${d.roundNumber}`;
  $('scoreA').textContent = d.roundWins[0];
  $('scoreB').textContent = d.roundWins[1];
  $('sideLabel').textContent = d.side === 'attack' ? 'ATTACKING' : 'DEFENDING';
  $('sideLabel').className = d.side === 'attack' ? 'atk' : 'def';
}

function formatClock(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function updateAbilityHUD(character, state, now) {
  const bar = $('abilityBar'); if (!bar || !character) return;
  bar.innerHTML = '';
  character.abilities.forEach(a => {
    const el = document.createElement('div');
    const ready = state.charges[a.id] > 0;
    el.className = 'abilitySlot' + (ready ? ' ready' : '');
    const cdLeft = ready ? 0 : Math.max(0, (state.nextRecharge[a.id] - now) / 1000);
    el.innerHTML = `<div class="key">${a.key}</div><div class="chargeCount">${state.charges[a.id]}</div>${!ready ? `<div class="cd">${cdLeft.toFixed(0)}s</div>` : ''}`;
    bar.appendChild(el);
  });
  const ult = $('ultSlot');
  if (ult) {
    const pct = Math.round((state.ultPoints / character.ultimate.pointsRequired) * 100);
    ult.querySelector('.key').textContent = character.ultimate.key;
    ult.querySelector('.pct').textContent = pct + '%';
    ult.classList.toggle('ready', pct >= 100);
  }
}

export function showBuyMenu(visible, ctx, onBuy) {
  const panel = $('buyMenu');
  panel.classList.toggle('active', visible);
  if (!visible) return;
  const list = $('buyList'); list.innerHTML = '';
  Object.values(WEAPONS).forEach(w => {
    const owned = ctx.owned.includes(w.id);
    const row = document.createElement('div');
    row.className = 'buyRow' + (owned ? ' owned' : '');
    row.innerHTML = `<span>${w.name}</span><span>${owned ? 'OWNED' : w.price + ' CR'}</span>`;
    row.onclick = () => !owned && onBuy('weapon', w.id);
    if (!owned && ctx.credits < w.price) row.classList.add('unaffordable');
    list.appendChild(row);
  });
  Object.values(ARMOR).forEach(a => {
    if (a.id === 'none') return;
    const row = document.createElement('div');
    row.className = 'buyRow';
    row.innerHTML = `<span>${a.name}</span><span>${a.price} CR</span>`;
    row.onclick = () => onBuy('armor', a.id);
    if (ctx.credits < a.price) row.classList.add('unaffordable');
    list.appendChild(row);
  });
  $('buyCredits').textContent = ctx.credits + ' CR';
}

export function updateScoreboard(roster, localId) {
  const board = $('scoreboardBody'); if (!board) return;
  board.innerHTML = '';
  [0, 1].forEach(team => {
    roster.filter(p => p.team === team).forEach(p => {
      const row = document.createElement('div');
      row.className = 'sbRow team' + team + (p.id === localId ? ' me' : '');
      row.innerHTML = `<span>${p.name}</span><span>${p.character || '--'}</span><span>${p.kills}</span><span>${p.deaths}</span><span>${p.alive ? 'ALIVE' : 'DEAD'}</span>`;
      board.appendChild(row);
    });
  });
}

export function showBanner(text, ms = 2600) {
  const b = $('roundBanner');
  b.textContent = text; b.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.remove('show'), ms);
}

export function showMatchResult(won, roundWins) {
  $('resultTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('resultTitle').className = won ? 'win' : 'lose';
  $('resultScore').textContent = `${roundWins[0]} - ${roundWins[1]}`;
  showScreen('screenResult');
}

export function setBlindOverlay(amount) {
  $('blindOverlay').style.opacity = Math.max(0, Math.min(1, amount));
}

export function setCrosshairSpread(bloom) {
  const c = $('crosshair'); if (!c) return;
  c.style.setProperty('--spread', (4 + bloom * 14) + 'px');
}
