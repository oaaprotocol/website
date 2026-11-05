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
  // ---------------------------------------------------------------- A3: register OAA's own agents (official, 100% to the treasury)
  var OAA_AGENTS = [{"id": "sentinel", "name": "Sentinel", "usd": 0.1, "param": "token", "text": "Checks any token before you buy: honeypot simulation, buy and sell tax, mint and owner rights, blacklist, proxy and liquidity lock."}, {"id": "guardian", "name": "Guardian", "usd": 0.5, "param": "wallet", "text": "Scans a Base wallet: a risk grade for every token you hold, likely spam airdrops, and open approvals you should revoke – in one health score."}, {"id": "radar", "name": "Radar", "usd": 0.25, "param": "window", "text": "Lists the newest pools on Base and rates each token with the Sentinel checks, so you only spend time on launches that pass the basics."}, {"id": "whale", "name": "Whale", "usd": 0.3, "param": "token", "text": "Shows what the largest wallets of a token did in the last 24 hours: accumulating, distributing or leaving – plus the biggest transfers."}, {"id": "decoder", "name": "Decoder", "usd": 0.5, "param": "address", "text": "Reads a verified smart contract and explains in plain language what it can do, who controls it and where the risks are."}, {"id": "tokenomics", "name": "Tally", "usd": 0.4, "param": "token", "text": "Checks a token’s distribution: pools, locks and vesting, burn, creator and large wallets – and how much is really unlocked."}, {"id": "pulse", "name": "Pulse", "usd": 0.2, "param": "token", "text": "Measures real trading behind a token: volume, unique buyers and sellers, the trend against the day before and a wash-trading check."}, {"id": "scribe", "name": "Scribe", "usd": 0.35, "param": "token", "text": "Runs Sentinel, Tally and Pulse on a token and turns the findings into one clear brief you can read in a minute or share with your community."}];
  var box = $('#rgList');
  if (box) box.innerHTML = OAA_AGENTS.map(function (a, i) { return '<label style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13px"><input type="checkbox" checked data-i="' + i + '"> <b style="min-width:90px">' + a.name + '</b><span style="color:var(--muted)">' + a.usd.toFixed(2) + ' USDC per job</span><code id="rgSt' + i + '" style="margin-left:auto;color:var(--faint)"></code></label>'; }).join('');
  var RABI = ['function registerAgent(string,string,address,address,uint96,uint96,uint32) payable returns (uint256)', 'function setFlags(uint256,bool,bool,bool)', 'function registrationFee() view returns (uint256)', 'function admin() view returns (address)', 'event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)'];
  var mapOut = {};
  $('#rgOaa') && ($('#rgOaa').onclick = async function () {
    var btn = this, E = window.ethers, I = new E.Interface(RABI);
    var reg = addrIn.value.trim(), op = $('#rgOp').value.trim();
    if (!L.isAddr(reg)) return S('#sR3', 'err', 'Enter the registry address in step A2.');
    if (!L.isAddr(op)) return S('#sR3', 'err', 'Enter the agent wallet address.');
    btn.disabled = true;
    try {
      var a = await L.connect();
      var admin = L.wordAddr(await L.call(reg, I.encodeFunctionData('admin', [])), 0);
      if (admin.toLowerCase() !== a.toLowerCase()) throw new Error('Only the registry admin (' + admin + ') can mark OAA agents. Connect that wallet.');
      var fee = BigInt(await L.call(reg, I.encodeFunctionData('registrationFee', [])));
      var picks = [].slice.call(box.querySelectorAll('input[type=checkbox]')).filter(function (c) { return c.checked; }).map(function (c) { return +c.dataset.i; });
      for (var k = 0; k < picks.length; k++) {
        var i = picks[k], ag = OAA_AGENTS[i], st = $('#rgSt' + i);
        st.textContent = 'confirm 1/2…';
        S('#sR3', '', 'Agent ' + (k + 1) + ' of ' + picks.length + ': confirm the registration of ' + ag.name + ' in your wallet…');
        var data = I.encodeFunctionData('registerAgent', [ag.name, ag.text, op, SAFE, 0, BigInt(Math.round(ag.usd * 1e6)), 1800]);
        var hash = await L.sendTx({ to: reg, data: data, value: '0x' + fee.toString(16) });
        var rc = await L.waitReceipt(hash); if (rc.status !== '0x1') throw new Error('Registering ' + ag.name + ' failed on-chain.');
        var ev = rc.logs.map(function (l) { try { return I.parseLog(l); } catch (e) { return null; } }).filter(function (x) { return x && x.name === 'AgentRegistered'; })[0];
        var id = Number(ev.args.agentId);
        st.textContent = '#' + id + ' · confirm 2/2…';
        S('#sR3', '', 'Agent ' + (k + 1) + ' of ' + picks.length + ': confirm “OAA agent + verified” for ' + ag.name + '…');
        var h2 = await L.sendTx({ to: reg, data: I.encodeFunctionData('setFlags', [id, true, false, true]) });
        var rc2 = await L.waitReceipt(h2); if (rc2.status !== '0x1') throw new Error('Marking ' + ag.name + ' failed on-chain.');
        st.textContent = '#' + id + ' ✓'; mapOut[String(id)] = { id: ag.id, param: ag.param };
      }
      $('#cR3').classList.add('done');
      S('#sR3', 'ok', 'Done. Send this to Claude for the agent runner: <code style="word-break:break-all">' + L.esc(JSON.stringify(mapOut)) + '</code>');
    } catch (e) { S('#sR3', 'err', L.esc(L.errText(e)) + (Object.keys(mapOut).length ? ' · registered so far: <code>' + L.esc(JSON.stringify(mapOut)) + '</code>' : '')); }
    finally { btn.disabled = false; }
  });
})();
