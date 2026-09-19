'use strict';

(function () {
  const deleteBtn = document.getElementById('deleteAccountBtn');
  const status = document.getElementById('deleteAccountStatus');
  if (!deleteBtn || !status) return;

  deleteBtn.addEventListener('click', async () => {
    if (!mobileToken) {
      status.textContent = 'Sign in again before deleting your account.';
      return;
    }

    const first = confirm(
      'Permanently delete your ApproveHQ account?\n\n' +
      'This deletes your login and associated account data. If you are the only user of a business, that business and its ApproveHQ data will also be permanently deleted. This cannot be undone.'
    );
    if (!first) return;

    const second = confirm(
      'This action cannot be undone.\n\nTap OK to permanently delete your account.'
    );
    if (!second) return;

    deleteBtn.disabled = true;
    status.textContent = 'Deleting account…';

    try {
      const response = await fetch(API_BASE + '/api/mobile/account', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + mobileToken },
      });

      let data = {};
      try { data = await response.json(); } catch {}

      if (!response.ok) {
        throw new Error(data.error || 'Could not delete your account.');
      }

      // The server deletion invalidates the current mobile session through the
      // users -> mobile_sessions cascade. Reuse the normal sign-out UI cleanup.
      document.getElementById('signOut')?.click();
      setTimeout(() => {
        showLoginError('Your ApproveHQ account has been permanently deleted.');
      }, 50);
    } catch (err) {
      status.textContent = err.message || 'Could not delete your account. Please try again.';
      deleteBtn.disabled = false;
    }
  });
})();
