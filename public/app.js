(function () {
  const stage = document.getElementById('stage');
  const layerA = document.getElementById('bg-layer-a');
  const layerB = document.getElementById('bg-layer-b');
  const title = document.getElementById('game-title');
  const wheelImg = document.getElementById('wheel-img');
  const scoreList = document.getElementById('score-list');
  const dateNote = document.getElementById('date-note');
  const emptyState = document.getElementById('empty-state');
  const progressFill = document.getElementById('progress-fill');

  let games = [];
  let currentIndex = 0;
  let secondsPerGame = 10;
  let activeLayer = layerA;
  let idleLayer = layerB;
  let cycleTimer = null;
  let progressStart = null;
  let progressRaf = null;

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  async function loadMeta() {
    try {
      const meta = await fetchJson('/api/meta');
      secondsPerGame = meta.secondsPerGame || 10;
    } catch (err) {
      console.warn('Failed to load /api/meta', err);
    }
  }

  async function loadGames() {
    try {
      const data = await fetchJson('/api/games');
      games = data;
      if (games.length === 0) {
        emptyState.hidden = false;
        stage.style.display = 'none';
      } else {
        emptyState.hidden = true;
        stage.style.display = '';
        if (currentIndex >= games.length) currentIndex = 0;
      }
    } catch (err) {
      console.warn('Failed to load /api/games', err);
    }
  }

  function formatScore(n) {
    return n.toLocaleString('en-US');
  }

  function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso; // already a plain string like "04/12/24"
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderGame(game) {
    title.textContent = game.displayName;

    if (game.hasWheel) {
      wheelImg.src = `/media/${game.id}/wheel?_=${Date.now()}`;
      wheelImg.classList.add('loaded');
      wheelImg.onerror = () => wheelImg.classList.remove('loaded');
    } else {
      wheelImg.classList.remove('loaded');
    }

    scoreList.innerHTML = '';
    game.scores.forEach((s) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="rank">${s.rank}</span>
        <span class="initials">${escapeHtml(s.initials)}</span>
        <span class="score">${formatScore(s.score)}</span>
      `;
      scoreList.appendChild(li);
    });

    const withDates = game.scores.some((s) => s.date);
    if (withDates) {
      dateNote.textContent = '';
    } else if (game.scoresApproximateDate) {
      dateNote.textContent = `Scores last updated ${formatDate(game.scoresApproximateDate)} (source scores have no per-entry date)`;
    } else {
      dateNote.textContent = '';
    }

    // Per-score dates, if present, appended after the note as a compact line.
    const dated = game.scores.filter((s) => s.date);
    if (dated.length) {
      dateNote.textContent = dated.map((s) => `${s.initials}: ${formatDate(s.date)}`).join('   •   ');
    }

    const bgUrl = game.hasBackground ? `/media/${game.id}/background?_=${Date.now()}` : null;
    idleLayer.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : 'none';

    // Crossfade: bring idle layer to front, push active layer back.
    idleLayer.classList.add('visible');
    activeLayer.classList.remove('visible');
    [activeLayer, idleLayer] = [idleLayer, activeLayer];
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function startProgress(durationMs) {
    cancelAnimationFrame(progressRaf);
    progressStart = performance.now();
    const tick = (now) => {
      const pct = Math.min(100, ((now - progressStart) / durationMs) * 100);
      progressFill.style.width = pct + '%';
      if (pct < 100) progressRaf = requestAnimationFrame(tick);
    };
    progressRaf = requestAnimationFrame(tick);
  }

  function showCurrent() {
    if (games.length === 0) return;
    renderGame(games[currentIndex]);
    startProgress(secondsPerGame * 1000);
  }

  function advance() {
    if (games.length === 0) return;
    currentIndex = (currentIndex + 1) % games.length;
    showCurrent();
  }

  function scheduleNext() {
    clearTimeout(cycleTimer);
    cycleTimer = setTimeout(() => {
      advance();
      scheduleNext();
    }, secondsPerGame * 1000);
  }

  async function init() {
    await loadMeta();
    await loadGames();
    showCurrent();
    scheduleNext();

    // Keep data fresh without interrupting the current cycle timing.
    setInterval(loadGames, 30000);
  }

  init();
})();
