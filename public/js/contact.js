// public/js/contact.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const msgEl = document.getElementById('contactFormMessage');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  // minimal top-flash helper (copied from careers.js)
  function showTopFlash(text, type = 'success', opts = {}) {
    const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
    let top = document.querySelector('.top-flash-wrap');
    if (!top) {
      top = document.createElement('div');
      top.className = 'top-flash-wrap';
      document.body.appendChild(top);
    }
    const el = document.createElement('div');
    el.className = `top-flash flash-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const safeText = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.innerHTML = `<div class="top-flash-inner"><span class="top-flash-text">${safeText}</span><button class="top-flash-close" aria-label="Dismiss">&times;</button></div>`;
    const closeBtn = el.querySelector('.top-flash-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { el.classList.remove('show'); setTimeout(()=>el.remove(), 260); });
    top.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    if (duration > 0) setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),260); }, duration);
    return el;
  }

  function setMessage(text, type = 'muted') {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = type;
  }

  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setMessage('Sending...', 'muted');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

    const data = new FormData(form);
    try {
      const res = await fetch(form.action || '/contact', { method: 'POST', body: data });
      const json = await res.json().catch(()=>null);

      if (res.ok) {
        const ref = (json && json.reference) ? json.reference : (`MSG-${Date.now().toString().slice(-6)}`);
        showTopFlash(`Message sent — reference ${ref}`, 'success', { duration: 7000 });
        setMessage('Message sent. Thank you — we will contact you soon.', 'muted');
        form.reset();
      } else {
        const err = (json && (json.error || json.message)) ? (json.error || json.message) : 'Send failed. Try again later.';
        setMessage(err, 'error');
        showTopFlash(err, 'error', { duration: 6000 });
      }
    } catch (err) {
      console.error('Contact submit error', err);
      setMessage('Network error. Please try again.', 'error');
      showTopFlash('Network error. Please try again.', 'error', { duration: 6000 });
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send message'; }
    }
  });
});
