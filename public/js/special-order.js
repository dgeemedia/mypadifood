// public/js/special-order.js
// Client-side behaviour for /client/special-order
// Defensive: checks elements exist before calling methods on them.

document.addEventListener('DOMContentLoaded', function () {
  // FOOD_BUCKET: key / label used by server and stored as food_key / food_label
  const FOOD_BUCKET = [
    { key: 'jollof', label: 'Jollof Rice' },
    { key: 'white_rice_stew', label: 'White Rice & Stew' },
    { key: 'fried_rice', label: 'Fried Rice' },
    { key: 'eba_egusi', label: 'Eba & Egusi' },
    { key: 'amala_ewedu', label: 'Amala & Ewedu' },
    { key: 'beans_ewa_riro', label: 'Beans (Ewa Riro)' },
    { key: 'akara', label: 'Akara' },
    { key: 'moi_moi', label: 'Moi Moi' },
    { key: 'pounded_yam_egusi', label: 'Pounded Yam & Egusi' },
    { key: 'ofada_ayamase', label: 'Ofada Rice & Ayamase' },
    { key: 'suya', label: 'Suya (Grilled)' },
    { key: 'fish_pepper_soup', label: 'Fish Pepper Soup' },
    { key: 'plantain_stew', label: 'Plantain & Stew' },
    { key: 'spaghetti_meat', label: 'Spaghetti & Meat Sauce' },
    { key: 'okro_fufu', label: 'Okro Soup & Fufu' },
    { key: 'salad', label: 'Vegetable Salad' },
    { key: 'grilled_chicken', label: 'Grilled Chicken' },
  ];

  // Required DOM IDs used by this script
  const form = document.getElementById('weeklyPlanForm');
  const planTypeEl = document.getElementById('planType');
  const itemsField = document.getElementById('itemsField');
  const weekOfEl = document.getElementById('weekOf');
  const modInfo = document.getElementById('modifiableWindowInfo');

  // If the whole form is missing, stop (this script may be included site-wide)
  if (!form) {
    console.debug('special-order: weeklyPlanForm not found — script will not run on this page.');
    return;
  }

  // warn if other important elements are missing, but continue where possible
  if (!planTypeEl) console.warn('special-order: planType element not found (id="planType")');
  if (!itemsField) console.warn('special-order: itemsField element not found (id="itemsField") — items will not be submitted');
  if (!weekOfEl) console.warn('special-order: weekOf element not found (id="weekOf")');
  if (!modInfo) console.warn('special-order: modifiableWindowInfo element not found (id="modifiableWindowInfo")');

  // populate all select boxes with FOOD_BUCKET options
  function populateSelects() {
    const selects = document.querySelectorAll('.food-select');
    selects.forEach((sel) => {
      // prevent duplicate population if script runs twice
      const already = Array.from(sel.options).some((o) => FOOD_BUCKET.some(f => f.label === o.textContent));
      if (already) return;
      FOOD_BUCKET.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.key;
        opt.textContent = f.label;
        sel.appendChild(opt);
      });
    });
  }

  // toggle second slot visibility based on plan type
  function toggleSlots() {
    const showSecond = planTypeEl && planTypeEl.value === 'double';
    document.querySelectorAll('.slot2').forEach((el) => {
      el.style.display = showSecond ? 'block' : 'none';
    });
  }

  // compute modifiable window for a given weekOf date string (YYYY-MM-DD)
  function computeModWindow(weekOfStr) {
    if (!weekOfStr) return null;
    const weekDate = new Date(weekOfStr + 'T00:00:00'); // local midnight
    const prevFriday = new Date(weekDate);
    prevFriday.setDate(weekDate.getDate() - 3);
    prevFriday.setHours(0, 0, 0, 0);
    const prevSunday = new Date(prevFriday);
    prevSunday.setDate(prevFriday.getDate() + 2);
    prevSunday.setHours(23, 59, 59, 999);
    return { from: prevFriday, until: prevSunday };
  }

  // show mod window info to user
  function showModWindowInfo() {
    if (!weekOfEl || !modInfo) return;
    const weekOf = weekOfEl.value;
    const win = computeModWindow(weekOf);
    if (!win) {
      modInfo.textContent = '';
      return;
    }
    modInfo.textContent = `Modifications for this week are allowed: ${win.from.toLocaleString()} — ${win.until.toLocaleString()} (Nigeria time)`;
  }

  // build items JSON before submit
  function buildItemsPayload() {
    const items = [];
    document.querySelectorAll('.day-block').forEach((block) => {
      const day = block.getAttribute('data-day');
      const s1 = block.querySelector('.food-select[data-slot="1"]');
      if (s1 && s1.value) {
        items.push({
          day_of_week: day,
          slot: 1,
          food_key: s1.value,
          food_label: s1.options[s1.selectedIndex]?.text || s1.value,
        });
      }
      const s2 = block.querySelector('.food-select[data-slot="2"]');
      if (s2 && s2.value && planTypeEl && planTypeEl.value === 'double') {
        items.push({
          day_of_week: day,
          slot: 2,
          food_key: s2.value,
          food_label: s2.options[s2.selectedIndex]?.text || s2.value,
        });
      }
    });
    return items;
  }

  // validate items
  function validateBeforeSubmit(items) {
    if (!items || !items.length) {
      alert('Please select at least one meal for the week before submitting.');
      return false;
    }
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    for (const d of days) {
      const requiredSlots = planTypeEl && planTypeEl.value === 'double' ? 2 : 1;
      const count = items.filter((i) => i.day_of_week === d).length;
      if (count < requiredSlots) {
        if (!confirm(`You have not chosen ${requiredSlots} meal(s) for ${d.charAt(0).toUpperCase() + d.slice(1)}. Continue anyway?`))
          return false;
      }
    }
    return true;
  }

  // Attach event listeners conditionally
  if (planTypeEl) {
    planTypeEl.addEventListener('change', toggleSlots);
  }

  if (weekOfEl) {
    weekOfEl.addEventListener('change', showModWindowInfo);
  }

  if (form) {
    form.addEventListener('submit', function (ev) {
      // prepare items JSON
      const items = buildItemsPayload();
      if (!validateBeforeSubmit(items)) {
        ev.preventDefault();
        return;
      }
      if (itemsField) {
        itemsField.value = JSON.stringify(items);
      } else {
        // fallback: store items in a hidden input if present, otherwise attach to form as data attribute
        form.dataset.items = JSON.stringify(items);
      }
    });
  }

  // initialize UI state
  populateSelects();
  toggleSlots();
  showModWindowInfo();
});
