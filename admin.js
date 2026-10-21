const loginPanel = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#admin-logout');
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

let profiles = [];
let subscribers = [];
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
  storageNotice.textContent = storageReady ? '' : 'Team profiles, newsletter data and website content need a Vercel Blob store. Create and connect one in your Vercel project Storage settings.';
  const requestedSection = location.hash.slice(1);
  setAdminSection(['content-management', 'newsletter-management'].includes(requestedSection) ? requestedSection : 'team-management');
  loadProfiles();
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
    const caption = document.createElement('span');
    caption.textContent = `${field.label}: ${field.value}`.slice(0, 180);
    const value = drafts[field.key] ?? overrides[field.key] ?? field.value;
    const input = value.length > 120 || value.includes('\n')
      ? document.createElement('textarea')
      : document.createElement('input');
    if (input instanceof HTMLTextAreaElement) input.rows = Math.min(7, Math.max(2, Math.ceil(value.length / 90)));
    input.value = value;
    input.addEventListener('input', () => {
      contentDrafts[pageId] ||= {};
      contentDrafts[pageId][field.key] = input.value;
    });
    label.append(caption, input);
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
    subscribers = [];
    subscriberList.replaceChildren();
    subscriberCount.textContent = 'Sign in to load subscribers.';
    sendNewsletterButton.disabled = true;
  }
});

document.querySelector('#new-profile').addEventListener('click', () => openForm());
document.querySelector('#cancel-profile').addEventListener('click', closeForm);
document.querySelector('#refresh-subscribers').addEventListener('click', loadSubscribers);

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