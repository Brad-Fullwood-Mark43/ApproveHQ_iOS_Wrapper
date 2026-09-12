'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const loginView = $('loginView');
  const signupView = $('signupView');
  const mainView = $('mainView');
  const bottomNav = $('bottomNav');
  const showCreate = $('showCreateBusiness');
  const back = $('backToSignIn');
  const form = $('signupForm');
  const submit = $('createBusinessSubmit');
  const error = $('signupError');
  const status = $('signupStatus');

  if (!loginView || !signupView || !form) return;

  let logoPreviewUrl = null;

  function installLogoField() {
    if ($('signupLogo')) return;
    const businessTypeField = $('signupBusinessType')?.closest('.field');
    if (!businessTypeField) return;
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `
      <label for="signupLogo">Business logo <span class="meta">(optional)</span></label>
      <input id="signupLogo" type="file" accept="image/*">
      <div id="signupLogoPreviewWrap" class="hidden" style="margin-top:10px;text-align:center">
        <img id="signupLogoPreview" alt="Logo preview" style="max-width:160px;max-height:120px;border-radius:10px;object-fit:contain;background:#fff;padding:8px">
        <div><button id="clearSignupLogo" class="btn-inline" type="button" style="margin-top:6px">Remove logo</button></div>
      </div>
      <p class="meta" style="margin-top:6px">You can change this later in Settings.</p>`;
    businessTypeField.insertAdjacentElement('afterend', field);

    $('signupLogo').addEventListener('change', function () {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = null;
      const file = this.files?.[0];
      if (!file) {
        $('signupLogoPreviewWrap').classList.add('hidden');
        return;
      }
      logoPreviewUrl = URL.createObjectURL(file);
      $('signupLogoPreview').src = logoPreviewUrl;
      $('signupLogoPreviewWrap').classList.remove('hidden');
    });

    $('clearSignupLogo').addEventListener('click', () => {
      $('signupLogo').value = '';
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = null;
      $('signupLogoPreview').removeAttribute('src');
      $('signupLogoPreviewWrap').classList.add('hidden');
    });
  }

  function showError(message) {
    error.textContent = message || '';
    error.style.display = message ? 'block' : 'none';
  }

  function openSignup() {
    showError('');
    status.textContent = '';
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
    $('signupPhone').value = $('phone')?.value?.trim() || '';
    $('signupOwnerName').focus();
  }

  function closeSignup() {
    showError('');
    status.textContent = '';
    signupView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function securePlugin() {
    const cap = window.Capacitor;
    if (!cap) return null;
    for (let i = 0; i < 40; i += 1) {
      if (cap.Plugins?.SecureSession) return cap.Plugins.SecureSession;
      if (typeof cap.registerPlugin === 'function' && cap.isPluginAvailable?.('SecureSession')) {
        return cap.registerPlugin('SecureSession');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  }

  async function saveToken(token) {
    if (!token) return;
    try {
      const plugin = await securePlugin();
      if (plugin?.set) await plugin.set({ value: token });
    } catch (err) {
      console.error('Could not persist newly-created session', err);
    }
  }

  async function uploadSignupLogo(token) {
    const file = $('signupLogo')?.files?.[0];
    if (!file) return;
    status.textContent = 'Uploading your business logo…';
    const fd = new FormData();
    fd.append('logo', file);
    const response = await fetch(API_BASE + '/api/mobile/business/logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd,
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Business was created, but the logo could not be uploaded.');
  }

  async function enterBusiness(data) {
    mobileToken = data.token;
    await saveToken(mobileToken);

    let user = {
      ...(data.user || {}),
      businessId: data.businessId || data.user?.businessId,
      businessName: data.businessName || data.user?.businessName,
      businessType: data.businessType || data.user?.businessType || 'design_approval',
      role: 'owner',
      isMaster: false,
    };

    try {
      const me = await get('/api/mobile/auth/me');
      if (me.response.ok && me.data?.user) user = me.data.user;
    } catch (err) {
      console.warn('Business created, but owner profile refresh failed', err);
    }

    currentUser = user;
    $('businessName').textContent = user.businessName || data.businessName || 'ApproveHQ';
    $('paymentsTab').classList.remove('hidden');
    $('teamTab').classList.remove('hidden');
    loaded = { jobs: false, customers: false, payments: false, team: false };

    signupView.classList.add('hidden');
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    bottomNav.classList.remove('hidden');
    await selectTab('jobs', true);

    try {
      const cap = window.Capacitor;
      const plugin = cap?.Plugins?.SecureSession || (cap?.registerPlugin && cap?.isPluginAvailable?.('SecureSession') ? cap.registerPlugin('SecureSession') : null);
      if (plugin?.requestPushPermission && plugin?.getPushToken) {
        const permission = await plugin.requestPushPermission({});
        if (permission?.granted) {
          for (let i = 0; i < 40; i += 1) {
            const nativeToken = await plugin.getPushToken({});
            if (nativeToken?.deviceToken) {
              await post('/api/mobile/push/register', {
                deviceToken: nativeToken.deviceToken,
                environment: nativeToken.environment || 'production',
              });
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }
      }
    } catch (err) {
      console.warn('Business created; push registration will retry later', err);
    }
  }

  installLogoField();
  showCreate?.addEventListener('click', openSignup);
  back?.addEventListener('click', closeSignup);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showError('');
    status.textContent = '';

    const passphrase = $('signupPassphrase').value;
    const confirm = $('signupConfirm').value;
    if (passphrase !== confirm) {
      showError('The two passphrases do not match.');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Creating Business…';
    status.textContent = 'Setting up your business and owner account…';

    try {
      const result = await post('/api/mobile/auth/register-business', {
        ownerName: $('signupOwnerName').value.trim(),
        phone: $('signupPhone').value.trim(),
        businessName: $('signupBusinessName').value.trim(),
        businessType: $('signupBusinessType').value,
        passphrase,
        confirm,
        deviceName: 'ApproveHQ iOS',
      });

      if (!result.response.ok) throw new Error(result.data?.error || 'Could not create your business.');

      mobileToken = result.data.token;
      await saveToken(mobileToken);
      await uploadSignupLogo(mobileToken);
      status.textContent = 'Business created ✓ Opening your account…';
      await enterBusiness(result.data);
    } catch (err) {
      showError(err?.message || 'Could not create your business.');
      status.textContent = '';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create Business';
    }
  });

  if (!document.querySelector('script[data-approvehq-password-reset]')) {
    const script = document.createElement('script');
    script.src = 'forgot-password.js';
    script.dataset.approvehqPasswordReset = 'true';
    document.body.appendChild(script);
  }
})();
