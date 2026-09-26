/* Symphony landing: the page-local choreography. The engine (scrollcraft.js)
   publishes each act's progress as --sc-p; everything here reads it and never
   edits the engine. Three pieces: the Inbox filling (act 1), the descent from
   the year to today (act 4), and the signature move: one checkmark on Today
   that lands on every page the task lives on. */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var prog = function (el) { return parseFloat(el.style.getPropertyValue('--sc-p')) || 0; };
  var px = function (el, name) { return parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0; };

  /* ---------------------------------------------------------------- dates --
     The sample household lives on the visitor's own today. */
  (function dates() {
    var now = new Date();
    var fmt = function (o) { return now.toLocaleDateString('en-US', o); };
    var mon = function (d) { return d.toLocaleDateString('en-US', { month: 'short' }); };
    var m = now.getMonth();
    var seasons = [['Winter', 'Dec to Feb'], ['Spring', 'Mar to May'], ['Summer', 'Jun to Aug'], ['Fall', 'Sep to Nov']];
    var s = seasons[Math.floor(((m + 1) % 12) / 3)];
    var dow = (now.getDay() + 6) % 7; // Monday-first week
    var a = new Date(now); a.setDate(now.getDate() - dow);
    var b = new Date(a); b.setDate(a.getDate() + 6);
    var week = a.getMonth() === b.getMonth()
      ? mon(a) + ' ' + a.getDate() + ' to ' + b.getDate()
      : mon(a) + ' ' + a.getDate() + ' to ' + mon(b) + ' ' + b.getDate();
    var h = now.getHours();
    var text = {
      day: fmt({ weekday: 'long' }) + ' · ' + fmt({ month: 'long', day: 'numeric' }),
      year: 'Year · ' + now.getFullYear(),
      season: s[0] + ' · ' + s[1],
      month: fmt({ month: 'long' }),
      week: 'Week · ' + week,
      todaylabel: 'Today · ' + fmt({ weekday: 'short' }) + ', ' + fmt({ month: 'short', day: 'numeric' })
    };
    document.querySelectorAll('[data-date]').forEach(function (el) {
      var t = text[el.getAttribute('data-date')];
      if (t) el.textContent = t;
    });
    var greet = document.querySelector('.pg-strip-meta');
    if (greet) greet.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  /* ------------------------------------------------------ 1 · the inbox --- */
  var inboxAct = document.getElementById('inbox');
  var list = document.querySelector('[data-inbox]');
  var rows = list ? Array.prototype.slice.call(list.children) : [];
  var countEl = document.querySelector('[data-inbox-count]');
  var GREET = 4;
  var at = rows.map(function (_, i) { return i < GREET ? -1 : 0.05 + (i - GREET) * (0.72 / (rows.length - GREET - 1)); });
  var rowH = 46, shown = -1;

  function layoutInbox(count) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (i < count) {
        r.style.setProperty('--y', ((count - 1 - i) * rowH) + 'px');
        r.style.setProperty('--o', '1');
        r.classList.toggle('is-new', i === count - 1 && count > GREET);
      } else {
        r.style.setProperty('--y', (-rowH * 0.6) + 'px');
        r.style.setProperty('--o', '0');
      }
    }
    if (countEl) countEl.textContent = count;
  }

  /* ------------------------------------------------------ 4 · the descent -- */
  var planAct = document.getElementById('plan');
  var planWrap = planAct && planAct.querySelector('.plan-wrap');
  var stack = planAct && planAct.querySelector('[data-stack]');
  var pages = stack ? Array.prototype.slice.call(stack.children) : [];
  var helps = planAct ? Array.prototype.slice.call(planAct.querySelectorAll('[data-help]')) : [];
  var threadRow = planAct && planAct.querySelector('.thread-row');
  var ARRIVE = 0.8; // Today is in front from here; the rest of the act is the hold.
  var stackH = 0, strip = 50, lastK = -1, lastHelp = -1;

  pages.forEach(function (pg, j) { pg.style.setProperty('--i', j); pg.style.zIndex = j + 1; });

  function kFor(p) {
    var seg = clamp01(p / ARRIVE) * (pages.length - 1);
    var i0 = Math.floor(seg);
    if (i0 >= pages.length - 1) return pages.length - 1;
    // Each page settles before the next one starts to arrive.
    return i0 + ease(clamp01((seg - i0 - 0.16) / 0.66));
  }

  function layoutStack(k) {
    for (var j = 0; j < pages.length; j++) {
      var pg = pages[j], d = j - k;
      if (reduce) {
        pg.style.transform = 'translate3d(0,' + (j * strip) + 'px,0)';
        pg.style.opacity = d > 0.5 ? '0' : '1';
      } else {
        var y = j * strip + (d > 0 ? d * (stackH + 48) : 0);
        var s = d < 0 ? 1 + Math.max(d, -4) * 0.012 : 1;
        pg.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
      }
      pg.classList.toggle('is-behind', d <= -0.5);
    }
    var h = Math.round(k);
    if (h !== lastHelp) {
      helps.forEach(function (el, i) { el.classList.toggle('is-active', i === h); });
      lastHelp = h;
    }
    if (threadRow) threadRow.classList.toggle('is-open', k >= pages.length - 1.02 || threadRow.classList.contains('is-done'));
  }

  // Keyboard or screen-reader focus inside a page that has not arrived yet:
  // scroll to where that page is in front, so focus never lands off-screen.
  if (stack) {
    stack.addEventListener('focusin', function (e) {
      var pg = e.target.closest('.pg');
      if (!pg) return;
      var j = pages.indexOf(pg);
      if (Math.abs(j - kFor(prog(planAct))) < 0.5) return;
      var travel = planAct.offsetHeight - innerHeight;
      var target = planAct.getBoundingClientRect().top + scrollY + ((j / (pages.length - 1)) * ARRIVE + (j === pages.length - 1 ? 0.04 : 0)) * travel;
      scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------ the signature: one checkmark -- */
  var tick = planAct && planAct.querySelector('[data-tick]');
  var status = planAct && planAct.querySelector('[data-status]');
  var timers = [];
  if (tick) {
    // Today first, then the week and the month behind it: the same task.
    var threads = [threadRow].concat(Array.prototype.slice.call(planAct.querySelectorAll('.pg-thread[data-task]')).reverse());
    tick.addEventListener('click', function () {
      var done = tick.getAttribute('aria-pressed') !== 'true';
      tick.setAttribute('aria-pressed', String(done));
      timers.forEach(clearTimeout); timers = [];
      threads.forEach(function (el, i) {
        timers.push(setTimeout(function () { el.classList.toggle('is-done', done); }, reduce ? 0 : i * 190));
      });
      if (status) status.textContent = done ? 'Done on Today, this week and this month. One task, one checkmark.' : '';
    });
  }

  /* --------------------------------------------------------- review tile -- */
  document.querySelectorAll('.choices').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var b = e.target.closest('.choice');
      if (!b) return;
      group.querySelectorAll('.choice').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
    });
  });

  /* ------------------------------------------------------------- chrome --- */
  var bar = document.querySelector('.bar');
  var navLinks = {};
  document.querySelectorAll('[data-nav]').forEach(function (a) { navLinks[a.getAttribute('data-nav')] = a; });
  var zones = [['inbox', 'inbox'], ['sort', 'inbox'], ['cadence', 'plan'], ['plan', 'plan'], ['more', 'more'], ['waitlist', null]]
    .map(function (z) { return { el: document.getElementById(z[0]), nav: z[1] }; })
    .filter(function (z) { return z.el; });
  var lastNav;

  function chrome() {
    var vh = innerHeight, cur = null;
    for (var i = 0; i < zones.length; i++) {
      if (zones[i].el.getBoundingClientRect().top <= vh * 0.45) cur = zones[i].nav;
    }
    if (cur === 'plan' && planAct && prog(planAct) >= ARRIVE - 0.02) cur = 'today';
    if (cur !== lastNav) {
      Object.keys(navLinks).forEach(function (k) {
        if (k === cur) navLinks[k].setAttribute('aria-current', 'true');
        else navLinks[k].removeAttribute('aria-current');
      });
      lastNav = cur;
    }
    if (bar && inboxAct) {
      var r = inboxAct.getBoundingClientRect();
      bar.classList.toggle('is-solid', r.bottom < vh + 1);
    }
  }

  /* -------------------------------------------------------------- loop --- */
  function measure() {
    if (list) rowH = px(list.parentNode, '--row-h') || 46;
    if (stack) stackH = stack.clientHeight;
    if (planWrap) strip = px(planWrap, '--strip') || 50;
    shown = -1; lastK = -1;
  }

  function frame() {
    if (inboxAct && rows.length) {
      var p = prog(inboxAct), c = 0;
      for (var i = 0; i < at.length; i++) if (at[i] <= p) c++;
      if (c !== shown) { layoutInbox(c); shown = c; }
    }
    if (planAct && pages.length) {
      var k = kFor(prog(planAct));
      if (Math.abs(k - lastK) > 0.0005) { layoutStack(k); lastK = k; }
    }
    chrome();
    requestAnimationFrame(frame);
  }

  measure();
  addEventListener('resize', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  requestAnimationFrame(frame);
})();
