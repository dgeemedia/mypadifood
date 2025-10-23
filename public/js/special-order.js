// public/js/special-order.js
document.addEventListener('DOMContentLoaded', function () {
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

  if (!form) return;

  function populateSelects() {
    const selects = document.querySelectorAll('.food-select');
    selects.forEach((sel) => {
      // Protect: only append options if they aren't already present
      if (sel.dataset.populated === '1') return;
      FOOD_BUCKET.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.key;
        opt.textContent = f.label;
        sel.appendChild(opt);
      });
      sel.dataset.populated = '1';
    });
  }

  function toggleSlots() {
    const showSecond = planTypeEl && planTypeEl.value === 'double';
    document.querySelectorAll('.slot2').forEach((el) => {
      el.style.display = showSecond ? 'block' : 'none';
      el.setAttribute('aria-hidden', showSecond ? 'false' : 'true');
    });
  }

  function computeModWindow(weekOfStr) {
    if (!weekOfStr) return null;
    const weekDate = new Date(weekOfStr + 'T00:00:00');
    const prevFriday = new Date(weekDate);
    prevFriday.setDate(weekDate.getDate() - 3);
    prevFriday.setHours(0, 0, 0, 0);
    const prevSunday = new Date(prevFriday);
    prevSunday.setDate(prevFriday.getDate() + 2);
    prevSunday.setHours(23, 59, 59, 999);
    return { from: prevFriday, until: prevSunday };
  }

  function showModWindowInfo() {
    if (!weekOfEl || !modInfo) return;
    const win = computeModWindow(weekOfEl.value);
    if (!win) {
      modInfo.textContent = '';
      return;
    }
    modInfo.textContent = `Modifications allowed: ${win.from.toLocaleString()} — ${win.until.toLocaleString()} (Nigeria time)`;
  }

  function buildItemsPayload() {
    const orderedDays = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
    ];
    const items = [];
    // ensure push in weekday order
    orderedDays.forEach((day) => {
      const s1 = document.querySelector(
        `.food-select[data-day="${day}"][data-slot="1"]`
      );
      if (s1 && s1.value)
        items.push({
          day_of_week: day,
          slot: 1,
          food_key: s1.value,
          food_label: s1.options[s1.selectedIndex]?.text || s1.value,
        });
      const s2 = document.querySelector(
        `.food-select[data-day="${day}"][data-slot="2"]`
      );
      if (s2 && s2.value && planTypeEl && planTypeEl.value === 'double')
        items.push({
          day_of_week: day,
          slot: 2,
          food_key: s2.value,
          food_label: s2.options[s2.selectedIndex]?.text || s2.value,
        });
    });
    return items;
  }

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
        if (
          !confirm(
            `You have not chosen ${requiredSlots} meal(s) for ${d.charAt(0).toUpperCase() + d.slice(1)}. Continue anyway?`
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }

  if (planTypeEl) planTypeEl.addEventListener('change', toggleSlots);
  if (weekOfEl) weekOfEl.addEventListener('change', showModWindowInfo);

  form.addEventListener('submit', function (ev) {
    const items = buildItemsPayload();
    if (!validateBeforeSubmit(items)) {
      ev.preventDefault();
      return;
    }
    if (itemsField) itemsField.value = JSON.stringify(items);
    else form.dataset.items = JSON.stringify(items);
  });

  // init
  populateSelects();
  toggleSlots();
  showModWindowInfo();
});
