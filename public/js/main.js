// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
  // Focus the first interactive field (not hidden)
  (function () {
    const firstInput = document.querySelector(
      'input:not([type="hidden"]), textarea, select'
    );
    if (firstInput) {
      try {
        firstInput.focus();
      } catch (e) {
        /* ignore */
      }
    }
  })();

  // MOBILE DRAWER logic (unchanged)
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const closeBtn = drawer ? drawer.querySelector('#mobile-drawer-close') : null;
  if (drawer && !drawer.hasAttribute('aria-hidden'))
    drawer.setAttribute('aria-hidden', 'true');
  if (toggleBtn && !toggleBtn.hasAttribute('aria-expanded'))
    toggleBtn.setAttribute('aria-expanded', 'false');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    const firstLink = drawer.querySelector(
      'a, button, [tabindex]:not([tabindex="-1"])'
    );
    if (firstLink) firstLink.focus();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    if (toggleBtn) toggleBtn.focus();
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!drawer) return;
      const isOpen = drawer.classList.contains('open');
      if (isOpen) closeDrawer();
      else openDrawer();
    });
  }
  if (closeBtn)
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
    });
  document.addEventListener('click', (e) => {
    if (!drawer || !drawer.classList.contains('open')) return;
    if (
      !e.target.closest('.mobile-drawer') &&
      !e.target.closest('#mobile-menu-toggle')
    )
      closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open'))
      closeDrawer();
  });
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      closeDrawer();
    });
  }

  // Order update handler (btn-add-menu)
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest && ev.target.closest('.btn-add-menu');
    if (!btn) return;
    const orderId = btn.dataset.orderId;
    const menu = prompt('Enter your menu / order details:');
    if (!menu) return;
    try {
      const resp = await fetch(`/client/order/${orderId}/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_text: menu }),
      });
      if (resp.redirected) window.location = resp.url;
      else alert('Update sent.');
    } catch (e) {
      console.error('Failed to send menu update', e);
      alert('Failed to send update');
    }
  });

  // Location helpers wiring
  const vendorBtn = document.getElementById('vendor-use-location');
  if (vendorBtn)
    vendorBtn.addEventListener('click', (e) => fillLocation(e, 'vendor'));
  const clientBtn = document.getElementById('client-use-location');
  if (clientBtn)
    clientBtn.addEventListener('click', (e) => fillLocation(e, 'client'));

  // fillLocation implementation (unchanged)
  async function fillLocation(event, context) {
    const btn = event?.currentTarget || null;
    const originalText = btn ? btn.textContent : null;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Locating…';
      }
      if (!('geolocation' in navigator)) {
        alert(
          'Geolocation not supported by this browser. Please fill location manually.'
        );
        return;
      }
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const latitudeField = document.getElementById(`${context}-latitude`);
      const longitudeField = document.getElementById(`${context}-longitude`);
      const stateField = document.getElementById(`${context}-state`);
      const lgaField = document.getElementById(`${context}-lga`);
      const locSourceField = document.getElementById(
        `${context}-location-source`
      );
      const formEl = document.getElementById(`${context}-form`);
      if (latitudeField) latitudeField.value = lat;
      if (longitudeField) longitudeField.value = lon;
      if (locSourceField) locSourceField.value = 'device';
      if (formEl && !formEl.querySelector('input[name="location_source"]')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'location_source';
        hidden.value = 'device';
        formEl.appendChild(hidden);
      }
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
        const resp = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) throw new Error(`Reverse geocode HTTP ${resp.status}`);
        const data = await resp.json();
        const addr = data.address || {};
        const foundState = addr.state || addr.region || '';
        const foundLga =
          addr.county || addr.city_district || addr.town || addr.suburb || '';
        if (stateField && foundState) {
          if (stateField.tagName === 'SELECT') {
            const opt = Array.from(stateField.options).find(
              (o) =>
                o.value && o.value.toLowerCase() === foundState.toLowerCase()
            );
            if (opt) stateField.value = opt.value;
            else {
              const tmp = document.createElement('option');
              tmp.value = foundState;
              tmp.text = foundState;
              stateField.appendChild(tmp);
              stateField.value = foundState;
            }
          } else stateField.value = foundState;
        }
        if (lgaField && foundLga) {
          if (lgaField.tagName === 'SELECT') {
            const opt2 = Array.from(lgaField.options).find(
              (o) => o.value && o.value.toLowerCase() === foundLga.toLowerCase()
            );
            if (opt2) lgaField.value = opt2.value;
            else {
              const tmp2 = document.createElement('option');
              tmp2.value = foundLga;
              tmp2.text = foundLga;
              lgaField.appendChild(tmp2);
              lgaField.value = foundLga;
            }
          } else lgaField.value = foundLga;
        }
      } catch (revErr) {
        console.warn('Reverse geocode failed:', revErr);
      }
    } catch (err) {
      console.error('Geolocation error', err);
      alert(
        'Could not access your device location. Please enter state/LGA manually (permission denied or timeout).'
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText || 'Use my device location';
      }
    }
  }

  // Generic password toggle for buttons with class .pw-toggle
  document.addEventListener('click', function (ev) {
    const btn = ev.target.closest && ev.target.closest('.pw-toggle');
    if (!btn) return;
    ev.preventDefault();
    const row =
      btn.closest('label') || btn.closest('.form-row') || btn.closest('form');
    let pwd;
    if (row)
      pwd = row.querySelector(
        'input[type="password"], input[type="text"][name*="password"], input[type="password"][name*="password"]'
      );
    if (!pwd) return;
    const isPwd = pwd.getAttribute('type') === 'password';
    pwd.setAttribute('type', isPwd ? 'text' : 'password');
    btn.textContent = isPwd ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', isPwd ? 'true' : 'false');
    if (isPwd) pwd.focus();
  });

  // ONE-TIME dev verification modal: read link from #dev-verification data-link
  (function () {
    const devEl = document.getElementById('dev-verification');
    if (!devEl) return;
    const link = (devEl.getAttribute('data-link') || '').trim();
    if (!link) return;

    // create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'dev-verification-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const modal = document.createElement('div');
    modal.id = 'dev-verification-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.maxWidth = '520px';
    modal.style.width = '90%';
    modal.style.background = '#fff';
    modal.style.padding = '1.25rem';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    modal.style.fontFamily =
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

    modal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h2 style="margin:0 0 0.5rem 0; font-size:1.125rem;">Verification link (dev)</h2>
        <button id="dev-verification-close" aria-label="Close verification modal" style="background:none; border:0; font-size:1.25rem; line-height:1; cursor:pointer;">&times;</button>
      </div>
      <p style="margin:0 0 0.75rem 0;">Click the link below to verify this account. This modal is shown only when SHOW_DEV_VERIFICATION is enabled and will only appear once.</p>
      <p style="word-break:break-all; margin-bottom:1rem;">
        <a id="dev-verification-link" href="${link}" style="color:#0b61d6;">${link}</a>
      </p>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button id="dev-verification-copy" class="btn">Copy link</button>
        <button id="dev-verification-ok" class="btn-primary">OK</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const okBtn = document.getElementById('dev-verification-ok');
    if (okBtn) okBtn.focus();

    function dismiss() {
      if (overlay && overlay.parentNode)
        overlay.parentNode.removeChild(overlay);
      if (devEl) devEl.setAttribute('data-link', ''); // clear so client-side nav won't re-show
    }

    document
      .getElementById('dev-verification-close')
      .addEventListener('click', dismiss);
    document
      .getElementById('dev-verification-ok')
      .addEventListener('click', dismiss);
    document
      .getElementById('dev-verification-copy')
      .addEventListener('click', function () {
        const text = link;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            () => {
              this.textContent = 'Copied';
              setTimeout(() => (this.textContent = 'Copy link'), 1800);
            },
            () => alert('Could not copy to clipboard. Please copy manually.')
          );
        } else {
          const input = document.createElement('textarea');
          input.value = text;
          document.body.appendChild(input);
          input.select();
          try {
            document.execCommand('copy');
            this.textContent = 'Copied';
            setTimeout(() => (this.textContent = 'Copy link'), 1800);
          } catch (e) {
            alert('Could not copy to clipboard. Please copy manually.');
          } finally {
            document.body.removeChild(input);
          }
        }
      });

    function onKey(e) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKey, { once: true });
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) dismiss();
    });
  })();
}); // end DOMContentLoaded
