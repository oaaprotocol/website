/* $OAA launch on Uniswap V4: deploy the OAA launch hook, verify it, then launch the pool with the first buy.
   The connected wallet signs every step. Nothing is sent without a confirmation in the wallet. */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var PM = '0x498581fF718922c3f8e6A244956aF099B2652b2b', OAA = '0x70107c4AA2DC031eF7afc350e03784c2325aBE29';
  var SAFE = '0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834', FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
  var CREATE2 = '0x4e59b44847b379578588920cA78FbF26c0B4956C', FLAGS = 0x20C0, SUPPLY = 1e9;
  var SEL = { launch: '0x469805b6', launcher: '0x16eebd1e', launched: '0x8091f3bf', collect: '0xc8796572', fee: '0xda3c300d', tickUpper: '0x55b812a8', approve: '0x095ea7b3', allowance: '0xdd62ed3e', balanceOf: '0x70a08231', round: '0xfeaf968c', setBB: '0x74c5ceeb' };
  var build = null, plan = null;
  function S(id, k, h) { var s = $(id); s.className = 'st-line on' + (k ? ' ' + k : ''); s.querySelector('span').innerHTML = h; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
  function strip(h) { return String(h).replace(/^0x/i, ''); }
  function hexToBytes(h) { h = strip(h); var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function kec(bytes) { return window.keccak256(bytes); }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); }
  var hookIn = $('#hkAddr'); if (hookIn && ls('oaa_hook_addr')) { hookIn.value = ls('oaa_hook_addr'); if ($('#bHook')) $('#bHook').value = ls('oaa_hook_addr'); }
  if ($('#bFee')) $('#bFee').value = '8388608';
  function hookAddr() { var a = hookIn.value.trim(); if (!L.isAddr(a)) throw new Error('Enter the hook address (step L1).'); return a; }

  fetch('/assets/lp/hook-build.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { build = j; $('#hkSolc').textContent = 'solc ' + j.compiler.split('+')[0]; }).catch(function () { S('#sH1', 'err', 'Could not load the hook build file.'); });

  // ---------------------------------------------------------------- L1: deploy through the CREATE2 factory
  $('#hkDeploy').onclick = async function () {
    var btn = this; if (!build) return S('#sH1', 'err', 'The build file is still loading.');
    btn.disabled = true;
    try {
      var a = await L.connect();
      if ((await L.rpc('eth_getCode', [CREATE2, 'latest'])).length < 10) throw new Error('The CREATE2 factory is missing on this network.');
      S('#sH1', '', 'Finding a hook address with the right permission bits…');
      await L.sleep(30);
      var init = build.bytecode + L.encAddr(PM) + L.encAddr(OAA) + L.encAddr(a) + L.encAddr(SAFE);
      var ih = hexToBytes(kec(hexToBytes(init)));
      var buf = new Uint8Array(85); buf[0] = 0xff; buf.set(hexToBytes(CREATE2), 1); buf.set(ih, 53);
      var salt = 0, addr = '', t0 = Date.now();
      for (; salt < 5e6; salt++) {
        var s = salt; for (var k = 52; k >= 21; k--) { buf[k] = s & 255; s = Math.floor(s / 256); }
        var h = kec(buf); addr = '0x' + h.slice(24);
        if ((parseInt(addr.slice(-4), 16) & 0x3FFF) === FLAGS) break;
        if (salt % 20000 === 0) await L.sleep(0);
      }
      var saltHex = L.encUint(salt);
      var code = await L.rpc('eth_getCode', [addr, 'latest']);
      if (code.length > 4) { hookIn.value = addr; ls('oaa_hook_addr', addr); $('#cH1').classList.add('done'); return S('#sH1', 'ok', 'Already deployed at <code>' + addr + '</code>.'); }
      S('#sH1', '', 'Address ' + addr + ' found in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s. Confirm the deployment in your wallet…');
      var data = '0x' + saltHex + strip(init);
      var gas = await L.rpc('eth_estimateGas', [{ from: a, to: CREATE2, data: data }]);
      var hash = await L.sendTx({ to: CREATE2, data: data, gas: '0x' + (BigInt(gas) * 125n / 100n).toString(16) });
      S('#sH1', '', 'Deploying… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash);
      if (rc.status !== '0x1' || (await L.rpc('eth_getCode', [addr, 'latest'])).length < 10) throw new Error('The deployment failed on-chain.');
      hookIn.value = addr; ls('oaa_hook_addr', addr); $('#cH1').classList.add('done');
      S('#sH1', 'ok', 'Hook deployed at <a href="https://basescan.org/address/' + addr + '" target="_blank" rel="noopener">' + addr + '</a>. Launcher: ' + L.short(a) + '. Next: verify it.');
    } catch (e) { S('#sH1', 'err', L.esc(L.errText(e))); }
    finally { btn.disabled = false; }
  };

  // ---------------------------------------------------------------- L2: verify on Sourcify
  $('#hkVerify').onclick = async function () {
    try {
      var addr = hookAddr(); if (!build) throw new Error('The build file is still loading.');
      S('#sH2', '', 'Sending the source code to Sourcify…');
      var sources = {}; for (var k in build.files) if (k !== 'metadata.json') sources[k] = build.files[k];
      var r = await fetch('https://sourcify.dev/server/v2/verify/metadata/8453/' + addr, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: sources, metadata: JSON.parse(build.files['metadata.json']) }) });
      var j = await r.json();
      if (!j.verificationId) throw new Error((j && (j.message || j.customCode)) || 'Sourcify did not accept the files.');
      for (var i = 0; i < 40; i++) {
        await L.sleep(3000);
        var st = await fetch('https://sourcify.dev/server/v2/verify/' + j.verificationId).then(function (x) { return x.json(); });
        if (st.isJobCompleted) {
          var m = st.contract && st.contract.match;
          if (m) { $('#cH2').classList.add('done'); return S('#sH2', 'ok', 'Verified (' + m.replace('_', ' ') + '). <a href="https://repo.sourcify.dev/8453/' + addr + '" target="_blank" rel="noopener">Open on Sourcify</a>'); }
          throw new Error((st.error && st.error.message) || 'Sourcify could not match the code.');
        }
      }
      throw new Error('Sourcify is still working. Check again in a few minutes.');
    } catch (e) { S('#sH2', 'err', L.esc(e.message || String(e))); }
  };

  // ---------------------------------------------------------------- L3: launch plan, approve, launch
  async function makePlan() {
    var addr = hookAddr(), a = await L.connect();
    var who = L.wordAddr(await L.call(addr, SEL.launcher), 0);
    if (who.toLowerCase() !== a.toLowerCase()) throw new Error('This hook can only be launched by ' + who + '. Connect that wallet.');
    if (BigInt(await L.call(addr, SEL.launched)) !== 0n) throw new Error('This hook has already launched the pool.');
    var num = function (id) { return Number(String($(id).value).replace(/[^0-9.]/g, '')); };
    var mcap = num('#hkMc'), usd = num('#hkBuy'), amts = [num('#hkA1'), num('#hkA2'), num('#hkA3')], edges = [num('#hkM1'), num('#hkM2'), num('#hkM3')];
    var amount = amts[0] + amts[1] + amts[2];
    if (!(amts[0] > 0 && amts[1] > 0 && amts[2] > 0)) throw new Error('Enter the $OAA for each of the three ranges.');
    if (!(edges[0] > mcap && edges[1] > edges[0] && edges[2] > edges[1])) throw new Error('Each range must end at a higher market cap than the one before.');
    if (!(amount > 0 && amount <= SUPPLY)) throw new Error('Enter how many $OAA go into the pool.');
    if (!(mcap >= 1000)) throw new Error('Enter the start market cap in USD.');
    if (!(usd >= 0)) throw new Error('Enter the first buy in USD (0 for none).');
    var rd = await L.call(FEED, SEL.round), ans = BigInt('0x' + strip(rd).slice(64, 128));
    var ethUsd = Number(ans) / 1e8; if (!(ethUsd > 100)) throw new Error('Could not read the ETH price.');
    var ratio = ethUsd * SUPPLY / mcap; // OAA per ETH
    var tickFor = function (mc) { return Math.floor(Math.floor(Math.log(ethUsd * SUPPLY / mc) / Math.log(1.0001)) / 200) * 200; };
    var tick = tickFor(mcap), ticks = [tick, tickFor(edges[0]), tickFor(edges[1]), tickFor(edges[2])];
    if (!(ticks[0] > ticks[1] && ticks[1] > ticks[2] && ticks[2] > ticks[3])) throw new Error('The ranges are too close together.');
    var mcOf = function (t) { return ethUsd * SUPPLY / Math.pow(1.0001, t); }, realMc = mcOf(tick);
    var amtsWei = amts.map(function (x) { return BigInt(Math.round(x)) * 10n ** 18n; }), amountWei = amtsWei[0] + amtsWei[1] + amtsWei[2];
    var ethWei = ans > 0n ? BigInt(Math.round(usd * 100)) * 10n ** 24n / ans : 0n; // usd*1e2 * 1e24 / (price*1e8) = usd/price * 1e18
    var bal = BigInt(await L.call(OAA, SEL.balanceOf + L.encAddr(a)));
    var eth = BigInt(await L.rpc('eth_getBalance', [a, 'latest']));
    var allow = BigInt(await L.call(OAA, SEL.allowance + L.encAddr(a) + L.encAddr(addr)));
    return { hook: addr, from: a, tick: tick, ticks: ticks, amts: amtsWei, edgesMc: ticks.slice(1).map(mcOf), mcap: realMc, ethUsd: ethUsd, amountWei: amountWei, ethWei: ethWei, usd: usd, bal: bal, eth: eth, allow: allow };
  }
  function launchData(p, minOut) { return SEL.launch + p.ticks.map(L.encInt).join('') + p.amts.map(L.encUint).join('') + L.encUint(minOut); }
  function showPlan(p, quote) {
    var rows = ['ETH price', '$' + fmt(p.ethUsd, 2), 'Start market cap', '$' + fmt(p.mcap) + ' (start tick ' + p.tick + ')', 'Range 1', fmt(Number(p.amts[0] / 10n ** 18n)) + ' $OAA up to $' + fmt(p.edgesMc[0]) + ' market cap', 'Range 2', fmt(Number(p.amts[1] / 10n ** 18n)) + ' $OAA up to $' + fmt(p.edgesMc[1]), 'Range 3', fmt(Number(p.amts[2] / 10n ** 18n)) + ' $OAA up to $' + fmt(p.edgesMc[2]), '$OAA into the pool', fmt(Number(p.amountWei / 10n ** 18n)) + ' in total (your balance ' + fmt(Number(p.bal / 10n ** 18n)) + ')', 'Your first buy', '$' + fmt(p.usd) + ' = ' + (Number(p.ethWei) / 1e18).toFixed(5) + ' ETH at the 1% fee (your ETH ' + (Number(p.eth) / 1e18).toFixed(5) + ')'];
    if (quote != null) rows.push('You receive', '≈ ' + fmt(Number(quote / 10n ** 18n)) + ' $OAA (' + (Number(quote) / Number(p.amountWei) * 100).toFixed(2) + '% of the pool), minimum ' + fmt(Number(quote * 97n / 100n / 10n ** 18n)));
    rows.push('After the launch', 'From the next block: fee 25% falling to 1% over 10 minutes; first 5 minutes max 20,000,000 $OAA per buy and one buy per wallet per block; from minute 10 everything at 1%');
    var h = ''; for (var i = 0; i < rows.length; i += 2) h += '<span>' + rows[i] + '</span><code>' + L.esc(rows[i + 1]) + '</code>';
    $('#hkPlan').innerHTML = h;
  }
  $('#hkCheck').onclick = async function () {
    try {
      S('#sH3', '', 'Reading prices and balances…');
      plan = await makePlan(); showPlan(plan, null);
      if (plan.bal < plan.amountWei) throw new Error('Your wallet holds fewer $OAA than you want to put in the pool.');
      if (plan.eth < plan.ethWei + 10n ** 15n) throw new Error('Not enough ETH for the first buy plus the network fees.');
      if (plan.allow < plan.amountWei) { $('#hkLaunch').disabled = true; return S('#sH3', '', 'Step 1 of 2: click “Approve $OAA” so the hook can put your $OAA into the pool.'); }
      var q = await L.call(plan.hook, launchData(plan, 0n), { from: plan.from, value: '0x' + plan.ethWei.toString(16) });
      plan.quote = BigInt(q); showPlan(plan, plan.quote);
      $('#hkLaunch').disabled = false;
      S('#sH3', 'ok', 'Simulation OK. Check the numbers, then click “Launch $OAA”.');
    } catch (e) { $('#hkLaunch').disabled = true; S('#sH3', 'err', L.esc(L.errText(e))); }
  };
  $('#hkApprove').onclick = async function () {
    try {
      if (!plan) plan = await makePlan();
      S('#sH3', '', 'Confirm the approval in your wallet…');
      var hash = await L.sendTx({ to: OAA, data: SEL.approve + L.encAddr(plan.hook) + L.encUint(plan.amountWei) });
      var rc = await L.waitReceipt(hash); if (rc.status !== '0x1') throw new Error('The approval failed on-chain.');
      S('#sH3', 'ok', 'Approved. Now click “Check & simulate” again.');
    } catch (e) { S('#sH3', 'err', L.esc(L.errText(e))); }
  };
  $('#hkLaunch').onclick = async function () {
    var btn = this;
    try {
      if (!plan || plan.quote == null) throw new Error('Click “Check & simulate” first.');
      btn.disabled = true;
      var data = launchData(plan, plan.quote * 97n / 100n);
      var gas = await L.rpc('eth_estimateGas', [{ from: plan.from, to: plan.hook, data: data, value: '0x' + plan.ethWei.toString(16) }]);
      S('#sH3', '', 'Confirm the launch in your wallet…');
      var hash = await L.sendTx({ to: plan.hook, data: data, value: '0x' + plan.ethWei.toString(16), gas: '0x' + (BigInt(gas) * 130n / 100n).toString(16) });
      S('#sH3', '', 'Launching… <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">view transaction</a>');
      var rc = await L.waitReceipt(hash); if (rc.status !== '0x1') throw new Error('The launch failed on-chain. Nothing was launched; check the numbers and try again.');
      $('#cH3').classList.add('done');
      S('#sH3', 'ok', '$OAA is live. Pool created, ' + fmt(Number(plan.amountWei / 10n ** 18n)) + ' $OAA locked in three ranges, first buy done. <a href="https://basescan.org/tx/' + hash + '" target="_blank" rel="noopener">Transaction</a>. Next: step 2c (buyback pool) and open the launchpad.');
      $('#bFee').value = '8388608'; $('#bTs').value = '200'; $('#bHook').value = plan.hook;
    } catch (e) { S('#sH3', 'err', L.esc(L.errText(e))); }
    finally { btn.disabled = false; }
  };
  $('#hkCollect').onclick = async function () {
    try {
      var addr = hookAddr(); S('#sH3', '', 'Confirm in your wallet…');
      var hash = await L.sendTx({ to: addr, data: SEL.collect });
      var rc = await L.waitReceipt(hash); if (rc.status !== '0x1') throw new Error('The transaction failed on-chain.');
      S('#sH3', 'ok', 'Pool fees sent to the Treasury Safe.');
    } catch (e) { S('#sH3', 'err', L.esc(L.errText(e))); }
  };
  $('#hkFee').onclick = async function () {
    try { var f = Number(BigInt(await L.call(hookAddr(), SEL.fee))); S('#sH3', 'ok', 'Current pool fee: ' + (f / 1e4).toFixed(2) + '%.'); }
    catch (e) { S('#sH3', 'err', L.esc(L.errText(e))); }
  };
})();
