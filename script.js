const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');

if (primaryNav && !primaryNav.querySelector('a[href="staff.html"]')) {
  const staffLink = document.createElement('a');
  staffLink.href = 'staff.html';
  staffLink.textContent = 'Our team';
  primaryNav.insertBefore(staffLink, primaryNav.querySelector('.nav-contact'));
}

if (primaryNav && !primaryNav.querySelector('a[href="articles.html"]')) {
  const articlesLink = document.createElement('a');
  articlesLink.href = 'articles.html';
  articlesLink.textContent = 'Articles & news';
  primaryNav.insertBefore(articlesLink, primaryNav.querySelector('.nav-contact'));
}

if (primaryNav && /(?:^|\/)articles(?:\.html)?\/?$/.test(location.pathname)) {
  primaryNav.querySelector('a[href="articles.html"]')?.setAttribute('aria-current', 'page');
}

const footerMain = document.querySelector('.footer-main');
if (footerMain && !footerMain.querySelector('.footer-resources')) {
  const resources = document.createElement('div');
  resources.className = 'footer-column footer-resources';
  const heading = document.createElement('span');
  heading.textContent = 'MORE';
  resources.append(heading);
  [
    ['FAQs', 'faq.html'],
    ['Geographic scope', 'geographic-scope.html'],
    ['Newsletter', 'newsletter.html'],
    ['Articles & news', 'articles.html'],
    ['Get involved', 'get-involved.html'],
  ].forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    resources.append(link);
  });
  footerMain.append(resources);
}

const resourceNotifications = [
  {
    topic: 'REGIONAL SCOPE',
    title: 'Get to know our region',
    message: 'Explore the counties at the heart of Ecosynic’s regional focus.',
    link: 'Explore our focus',
    href: 'geographic-scope.html',
  },
  {
    topic: 'QUICK ANSWERS',
    title: 'Curious about Ecosynic?',
    message: 'Find helpful details about our work, reporting and ways to connect.',
    link: 'Browse the FAQs',
    href: 'faq.html',
  },
  {
    topic: 'EMAIL UPDATES',
    title: 'Good ideas are worth sharing',
    message: 'Get occasional Ecosynic news and updates delivered to your inbox.',
    link: 'See email updates',
    href: 'newsletter.html',
  },
  {
    topic: 'FIELD STORIES',
    title: 'See climate action in practice',
    message: 'Explore stories and perspectives from across our work.',
    link: 'Read our stories',
    href: 'articles.html',
  },
];

let resourceNotificationsMuted = false;
try {
  resourceNotificationsMuted = localStorage.getItem('ecosynic-resource-notifications-muted') === 'true';
} catch {
  resourceNotificationsMuted = false;
}

if (primaryNav) {
  const notification = document.createElement('aside');
  notification.className = 'resource-notification';
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-label', 'More from Ecosynic');
  notification.setAttribute('aria-hidden', 'true');
  notification.hidden = true;
  notification.innerHTML = `
    <div class="resource-notification-content">
      <div class="resource-notification-heading">
        <span class="resource-notification-icon" aria-hidden="true">e</span>
        <div>
          <span class="resource-notification-overline"></span>
          <h2></h2>
        </div>
        <button class="resource-notification-mute" type="button" aria-label="Mute rotating notifications">Mute</button>
        <button class="resource-notification-close" type="button" aria-label="Dismiss discovery notification">&times;</button>
      </div>
      <p></p>
      <a class="resource-notification-action" href=""><span></span><span aria-hidden="true">↗</span></a>
    </div>
    <div class="resource-notification-muted" hidden>
      <span>Discovery notifications are muted</span>
      <button class="resource-notification-resume" type="button">Resume</button>
    </div>
  `;
  document.body.append(notification);

  const content = notification.querySelector('.resource-notification-content');
  const mutedState = notification.querySelector('.resource-notification-muted');
  const topic = notification.querySelector('.resource-notification-overline');
  const title = notification.querySelector('h2');
  const message = notification.querySelector('p');
  const action = notification.querySelector('.resource-notification-action');
  const muteButton = notification.querySelector('.resource-notification-mute');
  const dismissButton = notification.querySelector('.resource-notification-close');
  const resumeButton = notification.querySelector('.resource-notification-resume');
  let nextNotificationIndex = 0;
  let dismissTimer;
  let cycleTimer;

  const dismissNotification = () => {
    if (notification.hidden || !notification.classList.contains('is-visible')) return;
    notification.classList.remove('is-visible');
    notification.setAttribute('aria-hidden', 'true');
    window.clearTimeout(dismissTimer);
    window.setTimeout(() => {
      if (!notification.classList.contains('is-visible')) notification.hidden = true;
    }, 550);
  };

  const saveMutePreference = (muted) => {
    try {
      localStorage.setItem('ecosynic-resource-notifications-muted', String(muted));
    } catch {
      // The current page still applies the preference when storage is unavailable.
    }
  };

  const muteNotifications = () => {
    resourceNotificationsMuted = true;
    saveMutePreference(true);
    window.clearTimeout(dismissTimer);
    window.clearTimeout(cycleTimer);
    content.hidden = true;
    mutedState.hidden = false;
    notification.classList.add('is-muted', 'is-visible');
    notification.setAttribute('aria-label', 'Discovery notifications muted');
    notification.setAttribute('aria-hidden', 'false');
    notification.hidden = false;
    resumeButton.focus();
  };

  const showNextNotification = () => {
    if (resourceNotificationsMuted) return;
    const item = resourceNotifications[nextNotificationIndex];
    nextNotificationIndex = (nextNotificationIndex + 1) % resourceNotifications.length;
    topic.textContent = `ECOSYNIC · ${item.topic}`;
    title.textContent = item.title;
    message.textContent = item.message;
    action.href = item.href;
    action.querySelector('span').textContent = item.link;
    notification.hidden = false;
    notification.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      notification.classList.add('is-visible');
    });
    dismissTimer = window.setTimeout(dismissNotification, 6000);
    cycleTimer = window.setTimeout(showNextNotification, 10000);
  };

  muteButton.addEventListener('click', muteNotifications);
  dismissButton.addEventListener('click', dismissNotification);
  resumeButton.addEventListener('click', () => {
    resourceNotificationsMuted = false;
    saveMutePreference(false);
    content.hidden = false;
    mutedState.hidden = true;
    notification.classList.remove('is-muted');
    notification.setAttribute('aria-label', 'More from Ecosynic');
    showNextNotification();
    muteButton.focus();
  });

  if (resourceNotificationsMuted) {
    content.hidden = true;
    mutedState.hidden = false;
    notification.classList.add('is-muted');
    notification.setAttribute('aria-label', 'Discovery notifications muted');
    notification.hidden = false;
    notification.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => notification.classList.add('is-visible'));
  } else {
    cycleTimer = window.setTimeout(showNextNotification, 10000);
  }
}

if (primaryNav) {
  const socialWidget = document.createElement('div');
  socialWidget.className = 'floating-social';
  socialWidget.innerHTML = `
    <div class="floating-social-panel" id="floating-social-panel" role="group" aria-label="Ecosynic social media" aria-hidden="true" hidden>
      <p class="floating-social-heading">Find Ecosynic online</p>
      <a class="floating-social-link" href="https://www.facebook.com/profile.php?id=61595448954346" target="_blank" rel="noopener noreferrer" aria-label="Visit Ecosynic Africa on Facebook">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.71 4.54-4.71 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.07 24 18.09 24 12.07z"/></svg>
        <span>Facebook</span><span class="floating-social-status" aria-hidden="true">↗</span>
      </a>
      <button class="floating-social-link is-unavailable" type="button" disabled title="Profile link coming soon" aria-label="Instagram profile link coming soon">
        <svg class="social-icon-outline" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" class="social-icon-fill"/></svg>
        <span>Instagram</span><span class="floating-social-status">Coming soon</span>
      </button>
      <a class="floating-social-link" href="https://wa.me/254702468206" target="_blank" rel="noopener noreferrer" aria-label="Chat with Ecosynic Africa on WhatsApp">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.82 11.82 0 0 0 1.86 17.76L.3 23.5l5.88-1.54A11.82 11.82 0 0 0 20.52 3.48ZM12 21.3a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.49.91.93-3.4-.22-.35A9.3 9.3 0 1 1 12 21.3Z"/><path d="M17.2 14.1c-.28-.14-1.65-.82-1.91-.91-.26-.1-.44-.14-.63.14-.18.28-.72.91-.88 1.1-.16.18-.32.21-.6.07a7.62 7.62 0 0 1-2.25-1.39 8.44 8.44 0 0 1-1.56-1.94c-.16-.28-.02-.43.12-.57.13-.12.28-.32.42-.49.14-.16.18-.28.28-.46.1-.18.05-.35-.02-.49-.07-.14-.63-1.52-.86-2.08-.23-.55-.46-.48-.63-.49h-.53c-.18 0-.49.07-.74.35-.26.28-.98.96-.98 2.34s1 2.71 1.14 2.89c.14.18 1.97 3.01 4.77 4.22.67.29 1.19.46 1.6.59.67.21 1.28.18 1.76.11.54-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.12-.25-.19-.53-.33Z"/></svg>
        <span>WhatsApp</span><span class="floating-social-status" aria-hidden="true">↗</span>
      </a>
      <button class="floating-social-link is-unavailable" type="button" disabled title="Profile link coming soon" aria-label="X profile link coming soon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-7.45L5.53 22H2.4l7.25-8.29L1.8 2h6.4l4.43 6.77L18.9 2Zm-1.1 18h1.73L7.28 3.89H5.42L17.8 20Z"/></svg>
        <span>X</span><span class="floating-social-status">Coming soon</span>
      </button>
    </div>
    <button class="floating-social-toggle" type="button" aria-expanded="false" aria-controls="floating-social-panel" aria-label="Open social media links">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.3"/></svg>
    </button>
  `;
  document.body.append(socialWidget);

  const socialToggle = socialWidget.querySelector('.floating-social-toggle');
  const socialPanel = socialWidget.querySelector('.floating-social-panel');
  let socialPanelTimer;

  socialToggle.addEventListener('click', () => {
    const opening = socialToggle.getAttribute('aria-expanded') !== 'true';
    window.clearTimeout(socialPanelTimer);
    socialToggle.setAttribute('aria-expanded', String(opening));
    socialToggle.setAttribute('aria-label', opening ? 'Close social media links' : 'Open social media links');
    socialPanel.setAttribute('aria-hidden', String(!opening));

    if (opening) {
      socialPanel.hidden = false;
      window.requestAnimationFrame(() => socialPanel.classList.add('is-open'));
    } else {
      socialPanel.classList.remove('is-open');
      socialPanelTimer = window.setTimeout(() => {
        if (socialToggle.getAttribute('aria-expanded') !== 'true') socialPanel.hidden = true;
      }, 250);
    }
  });
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

const heroSlides = Array.from(document.querySelectorAll('.hero-slide'));
const heroSliderIndex = document.querySelector('#hero-slider-index');
if (heroSlides.length) {
  let activeIndex = 0;
  const setActiveSlide = (index) => {
    activeIndex = index;
    heroSlides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === index);
    });
    if (heroSliderIndex) {
      heroSliderIndex.textContent = `${String(index + 1).padStart(2, '0')} / ${String(heroSlides.length).padStart(2, '0')}`;
    }
  };
  setInterval(() => {
    setActiveSlide((activeIndex + 1) % heroSlides.length);
  }, 3000);
}

const galleryToggle = document.querySelector('.gallery-toggle');
const extraGalleryFigures = document.querySelectorAll('[data-gallery-extra]');

if (galleryToggle && extraGalleryFigures.length) {
  galleryToggle.addEventListener('click', () => {
    const expanded = galleryToggle.getAttribute('aria-expanded') === 'true';
    galleryToggle.setAttribute('aria-expanded', String(!expanded));
    galleryToggle.textContent = expanded ? 'See more' : 'See less';
    extraGalleryFigures.forEach((figure) => {
      figure.hidden = expanded;
    });
  });
}

const inquiryForm = document.querySelector('#inquiry-form');
const feedbackDialog = document.querySelector('#contact-feedback');
const feedbackTitle = document.querySelector('#contact-feedback-title');
const feedbackMessage = document.querySelector('#contact-feedback-message');
const feedbackClose = document.querySelector('#contact-feedback-close');

feedbackClose?.addEventListener('click', () => feedbackDialog.close());

const newsletterForm = document.querySelector('#newsletter-form');
const newsletterFeedback = document.querySelector('#newsletter-feedback');
const newsletterFeedbackTitle = document.querySelector('#newsletter-feedback-title');
const newsletterFeedbackMessage = document.querySelector('#newsletter-feedback-message');
const newsletterFeedbackClose = document.querySelector('#newsletter-feedback-close');

newsletterFeedbackClose?.addEventListener('click', () => newsletterFeedback.close());

newsletterForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = newsletterForm.querySelector('button[type="submit"]');
  const formData = new FormData(newsletterForm);
  const status = document.querySelector('#newsletter-note');
  submitButton.disabled = true;
  status.textContent = 'Sending your subscription request...';

  try {
    const response = await fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        consent: formData.get('consent') === 'on',
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send your subscription request.');
    newsletterForm.reset();
    status.textContent = '';
    newsletterFeedback.dataset.state = 'success';
    newsletterFeedbackTitle.textContent = 'Subscription request sent';
    newsletterFeedbackMessage.textContent = result.message;
  } catch (error) {
    status.textContent = '';
    newsletterFeedback.dataset.state = 'error';
    newsletterFeedbackTitle.textContent = 'Subscription request not sent';
    newsletterFeedbackMessage.textContent = error.message || 'Could not send your subscription request. Please try again later.';
  } finally {
    submitButton.disabled = false;
    newsletterFeedback.showModal();
    newsletterFeedbackClose.focus();
  }
});

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