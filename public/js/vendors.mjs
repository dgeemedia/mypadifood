export function populateLgas(stateObj, lgaSelect) {
  lgaSelect.innerHTML = '';
  stateObj.lgas.forEach(l => {
    const opt = document.createElement('option'); opt.value = l; opt.textContent = l;
    lgaSelect.appendChild(opt);
  });
}