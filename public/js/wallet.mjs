// public/js/wallet.mjs
export async function getWallet(){
  const r = await fetch('/wallet/api');
  return r.ok ? r.json() : null;
}

export async function topup(amount){
  const r = await fetch('/wallet/topup',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({amount})});
  return r.ok;
}
