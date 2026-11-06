(() => {
  const rows = document.querySelector('.photo-gallery-rows');
  const referenceTrack = rows?.querySelector('.photo-gallery-row:last-child .photo-gallery-track');
  const referenceSet = referenceTrack?.querySelector('.photo-gallery-set');

  function shuffle(images) {
    for (let index = images.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [images[index], images[randomIndex]] = [images[randomIndex], images[index]];
    }
    return images;
  }

  async function loadGallery() {
    if (!rows || !referenceTrack || !referenceSet) return;

    try {
      const response = await fetch('/api/gallery');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The gallery is unavailable.');
      if (!Array.isArray(result.images)) return;

      const originalSetWidth = referenceSet.getBoundingClientRect().width;
      const duration = getComputedStyle(referenceTrack).animationDuration;
      const durationValue = Number.parseFloat(duration);
      const durationSeconds = duration.endsWith('ms') ? durationValue / 1000 : durationValue;
      const images = shuffle(result.images.filter((image) =>
        image && typeof image.url === 'string' && typeof image.alt === 'string'));

      for (let index = 0; index < images.length; index += 4) {
        const row = document.createElement('div');
        row.className = 'photo-gallery-row';
        if (rows.children.length % 2 === 1) row.classList.add('photo-gallery-row-reverse');

        const track = document.createElement('div');
        track.className = 'photo-gallery-track';
        const gallerySet = document.createElement('div');
        gallerySet.className = 'photo-gallery-set';

        images.slice(index, index + 4).forEach((image) => {
          const figure = document.createElement('figure');
          const photo = document.createElement('img');
          photo.src = image.url;
          photo.alt = image.alt;
          photo.loading = 'lazy';
          figure.append(photo);
          gallerySet.append(figure);
        });

        const duplicateSet = gallerySet.cloneNode(true);
        duplicateSet.setAttribute('aria-hidden', 'true');
        duplicateSet.querySelectorAll('img').forEach((photo) => {
          photo.alt = '';
        });
        track.append(gallerySet, duplicateSet);
        row.append(track);
        rows.append(row);

        if (originalSetWidth > 0 && durationSeconds > 0
          && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const setWidth = gallerySet.getBoundingClientRect().width;
          track.style.animationDuration = `${durationSeconds * setWidth / originalSetWidth}s`;
        }
      }
    } catch (error) {
      console.error('Could not load gallery photos:', error.message || error);
    }
  }

  loadGallery();
})();
