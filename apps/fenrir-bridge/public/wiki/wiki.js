    // REVEALS first: decorative cursor/progress failures must never leave the
    // content hidden (each cosmetic block is fenced in its own try/catch).
    // CURSOR
    try {
      var c1 = document.getElementById('c1'), c2 = document.getElementById('c2'), mx = 0, my = 0, cx = 0, cy = 0;
      document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; c1.style.left = (mx - 4) + 'px'; c1.style.top = (my - 4) + 'px' });
      (function loop() { cx += (mx - cx) * .12; cy += (my - cy) * .12; c2.style.left = (cx - 14) + 'px'; c2.style.top = (cy - 14) + 'px'; requestAnimationFrame(loop) })();
    } catch (err) { /* cosmetic only */ }

    // SCROLL PROGRESS
    try {
      var pg = document.getElementById('prog');
      window.addEventListener('scroll', function () { var s = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight; pg.style.transform = 'scaleX(' + (s / h) + ')' }, { passive: true });
    } catch (err) { /* cosmetic only */ }

    // REVEALS
    var revs = document.querySelectorAll('.rev,.revl');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }) }, { threshold: .1, rootMargin: '0px 0px -5% 0px' });
      revs.forEach(function (e) { io.observe(e) });
      setTimeout(function () { revs.forEach(function (e) { e.classList.add('in') }) }, 2000);
    } else { revs.forEach(function (e) { e.classList.add('in') }) }