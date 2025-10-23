// public/js/review.js
// Handles inline review form on vendor page (#new-review-form) and reply forms.

document.addEventListener('DOMContentLoaded', () => {
  async function postJson(url, payload) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    });
    return resp;
  }

  // handle new review form
  const newForm = document.getElementById('new-review-form');
  if (newForm) {
    newForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const action = newForm.action;
      const formData = new FormData(newForm);
      const body = {};
      formData.forEach((v, k) => (body[k] = v));

      // add vendorId if not present and available in form.action (extract from URL)
      if (!body.vendorId) {
        const m = action.match(/\/vendor\/([0-9a-fA-F\-]{36})\/reviews/);
        if (m && m[1]) body.vendorId = m[1];
      }

      try {
        const resp = await postJson(action, body);
        if (resp.ok) {
          const j = await resp.json().catch(() => null);
          if (j && j.ok) return window.location.reload();
          return window.location.reload();
        } else {
          const txt = await resp.text().catch(() => null);
          alert('Could not post review. ' + (txt || ''));
        }
      } catch (e) {
        console.error(e);
        // fallback to default submit
        newForm.submit();
      }
    });
  }

  // handle any reply forms (client/admin)
  document
    .querySelectorAll('form.reply-form-client, form.reply-form-admin, form.reply-form')
    .forEach((form) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const action = form.action;
        const formData = new FormData(form);
        const body = {};
        formData.forEach((v, k) => (body[k] = v));

        // ensure vendorId for replies too (some reply forms include hidden vendorId)
        if (!body.vendorId && action) {
          const m = action.match(/\/vendor\/([0-9a-fA-F\-]{36})\//);
          if (m && m[1]) body.vendorId = m[1];
        }

        try {
          const resp = await postJson(action, body);
          if (resp.ok) {
            const j = await resp.json().catch(() => null);
            if (j && j.ok) return window.location.reload();
            return window.location.reload();
          } else {
            const txt = await resp.text().catch(() => null);
            alert('Could not post reply. ' + (txt || ''));
          }
        } catch (e) {
          console.error(e);
          form.submit();
        }
      });
    });
});
