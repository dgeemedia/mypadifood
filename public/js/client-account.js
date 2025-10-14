//public/js/client-account.js
(function () {
  // showResult and postJson are kept but wrapped inside initAccountFormHandlers
  function showResult(elId, message, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
    // keep aria-live containers present for screen readers
    el.innerHTML = `<div class="${isError ? 'error' : 'success'}">${message}</div>`;
  }

  async function postJson(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    return json;
  }

  // Wrap all form bindings in an initializer so they can be re-run when panels are shown or HTML inserted
  function initAccountFormHandlers() {
    // phone form
    const phoneForm = document.getElementById('phoneForm');
    if (phoneForm && !phoneForm.__bound) {
      phoneForm.__bound = true;
      phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = phoneForm.phone.value.trim();
        showResult('phone-form-result', 'Saving...', false);
        try {
          const resp = await postJson('/client/account/phone', { phone });
          showResult('phone-form-result', resp.message || 'Saved', false);
          // Optionally update current user display in header
          const headerPhoneEl = document.querySelector('.user-phone');
          if (headerPhoneEl) headerPhoneEl.textContent = resp.phone || phone;
        } catch (err) {
          showResult(
            'phone-form-result',
            err && (err.error || err.message)
              ? err.error || err.message
              : 'Save failed',
            true
          );
        }
      });
    }

    // address form
    const addressForm = document.getElementById('addressForm');
    if (addressForm && !addressForm.__bound) {
      addressForm.__bound = true;
      addressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const address = addressForm.address.value.trim();
        // include state and lga if present
        const state = addressForm.state ? addressForm.state.value : null;
        const lga = addressForm.lga ? addressForm.lga.value : null;

        showResult('address-form-result', 'Saving...', false);
        try {
          const resp = await postJson('/client/account/address', {
            address,
            state,
            lga,
          });
          showResult('address-form-result', resp.message || 'Saved', false);
          // Optionally update header/address display elements
          const headerAddress = document.querySelector('.user-address');
          if (headerAddress && resp.address)
            headerAddress.textContent = resp.address;
        } catch (err) {
          showResult(
            'address-form-result',
            err && (err.error || err.message)
              ? err.error || err.message
              : 'Save failed',
            true
          );
        }
      });
    }

    // password form
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm && !passwordForm.__bound) {
      passwordForm.__bound = true;
      passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const current_password = passwordForm.current_password.value;
        const new_password = passwordForm.new_password.value;
        const confirm_password = passwordForm.confirm_password.value;
        showResult('password-form-result', 'Saving...', false);
        try {
          const resp = await postJson('/client/account/password', {
            current_password,
            new_password,
            confirm_password,
          });
          showResult(
            'password-form-result',
            resp.message || 'Password updated',
            false
          );
          passwordForm.current_password.value = '';
          passwordForm.new_password.value = '';
          passwordForm.confirm_password.value = '';
        } catch (err) {
          showResult(
            'password-form-result',
            err && (err.error || err.message)
              ? err.error || err.message
              : 'Change failed',
            true
          );
        }
      });
    }
  }

  // Expose initializer globally so other modules can call it after injecting HTML
  window.initAccountFormHandlers = initAccountFormHandlers;

  // Run on DOM ready (this will bind handlers for server-rendered forms)
  document.addEventListener('DOMContentLoaded', initAccountFormHandlers);
})();
