'use strict';

(function () {
  const secure = () => window.Capacitor?.Plugins?.SecureSession || null;
  const loginForm = document.getElementById('loginForm');
  const signIn = document.getElementById('signIn');
  const loginView = document.getElementById('loginView');
  const mainView = document.getElementById('mainView');
  const bottomNav = document.getElementById('bottomNav');
  const businessName = document.getElementById('businessName');
  const paymentsTab = document.getElementById('paymentsTab');
  const teamTab = document.getElementById('teamTab');

  async function saveToken(token) {
    const plugin = secure();
    if (!plugin || !token) return;
    try { await plugin.set({ value: token }); } catch (err) { console.error('Could not persist secure session', err); }
  }

  async function clearToken() {
    const plugin = secure();
    if (!plugin) return;
    try { await plugin.remove({}); } catch (err) { console.error('Could not clear secure session', err); }
  }

  async function readToken() {
    const plugin = secure();
    if (!plugin) return null;
    try {
      const result = await plugin.get({});
      return result?.value || null;
    } catch (err) {
      console.error('Could not restore secure session', err);
      return null;
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

  // Give all API calls a consistent offline failure and automatically clear a
  // revoked/expired mobile session. Login 401s are excluded because they mean
  // bad credentials, not an expired existing session.
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

  // Open external HTTPS destinations such as Square checkout in Safari rather
  // than trapping them inside the Capacitor WKWebView.
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    let url;
    try { url = new URL(link.href); } catch { return; }
    if (url.protocol !== 'https:' || url.origin === API_BASE) return;
    const plugin = secure();
    if (!plugin?.openURL) return;
    event.preventDefault();
    try { await plugin.openURL({ url: url.toString() }); }
    catch (err) { showBanner(err?.message || 'Could not open the link.'); }
  });

  // Capture sign-in before the original handler. This lets us enter the app
  // shell immediately after auth, load Jobs separately, and refresh full user
  // permissions in parallel instead of making the user wait on every request.
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

      // The login response has enough data to enter the shell now. Owner/master
      // controls are finalized after /me returns.
      applyUser({
        ...(result.data.user || {}),
        role: 'member',
        isMaster: false
      });
      revealApp();
      selectTab('jobs', true).catch(err => showBanner(err?.message || 'Could not load jobs.'));

      const me = await get('/api/mobile/auth/me');
      if (me.response.ok && me.data.user) applyUser(me.data.user);
    } catch (err) {
      showLoginError(err?.message || 'Could not reach ApproveHQ.');
    } finally {
      signIn.disabled = false;
      signIn.textContent = 'Sign in';
    }
  }, true);

  // The regular sign-out flow revokes the token server-side; clear the Keychain
  // copy at the same time so the next launch cannot restore it.
  document.getElementById('signOut').addEventListener('click', () => {
    clearToken();
  });

  async function restore() {
    if (!navigator.onLine) {
      showBanner('You are offline. ApproveHQ will reconnect when service returns.');
    }
    const saved = await readToken();
    if (!saved) return;

    signIn.disabled = true;
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
      selectTab('jobs', true).catch(err => showBanner(err?.message || 'Could not load jobs.'));
    } catch (err) {
      // Keep the Keychain token on transient network failures. The user should
      // not be forced to re-enter credentials because Railway or the network is
      // temporarily unavailable.
      showBanner(err?.message || 'Could not restore your session yet.');
    } finally {
      signIn.disabled = false;
      signIn.textContent = 'Sign in';
    }
  }

  restore();
})();
