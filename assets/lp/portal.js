/* OAA Portal: live list of tokens launched on OAA (Base). Data: OAA launchpad contract (via Sia), DexScreener for volume. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); }, esc = L.esc, I = L.ICON;
  var CATS = [{ id: 'all', name: 'All tokens', c: '#7ff3ec' }].concat(L.CATS), CM = {};
  CATS.forEach(function (c) { CM[c.id] = c; });
  var T = [], ADS = [], GR = {}, cur = 'all', view = 'all', q = '', sortK = 'vol', asc = false, tf = 'h24', stats = null;

  // ---------------------------------------------------------------- helpers
  function avatar(t, s) {
    var c = CM[t.category] ? CM[t.category].c : '#7ff3ec', st = s ? ';width:' + s + 'px;height:' + s + 'px;flex-basis:' + s + 'px' : '';
    if (t.logo) return '<span class="av img" style="background-image:url(' + esc(t.logo) + ')' + st + '">' + esc(t.symbol.slice(0, 2)) + '</span>';
    return '<span class="av" style="background:linear-gradient(135deg,' + c + ',color-mix(in srgb,' + c + ' 45%,#0b1416))' + st + '">' + esc((t.symbol || '?').slice(0, 2)) + '</span>';
  }
  function chip(t) { var c = CM[t.category] || CATS[1]; return '<span class="chip" style="--c:' + c.c + '">' + I[c.id] + c.name + '</span>'; }
  function chg(t) { return t.chg ? t.chg[tf] : null; }
  function vol(t) { return t.vol ? t.vol[tf] : 0; }
  function cls(n) { return n == null ? '' : n >= 0 ? 'up' : 'down'; }
  function boostOf(t) { var b = 0; ADS.forEach(function (a) { if (a.token === t.address.toLowerCase() && a.boost) b += a.boost; }); return b; }
  function grade(t) { var g = GR[t.address.toLowerCase()]; return g && g.grade ? g.grade : null; }
  function gradeHtml(t) { var g = grade(t); return g ? '<span class="g g' + g + '">' + g + '</span>' : '<span class="g" title="Sentinel check pending" style="opacity:.45">…</span>'; }

  // ---------------------------------------------------------------- data
  async function load() {
    var r = await Promise.all([L.api('/lp/tokens'), L.api('/lp/stats'), L.api('/ads')]).catch(function () { return [{}, {}, {}]; });
    var list = (r[0] && r[0].tokens) || [];
    stats = r[1] && !r[1].error ? r[1] : null;
    ADS = (r[2] && r[2].ads) || [];
    var old = {}; T.forEach(function (t) { old[t.address.toLowerCase()] = t; });
    T = list.map(function (t) { var o = old[t.address.toLowerCase()]; if (o) { t.vol = o.vol; t.chg = o.chg; t.liq = o.liq; t.txns = o.txns; t.dexPrice = o.dexPrice; t.dexMc = o.dexMc; } return t; });
    await dex();
    render(); kpis(); champ(); ticker(); ads(); grades(); route();
  }
  async function dex() {
    for (var i = 0; i < T.length; i += 30) {
      var chunk = T.slice(i, i + 30);
      try {
        var res = await fetch('https://api.dexscreener.com/tokens/v1/base/' + chunk.map(function (t) { return t.address; }).join(',')).then(function (x) { return x.json(); });
        (Array.isArray(res) ? res : []).forEach(function (p) {
          if (!p || !p.baseToken || !p.pairAddress) return;
          var t = chunk.filter(function (x) { return x.address.toLowerCase() === String(p.baseToken.address).toLowerCase(); })[0];
          if (!t || String(p.pairAddress).toLowerCase() !== String(t.pool).toLowerCase()) return; // only the locked OAA pool
          t.vol = { h1: +(p.volume && p.volume.h1) || 0, h6: +(p.volume && p.volume.h6) || 0, h24: +(p.volume && p.volume.h24) || 0 };
          t.chg = { h1: p.priceChange ? +p.priceChange.h1 : null, h6: p.priceChange ? +p.priceChange.h6 : null, h24: p.priceChange ? +p.priceChange.h24 : null };
          t.liq = p.liquidity ? +p.liquidity.usd : null;
          t.txns = p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : 0;
          t.dexPrice = +p.priceUsd || null; t.dexMc = +p.marketCap || +p.fdv || null;
        });
      } catch (e) {}
    }
  }
  function price(t) { return t.dexPrice || t.priceUsd; }
  function mc(t) { return t.dexMc || t.mcUsd; }
  async function grades() {
    var need = rows().slice(0, 40).filter(function (t) { return !GR[t.address.toLowerCase()]; });
    for (var i = 0; i < need.length; i += 4) {
      await Promise.all(need.slice(i, i + 4).map(function (t) {
        return L.api('/lp/grade?token=' + t.address).then(function (g) { if (g && g.grade) { GR[t.address.toLowerCase()] = g; } }).catch(function () {});
      }));
      render(); champ();
    }
  }

  // ---------------------------------------------------------------- KPIs
  function kpis() {
    var v = T.reduce(function (a, t) { return a + (t.vol ? t.vol.h24 : 0); }, 0), day = T.filter(function (t) { return Date.now() / 1000 - t.launchedAt < 86400; }).length;
    $('#kTok').textContent = T.length.toLocaleString('en-US');
    $('#kTok2').textContent = day ? '+' + day + ' today' : 'launched on OAA';
    $('#kVol').textContent = L.fmtUsd(v);
    $('#kBurn').textContent = (stats && stats.feesWeth ? (stats.feesWeth * 0.4).toFixed(stats.feesWeth * 0.4 >= 1 ? 2 : 4) : '0') + ' ETH';
  }

  // ---------------------------------------------------------------- categories
  var cats = $('#cats');
  function catsUi() {
    cats.innerHTML = '';
    CATS.forEach(function (c) {
      var n = c.id === 'all' ? T.length : T.filter(function (t) { return t.category === c.id; }).length, b = document.createElement('button');
      b.className = 'cat'; b.type = 'button'; b.style.setProperty('--c', c.c); b.setAttribute('aria-pressed', c.id === cur); b.dataset.c = c.id;
      b.innerHTML = '<span class="ic">' + I[c.id] + '</span><span><b>' + c.name + '</b><small>' + n + ' token' + (n === 1 ? '' : 's') + '</small></span>';
      b.onclick = function () { cur = c.id; catsUi(); render(); };
      cats.appendChild(b);
    });
  }

  // ---------------------------------------------------------------- highlight lists
  function mini(el, list, right, emptyTxt) {
    $(el).innerHTML = list.length ? list.map(function (t) {
      return '<a href="#' + t.address + '" data-a="' + t.address + '">' + avatar(t, 28) + '<span><b>' + esc(t.symbol) + '</b><small>' + esc(t.name) + ' · ' + (CM[t.category] || CATS[1]).name + '</small></span>' + right(t) + '</a>';
    }).join('') : '<p class="ch-empty" style="padding:10px 4px;margin:0">' + emptyTxt + '</p>';
  }
  function highlights() {
    mini('#m1', T.filter(function (t) { return t.vol && t.vol.h24 > 0; }).sort(function (a, b) { return b.vol.h24 - a.vol.h24; }).slice(0, 4), function (t) { return '<span class="chg ' + cls(t.chg && t.chg.h24) + '">' + L.fmtPct(t.chg && t.chg.h24) + '</span>'; }, 'No trading yet.');
    mini('#m2', T.slice().sort(function (a, b) { return b.launchedAt - a.launchedAt; }).slice(0, 4), function (t) { return '<span class="chg" style="color:var(--muted)">' + L.fmtAge(t.launchedAt) + ' ago</span>'; }, 'No launches yet.');
    mini('#m3', T.filter(function (t) { return t.chg && t.chg.h24 > 0; }).sort(function (a, b) { return b.chg.h24 - a.chg.h24; }).slice(0, 4), function (t) { return '<span class="chg up">' + L.fmtPct(t.chg.h24) + '</span>'; }, 'No gainers yet.');
  }

  // ---------------------------------------------------------------- table
  function rows() {
    var r = T.filter(function (t) {
      if (cur !== 'all' && t.category !== cur) return false;
      if (q && (t.name + ' ' + t.symbol + ' ' + t.address).toLowerCase().indexOf(q) < 0) return false;
      if (view === 'new') return Date.now() / 1000 - t.launchedAt < 86400 * 3;
      if (view === 'gain') return chg(t) > 0;
      if (view === 'boost') return boostOf(t) > 0;
      if (view === 'safe') return grade(t) === 'A';
      return true;
    });
    var k = view === 'trend' ? 'trend' : view === 'new' ? 'age' : view === 'gain' ? 'chg' : view === 'boost' ? 'boost' : sortK;
    var val = {
      vol: vol, mc: mc, price: price, liq: function (t) { return t.liq || 0; }, txns: function (t) { return t.txns || 0; }, chg: function (t) { return chg(t) || 0; },
      age: function (t) { return t.launchedAt; }, boost: boostOf, grade: function (t) { return 'FDCBA'.indexOf(grade(t) || 'X'); },
      trend: function (t) { return vol(t) * (1 + boostOf(t) / 50); }, name: function (t) { return t.name.toLowerCase(); }, cat: function (t) { return t.category; }, rank: vol
    }[k] || vol;
    r.sort(function (a, b) { var x = val(a), y = val(b); if (typeof x === 'string') return asc ? x.localeCompare(y) : y.localeCompare(x); return asc ? x - y : y - x; });
    return r;
  }
  var tb = $('#tb');
  function render() {
    catsUi(); highlights();
    var r = rows(), em = $('#empty');
    $('#cnt').textContent = r.length + ' token' + (r.length === 1 ? '' : 's') + (T.length ? ' · live' : '');
    if (!r.length) {
      tb.innerHTML = ''; em.hidden = false;
      em.innerHTML = T.length ? '<b>No token matches.</b>Try another category or search.' : '<b>No tokens launched yet.</b>The launchpad opens with the $OAA launch on 25 November 2026. Every token launched on OAA appears here automatically.<br><a class="btn btn-p" href="/launch/">Launch a token</a>';
      return;
    }
    em.hidden = true;
    tb.innerHTML = r.map(function (t, i) {
      var b = boostOf(t), c = chg(t);
      return '<tr class="r' + (b ? ' bst' : '') + '" data-a="' + t.address + '"><td style="color:var(--faint)">' + (i + 1) + '</td>' +
        '<td><span class="tok">' + avatar(t) + '<span><b>' + esc(t.symbol) + '</b><small>' + esc(t.name) + '</small>' + (Date.now() / 1000 - t.launchedAt < 3600 ? '<span class="new">NEW</span>' : '') + '</span></span></td>' +
        '<td class="hide-m">' + (b ? '<span class="boost" title="Paid boost"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>' + b + '</span>' : '') + '</td>' +
        '<td class="hide-m">' + chip(t) + '</td><td>' + L.fmtPrice(price(t)) + '</td><td class="chg ' + cls(c) + '">' + L.fmtPct(c) + '</td>' +
        '<td class="hide-m">' + L.fmtUsd(vol(t)) + '</td><td class="hide-m">' + L.fmtUsd(t.liq) + '</td><td class="hide-m">' + L.fmtUsd(mc(t)) + '</td>' +
        '<td>' + gradeHtml(t) + '</td><td class="hide-m"><span class="lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>100%</span></td>' +
        '<td class="hide-m" style="color:var(--muted)">' + L.fmtAge(t.launchedAt) + '</td><td class="hide-m"><button class="rbuy" type="button" data-buy="1">Buy</button></td></tr>';
    }).join('');
  }
  document.querySelectorAll('th[data-k]').forEach(function (th) {
    th.onclick = function () { var k = th.dataset.k; asc = sortK === k ? !asc : false; sortK = k; view = 'all'; sideUi(); document.querySelectorAll('th').forEach(function (x) { x.classList.remove('s', 'asc'); }); th.classList.add('s'); if (asc) th.classList.add('asc'); render(); };
  });
  document.querySelectorAll('#sortq button').forEach(function (b) {
    var map = { vol: 'vol', mc: 'mc', age: 'age', grade: 'grade' };
    b.onclick = function () { sortK = map[b.dataset.s]; asc = false; view = 'all'; sideUi(); document.querySelectorAll('#sortq button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); render(); };
  });
  document.querySelectorAll('#tf button').forEach(function (b) { b.onclick = function () { tf = b.dataset.t; document.querySelectorAll('#tf button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); render(); }; });
  function sideUi() { document.querySelectorAll('.sl[data-v]').forEach(function (a) { a.classList.toggle('on', a.dataset.v === view); }); }
  document.querySelectorAll('.sl[data-v]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); view = a.dataset.v; sideUi(); document.body.classList.remove('nav'); render(); $('#tb').closest('.tbl').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
  var qi = $('#q'); qi.oninput = function () { q = qi.value.trim().toLowerCase(); render(); };
  document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement !== qi && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); qi.focus(); } if (e.key === 'Escape') { closeDr(); mdl.classList.remove('on'); } });
  $('#ham').onclick = function () { document.body.classList.toggle('nav'); };
  $('#scrim').onclick = function () { document.body.classList.remove('nav'); };
  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-a]'); if (!r || e.target.closest('.pn')) return;
    e.preventDefault(); var t = find(r.dataset.a); if (t) { location.hash = t.address; openTok(t, !!e.target.closest('[data-buy]')); }
  });
  function find(a) { a = String(a || '').toLowerCase(); return T.filter(function (t) { return t.address.toLowerCase() === a; })[0]; }
  function route() { var h = location.hash.slice(1); if (L.isAddr(h)) { var t = find(h); if (t && !dr.classList.contains('on')) openTok(t); } }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- ticker
  function ticker() {
    var list = T.slice().sort(function (a, b) { return vol(b) - vol(a); }).slice(0, 16), el = $('#tick');
    if (!list.length) { el.innerHTML = '<span><b>OAA Portal</b>Every launch with 100% locked liquidity</span><span><b>Base</b>live</span><span><b>Launchpad</b>opens 25 Nov 2026</span>'; el.innerHTML += el.innerHTML; return; }
    var h = list.map(function (t) { var c = t.chg ? t.chg.h24 : null; return '<span>' + avatar(t, 18) + '<b>' + esc(t.symbol) + '</b>' + L.fmtPrice(price(t)) + ' <em class="chg ' + cls(c) + '" style="font-style:normal">' + L.fmtPct(c) + '</em></span>'; }).join('');
    el.innerHTML = h + h;
  }

  // ---------------------------------------------------------------- champion (most traded, cannot be bought)
  function champ() {
    var c = T.filter(function (t) { return t.vol && t.vol.h24 > 0; }).sort(function (a, b) { return b.vol.h24 - a.vol.h24; })[0], info = $('#chInfo');
    if (!c) {
      $('#coinA').textContent = 'OAA';
      info.innerHTML = '<h2>Most traded<small>updated live from real trading volume</small></h2><p class="ch-empty">The token with the highest 24 h volume on OAA takes this spot. It cannot be bought.</p><div class="ch-acts"><a class="btn btn-p" href="/launch/">Launch a token</a></div>';
      return;
    }
    var cc = (CM[c.category] || CATS[1]).c;
    $('#coin').style.setProperty('--cc', cc); $('#coinA').textContent = c.symbol.slice(0, 4);
    info.innerHTML = '<div style="display:flex;align-items:center;gap:10px">' + avatar(c, 40) + chip(c) + '</div><h2>' + esc(c.name) + '<small>' + esc(c.symbol) + ' · ' + L.fmtPrice(price(c)) + ' <span class="chg ' + cls(c.chg && c.chg.h24) + '">' + L.fmtPct(c.chg && c.chg.h24) + '</span></small></h2>' +
      '<div class="ch-num"><div><span>Volume 24h</span><b>' + L.fmtUsd(c.vol.h24) + '</b></div><div><span>Market cap</span><b>' + L.fmtUsd(mc(c)) + '</b></div><div><span>Txns 24h</span><b>' + (c.txns || 0).toLocaleString('en-US') + '</b></div><div><span>Sentinel</span><b>' + gradeHtml(c) + '</b></div></div>' +
      '<div class="ch-acts"><button class="btn btn-p" type="button" data-a="' + c.address + '">Open token</button><button class="btn" type="button" data-a="' + c.address + '" data-buy="1">Buy ' + esc(c.symbol) + '</button></div><p class="ch-rule">Picked automatically by real 24 h trading volume. This spot cannot be bought.</p>';
  }

  // ---------------------------------------------------------------- top ads: 3 rotating slots
  var HOUSE = [
    { h: 'Your token here', p: 'Banner ads for tokens launched on OAA. Paid in ETH, clearly marked.', act: 'adv' },
    { h: 'Launch on OAA', p: '100% liquidity locked forever. You earn 0.4% of every trade.', href: '/launch/' },
    { h: 'Hire SI Agents', p: 'Sentinel, Guardian, Radar and more. Pay per job in USDC or ETH.', href: '/#agentverse' }
  ];
  var adTimers = [];
  function ads() {
    adTimers.forEach(clearInterval); adTimers = [];
    var pool = ADS.filter(function (a) { return a.banner; }).map(function (a) { var t = find(a.token); return t ? { t: t } : null; }).filter(Boolean);
    while (pool.length < 3) pool.push({ house: HOUSE[pool.length % 3] });
    if (pool.length > 3 && pool.length < 6) pool = pool.concat(HOUSE.slice(0, 6 - pool.length).map(function (h) { return { house: h }; }));
    var box = $('#ads3'); box.innerHTML = '';
    function face(it) {
      var f = document.createElement('div');
      if (it.house) {
        f.className = 'face house'; f.style.setProperty('--c', '#33d1c9');
        f.innerHTML = '<span class="av" style="background:linear-gradient(135deg,#33d1c9,#0b1416)"><img src="/assets/lp/oaa-logo.svg" alt="" style="width:70%;height:70%;margin:15%"></span><div><h4>' + it.house.h + '</h4><p>' + it.house.p + '</p></div>';
        f.dataset.house = it.house.act || ''; if (it.house.href) f.dataset.href = it.house.href;
      } else {
        var t = it.t; f.className = 'face'; f.style.setProperty('--c', (CM[t.category] || CATS[1]).c); f.dataset.a = t.address;
        f.innerHTML = avatar(t) + '<div><h4>' + esc(t.name) + ' <small style="font:600 11px var(--body);color:var(--faint)">' + esc(t.symbol) + '</small></h4><p>' + esc((t.description || 'Launched on OAA · 100% LP locked').slice(0, 80)) + '</p></div>';
      }
      return f;
    }
    for (var k = 0; k < 3; k++) {
      var a = document.createElement('div'); a.className = 'ad3';
      a.innerHTML = '<span class="ad-tag">' + (pool[k].house ? 'OAA' : 'AD') + '</span><span class="bar" style="--d:' + (k * 2) + 's"></span>';
      a.appendChild(face(pool[k])); a.dataset.p = k; box.appendChild(a);
      if (pool.length > 3) (function (a, k) {
        setTimeout(function () {
          adTimers.push(setInterval(function () {
            var n = (+a.dataset.p + 3) % pool.length; a.dataset.p = n;
            var old = a.querySelector('.face:not(.out)'), f = face(pool[n]); f.classList.add('in0'); a.appendChild(f);
            a.querySelector('.ad-tag').textContent = pool[n].house ? 'OAA' : 'AD';
            requestAnimationFrame(function () { requestAnimationFrame(function () { f.classList.remove('in0'); if (old) old.classList.add('out'); }); });
            setTimeout(function () { if (old) old.remove(); }, 800);
          }, 6000));
        }, k * 2000);
      })(a, k);
    }
  }
  $('#ads3').addEventListener('click', function (e) {
    var f = e.target.closest('.face'); if (!f) return;
    if (f.dataset.house === 'adv') { e.preventDefault(); openAdv(); } else if (f.dataset.href) location.href = f.dataset.href;
  });

  // ---------------------------------------------------------------- advertise (ETH on Base -> Treasury Safe)
  var mdl = $('#mdl'), plan = 'boost30';
  function openAdv(tok) { mdl.classList.add('on'); if (tok) $('#adTok').value = tok; quote(); }
  ['#topAdv', '#sideAdv', '#advCta'].forEach(function (id) { var el = $(id); if (el) el.onclick = function (e) { e.preventDefault(); document.body.classList.remove('nav'); openAdv(); }; });
  $('#mdlX').onclick = function () { mdl.classList.remove('on'); };
  mdl.onclick = function (e) { if (e.target === mdl) mdl.classList.remove('on'); };
  mdl.querySelectorAll('.plan').forEach(function (p) {
    var pick = function () { plan = p.dataset.p; mdl.querySelectorAll('.plan').forEach(function (x) { x.setAttribute('aria-checked', x === p); }); quote(); };
    p.onclick = pick; p.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });
  var lastQ = null;
  async function quote() {
    $('#adQ').textContent = 'Getting the ETH price…';
    var r = await L.api('/ads/quote?plan=' + plan).catch(function () { return null; });
    if (!r || r.error || !r.valueWei) { lastQ = null; $('#adQ').textContent = 'Advertising opens together with the launchpad.'; return; }
    lastQ = r; $('#adQ').textContent = r.plan.name + ': $' + r.usd + ' ≈ ' + r.eth.toFixed(6) + ' ETH (ETH $' + r.ethUsd + ').';
  }
  function adStat(k, h) { $('#adStat').className = 'st-line on' + (k ? ' ' + k : ''); $('#adStatT').innerHTML = h; }
  var adBusy = false;
  $('#adPay').onclick = async function () {
    if (adBusy) return;
    var tok = $('#adTok').value.trim();
    if (!L.isAddr(tok)) return adStat('err', 'Enter the address of a token launched on OAA.');
    if (!find(tok)) return adStat('err', 'Only tokens launched on OAA can be advertised. This address is not in the list.');
    if (!lastQ) await quote();
    if (!lastQ) return adStat('err', 'Advertising is not open yet.');
    adBusy = true;
    try {
      adStat('', 'Connect your wallet…');
      await L.connect();
      await quote();
      adStat('', 'Confirm the payment of ' + lastQ.eth.toFixed(6) + ' ETH to the OAA Treasury in your wallet…');
      var hash = await L.sendTx({ to: lastQ.to, value: lastQ.valueHex });
      adStat('', 'Payment sent. Waiting for Base… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view</a>');
      await L.waitReceipt(hash);
      for (var i = 0; i < 20; i++) {
        var r = await L.api('/ads/buy?plan=' + plan + '&token=' + tok + '&tx=' + hash, { method: 'POST' });
        if (r && r.ok) { adStat('ok', 'Done. Your placement is live until ' + new Date(r.ad.until).toLocaleString() + '.'); load(); return; }
        if (!r || r.error !== 'pending') throw new Error((r && r.detail) || 'The placement could not be activated. Keep your transaction hash ' + hash + ' and contact support.');
        await L.sleep(3000);
      }
      throw new Error('The payment is still being confirmed. Keep your transaction hash ' + hash + ' and contact support if the placement does not appear.');
    } catch (e) { adStat('err', esc(L.errText(e))); }
    finally { adBusy = false; }
  };

  // ---------------------------------------------------------------- wallet
  var wb = $('#wBtn');
  L.onAccount(function (a) { wb.classList.toggle('on', !!a); $('#wTxt').textContent = a ? L.short(a) : 'Connect wallet'; });
  wb.onclick = function () { L.connect().catch(function (e) { if (e.message !== 'cancelled') alertLine(L.errText(e)); }); };
  function alertLine(m) { var b = $('#buyStat'); if (b) { b.className = 'st-line on err'; $('#buyStatT').textContent = m; } }

  // ---------------------------------------------------------------- token drawer
  var dr = $('#dr'), pn = $('#pn'); dr.querySelector('.scrim').onclick = closeDr;
  function closeDr() { if (!dr.classList.contains('on')) return; dr.classList.remove('on'); if (L.isAddr(location.hash.slice(1))) history.replaceState(null, '', location.pathname); }
  function link(u, label) { return u ? '<a class="btn" href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + label + '</a>' : ''; }
  function openTok(t, toBuy) {
    var c = t.chg ? t.chg.h24 : null, g = GR[t.address.toLowerCase()];
    pn.innerHTML = '<button class="x" type="button" aria-label="Close" id="drX">✕</button>' +
      '<div class="ph">' + avatar(t, 54) + '<div><h2>' + esc(t.name) + '</h2><p>' + esc(t.symbol) + ' · ' + chip(t) + '</p></div></div>' +
      '<div class="price"><b>' + L.fmtPrice(price(t)) + '</b><span class="chg ' + cls(c) + '">' + L.fmtPct(c) + ' 24h</span></div>' +
      (t.description ? '<p style="color:var(--muted);font-size:13.5px;margin:0 0 14px">' + esc(t.description) + '</p>' : '') +
      '<div class="buy" id="buyBox"><div class="buy-r"><input id="buyIn" value="0.01" inputmode="decimal" aria-label="Amount in ETH"><span><span class="ci" style="width:20px;height:20px;border-radius:50%;background:#627eea;display:inline-block"></span>ETH</span></div>' +
      '<div class="buy-q"><button type="button" data-v="0.005">0.005</button><button type="button" data-v="0.01">0.01</button><button type="button" data-v="0.05">0.05</button><button type="button" data-v="0.1">0.1</button></div>' +
      '<div class="buy-get"><span>You receive about</span><b id="buyOut">—</b></div><button class="btn btn-p" type="button" id="buyGo">Buy ' + esc(t.symbol) + '</button>' +
      '<div class="st-line" id="buyStat" role="status" aria-live="polite"><i></i><span id="buyStatT"></span></div>' +
      '<small>Swap on Aerodrome (Base) · 1% trading fee · max 2% slippage · your wallet confirms</small></div>' +
      '<iframe class="dex" loading="lazy" title="Price chart" src="https://dexscreener.com/base/' + t.pool + '?embed=1&theme=dark&trades=0&info=0"></iframe>' +
      '<div class="grid2" style="margin-top:14px"><div><span>Market cap</span><b>' + L.fmtUsd(mc(t)) + '</b></div><div><span>Liquidity</span><b>' + L.fmtUsd(t.liq) + '</b></div><div><span>Volume 24h</span><b>' + L.fmtUsd(t.vol ? t.vol.h24 : 0) + '</b></div><div><span>Launched</span><b>' + L.fmtAge(t.launchedAt) + ' ago</b></div></div>' +
      '<p class="sec">Launched on OAA</p><ul class="checks"><li><i></i><div><b>100% of liquidity locked forever</b><br><small style="color:var(--muted)">Three Aerodrome positions held by the launchpad contract. Nobody can remove them.</small></div></li>' +
      '<li><i></i><div><b>Launched on OAA \u00b7 name tag \u201cby OAA\u201d</b><br><small style="color:var(--muted)">Created by the OAA launchpad contract. The tag is part of the on-chain name.</small></div></li>' +
      '<li><i></i><div><b>Fixed supply, no mint, no token tax</b><br><small style="color:var(--muted)">1,000,000,000 tokens. The creator could buy first, max $500.</small></div></li>' +
      '<li><i></i><div><b>Sentinel grade ' + (g ? '<span class="g g' + g.grade + '">' + g.grade + '</span>' : 'pending') + '</b><br><small style="color:var(--muted)">Automatic check of public on-chain data. Not an audit, not financial advice.</small></div></li></ul>' +
      '<p class="sec">Where the 1% trading fee goes</p><div class="split"><i style="width:40%;background:#7ff3ec"></i><i style="width:60%;background:#33d1c9"></i></div><div class="lg"><span>0.4% creator</span><span>0.6% OAA Treasury</span></div>' +
      '<div class="acts" style="flex-wrap:wrap">' + link('https://basescan.org/token/' + t.address, 'BaseScan') + link('https://dexscreener.com/base/' + t.pool, 'DexScreener') + link('https://aerodrome.finance/swap?from=' + t.address + '&to=eth', 'Sell on Aerodrome') + link(t.website, 'Website') + link(t.x, 'X') + link(t.telegram, 'Telegram') + '<button class="btn" type="button" id="advThis">Advertise</button><button class="btn" type="button" id="colThis" title="Pays out the collected trading fees: 0.4% to the creator, 0.6% to the OAA Treasury">Collect fees</button></div><div class="st-line" id="colStat"><i></i><span id="colStatT"></span></div>' +
      '<p style="color:var(--faint);font-size:11.5px;margin-top:14px;word-break:break-all">Contract ' + esc(t.address) + '<br>Creator ' + esc(t.creator) + '</p>';
    dr.classList.add('on');
    $('#drX').onclick = closeDr;
    $('#advThis').onclick = function () { closeDr(); openAdv(t.address); };
    $('#colThis').onclick = async function () {
      var st = $('#colStat'), S = function (k, h) { st.className = 'st-line on' + (k ? ' ' + k : ''); $('#colStatT').innerHTML = h; };
      try {
        var a = await L.connect(), data = '0xa480ca79' + L.encAddr(t.address), lpA = L.CFG.launchpad;
        if (!lpA) throw new Error('The launchpad is not live yet.');
        var g = await L.rpc('eth_estimateGas', [{ from: a, to: lpA, data: data }]);
        S('', 'Confirm in your wallet\u2026');
        var hash = await L.sendTx({ to: lpA, data: data, gas: '0x' + (BigInt(g) * 3n / 2n + 300000n).toString(16) });
        var rc = await L.waitReceipt(hash);
        if (rc.status !== '0x1') throw new Error('The transaction failed on-chain.');
        S('ok', 'Fees collected and split. <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view</a>');
      } catch (e) { S('err', esc(L.errText(e))); }
    };
    var bi = $('#buyIn'), bo = $('#buyOut'), seq = 0;
    var upd = async function () {
      var w = L.toWei(bi.value), my = ++seq;
      if (!w) { bo.textContent = '—'; return; }
      var p = price(t), eu = t.priceEth;
      bo.textContent = eu ? '≈ ' + L.fmtNum(Number(w) / 1e18 / eu * 0.99) + ' ' + t.symbol : '…';
      await L.sleep(350); if (my !== seq) return;
      var qv = await L.quoteBuy(t.address, w); if (my !== seq) return;
      if (qv != null) bo.textContent = L.fmtNum(Number(qv) / 1e18) + ' ' + t.symbol;
    };
    upd(); bi.oninput = upd;
    pn.querySelectorAll('.buy-q button').forEach(function (b) { b.onclick = function () { bi.value = b.dataset.v; upd(); }; });
    var busy = false;
    $('#buyGo').onclick = async function () {
      if (busy) return; var w = L.toWei(bi.value), st = $('#buyStat'), sT = $('#buyStatT');
      var S = function (k, h) { st.className = 'st-line on' + (k ? ' ' + k : ''); sT.innerHTML = h; };
      if (!w) return S('err', 'Enter an amount in ETH.');
      busy = true;
      try {
        S('', 'Connect your wallet…');
        var a = await L.connect();
        if (await L.balance(a) < w + 10n ** 14n) throw new Error('Not enough ETH on Base for this amount plus the network fee.');
        S('', 'Confirm the swap in your wallet…');
        var r = await L.buy(t.address, w, 200);
        S('', 'Swapping on Aerodrome… <a href="https://basescan.org/tx/' + r.hash + '" target="_blank" rel="noopener">view</a>');
        var rc = await L.waitReceipt(r.hash);
        if (rc.status !== '0x1') throw new Error('The swap failed on-chain (price moved more than 2%). Only the network fee was used.');
        S('ok', 'Done. You bought about ' + L.fmtNum(Number(r.quote) / 1e18) + ' ' + esc(t.symbol) + '.');
      } catch (e) { S('err', esc(L.errText(e))); }
      finally { busy = false; }
    };
    requestAnimationFrame(function () { if (toBuy) $('#buyBox').scrollIntoView({ block: 'center' }); });
  }

  // ---------------------------------------------------------------- reveal
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: .08 });
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

  render(); kpis(); champ(); ticker(); ads();
  load(); setInterval(load, 60000);
})();
