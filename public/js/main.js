import { getVendorsNearby, fetchVendors } from './vendors.mjs';

const vendorsList = document.getElementById('vendorsList');
const btnFind = document.getElementById('btn-find-near');
const filter = document.getElementById('filterStatus');

async function render(vendors){
  if(!vendorsList) return;
  vendorsList.innerHTML = vendors.map(v=> `<div class="card"><h3>${v.name} <span class="badge">${v.status}</span></h3><p>${v.address || ''}</p><p>${v.food_item || ''} — ₦${v.price_min || ''}</p><a href="/vendors/${v.id}">View</a></div>`).join('\n');
}

async function loadAll(){
  const v = await fetchVendors();
  render(v);
}

if(btnFind){
  btnFind.addEventListener('click', async ()=>{
    const v = await getVendorsNearby(5);
    render(v);
  });
}

if(filter){
  filter.addEventListener('change', async ()=>{
    const all = await fetchVendors();
    const val = filter.value;
    const filtered = all.filter(x => val==='all' ? true : x.status===val);
    render(filtered);
  });
}

loadAll();
