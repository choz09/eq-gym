// エクイティ計算エンジン(ブラウザ/Node両対応、DOMに触らない)
// カードID = ランク(0=2 … 12=A)*4 + スート(0=s,1=h,2=d,3=c)
(function (root) {
  const RL = "AKQJT98765432"; // グリッドの並び(左上がA)
  const RK = "23456789TJQKA"; // ランク添字
  const SU = "shdc";

  const cardId = (s) => RK.indexOf(s[0]) * 4 + SU.indexOf(s[1]);
  const cardStr = (id) => RK[id >> 2] + SU[id & 3];

  // ---- 169セル ----
  function cellInfo(i, j) {
    const a = 12 - i, b = 12 - j;
    if (i === j) return { label: RL[i] + RL[i], hi: a, lo: a, kind: "p" };
    if (i < j) return { label: RL[i] + RL[j] + "s", hi: a, lo: b, kind: "s" };
    return { label: RL[j] + RL[i] + "o", hi: b, lo: a, kind: "o" };
  }
  const CELLS = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const c = cellInfo(i, j);
      const combos = [];
      if (c.kind === "p") {
        for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) combos.push([c.hi * 4 + s1, c.hi * 4 + s2]);
      } else if (c.kind === "s") {
        for (let s = 0; s < 4; s++) combos.push([c.hi * 4 + s, c.lo * 4 + s]);
      } else {
        for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) combos.push([c.hi * 4 + s1, c.lo * 4 + s2]);
      }
      c.combos = combos;
      CELLS.push(c);
    }
  }
  const LABEL_TO_CELL = {};
  CELLS.forEach((c, i) => (LABEL_TO_CELL[c.label] = i));

  function cellOfCombo(a, b) {
    const r1 = a >> 2, r2 = b >> 2;
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    if (hi === lo) return (12 - hi) * 14;
    if ((a & 3) === (b & 3)) return (12 - hi) * 13 + (12 - lo);
    return (12 - lo) * 13 + (12 - hi);
  }

  // ---- レンジ文字列 ----
  const rIdx = (ch) => RK.indexOf(ch);
  function setCell(sel, hi, lo, kind) {
    if (hi === lo) sel[(12 - hi) * 14] = 1;
    else if (kind === "s") sel[(12 - hi) * 13 + (12 - lo)] = 1;
    else sel[(12 - lo) * 13 + (12 - hi)] = 1;
  }
  function setNonPair(sel, hi, lo, kind) {
    if (kind === "s" || kind === "o") setCell(sel, hi, lo, kind);
    else { setCell(sel, hi, lo, "s"); setCell(sel, hi, lo, "o"); }
  }
  function parseToken(sel, tok) {
    tok = tok.trim();
    if (!tok) return;
    if (tok.includes("-")) {
      const [a, b] = tok.split("-").map((x) => x.trim());
      const a1 = rIdx(a[0]), a2 = rIdx(a[1]), b1 = rIdx(b[0]), b2 = rIdx(b[1]);
      if ([a1, a2, b1, b2].some((v) => v < 0)) throw new Error(tok);
      if (a1 === a2) {
        if (b1 !== b2) throw new Error(tok);
        for (let r = Math.min(a1, b1); r <= Math.max(a1, b1); r++) setCell(sel, r, r, "p");
        return;
      }
      const kind = a[2] || b[2] || "";
      const hiA = Math.max(a1, a2), loA = Math.min(a1, a2);
      const hiB = Math.max(b1, b2), loB = Math.min(b1, b2);
      if (hiA === hiB) {
        for (let l = Math.min(loA, loB); l <= Math.max(loA, loB); l++) setNonPair(sel, hiA, l, kind);
      } else if (hiA - loA === hiB - loB) {
        for (let h = Math.min(hiA, hiB); h <= Math.max(hiA, hiB); h++) setNonPair(sel, h, h - (hiA - loA), kind);
      } else throw new Error(tok);
      return;
    }
    const plus = tok.endsWith("+");
    if (plus) tok = tok.slice(0, -1);
    if (tok.length < 2 || tok.length > 3) throw new Error(tok);
    const r1 = rIdx(tok[0]), r2 = rIdx(tok[1]);
    if (r1 < 0 || r2 < 0) throw new Error(tok);
    const kind = tok[2] || "";
    if (kind && kind !== "s" && kind !== "o") throw new Error(tok);
    if (r1 === r2) {
      if (kind) throw new Error(tok);
      for (let r = r1; r <= (plus ? 12 : r1); r++) setCell(sel, r, r, "p");
      return;
    }
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    for (let l = lo; l <= (plus ? hi - 1 : lo); l++) setNonPair(sel, hi, l, kind);
  }
  // 戻り値 { sel, error }
  function parseRange(text) {
    const sel = new Uint8Array(169);
    const t = text.replace(/[、，\s]+/g, ",").replace(/^,|,$/g, "");
    if (t.toLowerCase() === "random") { sel.fill(1); return { sel, error: null }; }
    try {
      t.split(",").forEach((tok) => parseToken(sel, tok));
    } catch (e) {
      return { sel, error: "読み取れない記述: " + e.message };
    }
    return { sel, error: null };
  }

  function rangeCombos(sel, dead) {
    const out = [];
    for (let i = 0; i < 169; i++) {
      if (!sel[i]) continue;
      for (const c of CELLS[i].combos) if (!dead || (!dead[c[0]] && !dead[c[1]])) out.push(c);
    }
    return out;
  }

  // 強さ順(vs ランダムのエクイティ順)で上位p%(コンボ数基準)
  let RANK_ORDER = [];
  function setRankOrder(list) { RANK_ORDER = list; }
  function topPercent(p) {
    const sel = new Uint8Array(169);
    const target = (p / 100) * 1326;
    let cum = 0;
    for (const lab of RANK_ORDER) {
      const idx = LABEL_TO_CELL[lab];
      const n = CELLS[idx].combos.length;
      if (cum >= target || (cum + n / 2 > target && cum > 0)) break;
      sel[idx] = 1;
      cum += n;
    }
    return sel;
  }
  function countCombos(sel) {
    let n = 0;
    for (let i = 0; i < 169; i++) if (sel[i]) n += CELLS[i].combos.length;
    return n;
  }

  // ---- 役判定 ----
  const STR = new Int8Array(8192).fill(-1);
  for (let m = 0; m < 8192; m++) {
    for (let hi = 12; hi >= 4; hi--) {
      const need = 31 << (hi - 4);
      if ((m & need) === need) { STR[m] = hi; break; }
    }
    if (STR[m] < 0 && (m & 0x100f) === 0x100f) STR[m] = 3; // A2345
  }
  const cnt = new Int8Array(13);
  const sm = new Int32Array(4);
  const scn = new Int8Array(4);
  const topBit = (m) => 31 - Math.clz32(m);
  const mk = (cat, a, b, c, d, e) => ((((cat * 13 + a) * 13 + b) * 13 + c) * 13 + d) * 13 + e;

  const K = new Int8Array(5);
  function topN(m, n) { // 上位n個のランクをKに詰める(残りは0)
    K.fill(0);
    for (let i = 0; i < n && m; i++) { const r = topBit(m); K[i] = r; m &= ~(1 << r); }
  }

  function score(cs, n) {
    cnt.fill(0);
    sm[0] = sm[1] = sm[2] = sm[3] = 0;
    scn[0] = scn[1] = scn[2] = scn[3] = 0;
    let rm = 0;
    for (let i = 0; i < n; i++) {
      const r = cs[i] >> 2, s = cs[i] & 3;
      cnt[r]++; rm |= 1 << r; sm[s] |= 1 << r; scn[s]++;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (scn[s] >= 5) fs = s;
    if (fs >= 0) {
      const sh = STR[sm[fs]];
      if (sh >= 0) return mk(8, sh, 0, 0, 0, 0);
    }
    let q = -1, t = -1, p1 = -1, p2 = -1;
    for (let r = 12; r >= 0; r--) {
      const c = cnt[r];
      if (c === 4) q = r;
      else if (c === 3) { if (t < 0) t = r; else if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
      else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (q >= 0) { topN(rm & ~(1 << q), 1); return mk(7, q, K[0], 0, 0, 0); }
    if (t >= 0 && p1 >= 0) return mk(6, t, p1, 0, 0, 0);
    if (fs >= 0) { topN(sm[fs], 5); return mk(5, K[0], K[1], K[2], K[3], K[4]); }
    const sh = STR[rm];
    if (sh >= 0) return mk(4, sh, 0, 0, 0, 0);
    if (t >= 0) { topN(rm & ~(1 << t), 2); return mk(3, t, K[0], K[1], 0, 0); }
    if (p2 >= 0) { topN(rm & ~(1 << p1) & ~(1 << p2), 1); return mk(2, p1, p2, K[0], 0, 0); }
    if (p1 >= 0) { topN(rm & ~(1 << p1), 3); return mk(1, p1, K[0], K[1], K[2], 0); }
    topN(rm, 5);
    return mk(0, K[0], K[1], K[2], K[3], K[4]);
  }

  // ---- エクイティ ----
  const cs1 = new Int8Array(7), cs2 = new Int8Array(7);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // H, V: [[c1,c2],...](ブロッカー除外済みでなくてよい)  board: カードID配列
  // 戻り値 { eq, win, tie, se, n, exact, buckets(単独ハンドのとき相手コンボごとのeq) , V(有効コンボ) }
  async function computeEquity(H, V, board, opts) {
    opts = opts || {};
    const totalSamples = opts.samples || 300000;
    const exactLimit = opts.exactLimit || 3e6;
    const onProgress = opts.onProgress || (() => {});
    const dead = new Uint8Array(52);
    board.forEach((c) => (dead[c] = 1));
    H = H.filter((c) => !dead[c[0]] && !dead[c[1]]);
    V = V.filter((c) => !dead[c[0]] && !dead[c[1]]);
    if (!H.length || !V.length) return null;
    const k = 5 - board.length;
    const single = H.length === 1;

    // 有効ペア数
    let validPairs = 0;
    for (const h of H) for (const v of V) if (h[0] !== v[0] && h[0] !== v[1] && h[1] !== v[0] && h[1] !== v[1]) validPairs++;
    if (!validPairs) return null;
    const m = 52 - board.length - 4;
    const runouts = k === 0 ? 1 : k === 1 ? m : k === 2 ? (m * (m - 1)) / 2 : k === 3 ? (m * (m - 1) * (m - 2)) / 6 : Infinity;
    const exact = k <= 2 && validPairs * runouts <= exactLimit;

    const nb = single ? V.length : 1;
    const bN = new Float64Array(nb), bW = new Float64Array(nb), bT = new Float64Array(nb), bS = new Float64Array(nb), bSS = new Float64Array(nb);
    const bd = new Int8Array(5);
    for (let i = 0; i < board.length; i++) bd[i] = board[i];
    const used = new Uint8Array(52);
    let lastYield = performance_now();

    function one(h, v) {
      cs1[0] = h[0]; cs1[1] = h[1]; cs2[0] = v[0]; cs2[1] = v[1];
      for (let i = 0; i < 5; i++) { cs1[2 + i] = bd[i]; cs2[2 + i] = bd[i]; }
      const a = score(cs1, 7), b = score(cs2, 7);
      return a > b ? 1 : a === b ? 0.5 : 0;
    }
    function add(b, o) {
      bN[b]++; bS[b] += o; bSS[b] += o * o;
      if (o === 1) bW[b]++; else if (o === 0.5) bT[b]++;
    }

    let done = 0;
    if (exact) {
      const total = validPairs * runouts;
      for (let hi = 0; hi < H.length; hi++) {
        const h = H[hi];
        for (let vi = 0; vi < V.length; vi++) {
          const v = V[vi];
          if (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) continue;
          const b = single ? vi : 0;
          used.fill(0);
          board.forEach((c) => (used[c] = 1));
          used[h[0]] = used[h[1]] = used[v[0]] = used[v[1]] = 1;
          const rest = [];
          for (let c = 0; c < 52; c++) if (!used[c]) rest.push(c);
          const bl = board.length;
          if (k === 0) add(b, one(h, v));
          else if (k === 1) for (let x = 0; x < rest.length; x++) { bd[bl] = rest[x]; add(b, one(h, v)); }
          else for (let x = 0; x < rest.length; x++) { bd[bl] = rest[x]; for (let y = x + 1; y < rest.length; y++) { bd[bl + 1] = rest[y]; add(b, one(h, v)); } }
          done += runouts;
        }
        if (performance_now() - lastYield > 30) { onProgress(done / total); await tick(); lastYield = performance_now(); }
      }
    } else {
      const per = single ? Math.max(1500, Math.ceil(totalSamples / V.length)) : totalSamples;
      const total = single ? per * V.length : per;
      const pick = (bi, h, v) => {
        used.fill(0);
        board.forEach((c) => (used[c] = 1));
        used[h[0]] = used[h[1]] = used[v[0]] = used[v[1]] = 1;
        for (let i = 0; i < k; i++) {
          let c;
          do { c = (Math.random() * 52) | 0; } while (used[c]);
          used[c] = 1; bd[board.length + i] = c;
        }
        add(bi, one(h, v));
      };
      if (single) {
        const h = H[0];
        for (let vi = 0; vi < V.length; vi++) {
          const v = V[vi];
          if (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) continue;
          for (let s = 0; s < per; s++) {
            pick(vi, h, v);
            if ((s & 1023) === 1023 && performance_now() - lastYield > 30) { onProgress((vi * per + s) / total); await tick(); lastYield = performance_now(); }
          }
        }
      } else {
        for (let s = 0; s < per; s++) {
          const h = H[(Math.random() * H.length) | 0], v = V[(Math.random() * V.length) | 0];
          if (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) { s--; continue; }
          pick(0, h, v);
          if ((s & 1023) === 1023 && performance_now() - lastYield > 30) { onProgress(s / per); await tick(); lastYield = performance_now(); }
        }
      }
    }

    let eq = 0, win = 0, tie = 0, varSum = 0, used_b = 0, nTot = 0;
    const bEq = new Float64Array(nb).fill(NaN), bWin = new Float64Array(nb).fill(NaN), bTie = new Float64Array(nb).fill(NaN);
    for (let b = 0; b < nb; b++) {
      if (!bN[b]) continue;
      used_b++;
      const mean = bS[b] / bN[b];
      bEq[b] = mean; bWin[b] = bW[b] / bN[b]; bTie[b] = bT[b] / bN[b];
      eq += mean; win += bW[b] / bN[b]; tie += bT[b] / bN[b];
      const variance = Math.max(0, bSS[b] / bN[b] - mean * mean);
      varSum += variance / bN[b];
      nTot += bN[b];
    }
    const se = exact ? 0 : Math.sqrt(varSum) / used_b;
    return { eq: eq / used_b, win: win / used_b, tie: tie / used_b, se, n: nTot, exact, bEq: single ? bEq : null, bWin: single ? bWin : null, bTie: single ? bTie : null, V };
  }

  function performance_now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

  root.EQ = { RL, RK, SU, CELLS, LABEL_TO_CELL, cardId, cardStr, cellOfCombo, parseRange, rangeCombos, setRankOrder, topPercent, countCombos, score, computeEquity };
})(typeof window !== "undefined" ? window : globalThis);
