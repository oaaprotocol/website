/* OAA launch page background: soft token bubbles with icons, blurred by depth (depth-of-field).
   Each bubble drifts on its own, very slowly, in its own direction, and keeps its distance from the others.
   Near the mouse a bubble wakes up: it sharpens, brightens, grows a little and moves a bit livelier. */
(function () {
  'use strict';
  var cv = document.getElementById('float'); if (!cv) return;
  var x = cv.getContext('2d'), W, H, D, items = [], mx = 0, my = 0, tx = 0, ty = 0;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = 'fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = [
    'logo',
    '<g ' + S + '><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.8 2.2 2.6 3.5 2.6s2.5-.8 3.5-2.6M9 9.7l1.3.9M15 9.7l-1.3.9"/></g>',
    '<g ' + S + '><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M6 18l2.1-2.1M15.9 8.1L18 6"/><circle cx="12" cy="12" r="3"/></g>',
    '<g ' + S + '><path d="M4 20h16M6 20V9.5L12 5l6 4.5V20"/><path d="M10 20v-5h4v5"/></g>',
    '<g ' + S + '><rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M13 8.5l-3 3.7h4l-3 3.6"/></g>',
    '<g ' + S + '><path d="M5 5l3.6 3.6h6.8L19 5v8a7 7 0 01-14 0z"/><path d="M9.5 13h.01M14.5 13h.01M11 15.6h2"/></g>',
    '<g ' + S + '><path d="M6.5 8.5h11a3.6 3.6 0 013.6 3.6l-.9 3.7a2.3 2.3 0 01-4 .9L14.8 15H9.2l-1.4 1.7a2.3 2.3 0 01-4-.9l-.9-3.7a3.6 3.6 0 013.6-3.6z"/><path d="M7.5 11.2v2.8M6.1 12.6h2.8"/></g>',
    '<g ' + S + '><path d="M12 4l8 4.5-8 4.5-8-4.5z"/><path d="M4 13l8 4.5 8-4.5"/></g>',
    '<g ' + S + '><path d="M12 3.5l5.5 8.6L12 15l-5.5-2.9z"/><path d="M6.5 13.6L12 20.5l5.5-6.9L12 16.5z"/></g>',
    '<g ' + S + '><circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2c1.6.3 2.7.9 2.7 2.1s-1.2 2.1-2.7 2.1c-1.2 0-2.2-.5-2.7-1.4M12 6.3v1.6M12 16.3v1.5"/></g>',
    '<g ' + S + '><path d="M4 17l5-5 3.5 3.5L20 8"/><path d="M14.5 8H20v5.5"/></g>',
    '<g ' + S + '><rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></g>'
  ];
  var COINS = window.OAA_COINS || ['aerodrome', 'base', 'ethereum', 'bitcoin', 'uniswap', 'face'].map(function (n) { return '/assets/lp/coins/' + n + '.webp'; });
  var TINTS = [['#7ff3ec', '#1c8f89'], ['#33d1c9', '#0f5f5b'], ['#5ee1ff', '#155f7a'], ['#8fb4ff', '#24406e'], ['#bff7f3', '#2a6f6b']];
  // sprite cache: icon i, tint t, blur level b -> canvas
  var cache = {}, imgs = [];
  function load() {
    var coinImgs = COINS.map(function (u) { var i = new Image(); i.src = u; return i; });
    imgs = ICONS.map(function (g, n) {
      var i = new Image();
      if (n === 0) { i.src = '/assets/lp/oaa-logo.svg'; return i; }
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="96" height="96">' + g + '</svg>');
      return i;
    });
    imgs = imgs.concat(coinImgs);
  }
  function sprite(i, t, b, px) {
    var k = i + '|' + t + '|' + b + '|' + px; if (cache[k]) return cache[k];
    var pad = b * 3 + 4, s = px + pad * 2, c = document.createElement('canvas'); c.width = c.height = s;
    var o = c.getContext('2d'), r = px / 2, cx = s / 2, tint = i === 0 ? ['#14423f', '#04100f'] : TINTS[t];
    if (b) o.filter = 'blur(' + b + 'px)';
    if (i >= ICONS.length) { // partner / ecosystem coin: the logo file is the whole bubble
      var ci = imgs[i]; if (!(ci && ci.complete && ci.naturalWidth)) return null;
      o.drawImage(ci, cx - r, cx - r, px, px);
      o.globalAlpha = .35; o.strokeStyle = 'rgba(255,255,255,.6)'; o.lineWidth = Math.max(1, px / 70); o.beginPath(); o.arc(cx, cx, r - o.lineWidth / 2, 0, 7); o.stroke(); o.globalAlpha = 1;
      cache[k] = c; return c;
    }
    var g = o.createRadialGradient(cx - r * .35, cx - r * .45, r * .1, cx, cx, r);
    g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]);
    o.globalAlpha = .9; o.fillStyle = g; o.beginPath(); o.arc(cx, cx, r, 0, 7); o.fill();
    o.globalAlpha = .55; o.strokeStyle = 'rgba(255,255,255,.55)'; o.lineWidth = Math.max(1, px / 60); o.beginPath(); o.arc(cx, cx, r - o.lineWidth, 0, 7); o.stroke();
    o.globalAlpha = 1;
    var im = imgs[i]; if (im.complete && im.naturalWidth) { var is = px * .56; o.drawImage(im, cx - is / 2, cx - is / 2, is, is); }
    else return null;
    cache[k] = c; return c;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var R = 120; // mouse wake-up radius (px): only bubbles very close to the cursor become sharp
  function build() {
    items = [];
    // only partner / ecosystem logos: aerodrome 0, base 1, ethereum 2, bitcoin 3, uniswap 4, pinksale 5
    var MIX = [1, 2, 0, 3, 1, 2, 4, 0, 3, 1, 2, 5];
    var n = W * H > 700000 ? MIX.length : 7;
    var wide = W > 900, half = Math.min(400, W * .3);
    var seen = {}, sideCount = [0, 0];
    for (var k = 0; k < n; k++) {
      var L = MIX[k], occ = seen[L] = (seen[L] || 0) + 1;
      // copies of the same logo go to opposite sides; the sides stay balanced
      var side = occ === 1 ? (sideCount[0] <= sideCount[1] ? 0 : 1) : 1 - items.filter(function (o) { return o.L === L; }).slice(-1)[0].side;
      sideCount[side]++;
      var zone = wide ? (side === 0 ? [24, W / 2 - half - 10] : [W / 2 + half + 10, W - 24]) : (side === 0 ? [16, W / 2] : [W / 2, W - 16]);
      var best = null, bestD = -1;
      for (var c = 0; c < 60; c++) { // best-candidate sampling inside the zone, same logos count as "closer" so they spread further
        var px = rnd(zone[0], zone[1]), py = rnd(40, H - 40);
        var d = items.reduce(function (m, o) { var dd = Math.hypot(o.x - px, o.y - py); return Math.min(m, o.L === L ? dd * .45 : dd); }, 1e9);
        if (d > bestD) { bestD = d; best = [px, py]; }
      }
      var z = rnd(.35, 1);
      items.push({ x: best[0], y: best[1], z: z, L: L, side: side, zone: zone, size: 40 + z * 48 * (W < 700 ? .7 : 1), blur: z > .75 ? 3 : z > .55 ? 5 : 7,
        alpha: .28 + z * .3, dir: rnd(0, 6.283), sp: rnd(2, 5) * (.5 + z * .6), turn: rnd(-.08, .08), ph: rnd(0, 6.28),
        i: ICONS.length + L % COINS.length, t: 0, a: 0, vx: 0, vy: 0 });
    }
    items.sort(function (a, b) { return a.z - b.z; });
  }
  function size() { D = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); x.setTransform(D, 0, 0, D, 0, 0); build(); }
  mx = -9999; my = -9999;
  addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  addEventListener('pointerleave', function () { mx = my = -9999; });
  document.addEventListener('mouseleave', function () { mx = my = -9999; });
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    x.clearRect(0, 0, W, H);
    // below the launch window the bubbles stay very faint in the background
    var fade = Math.max(.2, 1 - Math.max(0, scrollY - H * .35) / (H * .6));
    if (fade !== frame._f) { cv.style.opacity = fade.toFixed(3); frame._f = fade; }
    for (var k = 0; k < items.length; k++) {
      var o = items[k];
      // wake-up near the cursor (only for bubbles in the middle and front)
      var dm = Math.hypot(mx - o.x, my - o.y), target = dm < R ? Math.min(1, Math.pow(1 - dm / R, 1.1) * 1.4) : 0;
      o.a += (target - o.a) * Math.min(1, dt * 4);
      if (!reduce) {
        // own slow heading that wanders a little
        o.dir += (o.turn + Math.sin(now / 7000 + o.ph) * .05) * dt;
        var sp = o.sp * (1 + o.a * 1.6);
        var ax = Math.cos(o.dir) * sp, ay = Math.sin(o.dir) * sp;
        // keep a polite distance from the other bubbles
        for (var j = 0; j < items.length; j++) {
          if (j === k) continue; var q = items[j], dx = o.x - q.x, dy = o.y - q.y, dd = Math.hypot(dx, dy), lim = o.L === q.L ? 360 : (o.size + q.size) * .8;
          if (dd > 0 && dd < lim) { var f = (1 - dd / lim) * 14; ax += dx / dd * f; ay += dy / dd * f; }
        }
        // a gentle nudge away from the cursor when awake
        if (o.a > .01 && dm > 1) { ax += (o.x - mx) / dm * 3 * o.a; ay += (o.y - my) / dm * 3 * o.a; }
        o.vx += (ax - o.vx) * Math.min(1, dt * 1.5); o.vy += (ay - o.vy) * Math.min(1, dt * 1.5);
        o.x += o.vx * dt; o.y += o.vy * dt;
        // stay inside the own side zone: turn back softly near its edges (no jumping across the screen)
        var z0 = o.zone, mg = o.size * .6;
        if (o.x < z0[0] + mg) o.vx += (z0[0] + mg - o.x) * dt * 2; if (o.x > z0[1] - mg) o.vx -= (o.x - z0[1] + mg) * dt * 2;
        if (o.y < mg) o.vy += (mg - o.y) * dt * 2; if (o.y > H - mg) o.vy -= (o.y - H + mg) * dt * 2;
        if ((o.x < z0[0] + mg && Math.cos(o.dir) < 0) || (o.x > z0[1] - mg && Math.cos(o.dir) > 0)) o.dir = Math.PI - o.dir;
        if ((o.y < mg && Math.sin(o.dir) < 0) || (o.y > H - mg && Math.sin(o.dir) > 0)) o.dir = -o.dir;
      }
      var bob = reduce ? 0 : Math.sin(now / 3200 + o.ph) * 3 * (.6 + o.z) * (1 + o.a);
      var ox = o.x, oy = o.y + bob, sc = 1 + o.a * .18;
      var soft = sprite(o.i, o.t, o.blur, Math.round(o.size)); if (!soft) continue;
      var alpha = Math.min(1, o.alpha + o.a * .7);
      if (o.blur && o.a > .02) {
        var sharp = sprite(o.i, o.t, 0, Math.round(o.size)); if (!sharp) continue;
        var s1 = soft.width / D * sc, s2 = sharp.width / D * sc;
        x.globalAlpha = alpha * (1 - o.a); x.drawImage(soft, ox - s1 / 2, oy - s1 / 2, s1, s1);
        x.globalAlpha = alpha * o.a; x.drawImage(sharp, ox - s2 / 2, oy - s2 / 2, s2, s2);
      } else {
        var s0 = soft.width / D * sc; x.globalAlpha = alpha; x.drawImage(soft, ox - s0 / 2, oy - s0 / 2, s0, s0);
      }
      if (o.a > .05) { // soft halo when awake
        var g = x.createRadialGradient(ox, oy, o.size * .4 * sc, ox, oy, o.size * .9 * sc);
        g.addColorStop(0, 'rgba(127,243,236,' + (.18 * o.a) + ')'); g.addColorStop(1, 'rgba(127,243,236,0)');
        x.globalAlpha = 1; x.fillStyle = g; x.beginPath(); x.arc(ox, oy, o.size * .9 * sc, 0, 7); x.fill();
      }
    }
    x.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  // sprites are drawn at device resolution
  var _sprite = sprite; sprite = function (i, t, b, px) { return _sprite(i, t, Math.round(b * D), Math.round(px * D)); };
  load(); size(); addEventListener('resize', size);
  requestAnimationFrame(frame);
})();
