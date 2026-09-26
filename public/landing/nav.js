/* Mobile navigation.
   ==========================================================================
   Every page hid all seven nav links below 768px with `hidden md:flex` and
   shipped no toggle, so on a phone the only thing in the header was the
   Start button -- Features, Pricing, Download, Integrations and About were
   unreachable from anywhere on the site. This is the control that was
   missing, not a new feature.

   Progressive enhancement: the panel is a plain <div hidden> that only this
   script opens, so a browser that never runs it shows the header exactly as
   it does today rather than a menu stuck open. */
(function () {
  var btn   = document.getElementById('navToggle');
  var panel = document.getElementById('navPanel');
  if (!btn || !panel) return;

  function set(open) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    // The icon is two glyphs in one button; swap which is shown.
    btn.querySelector('[data-icon="open"]').hidden = open;
    btn.querySelector('[data-icon="close"]').hidden = !open;
  }

  btn.addEventListener('click', function () {
    set(panel.hidden);
  });

  // Escape closes it and returns focus to the control that opened it --
  // otherwise focus is left inside a panel that is no longer on screen.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); }
  });

  // Following a link inside the panel navigates away; closing first keeps the
  // state clean for a browser that restores the page from bfcache.
  panel.addEventListener('click', function (e) {
    if (e.target.closest('a')) set(false);
  });

  // Crossing into desktop while it is open would leave a panel hanging under
  // a nav that already shows every link.
  var mq = window.matchMedia('(min-width: 768px)');
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function (e) {
    if (e.matches) set(false);
  });
})();
