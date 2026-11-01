/* $OAA chart and market data (DexScreener for price, volume, liquidity and the chart; Blockscout for holders). */
(function () {
  'use strict';
  var L = window.OAALP, $ = function (s) { return document.querySelector(s); };
  var TOKEN = '0x70107c4AA2DC031eF7afc350e03784c2325aBE29', SUPPLY = 1e9, pairShown = null;
  function usd(n) { return L.fmtUsd(n); }
  async function market() {
    try {
      var r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + TOKEN).then(function (x) { return x.json(); });
      var pairs = (Array.isArray(r) ? r : []).filter(function (p) { return p && p.baseToken && String(p.baseToken.address).toLowerCase() === TOKEN.toLowerCase(); });
      if (!pairs.length) return;
      pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
      var p = pairs[0], price = +p.priceUsd || 0, chg = p.priceChange ? +p.priceChange.h24 : null;
      var vol = pairs.reduce(function (a, x) { return a + ((x.volume && +x.volume.h24) || 0); }, 0), liq = pairs.reduce(function (a, x) { return a + ((x.liquidity && +x.liquidity.usd) || 0); }, 0);
      $('#pxNow').innerHTML = L.fmtPrice(price);
      var c = $('#pxChg'); if (chg != null && isFinite(chg)) { c.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '% 24h'; c.className = chg >= 0 ? 'up' : 'down'; }
      $('#stMc').textContent = usd(+p.marketCap || price * SUPPLY);
      $('#stFdv').textContent = usd(+p.fdv || price * SUPPLY);
      $('#stVol').textContent = usd(vol);
      $('#stLiq').textContent = usd(liq);
      $('#lnDex').href = p.url || $('#lnDex').href;
      if (p.pairAddress && pairShown !== p.pairAddress) {
        pairShown = p.pairAddress;
        var f = document.createElement('iframe'); f.title = '$OAA price chart'; f.loading = 'lazy';
        f.src = 'https://dexscreener.com/base/' + p.pairAddress + '?embed=1&theme=dark&trades=0&info=0';
        var box = $('#chartBox'); box.innerHTML = ''; box.appendChild(f);
      }
    } catch (e) {}
  }
  async function holders() {
    try {
      var j = await fetch('https://base.blockscout.com/api/v2/tokens/' + TOKEN + '/counters').then(function (x) { return x.json(); });
      var n = +(j && (j.token_holders_count || j.holders_count)); if (n) $('#stHold').textContent = n.toLocaleString('en-US');
    } catch (e) {}
  }
  market(); holders();
  setInterval(market, 30000); setInterval(holders, 120000);
})();
