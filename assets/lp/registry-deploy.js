/* Deploy page: OAA Agent Registry (on-chain agents). The connected wallet deploys and signs. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var SAFE = '0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834', USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', build = null;
  function S(id, k, h) { var s = $(id); s.className = 'st-line on' + (k ? ' ' + k : ''); s.querySelector('span').innerHTML = h; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
  var addrIn = $('#rgAddr'); if (ls('oaa_registry_addr')) addrIn.value = ls('oaa_registry_addr');
  fetch('/assets/lp/registry-build.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { build = j; $('#rgSolc').textContent = 'solc ' + j.compiler.split('+')[0]; }).catch(function () { S('#sR1', 'err', 'Could not load the registry build file.'); });
  $('#rgDeploy').onclick = async function () {
    var btn = this; if (!build) return S('#sR1', 'err', 'The build file is still loading.');
    var fee = String($('#rgFee').value || '0').replace(',', '.');
    if (!(Number(fee) >= 0 && Number(fee) <= 0.05)) return S('#sR1', 'err', 'The registration fee must be between 0 and 0.05 ETH.');
    btn.disabled = true;
    try {
      var a = await L.connect();
      var data = build.bytecode + L.encAddr(SAFE) + L.encAddr(USDC) + L.encUint(L.toWei(fee));
      S('#sR1', '', 'Confirm the deployment in your wallet…');
      var gas = await L.rpc('eth_estimateGas', [{ from: a, data: data }]);
      var hash = await L.sendTx({ data: data, gas: '0x' + (BigInt(gas) * 120n / 100n).toString(16) });
      S('#sR1', '', 'Deploying… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1' || !rc.contractAddress) throw new Error('The deployment failed on-chain.');
      addrIn.value = rc.contractAddress; ls('oaa_registry_addr', rc.contractAddress); $('#cR1').classList.add('done');
      S('#sR1', 'ok', 'Registry deployed at <a href="https://basescan.org/address/' + rc.contractAddress + '" target="_blank" rel="noopener">' + rc.contractAddress + '</a>. Copy this address and send it to Claude: it goes into the website config so the registry page shows it. Next: verify.');
    } catch (e) { S('#sR1', 'err', L.esc(L.errText(e))); }
    finally { btn.disabled = false; }
  };
  $('#rgVerify').onclick = async function () {
    var addr = addrIn.value.trim(); if (!L.isAddr(addr)) return S('#sR2', 'err', 'Enter the registry address.');
    if (!build) return S('#sR2', 'err', 'The build file is still loading.');
    S('#sR2', '', 'Sending the source code to Sourcify…');
    try {
      var sources = {}; for (var k in build.files) if (k !== 'metadata.json') sources[k] = build.files[k];
      var r = await fetch('https://sourcify.dev/server/v2/verify/metadata/8453/' + addr, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: sources, metadata: JSON.parse(build.files['metadata.json']) }) });
      var j = await r.json(); if (!j.verificationId) throw new Error((j && (j.message || j.customCode)) || 'Sourcify did not accept the files.');
      for (var i = 0; i < 40; i++) {
        await L.sleep(3000);
        var st = await fetch('https://sourcify.dev/server/v2/verify/' + j.verificationId).then(function (x) { return x.json(); });
        if (st.isJobCompleted) { var m = st.contract && st.contract.match; if (m) { $('#cR2').classList.add('done'); return S('#sR2', 'ok', 'Verified (' + m.replace('_', ' ') + ').'); } throw new Error((st.error && st.error.message) || 'Sourcify could not match the code.'); }
      }
      throw new Error('Sourcify is still working. Check again in a few minutes.');
    } catch (e) { S('#sR2', 'err', L.esc(e.message || String(e))); }
  };
})();
