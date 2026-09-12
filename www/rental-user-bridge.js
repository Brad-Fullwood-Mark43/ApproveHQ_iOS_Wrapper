'use strict';
// app.js intentionally keeps currentUser as a global lexical binding rather than
// a window property. Expose a controlled bridge for optional workflow modules.
try {
  Object.defineProperty(window, 'currentUser', {
    configurable: true,
    get() { return typeof currentUser === 'undefined' ? null : currentUser; },
    set(value) { currentUser = value; }
  });
  Object.defineProperty(window, 'approveHQCurrentUser', {
    configurable: true,
    get() { return typeof currentUser === 'undefined' ? null : currentUser; }
  });
} catch {}
