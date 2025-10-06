// public/js/client-account.js
(function () {
  function showResult(elId, message, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
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

  // phone form
  const phoneForm = document.getElementById('phoneForm');
  if (phoneForm) {
    phoneForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = phoneForm.phone.value.trim();
      showResult('phone-form-result', 'Saving...', false);
      try {
        const resp = await postJson('/client/account/phone', { phone });
        showResult('phone-form-result', resp.message || 'Saved', false);
        // Optionally update current user display in header
        const headerPhoneEl = document.querySelector('.user-phone');
        if (headerPhoneEl) headerPhoneEl.textContent = resp.phone;
      } catch (err) {
        showResult('phone-form-result', err.error || 'Save failed', true);
      }
    });
  }

  // address form
  const addressForm = document.getElementById('addressForm');
  if (addressForm) {
    addressForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const address = addressForm.address.value.trim();
      showResult('address-form-result', 'Saving...', false);
      try {
        const resp = await postJson('/client/account/address', { address });
        showResult('address-form-result', resp.message || 'Saved', false);
      } catch (err) {
        showResult('address-form-result', err.error || 'Save failed', true);
      }
    });
  }

  // password form
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
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
        showResult('password-form-result', resp.message || 'Password updated', false);
        passwordForm.current_password.value = '';
        passwordForm.new_password.value = '';
        passwordForm.confirm_password.value = '';
      } catch (err) {
        showResult('password-form-result', err.error || 'Change failed', true);
      }
    });
  }
})();
