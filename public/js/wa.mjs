// public/js/wa.mjs
// ES module: WhatsApp opener (app on mobile, fallback to web).
export function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent || '');
}

export function openWhatsApp(number, message) {
  if (!number) return;
  const text = encodeURIComponent(message || '');
  const appUrl = `whatsapp://send?phone=${number}&text=${text}`;
  const apiUrl = `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
  const webUrl = `https://wa.me/${number}?text=${text}`;

  if (isMobile()) {
    // Try native app first on mobile
    window.location.href = appUrl;
    // fallback after a small delay
    setTimeout(() => {
      try {
        window.open(apiUrl, '_blank', 'noopener');
      } catch (err) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  // Desktop: open api.whatsapp.com in new tab (or fallback to wa.me)
  try {
    const w = window.open(apiUrl, '_blank', 'noopener');
    if (!w) window.location.href = webUrl;
  } catch (err) {
    window.location.href = webUrl;
  }
}

// Initialize delegated click handler for elements with class .wa-btn
// Optional: pass a config object with fallbackNumber if you want
export function initWhatsApp({ debug = false } = {}) {
  if (debug) console.log('[wa.mjs] initWhatsApp');

  function onClickHandler(e) {
    const btn = e.target.closest('.wa-btn');
    if (!btn) return;
    e.preventDefault();

    const number = btn.dataset.waNumber || '';
    // fallback to attribute or empty string
    const message = btn.dataset.waMessage || btn.getAttribute('data-wa-message') || '';

    if (debug) console.log('[wa.mjs] wa-btn clicked', { number, message });

    openWhatsApp(number, message);
  }

  // Use delegation so dynamically created cards work too.
  document.addEventListener('click', onClickHandler);
}
