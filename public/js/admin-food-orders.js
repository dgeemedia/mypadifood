// public/js/admin-food-orders.js
document.addEventListener('DOMContentLoaded', function () {
  // Confirm forms: accept / complete
  document.querySelectorAll('form[action$="/accept"]').forEach((form) => {
    form.addEventListener('submit', function (e) {
      const ok = confirm(
        'Accept this weekly plan and assign it to your account?'
      );
      if (!ok) e.preventDefault();
    });
  });

  document.querySelectorAll('form[action$="/complete"]').forEach((form) => {
    form.addEventListener('submit', function (e) {
      const ok = confirm(
        'Mark this weekly plan as completed? This action cannot be undone.'
      );
      if (!ok) e.preventDefault();
    });
  });

  // Auto-refresh for list pages
  const table = document.getElementById('weeklyPlansTable');
  if (table && table.dataset.autorefresh === 'true') {
    const interval = parseInt(table.dataset.interval) || 30000;
    setInterval(function () {
      fetch(window.location.href, { headers: { Accept: 'text/html' } })
        .then((res) => res.text())
        .then((html) => {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const newMain = tmp.querySelector('main');
          const oldMain = document.querySelector('main');
          if (newMain && oldMain) oldMain.innerHTML = newMain.innerHTML;
        })
        .catch((err) => console.warn('Auto-refresh failed', err));
    }, interval);
  }

  // Highlight online rows
  document.querySelectorAll('tr[data-online="1"]').forEach((tr) => {
    tr.style.outline = '2px solid #cfeffd';
  });

  // NOTE: weekly-plan socket listeners have been moved to public/js/chat.js
  // This file intentionally does NOT duplicate weekly_plan_message handlers.
});
