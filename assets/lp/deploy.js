/* Deploy page for OAALaunchpad: the connected wallet deploys and signs. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var ARGS = [
    ['_positionManager', '0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53', 'Aerodrome Slipstream position manager'],
    ['_swapRouter', '0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F', 'Aerodrome Slipstream swap router'],
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
  fetch('/assets/lp/launchpad-build.json?v=20261101b').then(function (r) { return r.json(); }).then(function (b) { build = b; $('#solc').textContent = 'solc ' + b.compiler; });
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
      var r = await fetch('https://sourcify.dev/server/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, chain: '8453', files: build.files }) });
      var j = await r.json();
      var st = j && j.result && j.result[0] && j.result[0].status;
      if (st === 'perfect' || st === 'partial') { $('#c2').classList.add('done'); S('#s2', 'ok', 'Verified (' + st + ' match). <a href="https://repo.sourcify.dev/8453/' + addr + '" target="_blank" rel="noopener">Open on Sourcify</a>'); }
      else throw new Error((j && (j.error || j.message)) || 'Sourcify did not accept the files.');
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
})();
