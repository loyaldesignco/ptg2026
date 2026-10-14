/* PTG motion layer v1.1.0 — site-wide GSAP effects keyed off Styleguide classes + data hooks.
   Depends on gsap + ScrollTrigger (site head). Lenis is driven by the footer boot (PTG.lenis).
   Hooks:
     [data-lines]   masked line reveal on scroll (auto on .heading_h0/.heading_h1 outside [data-hero] and [data-reveal])
     [data-words]   scroll-scrubbed word colour sweep (dim → gold → white); [data-accent] children stay gold
     [data-rise]    y+fade reveal
     [data-count]   count-up number (data-dec = decimals)
     [data-settle]  image scale 1.08 → 1 on load
     [data-parallax] slow vertical drift inside an overflow:hidden parent
     .button, .text-link, .card_title  stacked-text hover (runtime-wrapped into .ptg-swap)
     internal <a>   page curtain out → navigate → curtain in on the next page
   Reduced motion: everything static, nothing hidden. Canvas: Designer runs no scripts, so markup is untouched. */
(function () {
  if (window.__ptgMotion) return; window.__ptgMotion = 1;
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GOLD = '#F9B62C', GOLD_LIGHT = '#946608';

  function ready(fn) { if (document.readyState === 'complete') fn(); else window.addEventListener('load', fn); }
  function onDark(el) { return !!el.closest('.is-inverse, .is-photo, .card.on-inverse, .mail_foot'); }

  /* ---------- 1. masked line reveal ---------- */
  function splitLines(h) {
    if (h.dataset.ptgSplit || h.children.length) return null; // inline markup inside → leave intact
    h.dataset.ptgSplit = 1;
    var text = h.textContent.trim(); if (!text) return null;
    var words = text.split(/\s+/);
    h.innerHTML = words.map(function (w) { return '<span class="ptg-w">' + w + '&nbsp;</span>'; }).join('');
    var ws = [].slice.call(h.querySelectorAll('.ptg-w')), lines = [], top = null, cur;
    ws.forEach(function (w) { if (w.offsetTop !== top) { top = w.offsetTop; cur = []; lines.push(cur); } cur.push(w); });
    h.innerHTML = '';
    lines.forEach(function (l) {
      var o = document.createElement('span'); o.className = 'ptg-ln';
      var i = document.createElement('span'); i.textContent = l.map(function (w) { return w.textContent; }).join('').trim();
      o.appendChild(i); h.appendChild(o);
    });
    return h.querySelectorAll('.ptg-ln > span');
  }

  function initLines(g, ST) {
    var sel = '[data-lines], .heading_h0, .heading_h1';
    [].slice.call(document.querySelectorAll(sel)).forEach(function (h) {
      if (h.closest('[data-hero], [data-reveal], .w-nav, .ptg-header, footer')) return;
      var inner = splitLines(h); if (!inner || RM) return;
      g.set(inner, { yPercent: 110 });
      g.to(inner, { yPercent: 0, duration: 1, ease: 'power3.out', stagger: 0.09,
        scrollTrigger: { trigger: h, start: 'top 88%', once: true },
        onComplete: function () { h.querySelectorAll('.ptg-ln').forEach(function (l) { l.style.overflow = 'visible'; }); } });
    });
  }

  /* ---------- 2. word colour sweep ---------- */
  function initWords(g) {
    [].slice.call(document.querySelectorAll('[data-words]')).forEach(function (p) {
      if (p.dataset.ptgSplit) return; p.dataset.ptgSplit = 1;
      var dark = onDark(p);
      var dim = dark ? 'rgba(255,255,255,.22)' : 'rgba(2,2,2,.22)', end = dark ? '#FFFFFF' : '#020202', accent = dark ? GOLD : GOLD_LIGHT;
      (function wrap(node) {
        [].slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach(function (t) {
              if (!t) return;
              if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(' ')); return; }
              var s = document.createElement('span'); s.className = 'ptg-wd'; s.textContent = t;
              s.style.color = RM ? '' : dim; frag.appendChild(s);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1) { if (n.hasAttribute('data-accent')) n.style.color = accent; wrap(n); }
        });
      })(p);
      if (RM) return;
      var ws = p.querySelectorAll('.ptg-wd');
      var tl = g.timeline({ scrollTrigger: { trigger: p, start: 'top 80%', end: 'bottom 40%', scrub: 0.5 } });
      ws.forEach(function (w, i) {
        var at = i * 0.08, keep = w.closest('[data-accent]');
        tl.to(w, { color: accent, duration: 0.22, ease: 'none' }, at)
          .to(w, { color: keep ? accent : end, duration: 0.34, ease: 'power1.out' }, at + 0.22);
      });
    });
  }

  /* ---------- 3. rise, count, settle, parallax ---------- */
  function initScroll(g) {
    if (RM) return;
    [].slice.call(document.querySelectorAll('[data-rise]')).forEach(function (el, i) {
      g.fromTo(el, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', delay: (i % 4) * 0.06,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    [].slice.call(document.querySelectorAll('[data-count]')).forEach(function (el) {
      var n = parseFloat(el.getAttribute('data-count')), dec = +el.getAttribute('data-dec') || 0, o = { v: 0 };
      if (isNaN(n)) return;
      g.to(o, { v: n, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onUpdate: function () { el.textContent = o.v.toFixed(dec); } });
    });
    [].slice.call(document.querySelectorAll('[data-settle]')).forEach(function (el) {
      g.fromTo(el, { scale: 1.08 }, { scale: 1, duration: 1.8, ease: 'power2.out' });
    });
    [].slice.call(document.querySelectorAll('[data-parallax]')).forEach(function (el) {
      var host = el.parentElement; if (!host) return;
      g.fromTo(el, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: host, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------- 4. stacked-text hover ---------- */
  function initSwap() {
    var sel = '.button, .text-link, .card_title, .dd-item';
    [].slice.call(document.querySelectorAll(sel)).forEach(function (el) {
      if (el.querySelector('.ptg-swap')) return;
      // only wrap a lone text node (icons/spans stay put)
      var tn = null, others = 0;
      [].slice.call(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) { if (tn) others++; else tn = n; }
        else if (n.nodeType === 1 && !n.matches('.icon_svg, .icon, svg')) others++;
      });
      if (!tn || others) return;
      var t = tn.textContent.trim();
      var w = document.createElement('span'); w.className = 'ptg-swap';
      var a = document.createElement('span'); a.textContent = t;
      var b = document.createElement('span'); b.textContent = t; b.setAttribute('aria-hidden', 'true');
      if (el.matches('.card_title, .text-link')) b.style.color = onDark(el) ? GOLD : GOLD_LIGHT;
      w.appendChild(a); w.appendChild(b); tn.replaceWith(w);
    });
  }

  /* ---------- 5. page curtain ---------- */
  function initCurtain(g) {
    if (RM) return;
    var c = document.createElement('div'); c.className = 'ptg-curtain'; c.setAttribute('aria-hidden', 'true');
    var hair = document.createElement('div'); hair.className = 'ptg-curtain_line'; c.appendChild(hair);
    document.body.appendChild(c);
    // arriving from a curtain-out: reveal
    if (sessionStorage.getItem('ptgCurtain') === '1') {
      sessionStorage.removeItem('ptgCurtain');
      document.documentElement.classList.remove('ptg-wipe');
      g.set(c, { scaleY: 1, transformOrigin: 'top' });
      g.to(c, { scaleY: 0, duration: 0.6, ease: 'power3.inOut', delay: 0.05 });
    }
    var busy = false;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]'); if (!a || busy) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target && a.target !== '_self') return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href) || a.hasAttribute('download')) return;
      var url; try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault(); busy = true;
      sessionStorage.setItem('ptgCurtain', '1');
      g.set(c, { transformOrigin: 'bottom' });
      g.to(c, { scaleY: 1, duration: 0.55, ease: 'power3.inOut', onComplete: function () { location.href = url.href; } });
      setTimeout(function () { busy = false; }, 4000);
    }, true);
  }

  ready(function () {
    var g = window.gsap, ST = window.ScrollTrigger;
    if (!g || !ST) return;
    g.registerPlugin(ST);
    initSwap();
    initLines(g, ST);
    initWords(g);
    initScroll(g);
    initCurtain(g);
    setTimeout(function () { ST.refresh(); }, 400);
    window.addEventListener('resize', function () { clearTimeout(window.__ptgRz); window.__ptgRz = setTimeout(function () { ST.refresh(); }, 200); });
  });
})();
