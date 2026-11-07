/* Deploy page for OAALaunchpad: the connected wallet deploys and signs. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var ARGS = [
    ['_positionManager', '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1', 'Uniswap V3 position manager'],
    ['_swapRouter', '0x2626664c2603336E57B271c5C0b26F421741e481', 'Uniswap SwapRouter02'],
    ['_v4PoolManager', '0x498581fF718922c3f8e6A244956aF099B2652b2b', 'Uniswap V4 PoolManager (only for the $OAA buyback)'],
    ['_weth', '0x4200000000000000000000000000000000000006', 'WETH on Base'],
    ['_ethUsdFeed', '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', 'Chainlink ETH / USD'],
    ['_sequencerFeed', '0xBCF85224fc0756B9Fa45aA7892530B47e10b6433', 'Chainlink Base sequencer uptime'],
    ['_treasury', '0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834', 'OAA Treasury Safe']
  ];
  var SAFE = '0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834', build = null;
  $('#args').innerHTML = ARGS.map(function (a) { return '<span>' + a[2] + '</span><code><a href="https://basescan.org/address/' + a[1] + '" target="_blank" rel="noopener">' + a[1] + '</a></code>'; }).join('');
  function S(id, k, h) { var s = $(id); s.className = 'st-line on' + (k ? ' ' + k : ''); s.querySelector('span').innerHTML = h; }
  var wb = $('#wBtn');
  L.onAccount(function (a) { wb.classList.toggle('on', !!a); $('#wTxt').textContent = a ? L.short(a) : 'Connect wallet'; });
  wb.onclick = function () { L.connect().catch(function () {}); };
  fetch('/assets/lp/launchpad-build.json?v=20261107uni').then(function (r) { return r.json(); }).then(function (b) { build = b; $('#solc').textContent = 'solc ' + b.compiler; });
  try { var saved = localStorage.getItem('oaa_lp_addr'); if (saved) $('#lpAddr').value = saved; } catch (e) {}

  $('#deployBtn').onclick = async function () {
    var btn = this; if (!build) return S('#s1', 'err', 'The build file is still loading.');
    btn.disabled = true;
    try {
      S('#s1', '', 'Connect your wallet…');
      var a = await L.connect();
      var data = build.bytecode + ARGS.map(function (x) { return L.encAddr(x[1]); }).join('');
      var gas = await L.rpc('eth_estimateGas', [{ from: a, data: data }]);
      S('#s1', '', 'Confirm the deployment in your wallet (estimated gas ' + parseInt(gas, 16).toLocaleString('en-US') + ')…');
      var hash = await L.sendTx({ data: data, gas: '0x' + (BigInt(gas) * 120n / 100n).toString(16) });
      S('#s1', '', 'Deploying… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1' || !rc.contractAddress) throw new Error('The deployment failed on-chain.');
      $('#lpAddr').value = rc.contractAddress;
      try { localStorage.setItem('oaa_lp_addr', rc.contractAddress); } catch (e) {}
      $('#c1').classList.add('done');
      S('#s1', 'ok', 'Deployed at <a href="https://basescan.org/address/' + rc.contractAddress + '" target="_blank" rel="noopener">' + rc.contractAddress + '</a>. Next: click \u201cPause launches\u201d below.');
    } catch (e) { S('#s1', 'err', L.esc(L.errText(e))); }
    finally { btn.disabled = false; }
  };

  $('#verifyBtn').onclick = async function () {
    var addr = $('#lpAddr').value.trim(); if (!L.isAddr(addr)) return S('#s2', 'err', 'Enter the launchpad address.');
    if (!build) return S('#s2', 'err', 'The build file is still loading.');
    S('#s2', '', 'Sending the source code to Sourcify…');
    try {
      var sources = {}; for (var k in build.files) if (k !== 'metadata.json') sources[k] = build.files[k];
      var r = await fetch('https://sourcify.dev/server/v2/verify/metadata/8453/' + addr, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: sources, metadata: JSON.parse(build.files['metadata.json']) }) });
      var j = await r.json();
      if (!j.verificationId) throw new Error((j && (j.message || j.customCode)) || 'Sourcify did not accept the files.');
      for (var i = 0; i < 40; i++) {
        await L.sleep(3000);
        var st = await fetch('https://sourcify.dev/server/v2/verify/' + j.verificationId).then(function (x) { return x.json(); });
        if (st.isJobCompleted) {
          var m = st.contract && st.contract.match;
          if (m) { $('#c2').classList.add('done'); S('#s2', 'ok', 'Verified (' + m.replace('_', ' ') + '). <a href="https://repo.sourcify.dev/8453/' + addr + '" target="_blank" rel="noopener">Open on Sourcify</a>'); return; }
          throw new Error((st.error && st.error.message) || 'Sourcify could not match the code.');
        }
      }
      throw new Error('Sourcify is still working. Check again in a few minutes.');
    } catch (e) { S('#s2', 'err', L.esc(e.message || String(e))); }
  };

  async function pState(addr) {
    var p = BigInt(await L.call(addr, '0x5c975abb')) !== 0n;
    $('#pState').textContent = p ? 'PAUSED \u2014 nobody can launch' : 'OPEN \u2014 anyone can launch';
    return p;
  }
  async function setPause(on) {
    var addr = $('#lpAddr').value.trim(); if (!L.isAddr(addr)) return S('#sP', 'err', 'Enter the launchpad address in step 2 first.');
    try {
      var a = await L.connect();
      var owner = L.wordAddr(await L.call(addr, '0x8da5cb5b'), 0);
      if (owner.toLowerCase() !== a.toLowerCase()) throw new Error('Only the owner (' + owner + ') can do this. If the Safe is the owner, use the Safe app.');
      S('#sP', '', 'Confirm in your wallet\u2026');
      var hash = await L.sendTx({ to: addr, data: '0x16c38b3c' + L.encUint(on ? 1 : 0) });
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1') throw new Error('The transaction failed on-chain.');
      await pState(addr);
      S('#sP', 'ok', on ? 'Launches are paused. The website shows \u201copens with the $OAA launch\u201d.' : 'Launches are open.');
    } catch (e) { S('#sP', 'err', L.esc(L.errText(e))); }
  }
  $('#pauseBtn').onclick = function () { setPause(true); };
  $('#unpauseBtn').onclick = function () { setPause(false); };
  $('#pCheck').onclick = function () { var addr = $('#lpAddr').value.trim(); if (L.isAddr(addr)) pState(addr).catch(function (e) { S('#sP', 'err', L.esc(L.errText(e))); }); };

  $('#ownBtn').onclick = async function () {
    var addr = $('#lpAddr').value.trim(); if (!L.isAddr(addr)) return S('#s3', 'err', 'Enter the launchpad address in step 2 first.');
    try {
      var a = await L.connect();
      var owner = L.wordAddr(await L.call(addr, '0x8da5cb5b'), 0);
      if (owner.toLowerCase() !== a.toLowerCase()) throw new Error('Only the current owner (' + owner + ') can start the transfer.');
      S('#s3', '', 'Confirm in your wallet…');
      var hash = await L.sendTx({ to: addr, data: '0xf2fde38b' + L.encAddr(SAFE) });
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1') throw new Error('The transaction failed on-chain.');
      $('#c3').classList.add('done');
      S('#s3', 'ok', 'Started. Now open the Safe app and call acceptOwnership() on ' + addr + ' from the Treasury Safe.');
    } catch (e) { S('#s3', 'err', L.esc(L.errText(e))); }
  };

  // $OAA buyback pool (Uniswap V4, hooks = 0, paired with native ETH or WETH). Owner only, before the hand-over to the Safe.
  async function bbState(addr) {
    var v4 = BigInt(await L.call(addr, '0x422242f2')) !== 0n, pool = L.wordAddr(await L.call(addr, '0x47446570'), 0);
    var res = BigInt(await L.call(addr, '0xff909560')), burned = BigInt(await L.call(addr, '0xc4eecf8e'));
    $('#bState').textContent = (/^0x0{40}$/i.test(pool) ? 'not set yet' : (v4 ? 'Uniswap V4 set' : 'Uniswap V3 set')) + ' · waiting ' + (Number(res) / 1e18).toFixed(6) + ' ETH · burned ' + Math.round(Number(burned) / 1e18).toLocaleString('en-US') + ' OAA';
  }
  $('#bCheck').onclick = function () { var addr = $('#lpAddr').value.trim(); if (L.isAddr(addr)) bbState(addr).catch(function (e) { S('#sB', 'err', L.esc(L.errText(e))); }); };
  $('#bSet').onclick = async function () {
    var addr = $('#lpAddr').value.trim(); if (!L.isAddr(addr)) return S('#sB', 'err', 'Enter the launchpad address in step 2 first.');
    var pair = $('#bPair').value, fee = parseInt($('#bFee').value, 10), ts = parseInt($('#bTs').value, 10);
    if (!((fee >= 0 && fee < 1000000) || fee === 8388608) || !(ts > 0 && ts < 32768)) return S('#sB', 'err', 'Enter the fee (10000 = 1%, 8388608 = dynamic fee of the launch hook pool) and the tick spacing of the $OAA pool.');
    try {
      var a = await L.connect();
      var owner = L.wordAddr(await L.call(addr, '0x8da5cb5b'), 0);
      if (owner.toLowerCase() !== a.toLowerCase()) throw new Error('Only the owner (' + owner + ') can do this. If the Safe is the owner, use the Safe app.');
      S('#sB', '', 'Confirm in your wallet…');
      var hk = ($('#bHook').value || '').trim() || '0x0000000000000000000000000000000000000000'; if (!L.isAddr(hk)) throw new Error('Enter the hook address (or leave it empty for a pool without hook).');
      var hash = await L.sendTx({ to: addr, data: '0x74c5ceeb' + L.encAddr('0x70107c4AA2DC031eF7afc350e03784c2325aBE29') + L.encAddr(pair) + L.encUint(fee) + L.encUint(ts) + L.encAddr(hk) });
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1') throw new Error('The transaction failed on-chain (pool not found? check fee, tick spacing and the hook address).');
      $('#cB').classList.add('done'); await bbState(addr);
      S('#sB', 'ok', 'Buyback pool set. From now on 0.3% of every buy on the launchpad buys $OAA and burns it.');
    } catch (e) { S('#sB', 'err', L.esc(L.errText(e))); }
  };
})();
