export async function fetchVendors(){
  const r = await fetch('/vendors');
  return r.ok ? r.json() : [];
}

export async function getVendorsNearby(km=5){
  try{
    const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej));
    const lat = pos.coords.latitude; const lng = pos.coords.longitude;
    const r = await fetch(`/vendors?lat=${lat}&lng=${lng}&radius=${km}`);
    return r.ok ? r.json() : [];
  }catch(e){
    console.warn('geo failed', e.message);
    return fetchVendors();
  }
}
