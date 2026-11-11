(() => {
  if (location.pathname === '/admin' || location.pathname === '/admin.html'
    || location.pathname === '/availability' || location.pathname === '/availability.html') return;

  fetch('/api/site-status', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Could not load site status.');
      return response.json();
    })
    .then(({ mode }) => {
      if (mode === 'maintenance' || mode === 'offline') {
        location.replace(`/availability?mode=${encodeURIComponent(mode)}`);
      }
    })
    .catch((error) => {
      console.error('Could not check site availability:', error);
    });
})();
