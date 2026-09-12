(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function ensureResetUi() {
    const loginForm = $('loginForm');
    if (!loginForm || $('forgotPassphraseBtn')) return;

    const signIn = $('signIn');
    const wrap = document.createElement('div');
    wrap.style.marginTop = '12px';
    wrap.innerHTML = '<button id="forgotPassphraseBtn" class="btn-inline" type="button" style="width:100%;text-align:center">Forgot passphrase?</button><div id="passwordResetStatus" class="form-status" style="text-align:center;margin-top:8px"></div>';
    signIn.insertAdjacentElement('afterend', wrap);

    $('forgotPassphraseBtn').addEventListener('click', requestReset);
  }

  async function requestReset() {
    const phone = String($('phone')?.value || '').trim();
    const status = $('passwordResetStatus');
    const button = $('forgotPassphraseBtn');

    if (!phone) {
      status.textContent = 'Enter your mobile phone number above first.';
      $('phone')?.focus();
      return;
    }

    button.disabled = true;
    status.textContent = 'Sending reset text…';
    try {
      const response = await fetch('https://www.4fenterprises.org/api/mobile/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not request a reset text.');
      status.textContent = data.message || 'If that number has an ApproveHQ account, a reset link will be sent by text.';
    } catch (err) {
      status.textContent = err.message || 'Could not request a reset text.';
    } finally {
      button.disabled = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureResetUi);
  else ensureResetUi();
})();
