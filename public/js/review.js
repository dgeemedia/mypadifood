// public/js/review.js
document.addEventListener('DOMContentLoaded', () => {
  async function postJson(url, payload) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
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
      formData.forEach((v,k)=> body[k]=v);

      try {
        const resp = await postJson(action, body);
        if (resp.ok) {
          const j = await resp.json().catch(()=>null);
          if (j && j.ok) return window.location.reload();
          return window.location.reload();
        } else {
          const txt = await resp.text().catch(()=>null);
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
  document.querySelectorAll('form.reply-form-client, form.reply-form-admin, form.reply-form').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const action = form.action;
      const formData = new FormData(form);
      const body = {};
      formData.forEach((v,k)=> body[k]=v);

      try {
        const resp = await postJson(action, body);
        if (resp.ok) {
          const j = await resp.json().catch(()=>null);
          if (j && j.ok) return window.location.reload();
          return window.location.reload();
        } else {
          const txt = await resp.text().catch(()=>null);
          alert('Could not post reply. ' + (txt || ''));
        }
      } catch (e) {
        console.error(e);
        form.submit();
      }
    });
  });
});
