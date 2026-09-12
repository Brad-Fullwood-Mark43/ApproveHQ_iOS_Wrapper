'use strict';
// app.js intentionally keeps currentUser as a global lexical binding rather than
// a window property. Expose a read-only bridge for optional workflow modules.
try {
  const getter = () => (typeof currentUser === 'undefined' ? null : currentUser);
  Object.defineProperty(window, 'currentUser', { configurable: true, get: getter });
  Object.defineProperty(window, 'approveHQCurrentUser', { configurable: true, get: getter });
} catch {}
