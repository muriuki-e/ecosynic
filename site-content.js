(() => {
  const pages = [
    { id: 'index', label: 'Home page', file: 'index.html' },
    { id: 'staff', label: 'Our team', file: 'staff.html' },
    { id: 'gallery', label: 'Photo gallery', file: 'gallery.html' },
    { id: 'articles', label: 'Articles & news', file: 'articles.html' },
    { id: 'climate-resilience', label: 'Climate resilience', file: 'climate-resilience.html' },
    { id: 'ecosystem-restoration', label: 'Ecosystem restoration', file: 'ecosystem-restoration.html' },
    { id: 'smart-agriculture', label: 'Smart agriculture', file: 'smart-agriculture.html' },
    { id: 'climate-technology', label: 'Climate technology', file: 'climate-technology.html' },
    { id: 'green-livelihoods', label: 'Green livelihoods', file: 'green-livelihoods.html' },
    { id: 'community-leadership', label: 'Community leadership', file: 'community-leadership.html' },
    { id: 'get-involved', label: 'Get involved', file: 'get-involved.html' },
    { id: 'geographic-scope', label: 'Geographic scope', file: 'geographic-scope.html' },
    { id: 'faq', label: 'FAQs', file: 'faq.html' },
    { id: 'newsletter', label: 'Newsletter', file: 'newsletter.html' },
    { id: 'newsletter-unsubscribe', label: 'Newsletter unsubscribe', file: 'newsletter-unsubscribe.html' },
  ];
  const excluded = 'script,style,noscript,svg,button,input,textarea,select,option,form,nav,[aria-hidden="true"],.metric-value,.hero-slider,.forecast-panel,.advisor-chat,.newsletter-feedback,.contact-feedback,#staff-list,#staff-count,#staff-status,#hero-slider-index,#newsletter-note,#unsubscribe-message,#year';

  function keyForNode(node, main) {
    const path = [];
    let current = node;
    while (current !== main) {
      const parent = current.parentNode;
      if (!parent) return '';
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return path.join('.');
  }

  function backgroundTargets(main, pageId) {
    const targets = {
      index: [
        ['technology', '.technology-image', 'Aerial view of cultivated land and natural terrain'],
        ['initiative-farm', '.image-farm', 'Smart agriculture pathway'],
        ['initiative-data', '.image-data', 'Climate technology pathway'],
        ['initiative-nature', '.image-nature', 'Ecosystem restoration pathway'],
        ['knowledge', '.knowledge-image', 'Sunlight falling over a lush green forest'],
      ],
      'climate-resilience': [['pathway-hero', '.pathway-hero', 'Climate resilience landscape']],
      'ecosystem-restoration': [['pathway-hero', '.pathway-hero', 'Ecosystem restoration landscape']],
      'smart-agriculture': [['pathway-hero', '.pathway-hero', 'Smart agriculture landscape']],
      'climate-technology': [['pathway-hero', '.pathway-hero', 'Climate technology landscape']],
      'green-livelihoods': [['pathway-hero', '.pathway-hero', 'Green livelihoods landscape']],
      'community-leadership': [['pathway-hero', '.pathway-hero', 'Community leadership landscape']],
    };
    return (targets[pageId] || []).map(([key, selector, alt]) => {
      const element = main?.querySelector(selector);
      return element ? { key: `background:${key}`, element, alt } : null;
    }).filter(Boolean);
  }

  function collectTextNodes(main) {
    if (!main) return [];
    const document = main.ownerDocument;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      nodes.push({
        key: keyForNode(node, main),
        value: node.nodeValue.trim(),
        node,
      });
    }
    return nodes;
  }

  function currentPage() {
    const segment = location.pathname.split('/').filter(Boolean).pop() || 'index';
    const id = segment.replace(/\.html$/, '');
    return id === 'home' ? 'index' : id;
  }

  function addLongTextToggles(root) {
    if (!root) return;
    let toggleIndex = 0;
    root.querySelectorAll('p').forEach((paragraph) => {
      if (paragraph.closest('.site-long-text') || paragraph.classList.contains('eyebrow')) return;
      const paragraphStyle = getComputedStyle(paragraph);
      const lineHeight = Number.parseFloat(paragraphStyle.lineHeight)
        || Number.parseFloat(paragraphStyle.fontSize) * 1.5;
      const maxHeight = lineHeight * 5;
      if (!Number.isFinite(maxHeight) || maxHeight <= 0) return;
      paragraph.classList.add('site-long-text-copy');
      paragraph.style.setProperty('--site-long-text-max-height', `${maxHeight}px`);
      if (paragraph.scrollHeight <= maxHeight + 1) {
        paragraph.classList.remove('site-long-text-copy');
        paragraph.style.removeProperty('--site-long-text-max-height');
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'site-long-text';
      paragraph.parentNode.insertBefore(wrapper, paragraph);
      wrapper.append(paragraph);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'site-long-text-toggle';
      toggle.textContent = 'See more';
      toggle.setAttribute('aria-expanded', 'false');
      let paragraphId;
      do {
        paragraphId = `site-long-text-${++toggleIndex}`;
      } while (document.getElementById(paragraphId));
      toggle.setAttribute('aria-controls', paragraphId);
      paragraph.id = paragraphId;
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        paragraph.classList.toggle('is-expanded', expanded);
        toggle.textContent = expanded ? 'See less' : 'See more';
      });
      wrapper.append(toggle);
    });
  }

  window.EcosynicContent = { pages, collectTextNodes, currentPage };

  const pageId = currentPage();
  if (!pages.some((page) => page.id === pageId)) return;
  const main = document.querySelector('main');
  const textNodes = collectTextNodes(main);

  async function loadContent() {
    try {
      const response = await fetch('/api/content');
      const content = await response.json();
      if (!response.ok) throw new Error(content.error || 'Website content is unavailable.');
      const overrides = content.overrides?.[pageId] || {};
      textNodes.forEach(({ key, value, node }) => {
        if (!Object.prototype.hasOwnProperty.call(overrides, key)) return;
        const original = node.nodeValue;
        const prefix = original.match(/^\s*/)[0];
        const suffix = original.match(/\s*$/)[0];
        node.nodeValue = `${prefix}${overrides[key]}${suffix}`;
      });
      if (pageId !== 'gallery') {
        const backgrounds = backgroundTargets(main, pageId);
        Object.entries(content.images?.[pageId] || {}).forEach(([key, image]) => {
          if (key.startsWith('background:')) {
            const target = backgrounds.find((entry) => entry.key === key)?.element;
            if (!target || typeof image?.url !== 'string') return;
            target.style.backgroundImage = `url("${image.url.replace(/["\\\n\r]/g, '')}")`;
            if (image.alt && target.hasAttribute('aria-label')) target.setAttribute('aria-label', image.alt);
            return;
          }
          const [type, ...pathParts] = key.split(':');
          if (type !== 'image' || !main || typeof image?.url !== 'string') return;
          let target = main;
          for (const index of pathParts.join(':').split('.').map(Number)) {
            target = target.childNodes[index];
            if (!target) return;
          }
          if (!(target instanceof HTMLImageElement) || target.closest('.impact-gallery, .photo-gallery-rows')) return;
          target.src = image.url;
          target.alt = typeof image.alt === 'string' ? image.alt : '';
        });
      }
      const addedSections = content.sections?.[pageId] || [];
      if (addedSections.length) {
        const sectionList = document.createElement('div');
        sectionList.className = 'site-added-content-list';
        if (content.sectionLayouts?.[pageId] === 'grid' && addedSections.length > 1) {
          sectionList.classList.add('is-grid');
        }
        addedSections.forEach((section) => {
          const wrapper = document.createElement('section');
          wrapper.className = 'site-added-content';
          wrapper.dataset.alignment = section.alignment || 'left';
          const inner = document.createElement('div');
          inner.className = 'site-added-content-inner';
          const eyebrow = document.createElement('p');
          eyebrow.className = 'eyebrow';
          eyebrow.textContent = 'MORE FROM ECOSYNIC';
          const heading = document.createElement('h2');
          heading.textContent = section.title;
          const body = document.createElement('p');
          body.className = 'site-added-content-copy';
          body.textContent = section.body;
          inner.append(eyebrow, heading, body);
          if (section.imageUrl) {
            const image = document.createElement('img');
            image.className = 'site-added-content-image';
            image.src = section.imageUrl;
            image.alt = section.imageAlt;
            image.loading = 'lazy';
            if (Number.isInteger(section.imageWidth) && section.imageWidth > 0) {
              image.style.width = `${section.imageWidth}px`;
            }
            if (Number.isInteger(section.imageHeight) && section.imageHeight > 0) {
              image.style.height = `${section.imageHeight}px`;
              image.style.maxHeight = 'none';
            }
            inner.append(image);
          }
          wrapper.append(inner);
          sectionList.append(wrapper);
        });
        main?.append(sectionList);
      }
      addLongTextToggles(main);
    } catch (error) {
      console.error('Could not load website content:', error.message || error);
      addLongTextToggles(main);
    }
  }

  loadContent();
})();
