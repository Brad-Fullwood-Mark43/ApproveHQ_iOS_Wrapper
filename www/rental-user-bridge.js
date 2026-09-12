'use strict';
// app.js intentionally keeps currentUser as a global lexical binding rather than
// a window property. Expose a read-only bridge for optional workflow modules.
try {
  Object.defineProperty(window, 'approveHQCurrentUser', {
    configurable: true,
    get() { return typeof currentUser === 'undefined' ? null : currentUser; }
  });
} catch {}
