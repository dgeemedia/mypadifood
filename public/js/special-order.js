// public/js/special-order.js
// Client-side behaviour for /client/special-order
// Place this file at public/js/special-order.js and include it in your layout (see layout patch below).

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

  const form = document.getElementById('weeklyPlanForm');
  const planTypeEl = document.getElementById('planType');
  const itemsField = document.getElementById('itemsField');
  const weekOfEl = document.getElementById('weekOf');
  const modInfo = document.getElementById('modifiableWindowInfo');

  // populate all select boxes
  function populateSelects() {
    const selects = document.querySelectorAll('.food-select');
    selects.forEach((sel) => {
      // leave default first option, then add bucket options
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
    const showSecond = planTypeEl.value === 'double';
    document.querySelectorAll('.slot2').forEach((el) => {
      el.style.display = showSecond ? 'block' : 'none';
    });
  }

  // compute modifiable window for a given weekOf date string (YYYY-MM-DD)
  // rule: allow client modifications Friday 00:00 -> Sunday 23:59 prior to the week (weekOf is Monday)
  function computeModWindow(weekOfStr) {
    if (!weekOfStr) return null;
    // create Date object in local timezone
    const weekDate = new Date(weekOfStr + 'T00:00:00'); // local midnight
    // previous Friday = Monday - 3 days
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
      if (s2 && s2.value && planTypeEl.value === 'double') {
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

  // prevent form submission if there are no meals selected
  function validateBeforeSubmit(items) {
    if (!items || !items.length) {
      alert('Please select at least one meal for the week before submitting.');
      return false;
    }
    // additional checks: ensure each day has required number of slots
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    for (const d of days) {
      const requiredSlots = planTypeEl.value === 'double' ? 2 : 1;
      const count = items.filter((i) => i.day_of_week === d).length;
      if (count < requiredSlots) {
        if (
          !confirm(
            `You have not chosen ${requiredSlots} meal(s) for ${d.charAt(0).toUpperCase() + d.slice(1)}. Continue anyway?`
          )
        )
          return false;
      }
    }
    return true;
  }

  // event handlers
  planTypeEl.addEventListener('change', toggleSlots);
  weekOfEl.addEventListener('change', showModWindowInfo);

  form.addEventListener('submit', function (ev) {
    // prepare items JSON
    const items = buildItemsPayload();
    if (!validateBeforeSubmit(items)) {
      ev.preventDefault();
      return;
    }
    itemsField.value = JSON.stringify(items);

    // client-side note: main enforcement for modification windows is server-side.
    // we do not block creating a weekly plan here.
  });

  // initialize
  populateSelects();
  toggleSlots();
  showModWindowInfo();
});
