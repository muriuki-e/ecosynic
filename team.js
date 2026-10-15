const teamList = document.querySelector('#staff-list');
const teamCount = document.querySelector('#staff-count');
const teamStatus = document.querySelector('#staff-status');

async function loadTeam() {
  try {
    const response = await fetch('/api/team');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Team profiles are unavailable.');
    teamCount.textContent = `${result.profiles.length} ${result.profiles.length === 1 ? 'profile' : 'profiles'}`;
    teamList.replaceChildren();
    result.profiles.forEach((profile) => {
      const article = document.createElement('article');
      article.className = 'staff-member';
      const figure = document.createElement('figure');
      figure.className = 'staff-photo';
      const image = document.createElement('img');
      image.src = profile.photoUrl;
      image.alt = `Portrait of ${profile.name}`;
      image.loading = 'lazy';
      figure.append(image);
      const info = document.createElement('div');
      info.className = 'staff-member-info';
      const name = document.createElement('h3');
      name.textContent = profile.name;
      const role = document.createElement('p');
      role.textContent = profile.role;
      info.append(name, role);
      if (profile.phone) {
        const phone = document.createElement('a');
        phone.className = 'staff-contact';
        phone.href = `tel:${profile.phone.replace(/[^+\d]/g, '')}`;
        phone.textContent = `CALL ${profile.phone}`;
        phone.setAttribute('aria-label', `Call ${profile.name} at ${profile.phone}`);
        info.append(phone);
      }
      if (profile.email) {
        const email = document.createElement('a');
        email.className = 'staff-contact';
        email.href = `mailto:${profile.email}`;
        email.textContent = `EMAIL ${profile.email}`;
        email.setAttribute('aria-label', `Email ${profile.name} at ${profile.email}`);
        info.append(email);
      }
      article.append(figure, info);
      teamList.append(article);
    });
    teamStatus.textContent = result.profiles.length ? '' : 'Team profiles will be added soon.';
  } catch {
    teamCount.textContent = '';
    teamStatus.textContent = 'Team profiles are temporarily unavailable.';
  }
}

loadTeam();