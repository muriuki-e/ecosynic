const boardGroup = document.querySelector('#board-group');
const boardList = document.querySelector('#board-list');
const staffGroup = document.querySelector('#staff-group');
const staffList = document.querySelector('#staff-list');
const teamCount = document.querySelector('#staff-count');
const teamStatus = document.querySelector('#staff-status');
const photoDialog = document.querySelector('#team-photo-dialog');
const photoDialogImage = document.querySelector('#team-photo-dialog-image');

function createTeamCard(profile) {
  const article = document.createElement('article');
  article.className = 'staff-member';
  const figure = document.createElement('figure');
  figure.className = 'staff-photo';
  const previewButton = document.createElement('button');
  previewButton.className = 'staff-photo-preview';
  previewButton.type = 'button';
  previewButton.setAttribute('aria-label', `View full-size photo of ${profile.name}`);
  const backdrop = document.createElement('img');
  backdrop.className = 'staff-photo-backdrop';
  backdrop.src = profile.photoUrl;
  backdrop.alt = '';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.loading = 'lazy';
  const image = document.createElement('img');
  image.className = 'staff-photo-image';
  image.src = profile.photoUrl;
  image.alt = `Portrait of ${profile.name}`;
  image.loading = 'lazy';
  previewButton.append(backdrop, image);
  figure.append(previewButton);
  const info = document.createElement('div');
  info.className = 'staff-member-info';
  const name = document.createElement('h4');
  name.textContent = profile.name;
  const role = document.createElement('p');
  role.textContent = profile.role;
  const detailsLink = document.createElement('a');
  detailsLink.className = 'staff-profile-link';
  detailsLink.href = `/team-profile?id=${encodeURIComponent(profile.id)}`;
  detailsLink.textContent = 'View profile';
  info.append(name, role, detailsLink);
  article.append(figure, info);
  return article;
}

function openPhotoPreview(event) {
  const button = event.target.closest('.staff-photo-preview');
  if (!button) return;

  const image = button.querySelector('.staff-photo-image');
  photoDialogImage.src = image.src;
  photoDialogImage.alt = image.alt;
  photoDialog.showModal();
}

document.querySelector('#board-list').addEventListener('click', openPhotoPreview);
document.querySelector('#staff-list').addEventListener('click', openPhotoPreview);
document.querySelector('#close-team-photo-dialog').addEventListener('click', () => photoDialog.close());
photoDialog.addEventListener('click', (event) => {
  if (event.target === photoDialog) photoDialog.close();
});

async function loadTeam() {
  try {
    const response = await fetch('/api/team');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Team profiles are unavailable.');
    teamCount.textContent = `${result.profiles.length} ${result.profiles.length === 1 ? 'profile' : 'profiles'}`;
    const boardProfiles = result.profiles.filter((profile) => profile.category === 'board');
    const staffProfiles = result.profiles.filter((profile) => profile.category !== 'board');
    boardList.replaceChildren(...boardProfiles.map(createTeamCard));
    staffList.replaceChildren(...staffProfiles.map(createTeamCard));
    boardGroup.hidden = boardProfiles.length === 0;
    staffGroup.hidden = staffProfiles.length === 0;
    teamStatus.textContent = result.profiles.length ? '' : 'Team profiles will be added soon.';
  } catch {
    teamCount.textContent = '';
    teamStatus.textContent = 'Team profiles are temporarily unavailable.';
  }
}

loadTeam();