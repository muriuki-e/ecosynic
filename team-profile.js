(() => {
  const status = document.querySelector('#team-profile-status');
  const profileElement = document.querySelector('#team-profile');
  const photo = document.querySelector('#team-profile-photo');
  const category = document.querySelector('#team-profile-category');
  const name = document.querySelector('#team-profile-name');
  const role = document.querySelector('#team-profile-role');
  const cvSections = document.querySelector('#team-profile-cv-sections');

  async function loadProfile() {
    const profileId = new URLSearchParams(window.location.search).get('id');
    if (!profileId) {
      status.textContent = 'This team profile could not be found.';
      return;
    }

    try {
      const response = await fetch('/api/team');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Team profiles are unavailable.');

      const profile = result.profiles.find((item) => item.id === profileId);
      if (!profile) {
        status.textContent = 'This team profile could not be found.';
        return;
      }

      photo.src = profile.photoUrl;
      photo.alt = `Portrait of ${profile.name}`;
      category.textContent = profile.category === 'board' ? 'Board of Directors' : 'Our Staff';
      name.textContent = profile.name;
      role.textContent = profile.role;
      document.title = `${profile.name} | Ecosynic Africa`;

      const sections = Array.isArray(profile.cvSections) ? profile.cvSections : [];
      if (sections.length) {
        sections.forEach((section) => {
          if (typeof section?.heading !== 'string' || typeof section?.content !== 'string') return;
          const sectionElement = document.createElement('section');
          sectionElement.className = 'team-profile-cv-section';
          const heading = document.createElement('h3');
          heading.textContent = section.heading;
          const content = document.createElement('p');
          content.textContent = section.content;
          sectionElement.append(heading, content);
          cvSections.append(sectionElement);
        });
      } else {
        const empty = document.createElement('p');
        empty.className = 'team-profile-empty';
        empty.textContent = 'Profile information will be added soon.';
        cvSections.append(empty);
      }

      profileElement.hidden = false;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message || 'Team profiles are temporarily unavailable.';
    }
  }

  loadProfile();
})();
