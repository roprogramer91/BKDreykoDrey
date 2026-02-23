(function () {
  const seriesData = window.DREYKO_SERIES || [];

  function createSeriesCard(serie) {
    const card = document.createElement('article');
    card.className = 'dd-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver detalles de ${serie.title}`);

    const coverWrapper = document.createElement('div');
    coverWrapper.className = 'dd-card-cover-wrapper';

    const img = document.createElement('img');
    img.className = 'dd-card-cover';
    img.src = serie.coverUrl;
    img.alt = serie.title;

    const gradient = document.createElement('div');
    gradient.className = 'dd-card-gradient';

    coverWrapper.appendChild(img);
    coverWrapper.appendChild(gradient);

    const body = document.createElement('div');
    body.className = 'dd-card-body';

    const title = document.createElement('h3');
    title.className = 'dd-card-title';
    title.textContent = serie.title;

    const meta = document.createElement('div');
    meta.className = 'dd-card-meta';

    const episodes = document.createElement('span');
    episodes.textContent = `${serie.episodes} episodios`;

    const chip = document.createElement('span');
    chip.className = 'dd-card-chip';
    chip.textContent = 'Romance · C-Drama';

    meta.appendChild(episodes);
    meta.appendChild(chip);

    body.appendChild(title);
    body.appendChild(meta);

    function goToSeries() {
      window.location.href = `series.html?id=${encodeURIComponent(serie.id)}`;
    }

    card.addEventListener('click', goToSeries);
    card.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToSeries();
      }
    });

    card.appendChild(coverWrapper);
    card.appendChild(body);

    return card;
  }

  function renderSeriesGrid() {
    const grid = document.getElementById('series-grid');
    if (!grid) return;
    grid.innerHTML = '';

    seriesData.forEach((serie) => {
      grid.appendChild(createSeriesCard(serie));
    });
  }

  function setYear() {
    const spans = document.querySelectorAll('#year');
    const year = new Date().getFullYear();
    spans.forEach((el) => (el.textContent = year));
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderSeriesGrid();
    setYear();
  });
})();

