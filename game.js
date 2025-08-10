// --- Removido Firebase/Auth. Ranking agora é local via localStorage. ---

// DOM
const gameContainer = document.getElementById('gameContainer');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const gameOverEl = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');
const finalTimeEl  = document.getElementById('finalTime');
const rankBody     = document.getElementById('rankBody');

const crosshair = document.getElementById('crosshair');
const player    = document.getElementById('player');
const gun       = document.getElementById('gun');

const btnRestart   = document.getElementById('btnRestart');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const playerNameInput = document.getElementById('playerNameInput');
const btnSaveScore    = document.getElementById('btnSaveScore');

// Game state
let score = 0;
let targets = [];
let targetSpeed = 2;
let targetCount = 5;
let gameActive = true;

// Timer
let startTime = 0;
let rafTimerId = null;
let finishedTimeMs = 0;

// Pivot da arma
let pivot = { x: gameContainer.clientWidth / 2, y: gameContainer.clientHeight - 80 };

// Cores
const colors = ['#00ffff','#ff00ff','#ffff00','#00ff00','#ff6600'];

// ===== ÁUDIO (Web Audio API) =====
let audioCtx = null;
const sfx = {
  init() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  },
  tone({freq=600, time=0.08, type='sine', gain=0.15, attack=0.005, release=0.06, slideTo=null}) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + time);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + time + release);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + time + release + 0.02);
  },
  shoot(){ this.tone({ freq: 900, slideTo: 300, time: 0.12, type: 'triangle', gain: 0.18 }); },
  hit()  { this.tone({ freq: 180, time: 0.06, type: 'square', gain: 0.22 }); setTimeout(()=> this.tone({ freq:120, time:0.06, type:'square', gain:0.2 }), 40); },
  miss() { this.tone({ freq: 120, time: 0.08, type: 'sine', gain: 0.12 }); }
};
['pointerdown','touchstart','keydown'].forEach(ev => {
  window.addEventListener(ev, () => sfx.init(), { once: true, passive: true });
});

// ===== Jogo =====
initGame();
positionPlayer();
attachAimHandlers();
attachUIHandlers();
renderLeaderboard(); // carregar ranking inicial
loadSavedName();

function initGame() {
  score = 0; updateScore();
  gameActive = true;
  gameOverEl.classList.add('hidden');

  targets.forEach(t => t.element?.remove());
  targets = [];

  for (let i = 0; i < targetCount; i++) createTarget();

  startTimer();
  requestAnimationFrame(gameLoop);
}

function positionPlayer() {
  // valor menor que 80 deixa mais baixo
  pivot = { 
    x: gameContainer.clientWidth / 2, 
    y: gameContainer.clientHeight - 20 // estava 80
  };
  player.style.left = `${pivot.x}px`;
  player.style.top  = `${pivot.y}px`;
  gun.style.transform = `rotate(0deg)`;

}

function attachAimHandlers() {
  gameContainer.addEventListener('mousemove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    crosshair.style.left = `${mx}px`; crosshair.style.top = `${my}px`;
    const angleDeg = Math.atan2(my - pivot.y, mx - pivot.x) * 180 / Math.PI;
    gun.style.transform = `rotate(${angleDeg}deg)`;
  });
}

function attachUIHandlers() {
  btnRestart.addEventListener('click', () => resetGame());
  btnPlayAgain.addEventListener('click', () => resetGame());
  btnSaveScore.addEventListener('click', () => {
    saveLocalScore();
    renderLeaderboard();
    btnSaveScore.disabled = true;
    btnSaveScore.textContent = 'Salvo!';
    setTimeout(() => {
      btnSaveScore.disabled = false;
      btnSaveScore.textContent = 'Salvar tempo';
    }, 1200);
  });

  // clique no fundo = erro
  gameContainer.addEventListener('click', (e) => {
    if (!gameActive) return;
    if (e.target === gameContainer) {
      score = Math.max(0, score - 1); updateScore(); sfx.miss();
      const fb = document.createElement('div');
      fb.className = 'absolute text-red-500 font-bold text-xl';
      fb.textContent = '-1';
      fb.style.left = `${e.clientX}px`; fb.style.top  = `${e.clientY}px`;
      gameContainer.appendChild(fb); setTimeout(()=>fb.remove(), 1000);
    }
  });

  window.addEventListener('resize', () => {
    positionPlayer();
    targets.forEach(t => {
      t.x = Math.min(Math.max(t.x, 0), gameContainer.clientWidth - t.size);
      t.y = Math.min(Math.max(t.y, 0), gameContainer.clientHeight - t.size);
      t.element.style.left = `${t.x}px`; t.element.style.top  = `${t.y}px`;
    });
  });
}

// ===== Timer =====
function startTimer() {
  startTime = performance.now();
  cancelAnimationFrame(rafTimerId);
  const tick = () => {
    if (!gameActive) return;
    const ms = performance.now() - startTime;
    timerEl.textContent = formatTime(ms);
    rafTimerId = requestAnimationFrame(tick);
  };
  rafTimerId = requestAnimationFrame(tick);
}
function stopTimer() { cancelAnimationFrame(rafTimerId); finishedTimeMs = performance.now() - startTime; }
function formatTime(ms) {
  const totalMs = Math.floor(ms), totalSec = Math.floor(totalMs/1000);
  const min = Math.floor(totalSec/60), sec = totalSec%60, dec = Math.floor((totalMs%1000)/100);
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${dec}`;
}

// ===== Alvos =====
function createTarget() {
  const el = document.createElement('div'); el.className = 'target';
  const size = Math.random()*40 + 30, color = colors[Math.floor(Math.random()*colors.length)];
  el.style.width = `${size}px`; el.style.height = `${size}px`; el.style.backgroundColor = color; el.style.color = color;

  const maxX = gameContainer.clientWidth - size, maxY = gameContainer.clientHeight - size;
  let x = Math.random()*maxX, y = Math.random()*maxY;
  let dx = (Math.random()-0.5)*targetSpeed, dy = (Math.random()-0.5)*targetSpeed;

  el.style.left = `${x}px`; el.style.top = `${y}px`;
  gameContainer.appendChild(el);

  const target = { element: el, x, y, dx, dy, size }; targets.push(target);

  el.addEventListener('click', (e) => { if (!gameActive) return; e.stopPropagation(); hitTarget(target); });
}

function hitTarget(target) {
  sfx.hit(); createLaserEffectFromGunTo(target);
  target.element.classList.add('target-hit');
  setTimeout(() => {
    target.element.remove();
    targets = targets.filter(t => t !== target);
    score++; updateScore();
    if (score >= 30) { gameWon(); return; }
    createTarget(); if (Math.random() < 0.2) createTarget();
  }, 500);
}

function createLaserEffectFromGunTo(target) {
  sfx.shoot();
  const laser = document.createElement('div'); laser.className = 'laser';
  const startX = pivot.x, startY = pivot.y;
  const cx = target.x + target.size/2, cy = target.y + target.size/2;
  laser.style.left = `${startX}px`; laser.style.top = `${startY}px`;
  const length = Math.hypot(cx - startX, cy - startY), angle = Math.atan2(cy - startY, cx - startX) * 180 / Math.PI;
  laser.style.width = `${length}px`; laser.style.transform = `rotate(${angle}deg)`;
  gameContainer.appendChild(laser); setTimeout(()=>laser.remove(), 180);
}

function gameLoop() {
  if (!gameActive) return;
  targets.forEach(t => {
    t.x += t.dx; t.y += t.dy;
    if (t.x <= 0 || t.x >= gameContainer.clientWidth - t.size) t.dx = -t.dx;
    if (t.y <= 0 || t.y >= gameContainer.clientHeight - t.size) t.dy = -t.dy;
    t.element.style.left = `${t.x}px`; t.element.style.top  = `${t.y}px`;
  });
  requestAnimationFrame(gameLoop);
}

function updateScore(){ scoreEl.textContent = score; }

async function gameWon() {
  gameActive = false; stopTimer();
  finalScoreEl.textContent = score; finalTimeEl.textContent = formatTime(finishedTimeMs);
  // prepara campo de nome
  playerNameInput.value = loadSavedName() || 'Player';
  await renderLeaderboard();
  gameOverEl.classList.remove('hidden');
}

function resetGame() {
  gameOverEl.classList.add('hidden');
  timerEl.textContent = '00:00.0';
  initGame();
}

// ===== Ranking Local (localStorage) =====
const LS_KEY = 'fts_scores';
const LS_NAME_KEY = 'fts_name';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveScores(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function loadSavedName() {
  try {
    const n = localStorage.getItem(LS_NAME_KEY) || '';
    if (playerNameInput) playerNameInput.value = n || 'Player';
    return n;
  } catch { return ''; }
}
function saveLocalScore() {
  const name = (playerNameInput?.value || 'Player').toString().trim() || 'Player';
  try { localStorage.setItem(LS_NAME_KEY, name); } catch {}

  const list = loadScores();
  list.push({
    name,
    timeMs: Math.floor(finishedTimeMs),
    createdAt: new Date().toISOString()
  });
  list.sort((a,b) => a.timeMs - b.timeMs || new Date(a.createdAt) - new Date(b.createdAt));
  const top10 = list.slice(0,10);
  saveScores(top10);
}

async function renderLeaderboard() {
  rankBody.innerHTML = `<tr><td colspan="4" class="text-center text-cyan-300 py-2">Carregando…</td></tr>`;
  const list = loadScores();
  if (!list.length) {
    rankBody.innerHTML = `<tr><td colspan="4" class="text-center text-cyan-300 py-2">Sem registros ainda</td></tr>`;
    return;
  }
  const rows = list.map((d, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHTML(d.name || 'Player')}</td>
      <td>${formatTime(d.timeMs || 0)}</td>
      <td>${formatDate(new Date(d.createdAt))}</td>
    </tr>
  `);
  rankBody.innerHTML = rows.join('');
}

function escapeHTML(s='') { return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
