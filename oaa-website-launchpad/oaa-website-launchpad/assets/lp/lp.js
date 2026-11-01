/* OAA Launchpad + Portal: shared helpers (Base RPC, ABI encoding, wallet, formatting). No external libraries. */
(function () {
  'use strict';
  var API = 'https://sia.oaaprotocol.workers.dev';
  var RPC = 'https://mainnet.base.org';
  var CHAIN = '0x2105';
  var CFG = {
    router: '0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F',
    weth: '0x4200000000000000000000000000000000000006',
    tickSpacing: 2000,
    launchpad: null
  };
  var CATS = [
    { id: 'meme', name: 'Meme', c: '#ff7a59', d: 'Pure community fun' },
    { id: 'si', name: 'SI Agents', c: '#33d1c9', d: 'Super intelligence' },
    { id: 'rwa', name: 'RWA', c: '#8fb4ff', d: 'Real-world assets' },
    { id: 'x402', name: 'x402', c: '#5ee1ff', d: 'Pay-per-use agents' },
    { id: 'cat', name: 'Cats', c: '#ff9cc0', d: 'Cat tokens' },
    { id: 'char', name: 'Characters', c: '#ff9e7a', d: 'Mascots & heroes' },
    { id: 'game', name: 'Gaming', c: '#4fa3ff', d: 'Play & earn' },
    { id: 'defi', name: 'DeFi', c: '#a5ecff', d: 'Yield & tools' }
  ];
  var ICON = {
    meme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3"/><path d="M8 9.5l1.5 1M16 9.5l-1.5 1"/></svg>',
    si: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
    rwa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></svg>',
    x402: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M13 8l-3 4h4l-3 4"/></svg>',
    cat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4l4 4h8l4-4v9a8 8 0 01-16 0z"/><path d="M9 13h.01M15 13h.01M11 16h2"/></svg>',
    char: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10c0-4 3.5-7 8-7s8 3 8 7c0 5-3.5 11-8 11S4 15 4 10z"/><path d="M8 11c1-1 2-1 3 0M13 11c1-1 2-1 3 0M10 16c1.3.8 2.7.8 4 0"/></svg>',
    game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8h12a4 4 0 014 4l-1 4a2.5 2.5 0 01-4.3 1L15 15H9l-1.7 2A2.5 2.5 0 013 16l-1-4a4 4 0 014-4z"/><path d="M7 11v3M5.5 12.5h3"/></svg>',
    defi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>'
  };

  // ---------------------------------------------------------------- utils
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || '')); }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n);
    return a >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + (n === 0 ? '0' : n.toFixed(a >= 100 ? 0 : 2));
  }
  function fmtPrice(p) {
    if (p == null || !isFinite(p) || p <= 0) return '—';
    if (p >= 1) return '$' + p.toFixed(2);
    if (p >= 0.01) return '$' + p.toFixed(4);
    var s = p.toFixed(20), m = s.match(/^0\.(0+)(\d{3})/);
    if (m && m[1].length >= 4) return '$0.0<sub>' + m[1].length + '</sub>' + m[2];
    return '$' + p.toPrecision(3);
  }
  function fmtNum(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : (n >= 1 ? Math.round(n) + '' : n.toPrecision(3)); }
  function fmtPct(n) { return n == null || !isFinite(n) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(sec) { var m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60)); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
  function catById(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return CATS[0]; }

  // ---------------------------------------------------------------- ABI encoding (only the types we need)
  function strip(h) { return String(h).replace(/^0x/, ''); }
  function pad(h) { h = strip(h); return h.length >= 64 ? h : '0'.repeat(64 - h.length) + h; }
  function encUint(v) { return pad(BigInt(v).toString(16)); }
  function encInt(v) { v = BigInt(v); if (v < 0n) v = (1n << 256n) + v; return pad(v.toString(16)); }
  function encAddr(a) { return pad(strip(a).toLowerCase()); }
  function encBytesUtf8(s) {
    var b = new TextEncoder().encode(s), h = '';
    for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, '0');
    var padded = h + '0'.repeat((64 - (h.length % 64)) % 64);
    return encUint(b.length) + padded;
  }
  // args: array of {t:'string'|'uint'|'int'|'address', v}
  function encode(args) {
    var head = [], tail = '', headLen = args.length * 32;
    args.forEach(function (a) {
      if (a.t === 'string') { head.push(encUint(headLen + tail.length / 2)); tail += encBytesUtf8(a.v); }
      else if (a.t === 'address') head.push(encAddr(a.v));
      else if (a.t === 'int') head.push(encInt(a.v));
      else head.push(encUint(a.v));
    });
    return head.join('') + tail;
  }
  function word(h, i) { return strip(h).slice(i * 64, (i + 1) * 64); }
  function wordAddr(h, i) { return '0x' + word(h, i).slice(24); }
  function wordUint(h, i) { var w = word(h, i); return w ? BigInt('0x' + w) : 0n; }

  // ---------------------------------------------------------------- RPC
  var rid = 1;
  function rpc(method, params) {
    return fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: method, params: params }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) { var e = new Error(j.error.message || 'rpc error'); e.data = j.error.data; throw e; } return j.result; });
  }
  function call(to, data, extra) { var tx = { to: to, data: data }; if (extra) for (var k in extra) tx[k] = extra[k]; return rpc('eth_call', [tx, 'latest']); }
  async function waitReceipt(hash, onTick) {
    for (var i = 0; i < 240; i++) {
      var r = await rpc('eth_getTransactionReceipt', [hash]).catch(function () { return null; });
      if (r && r.blockNumber) return r;
      if (onTick) onTick(i);
      await sleep(1500);
    }
    throw new Error('The transaction is taking long. Check it on BaseScan.');
  }
  function api(path, opts) {
    return fetch(API + path, opts || {}).then(function (r) { return r.json().catch(function () { return { error: 'bad_response' }; }); });
  }
  var cfgP = null;
  function config() {
    if (!cfgP) cfgP = api('/lp/config').then(function (c) { if (c && !c.error) { for (var k in c) CFG[k] = c[k]; } return CFG; }).catch(function () { return CFG; });
    return cfgP;
  }

  // ---------------------------------------------------------------- wallet (EIP-6963 + injected fallback)
  var providers = [], prov = null, account = null, listeners = [];
  window.addEventListener('eip6963:announceProvider', function (e) {
    var d = e.detail; if (!d || !d.provider) return;
    if (!providers.some(function (p) { return p.info.uuid === d.info.uuid; })) providers.push(d);
  });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}
  function emit() { listeners.forEach(function (f) { try { f(account); } catch (e) {} }); }
  function onAccount(f) { listeners.push(f); }
  function pickProvider() {
    if (providers.length) return Promise.resolve(providers.length === 1 ? providers[0].provider : choose());
    if (window.ethereum) return Promise.resolve(window.ethereum);
    return Promise.reject(new Error('No wallet found. Open this page in MetaMask, Coinbase Wallet, Rabby or another wallet browser.'));
  }
  function choose() {
    return new Promise(function (res, rej) {
      var m = document.createElement('div'); m.className = 'wsel on';
      m.innerHTML = '<div class="wsel-c"><p class="eyebrow">Connect wallet</p><h3>Choose your wallet</h3><div class="wsel-l"></div><button class="btn wsel-x" type="button">Cancel</button></div>';
      var l = m.querySelector('.wsel-l');
      providers.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'wsel-b';
        b.innerHTML = (p.info.icon && /^data:image\//.test(p.info.icon) ? '<img alt="" src="' + esc(p.info.icon) + '">' : '') + '<b>' + esc(p.info.name) + '</b>';
        b.onclick = function () { m.remove(); res(p.provider); }; l.appendChild(b);
      });
      m.querySelector('.wsel-x').onclick = function () { m.remove(); rej(new Error('cancelled')); };
      m.onclick = function (e) { if (e.target === m) { m.remove(); rej(new Error('cancelled')); } };
      document.body.appendChild(m);
    });
  }
  async function ensureBase(p) {
    var id = await p.request({ method: 'eth_chainId' });
    if (String(id).toLowerCase() === CHAIN) return;
    try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN }] }); }
    catch (e) {
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ''))) {
        await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC], blockExplorerUrls: ['https://basescan.org'] }] });
      } else throw e;
    }
  }
  async function connect() {
    if (prov && account) return account;
    await sleep(60);
    var p = await pickProvider();
    var accs = await p.request({ method: 'eth_requestAccounts' });
    if (!accs || !accs.length) throw new Error('No account selected.');
    prov = p; account = accs[0];
    if (p.on) {
      p.on('accountsChanged', function (a) { account = a && a[0] || null; emit(); });
      p.on('chainChanged', function () { emit(); });
    }
    await ensureBase(p);
    emit();
    return account;
  }
  async function sendTx(tx) {
    await connect(); await ensureBase(prov);
    tx.from = account;
    return prov.request({ method: 'eth_sendTransaction', params: [tx] });
  }
  function errText(e) {
    if (!e) return 'Something went wrong.';
    if (e.code === 4001 || /rejected|denied|cancel/i.test(e.message || '')) return 'You cancelled the request in your wallet.';
    var m = (e.data && e.data.message) || e.message || String(e);
    var r = m.match(/OL: [^"']+/); if (r) return 'The launchpad refused: ' + r[0].slice(4) + '.';
    if (/insufficient funds/i.test(m)) return 'Not enough ETH on Base for this transaction and its network fee.';
    return m.length > 180 ? m.slice(0, 180) + '…' : m;
  }
  function toWei(eth) {
    var s = String(eth).trim(); if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return 0n;
    var p = s.split('.'), d = (p[1] || '').slice(0, 18).padEnd(18, '0');
    return BigInt(p[0] || '0') * 10n ** 18n + BigInt(d || '0');
  }
  function fromWei(w, dp) { var n = Number(BigInt(w)) / 1e18; return dp == null ? n : n.toFixed(dp); }
  async function balance(a) { return BigInt(await rpc('eth_getBalance', [a, 'latest'])); }

  // ---------------------------------------------------------------- Aerodrome swap (ETH -> token) via the Slipstream SwapRouter
  function swapData(token, recipient, amountIn, minOut) {
    var dl = Math.floor(Date.now() / 1000) + 900;
    return '0xa026383e' + encAddr(CFG.weth) + encAddr(token) + encInt(CFG.tickSpacing) + encAddr(recipient) + encUint(dl) + encUint(amountIn) + encUint(minOut) + encUint(0);
  }
  // Exact simulation of the swap on the real router (no wallet needed: the balance is set only inside this simulation)
  async function quoteBuy(token, amountWei) {
    var from = '0x000000000000000000000000000000000000dEaD';
    var data = swapData(token, from, amountWei, 0);
    var over = {}; over[from] = { balance: '0x' + (amountWei * 2n + 10n ** 18n).toString(16) };
    try {
      var r = await rpc('eth_call', [{ from: from, to: CFG.router, data: data, value: '0x' + amountWei.toString(16) }, 'latest', over]);
      return BigInt(r);
    } catch (e) {
      if (account) { try { return BigInt(await call(CFG.router, data.replace(encAddr(from), encAddr(account)), { from: account, value: '0x' + amountWei.toString(16) })); } catch (e2) {} }
      return null;
    }
  }
  async function buy(token, amountWei, slippageBps) {
    await connect();
    var q = await quoteBuy(token, amountWei);
    if (q == null) throw new Error('Could not get a price for this swap right now.');
    var min = q * BigInt(10000 - (slippageBps || 200)) / 10000n;
    var hash = await sendTx({ to: CFG.router, data: swapData(token, account, amountWei, min), value: '0x' + amountWei.toString(16) });
    return { hash: hash, quote: q };
  }

  window.OAALP = {
    API: API, RPC: RPC, CFG: CFG, CATS: CATS, ICON: ICON, config: config, api: api,
    esc: esc, sleep: sleep, isAddr: isAddr, short: short, fmtUsd: fmtUsd, fmtPrice: fmtPrice, fmtNum: fmtNum, fmtPct: fmtPct, fmtAge: fmtAge, catById: catById,
    encode: encode, encUint: encUint, encAddr: encAddr, encInt: encInt, word: word, wordAddr: wordAddr, wordUint: wordUint,
    rpc: rpc, call: call, waitReceipt: waitReceipt,
    connect: connect, sendTx: sendTx, onAccount: onAccount, account: function () { return account; }, errText: errText,
    toWei: toWei, fromWei: fromWei, balance: balance, quoteBuy: quoteBuy, buy: buy
  };
})();
