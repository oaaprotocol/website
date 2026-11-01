/* OAA Launchpad: 4-step wizard wired to the OAALaunchpad contract on Base. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var CATS = L.CATS, I = L.ICON;
  var step = 1, cat = -1, ethUsd = null, maxWei = null, logoFile = null, logoUrl = null, busy = false, lpReady = false, paused = false;

  // ---------------------------------------------------------------- steps
  function go(n) {
    if (n > step && !validate(step)) return;
    step = n;
    document.querySelectorAll('.st').forEach(function (s) { s.classList.toggle('on', +s.dataset.s === n); });
    document.querySelectorAll('#steps li').forEach(function (li, i) { li.classList.toggle('on', i + 1 === n); li.classList.toggle('done', i + 1 < n); });
    $('#stepbar').style.width = (n * 25) + '%';
    if (n === 4) summary();
  }
  function validate(s) {
    if (s >= 1) {
      var n = baseName(), y = sym();
      if (!n || n.length > 40) return fail(1, 'Please enter a token name (max 40 characters).', '#fName');
      if (!/^[A-Z0-9]{1,12}$/.test(y)) return fail(1, 'The ticker may use A–Z and 0–9 only, max 12 characters.', '#fSym');
      var bad = ['#fWeb', '#fX', '#fTg'].filter(function (id) { var v = $(id).value.trim(); return v && !/^https:\/\/[^\s"'<>]{3,200}$/.test(v); });
      if (bad.length) return fail(1, 'Links must start with https://', bad[0]);
    }
    if (s >= 2 && cat < 0) return fail(2, 'Please pick a category.');
    return true;
  }
  function fail(s, msg, focus) {
    if (step !== s) go(s);
    toast(msg);
    if (focus) { var el = $(focus); el.focus(); el.classList.add('bad'); setTimeout(function () { el.classList.remove('bad'); }, 1600); }
    return false;
  }
  var tt;
  function toast(msg) {
    var t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-next]')) go(Math.min(4, step + 1));
    if (e.target.closest('[data-back]')) go(Math.max(1, step - 1));
  });
  document.querySelectorAll('#steps li').forEach(function (li, i) { li.style.cursor = 'pointer'; li.onclick = function () { if (i + 1 < step || validate(i)) go(i + 1); }; });

  // ---------------------------------------------------------------- category picker
  var pk = $('#picker');
  CATS.forEach(function (c, i) {
    var b = document.createElement('button'); b.className = 'pick'; b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.style.setProperty('--c', c.c);
    b.innerHTML = '<span class="ic">' + I[c.id] + '</span><b>' + c.name + '</b><small>' + c.d + '</small>';
    b.onclick = function () { cat = i; pk.querySelectorAll('.pick').forEach(function (x) { x.setAttribute('aria-checked', x === b); }); preview(); };
    pk.appendChild(b);
  });

  // ---------------------------------------------------------------- first buy estimate (range 1: $30k..$1M market cap holds 500M tokens, 1% fee)
  function tokensFor(usd) { if (usd <= 0) return 0; var p0 = 3e-5, p1 = 1e-3, A = 5e8, s0 = Math.sqrt(p0), s1 = Math.sqrt(p1), Lq = A / (1 / s0 - 1 / s1), sN = s0 + usd * 0.99 / Lq; return Lq * (1 / s0 - 1 / sN); }
  function baseName() { return $('#fName').value.trim().replace(/\s+by\s+oaa\s*$/i, '').trim(); }
  function sym() { return ($('#fSym').value || '').toUpperCase().replace(/\s+/g, ''); }
  function usd() { return +$('#bfRange').value; }
  function weiFor(u) {
    if (!u || !ethUsd) return 0n;
    var w = BigInt(Math.floor(u / ethUsd * 1e12)) * 10n ** 6n;
    if (maxWei && w > maxWei * 995n / 1000n) w = maxWei * 995n / 1000n; // stays below the $500 limit even if the ETH price moves
    return w;
  }
  function buyUi() {
    var u = usd(), t = tokensFor(u), w = weiFor(u);
    $('#bfUsd').textContent = '$' + u;
    $('#bfEth').textContent = u ? (ethUsd ? '≈ ' + L.fromWei(w, 4) + ' ETH' : 'ETH price loading…') : 'no first buy';
    $('#bfTok').textContent = u ? L.fmtNum(t) + ' ' + (sym() || 'tokens') : '—';
    $('#bfPct').textContent = u ? (t / 1e7).toFixed(2) + '%' : '—';
    document.querySelectorAll('.bf-q button').forEach(function (b) { b.classList.toggle('on', +b.dataset.u === u); });
  }
  $('#bfRange').oninput = buyUi;
  document.querySelectorAll('.bf-q button').forEach(function (b) { b.onclick = function () { $('#bfRange').value = b.dataset.u; buyUi(); }; });

  // ---------------------------------------------------------------- preview
  function preview() {
    var c = CATS[cat < 0 ? 0 : cat], n = (baseName() || 'Your token') + ' by OAA';
    $('#pvName').textContent = n; $('#pvSym').textContent = sym() || 'TICKER';
    var ch = $('#pvCat'); ch.style.setProperty('--c', c.c); ch.innerHTML = cat < 0 ? 'Category' : I[c.id] + c.name;
    var av = $('#pvAv');
    if (logoFile) { av.style.backgroundImage = 'url(' + $('#luImg').src + ')'; av.textContent = ''; }
    else { av.style.backgroundImage = 'linear-gradient(135deg,' + c.c + ',color-mix(in srgb,' + c.c + ' 45%,#0b1416))'; av.textContent = (sym() || '?').slice(0, 2); }
    var d = $('#fDesc').value.trim(); $('#pvDesc').textContent = d; $('#pvDesc').hidden = !d;
    buyUi();
  }
  ['#fName', '#fSym', '#fDesc'].forEach(function (s) { $(s).addEventListener('input', preview); });
  $('#fSym').addEventListener('input', function () { var v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); if (v !== this.value) this.value = v; });

  $('#logoIn').onchange = function () {
    var f = this.files[0]; if (!f) return;
    if (f.size > 300 * 1024) { toast('The logo must be 300 KB or smaller.'); this.value = ''; return; }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { toast('Use PNG, JPG, WEBP or GIF.'); this.value = ''; return; }
    logoFile = f; logoUrl = null;
    var url = URL.createObjectURL(f); $('#luImg').src = url; $('#luImg').hidden = false; $('#luPh').style.opacity = 0; preview();
  };

  // ---------------------------------------------------------------- summary
  function summary() {
    var u = usd(), w = weiFor(u);
    var rows = [['Name on-chain', L.esc((baseName() || '—') + ' by OAA')], ['Ticker', L.esc(sym() || '—')], ['Category', cat < 0 ? '—' : CATS[cat].name], ['Supply', '1,000,000,000 · 18 decimals'],
      ['First buy', u ? '$' + u + ' ≈ ' + L.fromWei(w, 4) + ' ETH → about ' + L.fmtNum(tokensFor(u)) + ' ' + L.esc(sym()) : 'none'],
      ['You pay now', u ? L.fromWei(w, 4) + ' ETH + network fee' : 'network fee only'], ['Pool', 'Aerodrome Slipstream · WETH · 1% fee tier']];
    $('#sum').innerHTML = rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
  }
  function syncBtn() { $('#launchBtn').disabled = busy || !$('#agree').checked || !lpReady || paused; }
  $('#agree').onchange = syncBtn;

  // ---------------------------------------------------------------- status line
  function stat(kind, html) { var s = $('#lStat'); s.className = 'st-line on' + (kind ? ' ' + kind : ''); $('#lStatT').innerHTML = html; }

  // ---------------------------------------------------------------- wallet button
  var wb = $('#wBtn');
  function wUi(a) { wb.classList.toggle('on', !!a); $('#wTxt').textContent = a ? L.short(a) : 'Connect wallet'; }
  L.onAccount(wUi);
  wb.onclick = function () { L.connect().catch(function (e) { if (e.message !== 'cancelled') toast(L.errText(e)); }); };

  // ---------------------------------------------------------------- launch
  async function uploadLogo() {
    if (!logoFile) return null;
    if (logoUrl) return logoUrl;
    var r = await L.api('/lp/logo', { method: 'POST', headers: { 'Content-Type': logoFile.type }, body: logoFile });
    if (!r || !r.url) throw new Error((r && r.detail) || 'The logo upload failed. Try again or launch without a logo.');
    logoUrl = r.url; return logoUrl;
  }
  $('#launchBtn').onclick = async function () {
    if (busy || !validate(2)) return;
    busy = true; syncBtn();
    try {
      stat('', 'Connect your wallet…');
      var acct = await L.connect();
      var u = usd(), w = weiFor(u);
      if (u && !ethUsd) throw new Error('The ETH price is still loading. Try again in a moment.');
      var bal = await L.balance(acct);
      if (bal < w + 2n * 10n ** 14n) throw new Error('Your wallet needs about ' + L.fromWei(w + 2n * 10n ** 14n, 4) + ' ETH on Base (first buy plus network fee).');
      stat('', logoFile ? 'Uploading the logo…' : 'Preparing the launch…');
      var logo = await uploadLogo();
      var meta = { v: 1 };
      if (logo) meta.logo = logo;
      var d = $('#fDesc').value.trim(); if (d) meta.description = d.slice(0, 400);
      [['website', '#fWeb'], ['x', '#fX'], ['telegram', '#fTg']].forEach(function (p) { var v = $(p[1]).value.trim(); if (v) meta[p[0]] = v; });
      var data = '0x5af55677' + L.encode([{ t: 'string', v: baseName() }, { t: 'string', v: sym() }, { t: 'uint', v: cat }, { t: 'string', v: JSON.stringify(meta) }]);
      var tx = { to: L.CFG.launchpad, data: data, value: '0x' + w.toString(16) };
      // dry run first, so a refusal shows up before the wallet asks for a signature
      try { await L.call(tx.to, data, { from: acct, value: tx.value }); } catch (e) { throw e; }
      try { var g = await L.rpc('eth_estimateGas', [{ from: acct, to: tx.to, data: data, value: tx.value }]); tx.gas = '0x' + (BigInt(g) * 125n / 100n).toString(16); } catch (e) {}
      stat('', 'Confirm the launch in your wallet…');
      var hash = await L.sendTx(tx);
      stat('', 'Launching on Base… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1') throw new Error('The transaction failed on-chain. Nothing was launched; only the network fee was used.');
      var log = (rc.logs || []).filter(function (l) { return l.address.toLowerCase() === L.CFG.launchpad.toLowerCase() && l.topics[0] === '0x3e1027bfe22530e964119d7170c42d39bc2fd16e95dd572801639747dbcd1371'; })[0];
      var token = log ? '0x' + log.topics[1].slice(26) : null;
      stat('ok', 'Launched. Your token is live on Aerodrome.');
      done(token, hash);
    } catch (e) {
      if (e && e.message === 'cancelled') { $('#lStat').className = 'st-line'; }
      else stat('err', L.esc(L.errText(e)));
    } finally { busy = false; syncBtn(); }
  };
  function done(token, hash) {
    $('#okTitle').textContent = (baseName() || 'Your token') + ' by OAA is live.';
    $('#okAddr').textContent = token || '';
    $('#okPortal').href = '/portal/' + (token ? '#' + token : '');
    $('#okScan').href = token ? 'https://basescan.org/token/' + token : 'https://basescan.org/tx/' + hash;
    $('#okm').classList.add('on');
  }
  $('#okClose').onclick = function () { $('#okm').classList.remove('on'); };
  $('#okm').onclick = function (e) { if (e.target.id === 'okm') this.classList.remove('on'); };

  // ---------------------------------------------------------------- live config
  function closed(html) {
    var p = $('#closedNote'); if (!p) { p = document.createElement('p'); p.id = 'closedNote'; p.className = 'closed'; $('.win-h').appendChild(p); }
    p.innerHTML = html;
  }
  async function init() {
    var c = await L.config();
    if (!c.launchpad) { closed('<b>The launchpad opens with the $OAA launch on 25 November 2026.</b> You can prepare your token here already; the launch button turns on when the contract is live.'); syncBtn(); return; }
    try {
      var r = await Promise.all([L.call(c.launchpad, '0x9478ab8c'), L.call(c.launchpad, '0x1064a716'), L.call(c.launchpad, '0x5c975abb')]);
      ethUsd = Number(BigInt(r[0])) / 1e8; maxWei = BigInt(r[1]); paused = BigInt(r[2]) !== 0n;
      lpReady = true;
      if (paused) closed('<b>Launches are paused for a moment.</b> Please try again later.');
    } catch (e) { closed('<b>The Base network is not answering right now.</b> Reload the page in a moment.'); }
    buyUi(); syncBtn();
  }

  document.querySelectorAll('.rv').forEach(function (e) { e.classList.add('in'); });
  var css = document.createElement('style');
  css.textContent = '.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);z-index:80;max-width:min(520px,calc(100% - 32px));padding:12px 16px;border-radius:14px;background:rgba(10,18,20,.96);border:1px solid rgba(127,243,236,.3);color:#e9f0f3;font:500 13px Inter,Arial,sans-serif;opacity:0;pointer-events:none;transition:.25s}.toast.on{opacity:1;transform:translate(-50%,0)}.bad{border-color:#ff5c7a!important;box-shadow:0 0 0 3px rgba(255,92,122,.18)!important}';
  document.head.appendChild(css);
  preview(); syncBtn(); init();
})();
