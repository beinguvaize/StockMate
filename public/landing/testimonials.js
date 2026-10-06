/* The testimonial carousel.
   ==========================================================================
   Reads the track rather than carrying its own copy of the content: the
   <figure> elements in index.html are the list, and the dots, the arrows and
   the disabled states are all derived from them. Adding a quote is adding a
   figure; nothing in this file changes.

   Three states, because a carousel with one slide and a carousel with none are
   different problems:

     0 quotes  the section is hidden. It ships that way deliberately -- the
               design called for a testimonial here and there are no real ones
               yet, and an invented customer on a pricing page is worse than an
               empty space.
     1 quote   shown, with no arrows and no dots. Controls that cannot move
               anywhere are noise.
     2+        the full carousel.

   The section carries `hidden` in the markup, so a browser with no JS — or one
   where this file fails to load — shows nothing rather than every quote
   stacked on top of each other. That is the safe direction here: the rest of
   the page degrades to visible because its content is the point; this one
   degrades to absent because its content is optional. */

(function () {
  var section = document.querySelector('[data-carousel]');
  if (!section) return;

  var track = section.querySelector('[data-carousel-track]');
  var prev  = section.querySelector('[data-carousel-prev]');
  var next  = section.querySelector('[data-carousel-next]');
  var dots  = section.querySelector('[data-carousel-dots]');
  if (!track) return;

  var slides = track.querySelectorAll('figure');
  if (!slides.length) return;           // stays hidden

  section.hidden = false;

  // One quote needs no way to get to the next one.
  if (slides.length < 2) {
    if (prev) prev.hidden = true;
    if (next) next.hidden = true;
    if (dots) dots.hidden = true;
    return;
  }

  var index = 0;
  var buttons = [];

  for (var i = 0; i < slides.length; i++) {
    var dot = document.createElement('button');
    dot.type = 'button';
    // 24px of target around an 8px dot: the dot is what you see, the button is
    // what you hit.
    dot.className = 'grid place-items-center w-6 h-6 rounded-full '
                  + 'transition-[transform] duration-150 active:scale-[0.9]';
    dot.innerHTML = '<span class="block w-2 h-2 rounded-full bg-line '
                  + 'transition-[background-color] duration-150"></span>';
    dot.setAttribute('aria-label', 'Testimonial ' + (i + 1) + ' of ' + slides.length);
    (function (n) { dot.addEventListener('click', function () { show(n); }); })(i);
    dots.appendChild(dot);
    buttons.push(dot);
  }

  function show(n) {
    index = (n + slides.length) % slides.length;
    for (var i = 0; i < slides.length; i++) {
      slides[i].hidden = i !== index;
      var on = i === index;
      buttons[i].setAttribute('aria-current', on ? 'true' : 'false');
      buttons[i].firstChild.className = 'block w-2 h-2 rounded-full '
        + 'transition-[background-color] duration-150 '
        + (on ? 'bg-accent-solid' : 'bg-line');
    }
  }

  prev.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });

  // The arrows are a pair of controls sitting side by side; the arrow keys are
  // what somebody tries next once one of them has focus.
  section.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); show(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });

  show(0);
}());
