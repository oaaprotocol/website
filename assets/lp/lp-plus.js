/* OAA Launchpad + Portal: shared info sections (how it works, earnings, trust, FAQ). Renders into #lpPlus. */
(function () {
  'use strict';
  var L = window.OAALP, root = document.getElementById('lpPlus');
  if (!L || !root) return;
  var SAFE = '0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834';
  var ic = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
    safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="12" cy="12.5" r="3"/><path d="M12 9.5V8M7 20v1M17 20v1"/></svg>'
  };
  var steps = [
    ['Describe your token', 'Name, ticker, logo and links. The on-chain name becomes “Your name by OAA”.'],
    ['Pick a category', 'Meme, SI Agents, RWA, x402, Cats, Characters, Gaming or DeFi. It decides where you appear in the Portal.'],
    ['Buy first (optional)', 'Up to $500 in ETH, in the same transaction. Nobody can trade before you.'],
    ['Launch on Base', 'One wallet confirmation. 1B supply goes into Aerodrome, liquidity locked forever, trading opens at once.']
  ];
  var faq = [
    ['Can anyone remove the liquidity?', 'No. The three Aerodrome positions are held by the launchpad contract and it has no function to withdraw them. Not the creator, not OAA, nobody.'],
    ['What does it cost to launch?', 'Only the Base network fee (a few cents) and your optional first buy. There is no launch fee.'],
    ['How do creators earn?', 'Every buy and sell pays a 1% pool fee. 0.4% of the volume goes to the creator. Of the rest, 0.3% goes to the OAA Treasury and 0.3% automatically buys $OAA on Uniswap and burns it forever (on sells, where the fee is paid in the token, the 0.6% goes to the Treasury). Anyone can press “Collect fees” in the Portal to pay everything out.'],
    ['Why “by OAA” in the name?', 'It is part of the token’s on-chain name, so wallets, BaseScan, DexScreener and the Portal all show that it was launched on OAA.'],
    ['Is there a tax, mint or owner in the token?', 'No. Fixed supply of 1,000,000,000, 18 decimals, no owner, no mint function and no transfer tax.'],
    ['Where does the price start?', 'At a $30,000 market cap. The liquidity sits in three ranges: 50% up to $1M, 30% up to $50M and 20% up to $1B.'],
    ['Is a launched token safe to buy?', 'The launch rules protect the liquidity, but they cannot judge a project. Check the Sentinel grade and do your own research. Nothing here is financial advice.'],
    ['Which chains?', 'Base first. Ethereum, Solana, Robinhood Chain and more follow step by step.']
  ];
  var withCalc = root.dataset.calc === '1';
  root.innerHTML =
    '<section class="xs rv"><div class="xs-h"><div><p class="eyebrow">How it works</p><h2>From idea to live token in four steps.</h2></div><p>Everything happens in one transaction on Base. No coding, no lock service, no waiting.</p></div>' +
    '<div class="hw">' + steps.map(function (s, i) { return '<div class="hw-s"><div class="hw-n">' + (i + 1) + '</div><b>' + s[0] + '</b><p>' + s[1] + '</p></div>'; }).join('') + '</div></section>' +
    (withCalc ? '<section class="xs rv"><div class="calc"><div><label for="cVol">Daily trading volume of your token</label><input type="range" id="cVol" min="0" max="100" value="40" aria-label="Daily volume"><div class="cv" id="cVolT"></div><small>Creator share: 0.4% of the traded volume, paid in ETH (buys) and in your token (sells). Example only, real volume depends entirely on the market.</small></div>' +
      '<div class="co"><div><span>Per day</span><b id="cD"></b></div><div><span>Per month</span><b id="cM"></b></div><div><span>Per year</span><b id="cY"></b></div></div></div></section>' : '') +
    '<section class="xs rv"><div class="xs-h"><div><p class="eyebrow">Verify it yourself</p><h2>Open, locked and on-chain.</h2></div></div><div class="tr">' +
    '<a id="trLp" href="https://basescan.org" target="_blank" rel="noopener">' + ic.code + '<span><b>Launchpad contract</b><small id="trLpA">loading…</small></span></a>' +
    '<a id="trSrc" href="https://sourcify.dev" target="_blank" rel="noopener">' + ic.shield + '<span><b>Source code verified</b><small>Sourcify · exact match</small></span></a>' +
    '<div>' + ic.lock + '<span><b>Liquidity locked forever</b><small>held by the contract, no withdraw function</small></span></div>' +
    '<a href="https://basescan.org/address/' + SAFE + '" target="_blank" rel="noopener">' + ic.safe + '<span><b>OAA Treasury (Safe)</b><small>' + L.short(SAFE) + '</small></span></a>' +
    '</div></section>' +
    '<section class="xs rv"><div class="xs-h"><div><p class="eyebrow">FAQ</p><h2>Good to know.</h2></div></div><div class="faq">' +
    faq.map(function (f) { return '<details><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div></section>';

  L.config().then(function (c) {
    if (!c.launchpad) { document.getElementById('trLpA').textContent = 'goes live with the launch'; return; }
    document.getElementById('trLp').href = 'https://basescan.org/address/' + c.launchpad;
    document.getElementById('trLpA').textContent = L.short(c.launchpad);
    document.getElementById('trSrc').href = 'https://repo.sourcify.dev/8453/' + c.launchpad;
  });

  if (withCalc) {
    var r = document.getElementById('cVol');
    var vol = function (v) { return Math.round(Math.pow(10, 3 + v / 100 * 4) / 1000) * 1000; }; // $1k .. $10M, log scale
    var upd = function () {
      var v = vol(+r.value), d = v * 0.004;
      document.getElementById('cVolT').textContent = L.fmtUsd(v) + ' / day';
      document.getElementById('cD').textContent = L.fmtUsd(d);
      document.getElementById('cM').textContent = L.fmtUsd(d * 30);
      document.getElementById('cY').textContent = L.fmtUsd(d * 365);
    };
    r.oninput = upd; upd();
  }
  // reveal (the portal has its own observer; the launch page has none)
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: .08 }) : null;
  root.querySelectorAll('.rv').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });
})();
