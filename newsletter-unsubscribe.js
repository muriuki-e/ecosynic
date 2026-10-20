const unsubscribeButton = document.querySelector('#unsubscribe-confirm');
const unsubscribeMessage = document.querySelector('#unsubscribe-message');
const unsubscribeToken = new URLSearchParams(window.location.search).get('token');

unsubscribeButton.addEventListener('click', async () => {
  unsubscribeButton.disabled = true;
  unsubscribeMessage.textContent = 'Updating your subscription...';
  try {
    const response = await fetch(`/api/newsletter-unsubscribe?token=${encodeURIComponent(unsubscribeToken || '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oneClick: false }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update your subscription.');
    unsubscribeMessage.textContent = result.message;
    unsubscribeButton.hidden = true;
  } catch (error) {
    unsubscribeMessage.textContent = error.message || 'Could not update your subscription. Please try again later.';
    unsubscribeButton.disabled = false;
  }
});
