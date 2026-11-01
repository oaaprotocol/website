/* Ask Sia: the OAA super intelligence assistant as a small chat window, on every OAA page. */
(function () {
  'use strict';
  if (window.__oaaSia) return; window.__oaaSia = 1;
  var API = 'https://sia.oaaprotocol.workers.dev/';
  var QUICK = (document.body.dataset.siaQuick || 'How do I launch a token?|What does a launch cost?|How do creators earn?|Is the liquidity locked?').split('|');
  var KEY = 'oaa_sia_chat';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(t) { // light formatting: **bold**, links to OAA / BaseScan, line breaks
    return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(https:\/\/(?:oaap\.si|basescan\.org|x\.com\/oaaprotocol|t\.me\/oaaprotocol|aerodrome\.finance|dexscreener\.com|repo\.sourcify\.dev)[^\s<)]*)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }
  var msgs = [];
  try { msgs = JSON.parse(sessionStorage.getItem(KEY) || '[]') || []; } catch (e) { msgs = []; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))); } catch (e) {} }

  var w = document.createElement('div'); w.className = 'sia-w';
  w.innerHTML =
    '<section class="sia-p" role="dialog" aria-label="Chat with Sia" hidden>' +
      '<header class="sia-h"><span class="sia-av" aria-hidden="true"></span><div><b>Sia</b><small>OAA super intelligence · beta</small></div><button type="button" class="sia-x" aria-label="Close chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>' +
      '<div class="sia-log" role="log" aria-live="polite"></div>' +
      '<div class="sia-q"></div>' +
      '<form class="sia-f"><textarea class="sia-in" rows="1" maxlength="2000" placeholder="Ask Sia anything…" aria-label="Message to Sia"></textarea><button type="submit" class="sia-send" aria-label="Send" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form>' +
      '<p class="sia-note">Sia can make mistakes. Not financial advice.</p>' +
    '</section>' +
    '<button type="button" class="sia-b" aria-expanded="false"><i aria-hidden="true"></i><span>Ask Sia</span></button>';
  document.body.appendChild(w);
  var P = w.querySelector('.sia-p'), B = w.querySelector('.sia-b'), LOG = w.querySelector('.sia-log'), IN = w.querySelector('.sia-in'), SEND = w.querySelector('.sia-send'), Q = w.querySelector('.sia-q'), busy = false;

  function bubble(role, text) {
    var d = document.createElement('div'); d.className = 'sia-m ' + (role === 'user' ? 'me' : 'si');
    d.innerHTML = role === 'user' ? esc(text) : fmt(text); LOG.appendChild(d); LOG.scrollTop = LOG.scrollHeight; return d;
  }
  function render() {
    LOG.innerHTML = '';
    bubble('assistant', 'Hi, I’m Sia. Ask me about launching a token, fees, the Portal, $OAA or the SI agents.');
    msgs.forEach(function (m) { bubble(m.role, m.content); });
    Q.hidden = msgs.length > 0;
  }
  Q.innerHTML = QUICK.map(function (q) { return '<button type="button">' + esc(q) + '</button>'; }).join('');
  Q.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ask(b.textContent); });
  function state() { SEND.disabled = busy || !IN.value.trim(); P.classList.toggle('busy', busy); }
  IN.addEventListener('input', function () { IN.style.height = 'auto'; IN.style.height = Math.min(120, IN.scrollHeight) + 'px'; state(); });
  IN.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!SEND.disabled) ask(IN.value); } });
  w.querySelector('.sia-f').addEventListener('submit', function (e) { e.preventDefault(); if (!SEND.disabled) ask(IN.value); });

  function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    IN.value = ''; IN.style.height = 'auto'; Q.hidden = true;
    msgs.push({ role: 'user', content: text }); save(); bubble('user', text);
    busy = true; state();
    var ty = document.createElement('div'); ty.className = 'sia-m si sia-ty'; ty.innerHTML = '<i></i><i></i><i></i>'; LOG.appendChild(ty); LOG.scrollTop = LOG.scrollHeight;
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs.slice(-10) }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d || {} }; }); })
      .then(function (x) {
        ty.remove();
        if (x.ok && typeof x.d.reply === 'string' && x.d.reply) { msgs.push({ role: 'assistant', content: x.d.reply }); save(); bubble('assistant', x.d.reply); }
        else bubble('assistant', x.d.error === 'daily_limit' ? 'Sia has answered a lot today. Please try again tomorrow.' : 'Sia could not answer right now. Please try again in a moment.');
      })
      .catch(function () { ty.remove(); bubble('assistant', 'Sia is not reachable right now. Check your connection and try again.'); })
      .then(function () { clearTimeout(to); busy = false; state(); });
  }
  function open() { if (P.hidden) { render(); } P.hidden = false; w.classList.add('on'); B.setAttribute('aria-expanded', 'true'); setTimeout(function () { IN.focus(); }, 50); }
  function close() { P.hidden = true; w.classList.remove('on'); B.setAttribute('aria-expanded', 'false'); B.focus(); }
  B.addEventListener('click', function () { P.hidden ? open() : close(); });
  w.querySelector('.sia-x').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !P.hidden) close(); });
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-ask-sia]'); if (a) { e.preventDefault(); open(); } });
  window.OAASia = { open: open, ask: function (t) { open(); ask(t); } };
})();
