(() => {
  const section = document.querySelector('#gallery-uploaded');
  const grid = document.querySelector('#gallery-uploaded-grid');

  async function loadGallery() {
    try {
      const response = await fetch('/api/gallery');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The gallery is unavailable.');
      if (!Array.isArray(result.images) || !result.images.length) return;

      result.images.forEach((image) => {
        if (!image || typeof image.url !== 'string' || typeof image.alt !== 'string') return;
        const figure = document.createElement('figure');
        const photo = document.createElement('img');
        photo.src = image.url;
        photo.alt = image.alt;
        photo.loading = 'lazy';
        figure.append(photo);
        grid.append(figure);
      });
      section.hidden = grid.childElementCount === 0;
    } catch (error) {
      console.error('Could not load gallery photos:', error.message || error);
    }
  }

  loadGallery();
})();
