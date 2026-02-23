(function () {
  const API_BASE = 'https://bkdreykodrey-production.up.railway.app';
  const seriesData = window.DREYKO_SERIES || [];

  function getSeriesIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function findSeriesById(id) {
    return seriesData.find((s) => s.id === id);
  }

  function getEpisodeUrl(episodeNumber) {
    return `https://example.com/embed/EPISODE_${episodeNumber}`;
  }

  function isRealEpisodeUrl(url) {
    if (!url) return false;
    if (url.startsWith('https://example.com')) return false;
    return true;
  }

  function getLocalStorageKey(seriesId) {
    return `dreyko_last_episode_${seriesId}`;
  }

  function loadLastEpisode(seriesId, totalEpisodes) {
    const key = getLocalStorageKey(seriesId);
    const stored = window.localStorage.getItem(key);
    if (!stored) return 1;
    const n = parseInt(stored, 10);
    if (Number.isNaN(n) || n < 1 || n > totalEpisodes) return 1;
    return n;
  }

  function saveLastEpisode(seriesId, episodeNumber) {
    const key = getLocalStorageKey(seriesId);
    window.localStorage.setItem(key, String(episodeNumber));
  }

  function scrollToPlayer() {
    const section = document.getElementById('player-section');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function createEpisodeItem(index, isActive) {
    const li = document.createElement('li');
    li.className = 'dd-episode-item';
    if (isActive) li.classList.add('is-active');
    li.dataset.episodeNumber = String(index);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dd-episode-button';

    const idxSpan = document.createElement('span');
    idxSpan.className = 'dd-episode-index';
    idxSpan.textContent = `#${index}`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dd-episode-label';
    labelSpan.textContent = `Episodio ${index}`;

    const badge = document.createElement('span');
    badge.className = 'dd-episode-badge';
    badge.textContent = index === 1 ? 'Inicio' : 'HD';

    button.appendChild(idxSpan);
    button.appendChild(labelSpan);
    button.appendChild(badge);

    li.appendChild(button);
    return li;
  }

  function renderEpisodesList(series, currentEpisode) {
    const list = document.getElementById('episodes-list');
    if (!list) return;
    list.innerHTML = '';

    for (let i = 1; i <= series.episodes; i += 1) {
      const isActive = i === currentEpisode;
      const item = createEpisodeItem(i, isActive);
      list.appendChild(item);
    }
  }

  function setActiveEpisodeInList(episodeNumber) {
    const items = document.querySelectorAll('.dd-episode-item');
    items.forEach((item) => {
      const n = parseInt(item.dataset.episodeNumber || '0', 10);
      if (n === episodeNumber) item.classList.add('is-active');
      else item.classList.remove('is-active');
    });
  }

  function updatePlayer(series, episodeNumber) {
    const iframe = document.getElementById('player-iframe');
    const placeholder = document.getElementById('player-placeholder');
    if (!iframe) return;

    const url = getEpisodeUrl(episodeNumber);
    const hasRealUrl = isRealEpisodeUrl(url);

    if (hasRealUrl) {
      iframe.src = url;
      iframe.title = `${series.title} - Episodio ${episodeNumber}`;
      iframe.classList.remove('dd-player-iframe-hidden');
      if (placeholder) {
        placeholder.classList.remove('is-active');
      }
    } else {
      iframe.removeAttribute('src');
      iframe.classList.add('dd-player-iframe-hidden');
      if (placeholder) {
        placeholder.classList.add('is-active');
      }
    }

    setActiveEpisodeInList(episodeNumber);
    saveLastEpisode(series.id, episodeNumber);
  }

  function setupEpisodesInteractions(series, state) {
    const list = document.getElementById('episodes-list');
    if (!list) return;

    list.addEventListener('click', (e) => {
      const li = e.target.closest('.dd-episode-item');
      if (!li) return;
      const n = parseInt(li.dataset.episodeNumber || '0', 10);
      if (!n) return;
      state.currentEpisode = n;
      updatePlayer(series, n);
      scrollToPlayer();
    });
  }

  function setupPrevNextButtons(series, state) {
    const prevBtn = document.getElementById('prev-episode');
    const nextBtn = document.getElementById('next-episode');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.currentEpisode > 1) {
          state.currentEpisode -= 1;
          updatePlayer(series, state.currentEpisode);
          scrollToPlayer();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.currentEpisode < series.episodes) {
          state.currentEpisode += 1;
          updatePlayer(series, state.currentEpisode);
          scrollToPlayer();
        }
      });
    }
  }

  function openEpisodesDrawer() {
    const panel = document.getElementById('episodes-panel');
    const backdrop = document.getElementById('episodes-backdrop');
    if (panel) panel.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-visible');
  }

  function closeEpisodesDrawer() {
    const panel = document.getElementById('episodes-panel');
    const backdrop = document.getElementById('episodes-backdrop');
    if (panel) panel.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-visible');
  }

  function setupDrawerControls() {
    const toggleBtn = document.getElementById('toggle-episodes');
    const closeBtn = document.getElementById('close-episodes');
    const backdrop = document.getElementById('episodes-backdrop');

    if (toggleBtn) toggleBtn.addEventListener('click', openEpisodesDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeEpisodesDrawer);
    if (backdrop) backdrop.addEventListener('click', closeEpisodesDrawer);
  }

  function setupDonationSection() {
    const amountText = document.getElementById('donation-amount-text');
    const pctText = document.getElementById('donation-percentage-text');
    const progressInner = document.getElementById('donation-progress-inner');
    const statusText = document.getElementById('donation-status-text');
    const goalMiniMain = document.getElementById('goal-mini-main');
    const goalMiniDonors = document.getElementById('goal-mini-donors');
    const donationAmountMain = document.getElementById('donation-amount-main');
    const donationDonorsText = document.getElementById('donation-donors-text');

    if (
      !amountText ||
      !pctText ||
      !progressInner ||
      !statusText ||
      !goalMiniMain ||
      !goalMiniDonors ||
      !donationAmountMain ||
      !donationDonorsText
    ) {
      return;
    }

    async function fetchGoal() {
      try {
        statusText.textContent = 'Actualizando…';
        const res = await fetch(`${API_BASE}/api/goal`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const goalUsd = Number(data.goalUsd || 0);
        const currentUsd = Number(data.currentUsd || 0);
        const pct = Number(data.progressPct || 0);
         const donorsCount = Number(data.donorsCount || 0);

        const amountLabel = `$${currentUsd.toFixed(2)} / $${goalUsd.toFixed(2)}`;
        const pctLabel = `${pct.toFixed(1)}%`;
        const donorsLabel =
          donorsCount === 0
            ? 'Se el primero en donar'
            : donorsCount === 1
            ? '1 persona ya apoyó'
            : `${donorsCount} personas ya apoyaron`;

        amountText.textContent = amountLabel;
        pctText.textContent = `${pct.toFixed(1)}%`;
        const clamped = Math.max(0, Math.min(100, pct));
        progressInner.style.width = `${clamped}%`;
        statusText.textContent = 'Se actualiza automáticamente cada 30 segundos.';

        goalMiniMain.textContent = `🎯 Meta semanal: $${goalUsd.toFixed(2)}`;
        goalMiniDonors.textContent = `💰 Recaudado: $${currentUsd.toFixed(2)} (${pctLabel})`;
        donationAmountMain.textContent = amountLabel;
        donationDonorsText.textContent = donorsLabel;
      } catch (err) {
        console.error('[Donaciones] Error obteniendo meta', err);
        statusText.textContent = 'Sin conexión con el servidor de donaciones.';
        goalMiniMain.textContent = '🎯 Meta semanal: sin conexión';
        goalMiniDonors.textContent = '👥 Sin conexión para mostrar los apoyos';
      }
    }

    fetchGoal();
    setInterval(fetchGoal, 30000);
  }

  function setYear() {
    const spans = document.querySelectorAll('#year');
    const year = new Date().getFullYear();
    spans.forEach((el) => (el.textContent = year));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const seriesId = getSeriesIdFromUrl();
    const series = findSeriesById(seriesId);

    if (!series) {
      const titleEl = document.getElementById('series-title');
      const descEl = document.getElementById('series-description');
      if (titleEl) titleEl.textContent = 'Serie no encontrada';
      if (descEl)
        descEl.textContent =
          'La serie que buscás no existe o el enlace está incompleto. Volvé al inicio.';
      return;
    }

    const titleEl = document.getElementById('series-title');
    const descEl = document.getElementById('series-description');
    if (titleEl) titleEl.textContent = series.title;
    if (descEl) descEl.textContent = series.shortDescription;

    const initialEpisode = loadLastEpisode(series.id, series.episodes);
    const state = { currentEpisode: initialEpisode };

    renderEpisodesList(series, initialEpisode);
    updatePlayer(series, initialEpisode);

    setupEpisodesInteractions(series, state);
    setupPrevNextButtons(series, state);
    setupDrawerControls();
    setupDonationSection();
    setYear();
  });
})();

