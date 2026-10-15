const loginPanel = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#admin-logout');
const profileForm = document.querySelector('#profile-form');
const profileFormTitle = document.querySelector('#profile-form-title');
const profileError = document.querySelector('#profile-error');
const photoError = document.querySelector('#photo-error');
const dashboardError = document.querySelector('#dashboard-error');
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

let profiles = [];
let editingId = null;
let photo = null;
let previewUrl = '';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function showDashboard(storageReady) {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.classList.add('is-visible');
  storageNotice.hidden = storageReady;
  storageNotice.textContent = storageReady ? '' : 'Photo and profile changes need a Vercel Blob store. Create and connect one in your Vercel project Storage settings.';
  loadProfiles();
}

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
    logoutButton.classList.remove('is-visible');
    loginPanel.hidden = false;
    profiles = [];
    adminList.replaceChildren();
  }
});

document.querySelector('#new-profile').addEventListener('click', () => openForm());
document.querySelector('#cancel-profile').addEventListener('click', closeForm);

photoInput.addEventListener('change', async () => {
  photoError.textContent = '';
  photo = null;
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
    photoError.textContent = 'Choose a JPEG, PNG or WebP image under 4 MB.';
    photoInput.value = '';
    return;
  }
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  photoPreview.src = previewUrl;
  photoPreview.hidden = false;
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
    saveButton.disabled = false;
    saveButton.textContent = 'Save profile';
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  try {
    const route = editingId ? `/api/team?id=${encodeURIComponent(editingId)}` : '/api/team';
    const result = await api(route, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    profiles = result.profiles;
    renderProfiles();
    closeForm();
  } catch (error) {
    profileError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save profile';
  }
});

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
  photoPreview.hidden = !profile?.photoUrl;
  photoPreview.src = profile?.photoUrl || '';
  profileForm.hidden = false;
  profileName.focus();
}

function closeForm() {
  profileForm.hidden = true;
  profileForm.reset();
  editingId = null;
  photo = null;
  photoPreview.hidden = true;
  photoPreview.removeAttribute('src');
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
}

async function deleteProfile(profile) {
  if (!window.confirm(`Delete ${profile.name} from the team page?`)) return;
  dashboardError.textContent = '';
  try {
    const result = await api(`/api/team?id=${encodeURIComponent(profile.id)}`, { method: 'DELETE' });
    profiles = result.profiles;
    renderProfiles();
  } catch (error) {
    dashboardError.textContent = error.message;
  }
}

checkSession();