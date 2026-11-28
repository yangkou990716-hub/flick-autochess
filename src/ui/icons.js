// 介面圖示：把 emoji 換成 assets/art/icons/ 的手繪圖（tools/ui-art/gen.py 產生）
// FA.gi(name) 回傳 <img>；FA.iconize(root) 把文字裡已知的 emoji 換成圖；畫面更新時自動套用
(function (g) {
  const FA = g.FA = g.FA || {};
  const BASE = 'assets/art/icons/';
  const MAP = {
    '💰': 'coin', '❤': 'heart', '🛡': 'shield', '🔄': 'refresh', '🔒': 'lock', '🔓': 'unlock', '🛒': 'cart',
    '⚡': 'bolt', '📖': 'book', '📘': 'book', '☰': 'menu', '🏠': 'home', '🌐': 'globe', '⚔': 'swords', '⚙': 'wrench', '🔧': 'wrench',
    '🎖': 'medal', '☠': 'skull', '👑': 'skull', '📦': 'box', '❗': 'question', '🐷': 'chest', '🎁': 'i-armory',
    // 道具／裝備／武器（i-<id>.png）
    '✊': 'i-fist', '🧿': 'i-charm', '👟': 'i-boots', '🩸': 'i-vampfist', '🚀': 'i-jetboots', '🦇': 'i-vampboots', '🌀': 'i-spring',
    '🦔': 'i-spikes', '🛞': 'i-ring', '🧨': 'i-dynamite', '🪶': 'i-featherW', '💉': 'i-needle', '🧊': 'i-icepick', '🔨': 'i-hammer',
    '🛹': 'i-hover', '🪛': 'i-breaker', '📽': 'i-projector', '🎞': 'i-projectorX', '🪚': 'i-wrench1', '💎': 'i-armoryP', '🔥': 'i-furnace'
  };
  const RE = new RegExp('(' + Object.keys(MAP).join('|') + ')\\uFE0F?', 'g');
  FA.gi = (name, cls, alt) => `<img class="gi${cls ? ' ' + cls : ''}" src="${BASE}${name}.png" alt="${alt || ''}" draggable="false">`;
  const SKIP = { SCRIPT: 1, STYLE: 1, OPTION: 1, SELECT: 1, TEXTAREA: 1, INPUT: 1, CANVAS: 1 };
  function iconize(root) {
    if (!root || !document.createTreeWalker) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (RE.lastIndex = 0, RE.test(n.nodeValue) && !(n.parentNode && SKIP[n.parentNode.nodeName])) ? 1 : 3
    });
    const list = []; let n; while ((n = w.nextNode())) list.push(n);
    for (const t of list) {
      const f = document.createDocumentFragment(); let last = 0; const s = t.nodeValue; RE.lastIndex = 0; let m;
      while ((m = RE.exec(s))) {
        if (m.index > last) f.appendChild(document.createTextNode(s.slice(last, m.index)));
        const img = document.createElement('img'); img.className = 'gi'; img.alt = m[1]; img.draggable = false; img.src = BASE + MAP[m[1]] + '.png';
        f.appendChild(img); last = m.index + m[0].length;
      }
      if (last < s.length) f.appendChild(document.createTextNode(s.slice(last)));
      t.parentNode.replaceChild(f, t);
    }
  }
  FA.iconize = iconize;
  // 給 canvas 用：emoji → 已載入的圖示 Image（還沒載好回傳 null，並開始載）；不在對照表回傳 undefined
  const imgs = {};
  FA.emojiImg = txt => {
    const k = MAP[String(txt).replace(/\uFE0F/g, '')]; if (!k) return undefined;
    let e = imgs[k]; if (!e) { e = imgs[k] = { ok: false, im: new Image() }; e.im.onload = () => { e.ok = true; }; e.im.src = BASE + k + '.png'; }
    return e.ok ? e.im : null;
  };
  function watch() {
    const roots = ['shop', 'modal', 'uxTut', 'title'].map(id => document.getElementById(id)).filter(Boolean);
    roots.forEach(r => iconize(r));
    if (typeof MutationObserver === 'undefined') return;
    let q = new Set(), pending = false;
    const flush = () => { pending = false; q.forEach(iconize); q = new Set(); };
    const mo = new MutationObserver(ms => {
      for (const m of ms) q.add(m.target.nodeType === 3 ? m.target.parentNode : m.target);
      if (!pending) { pending = true; (g.requestAnimationFrame || setTimeout)(flush); }
    });
    roots.forEach(r => mo.observe(r, { childList: true, subtree: true, characterData: true }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})(globalThis);
