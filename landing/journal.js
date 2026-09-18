/* Landing page behaviour: the tree illustration and the sample planner.
   Everything here is local and fictional. Nothing is saved or sent. */

(() => {
  const svgNS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------
     The tree: life rains in, gathers through the trunk, and the roots
     carry each piece to Today, This week, or This month.
     ------------------------------------------------------------------ */

  const tree = document.getElementById('life-tree');
  const motionButton = document.getElementById('motion-toggle');
  const caption = document.getElementById('tree-caption');
  const objectLayer = document.getElementById('falling-objects');
  const rainLayer = document.getElementById('rain');
  const sparkLayer = document.getElementById('root-sparks');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const CAPTION_BUSY = 'A little of everything, all at once.';
  const CAPTION_CALM = 'Everything in its place.';
  const TRUNK_TOP = { x: 300, y: 322 };
  const TRUNK_BASE = { x: 300, y: 398 };

  const SIZES = {
    violin: [30, 40], car: [46, 34], bicycle: [46, 34], tablet: [40, 34],
  };

  // kind, root, where it starts across the sky, when it starts (s),
  // where it catches in the branches, and how it tumbles.
  const PIECES = [
    ['note', 'today', 70, 0.0, 214, 176, -14],
    ['mail', 'week', 520, 0.25, 408, 168, 16],
    ['appointment', 'today', 380, 0.55, 352, 214, -10],
    ['car', 'month', 150, 0.85, 198, 202, 8],
    ['soccer', 'today', 470, 1.2, 404, 226, 30],
    ['violin', 'week', 250, 1.55, 262, 158, -18],
    ['tablet', 'month', 40, 2.0, 170, 180, -12],
    ['chat', 'week', 330, 2.5, 318, 176, 10],
    ['call', 'today', 560, 3.1, 446, 196, 18],
    ['pencils', 'month', 200, 3.8, 238, 236, -20],
    ['baseball', 'week', 420, 4.6, 366, 250, 24],
    ['bicycle', 'month', 300, 5.5, 292, 212, -8],
    // A few more in the first rush, joining lists that already hold their kind.
    ['note', 'week', 480, 0.15, 382, 190, 12, true],
    ['call', 'today', 120, 0.4, 190, 214, -16, true],
    ['mail', 'month', 280, 0.7, 286, 150, -6, true],
    ['chat', 'today', 560, 1.0, 452, 168, 14, true],
    ['appointment', 'week', 20, 1.4, 142, 170, -10, true],
    ['note', 'month', 360, 1.8, 336, 238, 20, true],
  ];

  const FALL = 2.5;       // seconds from sky to branch, growing slower as the storm eases
  const FUNNEL = 2.3;     // down the branches to the trunk
  const TRUNK = 0.7;      // down the trunk
  const ROOT = 1.3;       // along the root to its list
  const RAIN_FADE = [4.5, 9];
  const TOTAL = 5.5 + FALL + 11 * 0.08 + FUNNEL + TRUNK + ROOT + 0.8;

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const roots = {
    today: document.getElementById('root-today'),
    week: document.getElementById('root-week'),
    month: document.getElementById('root-month'),
  };

  const pieces = PIECES.map(([kind, root, startX, start, catchX, catchY, spin, extra], i) => {
    const [w, h] = SIZES[kind] || [34, 34];
    const node = document.createElementNS(svgNS, 'g');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', '#' + kind);
    use.setAttribute('x', String(-w / 2));
    use.setAttribute('y', String(-h / 2));
    use.setAttribute('width', String(w));
    use.setAttribute('height', String(h));
    node.append(use);
    node.style.opacity = '0';
    objectLayer.append(node);

    const spark = document.createElementNS(svgNS, 'circle');
    spark.setAttribute('r', '3.2');
    spark.style.opacity = '0';
    sparkLayer.append(spark);

    const row = extra ? null : document.querySelector(`.ledger li[data-from="${kind}"]`);
    const fall = extra ? FALL * 0.9 : FALL + i * 0.08;
    return {
      node, spark, row, root, startX, start, catchX, catchY, spin, fall,
      sway: (i % 2 ? 1 : -1) * (6 + (i % 3) * 3),
      arrives: start + fall + FUNNEL + TRUNK + ROOT,
    };
  });

  const drops = Array.from({ length: 26 }, (_, i) => {
    const line = document.createElementNS(svgNS, 'path');
    rainLayer.append(line);
    return { line, x: 18 + ((i * 97) % 580), phase: (i * 181) % 520, speed: 300 + (i % 5) * 34 };
  });

  function placePiece(p, t) {
    const local = t - p.start;
    const { node, spark } = p;
    if (local <= 0) {
      node.style.opacity = '0';
      spark.style.opacity = '0';
      return;
    }

    let x, y, rotation, scale = 1, opacity = 1;
    if (local < p.fall) {
      const k = local / p.fall;
      const e = easeOut(k);
      x = lerp(p.startX, p.catchX, e) + Math.sin(k * Math.PI * 1.5) * p.sway * (1 - k);
      y = lerp(-40, p.catchY, e);
      rotation = p.spin * (1 + Math.sin(k * Math.PI * 2) * 0.6);
      opacity = clamp(k * 6);
    } else if (local < p.fall + FUNNEL) {
      const k = easeInOut((local - p.fall) / FUNNEL);
      // Slide down along the branches, gathering toward the centre.
      const cx = lerp(p.catchX, TRUNK_TOP.x, 0.7);
      const cy = lerp(p.catchY, TRUNK_TOP.y, 0.35);
      x = (1 - k) * (1 - k) * p.catchX + 2 * (1 - k) * k * cx + k * k * TRUNK_TOP.x;
      y = (1 - k) * (1 - k) * p.catchY + 2 * (1 - k) * k * cy + k * k * TRUNK_TOP.y;
      rotation = p.spin * 1 * (1 - k);
      scale = lerp(1, 0.46, k);
    } else if (local < p.fall + FUNNEL + TRUNK) {
      const k = (local - p.fall - FUNNEL) / TRUNK;
      x = TRUNK_TOP.x;
      y = lerp(TRUNK_TOP.y, TRUNK_BASE.y, k);
      rotation = 0;
      scale = lerp(0.46, 0.18, k);
      opacity = 1 - k;
    } else {
      x = TRUNK_BASE.x;
      y = TRUNK_BASE.y;
      rotation = 0;
      opacity = 0;
    }
    node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${scale.toFixed(3)})`);
    node.style.opacity = opacity.toFixed(3);

    // The root carries it the rest of the way.
    const rootStart = p.fall + FUNNEL + TRUNK - 0.15;
    const rootK = (local - rootStart) / ROOT;
    if (rootK > 0 && rootK < 1) {
      const path = roots[p.root];
      const point = path.getPointAtLength(path.getTotalLength() * easeInOut(rootK));
      spark.setAttribute('cx', point.x.toFixed(1));
      spark.setAttribute('cy', point.y.toFixed(1));
      spark.style.opacity = String(clamp(rootK * 5) * clamp((1 - rootK) * 5));
    } else {
      spark.style.opacity = '0';
    }
  }

  function draw(t) {
    pieces.forEach((p) => placePiece(p, t));

    const rainOpacity = 0.75 * (1 - clamp((t - RAIN_FADE[0]) / (RAIN_FADE[1] - RAIN_FADE[0])));
    rainLayer.setAttribute('opacity', rainOpacity.toFixed(3));
    if (rainOpacity > 0) {
      drops.forEach((d) => {
        const y = ((d.phase + t * d.speed) % 520) - 40;
        d.line.setAttribute('d', `M${d.x} ${y.toFixed(1)}l-4 14`);
      });
    }

    Object.entries(roots).forEach(([name, path]) => {
      const flowing = pieces.some((p) => {
        const local = t - p.start - (p.fall + FUNNEL + TRUNK - 0.15);
        return p.root === name && local > 0 && local < ROOT;
      });
      path.classList.toggle('is-flowing', flowing);
    });

    pieces.forEach((p) => {
      if (!p.row) return;
      const arrived = t >= p.arrives;
      p.row.classList.toggle('is-waiting', !arrived);
      p.row.classList.toggle('just-arrived', arrived && t < p.arrives + 1.6);
    });
  }

  function showCalm() {
    pieces.forEach((p) => {
      p.node.style.opacity = '0';
      p.spark.style.opacity = '0';
      p.row?.classList.remove('is-waiting', 'just-arrived');
    });
    rainLayer.setAttribute('opacity', '0');
    Object.values(roots).forEach((path) => path.classList.remove('is-flowing'));
  }

  let elapsed = 0;        // seconds of animation shown so far
  let previous = null;
  let frame = null;
  let state = 'playing';  // playing | paused | finished | still
  let onScreen = true;

  function setCaption(text) {
    if (caption.textContent === text) return;
    if (reduceMotion.matches) { caption.textContent = text; return; }
    caption.classList.add('is-changing');
    setTimeout(() => { caption.textContent = text; caption.classList.remove('is-changing'); }, 450);
  }

  function updateButton() {
    const labels = { playing: 'Pause', paused: 'Play', finished: 'Replay', still: 'Still' };
    const text = document.createElement('span');
    const word = document.createElement('span');
    word.className = 'motion-word';
    word.textContent = ' animation';
    text.append(labels[state], word);
    motionButton.replaceChildren(text);
    motionButton.dataset.state = state;
    motionButton.hidden = state === 'still';
  }

  function tick(now) {
    frame = null;
    if (state !== 'playing' || !onScreen || document.hidden) { previous = null; return; }
    if (previous !== null) elapsed += Math.min(now - previous, 60) / 1000;
    previous = now;
    if (elapsed >= TOTAL) {
      elapsed = TOTAL;
      draw(TOTAL);
      showCalm();
      state = 'finished';
      setCaption(CAPTION_CALM);
      updateButton();
      return;
    }
    draw(elapsed);
    frame = requestAnimationFrame(tick);
  }

  function run() {
    if (frame === null && state === 'playing') {
      previous = null;
      frame = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previous = null;
  }

  function begin() {
    stop();
    elapsed = 0;
    state = 'playing';
    setCaption(CAPTION_BUSY);
    draw(0);
    updateButton();
    run();
  }

  function settleStill() {
    stop();
    state = 'still';
    showCalm();
    caption.textContent = CAPTION_CALM;
    updateButton();
  }

  motionButton.addEventListener('click', () => {
    if (state === 'finished') { begin(); return; }
    if (state === 'playing') { state = 'paused'; stop(); }
    else if (state === 'paused') { state = 'playing'; run(); }
    updateButton();
  });

  reduceMotion.addEventListener('change', () => (reduceMotion.matches ? settleStill() : begin()));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen) run();
    }).observe(tree);
  }

  if (reduceMotion.matches) settleStill();
  else begin();

  /* ------------------------------------------------------------------
     The sample planner: Today, This week, This month, with lists that
     can be pinned beside the page and brought onto today.
     ------------------------------------------------------------------ */

  const NOW = 9 * 60 + 12; // the sample morning is 9:12 AM
  const items = [
    { id: 'walk', list: 'today', at: 8 * 60, time: '8:00 AM', title: 'Morning walk', kind: 'Routine' },
    { id: 'shop', list: 'today', at: 10 * 60, time: '10:00 AM', title: 'Call the repair shop', kind: 'Task', note: 'Ask about Saturday' },
    { id: 'soccer', list: 'today', at: 15 * 60 + 30, time: '3:30 PM', title: 'Soccer practice', kind: 'Appointment', note: 'Bring the water bottles' },
    { id: 'dinner', list: 'today', at: 18 * 60, time: '6:00 PM', title: 'Make dinner together', kind: 'Routine' },
    { id: 'outing', list: 'week', title: 'Choose a weekend outing' },
    { id: 'library', list: 'week', title: 'Return the library books' },
    { id: 'violin', list: 'week', title: 'Book a violin lesson' },
    { id: 'ride', list: 'week', title: 'Make time for a bike ride' },
    { id: 'trip', list: 'month', title: 'Plan a short trip' },
    { id: 'car', list: 'month', title: 'Get the car serviced' },
    { id: 'sketch', list: 'month', title: 'Finish the sketchbook' },
    { id: 'lunch', list: 'month', title: 'Host a Sunday lunch' },
  ];
  items.forEach((item) => { item.origin = item.list; item.done = false; });

  const PAGES = {
    today: { stamp: ['SEP', '18'], eyebrow: 'Friday · September 18', title: 'Good morning', add: 'Add to today…', label: 'Add to Today' },
    week: { stamp: ['WEEK', '38'], eyebrow: 'September 14–20', title: 'This week', subtitle: 'What you’d like to make room for.', add: 'Add to this week…', label: 'Add to This week' },
    month: { stamp: ['2026', 'Sep'], eyebrow: 'The month ahead', title: 'September', subtitle: 'The bigger plans, kept in sight.', add: 'Add to this month…', label: 'Add to This month' },
  };
  const LIST_NAMES = { week: 'Week list', month: 'Month list' };
  const LIST_DATES = { week: 'September 14–20', month: 'September 2026' };

  let view = 'today';
  const pins = { week: false, month: false };
  let captured = 0;

  const tabs = [...document.querySelectorAll('[role=tab][data-view]')];
  const page = document.getElementById('sample-page');
  const entries = document.getElementById('demo-entries');
  const workspace = document.querySelector('.demo-workspace');
  const panel = document.getElementById('reference-panel');
  const pinButtons = [...document.querySelectorAll('[data-pin]')];
  const captureForm = document.getElementById('demo-capture');
  const captureInput = document.getElementById('demo-capture-input');

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
    });
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  };

  function checkbox(item, scope) {
    const input = el('input', { type: 'checkbox', dataset: { key: scope + '-check-' + item.id } });
    input.checked = item.done;
    input.addEventListener('change', () => { item.done = input.checked; render(input.dataset.key); });
    return input;
  }

  // Which items belong on a list page, wherever they currently sit.
  function membersOf(list) {
    if (list === 'month') return items.filter((i) => i.origin === 'month');
    return items.filter((i) => i.origin === 'week' || (i.origin === 'month' && i.list !== 'month'));
  }

  // The one action each list offers: bring the item a step closer to today.
  function stepAction(item, context, scope) {
    const key = `${scope}-step-${item.id}`;
    const button = (label, to, aria) => el('button', {
      type: 'button', class: 'entry-action', dataset: { key }, 'aria-label': `${aria}: ${item.title}`,
      onclick: () => move(item, to, key),
    }, label);
    const status = (label) => el('span', { class: 'entry-action', 'aria-disabled': 'true' }, label);

    if (context === 'today') return item.origin === 'today' ? null : button('Back to week', 'week', 'Move back to this week');
    if (item.list === 'today') return status('On today');
    if (context === 'week') return button('Do today', 'today', 'Do today');
    if (item.list === 'week') return status('In this week');
    return button('This week', 'week', 'Move to this week');
  }

  function move(item, list, focusKey) {
    item.list = list;
    item.fresh = true;
    render(focusKey);
  }

  function noteFor(item, context) {
    if (context === 'today') {
      if (item.origin === 'week') return 'From the week list';
      if (item.origin === 'month') return 'From the month list';
      return item.note;
    }
    if (context === 'week' && item.origin === 'month') return 'From September';
    return null;
  }

  function nextUp() {
    return items
      .filter((i) => i.list === 'today' && i.at !== undefined && !i.done && i.at >= NOW)
      .sort((a, b) => a.at - b.at)[0];
  }

  function todayRows() {
    const timed = items.filter((i) => i.list === 'today' && i.at !== undefined).sort((a, b) => a.at - b.at);
    const anytime = items.filter((i) => i.list === 'today' && i.at === undefined);
    const next = nextUp();
    const rows = [];
    timed.forEach((item, index) => {
      rows.push(entryRow(item, 'today', el('span', {}, item === next ? el('span', { class: 'up-next' }, 'Up next') : null, item.time)));
      const after = timed[index + 1];
      if (after && after.at - item.at >= 240) {
        rows.push(el('li', { class: 'free-gap', 'aria-hidden': 'true' }, `Free until ${after.time}`));
      }
    });
    anytime.forEach((item) => rows.push(entryRow(item, 'today', 'Anytime')));
    return rows;
  }

  function entryRow(item, context, when) {
    const note = noteFor(item, context);
    return el('li', { class: 'demo-entry' + (item.fresh ? ' is-new' : '') },
      context === 'today' ? el('span', { class: 'entry-when' }, when) : null,
      el('label', {},
        checkbox(item, 'main'),
        el('span', { class: 'entry-title' }, item.title, note ? el('span', { class: 'entry-note' }, note) : null)),
      el('span', { class: 'entry-end' },
        context === 'today' && item.kind ? el('span', { class: 'kind' }, item.kind) : null,
        stepAction(item, context, 'main')));
  }

  function renderPanel() {
    const shown = ['week', 'month'].filter((list) => pins[list] && list !== view);
    panel.hidden = shown.length === 0;
    workspace.classList.toggle('pinned', shown.length > 0);
    panel.replaceChildren(...shown.map((list) => {
      const members = membersOf(list);
      const name = LIST_NAMES[list];
      return el('section', { class: 'ref-list', 'aria-label': `Pinned ${name.toLowerCase()}` },
        el('div', { class: 'ref-heading' },
          el('h4', {}, name),
          el('button', {
            type: 'button', class: 'ref-close', 'aria-label': `Unpin ${name.toLowerCase()}`,
            onclick: () => { pins[list] = false; render('pin-' + list); },
          }, '×')),
        el('p', { class: 'ref-date' }, LIST_DATES[list]),
        members.length
          ? el('ul', {}, ...members.map((item) => el('li', { class: 'ref-item' },
              el('label', {}, checkbox(item, 'ref'), el('span', {}, item.title)),
              stepAction(item, list, 'ref'))))
          : el('p', { class: 'ref-empty' }, 'Nothing here yet.'));
    }));
  }

  function render(focusKey) {
    const data = PAGES[view];
    page.setAttribute('aria-labelledby', 'tab-' + view);
    tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    const stamp = page.querySelector('.date-stamp');
    stamp.querySelector('span').textContent = data.stamp[0];
    stamp.querySelector('strong').textContent = data.stamp[1];
    document.getElementById('demo-eyebrow').textContent = data.eyebrow;
    document.getElementById('demo-title').textContent = data.title;
    let subtitle = data.subtitle;
    if (view === 'today') {
      const next = nextUp();
      subtitle = next ? `Next: ${next.title} · ${next.time}` : 'Nothing else scheduled today.';
    }
    document.getElementById('demo-subtitle').textContent = subtitle;

    entries.classList.toggle('is-list', view !== 'today');
    entries.setAttribute('aria-label', view === 'today' ? 'Today’s agenda' : `${data.title} list`);
    entries.replaceChildren(...(view === 'today' ? todayRows() : membersOf(view).map((item) => entryRow(item, view))));
    captureInput.placeholder = data.add;
    document.getElementById('demo-capture-label').textContent = data.label;

    pinButtons.forEach((button) => {
      const list = button.dataset.pin;
      button.setAttribute('aria-pressed', String(pins[list]));
      button.textContent = pins[list] ? `${list === 'week' ? 'Week' : 'Month'} · pinned` : `Pin ${list} list`;
      button.dataset.key = 'pin-' + list;
    });
    renderPanel();

    items.forEach((i) => { i.fresh = false; });
    if (focusKey) document.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { view = tab.dataset.view; render(); });
    tab.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const next = tabs[(keys[event.key] + tabs.length) % tabs.length];
      next.click();
      next.focus();
    });
  });

  pinButtons.forEach((button) => button.addEventListener('click', () => {
    const list = button.dataset.pin;
    pins[list] = !pins[list];
    render('pin-' + list);
  }));

  captureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = captureInput.value.trim();
    if (!title) return;
    if (captured >= 5) {
      captureInput.value = '';
      captureInput.placeholder = 'That’s plenty for a sample page.';
      return;
    }
    captured += 1;
    items.push({ id: 'new-' + captured, list: view, origin: view, title, kind: view === 'today' ? 'Task' : undefined, note: 'Just added', done: false, fresh: true });
    captureInput.value = '';
    render();
    captureInput.focus();
  });

  render();
})();
