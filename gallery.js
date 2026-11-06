(() => {
  const [gallerySet, duplicateSet] = document.querySelectorAll('.photo-gallery-track .photo-gallery-set');
  const track = gallerySet?.closest('.photo-gallery-track');

  async function loadGallery() {
    if (!gallerySet || !duplicateSet || !track) return;

    try {
      const response = await fetch('/api/gallery');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The gallery is unavailable.');
      if (!Array.isArray(result.images)) return;

      const originalSetWidth = gallerySet.getBoundingClientRect().width;
      const duration = getComputedStyle(track).animationDuration;
      const durationValue = Number.parseFloat(duration);
      const durationSeconds = duration.endsWith('ms') ? durationValue / 1000 : durationValue;
      let addedImages = 0;

      result.images.forEach((image) => {
        if (!image || typeof image.url !== 'string' || typeof image.alt !== 'string') return;
        const figure = document.createElement('figure');
        const photo = document.createElement('img');
        photo.src = image.url;
        photo.alt = image.alt;
        photo.loading = 'lazy';
        figure.append(photo);
        gallerySet.append(figure);
        duplicateSet.append(figure.cloneNode(true));
        addedImages += 1;
      });

      const updatedSetWidth = gallerySet.getBoundingClientRect().width;
      if (addedImages && originalSetWidth > 0 && durationSeconds > 0) {
        track.style.animationDuration = `${durationSeconds * updatedSetWidth / originalSetWidth}s`;
      }
    } catch (error) {
      console.error('Could not load gallery photos:', error.message || error);
    }
  }

  loadGallery();
})();
