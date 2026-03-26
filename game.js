/* =============================================
   MINESWEEPER.EXE — HACKER EDITION
   16×16 grid | 40 mines | Time-based score
   ============================================= */

const ROWS        = 16;
const COLS        = 16;
const TOTAL_MINES = 40;
const TOTAL_CELLS = ROWS * COLS;
const SAFE_CELLS  = TOTAL_CELLS - TOTAL_MINES;

const SCRAMBLE_CHARS = '!@#$%^&*?/<>\\|01░▒▓█▄▀■□▪▫';
const SCRAMBLE_MS    = 280;   // total scramble duration
const SCRAMBLE_FPS   = 40;    // ms between char swaps

// Number → display char (blank for 0)
const NUM_CHARS = ['', '1', '2', '3', '4', '5', '6', '7', '8'];

// ─── State ────────────────────────────────────

let board        = [];   // Array of cell objects
let gameState    = 'idle'; // 'idle' | 'playing' | 'won' | 'lost'
let firstClick   = true;
let flagCount    = 0;
let revealedCount = 0;
let startTime    = 0;
let elapsedSecs  = 0;
let timerInterval = null;

// ─── DOM refs ─────────────────────────────────

const gridEl      = document.getElementById('grid');
const mineCountEl = document.getElementById('mine-count');
const timerEl     = document.getElementById('timer');
const scoreEl     = document.getElementById('score');
const statusEl    = document.getElementById('status-text');
const overlay     = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const statTime    = document.getElementById('stat-time');
const statScore   = document.getElementById('stat-score');
const replayBtn   = document.getElementById('replay-btn');

// ─── Init ─────────────────────────────────────

function initGame() {
  // Reset state
  board         = [];
  gameState     = 'idle';
  firstClick    = true;
  flagCount     = 0;
  revealedCount = 0;
  elapsedSecs   = 0;
  clearInterval(timerInterval);
  timerInterval = null;

  // Reset UI
  mineCountEl.textContent = padNum(TOTAL_MINES);
  timerEl.textContent     = '00:00';
  scoreEl.textContent     = '----';
  statusEl.textContent    = '[ CLICK TO INITIALIZE ]';
  overlay.classList.add('hidden');
  overlay.classList.remove('lose-overlay');
  document.body.classList.remove('glitch-screen');

  // Build grid DOM + board array
  gridEl.innerHTML = '';

  for (let i = 0; i < TOTAL_CELLS; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.idx = i;
    gridEl.appendChild(el);

    board.push({
      isMine:       false,
      isRevealed:   false,
      isFlagged:    false,
      adjacentCount: 0,
      el
    });
  }
}

// ─── Mine placement (deferred to first click) ─

function placeMines(safeIdx) {
  // Collect safe zone: clicked cell + all 8 neighbors
  const safeZone = new Set();
  safeZone.add(safeIdx);
  forEachNeighbor(safeIdx, n => safeZone.add(n));

  const candidates = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (!safeZone.has(i)) candidates.push(i);
  }

  // Fisher-Yates partial shuffle to pick TOTAL_MINES
  for (let m = 0; m < TOTAL_MINES; m++) {
    const rand = m + Math.floor(Math.random() * (candidates.length - m));
    [candidates[m], candidates[rand]] = [candidates[rand], candidates[m]];
    board[candidates[m]].isMine = true;
  }

  calcAdjacents();
}

function calcAdjacents() {
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (board[i].isMine) continue;
    let count = 0;
    forEachNeighbor(i, n => { if (board[n].isMine) count++; });
    board[i].adjacentCount = count;
  }
}

// ─── Neighbor utility ─────────────────────────

function forEachNeighbor(idx, cb) {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        cb(nr * COLS + nc);
      }
    }
  }
}

// ─── Click handlers ───────────────────────────

function handleLeftClick(idx) {
  if (gameState === 'won' || gameState === 'lost') return;
  const cell = board[idx];
  if (cell.isRevealed || cell.isFlagged) return;

  // First click: place mines, start timer
  if (firstClick) {
    firstClick = false;
    placeMines(idx);
    gameState = 'playing';
    statusEl.textContent = '[ SCANNING... ]';
    startTimer();
  }

  if (cell.isMine) {
    triggerLose(idx);
  } else {
    if (cell.adjacentCount === 0) {
      floodFill(idx);
    } else {
      revealCell(idx, 0);
    }
    checkWin();
  }
}

function handleRightClick(idx, e) {
  e.preventDefault();
  if (gameState === 'won' || gameState === 'lost') return;
  if (gameState === 'idle') return; // must left-click first
  const cell = board[idx];
  if (cell.isRevealed) return;

  if (cell.isFlagged) {
    cell.isFlagged = false;
    cell.el.classList.remove('flagged');
    cell.el.textContent = '';
    flagCount--;
  } else {
    cell.isFlagged = true;
    cell.el.classList.add('flagged');
    cell.el.textContent = '⚑';
    flagCount++;
  }

  mineCountEl.textContent = padNum(TOTAL_MINES - flagCount);
}

// ─── Reveal & animation ───────────────────────

function revealCell(idx, delayMs) {
  const cell = board[idx];
  if (cell.isRevealed) return;
  cell.isRevealed = true;
  revealedCount++;

  const el = cell.el;
  el.classList.add('revealed');
  if (cell.adjacentCount > 0) el.dataset.n = cell.adjacentCount;

  const finalChar = cell.adjacentCount > 0 ? NUM_CHARS[cell.adjacentCount] : '';

  setTimeout(() => scrambleReveal(el, finalChar), delayMs);
}

function scrambleReveal(el, finalChar) {
  el.classList.add('scrambling');
  const steps = Math.floor(SCRAMBLE_MS / SCRAMBLE_FPS);
  let step = 0;

  const iv = setInterval(() => {
    step++;
    if (step >= steps) {
      clearInterval(iv);
      el.classList.remove('scrambling');
      el.classList.add('reveal-flash');
      el.textContent = finalChar;
      // clean up flash class after animation ends
      setTimeout(() => el.classList.remove('reveal-flash'), 300);
    } else {
      // Bias toward final char as we approach end
      const useRandom = step < steps * 0.75;
      el.textContent = useRandom
        ? SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        : finalChar;
    }
  }, SCRAMBLE_FPS);
}

// ─── Flood fill (BFS) ─────────────────────────

function floodFill(startIdx) {
  const queue = [[startIdx, 0]]; // [idx, distance]
  const visited = new Set([startIdx]);

  while (queue.length > 0) {
    const [idx, dist] = queue.shift();
    revealCell(idx, dist * 18); // stagger by BFS depth

    if (board[idx].adjacentCount === 0) {
      forEachNeighbor(idx, n => {
        if (!visited.has(n) && !board[n].isRevealed && !board[n].isFlagged && !board[n].isMine) {
          visited.add(n);
          queue.push([n, dist + 1]);
        }
      });
    }
  }
}

// ─── Win condition ────────────────────────────

function checkWin() {
  if (revealedCount === SAFE_CELLS) {
    triggerWin();
  }
}

function triggerWin() {
  gameState = 'won';
  stopTimer();
  statusEl.textContent = '[ ACCESS GRANTED ]';

  // Auto-flag remaining mines
  board.forEach(cell => {
    if (!cell.isRevealed && !cell.isFlagged) {
      cell.isFlagged = true;
      cell.el.classList.add('flagged');
      cell.el.textContent = '⚑';
    }
  });
  mineCountEl.textContent = padNum(0);

  const score = calcScore();
  scoreEl.textContent = score;

  setTimeout(() => showOverlay(true, elapsedSecs, score), 800);
}

// ─── Lose condition ───────────────────────────

function triggerLose(hitIdx) {
  gameState = 'lost';
  stopTimer();
  statusEl.textContent = '[ SYSTEM FAILURE ]';

  // Screen glitch
  document.body.classList.add('glitch-screen');
  setTimeout(() => document.body.classList.remove('glitch-screen'), 700);

  // Explode the hit cell
  const hitCell = board[hitIdx];
  hitCell.isRevealed = true;
  hitCell.el.classList.add('mine-hit');
  hitCell.el.textContent = '☢';

  // Reveal all other mines with staggered glitch
  let delay = 150;
  board.forEach((cell, i) => {
    if (i === hitIdx) return;
    if (cell.isMine && !cell.isFlagged) {
      const d = delay;
      setTimeout(() => {
        cell.isRevealed = true;
        cell.el.classList.add('mine-reveal');
        cell.el.textContent = '☢';
        cell.el.style.animationDelay = '0ms';
        cell.el.style.animation = 'cellGlitch 0.4s ease forwards';
      }, d);
      delay += 30 + Math.random() * 40;
    }
    // Mark incorrectly flagged cells
    if (cell.isFlagged && !cell.isMine) {
      setTimeout(() => {
        cell.el.classList.remove('flagged');
        cell.el.textContent = '✕';
        cell.el.style.color = 'var(--orange)';
      }, 300);
    }
  });

  const totalDelay = delay + 400;
  setTimeout(() => showOverlay(false, elapsedSecs, 0), totalDelay);
}

// ─── Overlay ──────────────────────────────────

function showOverlay(won, secs, score) {
  overlayTitle.textContent = won ? 'ACCESS GRANTED' : 'SYSTEM FAILURE';
  overlayTitle.className   = won ? 'win' : 'lose';
  statTime.textContent     = formatTime(secs);
  statScore.textContent    = won ? score : '0000';

  if (!won) overlay.classList.add('lose-overlay');
  overlay.classList.remove('hidden');
}

// ─── Timer & score ────────────────────────────

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = formatTime(elapsedSecs);
    scoreEl.textContent = calcScore();
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
  timerEl.textContent = formatTime(elapsedSecs);
}

function calcScore() {
  return Math.max(0, 10000 - elapsedSecs * 50);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function padNum(n) {
  return String(Math.max(0, n)).padStart(3, '0');
}

// ─── Event listeners ──────────────────────────

gridEl.addEventListener('click', e => {
  const el = e.target.closest('.cell');
  if (!el) return;
  handleLeftClick(Number(el.dataset.idx));
});

gridEl.addEventListener('contextmenu', e => {
  e.preventDefault();
  const el = e.target.closest('.cell');
  if (!el) return;
  handleRightClick(Number(el.dataset.idx), e);
});

replayBtn.addEventListener('click', initGame);

// ─── Boot ─────────────────────────────────────

initGame();
