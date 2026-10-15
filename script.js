const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');

if (primaryNav && !primaryNav.querySelector('a[href="staff.html"]')) {
  const staffLink = document.createElement('a');
  staffLink.href = 'staff.html';
  staffLink.textContent = 'Our team';
  primaryNav.insertBefore(staffLink, primaryNav.querySelector('.nav-contact'));
}

const siteHeader = document.querySelector('.site-header');
const themeToggle = document.createElement('button');
themeToggle.className = 'theme-toggle';
themeToggle.type = 'button';
themeToggle.setAttribute('aria-pressed', 'false');
themeToggle.innerHTML = '<svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg><svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
siteHeader?.append(themeToggle);

if (siteHeader) {
  let savedTheme;
  try {
    savedTheme = localStorage.getItem('ecosynic-theme');
  } catch {
    savedTheme = null;
  }
  const initialTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';

  const applyTheme = (theme, savePreference = false) => {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    if (savePreference) {
      try {
        localStorage.setItem('ecosynic-theme', theme);
      } catch {
        // The current page still changes theme when storage is unavailable.
      }
    }
  };

  applyTheme(initialTheme);
  themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
}

menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  primaryNav.classList.toggle('is-open', !isOpen);
});

primaryNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    primaryNav.classList.remove('is-open');
  });
});

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach((item) => {
      const isActive = item === button;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelectorAll('.initiative-card').forEach((card) => {
      card.hidden = filter !== 'all' && card.dataset.category !== filter;
    });
  });
});

const inquiryForm = document.querySelector('#inquiry-form');
const feedbackDialog = document.querySelector('#contact-feedback');
const feedbackTitle = document.querySelector('#contact-feedback-title');
const feedbackMessage = document.querySelector('#contact-feedback-message');
const feedbackClose = document.querySelector('#contact-feedback-close');

feedbackClose?.addEventListener('click', () => feedbackDialog.close());

inquiryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formNote = document.querySelector('#form-note');
  submitButton.disabled = true;
  formNote.dataset.state = 'sending';
  formNote.textContent = 'Sending your enquiry...';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send your enquiry.');
    form.reset();
    formNote.textContent = '';
    feedbackDialog.dataset.state = 'success';
    feedbackTitle.textContent = 'Enquiry sent';
    feedbackMessage.textContent = result.message;
  } catch (error) {
    formNote.textContent = '';
    feedbackDialog.dataset.state = 'error';
    feedbackTitle.textContent = 'Enquiry not sent';
    feedbackMessage.textContent = error.message || 'Could not send your enquiry. Please try again later.';
  } finally {
    submitButton.disabled = false;
    if (!feedbackDialog.open) {
      feedbackDialog.showModal();
      feedbackClose.focus();
    }
  }
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

const advisorForm = document.querySelector('#advisor-form');

if (advisorForm) {
  const locationSelect = document.querySelector('#advisor-location');
  const forecastTitle = document.querySelector('#forecast-location');
  const forecastSummary = document.querySelector('#forecast-summary');
  const forecastDays = document.querySelector('#forecast-days');
  const advisorStatus = document.querySelector('#advisor-status');
  const chatMessages = document.querySelector('#chat-messages');
  const advisorQuestion = document.querySelector('#advisor-question');
  const advisorSubmit = document.querySelector('#advisor-submit');
  const advisorError = document.querySelector('#advisor-error');
  const conversation = [];
  let activeForecast = null;

  const addMessage = (role, text, source = '') => {
    const message = document.createElement('div');
    message.className = `chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = role === 'user' ? 'YOU' : source === 'gemini' ? 'AI CLIMATE ADVISOR' : 'FORECAST-INFORMED GUIDE';
    const content = document.createElement('p');
    content.textContent = text;
    message.append(author, content);
    chatMessages.append(message);
    message.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const loadForecast = async () => {
    const location = locationSelect.value;
    forecastTitle.textContent = 'Loading forecast...';
    forecastSummary.textContent = 'Fetching the latest available forecast...';
    forecastDays.replaceChildren();
    advisorStatus.textContent = 'Connecting';
    advisorStatus.classList.remove('is-ready', 'is-local');

    try {
      const response = await fetch(`/api/forecast?region=${encodeURIComponent(location)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load this forecast.');
      activeForecast = data;
      forecastTitle.textContent = data.region;
      advisorStatus.textContent = data.aiAvailable ? 'AI advisor ready' : 'Forecast guide';
      advisorStatus.classList.add(data.aiAvailable ? 'is-ready' : 'is-local');

      const totalRain = data.daily.reduce((sum, day) => sum + (day.precipitation || 0), 0);
      const warmest = Math.max(...data.daily.map((day) => day.high));
      forecastSummary.textContent = `Next 7 days: ${totalRain.toFixed(1)} mm expected rainfall · highs up to ${Math.round(warmest)}°C.`;

      const maxRain = Math.max(1, ...data.daily.map((day) => day.precipitation || 0));
      data.daily.forEach((day) => {
        const card = document.createElement('div');
        card.className = 'forecast-day';
        const name = document.createElement('span');
        name.className = 'forecast-day-name';
        name.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`));
        const temp = document.createElement('strong');
        temp.textContent = `${Math.round(day.high)}°`;
        const range = document.createElement('span');
        range.className = 'forecast-range';
        range.textContent = `${Math.round(day.low)}° / ${Math.round(day.high)}°`;
        const bar = document.createElement('span');
        bar.className = 'rain-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(4, ((day.precipitation || 0) / maxRain) * 100)}%`;
        bar.append(fill);
        const rain = document.createElement('span');
        rain.className = 'forecast-rain';
        rain.textContent = `${(day.precipitation || 0).toFixed(1)} mm`;
        card.append(name, temp, range, bar, rain);
        forecastDays.append(card);
      });
    } catch (error) {
      activeForecast = null;
      forecastTitle.textContent = 'Forecast unavailable';
      forecastSummary.textContent = error.message;
      advisorStatus.textContent = 'Offline';
      advisorStatus.classList.add('is-local');
    }
  };

  locationSelect.addEventListener('change', () => {
    conversation.length = 0;
    chatMessages.replaceChildren();
    addMessage('assistant', 'Ask about planting, rainfall, heat, soil moisture or planning farm activities. I’ll use the selected location’s forecast as context.');
    loadForecast();
  });

  advisorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = advisorQuestion.value.trim();
    if (!question) return;
    advisorError.hidden = true;
    addMessage('user', question);
    advisorQuestion.value = '';
    advisorSubmit.disabled = true;
    advisorSubmit.innerHTML = 'Thinking <span aria-hidden="true">…</span>';

    try {
      const response = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId: locationSelect.value, question, history: conversation.slice(-8) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The advisor could not respond. Please try again.');
      addMessage('assistant', data.reply, data.source);
      conversation.push({ role: 'user', text: question }, { role: 'model', text: data.reply });
    } catch (error) {
      advisorError.textContent = error.message;
      advisorError.hidden = false;
    } finally {
      advisorSubmit.disabled = false;
      advisorSubmit.innerHTML = 'Ask advisor <span aria-hidden="true">↗</span>';
      advisorQuestion.focus();
    }
  });

  loadForecast();
}

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const impactObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);

      const value = entry.target.textContent.trim().match(/^(\d+)(\+?)$/);
      if (!value) return;

      const total = Number(value[1]);
      const suffix = value[2];
      const startedAt = performance.now();
      const duration = 1200;
      const countUp = (timestamp) => {
        const progress = Math.min((timestamp - startedAt) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        entry.target.textContent = `${Math.floor(total * easedProgress)}${suffix}`;
        if (progress < 1) requestAnimationFrame(countUp);
      };

      entry.target.textContent = `0${suffix}`;
      requestAnimationFrame(countUp);
    });
  }, { threshold: 0.7 });

  document.querySelectorAll('.metric-value').forEach((value) => impactObserver.observe(value));

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  const revealTargets = document.querySelectorAll('.intro-label, .intro-main, .intro-side, .work-heading, .work-card, .approach-top, .process-step, .approach-note, .technology-image, .technology-panel, .agriculture-copy, .advisory-card, .impact-top, .metric, .initiatives-head, .filter-row, .initiative-card, .knowledge-image, .knowledge-content, .lab-note, .partners-heading, .partner-types span, .partner-note, .values-title, .values-list > div, .contact-intro, .inquiry-form, .pathway-overview > *, .pathway-focus > *, .pathway-method-inner > *, .method-step, .pathway-cta > *, .advisor-heading > *, .forecast-panel, .advisor-chat, .footer-top, .footer-main > *, .footer-bottom');
  const groupDelays = new Map();

  revealTargets.forEach((item) => {
    const group = item.closest('section, footer') || item.parentElement;
    const index = groupDelays.get(group) || 0;
    groupDelays.set(group, index + 1);
    item.classList.add('reveal');
    if (item.matches('.technology-image, .knowledge-image')) item.classList.add('reveal-image');
    item.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 85}ms`);
    revealObserver.observe(item);
  });
}