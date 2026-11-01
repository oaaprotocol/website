/* Main site: Launchpad, Portal and Buy open their own pages (subdomains) instead of a panel. */
(function () {
  'use strict';
  var URLS = { launch: 'https://launch.oaap.si/', portal: 'https://portal.oaap.si/', buy: 'https://buy.oaap.si/' };
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-tab="launch"],[data-tab="portal"],[data-tab="buy"]');
    if (!t) return;
    var u = URLS[t.getAttribute('data-tab')]; if (!u) return;
    e.preventDefault(); e.stopPropagation();
    document.body.classList.remove('qs-mm-open');
    window.open(u, '_blank', 'noopener');
  }, true);
  // old links like oaap.si/#portal go straight to the new page
  var h = (location.hash || '').slice(1).toLowerCase();
  if (URLS[h]) location.replace(URLS[h]);
})();
