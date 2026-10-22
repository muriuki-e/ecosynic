const loginPanel = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#admin-logout');
const themeToggle = document.querySelector('#admin-theme-toggle');
const sectionNav = document.querySelector('#admin-section-nav');
const contentPageSelect = document.querySelector('#content-page');
const contentSearch = document.querySelector('#content-search');
const contentFieldCount = document.querySelector('#content-field-count');
const contentEditorFields = document.querySelector('#content-editor-fields');
const contentAdminError = document.querySelector('#content-admin-error');
const saveSiteContentButton = document.querySelector('#save-site-content');
const addContentSectionButton = document.querySelector('#add-content-section');
const contentAddedList = document.querySelector('#content-added-list');
const profileForm = document.querySelector('#profile-form');
const profileFormTitle = document.querySelector('#profile-form-title');
const profileDialog = document.querySelector('#profile-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmTitle = document.querySelector('#confirm-title');
const confirmMessage = document.querySelector('#confirm-message');
const confirmActionButton = document.querySelector('#confirm-action');
const confirmCancelButton = document.querySelector('#confirm-cancel');
const closeProfileButton = document.querySelector('#close-profile');
const photoDropzone = document.querySelector('#photo-dropzone');
const profileError = document.querySelector('#profile-error');
const photoError = document.querySelector('#photo-error');
const dashboardError = document.querySelector('#dashboard-error');
const adminToast = document.querySelector('#admin-toast');
const photoInput = document.querySelector('#profile-photo');
const photoPreview = document.querySelector('#photo-preview');
const adminList = document.querySelector('#admin-list');
const profileCount = document.querySelector('#profile-count');
const storageNotice = document.querySelector('#storage-notice');
const profileName = document.querySelector('#profile-name');
const profileRole = document.querySelector('#profile-role');
const profilePhone = document.querySelector('#profile-phone');
const profileEmail = document.querySelector('#profile-email');
const saveButton = document.querySelector('#save-profile');
const subscriberCount = document.querySelector('#subscriber-count');
const subscriberList = document.querySelector('#subscriber-list');
const newsletterAdminError = document.querySelector('#newsletter-admin-error');
const newsletterCampaignForm = document.querySelector('#newsletter-campaign-form');
const newsletterCampaignStatus = document.querySelector('#newsletter-campaign-status');
const sendNewsletterButton = document.querySelector('#send-newsletter');
const galleryUploadForm = document.querySelector('#gallery-upload-form');
const galleryPhotoInput = document.querySelector('#gallery-photo');
const galleryPhotoDropzone = document.querySelector('#gallery-photo-dropzone');
const galleryPhotoTitle = document.querySelector('#gallery-photo-title');
const galleryAltInput = document.querySelector('#gallery-alt');
const galleryAdminError = document.querySelector('#gallery-admin-error');
const galleryAdminList = document.querySelector('#gallery-admin-list');
const addGalleryPhotoButton = document.querySelector('#add-gallery-photo');
const articleForm = document.querySelector('#article-form');
const articleTitleInput = document.querySelector('#article-title');
const articleTypeSelect = document.querySelector('#article-type');
const articleDateInput = document.querySelector('#article-date');
const articleStatusField = document.querySelector('#article-status-field');
const articleStatusSelect = document.querySelector('#article-status');
const articleImageInput = document.querySelector('#article-image');
const articleImageDropzone = document.querySelector('#article-image-dropzone');
const articleImageTitle = document.querySelector('#article-image-title');
const articleImagePreview = document.querySelector('#article-image-preview');
const articleImageAltInput = document.querySelector('#article-image-alt');
const articleVideoField = document.querySelector('#article-video-field');
const articleVideoUrlInput = document.querySelector('#article-video-url');
const articleRemoveImageField = document.querySelector('#article-remove-image-field');
const articleRemoveImageInput = document.querySelector('#article-remove-image');
const articleSummaryInput = document.querySelector('#article-summary');
const articleContentInput = document.querySelector('#article-content');
const articleAdminError = document.querySelector('#article-admin-error');
const articleListError = document.querySelector('#article-list-error');
const articleAdminList = document.querySelector('#article-admin-list');
const articleCount = document.querySelector('#article-count');
const saveArticleButton = document.querySelector('#save-article');
const cancelArticleEditButton = document.querySelector('#cancel-article-edit');

let profiles = [];
let subscribers = [];
let galleryImages = [];
let articles = [];
let editingArticleId = null;
let articleImage = null;
let articleImagePreviewUrl = '';
let editingId = null;
let photo = null;
let previewUrl = '';
let photoUploadPending = false;
let pendingAction = null;
let toastTimer = null;
let siteContent = { overrides: {}, sections: {} };
let contentFieldsByPage = {};
let contentDrafts = {};
let selectedContentPage = '';
let contentPageLoadSequence = 0;

function updateTheme(theme, savePreference = false) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  if (!savePreference) return;
  try {
    localStorage.setItem('ecosynic-theme', theme);
  } catch {
    // The current dashboard still changes theme when storage is unavailable.
  }
}

updateTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
  updateTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function showDashboard(storageReady) {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  sectionNav.hidden = false;
  logoutButton.classList.add('is-visible');
  storageNotice.hidden = storageReady;
  storageNotice.textContent = storageReady ? '' : 'Team profiles, gallery photos, newsletter data and website content need a Vercel Blob store. Create and connect one in your Vercel project Storage settings.';
  const requestedSection = location.hash.slice(1);
  setAdminSection(['gallery-management', 'articles-management', 'content-management', 'newsletter-management'].includes(requestedSection) ? requestedSection : 'team-management');
  loadProfiles();
  loadGallery();
  loadArticles();
  loadSubscribers();
  loadSiteContent();
}

function setAdminSection(sectionId) {
  const activeSection = document.querySelector(`#${sectionId}`);
  if (!activeSection) return;
  dashboard.querySelectorAll('.admin-panel').forEach((section) => {
    section.hidden = section !== activeSection;
  });
  sectionNav.querySelectorAll('a').forEach((link) => {
    if (link.dataset.adminSection === sectionId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

sectionNav.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-admin-section]');
  if (!link) return;
  event.preventDefault();
  setAdminSection(link.dataset.adminSection);
  history.replaceState(null, '', link.hash);
});

async function loadSiteContent() {
  contentAdminError.textContent = '';
  contentFieldCount.textContent = 'Loading website content...';
  try {
    siteContent = await api('/api/content');
    siteContent.overrides ||= {};
    siteContent.sections ||= {};
    contentPageSelect.replaceChildren();
    contentFieldsByPage = {};
    contentDrafts = {};
    window.EcosynicContent.pages.forEach((page) => {
      siteContent.overrides[page.id] ||= {};
      siteContent.sections[page.id] ||= [];
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = page.label;
      contentPageSelect.append(option);
    });
    selectedContentPage = contentPageSelect.value;
    await loadContentPage(selectedContentPage);
  } catch (error) {
    contentFieldCount.textContent = '';
    contentAdminError.textContent = error.message;
  }
}

async function loadContentPage(pageId) {
  const loadSequence = ++contentPageLoadSequence;
  contentAdminError.textContent = '';
  contentFieldCount.textContent = 'Loading page text...';
  const page = window.EcosynicContent.pages.find((entry) => entry.id === pageId);
  if (!page) return;
  try {
    const response = await fetch(`/${page.file}`);
    if (!response.ok) throw new Error(`Could not load ${page.label}.`);
    const documentCopy = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (loadSequence !== contentPageLoadSequence) return;
    const main = documentCopy.querySelector('main');
    if (!main) throw new Error(`${page.label} does not contain editable page content.`);
    contentFieldsByPage[pageId] = window.EcosynicContent.collectTextNodes(main).map(({ key, value, node }) => {
      const section = node.parentElement.closest('section');
      const heading = section?.querySelector('h1, h2, h3')?.cloneNode(true);
      heading?.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith(' '));
      const headingText = heading?.textContent.replace(/\s+/g, ' ').trim();
      return {
        key,
        value,
        label: `${node.parentElement.tagName.toLowerCase()}${headingText ? ` · ${headingText}` : ''}`,
      };
    });
    contentPageSelect.value = pageId;
    selectedContentPage = pageId;
    renderContentFields();
    renderAddedContentSections();
  } catch (error) {
    contentFieldCount.textContent = '';
    contentAdminError.textContent = error.message;
  }
}

function renderContentFields() {
  const pageId = selectedContentPage;
  const fields = contentFieldsByPage[pageId] || [];
  const query = contentSearch.value.trim().toLowerCase();
  const visible = fields.filter((field) => `${field.label} ${field.value}`.toLowerCase().includes(query));
  contentEditorFields.replaceChildren();
  contentFieldCount.textContent = `${visible.length} of ${fields.length} text fields`;
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = fields.length ? 'No text matches that search.' : 'No editable text was found on this page.';
    contentEditorFields.append(empty);
    return;
  }

  const overrides = siteContent.overrides[pageId] || {};
  const drafts = contentDrafts[pageId] || {};
  visible.forEach((field) => {
    const label = document.createElement('label');
    label.className = 'content-editor-field';
    const fieldHeader = document.createElement('span');
    fieldHeader.className = 'content-editor-field-header';
    const location = document.createElement('span');
    location.className = 'content-editor-field-location';
    const [elementName, sectionName] = field.label.split(' · ', 2);
    location.textContent = elementName;
    const context = document.createElement('span');
    context.className = 'content-editor-field-context';
    context.textContent = sectionName || 'Page text';
    fieldHeader.append(location, context);
    const preview = document.createElement('span');
    preview.className = 'content-editor-field-preview';
    preview.textContent = field.value.slice(0, 120);
    const value = drafts[field.key] ?? overrides[field.key] ?? field.value;
    const input = value.length > 120 || value.includes('\n')
      ? document.createElement('textarea')
      : document.createElement('input');
    input.setAttribute('aria-label', `Edit ${field.label}`);
    if (input instanceof HTMLTextAreaElement) input.rows = Math.min(7, Math.max(2, Math.ceil(value.length / 90)));
    input.value = value;
    input.addEventListener('input', () => {
      contentDrafts[pageId] ||= {};
      contentDrafts[pageId][field.key] = input.value;
    });
    label.append(fieldHeader, preview, input);
    contentEditorFields.append(label);
  });
}

function renderAddedContentSections() {
  const sections = siteContent.sections[selectedContentPage] || [];
  contentAddedList.replaceChildren();
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No additional sections on this page yet.';
    contentAddedList.append(empty);
    return;
  }

  sections.forEach((section, index) => {
    const card = document.createElement('article');
    card.className = 'content-added-card';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Section heading';
    const title = document.createElement('input');
    title.maxLength = 120;
    title.required = true;
    title.value = section.title;
    title.addEventListener('input', () => {
      section.title = title.value;
    });
    titleLabel.append(title);
    const bodyLabel = document.createElement('label');
    bodyLabel.textContent = 'Section text';
    const body = document.createElement('textarea');
    body.maxLength = 5000;
    body.rows = 4;
    body.required = true;
    body.value = section.body;
    body.addEventListener('input', () => {
      section.body = body.value;
    });
    bodyLabel.append(body);
    const actions = document.createElement('div');
    actions.className = 'content-added-actions';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'admin-button-secondary';
    up.textContent = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveContentSection(index, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'admin-button-secondary';
    down.textContent = 'Move down';
    down.disabled = index === sections.length - 1;
    down.addEventListener('click', () => moveContentSection(index, 1));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-button-secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      sections.splice(index, 1);
      renderAddedContentSections();
    });
    actions.append(up, down, remove);
    card.append(titleLabel, bodyLabel, actions);
    contentAddedList.append(card);
  });
}

function moveContentSection(index, direction) {
  const sections = siteContent.sections[selectedContentPage];
  const destination = index + direction;
  [sections[index], sections[destination]] = [sections[destination], sections[index]];
  renderAddedContentSections();
}

contentPageSelect.addEventListener('change', () => {
  loadContentPage(contentPageSelect.value);
});
contentSearch.addEventListener('input', renderContentFields);
addContentSectionButton.addEventListener('click', () => {
  const sections = siteContent.sections[selectedContentPage];
  if (sections.length >= 40) {
    contentAdminError.textContent = 'A page can contain up to 40 added sections.';
    return;
  }
  sections.push({ id: crypto.randomUUID(), title: '', body: '' });
  contentAdminError.textContent = '';
  renderAddedContentSections();
  contentAddedList.lastElementChild?.querySelector('input')?.focus();
});
saveSiteContentButton.addEventListener('click', async () => {
  contentAdminError.textContent = '';
  saveSiteContentButton.disabled = true;
  saveSiteContentButton.textContent = 'Saving...';
  try {
    Object.entries(contentFieldsByPage).forEach(([pageId, fields]) => {
      const overrides = siteContent.overrides[pageId];
      fields.forEach((field) => {
        const value = contentDrafts[pageId]?.[field.key];
        if (value === undefined) return;
        if (value === field.value) delete overrides[field.key];
        else overrides[field.key] = value;
      });
    });
    await api('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siteContent),
    });
    contentDrafts = {};
    showToast('Website content saved.');
  } catch (error) {
    contentAdminError.textContent = error.message;
  } finally {
    saveSiteContentButton.disabled = false;
    saveSiteContentButton.textContent = 'Save page changes';
  }
});

async function checkSession() {
  try {
    const state = await api('/api/admin');
    if (state.authenticated) showDashboard(state.storageReady);
  } catch {
    loginError.textContent = 'Could not reach the admin service. Refresh and try again.';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const state = await api('/api/admin?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: new FormData(loginForm).get('username'),
        password: new FormData(loginForm).get('password'),
      }),
    });
    loginForm.reset();
    showDashboard(state.storageReady);
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/admin?action=logout', { method: 'POST' });
  } finally {
    dashboard.hidden = true;
    sectionNav.hidden = true;
    logoutButton.classList.remove('is-visible');
    loginPanel.hidden = false;
    profiles = [];
    adminList.replaceChildren();
    galleryImages = [];
    galleryAdminList.replaceChildren();
    galleryUploadForm.reset();
    galleryAdminError.textContent = '';
    articles = [];
    articleAdminList.replaceChildren();
    articleCount.textContent = 'Sign in to manage articles and events.';
    resetArticleForm();
    subscribers = [];
    subscriberList.replaceChildren();
    subscriberCount.textContent = 'Sign in to load subscribers.';
    sendNewsletterButton.disabled = true;
  }
});

document.querySelector('#new-profile').addEventListener('click', () => openForm());
document.querySelector('#cancel-profile').addEventListener('click', closeForm);
document.querySelector('#refresh-subscribers').addEventListener('click', loadSubscribers);

galleryPhotoInput.addEventListener('change', () => {
  galleryPhotoTitle.textContent = galleryPhotoInput.files?.[0]?.name || 'Browse or drag an image here';
});

galleryPhotoDropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  galleryPhotoDropzone.classList.add('is-dragging');
});

galleryPhotoDropzone.addEventListener('dragleave', (event) => {
  if (!galleryPhotoDropzone.contains(event.relatedTarget)) {
    galleryPhotoDropzone.classList.remove('is-dragging');
  }
});

galleryPhotoDropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  galleryPhotoDropzone.classList.remove('is-dragging');
  const [file] = event.dataTransfer?.files || [];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  galleryPhotoInput.files = transfer.files;
  galleryPhotoTitle.textContent = file.name;
});

galleryUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  galleryAdminError.textContent = '';
  const file = galleryPhotoInput.files?.[0];
  if (!file) {
    galleryAdminError.textContent = 'Choose an image to add.';
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
    galleryAdminError.textContent = 'Choose a JPEG, PNG or WebP image under 4 MB.';
    return;
  }
  addGalleryPhotoButton.disabled = true;
  addGalleryPhotoButton.textContent = 'Uploading...';
  try {
    const result = await api('/api/gallery', {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Gallery-Alt': encodeURIComponent(galleryAltInput.value.trim()),
      },
      body: file,
    });
    galleryImages = result.images;
    renderGalleryImages();
    galleryUploadForm.reset();
    galleryPhotoTitle.textContent = 'Browse or drag an image here';
    showToast('Photo added to the gallery.');
  } catch (error) {
    galleryAdminError.textContent = error.message;
  } finally {
    addGalleryPhotoButton.disabled = false;
    addGalleryPhotoButton.innerHTML = 'Add to gallery <span aria-hidden="true">+</span>';
  }
});

async function loadGallery() {
  galleryAdminError.textContent = '';
  try {
    const result = await api('/api/gallery');
    galleryImages = result.images;
    renderGalleryImages();
  } catch (error) {
    galleryAdminError.textContent = error.message;
    galleryAdminList.replaceChildren();
  }
}

function renderGalleryImages() {
  galleryAdminList.replaceChildren();
  if (!galleryImages.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No photos have been added from the dashboard yet.';
    galleryAdminList.append(empty);
    return;
  }
  [...galleryImages].reverse().forEach((image) => {
    const row = document.createElement('article');
    row.className = 'admin-profile-row gallery-admin-row';
    const thumbnail = document.createElement('img');
    thumbnail.src = image.url;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    const description = document.createElement('div');
    description.className = 'admin-profile-details';
    const alt = document.createElement('p');
    alt.textContent = image.alt;
    const date = document.createElement('p');
    date.textContent = new Date(image.createdAt).toLocaleDateString();
    description.append(alt, date);
    const actions = document.createElement('div');
    actions.className = 'admin-profile-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete gallery photo: ${image.alt}`);
    remove.addEventListener('click', () => deleteGalleryImage(image));
    actions.append(remove);
    row.append(thumbnail, description, actions);
    galleryAdminList.append(row);
  });
}

function deleteGalleryImage(image) {
  requestConfirmation({
    title: 'Remove this gallery photo?',
    message: `Remove this photo from the public gallery?`,
    confirmLabel: 'Remove photo',
    danger: true,
    run: async () => {
      galleryAdminError.textContent = '';
      try {
        const result = await api(`/api/gallery?id=${encodeURIComponent(image.id)}`, { method: 'DELETE' });
        galleryImages = result.images;
        renderGalleryImages();
        showToast('Photo removed from the gallery.');
      } catch (error) {
        galleryAdminError.textContent = error.message;
      }
    },
  });
}

articleTypeSelect.addEventListener('change', updateArticleStatusField);
articleImageInput.addEventListener('change', () => selectArticleImage(articleImageInput.files?.[0]));
articleImageDropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  articleImageDropzone.classList.add('is-dragging');
});
articleImageDropzone.addEventListener('dragleave', (event) => {
  if (!articleImageDropzone.contains(event.relatedTarget)) {
    articleImageDropzone.classList.remove('is-dragging');
  }
});
articleImageDropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  articleImageDropzone.classList.remove('is-dragging');
  const [file] = event.dataTransfer?.files || [];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  articleImageInput.files = transfer.files;
  selectArticleImage(file);
});
articleRemoveImageInput.addEventListener('change', () => {
  if (articleRemoveImageInput.checked) {
    discardUploadedArticleImage(articleImage);
    articleImage = null;
    articleImageInput.value = '';
    articleImageAltInput.value = '';
    if (articleImagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(articleImagePreviewUrl);
    articleImagePreviewUrl = '';
    articleImagePreview.hidden = true;
    articleImageTitle.textContent = 'Current image will be removed';
  } else {
    const existing = articles.find((article) => article.id === editingArticleId);
    articleImagePreview.hidden = !existing?.imageUrl;
    articleImagePreview.src = existing?.imageUrl || '';
    articleImageTitle.textContent = existing?.imageUrl ? 'Current image attached' : 'Browse or drag an image here';
  }
});

function selectArticleImage(file) {
  articleAdminError.textContent = '';
  discardUploadedArticleImage(articleImage);
  articleImage = null;
  articleRemoveImageInput.checked = false;
  if (articleImagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(articleImagePreviewUrl);
  articleImagePreviewUrl = '';
  if (!file) {
    const existing = articles.find((article) => article.id === editingArticleId);
    articleImagePreview.hidden = !existing?.imageUrl || articleRemoveImageInput.checked;
    articleImagePreview.src = existing?.imageUrl || '';
    articleImageTitle.textContent = existing?.imageUrl ? 'Current image attached' : 'Browse or drag an image here';
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
    articleAdminError.textContent = 'Choose a JPEG, PNG or WebP image under 4 MB.';
    articleImageInput.value = '';
    articleImagePreview.hidden = true;
    articleImageTitle.textContent = 'Browse or drag an image here';
    return;
  }
  articleImagePreviewUrl = URL.createObjectURL(file);
  articleImagePreview.src = articleImagePreviewUrl;
  articleImagePreview.hidden = false;
  articleImageTitle.textContent = file.name;
}

function discardUploadedArticleImage(image) {
  if (!image?.path || articles.some((article) => article.imagePath === image.path)) return;
  api(`/api/articles?image=1&path=${encodeURIComponent(image.path)}`, { method: 'DELETE' })
    .catch((error) => {
      articleAdminError.textContent = `Could not remove an unused uploaded image: ${error.message}`;
    });
}

articleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  articleAdminError.textContent = '';
  const type = articleTypeSelect.value;
  const isEditing = Boolean(editingArticleId);
  const selectedImage = articleImageInput.files?.[0];
  if (selectedImage && (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedImage.type) || selectedImage.size > 4_000_000)) {
    articleAdminError.textContent = 'Choose a JPEG, PNG or WebP image under 4 MB.';
    return;
  }
  if (selectedImage && !articleImageAltInput.value.trim()) {
    articleAdminError.textContent = 'Add a description for the article image.';
    articleImageAltInput.focus();
    return;
  }
  saveArticleButton.disabled = true;
  saveArticleButton.textContent = isEditing ? 'Saving...' : 'Publishing...';
  try {
    if (selectedImage && !articleImage) {
      articleImage = await api('/api/articles?image=1', {
        method: 'POST',
        headers: { 'Content-Type': selectedImage.type },
        body: selectedImage,
      });
      articleImagePreview.src = articleImage.url;
      articleImagePreview.hidden = false;
      articleImageTitle.textContent = selectedImage.name;
    }
    const existingArticle = articles.find((article) => article.id === editingArticleId);
    const retainedImage = existingArticle && !articleRemoveImageInput.checked ? existingArticle : null;
    const image = articleImage || retainedImage;
    const payload = {
      title: articleTitleInput.value,
      type,
      date: articleDateInput.value,
      status: type === 'event' ? articleStatusSelect.value : 'published',
      summary: articleSummaryInput.value,
      content: articleContentInput.value,
      imageUrl: articleRemoveImageInput.checked ? '' : image?.url || '',
      imagePath: articleRemoveImageInput.checked ? '' : image?.path || '',
      imageAlt: articleRemoveImageInput.checked ? '' : articleImage ? articleImageAltInput.value.trim() : image?.imageAlt || '',
      videoUrl: type === 'event' ? articleVideoUrlInput.value.trim() : '',
    };
    const route = isEditing ? `/api/articles?id=${encodeURIComponent(editingArticleId)}` : '/api/articles';
    const result = await api(route, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    articles = result.articles;
    renderArticles();
    resetArticleForm();
    showToast(isEditing ? 'Article updated.' : 'Article published.');
  } catch (error) {
    articleAdminError.textContent = error.message;
  } finally {
    saveArticleButton.disabled = false;
    updateArticleStatusField();
  }
});

cancelArticleEditButton.addEventListener('click', resetArticleForm);

function updateArticleStatusField() {
  const isEvent = articleTypeSelect.value === 'event';
  articleStatusField.hidden = !isEvent;
  articleVideoField.hidden = !isEvent;
  if (!isEvent) articleVideoUrlInput.value = '';
  saveArticleButton.innerHTML = editingArticleId
    ? 'Save changes'
    : isEvent ? 'Publish event <span aria-hidden="true">↗</span>' : 'Publish news <span aria-hidden="true">↗</span>';
}

function resetArticleForm() {
  discardUploadedArticleImage(articleImage);
  articleForm.reset();
  editingArticleId = null;
  articleImage = null;
  if (articleImagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(articleImagePreviewUrl);
  articleImagePreviewUrl = '';
  articleImagePreview.hidden = true;
  articleImagePreview.removeAttribute('src');
  articleImageTitle.textContent = 'Browse or drag an image here';
  articleRemoveImageField.hidden = true;
  const today = new Date();
  articleDateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  articleTypeSelect.value = 'news';
  articleStatusSelect.value = 'upcoming';
  articleAdminError.textContent = '';
  cancelArticleEditButton.hidden = true;
  updateArticleStatusField();
}

function editArticle(article) {
  editingArticleId = article.id;
  articleTitleInput.value = article.title;
  articleTypeSelect.value = article.type;
  articleDateInput.value = article.date;
  articleStatusSelect.value = article.type === 'event' ? article.status : 'upcoming';
  articleSummaryInput.value = article.summary;
  articleContentInput.value = article.content;
  articleVideoUrlInput.value = article.videoUrl || '';
  articleImageAltInput.value = article.imageAlt || '';
  articleImageInput.value = '';
  articleRemoveImageInput.checked = false;
  articleRemoveImageField.hidden = !article.imageUrl;
  articleImagePreview.src = article.imageUrl || '';
  articleImagePreview.hidden = !article.imageUrl;
  articleImageTitle.textContent = article.imageUrl ? 'Current image attached' : 'Browse or drag an image here';
  articleImage = null;
  cancelArticleEditButton.hidden = false;
  articleAdminError.textContent = '';
  updateArticleStatusField();
  articleForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  articleTitleInput.focus({ preventScroll: true });
}

async function loadArticles() {
  articleListError.textContent = '';
  articleCount.textContent = 'Loading...';
  try {
    const result = await api('/api/articles');
    articles = result.articles;
    renderArticles();
  } catch (error) {
    articleCount.textContent = '—';
    articleListError.textContent = error.message;
    articleAdminList.replaceChildren();
  }
}

function renderArticles() {
  articleAdminList.replaceChildren();
  articleCount.textContent = `${articles.length} ${articles.length === 1 ? 'entry' : 'entries'}`;
  if (!articles.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No articles or events yet. Publish your first update above.';
    articleAdminList.append(empty);
    return;
  }

  [...articles].sort((first, second) => second.date.localeCompare(first.date)).forEach((article) => {
    const row = document.createElement('article');
    row.className = 'article-admin-row';
    const details = document.createElement('div');
    details.className = 'article-admin-details';
    const meta = document.createElement('p');
    meta.className = 'article-admin-meta';
    meta.textContent = `${article.type === 'event' ? (article.status === 'past' ? 'Past event' : 'Upcoming event') : 'Article / news'} · ${formatArticleDate(article.date)}`;
    const title = document.createElement('h3');
    title.textContent = article.title;
    const summary = document.createElement('p');
    summary.textContent = article.summary;
    details.append(meta, title, summary);
    const actions = document.createElement('div');
    actions.className = 'article-admin-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'admin-button-secondary';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editArticle(article));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-button-secondary';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${article.type === 'event' ? 'event' : 'article'}: ${article.title}`);
    remove.addEventListener('click', () => deleteArticle(article));
    actions.append(edit, remove);
    row.append(details, actions);
    articleAdminList.append(row);
  });
}

function formatArticleDate(date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

function deleteArticle(article) {
  requestConfirmation({
    title: 'Delete this entry?',
    message: `Delete “${article.title}” from Articles & news?`,
    confirmLabel: 'Delete entry',
    danger: true,
    run: async () => {
      articleListError.textContent = '';
      try {
        const result = await api(`/api/articles?id=${encodeURIComponent(article.id)}`, { method: 'DELETE' });
        articles = result.articles;
        renderArticles();
        if (editingArticleId === article.id) resetArticleForm();
        showToast('Entry deleted.');
      } catch (error) {
        articleListError.textContent = error.message;
      }
    },
  });
}

newsletterCampaignForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const campaign = Object.fromEntries(new FormData(newsletterCampaignForm));
  if (!subscribers.some((subscriber) => subscriber.status === 'active')) {
    newsletterCampaignStatus.textContent = 'There are no active subscribers to email.';
    return;
  }
  newsletterCampaignStatus.textContent = '';
  requestConfirmation({
    title: 'Send this newsletter?',
    message: `Send “${campaign.subject}” to all ${subscribers.filter((subscriber) => subscriber.status === 'active').length} active subscribers? Each person receives a separate email.`,
    confirmLabel: 'Send newsletter',
    run: () => sendNewsletter(campaign),
  });
});

async function loadSubscribers() {
  newsletterAdminError.textContent = '';
  subscriberCount.textContent = '...';
  sendNewsletterButton.disabled = true;
  try {
    const result = await api('/api/newsletter?action=admin');
    subscribers = result.subscribers;
    subscriberCount.textContent = String(result.activeCount);
    renderSubscribers();
    sendNewsletterButton.disabled = result.activeCount === 0;
  } catch (error) {
    subscriberCount.textContent = '—';
    newsletterAdminError.textContent = error.message;
    subscriberList.replaceChildren();
  }
}

function renderSubscribers() {
  subscriberList.replaceChildren();
  if (!subscribers.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No newsletter subscriptions yet.';
    subscriberList.append(empty);
    return;
  }
  subscribers.forEach((subscriber) => {
    const row = document.createElement('div');
    row.className = 'newsletter-subscriber-row';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = subscriber.name;
    const email = document.createElement('span');
    email.textContent = subscriber.email;
    details.append(name, email);
    const state = document.createElement('span');
    state.className = `newsletter-subscriber-state is-${subscriber.status}`;
    state.textContent = subscriber.status === 'active' ? 'Subscribed' : 'Unsubscribed';
    row.append(details, state);
    subscriberList.append(row);
  });
}

async function sendNewsletter(campaign) {
  sendNewsletterButton.disabled = true;
  newsletterCampaignStatus.textContent = 'Sending newsletter emails...';
  try {
    const result = await api('/api/newsletter?action=admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign),
    });
    newsletterCampaignStatus.textContent = result.message;
    showToast(result.message);
  } catch (error) {
    newsletterCampaignStatus.textContent = error.message;
  } finally {
    sendNewsletterButton.disabled = !subscribers.some((subscriber) => subscriber.status === 'active');
  }
}

async function uploadPhoto(file) {
  photoError.textContent = '';
  photo = null;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
    photoError.textContent = 'Choose a JPEG, PNG or WebP image under 4 MB.';
    photoInput.value = '';
    photoPreview.hidden = true;
    return;
  }
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  photoPreview.src = previewUrl;
  photoPreview.hidden = false;
  photoUploadPending = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Uploading photo...';
  try {
    photo = await api('/api/team-photo', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    photoPreview.src = photo.url;
  } catch (error) {
    photoError.textContent = error.message;
    photo = null;
    photoPreview.hidden = true;
  } finally {
    photoUploadPending = false;
    saveButton.disabled = false;
    saveButton.textContent = 'Save profile';
  }
}

photoInput.addEventListener('change', () => uploadPhoto(photoInput.files?.[0]));

photoDropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  photoDropzone.classList.add('is-dragging');
});

photoDropzone.addEventListener('dragleave', (event) => {
  if (event.target === photoDropzone) photoDropzone.classList.remove('is-dragging');
});

photoDropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  photoDropzone.classList.remove('is-dragging');
  uploadPhoto(event.dataTransfer?.files?.[0]);
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (photoUploadPending) {
    profileError.textContent = 'Wait for the photo upload to finish before saving.';
    return;
  }
  profileError.textContent = '';
  const existing = profiles.find((profile) => profile.id === editingId);
  const payload = {
    name: profileName.value,
    role: profileRole.value,
    phone: profilePhone.value,
    email: profileEmail.value,
    photoUrl: photo?.url || existing?.photoUrl || '',
    photoPath: photo?.path || existing?.photoPath || '',
  };
  const isEditing = Boolean(editingId);
  requestConfirmation({
    title: isEditing ? 'Save these changes?' : 'Add this team member?',
    message: isEditing
      ? `Update the team profile for ${payload.name}?`
      : `Add ${payload.name} to the team directory?`,
    confirmLabel: isEditing ? 'Save changes' : 'Add member',
    run: () => saveProfile(payload, isEditing),
  });
});

async function saveProfile(payload, isEditing) {
  saveButton.disabled = true;
  saveButton.textContent = isEditing ? 'Saving...' : 'Adding...';
  try {
    const route = editingId ? `/api/team?id=${encodeURIComponent(editingId)}` : '/api/team';
    const result = await api(route, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    profiles = result.profiles;
    renderProfiles();
    closeForm();
    showToast(isEditing ? 'Team member updated.' : 'Team member added.');
  } catch (error) {
    profileError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save profile';
  }
}

async function loadProfiles() {
  dashboardError.textContent = '';
  try {
    const result = await api('/api/team');
    profiles = result.profiles;
    renderProfiles();
  } catch (error) {
    dashboardError.textContent = error.message;
  }
}

function renderProfiles() {
  adminList.replaceChildren();
  profileCount.textContent = `${profiles.length} ${profiles.length === 1 ? 'profile' : 'profiles'}`;
  if (!profiles.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No team profiles yet.';
    adminList.append(empty);
    return;
  }
  profiles.forEach((profile) => {
    const row = document.createElement('article');
    row.className = 'admin-profile-row';
    const image = document.createElement('img');
    image.src = profile.photoUrl;
    image.alt = '';
    image.loading = 'lazy';
    const details = document.createElement('div');
    details.className = 'admin-profile-details';
    const name = document.createElement('h3');
    name.textContent = profile.name;
    const role = document.createElement('p');
    role.textContent = profile.role;
    const contact = document.createElement('p');
    contact.textContent = [profile.email, profile.phone].filter(Boolean).join(' · ');
    details.append(name, role, contact);
    const actions = document.createElement('div');
    actions.className = 'admin-profile-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openForm(profile));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${profile.name}`);
    remove.addEventListener('click', () => deleteProfile(profile));
    actions.append(edit, remove);
    row.append(image, details, actions);
    adminList.append(row);
  });
}

function openForm(profile = null) {
  editingId = profile?.id || null;
  photo = profile ? { url: profile.photoUrl, path: profile.photoPath } : null;
  profileFormTitle.textContent = profile ? 'Edit team member' : 'Add team member';
  profileName.value = profile?.name || '';
  profileRole.value = profile?.role || '';
  profilePhone.value = profile?.phone || '';
  profileEmail.value = profile?.email || '';
  profileError.textContent = '';
  photoError.textContent = '';
  photoInput.value = '';
  photoDropzone.classList.remove('is-dragging');
  photoPreview.hidden = !profile?.photoUrl;
  photoPreview.src = profile?.photoUrl || '';
  profileDialog.showModal();
  profileName.focus();
}

function closeForm() {
  if (profileDialog.open) profileDialog.close();
  resetProfileForm();
}

function resetProfileForm() {
  profileForm.reset();
  editingId = null;
  photo = null;
  photoUploadPending = false;
  photoDropzone.classList.remove('is-dragging');
  photoPreview.hidden = true;
  photoPreview.removeAttribute('src');
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
}

function requestConfirmation({ title, message, confirmLabel, danger = false, run }) {
  pendingAction = run;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmActionButton.textContent = confirmLabel;
  confirmActionButton.classList.toggle('is-danger', danger);
  confirmDialog.showModal();
  confirmCancelButton.focus();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  adminToast.textContent = message;
  adminToast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => adminToast.classList.remove('is-visible'), 3600);
}

confirmActionButton.addEventListener('click', async () => {
  const action = pendingAction;
  pendingAction = null;
  confirmDialog.close();
  if (action) await action();
});

confirmCancelButton.addEventListener('click', () => confirmDialog.close());
confirmDialog.addEventListener('close', () => {
  pendingAction = null;
  confirmActionButton.classList.remove('is-danger');
});
closeProfileButton.addEventListener('click', closeForm);
profileDialog.addEventListener('close', resetProfileForm);

async function deleteProfile(profile) {
  requestConfirmation({
    title: 'Remove this team member?',
    message: `Delete ${profile.name} from the team directory? This action cannot be undone.`,
    confirmLabel: 'Delete member',
    danger: true,
    run: async () => {
      dashboardError.textContent = '';
      try {
        const result = await api(`/api/team?id=${encodeURIComponent(profile.id)}`, { method: 'DELETE' });
        profiles = result.profiles;
        renderProfiles();
        showToast('Team member deleted.');
      } catch (error) {
        dashboardError.textContent = error.message;
      }
    },
  });
}

checkSession();