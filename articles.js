(() => {
  const list = document.querySelector('#articles-list');
  const count = document.querySelector('#articles-count');
  const errorMessage = document.querySelector('#articles-error');
  const filters = [...document.querySelectorAll('[data-article-filter]')];
  let articles = [];
  let activeFilter = 'all';

  function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  }

  function sortedArticles(entries) {
    const group = (article) => article.type === 'event' && article.status === 'upcoming' ? 0
      : article.type === 'news' ? 1 : 2;
    return [...entries].sort((first, second) => group(first) - group(second)
      || (group(first) === 0 ? first.date.localeCompare(second.date) : second.date.localeCompare(first.date)));
  }

  function visibleArticles() {
    if (activeFilter === 'all') return articles;
    if (activeFilter === 'news') return articles.filter((article) => article.type === 'news');
    return articles.filter((article) => article.type === 'event' && article.status === activeFilter);
  }

  function youtubeVideoId(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const id = host === 'youtu.be'
        ? url.pathname.split('/').filter(Boolean)[0]
        : host === 'youtube.com' || host === 'm.youtube.com'
          ? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
          : '';
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
    } catch {
      return '';
    }
  }

  function renderArticles() {
    const entries = sortedArticles(visibleArticles());
    list.replaceChildren();
    count.textContent = `${entries.length} ${entries.length === 1 ? 'update' : 'updates'}`;
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'articles-empty';
      empty.textContent = activeFilter === 'all'
        ? 'There are no updates to share just yet. Please check back soon.'
        : 'There are no updates in this category yet.';
      list.append(empty);
      return;
    }

    entries.forEach((article) => {
      const card = document.createElement('article');
      const videoId = article.type === 'event' ? youtubeVideoId(article.videoUrl) : '';
      card.className = 'article-card';
      const metadata = document.createElement('div');
      metadata.className = 'article-card-meta';
      const badge = document.createElement('span');
      badge.className = `article-badge is-${article.type === 'news' ? 'news' : article.status}`;
      badge.textContent = article.type === 'news'
        ? 'News & story'
        : article.status === 'past' ? 'Past event' : 'Upcoming event';
      const date = document.createElement('time');
      date.dateTime = article.date;
      date.textContent = formatDate(article.date);
      metadata.append(badge, date);
      const title = document.createElement('h2');
      title.textContent = article.title;
      const summary = document.createElement('p');
      summary.className = 'article-card-summary';
      summary.textContent = article.summary;
      if (article.imageUrl) {
        const image = document.createElement('img');
        image.className = 'article-card-image';
        image.src = article.imageUrl;
        image.alt = article.imageAlt || '';
        image.loading = 'lazy';
        card.append(metadata, image, title, summary);
      } else {
        card.append(metadata, title, summary);
      }
      if (videoId) {
        const video = document.createElement('div');
        video.className = 'article-video';
        const player = document.createElement('iframe');
        player.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
        player.title = `YouTube video: ${article.title}`;
        player.loading = 'lazy';
        player.referrerPolicy = 'strict-origin-when-cross-origin';
        player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        player.allowFullscreen = true;
        video.append(player);
        card.append(video);
      }
      const details = document.createElement('details');
      details.className = 'article-card-details';
      const toggle = document.createElement('summary');
      toggle.textContent = 'Read more';
      const content = document.createElement('p');
      content.textContent = article.content;
      details.append(toggle, content);
      card.append(details);
      list.append(card);
    });
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.articleFilter;
      filters.forEach((filter) => {
        const selected = filter === button;
        filter.classList.toggle('is-active', selected);
        filter.setAttribute('aria-pressed', String(selected));
      });
      renderArticles();
    });
  });

  async function loadArticles() {
    try {
      const response = await fetch('/api/articles');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Articles and news are unavailable.');
      articles = Array.isArray(result.articles) ? result.articles : [];
      renderArticles();
    } catch (error) {
      count.textContent = '';
      errorMessage.textContent = error.message || 'Articles and news are unavailable.';
      list.replaceChildren();
      console.error('Could not load articles and news:', error.message || error);
    }
  }

  loadArticles();
})();
