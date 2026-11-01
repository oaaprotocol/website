/* Buy $OAA: ETH -> OAA swap on Uniswap V4 (Base) through the official Universal Router. The visitor's wallet signs. */
(function () {
  'use strict';
  var L = window.OAALP, A = window.OAAABI, $ = function (s) { return document.querySelector(s); };
  var ZERO = '0x0000000000000000000000000000000000000000';
  var PM = '0x498581fF718922c3f8e6A244956aF099B2652b2b';       // Uniswap V4 PoolManager (Base)
  var QUOTER = '0xE1A6C5803e3c44368b171BD680c7D32dfc92CA47';   // Uniswap V4 Quoter (Base)
  var UR = '0x6fF5693b99212Da76ad316178A184AB56D299b43';       // Uniswap Universal Router (Base)
  var FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';     // Chainlink ETH/USD (Base)
  var OPENS = Date.parse('2026-11-17T16:00:00+01:00');
  var K = ['address', 'address', 'uint24', 'int24', 'address'];
  var cfg = null, key = null, ethUsd = null, bal = null, quote = null, quoteFor = 0n, slip = 'auto', speed = 'std', busy = false, seq = 0, spot = null;

  // ---------------------------------------------------------------- helpers
  function fmtTok(n) { if (!isFinite(n)) return '0'; if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); if (n >= 1) return n.toFixed(2); return n.toPrecision(4); }
  function slipBps() { if (slip === 'auto') return 100; var v = parseFloat(slip); return isFinite(v) && v > 0 ? Math.min(5000, Math.round(v * 100)) : 100; }
  function stat(k, h) { var s = $('#sStat'); if (!k && !h) { s.className = 'st-line'; return; } s.className = 'st-line on' + (k ? ' ' + k : ''); $('#sStatT').innerHTML = h; }
  function amountIn() { return L.toWei($('#inEth').value || ''); }

  // ---------------------------------------------------------------- settings
  $('#gearBtn').onclick = function () { var s = $('#set'); s.hidden = !s.hidden; this.setAttribute('aria-expanded', !s.hidden); };
  function slipUi() {
    document.querySelectorAll('#slipSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === slip); });
    var custom = ['auto', '0.5', '1', '3'].indexOf(slip) < 0; $('.cust').classList.toggle('on', custom);
    var p = slipBps() / 100, h = $('#slipHint');
    h.textContent = slip === 'auto' ? 'Auto: 1%. The swap is cancelled if the price moves more than this before it is confirmed.' : p > 5 ? 'High slippage: you may receive much less than shown. Bots can take advantage of this.' : p < 0.3 ? 'Very low slippage: the swap may fail if the price moves a little.' : 'The swap is cancelled if the price moves more than ' + p + '% before it is confirmed.';
    h.classList.toggle('warn', p > 5 || p < 0.3);
    $('#dSlip').textContent = (slip === 'auto' ? 'Auto · ' : '') + p + '%';
    details();
  }
  document.querySelectorAll('#slipSeg button').forEach(function (b) { b.onclick = function () { slip = b.dataset.v; $('#slipIn').value = ''; slipUi(); }; });
  $('#slipIn').oninput = function () { var v = this.value.replace(',', '.').replace(/[^0-9.]/g, ''); this.value = v; slip = v ? v : 'auto'; slipUi(); };
  var SPD = { std: 'Standard: your wallet sets the network fee. On Base a swap usually confirms within a few seconds.', fast: 'Fast: a higher priority tip so the swap is placed earlier in the next block. Costs a little more.', instant: 'Instant: the highest tip, useful in very busy moments such as the launch minute. Costs more.' };
  document.querySelectorAll('#spdSeg button').forEach(function (b) { b.onclick = function () { speed = b.dataset.v; document.querySelectorAll('#spdSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('#spdHint').textContent = SPD[speed]; gasEst(); }; });

  // ---------------------------------------------------------------- data
  async function loadCfg() {
    try { cfg = await fetch('/assets/buy/pool.json', { cache: 'no-store' }).then(function (r) { return r.json(); }); } catch (e) { cfg = null; }
    if (cfg && cfg.token && cfg.fee != null && cfg.tickSpacing != null) {
      var pair = cfg.pair || ZERO, t = cfg.token;
      if (pair !== ZERO) { cfg = null; return; } // this page swaps native ETH; the $OAA pool is paired with ETH
      key = [ZERO, t, +cfg.fee, +cfg.tickSpacing, cfg.hooks || ZERO];
    }
  }
  async function loadPrice() { try { var r = await L.call(FEED, '0xfeaf968c'); ethUsd = Number(L.wordUint(r, 1)) / 1e8; } catch (e) {} }
  async function loadSpot() { // pool price from the PoolManager state (for the price impact)
    if (!key || !cfg.slot) return;
    try { var v = BigInt(await L.call(PM, '0x1e2eaeaf' + cfg.slot.replace(/^0x/, ''))); var sp = Number(v & ((1n << 160n) - 1n)) / 2 ** 96; spot = sp * sp; } catch (e) {}
  }
  async function loadBal() { var a = L.account(); if (!a) { bal = null; $('#balEth').textContent = '—'; return; } try { bal = await L.balance(a); $('#balEth').textContent = Number(L.fromWei(bal)).toFixed(4) + ' ETH'; } catch (e) {} }

  async function getQuote(amt) {
    var d = '0xaa9d21cb' + A.encode([[K, 'bool', 'uint128', 'bytes']], [[key, true, amt, '0x']]);
    var r = await L.call(QUOTER, d);
    return BigInt('0x' + r.slice(2, 66));
  }
  async function update() {
    var my = ++seq, amt = amountIn();
    $('#inUsd').textContent = ethUsd && amt ? L.fmtUsd(Number(amt) / 1e18 * ethUsd) : '$0';
    if (!key) { button(); return; }
    if (!amt) { quote = null; quoteFor = 0n; $('#outOaa').textContent = '0'; $('#outUsd').textContent = '—'; $('#impact').textContent = ''; $('#det').hidden = true; button(); return; }
    $('#outOaa').classList.add('dim');
    await L.sleep(300); if (my !== seq) return;
    try {
      var q = await getQuote(amt); if (my !== seq) return;
      quote = q; quoteFor = amt;
      var out = Number(q) / 1e18, inn = Number(amt) / 1e18;
      $('#outOaa').textContent = fmtTok(out); $('#outOaa').classList.remove('dim');
      $('#outUsd').textContent = ethUsd ? '≈ ' + L.fmtUsd(inn * ethUsd) : '—';
      if (spot) { var imp = Math.max(0, (1 - (out / inn) / spot) * 100); var el = $('#impact'); el.textContent = 'Price impact ' + (imp < 0.01 ? '<0.01' : imp.toFixed(2)) + '%'; el.className = imp > 15 ? 'bad' : imp > 5 ? 'warn' : ''; }
      details(); stat();
    } catch (e) {
      if (my !== seq) return; quote = null; $('#outOaa').textContent = '0'; $('#det').hidden = true;
      stat('err', 'No price for this amount right now. Try a smaller amount or again in a moment.');
    }
    button();
  }
  function minOut() { return quote ? quote * BigInt(10000 - slipBps()) / 10000n : 0n; }
  function details() {
    if (!quote) return;
    var out = Number(quote) / 1e18, inn = Number(quoteFor) / 1e18;
    $('#dRate').textContent = '1 ETH = ' + fmtTok(out / inn) + ' OAA';
    $('#dMin').textContent = fmtTok(Number(minOut()) / 1e18) + ' OAA';
    $('#det').hidden = false; gasEst();
  }
  async function gasEst() {
    try {
      var gp = BigInt(await L.rpc('eth_gasPrice', [])), tip = await tipWei(), g = 190000n, fee = Number((gp + tip) * g) / 1e18;
      $('#dGas').textContent = '≈ ' + (ethUsd ? '$' + (fee * ethUsd).toFixed(fee * ethUsd < 0.01 ? 4 : 2) : fee.toFixed(6) + ' ETH') + (speed !== 'std' ? ' · ' + (speed === 'fast' ? 'Fast' : 'Instant') : '');
    } catch (e) {}
  }
  async function tipWei() {
    if (speed === 'std') return 0n;
    var t = 1000000n; try { t = BigInt(await L.rpc('eth_maxPriorityFeePerGas', [])); } catch (e) {}
    var min = speed === 'fast' ? 10000000n : 50000000n; // 0.01 / 0.05 gwei
    var m = speed === 'fast' ? t * 3n : t * 8n; return m > min ? m : min;
  }

  // ---------------------------------------------------------------- button state
  function button() {
    var b = $('#goBtn'), amt = amountIn(), a = L.account();
    if (!key) { b.disabled = true; b.textContent = 'Trading opens 17 Nov · 16:00'; return; }
    if (!a) { b.disabled = false; b.textContent = 'Connect wallet'; return; }
    if (!amt) { b.disabled = true; b.textContent = 'Enter an amount'; return; }
    if (bal != null && amt + 30000000000000n > bal) { b.disabled = true; b.textContent = 'Not enough ETH on Base'; return; }
    if (!quote || quoteFor !== amt) { b.disabled = true; b.textContent = 'Getting price…'; return; }
    b.disabled = busy; b.textContent = busy ? 'Swapping…' : 'Buy $OAA';
  }
  $('#inEth').addEventListener('input', function () { var v = this.value.replace(',', '.').replace(/[^0-9.]/g, ''); var p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join(''); if (v !== this.value) this.value = v; update(); });
  function setPct(p) {
    if (bal == null) return;
    var reserve = 300000000000000n, v = p === 'max' ? bal - reserve : bal * BigInt(p) / 100n; if (v < 0n) v = 0n;
    $('#inEth').value = v ? Number(L.fromWei(v)).toFixed(6).replace(/\.?0+$/, '') : ''; update();
  }
  document.querySelectorAll('.qa button').forEach(function (b) { b.onclick = function () { setPct(b.dataset.p); }; });
  $('#balBtn').onclick = function () { setPct('max'); };
  $('#caCopy').onclick = function () { var t = this; var a = (cfg && cfg.token) || '0x70107c4AA2DC031eF7afc350e03784c2325aBE29'; (navigator.clipboard ? navigator.clipboard.writeText(a) : Promise.reject()).then(function () { t.textContent = 'Copied'; setTimeout(function () { t.textContent = 'Copy'; }, 1400); }).catch(function () {}); };

  // ---------------------------------------------------------------- wallet
  var wb = $('#wBtn');
  L.onAccount(function (a) { wb.classList.toggle('on', !!a); $('#wTxt').textContent = a ? L.short(a) : 'Connect wallet'; loadBal().then(button); });
  function connect() { return L.connect().catch(function (e) { if (e.message !== 'cancelled') stat('err', L.esc(L.errText(e))); }); }
  wb.onclick = connect;

  // ---------------------------------------------------------------- swap
  function swapData(amt, min) {
    var p1 = A.encode([[K, 'bool', 'uint128', 'uint128', 'bytes']], [[key, true, amt, min, '0x']]);
    var p2 = A.encode(['address', 'uint256'], [ZERO, amt]);        // SETTLE_ALL: pay ETH
    var p3 = A.encode(['address', 'uint256'], [key[1], min]);      // TAKE_ALL: receive $OAA (at least min)
    var v4 = A.encode(['bytes', 'bytes[]'], ['0x060c0f', ['0x' + p1, '0x' + p2, '0x' + p3]]); // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
    var dl = BigInt(Math.floor(Date.now() / 1000) + 1200);
    return '0x3593564c' + A.encode(['bytes', 'bytes[]', 'uint256'], ['0x10', ['0x' + v4], dl]); // execute(V4_SWAP)
  }
  $('#goBtn').onclick = async function () {
    if (!L.account()) { connect(); return; }
    if (busy || !key) return;
    var amt = amountIn(); if (!amt) return;
    busy = true; button(); $('#doneBox').hidden = true;
    try {
      stat('', 'Getting the latest price…');
      var q = await getQuote(amt); quote = q; quoteFor = amt; details();
      var min = minOut(), data = swapData(amt, min), a = L.account();
      var tx = { to: UR, data: data, value: '0x' + amt.toString(16) };
      try { var g = await L.rpc('eth_estimateGas', [{ from: a, to: UR, data: data, value: tx.value }]); tx.gas = '0x' + (BigInt(g) * 13n / 10n).toString(16); }
      catch (e) { throw new Error(/0x8b063d73|TooLittle/i.test(JSON.stringify(e.data || e.message)) ? 'The price moved more than your slippage. Try again or raise the slippage.' : L.errText(e)); }
      var tip = await tipWei();
      if (tip > 0n) { var base = BigInt(await L.rpc('eth_gasPrice', [])); tx.maxPriorityFeePerGas = '0x' + tip.toString(16); tx.maxFeePerGas = '0x' + (base * 2n + tip).toString(16); }
      stat('', 'Confirm the swap in your wallet…');
      var hash = await L.sendTx(tx);
      stat('', 'Buying $OAA on Base… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1') throw new Error('The swap failed on-chain (probably the price moved more than your slippage). Only the network fee was used.');
      stat('ok', 'Done. You bought about ' + fmtTok(Number(q) / 1e18) + ' OAA (at least ' + fmtTok(Number(min) / 1e18) + ').');
      $('#txLink').href = 'https://basescan.org/tx/' + hash; $('#doneBox').hidden = false;
      $('#inEth').value = ''; update(); loadBal();
    } catch (e) { stat('err', L.esc(L.errText(e))); }
    finally { busy = false; button(); }
  };
  $('#addTok').onclick = function () {
    var p = window.ethereum; if (!p || !p.request) return;
    p.request({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: cfg.token, symbol: 'OAA', decimals: 18, image: 'https://oaap.si/assets/apple-touch-icon.png' } } }).catch(function () {});
  };

  // ---------------------------------------------------------------- closed state (before the pool exists)
  function closedUi() {
    var box = document.createElement('div'); box.className = 'closed';
    box.innerHTML = '<b>$OAA trading opens on 17 November 2026, 16:00 (CET)</b><span>This page switches on by itself when the pool is live. Never buy $OAA from a contract other than the one shown here.</span><div class="cd" id="cd"></div>';
    $('#goBtn').after(box);
    (function tick() {
      var s = Math.max(0, Math.floor((OPENS - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
      $('#cd').innerHTML = [[d, 'days'], [h, 'hrs'], [m, 'min'], [sec, 'sec']].map(function (x) { return '<div><b>' + String(x[0]).padStart(2, '0') + '</b><small>' + x[1] + '</small></div>'; }).join('');
      setTimeout(tick, 1000);
    })();
  }

  (async function init() {
    slipUi(); button();
    await Promise.all([loadCfg(), loadPrice()]);
    if (!key) { closedUi(); button(); return; }
    await loadSpot(); update();
    setInterval(function () { if (amountIn() && !busy) update(); loadSpot(); }, 15000);
  })();
})();
