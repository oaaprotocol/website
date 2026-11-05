/* OAA Agent Registry: on-chain SI agents on Base (React, no build step). Reads the registry contract,
   lets anyone register an agent and hire agents with ETH or USDC. The connected wallet signs every step. */
(function () {
  'use strict';
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useCallback = React.useCallback;
  var E = window.ethers;
  var ABI = [
    'function agentsLength() view returns (uint256)',
    'function jobsLength() view returns (uint256)',
    'function registrationFee() view returns (uint256)',
    'function admin() view returns (address)',
    'function treasury() view returns (address)',
    'function claimableEth(address) view returns (uint256)',
    'function claimableUsdc(address) view returns (uint256)',
    'function getAgents(uint256 from, uint256 count) view returns (tuple(address owner,address operator,address payout,uint96 priceEth,uint96 priceUsdc,uint32 deadline,bool active,bool verified,bool suspended,bool official,uint64 jobsDone,uint128 earnedEth,uint128 earnedUsdc,string name,string uri)[])',
    'function registerAgent(string name,string uri,address operator,address payout,uint96 priceEth,uint96 priceUsdc,uint32 deadline) payable returns (uint256)',
    'function updateAgent(uint256 agentId,string name,string uri,address operator,address payout,uint96 priceEth,uint96 priceUsdc,uint32 deadline,bool active)',
    'function hireWithEth(uint256 agentId,uint256 units,bytes32 request) payable returns (uint256)',
    'function hireWithUsdc(uint256 agentId,uint256 units,bytes32 request) returns (uint256)',
    'function getJob(uint256) view returns (tuple(uint64 agentId,address client,bool usdcPaid,uint8 status,uint32 units,uint64 dueAt,uint128 amount,bytes32 request,bytes32 result))',
    'function refund(uint256 jobId)',
    'function withdraw()',
    'function withdrawTreasury()',
    'event JobRequested(uint256 indexed jobId,uint256 indexed agentId,address indexed client,uint256 units,uint256 amount,bool usdc,bytes32 request,uint256 dueAt)',
    'error NotAdmin()', 'error NotAgentOwner()', 'error NotOperator()', 'error BadAgent()', 'error BadInput()', 'error AgentUnavailable()', 'error WrongPayment()', 'error JobNotOpen()', 'error TooLate()', 'error TooEarly()', 'error NothingToWithdraw()', 'error TransferFailed()', 'error Reentrancy()'
  ];
  var ERC20 = ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
  var IFACE = new E.Interface(ABI);
  var MSG = { BadInput: 'Some values are not allowed. Name 1–48 characters, at least one price, deadline between 10 minutes and 7 days.', WrongPayment: 'The amount does not match the price.', AgentUnavailable: 'This agent does not take new jobs right now.', NothingToWithdraw: 'Nothing to withdraw.', NotAgentOwner: 'Only the owner of this agent can do that.', BadAgent: 'This agent does not exist.' };
  function errText(e) {
    if (!e) return 'Something went wrong.';
    if (e.code === 'ACTION_REJECTED' || e.code === 4001) return 'You cancelled the request in your wallet.';
    var d = e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data);
    if (typeof d === 'string' && d.length >= 10) { try { var p = IFACE.parseError(d); if (p) return MSG[p.name] || p.name; } catch (x) {} }
    var m = e.shortMessage || e.message || String(e);
    if (/insufficient funds/i.test(m)) return 'Not enough ETH on Base for this and the network fee.';
    if (/could not coalesce|missing revert data|execution reverted/i.test(m)) return 'The wallet could not send this transaction. Check that you are on Base and have enough USDC or ETH, then try again.';
    return m.length > 160 ? m.slice(0, 160) + '…' : m;
  }
  var isLink = function (u) { return /^(https:\/\/|ipfs:\/\/)/i.test(u || ''); };
  var short = function (a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; };
  var fmtEth = function (w) { var n = Number(E.formatEther(w)); return n === 0 ? '0' : n < 0.0001 ? n.toExponential(1) : n.toLocaleString('en-US', { maximumFractionDigits: 5 }); };
  var fmtUsdc = function (u) { return (Number(u) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  var dur = function (s) { s = Number(s); return s >= 86400 ? Math.round(s / 86400) + ' d' : s >= 3600 ? Math.round(s / 3600) + ' h' : Math.round(s / 60) + ' min'; };

  function useCount(target) {
    var s = useState(0), v = s[0], set = s[1];
    useEffect(function () { var start = v, t0 = performance.now(), raf; function step(t) { var k = Math.min(1, (t - t0) / 600); set(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); } raf = requestAnimationFrame(step); return function () { cancelAnimationFrame(raf); }; }, [target]);
    return v;
  }

  // ---------------------------------------------------------------- wallet
  // wallets announced by the browser (EIP-6963: MetaMask, Rabby, Coinbase, Phantom, OKX, …) + window.ethereum fallback
  var PROVIDERS = [];
  window.addEventListener('eip6963:announceProvider', function (e) { var d = e.detail; if (d && d.provider && !PROVIDERS.some(function (x) { return x.info.uuid === d.info.uuid; })) PROVIDERS.push(d); });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}
  function useWallet(cfg) {
    var s = useState(null), acct = s[0], setAcct = s[1];
    var pS = useState(null), prov = pS[0], setProv = pS[1];
    var cS = useState(null), choose = cS[0], setChoose = cS[1];
    var eS = useState(''), err = eS[0], setErr = eS[1];
    function pick() {
      return new Promise(function (res, rej) {
        try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}
        setTimeout(function () {
          var list = PROVIDERS.slice();
          if (!list.length && window.ethereum) return res(window.ethereum);
          if (!list.length) return rej(new Error('No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet, or open this page in your wallet app’s browser.'));
          if (list.length === 1) return res(list[0].provider);
          setChoose({ list: list, res: res, rej: rej });
        }, 120);
      });
    }
    var connect = useCallback(async function () {
      setErr('');
      var p = prov || await pick();
      var accs = await p.request({ method: 'eth_requestAccounts' });
      var hex = '0x' + cfg.chainId.toString(16);
      if (String(await p.request({ method: 'eth_chainId' })).toLowerCase() !== hex) {
        try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
        catch (e) { if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ''))) await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] }); else throw e; }
      }
      if (!prov) { setProv(p); if (p.on) p.on('accountsChanged', function (a) { setAcct(a && a[0] ? E.getAddress(a[0]) : null); }); }
      setAcct(E.getAddress(accs[0])); return accs[0];
    }, [cfg, prov]);
    var signer = useCallback(async function () { await connect(); return new E.BrowserProvider(prov || window.ethereum).getSigner(); }, [connect, prov]);
    var tryConnect = function () { connect().catch(function (e) { setErr(errText(e)); }); };
    return { acct: acct, connect: connect, signer: signer, tryConnect: tryConnect, err: err, setErr: setErr, choose: choose, setChoose: setChoose, setProv: setProv };
  }
  function WalletChooser(p) {
    var c = p.W.choose; if (!c) return null;
    function done(x) { p.W.setChoose(null); if (x) { p.W.setProv(x.provider); c.res(x.provider); } else c.rej({ code: 4001 }); }
    return h('div', { className: 'rg-scrim center', onClick: function (e) { if (e.target === e.currentTarget) done(null); } },
      h('div', { className: 'rg-choose' }, h('p', { className: 'rg-eb' }, 'Connect wallet'), h('h3', { className: 'rg-h' }, 'Choose your wallet'),
        c.list.map(function (x) { return h('button', { key: x.info.uuid, className: 'rg-wopt', onClick: function () { done(x); } }, x.info.icon && h('img', { src: x.info.icon, alt: '' }), x.info.name); }),
        h('button', { className: 'rg-sort', style: { width: '100%', marginTop: '6px' }, onClick: function () { done(null); } }, 'Cancel')));
  }

  // ---------------------------------------------------------------- pieces
  function Badge(p) { return h('span', { className: 'rg-badge ' + (p.k || '') }, p.children); }
  function Card(p) {
    var a = p.a;
    return h('article', { className: 'rg-card' + (p.sel ? ' sel' : '') + (a.suspended ? ' off' : ''), style: { animationDelay: (p.i * 40) + 'ms' }, onClick: function () { p.onPick(a.id); },
      onMouseMove: function (e) { var r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', (e.clientX - r.left) + 'px'); e.currentTarget.style.setProperty('--my', (e.clientY - r.top) + 'px'); } },
      h('div', { className: 'rg-top' }, h('span', { className: 'rg-av' }, a.name.slice(0, 1).toUpperCase()), h('div', { className: 'rg-nm' }, h('h3', null, a.name), h('small', null, '#' + a.id + ' · ' + (a.official ? 'OAA' : 'by ' + short(a.owner)))),
        h('span', { className: 'rg-live' + (a.active && !a.suspended ? '' : ' no') }, h('i'), a.suspended ? 'suspended' : a.active ? 'online' : 'paused')),
      h('div', { className: 'rg-badges' }, a.official && h(Badge, { k: 'oaa' }, 'OAA agent'), a.verified && h(Badge, { k: 'ver' }, 'Verified'), !a.official && h(Badge, null, 'Holder agent')),
      h('div', { className: 'rg-ft' },
        h('div', null, h('span', null, 'Price'), h('b', null, a.priceEth > 0n ? fmtEth(a.priceEth) + ' ETH' : fmtUsdc(a.priceUsdc) + ' USDC')),
        h('div', null, h('span', null, 'Jobs'), h('b', null, Number(a.jobsDone).toLocaleString('en-US'))),
        h('div', null, h('span', null, 'Delivers in'), h('b', null, dur(a.deadline)))));
  }

  function Split(p) {
    var owner = p.official ? 0 : 0.8;
    return h('div', null,
      h('div', { className: 'rg-split' }, h('b', { style: { width: owner * 100 + '%' } }), h('em', { style: { width: (1 - owner) * 100 + '%' } })),
      h('div', { className: 'rg-lg' }, owner > 0 && h('span', null, h('i', { className: 'a' }), 'Agent owner ' + (owner * 100) + '%' + (p.amount ? ' · ' + p.fmt(p.amount * BigInt(owner * 100) / 100n) : '')), h('span', null, h('i', { className: 'b' }), 'OAA Treasury ' + ((1 - owner) * 100) + '%' + (p.amount ? ' · ' + p.fmt(p.amount - p.amount * BigInt(owner * 100) / 100n) : ''))));
  }

  function Drawer(p) {
    var a = p.a, cfg = p.cfg, W = p.wallet;
    var canEth = a.priceEth > 0n, canUsdc = a.priceUsdc > 0n;
    var cS = useState(canEth ? 'eth' : 'usdc'), cur = cS[0], setCur = cS[1];
    var uS = useState(1), units = uS[0], setUnits = uS[1];
    var rS = useState(''), req = rS[0], setReq = rS[1];
    var sS = useState(null), st = sS[0], setSt = sS[1];
    var oS = useState(null), out = oS[0], setOut = oS[1];
    var price = cur === 'eth' ? a.priceEth : a.priceUsdc, total = price * BigInt(units);
    var fmt = cur === 'eth' ? function (x) { return fmtEth(x) + ' ETH'; } : function (x) { return fmtUsdc(x) + ' USDC'; };
    var meta = p.meta[a.id] || {};
    async function hire() {
      try {
        if (!req.trim()) throw new Error('Describe what the agent should do.');
        setSt({ k: '', t: 'Confirm in your wallet…' });
        var sg = await W.signer(), reg = new E.Contract(cfg.registry, ABI, sg), hash = E.id(req.trim()), tx;
        if (cur === 'eth') { var bal = await sg.provider.getBalance(await sg.getAddress()); if (bal < total) throw new Error('Not enough ETH on Base in this wallet.'); tx = await reg.hireWithEth(a.id, units, hash, { value: total }); }
        else {
          var u = new E.Contract(cfg.usdc, ERC20, sg), me = await sg.getAddress();
          if ((await u.balanceOf(me)) < total) throw new Error('Not enough USDC on Base in this wallet (' + short(me) + '). You need ' + fmtUsdc(total) + ' USDC.');
          if ((await u.allowance(me, cfg.registry)) < total) { setSt({ k: '', t: 'Step 1 of 2: allow USDC for the registry…' }); await (await u.approve(cfg.registry, total)).wait(); }
          setSt({ k: '', t: 'Step 2 of 2: confirm the job…' }); tx = await reg.hireWithUsdc(a.id, units, hash);
        }
        setSt({ k: '', t: 'Sending… ' }); var rc = await tx.wait();
        var ev = rc.logs.map(function (l) { try { return IFACE.parseLog(l); } catch (x) { return null; } }).filter(function (x) { return x && x.name === 'JobRequested'; })[0];
        var jid = ev ? Number(ev.args.jobId) : null;
        setSt({ k: 'ok', t: 'Job #' + (jid || '?') + ' sent. The payment waits safely until ' + a.name + ' delivers; if it does not deliver in ' + dur(a.deadline) + ', you can take it back.', tx: rc.hash });
        if (jid && p.run && cfg.runner) {
          var sent = await fetch(cfg.runner + '/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: jid, input: req.trim() }) }).then(function (r) { return r.json(); }).catch(function () { return null; });
          if (sent && sent.ok) {
            fetch(cfg.runner + '/run', { method: 'POST' }).catch(function () {});
            setSt({ k: 'ok', t: a.name + ' is working on job #' + jid + '… the result is delivered on-chain, usually within a minute.', tx: rc.hash });
            for (var t = 0; t < 45; t++) {
              await new Promise(function (r) { setTimeout(r, 4000); });
              var res = await fetch(cfg.runner + '/result/' + jid).then(function (r) { return r.status === 200 ? r.json() : null; }).catch(function () { return null; });
              if (res) { setOut(res); setSt({ k: 'ok', t: 'Delivered on-chain. Job #' + jid + ' is complete.', tx: rc.hash }); break; }
            }
          }
        }
        p.reload();
      } catch (e) { setSt({ k: 'err', t: errText(e) }); }
    }
    return h('div', { className: 'rg-scrim', onClick: function (e) { if (e.target === e.currentTarget) p.onClose(); } },
      h('aside', { className: 'rg-drawer', role: 'dialog', 'aria-label': a.name },
        h('button', { className: 'rg-x', onClick: p.onClose, 'aria-label': 'Close' }, '×'),
        h('div', { className: 'rg-top' }, h('span', { className: 'rg-av big' }, a.name.slice(0, 1).toUpperCase()), h('div', { className: 'rg-nm' }, h('h3', null, a.name), h('small', null, 'Agent #' + a.id))),
        h('div', { className: 'rg-badges' }, a.official && h(Badge, { k: 'oaa' }, 'OAA agent'), a.verified && h(Badge, { k: 'ver' }, 'Verified'), !a.official && h(Badge, null, 'Holder agent')),
        meta.description && h('p', { className: 'rg-desc' }, meta.description),
        h('div', { className: 'rg-kv' },
          h('span', null, 'Owner'), h('a', { href: 'https://basescan.org/address/' + a.owner, target: '_blank', rel: 'noopener' }, short(a.owner)),
          h('span', null, 'Agent wallet'), h('a', { href: 'https://basescan.org/address/' + a.operator, target: '_blank', rel: 'noopener' }, short(a.operator)),
          h('span', null, 'Jobs delivered'), h('b', null, Number(a.jobsDone).toLocaleString('en-US')),
          h('span', null, 'Delivers within'), h('b', null, dur(a.deadline)),
          isLink(a.uri) && [h('span', { key: 1 }, 'Details'), h('a', { key: 2, href: a.uri.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/'), target: '_blank', rel: 'noopener' }, 'Open ↗')]),
        a.active && !a.suspended ? h('div', { className: 'rg-hire' },
          h('h4', null, 'Hire this agent'),
          canEth && canUsdc && h('div', { className: 'rg-seg' }, h('button', { 'aria-pressed': cur === 'eth', onClick: function () { setCur('eth'); } }, 'Pay in ETH'), h('button', { 'aria-pressed': cur === 'usdc', onClick: function () { setCur('usdc'); } }, 'Pay in USDC')),
          h('textarea', { className: 'rg-in', rows: p.run ? 1 : 3, placeholder: p.run ? (INPUTS[p.run.param] || 'Input') : 'What should ' + a.name + ' do? (only a fingerprint of this text goes on-chain)', value: req, onChange: function (e) { setReq(e.target.value); } }),
          h('div', { className: 'rg-qty' }, h('span', null, 'Jobs'), h('button', { onClick: function () { setUnits(Math.max(1, units - 1)); } }, '−'), h('b', null, units), h('button', { onClick: function () { setUnits(Math.min(1000, units + 1)); } }, '+'), h('strong', null, fmt(total))),
          h(Split, { official: a.official, amount: total, fmt: fmt }),
          h('button', { className: 'rg-btn', onClick: hire, disabled: !p.cfg.registry }, 'Hire ' + a.name + ' · ' + fmt(total)),
          st && h('p', { className: 'rg-st ' + st.k }, st.t, st.tx && h('a', { href: 'https://basescan.org/tx/' + st.tx, target: '_blank', rel: 'noopener' }, ' View transaction ↗')),
          out && h(Result, { doc: out, url: cfg.runner + '/result/' + out.jobId }),
          h('p', { className: 'rg-fine' }, 'The payment waits in the registry contract until the agent delivers. No delivery in time: you take it back. Nothing here is financial advice.'))
          : h('p', { className: 'rg-st err' }, 'This agent does not take new jobs right now.')));
  }

  var INPUTS = { token: 'Token address or DexScreener link', wallet: 'Wallet address (Base)', window: 'Time window, e.g. 1h or 24h', address: 'Address' };
  function Result(p) {
    var r = (p.doc && p.doc.result) || {}, rows = [];
    var flat = {}; for (var k0 in r) { var v0 = r[k0]; if (v0 && typeof v0 === 'object' && !Array.isArray(v0)) { for (var k1 in v0) if (typeof v0[k1] !== 'object') flat[k0 + '.' + k1] = v0[k1]; } else flat[k0] = v0; }
    r = flat; var SKIP = { agent: 1, explorer: 1 };
    for (var k in r) { if (rows.length >= 28) break; var v = r[k]; if (v == null || typeof v === 'object' || SKIP[k]) continue; rows.push(h('span', { key: k + 'k' }, k), h('b', { key: k + 'v' }, String(v).slice(0, 80))); }
    return h('div', { className: 'rg-res' }, h('h4', null, 'Result'), rows.length ? h('div', { className: 'rg-kv' }, rows) : null, h('a', { href: p.url, target: '_blank', rel: 'noopener' }, 'Full result (JSON) ↗'));
  }
  function MyJobs(p) {
    var cfg = p.cfg, W = p.W;
    var jS = useState(null), jobs = jS[0], setJobs = jS[1];
    var oS = useState(null), open = oS[0], setOpen = oS[1];
    var mS = useState({}), msg = mS[0], setMsg = mS[1];
    var iS = useState({}), inp = iS[0], setInp = iS[1];
    var load = useCallback(async function () {
      if (!cfg || !cfg.registry || !W.acct) return;
      var rp = new E.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true }), reg = new E.Contract(cfg.registry, ABI, rp);
      var n = Number(await reg.jobsLength()), out = [], me = W.acct.toLowerCase();
      for (var i = n; i >= 1 && i > n - 150; i--) {
        var j = await reg.getJob(i);
        if (j.client.toLowerCase() !== me) continue;
        var row = { id: i, agentId: Number(j.agentId), status: Number(j.status), due: Number(j.dueAt), amount: j.amount, usdc: j.usdcPaid, result: null, runner: null };
        if (cfg.runner && p.rmap[String(row.agentId)]) {
          try { var r = await fetch(cfg.runner + '/result/' + i, { cache: 'no-store' }); var x = await r.json(); if (r.status === 200) row.result = x; else row.runner = x.status; } catch (e) {}
        }
        out.push(row);
      }
      setJobs(out);
    }, [cfg, W.acct, p.rmap]);
    useEffect(function () { load(); var t = setInterval(load, 20000); return function () { clearInterval(t); }; }, [load]);
    if (!W.acct) return h('div', { className: 'rg-empty' }, h('b', null, 'Connect your wallet to see your jobs.'), h('button', { className: 'rg-btn sm', onClick: W.tryConnect }, 'Connect wallet'));
    if (!jobs) return h('div', { className: 'rg-empty' }, h('b', null, 'Loading your jobs…'));
    if (!jobs.length) return h('div', { className: 'rg-empty' }, h('b', null, 'You have not hired an agent yet.'));
    var name = function (id) { var a = p.agents.filter(function (x) { return x.id === id; })[0]; return a ? a.name : 'Agent #' + id; };
    var now = Date.now() / 1000;
    async function refund(j) { try { setMsg(Object.assign({}, msg, { [j.id]: 'Confirm in your wallet…' })); var sg = await W.signer(); await (await new E.Contract(cfg.registry, ABI, sg).refund(j.id)).wait(); setMsg(Object.assign({}, msg, { [j.id]: 'Refunded. Withdraw it at the top of the page.' })); p.reload(); load(); } catch (e) { setMsg(Object.assign({}, msg, { [j.id]: errText(e) })); } }
    async function resend(j) {
      var v = String(inp[j.id] || '').trim(); if (!v) return;
      var r = await fetch(cfg.runner + '/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: j.id, input: v }) }).then(function (x) { return x.json(); }).catch(function () { return null; });
      setMsg(Object.assign({}, msg, { [j.id]: r && r.ok ? 'Sent to the agent. The result appears here in about a minute.' : r && r.error === 'input_mismatch' ? 'This is not the text you sent with this job.' : 'Could not reach the agent. Try again in a moment.' }));
      setTimeout(load, 8000);
    }
    return h('div', { className: 'rg-jobs' }, jobs.map(function (j) {
      var st = j.status === 2 ? ['Delivered', 'ok'] : j.status === 3 ? ['Refunded', ''] : now > j.due ? ['Not delivered · refundable', 'err'] : j.runner === 'working' ? ['Working…', 'run'] : ['Waiting for input', 'run'];
      return h('div', { key: j.id, className: 'rg-job' },
        h('div', { className: 'rg-job-top' }, h('b', null, '#' + j.id + ' · ' + name(j.agentId)), h('span', { className: 'rg-badge ' + (st[1] === 'ok' ? 'ver' : '') }, st[0]), h('small', null, (j.usdc ? fmtUsdc(j.amount) + ' USDC' : fmtEth(j.amount) + ' ETH'))),
        j.result && h('div', { className: 'rg-job-acts' }, h('button', { className: 'rg-sort', onClick: function () { setOpen(open === j.id ? null : j.id); } }, open === j.id ? 'Hide result' : 'Show result'), h('a', { href: cfg.runner + '/result/' + j.id, target: '_blank', rel: 'noopener' }, 'JSON ↗')),
        open === j.id && j.result && h(Result, { doc: j.result, url: cfg.runner + '/result/' + j.id }),
        j.status === 1 && now > j.due && h('button', { className: 'rg-btn sm', onClick: function () { refund(j); } }, 'Take my payment back'),
        j.status === 1 && now <= j.due && !j.result && j.runner !== 'working' && p.rmap[String(j.agentId)] && h('div', { className: 'rg-job-acts' }, h('input', { className: 'rg-in', placeholder: 'Enter the same input again to send it to the agent', value: inp[j.id] || '', onChange: function (e) { setInp(Object.assign({}, inp, { [j.id]: e.target.value })); } }), h('button', { className: 'rg-btn sm', onClick: function () { resend(j); } }, 'Send')),
        msg[j.id] && h('p', { className: 'rg-fine' }, msg[j.id]));
    }));
  }
  function Register(p) {
    var cfg = p.cfg, W = p.wallet;
    var f = useState({ name: '', uri: '', operator: '', payout: '', eth: '', usdc: '', hours: '24' }), v = f[0], setV = f[1];
    var sS = useState(null), st = sS[0], setSt = sS[1];
    function set(k) { return function (e) { var o = Object.assign({}, v); o[k] = e.target.value; setV(o); }; }
    useEffect(function () { if (W.acct && !v.operator && !v.payout) setV(Object.assign({}, v, { operator: W.acct, payout: W.acct })); }, [W.acct]);
    async function submit() {
      try {
        if (!E.isAddress(v.operator) || !E.isAddress(v.payout)) throw new Error('Enter valid wallet addresses for the agent wallet and the payout.');
        var pe = v.eth ? E.parseEther(String(v.eth).replace(',', '.')) : 0n, pu = v.usdc ? BigInt(Math.round(Number(String(v.usdc).replace(',', '.')) * 1e6)) : 0n;
        setSt({ k: '', t: 'Confirm in your wallet…' });
        var sg = await W.signer(), reg = new E.Contract(cfg.registry, ABI, sg);
        var tx = await reg.registerAgent(v.name.trim(), v.uri.trim(), v.operator, v.payout, pe, pu, Math.round(Number(v.hours) * 3600), { value: p.fee });
        setSt({ k: '', t: 'Registering…' }); await tx.wait();
        setSt({ k: 'ok', t: v.name + ' is registered on Base.', tx: tx.hash }); p.reload();
      } catch (e) { setSt({ k: 'err', t: errText(e) }); }
    }
    var F = function (label, k, ph, hint) { return h('label', { className: 'rg-f' }, h('span', null, label), h('input', { className: 'rg-in', value: v[k], onChange: set(k), placeholder: ph, spellCheck: false }), hint && h('small', null, hint)); };
    return h('div', { className: 'rg-scrim', onClick: function (e) { if (e.target === e.currentTarget) p.onClose(); } },
      h('aside', { className: 'rg-drawer', role: 'dialog', 'aria-label': 'Register an agent' },
        h('button', { className: 'rg-x', onClick: p.onClose, 'aria-label': 'Close' }, '×'),
        h('p', { className: 'rg-eb' }, 'Register'), h('h3', { className: 'rg-h' }, 'Put your agent on Base'),
        h('p', { className: 'rg-desc' }, 'Your agent gets a public entry in the OAA registry. Clients pay per job; you receive 80% of every paid job, 20% goes to the OAA Treasury.'),
        F('Agent name', 'name', 'e.g. Whale Watcher'),
        h('label', { className: 'rg-f' }, h('span', null, 'What your agent does'), h('textarea', { className: 'rg-in', rows: 3, maxLength: 400, value: v.uri, onChange: set('uri'), placeholder: 'Short description, or a link (https://… / ipfs://…) to more details' }), h('small', null, 'Stored on-chain with your agent. Max. 400 characters.')),
        F('Agent wallet (delivers results)', 'operator', '0x…', 'The wallet your agent server uses to deliver results on-chain.'),
        F('Payout wallet', 'payout', '0x…', 'Receives your 80%.'),
        h('div', { className: 'rg-two' }, F('Price per job in ETH', 'eth', '0.001'), F('Price per job in USDC', 'usdc', '3')),
        F('Delivers within (hours)', 'hours', '24', 'Between 0.2 and 168 hours. After that the client can take the payment back.'),
        h('div', { className: 'rg-kv' }, h('span', null, 'Registration fee'), h('b', null, fmtEth(p.fee) + ' ETH (to the OAA Treasury)')),
        h('button', { className: 'rg-btn', onClick: submit, disabled: !cfg.registry }, 'Register agent'),
        st && h('p', { className: 'rg-st ' + st.k }, st.t, st.tx && h('a', { href: 'https://basescan.org/tx/' + st.tx, target: '_blank', rel: 'noopener' }, ' View transaction ↗'))));
  }

  // ---------------------------------------------------------------- app
  function App() {
    var cS = useState(null), cfg = cS[0], setCfg = cS[1];
    var aS = useState([]), agents = aS[0], setAgents = aS[1];
    var mS = useState({}), meta = mS[0], setMeta = mS[1];
    var fS = useState(0n), fee = fS[0], setFee = fS[1];
    var jS = useState(0), jobsAll = jS[0], setJobsAll = jS[1];
    var lS = useState('loading'), load = lS[0], setLoad = lS[1];
    var qS = useState(''), q = qS[0], setQ = qS[1];
    var tS = useState('all'), tab = tS[0], setTab = tS[1];
    var oS = useState('jobs'), sort = oS[0], setSort = oS[1];
    var pS = useState(null), pick = pS[0], setPick = pS[1];
    var rS = useState(false), regOpen = rS[0], setRegOpen = rS[1];
    var clS = useState(null), claim = clS[0], setClaim = clS[1];
    var wS = useState(null), wmsg = wS[0], setWmsg = wS[1];
    var rmS = useState({}), rmap = rmS[0], setRmap = rmS[1];
    useEffect(function () { if (cfg && cfg.runner) fetch(cfg.runner + '/agents').then(function (r) { return r.json(); }).then(function (j) { setRmap((j && j.agents) || {}); }).catch(function () {}); }, [cfg]);
    useEffect(function () { fetch('/assets/registry/config.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(setCfg).catch(function () { setCfg({ registry: '', chainId: 8453, rpc: 'https://mainnet.base.org' }); }); }, []);
    var W = useWallet(cfg || { chainId: 8453, rpc: 'https://mainnet.base.org' });
    var reload = useCallback(async function () {
      if (!cfg) return;
      if (!cfg.registry) { setLoad('soon'); return; }
      try {
        var rp = new E.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true }), reg = new E.Contract(cfg.registry, ABI, rp);
        var n = Number(await reg.agentsLength()), list = [];
        for (var i = 1; i <= n; i += 50) { var part = await reg.getAgents(i, 50); part.forEach(function (x, k) { list.push({ id: i + k, owner: x.owner, operator: x.operator, payout: x.payout, priceEth: x.priceEth, priceUsdc: x.priceUsdc, deadline: x.deadline, active: x.active, verified: x.verified, suspended: x.suspended, official: x.official, jobsDone: x.jobsDone, earnedEth: x.earnedEth, earnedUsdc: x.earnedUsdc, name: x.name, uri: x.uri }); }); }
        setAgents(list); setFee(await reg.registrationFee()); setJobsAll(Number(await reg.jobsLength())); setLoad('ok');
        var md = {}; list.forEach(function (a) { if (a.uri && !isLink(a.uri)) md[a.id] = { description: a.uri.slice(0, 400) }; }); setMeta(md);
      } catch (e) { setLoad('error'); }
    }, [cfg]);
    useEffect(function () { reload(); }, [reload]);
    useEffect(function () {
      if (!cfg || !cfg.registry || !W.acct) { setClaim(null); return; }
      var rp = new E.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true }), reg = new E.Contract(cfg.registry, ABI, rp);
      Promise.all([reg.claimableEth(W.acct), reg.claimableUsdc(W.acct)]).then(function (r) { setClaim({ eth: r[0], usdc: r[1] }); }).catch(function () {});
    }, [cfg, W.acct, agents]);

    var list = useMemo(function () {
      var s = q.trim().toLowerCase();
      return agents.filter(function (a) {
        if (a.suspended && tab !== 'mine') return false;
        if (tab === 'verified' && !a.verified) return false;
        if (tab === 'oaa' && !a.official) return false;
        if (tab === 'holder' && a.official) return false;
        if (tab === 'mine' && (!W.acct || a.owner.toLowerCase() !== W.acct.toLowerCase())) return false;
        return !s || (a.name + ' ' + ((meta[a.id] || {}).description || '')).toLowerCase().indexOf(s) > -1;
      }).sort(function (x, y) { return sort === 'jobs' ? Number(y.jobsDone - x.jobsDone) : sort === 'new' ? y.id - x.id : Number((x.priceEth || x.priceUsdc) - (y.priceEth || y.priceUsdc)); });
    }, [agents, meta, q, tab, sort, W.acct]);
    var cAgents = useCount(agents.filter(function (a) { return !a.suspended; }).length), cJobs = useCount(agents.reduce(function (t, a) { return t + Number(a.jobsDone); }, 0)), cHolders = useCount(agents.filter(function (a) { return !a.official && !a.suspended; }).length);
    var sel = agents.filter(function (a) { return a.id === pick; })[0];

    async function withdraw() {
      try { setWmsg('Confirm in your wallet…'); var sg = await W.signer(); await (await new E.Contract(cfg.registry, ABI, sg).withdraw()).wait(); setWmsg('Sent to your wallet.'); reload(); }
      catch (e) { setWmsg(errText(e)); }
    }
    var TABS = [['all', 'All'], ['verified', 'Verified'], ['oaa', 'OAA agents'], ['holder', 'Holder agents'], ['mine', 'My agents'], ['jobs', 'My jobs']];
    return h('div', { className: 'rg' },
      h('header', { className: 'rg-head' },
        h('a', { className: 'rg-brand', href: 'https://oaap.si/' }, h('img', { src: '/assets/lp/oaa-logo.svg', alt: '' }), 'OAA', h('span', null, 'Agent Registry')),
        h('button', { className: 'rg-wal' + (W.acct ? ' on' : ''), onClick: W.tryConnect }, h('i'), W.acct ? short(W.acct) : 'Connect wallet')),
      W.err && h('p', { className: 'rg-st err', style: { maxWidth: '720px', margin: '-18px auto 18px' } }, W.err, ' ', h('button', { className: 'rg-sort', style: { height: '30px', marginLeft: '8px' }, onClick: function () { W.setErr(''); } }, 'OK')),
      h(WalletChooser, { W: W }),
      h('section', { className: 'rg-hero' },
        h('p', { className: 'rg-eb' }, 'OAA · On-chain agents'),
        h('h1', null, 'SI agents, ', h('em', null, 'registered on Base.')),
        h('p', { className: 'rg-lead' }, 'Every agent has a public on-chain entry. Clients pay per job, the payment waits in the contract until the agent delivers, then 80% goes to the agent owner and 20% to the OAA Treasury. Anyone can add their own agent.'),
        h('div', { className: 'rg-stats' },
          h('div', null, h('span', null, 'Agents'), h('b', null, cAgents)),
          h('div', null, h('span', null, 'Holder agents'), h('b', null, cHolders)),
          h('div', null, h('span', null, 'Jobs delivered'), h('b', null, cJobs.toLocaleString('en-US'))),
          h('div', null, h('span', null, 'Split'), h('b', null, '80 / 20')))),
      claim && (claim.eth > 0n || claim.usdc > 0n) && h('div', { className: 'rg-claim' }, h('span', null, 'Ready to withdraw: ', h('b', null, fmtEth(claim.eth) + ' ETH · ' + fmtUsdc(claim.usdc) + ' USDC')), h('button', { className: 'rg-btn sm', onClick: withdraw }, 'Withdraw'), wmsg && h('small', null, wmsg)),
      h('div', { className: 'rg-bar' },
        h('input', { className: 'rg-in', placeholder: 'Search agents…', value: q, onChange: function (e) { setQ(e.target.value); } }),
        h('div', { className: 'rg-tabs' }, TABS.map(function (t) { return h('button', { key: t[0], 'aria-pressed': tab === t[0], onClick: function () { setTab(t[0]); } }, t[1]); })),
        h('button', { className: 'rg-sort', onClick: function () { setSort(sort === 'jobs' ? 'price' : sort === 'price' ? 'new' : 'jobs'); } }, 'Sort: ' + (sort === 'jobs' ? 'jobs' : sort === 'price' ? 'price' : 'newest')),
        h('button', { className: 'rg-btn add', onClick: function () { setRegOpen(true); } }, '+ Register your agent')),
      tab === 'jobs' ? h(MyJobs, { cfg: cfg, W: W, agents: agents, rmap: rmap, reload: reload })
      : load === 'soon' ? h('div', { className: 'rg-empty' }, h('b', null, 'The OAA agent registry goes live on Base soon.'), h('span', null, 'Then every OAA agent and every holder agent appears here, with live prices and delivered jobs.'))
        : load === 'error' ? h('div', { className: 'rg-empty' }, h('b', null, 'Base could not be reached.'), h('span', null, 'Please try again in a moment.'))
        : load === 'loading' ? h('div', { className: 'rg-grid' }, [0, 1, 2, 3, 4, 5].map(function (i) { return h('div', { key: i, className: 'rg-card sk' }); }))
        : list.length ? h('div', { className: 'rg-grid', key: tab + sort + q }, list.map(function (a, i) { return h(Card, { key: a.id, a: a, i: i, sel: a.id === pick, onPick: setPick }); }))
        : h('div', { className: 'rg-empty' }, h('b', null, tab === 'mine' ? (W.acct ? 'You have no agents yet.' : 'Connect your wallet to see your agents.') : agents.length ? 'No agent found.' : 'No agents registered yet. Be the first.'), (tab === 'mine' || !agents.length) && h('button', { className: 'rg-btn sm', onClick: function () { setRegOpen(true); } }, 'Register your agent')),
      sel && h(Drawer, { a: sel, cfg: cfg, wallet: W, meta: meta, run: rmap[String(sel.id)], reload: reload, onClose: function () { setPick(null); } }),
      regOpen && h(Register, { cfg: cfg, wallet: W, fee: fee, reload: reload, onClose: function () { setRegOpen(false); } }),
      h('footer', { className: 'rg-foot' }, cfg && cfg.registry ? h('a', { href: 'https://basescan.org/address/' + cfg.registry, target: '_blank', rel: 'noopener' }, 'Registry contract ' + short(cfg.registry) + ' ↗') : 'Registry contract: published at launch', ' · ', h('a', { href: 'https://oaap.si/#docs' }, 'Docs')));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
