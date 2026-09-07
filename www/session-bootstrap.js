'use strict';

(function () {
  let securePlugin = null;
  const secure = () => {
    if (securePlugin) return securePlugin;
    const cap = window.Capacitor;
    if (!cap) return null;
    if (cap.Plugins?.SecureSession) {
      securePlugin = cap.Plugins.SecureSession;
      return securePlugin;
    }
    if (typeof cap.registerPlugin === 'function' && cap.isPluginAvailable?.('SecureSession')) {
      securePlugin = cap.registerPlugin('SecureSession');
      return securePlugin;
    }
    return null;
  };
  const loginForm = document.getElementById('loginForm');
  const signIn = document.getElementById('signIn');
  const loginView = document.getElementById('loginView');
  const mainView = document.getElementById('mainView');
  const bottomNav = document.getElementById('bottomNav');
  const businessName = document.getElementById('businessName');
  const paymentsTab = document.getElementById('paymentsTab');
  const teamTab = document.getElementById('teamTab');

  async function waitForSecure() {
    for (let i = 0; i < 40; i += 1) {
      const plugin = secure();
      if (plugin) return plugin;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  }

  async function saveToken(token) {
    const plugin = await waitForSecure();
    if (!plugin || !token) return;
    try { await plugin.set({ value: token }); } catch (err) { console.error('Could not persist secure session', err); }
  }

  async function clearToken() {
    const plugin = await waitForSecure();
    if (!plugin) return;
    try { await plugin.remove({}); } catch (err) { console.error('Could not clear secure session', err); }
  }

  async function readToken() {
    const plugin = await waitForSecure();
    if (!plugin) return null;
    try {
      const result = await plugin.get({});
      return result?.value || null;
    } catch (err) {
      console.error('Could not restore secure session', err);
      return null;
    }
  }

  async function authenticateSavedSession() {
    const plugin = await waitForSecure();
    if (!plugin?.authenticate) return true;
    try {
      const result = await plugin.authenticate({ reason: 'Unlock ApproveHQ' });
      if (result?.available === false) return true;
      return result?.authenticated === true;
    } catch (err) {
      console.error('Biometric authentication failed', err);
      return false;
    }
  }

  function applyUser(user) {
    if (!user) return;
    currentUser = user;
    businessName.textContent = user.businessName || 'ApproveHQ';
    const owner = user.role === 'owner' || user.isMaster === true;
    paymentsTab.classList.toggle('hidden', !owner);
    teamTab.classList.toggle('hidden', !owner);
  }

  function revealApp() {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    bottomNav.classList.remove('hidden');
  }

  async function registerPush() {
    if (!mobileToken) return;
    const plugin = await waitForSecure();
    if (!plugin?.requestPushPermission || !plugin?.getPushToken) return;
    try {
      const permission = await plugin.requestPushPermission({});
      if (!permission?.granted) return;

      let nativeToken = null;
      for (let i = 0; i < 12; i += 1) {
        const result = await plugin.getPushToken({});
        if (result?.deviceToken) {
          nativeToken = result;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!nativeToken?.deviceToken) return;

      const response = await post('/api/mobile/push/register', {
        deviceToken: nativeToken.deviceToken,
        environment: nativeToken.environment || 'production'
      });
      if (!response.response.ok) {
        console.error('Could not register native push token', response.data?.error || response.response.status);
      }
    } catch (err) {
      console.error('Native push setup failed', err);
    }
  }

  async function unregisterPush() {
    if (!mobileToken) return;
    const plugin = await waitForSecure();
    if (!plugin?.getPushToken) return;
    try {
      const result = await plugin.getPushToken({});
      if (!result?.deviceToken) return;
      await req('/api/mobile/push/register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken: result.deviceToken })
      });
    } catch (err) {
      console.error('Could not unregister native push token', err);
    }
  }

  async function handlePushPath(path) {
    if (!path || !mobileToken || !currentUser || mainView.classList.contains('hidden')) return;
    const match = String(path).match(/^\/jobs\/(\d+)(?:\/?|$)/);
    if (match) {
      await openJob(Number(match[1]));
      return;
    }
    if (String(path).startsWith('/jobs')) await selectTab('jobs', true);
  }

  async function consumePendingPush() {
    const plugin = await waitForSecure();
    if (!plugin?.getPendingPushPath) return;
    try {
      const result = await plugin.getPendingPushPath({});
      if (result?.path) await handlePushPath(result.path);
    } catch (err) {
      console.error('Could not open push destination', err);
    }
  }

  async function afterAuthenticated() {
    registerPush();
    consumePendingPush();
  }

  async function expireSession(message) {
    mobileToken = null;
    currentUser = null;
    currentJobId = null;
    loaded = { jobs: false, customers: false, payments: false, team: false };
    await clearToken();
    mainView.classList.add('hidden');
    bottomNav.classList.add('hidden');
    loginView.classList.remove('hidden');
    if (message) showLoginError(message);
  }

  const baseFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    if (!navigator.onLine) throw new Error('You are offline. Reconnect and try again.');
    const response = await baseFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    if (response.status === 401 && url.includes('/api/mobile/') && !url.includes('/api/mobile/auth/login')) {
      setTimeout(() => expireSession('Your session expired. Please sign in again.'), 0);
    }
    return response;
  };

  window.addEventListener('offline', () => {
    showBanner('You are offline. Reconnect before saving changes.');
  });
  window.addEventListener('online', () => {
    showBanner('');
    if (!mainView.classList.contains('hidden') && currentJobId) loadJob(currentJobId);
  });
  window.addEventListener('focus', () => consumePendingPush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') consumePendingPush();
  });

  document.addEventListener('click', async event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    let url;
    try { url = new URL(link.href); } catch { return; }
    if (url.protocol !== 'https:' || url.origin === API_BASE) return;
    const plugin = await waitForSecure();
    if (!plugin?.openURL) return;
    event.preventDefault();
    try { await plugin.openURL({ url: url.toString() }); }
    catch (err) { showBanner(err?.message || 'Could not open the link.'); }
  });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    showLoginError('');
    showBanner('');
    signIn.disabled = true;
    signIn.textContent = 'Signing in…';

    try {
      const payload = {
        phone: document.getElementById('phone').value.trim(),
        passphrase: document.getElementById('passphrase').value,
        deviceName: 'ApproveHQ iOS'
      };
      const businessField = document.getElementById('businessField');
      if (!businessField.classList.contains('hidden')) {
        payload.businessId = Number(document.getElementById('business').value);
      }

      const result = await post('/api/mobile/auth/login', payload);
      if (!result.response.ok) {
        showLoginError(result.data.error || 'Unable to sign in.');
        return;
      }

      mobileToken = result.data.token;
      await saveToken(mobileToken);
      applyUser({ ...(result.data.user || {}), role: 'member', isMaster: false });
      revealApp();
      selectTab('jobs', true).catch(err => showBanner(err?.message || 'Could not load jobs.'));

      const me = await get('/api/mobile/auth/me');
      if (me.response.ok && me.data.user) applyUser(me.data.user);
      afterAuthenticated();
    } catch (err) {
      showLoginError(err?.message || 'Could not reach ApproveHQ.');
    } finally {
      signIn.disabled = false;
      signIn.textContent = 'Sign in';
    }
  }, true);

  document.getElementById('signOut').addEventListener('click', () => {
    unregisterPush();
    clearToken();
  });

  async function restore() {
    if (!navigator.onLine) {
      showBanner('You are offline. ApproveHQ will reconnect when service returns.');
    }
    const saved = await readToken();
    if (!saved) return;

    signIn.disabled = true;
    signIn.textContent = 'Unlocking…';

    const authenticated = await authenticateSavedSession();
    if (!authenticated) {
      mobileToken = null;
      showLoginError('Face ID was not completed. Sign in with your passphrase or reopen ApproveHQ to try again.');
      signIn.disabled = false;
      signIn.textContent = 'Sign in';
      return;
    }

    signIn.textContent = 'Restoring session…';
    mobileToken = saved;
    try {
      const me = await get('/api/mobile/auth/me');
      if (!me.response.ok || !me.data.user) {
        await expireSession();
        return;
      }
      applyUser(me.data.user);
      revealApp();
      await selectTab('jobs', true).catch(err => showBanner(err?.message || 'Could not load jobs.'));
      afterAuthenticated();
    } catch (err) {
      showBanner(err?.message || 'Could not restore your session yet.');
    } finally {
      signIn.disabled = false;
      signIn.textContent = 'Sign in';
    }
  }

  restore();
})();
