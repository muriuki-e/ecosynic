(() => {
  const [gallerySet, duplicateSet] = document.querySelectorAll('.photo-gallery-track .photo-gallery-set');

  async function loadGallery() {
    if (!gallerySet || !duplicateSet) return;

    try {
      const response = await fetch('/api/gallery');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The gallery is unavailable.');
      if (!Array.isArray(result.images)) return;

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
      });
    } catch (error) {
      console.error('Could not load gallery photos:', error.message || error);
    }
  }

  loadGallery();
})();
