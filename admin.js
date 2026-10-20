const loginPanel = document.querySelector('#admin-login');
const dashboard = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#admin-logout');
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

let profiles = [];
let editingId = null;
let photo = null;
let previewUrl = '';
let photoUploadPending = false;
let pendingAction = null;
let toastTimer = null;

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