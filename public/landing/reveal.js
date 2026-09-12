/* Reveal each section as it scrolls into view.
   ==========================================================================
   Pairs with reveal.css, which holds the hidden state. */

(function () {
  var sections = document.querySelectorAll('section');
  if (!sections.length) return;

  // Older browsers: drop the `js` class so the CSS hidden state stops applying
  // and every section is simply visible. Degrading to "no animation" is right;
  // degrading to "no content" would not be.
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js');
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      entries[i].target.classList.add('is-visible');
      // One-way animation: stop watching. Leaving ~30 live observers on the
      // page costs scroll performance for a transition that cannot repeat.
      io.unobserve(entries[i].target);
    }
  }, {
    // Shrink the root's bottom edge so a section starts moving a moment after
    // it first appears rather than the instant one pixel crosses the fold —
    // firing exactly at the edge reads as lag, not intent.
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.05
  });

  for (var j = 0; j < sections.length; j++) io.observe(sections[j]);

  // Failsafe. If the observer has revealed nothing at all a few seconds in,
  // something is wrong — a renderer that reports no viewport, an observer that
  // never fires — and the page is sitting there blank below the fold. Drop the
  // `js` class and every section becomes visible immediately, the same way it
  // degrades for a browser without IntersectionObserver.
  //
  // In a working browser this never fires: the first section is observed and is
  // intersecting at load, so at least one reveal has always happened by then.
  setTimeout(function () {
    if (!document.querySelector('section.is-visible')) {
      document.documentElement.classList.remove('js');
    }
  }, 3000);
})();
