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


  /* ------------------------------------------------------- your place --
     The app's theme picker (Settings > Your place): five places, each with
     its own skyline and accent. Remembered per visitor. */
  var SKY = {"urban":{"far":"M0 88V60H34V88ZM30 88V50H56V88ZM60 88V62H84V88ZM84 88V40H106V88ZM120 88V56H150V88ZM150 88V44H176V88ZM176 88V30H192V88ZM200 88V52H234V88ZM240 88V36H264V88ZM270 88V54H304V88ZM310 88V42H338V88ZM345 88V58H371V88ZM372 88V32H394V88ZM398 88V48H428V88ZM432 88V40H458V88ZM462 88V56H492V88ZM494 88V34H512V88ZM516 88V50H546V88ZM550 88V42H576V88ZM580 88V58H608V88ZM610 88V50H640V88Z","near":"M0 88V70H42V88ZM40 88V58H64V88ZM66 88V72H94V88ZM96 88V50H122V88ZM124 88V66H158V88ZM160 88V60H182V88ZM184 88V54H204V88ZM206 88V70H242V88ZM250 88V50H272V88ZM276 88V72H302V88ZM304 88V62H334V88ZM336 88V56H358V88ZM362 88V68H382V88ZM384 88V46H410V88ZM414 88V66H444V88ZM446 88V58H470V88ZM472 88V64H506V88ZM510 88V48H532V88ZM536 88V70H566V88ZM568 88V60H594V88ZM596 88V68H640V88ZM256 88V26H266V88ZM257 26L261 8L265 26ZM102 88V42H116V88ZM516 88V36H526V88ZM384 46L397 36L410 46Z"},"small-city":{"far":"M0 88L0 64L80 54L160 62L240 52L320 58L400 50L480 60L560 52L640 58L640 88Z","near":"M0 88V68L17 58L34 68V88ZM36 88V62L51 50L66 62V88ZM71 70a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM78.5 70h3V88h-3ZM94 88V66L111 55L128 66V88ZM130 88V58L144 46L158 58V88ZM160 88V70L175 61L190 70V88ZM196 68a10 10 0 1 0 20 0a10 10 0 1 0 -20 0ZM204.5 68h3V88h-3ZM222 88V62L237 50L252 62V88ZM292 88V34H318V88ZM292 34a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM303 22L305 8L307 22ZM262 88V66L276 56L290 66V88ZM320 88V64L335 53L350 64V88ZM356 88V60L370 48L384 60V88ZM391 70a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM398.5 70h3V88h-3ZM414 88V68L431 59L448 68V88ZM452 88V56L467 44L482 56V88ZM486 88V38H498V88ZM486 38L492 20L498 38ZM502 88V66L517 56L532 66V88ZM538 68a10 10 0 1 0 20 0a10 10 0 1 0 -20 0ZM546.5 68h3V88h-3ZM564 88V62L580 51L596 62V88ZM600 88V70L620 61L640 70V88Z"},"mountain-town":{"far":"M0 88L0 56L60 22L110 50L170 10L230 46L280 28L340 54L400 14L460 44L520 24L580 50L640 30L640 88Z","near":"M4 88L12 58L20 88ZM23 88L30 64L37 88ZM40 88L48 56L56 88ZM70 88V68L83 58L96 68V88ZM100 88V72L111 64L122 72V88ZM128 88L136 60L144 88ZM145 88L152 66L159 88ZM180 88V66L194 55L208 66V88ZM212 88V70L224 61L236 70V88ZM250 88V62L265 51L280 62V88ZM282 88V40H294V88ZM282 40L288 22L294 40ZM300 88V68L313 58L326 68V88ZM336 88L344 58L352 88ZM355 88L362 64L369 88ZM386 88V66L401 55L416 66V88ZM420 88V72L431 64L442 72V88ZM450 88L458 56L466 88ZM469 88L476 62L483 88ZM500 88V68L514 58L528 68V88ZM538 88L546 60L554 88ZM555 88L564 54L573 88ZM579 88L586 62L593 88ZM604 88L612 58L620 88ZM623 88L630 64L637 88Z"},"cabin":{"far":"M-1 88L10 40L21 88ZM25 88L34 50L43 88ZM46 88L58 34L70 88ZM74 88L84 46L94 88ZM99 88L110 38L121 88ZM127 88L136 52L145 88ZM148 88L160 36L172 88ZM176 88L186 48L196 88ZM201 88L212 42L223 88ZM229 88L238 54L247 88ZM389 88L400 44L411 88ZM414 88L426 36L438 88ZM443 88L452 50L461 88ZM465 88L476 40L487 88ZM490 88L502 32L514 88ZM518 88L528 46L538 88ZM543 88L554 38L565 88ZM571 88L580 50L589 88ZM592 88L604 36L616 88ZM620 88L630 46L640 88Z","near":"M193 88L206 30L219 88ZM225 88L236 44L247 88ZM251 88L262 38L273 88ZM290 88V62L322 42L354 62V88ZM336 88V44H344V88ZM338 36a4 4 0 1 0 8 0a4 4 0 1 0 -8 0ZM342 28a5 5 0 1 0 10 0a5 5 0 1 0 -10 0ZM348 19a6 6 0 1 0 12 0a6 6 0 1 0 -12 0ZM368 88L380 36L392 88ZM398 88L408 46L418 88ZM423 88L434 40L445 88Z"},"farm":{"far":"M0 88L0 62L100 52L200 60L300 50L400 58L500 48L640 56L640 88Z","near":"M28 64a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM38.5 64h3V88h-3ZM55 70a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM62.5 70h3V88h-3ZM120 88V64L137 50L154 64V88ZM167 66a11 11 0 1 0 22 0a11 11 0 1 0 -22 0ZM176.5 66h3V88h-3ZM262 88V52L292 30L322 52V88ZM326 88V36H342V88ZM326 36a8 8 0 1 0 16 0a8 8 0 1 0 -16 0ZM398 88V34H401V88ZM399.5 34L399.5 14L402 33ZM399.5 34L419 32L401 36ZM399.5 34L399 54L397 35ZM399.5 34L380 36L398 32ZM459 66a11 11 0 1 0 22 0a11 11 0 1 0 -22 0ZM468.5 66h3V88h-3ZM488 70a8 8 0 1 0 16 0a8 8 0 1 0 -16 0ZM494.5 70h3V88h-3ZM540 88V70L553 61L566 70V88ZM586 66a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM596.5 66h3V88h-3ZM615 70a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM622.5 70h3V88h-3Z"}};
  var PLACES = {"urban": ["Densely Urban", "Steel, glass, and the late train home.", "#eff1f5"], "small-city": ["Small City", "A river, a clock tower, dusk coming on.", "#f4eff3"], "mountain-town": ["Small Mountain Town", "One road in, peaks over every rooftop.", "#eef3f6"], "cabin": ["Woodsy Cabin", "Pines, a stream, smoke from the chimney.", "#eef4f1"], "farm": ["Farm", "Barn red, wheat gold, rows to the horizon.", "#f5f0ef"]};
  (function place() {
    var far = document.querySelector('[data-sky="far"]'), near = document.querySelector('[data-sky="near"]');
    var name = document.querySelector('[data-place-name]');
    var theme = document.querySelector('meta[name="theme-color"]');
    var swatches = Array.prototype.slice.call(document.querySelectorAll('.swatch'));
    function apply(id, save) {
      if (!PLACES[id]) id = 'cabin';
      if (id === 'cabin') document.documentElement.removeAttribute('data-place');
      else document.documentElement.setAttribute('data-place', id);
      if (far) far.setAttribute('d', SKY[id].far);
      if (near) near.setAttribute('d', SKY[id].near);
      swatches.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-place') === id)); });
      if (name) {
        name.textContent = PLACES[id][0] + ' ';
        var tag = document.createElement('span'); tag.textContent = '\u00b7 ' + PLACES[id][1]; name.appendChild(tag);
      }
      if (theme) theme.setAttribute('content', PLACES[id][2]);
      if (save) { try { localStorage.setItem('symphony-place', id); } catch (e) { /* storage blocked: the choice lasts this visit */ } }
    }
    swatches.forEach(function (b) { b.addEventListener('click', function () { apply(b.getAttribute('data-place'), true); }); });
    var saved = null;
    try { saved = localStorage.getItem('symphony-place'); } catch (e) { /* no storage */ }
    apply(saved || 'cabin', false);
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
  // Fit the Inbox to the height left under it, so the panel never runs off
  // the stage on a short screen or leaves a blank tail on a tall one.
  function fitInbox() {
    if (!list || innerWidth <= 760) { if (list) list.parentNode.style.removeProperty('--rows'); return; }
    var panel = list.parentNode, stage = panel.closest('.stage');
    panel.style.setProperty('--rows', '1');
    var room = stage.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom - 56;
    panel.style.setProperty('--rows', String(Math.max(4, Math.min(9, 1 + Math.floor(room / rowH)))));
  }

  function measure() {
    if (list) rowH = px(list.parentNode, '--row-h') || 46;
    fitInbox();
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
