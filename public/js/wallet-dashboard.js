// public/js/wallet-dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const fundForm = document.getElementById('wallet-fund-form');
  const fundBtn = document.getElementById('walletFundBtn') || document.querySelector('#wallet-fund-form button[type="submit"]');
  const fundMsg = document.getElementById('walletFundMsg') || (function(){ const d = document.createElement('div'); d.id='walletFundMsg'; d.style.display='none'; fundForm && fundForm.prepend(d); return d; })();
  const balanceEl = document.getElementById('wallet-balance');

  if (!fundForm) return;

  // Helper show message
  function showMsg(el, text, type = 'success') {
    el.className = 'wallet-message ' + (type === 'success' ? 'success' : 'error');
    el.textContent = text;
    el.style.display = 'block';
  }
  function hideMsg(el) { el.style.display = 'none'; el.textContent = ''; }

  async function initWalletFund(amount, provider) {
    const body = { amount: Number(amount), provider };
    const resp = await fetch('/client/wallet/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json && json.error ? json.error : 'Init failed');
    return json;
  }

  async function verifyPayment(provider, reference) {
    const resp = await fetch('/client/wallet/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ provider, reference })
    });
    const json = await resp.json();
    return { ok: resp.ok, body: json };
  }

  // Paystack inline launch
  function launchPaystackInline(initData) {
    // initData: { authorization_url, reference, amountKobo, email, paystackPublicKey }
    if (!window.PaystackPop || !window.PaystackPop.setup) {
      // fallback to popup redirect
      window.open(initData.authorization_url, '_blank');
      showMsg(fundMsg, 'Opened Paystack in new window', 'success');
      return;
    }

    const handler = window.PaystackPop.setup({
      key: initData.paystackPublicKey || initData.publicKey || '',
      email: initData.email || '',
      amount: initData.amountKobo || (Math.round(Number(initData.amount || 0) * 100)),
      ref: initData.reference || initData.tx_ref || (`ps_${Date.now()}`),
      onClose: function() { showMsg(fundMsg, 'Payment closed. No changes made.', 'error'); },
      callback: async function(response) {
        // response.reference
        try {
          const { ok, body } = await verifyPayment('paystack', response.reference);
          if (ok && body && body.success) {
            if (body.updatedBalance !== undefined && balanceEl) balanceEl.textContent = Number(body.updatedBalance).toFixed(2);
            showMsg(fundMsg, body.message || 'Wallet funded successfully', 'success');
          } else {
            showMsg(fundMsg, (body && (body.error || body.message)) || 'Could not verify payment', 'error');
          }
        } catch (err) {
          showMsg(fundMsg, err.message || 'Verify failed', 'error');
        }
      }
    });
    // handler opens checkout automatically
  }

  // Flutterwave inline launch
  function launchFlutterwaveInline(initData) {
    // initData: { payment_link, tx_ref, publicKey, amount, currency }
    if (!window.FlutterwaveCheckout) {
      // fallback to opening payment_link
      if (initData.payment_link) {
        window.open(initData.payment_link, '_blank');
        showMsg(fundMsg, 'Opened Flutterwave in new window', 'success');
        return;
      }
      showMsg(fundMsg, 'Flutterwave checkout not available', 'error');
      return;
    }

    const config = {
      public_key: initData.publicKey || initData.public_key || initData.publicKey,
      tx_ref: initData.tx_ref,
      amount: initData.amount || initData.amountKobo || '',
      currency: initData.currency || 'NGN',
      customer: { email: initData.customerEmail || initData.email || '' },
      callback: async function (data) {
        // data.transaction_id or data.tx_ref
        const reference = data.transaction_id || data.tx_ref;
        try {
          const { ok, body } = await verifyPayment('flutterwave', reference);
          if (ok && body && body.success) {
            if (body.updatedBalance !== undefined && balanceEl) balanceEl.textContent = Number(body.updatedBalance).toFixed(2);
            showMsg(fundMsg, body.message || 'Wallet funded successfully', 'success');
          } else {
            showMsg(fundMsg, (body && (body.error || body.message)) || 'Could not verify payment', 'error');
          }
        } catch (err) {
          showMsg(fundMsg, err.message || 'Verify failed', 'error');
        }
      },
      onclose: function() { showMsg(fundMsg, 'Payment closed. No changes made.', 'error'); },
      customizations: { title: 'MyPadiFood Wallet Top-up' }
    };
    window.FlutterwaveCheckout(config);
  }

  // form submit handler
  fundForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    hideMsg(fundMsg);
    const formData = new FormData(fundForm);
    const amount = formData.get('amount');
    const provider = formData.get('provider') || 'paystack';

    if (!amount || Number(amount) < 50) { showMsg(fundMsg, 'Enter an amount (minimum ₦50)', 'error'); return; }

    if (fundBtn) {
      fundBtn.disabled = true;
      fundBtn.textContent = 'Initializing...';
    }

    try {
      const init = await initWalletFund(amount, provider);
      if (!init || !init.provider) throw new Error('Invalid init response');

      if (init.provider === 'paystack') {
        // init: { authorization_url, reference, amountKobo, email, paystackPublicKey }
        launchPaystackInline({
          authorization_url: init.authorization_url,
          reference: init.reference,
          amountKobo: init.amountKobo,
          email: init.email,
          paystackPublicKey: init.paystackPublicKey
        });
      } else if (init.provider === 'flutterwave') {
        // init: { payment_link, tx_ref, amount, currency, publicKey }
        launchFlutterwaveInline({
          payment_link: init.payment_link,
          tx_ref: init.tx_ref,
          amount: init.amount,
          currency: init.currency,
          publicKey: init.publicKey,
          customerEmail: init.customerEmail || init.email
        });
      } else {
        showMsg(fundMsg, 'Unknown provider response', 'error');
      }
    } catch (err) {
      showMsg(fundMsg, err.message || 'Could not initialize payment', 'error');
    } finally {
      if (fundBtn) {
        fundBtn.disabled = false;
        fundBtn.textContent = 'Fund wallet';
      }
    }
  });
});
