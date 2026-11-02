/* OAA build log: turns the GitHub history of oaaprotocol/website into numbered updates.
   One update per day (Berlin time). Title and text come from the commit message when one was written
   ("[Tag] Title" in the first line, "- point" lines become bullets), otherwise they are built from the
   changed files: code comments become bullets, a few added lines become the code preview, and changed
   images become the picture. Results are cached in the browser, so GitHub is asked rarely. */
(function () {
  'use strict';
  var REPO = 'oaaprotocol/website', API = 'https://api.github.com/repos/' + REPO, SINCE = '2026-10-28T00:00:00Z';
  var MAX_DAYS = 12, LIST_TTL = 10 * 60 * 1000, KEY = 'oaa-gh1-';
  var TAGS = ['Agents', 'Launchpad', 'Token', 'Risk', 'Code', 'Website'];
  var DEFAULT_MSG = /^(add|update|delete|create|upload)\s+files?\s+via\s+upload|^(add|update|create)\s+[\w.\/-]+$|^delete\b|^revert\b|^merge\b|^initial commit/i;
  var MSG_TAG = [[/\b(agent|agents|sia|sentinel|guardian|radar|whale|decoder|tally|pulse|scribe|x402|mission)/i, 'Agents'], [/\b(launchpad|launch|portal|creator|buyback)/i, 'Launchpad'], [/\$?OAA token|tokenomics|lock|vesting|buy \$?OAA/i, 'Token'], [/\b(risk|rug|honeypot)/i, 'Risk']];
  var AREAS = [
    [/^contracts\//, 'Smart contracts', 'Launchpad'],
    [/^deploy-launchpad\/|assets\/lp\/(deploy\.js|launchpad-build)/, 'Launchpad deploy', 'Launchpad'],
    [/^launch\/|assets\/lp\/(launch\.js|bg-float|coins\/)/, 'Launch page', 'Launchpad'],
    [/^portal\/|assets\/lp\/portal/, 'Portal', 'Launchpad'],
    [/^buy\/|assets\/buy\//, 'Buy $OAA', 'Token'],
    [/sia\.(js|css)|assets\/sia/i, 'Sia assistant', 'Agents'],
    [/agent|x402|exchange|mission/i, 'Agent Exchange', 'Agents'],
    [/sentinel|guardian|rug/i, 'Risk checks', 'Risk'],
    [/assets\/lp\//, 'Launchpad and Portal', 'Launchpad'],
    [/^netlify\.toml$/, 'Security headers', 'Website'],
    [/^readme/i, 'Project README', 'Website'],
    [/locks\.json|tokenomics/i, 'Tokenomics', 'Token'],
    [/\.(png|jpe?g|webp|gif|svg|avif)$/i, 'Images', 'Website'],
    [/./, 'Website', 'Website']
  ];
  var IMG = /\.(png|jpe?g|webp|gif|avif)$/i, SKIP = /^oaa-website|\.zip$|(^|\/)\.|favicon|apple-touch/i;
  var CODE_PRI = [[/\.sol$/, 5], [/\.js$/, 4], [/\.css$/, 2], [/\.html?$/, 2], [/\.toml$/, 1]];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function store(k, v) { try { if (v === undefined) { var s = localStorage.getItem(KEY + k); return s ? JSON.parse(s) : null; } localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { return null; } }
  function gh(path) {
    return fetch(API + path, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
      if (!r.ok) throw new Error('github ' + r.status); return r.json();
    });
  }
  function day(iso) { // Berlin calendar day as YYYY-MM-DD
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
    catch (e) { return iso.slice(0, 10); }
  }
  function nice(d) { var p = d.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function area(f) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i][0].test(f)) return AREAS[i]; return AREAS[AREAS.length - 1]; }
  function clean(t) { return t.replace(/\s+/g, ' ').trim(); }

  // ---- reduce a GitHub file list (from /compare or /commits/sha) to what the page needs
  function reduce(files) {
    var out = { files: [], comments: [], code: null, images: [], add: 0, del: 0 }, best = -1, seen = {};
    (files || []).forEach(function (f) {
      var n = f.filename || '';
      if (SKIP.test(n) || f.status === 'removed') return;
      out.files.push([n, f.status === 'added' ? 'a' : 'm', f.additions || 0, f.deletions || 0]);
      out.add += f.additions || 0; out.del += f.deletions || 0;
      if (IMG.test(n) && out.images.length < 4) out.images.push(n);
      if (!f.patch) return;
      var lines = f.patch.split('\n'), added = [];
      var cm = /\.(js|sol|css)$/.test(n) ? /^\s*(?:\/\/+|\/?\*+)\s*(.+?)\s*(?:\*\/)?\s*$/ : /\.toml$/.test(n) ? /^\s*#\s*(.+?)\s*$/ : /\.html?$/.test(n) ? /^\s*(?:<!--|\/\*|\/\/)\s*(.+?)\s*(?:-->|\*\/)?\s*$/ : null;
      var blk = [];
      function flush() {
        if (!blk.length) return;
        var txt = blk.join(' ').replace(/\s+/g, ' ').replace(/^[-–—=*\s]+|[-–—=*\s]+$/g, '').replace(/^v\d+[a-z]?\s*[:.-]\s*/i, '').replace(/^@(dev|notice)\s+/, ''); blk = [];
        if (txt.length < 24 || !/^[A-Z$0-9"']/.test(txt) || !/[a-z]{3}/.test(txt) || /^(eslint|prettier|@|sourceMappingURL|SPDX|pragma|TODO)/i.test(txt)) return;
        var sm = txt.match(/^.{30,170}?[.!?](?=\s|$)/); txt = sm ? sm[0] : (txt.length > 170 ? txt.slice(0, 167).replace(/\s+\S*$/, '') + '…' : txt);
        var k = txt.toLowerCase().slice(0, 40);
        if (!seen[k] && out.comments.length < 12) { seen[k] = 1; out.comments.push(txt.charAt(0).toUpperCase() + txt.slice(1)); }
      }
      lines.forEach(function (l) {
        if (l.charAt(0) !== '+' || l.slice(0, 3) === '+++') { added.push(null); flush(); return; }
        var t = l.slice(1); added.push(t);
        var m = t.length <= 220 && cm && t.match(cm);
        if (m) blk.push(m[1]); else flush();
      });
      flush();
      // code preview: best run of >= 3 consecutive short added lines
      var pri = 0; CODE_PRI.forEach(function (p) { if (p[0].test(n)) pri = p[1]; });
      if (!pri) return;
      var run = [];
      for (var i = 0; i <= added.length; i++) {
        var t = added[i];
        var isCode = t != null && t.length <= 110 && t.trim() && !(/\.html?$/.test(n) && /^\s*</.test(t));
        if (isCode) { run.push(t); continue; }
        if (t != null && !t.trim() && run.length) continue;
        if (run.length >= 3) {
          var codey = run.slice(0, 8).filter(function (x) { return /[=(){};]/.test(x); }).length;
          var score = pri * 10 + Math.min(run.length, 8) + codey + (run.some(function (x) { return /\/\/|\/\*/.test(x); }) ? 3 : 0) - (/(^|\/)404\.html$/.test(n) ? 30 : 0);
          if (score > best) { best = score; out.code = { file: n, lines: run.slice(0, 8) }; }
        }
        run = [];
      }
    });
    if (out.code) { // remove the common indent
      var ind = Math.min.apply(null, out.code.lines.map(function (l) { return (l.match(/^\s*/) || [''])[0].length; }));
      out.code.lines = out.code.lines.map(function (l) { return l.slice(ind).replace(/\t/g, '  '); });
    }
    return out;
  }

  function fetchGroup(g) { // g.commits newest first
    var head = g.commits[0], tail = g.commits[g.commits.length - 1], base = tail.parents && tail.parents[0] && tail.parents[0].sha;
    var ck = 'c-' + (base || 'root').slice(0, 10) + '-' + head.sha.slice(0, 10), hit = store(ck);
    if (hit) return Promise.resolve(hit);
    var p = base ? gh('/compare/' + base + '...' + head.sha).then(function (j) { return reduce(j.files); })
      : Promise.all(g.commits.slice(0, 5).map(function (c) { return gh('/commits/' + c.sha); })).then(function (js) {
        var all = []; js.forEach(function (j) { all = all.concat(j.files || []); }); return reduce(all);
      });
    return p.then(function (r) { store(ck, r); return r; });
  }

  // ---- texts
  function fromMessages(g) {
    var own = g.commits.filter(function (c) { return !DEFAULT_MSG.test(clean(c.commit.message.split('\n')[0])); });
    if (!own.length) return null;
    var res = { title: '', tag: null, lede: [], pts: [] };
    own.forEach(function (c, i) {
      var ls = c.commit.message.split('\n'), t = clean(ls[0]), m = t.match(/^\[([a-z ]+)\]\s*(.+)$/i);
      if (m) { var tg = TAGS.filter(function (x) { return x.toLowerCase() === m[1].trim().toLowerCase(); })[0]; if (tg && !res.tag) res.tag = tg; t = m[2]; }
      if (i === 0) res.title = t; else res.pts.push(t);
      ls.slice(1).forEach(function (l) { l = clean(l); if (!l) return; if (/^[-*•]\s+/.test(l)) res.pts.push(l.replace(/^[-*•]\s+/, '')); else if (i === 0) res.lede.push(l); });
    });
    return res;
  }
  function build(g, r) {
    var cnt = {}, aw = {}, w = {}, MINOR = { 'Project README': 1, 'Security headers': 1, 'Images': 1, 'Website': 1 };
    r.files.forEach(function (f) { var a = area(f[0]), x = f[2] + f[3] + 1; cnt[a[1]] = (cnt[a[1]] || 0) + 1; aw[a[1]] = (aw[a[1]] || 0) + x; w[a[2]] = (w[a[2]] || 0) + x; });
    var areas = Object.keys(cnt).sort(function (a, b) { return aw[b] - aw[a]; }), major = areas.filter(function (a) { return !MINOR[a]; });
    if (major.length) areas = major.concat(areas.filter(function (a) { return MINOR[a]; }));
    var tags = Object.keys(w).sort(function (a, b) { return w[b] - w[a]; });
    var tag = tags.filter(function (t) { return t !== 'Website'; })[0] || 'Website';
    var msg = fromMessages(g), mt = msg && !msg.tag && MSG_TAG.filter(function (x) { return x[0].test(msg.title); })[0];
    var u = { tag: (msg && msg.tag) || (mt && mt[1]) || tag, img: r.images, code: r.code, files: r.files.length };
    var list = function (a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; };
    if (msg) {
      u.title = msg.title;
      u.lede = msg.lede.join(' ') || ('Changes in ' + list(areas.slice(0, 4)) + '.');
      u.pts = msg.pts.concat(r.comments).slice(0, 5);
    } else {
      var top = (major.length ? major : areas).slice(0, 3);
      u.title = list(top) + ' updated';
      u.lede = r.files.length + (r.files.length === 1 ? ' file' : ' files') + ' changed in ' + g.commits.length + (g.commits.length === 1 ? ' upload' : ' uploads') +
        ': ' + r.add.toLocaleString('en-US') + ' lines added, ' + r.del.toLocaleString('en-US') + ' removed.';
      u.pts = r.comments.slice(0, 5);
      if (u.pts.length < 2) areas.slice(0, 4).forEach(function (a) { if (u.pts.length < 4) u.pts.push(a + ': ' + cnt[a] + (cnt[a] === 1 ? ' file' : ' files') + ' updated'); });
    }
    u.pts = u.pts.map(function (p) { return p.length > 170 ? p.slice(0, 167) + '…' : p; });
    return u;
  }

  // ---- rendering (DOM only, every text from GitHub goes in through textContent)
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var KW = /\b(const|let|var|function|return|if|else|for|while|export|import|true|false|new|require|emit|uint256|int24|uint24|address|bool|bytes32|external|public|internal|private|view|returns|memory|async|await)\b/g;
  function hl(line) { // tokens: comment, string, keyword
    var span = el('span', 'ln'), ci = -1, q = null;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if ((ch === '/' && (line.charAt(i + 1) === '/' || line.charAt(i + 1) === '*')) || (ch === '<' && line.slice(i, i + 4) === '<!--')) { ci = i; break; }
    }
    var code = ci > -1 ? line.slice(0, ci) : line, re = /('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)/g, last = 0, m;
    function plain(t) { var l2 = 0, k; KW.lastIndex = 0; while ((k = KW.exec(t))) { if (k.index > l2) span.appendChild(document.createTextNode(t.slice(l2, k.index))); span.appendChild(el('span', 'tk-k', k[0])); l2 = k.index + k[0].length; } if (l2 < t.length) span.appendChild(document.createTextNode(t.slice(l2))); }
    while ((m = re.exec(code))) { plain(code.slice(last, m.index)); span.appendChild(el('span', 'tk-s', m[0])); last = m.index + m[0].length; }
    plain(code.slice(last));
    if (ci > -1) span.appendChild(el('span', 'tk-c', line.slice(ci)));
    return span;
  }
  function art(list, tag, num, imgs) {
    var box = el('div', 'uu-art'); box.setAttribute('aria-hidden', 'true');
    var safe = (imgs || []).filter(function (n) { return /^[\w\/.\-]+$/.test(n) && !/\.\./.test(n); });
    if (safe.length) {
      box.classList.add('uu-art-img');
      var im = el('img'); im.src = '/' + safe[0]; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
      im.onerror = function () { im.remove(); box.classList.remove('uu-art-img'); addSvg(); };
      im.onload = function () { if (im.naturalWidth && im.naturalWidth < 700) box.classList.add('uu-art-fit'); };
      box.appendChild(im);
      if (safe.length > 1) { var th = el('div', 'uu-thumbs'); safe.slice(1, 4).forEach(function (n) { var t = el('img'); t.src = '/' + n; t.alt = ''; t.loading = 'lazy'; t.onerror = function () { t.remove(); }; th.appendChild(t); }); box.appendChild(th); }
    } else addSvg();
    function addSvg() { var src = list.querySelector('.uu[data-tag="' + tag + '"] .uu-art svg') || list.querySelector('.uu .uu-art svg'); if (src) box.insertBefore(src.cloneNode(true), box.firstChild); }
    box.appendChild(el('span', 'uu-big', num));
    return box;
  }
  function render(list, u, n, d, latest, link) {
    var num = ('00' + n).slice(-3), a = el('article', 'uu uu-gh'); a.setAttribute('data-tag', u.tag);
    a.appendChild(art(list, u.tag, num, u.img));
    var b = el('div', 'uu-body'), meta = el('div', 'uu-meta');
    meta.appendChild(el('span', 'uu-num', 'Update ' + num));
    var t = el('time', null, nice(d)); t.setAttribute('datetime', d); meta.appendChild(t);
    meta.appendChild(el('span', 'uu-tag', u.tag));
    if (latest) meta.appendChild(el('span', 'uu-new', 'Latest'));
    b.appendChild(meta); b.appendChild(el('h4', null, u.title)); b.appendChild(el('p', 'uu-lede', u.lede));
    if (u.pts.length) { var ul = el('ul', 'uu-pts'); u.pts.forEach(function (p) { ul.appendChild(el('li', null, p)); }); b.appendChild(ul); }
    if (u.code && u.code.lines.length) {
      var det = el('details', 'uu-code'), sm = el('summary'), sp = el('span', null, u.code.file), em = el('em', null, 'Show code');
      sm.appendChild(sp); sm.appendChild(em); det.appendChild(sm);
      var pre = el('pre'), code = el('code'); u.code.lines.forEach(function (l) { code.appendChild(hl(l)); }); pre.appendChild(code); det.appendChild(pre);
      det.addEventListener('toggle', function () { em.textContent = det.open ? 'Hide code' : 'Show code'; });
      b.appendChild(det);
    }
    var gl = el('a', 'uu-ghl', 'View on GitHub'); gl.href = link; gl.target = '_blank'; gl.rel = 'noopener noreferrer'; b.appendChild(gl);
    a.appendChild(b);
    return a;
  }

  function filterNow(p) {
    var on = p.querySelector('.uu-filter button[aria-pressed="true"]'), f = on ? on.getAttribute('data-f') : 'All';
    [].forEach.call(p.querySelectorAll('.uu-gh'), function (c) { c.hidden = !(f === 'All' || c.getAttribute('data-tag') === f); });
  }

  function load() {
    var cached = store('list');
    if (cached && Date.now() - cached.t < LIST_TTL) return Promise.resolve(cached.d);
    return gh('/commits?since=' + SINCE + '&per_page=100').then(function (j) {
      var d = (Array.isArray(j) ? j : []).map(function (c) { return { sha: c.sha, html_url: c.html_url, parents: (c.parents || []).map(function (x) { return { sha: x.sha }; }), commit: { message: String(c.commit && c.commit.message || ''), author: { date: c.commit && c.commit.author && c.commit.author.date } } }; });
      store('list', { t: Date.now(), d: d }); return d;
    }).catch(function (e) { if (cached) return cached.d; throw e; });
  }

  function fill(list) {
    list.setAttribute('data-gh', '1');
    var p = list.closest('.uu-wrap') || list.parentNode, staticN = list.querySelectorAll('.uu:not(.uu-gh)').length;
    load().then(function (commits) {
      var groups = {}, order = [];
      commits.filter(function (c) { return (c.parents || []).length < 2; }).forEach(function (c) {
        var d = day(c.commit.author.date); if (!groups[d]) { groups[d] = { day: d, commits: [] }; order.push(d); } groups[d].commits.push(c);
      });
      order.sort(); order = order.slice(-MAX_DAYS); // oldest .. newest
      return Promise.all(order.map(function (d) { return fetchGroup(groups[d]).then(function (r) { return { g: groups[d], r: r }; }, function () { return null; }); }));
    }).then(function (res) {
      res = res.filter(function (x) { return x && x.r.files.length; });
      if (!res.length) return;
      var old = list.querySelector('.uu-new'); if (old) old.remove();
      var first = list.firstChild;
      res.forEach(function (x, i) {
        var u = build(x.g, x.r), n = staticN + i + 1, latest = i === res.length - 1;
        var link = x.g.commits.length === 1 ? x.g.commits[0].html_url : 'https://github.com/' + REPO + '/commits/main?since=' + x.g.day + '&until=' + x.g.day;
        var a = render(list, u, n, x.g.day, latest, link);
        list.insertBefore(a, first); first = a;
      });
      var st = p.querySelectorAll('.uu-stats b');
      if (st[0]) st[0].textContent = ('00' + (staticN + res.length)).slice(-3);
      if (st[1]) st[1].textContent = nice(res[res.length - 1].g.day);
      filterNow(p);
      [].forEach.call(p.querySelectorAll('.uu-filter button'), function (bt) { if (!bt.__gh) { bt.__gh = 1; bt.addEventListener('click', function () { setTimeout(function () { filterNow(p); }, 0); }); } });
    }).catch(function () { list.removeAttribute('data-gh-error'); });
  }

  function scan() { [].forEach.call(document.querySelectorAll('.uu-list:not([data-gh])'), fill); }
  if ('MutationObserver' in window) new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  window.OAAUpdates = { reduce: reduce, build: build }; // for tests
})();
