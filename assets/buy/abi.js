/* Tiny ABI encoder (enough for the Uniswap V4 swap): uint/int/address/bool, bytes, dynamic arrays, tuples. */
(function () {
  'use strict';
  function hex(n) { return BigInt(n).toString(16); }
  function pad(h) { return h.padStart(64, '0'); }
  function word(t, v) {
    if (t === 'address') return pad(String(v).toLowerCase().replace(/^0x/, ''));
    if (t === 'bool') return pad(v ? '1' : '0');
    if (/^int/.test(t)) { var x = BigInt(v); if (x < 0n) x = (1n << 256n) + x; return pad(hex(x)); }
    return pad(hex(v)); // uintN
  }
  function isDyn(t) { return t === 'bytes' || t === 'string' || /\[\]$/.test(t) || (Array.isArray(t) && t.some(isDyn)); }
  function enc(t, v) {
    if (Array.isArray(t)) return encTuple(t, v);
    if (t === 'bytes') { var h = String(v).replace(/^0x/, ''); var n = h.length / 2; return pad(hex(n)) + h + '0'.repeat((64 - h.length % 64) % 64); }
    if (/\[\]$/.test(t)) { var it = t.slice(0, -2); return pad(hex(v.length)) + encTuple(v.map(function () { return it; }), v); }
    return word(t, v);
  }
  function encTuple(types, vals) {
    var head = '', tail = '', hl = 0;
    types.forEach(function (t) { hl += isDyn(t) ? 32 : (Array.isArray(t) ? staticLen(t) : 32); });
    types.forEach(function (t, i) {
      if (isDyn(t)) { head += pad(hex(hl + tail.length / 2)); tail += enc(t, vals[i]); }
      else head += enc(t, vals[i]);
    });
    return head + tail;
  }
  function staticLen(t) { return t.reduce(function (a, x) { return a + (Array.isArray(x) ? staticLen(x) : 32); }, 0); }
  window.OAAABI = { encode: function (types, vals) { return encTuple(types, vals); } };
})();
