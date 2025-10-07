// public/js/rider-register.js
(function () {
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function normalize(el) { return el && el.value != null ? String(el.value).trim() : ''; }

  function updateVehicleNumberState() {
    const vehicleType = $('#vehicle_type');
    const vehicleNumber = $('#vehicle_number');
    const marker = document.getElementById('vehicle-number-required-marker');

    if (!vehicleType || !vehicleNumber) return;

    const vt = normalize(vehicleType).toLowerCase();
    if (vt === 'bicycle') {
      vehicleNumber.disabled = true;
      vehicleNumber.removeAttribute('required');
      // optionally add a muted class to the container if you use CSS for .muted
      const row = vehicleNumber.closest ? vehicleNumber.closest('.form-row') : null;
      if (row) row.classList.add('muted');
      if (marker) marker.style.visibility = 'hidden';
    } else {
      vehicleNumber.disabled = false;
      vehicleNumber.setAttribute('required', 'required');
      const row = vehicleNumber.closest ? vehicleNumber.closest('.form-row') : null;
      if (row) row.classList.remove('muted');
      if (marker) marker.style.visibility = 'visible';
    }
  }

  function init() {
    // Attach to vehicle type changes (handles initial pre-selected state too)
    const vehicleType = document.getElementById('vehicle_type');
    const vehicleNumber = document.getElementById('vehicle_number');

    if (!vehicleType || !vehicleNumber) return;

    vehicleType.addEventListener('change', updateVehicleNumberState);

    // run once to set initial state (server may have set locals)
    updateVehicleNumberState();

    // Accessibility: when vehicle number is disabled, also clear its value to avoid accidental submission
    // (Note: server-side validation should also enforce the rule)
    vehicleType.addEventListener('change', function () {
      if (vehicleNumber.disabled) {
        vehicleNumber.value = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
