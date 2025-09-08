// public/js/wa.js
// Robust WhatsApp opener: open app on mobile when possible, fallback to web api.
(function () {
  'use strict';

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent || '');
  }

  function openWhatsApp(number, message) {
    if (!number) return;
    const text = encodeURIComponent(message || '');
    const appUrl = `whatsapp://send?phone=${number}&text=${text}`;
    const apiUrl = `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
    const webUrl = `https://wa.me/${number}?text=${text}`; // final fallback

    // Try mobile app first on mobile devices, else open web fallback.
    if (isMobile()) {
      // Navigate to app URL — if app present, it will open.
      window.location.href = appUrl;
      // Fallback after short delay.
      setTimeout(function () {
        try {
          window.open(apiUrl, '_blank', 'noopener');
        } catch (e) {
          window.location.href = webUrl;
        }
      }, 700);
      return;
    }

    // Desktop: open api.whatsapp.com in new tab (less likely to be blocked).
    try {
      const w = window.open(apiUrl, '_blank', 'noopener');
      if (!w) {
        // popup blocked: navigate current tab instead
        window.location.href = webUrl;
      }
    } catch (err) {
      window.location.href = webUrl;
    }
  }

  function onClickHandler(e) {
    const btn = e.target.closest('.wa-btn');
    if (!btn) return;
    e.preventDefault();
    const number = btn.dataset.waNumber || '';
    const message = btn.dataset.waMessage || '';
    openWhatsApp(number, message);
  }

  document.addEventListener('click', onClickHandler);
})();
