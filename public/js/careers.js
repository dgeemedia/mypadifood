// public/js/careers.js
// careers.js — modal with sticky actions, improved submit feedback + dynamic layout
document.addEventListener('DOMContentLoaded', () => {
  const applyButtons = document.querySelectorAll('.btn-apply');
  const modal = document.getElementById('applyModal');
  const form = document.getElementById('applyForm');
  const formRole = document.getElementById('formRole');
  const modalRole = document.getElementById('modalRole');
  const formMessage = document.getElementById('formMessage');

  if (!modal || !form) {
    console.warn('Careers modal or form not found.');
    return;
  }

  const backdrop = modal.querySelector('.modal-backdrop');
  const card = modal.querySelector('.modal-card');
  const submitBtn = form.querySelector('button[type="submit"]');
  const cancelBtn = form.querySelector('button[data-close]');

  // ensure modal is direct child of body
  function ensureModalInBody() {
    if (modal.parentElement && modal.parentElement.tagName.toLowerCase() !== 'body') {
      document.body.appendChild(modal);
    }
  }

  // ensure modal layout fits viewport: compute available height for modal-body
  function adjustModalLayout() {
    if (!card) return;
    // compute heights: viewport minus card margins and action bar
    const viewportH = window.innerHeight;
    const TOP_BOTTOM_GAP = 48; // spacing to keep between viewport edges
    const actionsEl = card.querySelector('.form-actions');
    const headerEl = card.querySelector('#modalRole');
    // measure heights (0 if missing)
    const actionsH = actionsEl ? actionsEl.getBoundingClientRect().height : 0;
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    // compute available height for modal-body
    const available = Math.max(200, viewportH - TOP_BOTTOM_GAP - actionsH - headerH - 40);
    const body = card.querySelector('.modal-body');
    if (body) {
      body.style.maxHeight = available + 'px';
      body.style.overflow = 'auto';
    }
    // ensure card doesn't exceed viewport
    card.style.maxHeight = (viewportH - 24) + 'px';
  }

  // replaced openModal to call adjustModalLayout
  function openModal(role) {
    ensureModalInBody();
    // show modal
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // set role title
    formRole.value = role || '';
    modalRole.textContent = `Apply — ${role || ''}`;

    // adjust layout and focus
    adjustModalLayout();
    setTimeout(() => {
      const first = form.querySelector('input[name="name"]');
      if (first) first.focus();
    }, 60);
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    formMessage.textContent = '';
    formMessage.className = 'muted';
    document.body.classList.remove('modal-open');

    // clear inline style
    if (card) {
      card.style.maxHeight = '';
      const body = card.querySelector('.modal-body');
      if (body) {
        body.style.maxHeight = '';
        body.style.overflow = '';
      }
    }

    // restore original modal-card markup if needed by reloading or by navigating back to page
    // (we intentionally replace innerHTML on success; full restore occurs on next open since form.reset() runs)
  }

  // wire-up open/close
  applyButtons.forEach(b => b.addEventListener('click', e => openModal(e.currentTarget.dataset.role)));
  modal.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', closeModal));
  modal.addEventListener('click', (ev) => { if (ev.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal(); });

  // cv method toggle
  function toggleCvMethod() {
    const methodEl = form.querySelector('input[name="cvmethod"]:checked');
    const method = methodEl ? methodEl.value : 'file';
    const fileEl = form.querySelector('.cv-file');
    const manualEl = form.querySelector('.cv-manual');
    if (fileEl && manualEl) {
      if (method === 'file') { fileEl.classList.remove('hidden'); manualEl.classList.add('hidden'); }
      else { fileEl.classList.add('hidden'); manualEl.classList.remove('hidden'); }
    }
    // recalc layout after switching CV mode (in case height changed)
    adjustModalLayout();
  }
  form.querySelectorAll('input[name="cvmethod"]').forEach(r => r.addEventListener('change', toggleCvMethod));
  toggleCvMethod();

  // helper to show messages
  function showMessage(text, type = 'muted') {
    formMessage.textContent = text;
    formMessage.className = type;
  }

  // submit handler (disable/enable submit, show friendly message)
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    // basic client-side required check
    const name = form.querySelector('input[name="name"]').value.trim();
    const email = form.querySelector('input[name="email"]').value.trim();
    const phone = form.querySelector('input[name="phone"]').value.trim();
    const role = (formRole && formRole.value) ? formRole.value : 'Applicant';

    if (!name || !email || !phone) {
      showMessage('Please complete Name, Email and Phone before submitting.', 'error');
      return;
    }

    const origText = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

    showMessage('Submitting your application...', 'muted');

    const data = new FormData(form);
    const file = data.get('cvfile');
    if (file && file.size && file.size > 5 * 1024 * 1024) {
      showMessage('CV file too large (max 5MB).', 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
      return;
    }

    try {
      const res = await fetch('/careers/apply', { method: 'POST', body: data });
      let json = null;
      try { json = await res.json(); } catch(e) { /* ignore */ }

      if (res.ok) {
        // --- UNIQUE SUCCESS SCREEN ---
        const ref = `MPF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*900 + 100)}`;

        const successHtml = `
          <div class="apply-success" role="status" style="padding:18px; text-align:left;">
            <h3 style="margin-top:0; color:var(--brand-2,#006241)">Application submitted 🎉</h3>
            <p>Thank you, ${name}. Your application for <strong>${role}</strong> has been received.</p>
            <p><strong>Reference:</strong> <code id="appRef">${ref}</code>
               <button id="copyRefBtn" class="btn" style="margin-left:8px; padding:6px 10px; font-size:0.9rem;">Copy</button>
            </p>
            <p>We'll review your submission and, if you match what we need, we'll contact you by email.</p>
            <div style="margin-top:12px; display:flex; gap:8px;">
              <button id="closeAfterSuccess" class="btn btn-gold">Close</button>
              <button id="returnJobs" class="btn">Back to jobs</button>
            </div>
          </div>
        `;

        // replace modal-card inner content (preserve close button)
        const oldClose = card.querySelector('.modal-close');
        // store reference to close button so we can reattach it
        const closeBtn = oldClose ? oldClose.cloneNode(true) : null;

        // wipe card
        card.innerHTML = '';

        // re-add close button at top (with its close behavior)
        if (closeBtn) {
          card.appendChild(closeBtn);
          closeBtn.addEventListener('click', closeModal);
        }

        // append success content
        const wrapper = document.createElement('div');
        wrapper.innerHTML = successHtml;
        card.appendChild(wrapper);

        // wire copy and buttons
        const copyBtn = document.getElementById('copyRefBtn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(ref).then(() => {
                copyBtn.textContent = 'Copied';
                setTimeout(() => copyBtn.textContent = 'Copy', 1800);
              }).catch(() => {
                copyBtn.textContent = 'Copy failed';
                setTimeout(() => copyBtn.textContent = 'Copy', 1800);
              });
            } else {
              // fallback
              const ta = document.createElement('textarea');
              ta.value = ref;
              document.body.appendChild(ta);
              ta.select();
              try { document.execCommand('copy'); copyBtn.textContent = 'Copied'; } catch (e) { copyBtn.textContent = 'Copy failed'; }
              ta.remove();
              setTimeout(() => copyBtn.textContent = 'Copy', 1800);
            }
          });
        }

        const closeAfterSuccess = document.getElementById('closeAfterSuccess');
        if (closeAfterSuccess) closeAfterSuccess.addEventListener('click', () => closeModal());

        const returnJobs = document.getElementById('returnJobs');
        if (returnJobs) returnJobs.addEventListener('click', () => {
          closeModal();
          const jobs = document.querySelector('.jobs-grid');
          if (jobs) jobs.scrollIntoView({ behavior: 'smooth' });
        });

        // optionally push analytics event
        try { if (window.dataLayer) window.dataLayer.push({event: 'careers_application', role, ref}); } catch (e) {}

        // done — keep submit button disabled briefly so user sees success
        setTimeout(() => {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
        }, 1800);

      } else {
        const errText = (json && (json.error || json.message)) ? (json.error || json.message) : 'Submission failed. Try again later.';
        showMessage(errText, 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
      }
    } catch (err) {
      console.error('Submit error:', err);
      showMessage('Network error. Please try again.', 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
    }
  });

  // recompute modal layout on resize
  window.addEventListener('resize', adjustModalLayout);

  // initial layout adjust in case modal is already present
  adjustModalLayout();
});
