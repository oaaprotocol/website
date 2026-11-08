/* Deploy page: OAA Time Capsule (no owner, no constructor arguments). The connected wallet deploys and signs. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); }, build = null;
  function S(k, h) { var s = $('#sTC'); s.className = 'st-line on' + (k ? ' ' + k : ''); s.querySelector('span').innerHTML = h; }
  fetch('/assets/lp/capsule-build.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { build = j; });
  $('#tcDeploy').onclick = async function () {
    var btn = this; if (!build) return S('err', 'The build file is still loading.');
    btn.disabled = true;
    try {
      var a = await L.connect(); S('', 'Confirm the deployment in your wallet…');
      var gas = await L.rpc('eth_estimateGas', [{ from: a, data: build.bytecode }]);
      var hash = await L.sendTx({ data: build.bytecode, gas: '0x' + (BigInt(gas) * 120n / 100n).toString(16) });
      S('', 'Deploying… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1' || !rc.contractAddress) throw new Error('The deployment failed on-chain.');
      $('#cTC').classList.add('done');
      S('ok', 'Time Capsule deployed at <a href="https://basescan.org/address/' + rc.contractAddress + '" target="_blank" rel="noopener">' + rc.contractAddress + '</a>. Send this address to Claude so the website can use it.');
      try {
        var r = await fetch('https://sourcify.dev/server/v2/verify/metadata/8453/' + rc.contractAddress, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: { 'OAATimeCapsule.sol': build.files['OAATimeCapsule.sol'] }, metadata: JSON.parse(build.files['metadata.json']) }) });
        if (r.ok) S('ok', $('#sTC span').innerHTML + ' Source code sent to Sourcify for verification.');
      } catch (e) {}
    } catch (e) { S('err', L.esc(L.errText(e))); }
    finally { btn.disabled = false; }
  };
})();
