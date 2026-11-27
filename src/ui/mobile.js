// iPhone 相容（Safari／加到主畫面）：捏合縮放、長按選單、standalone 標記、橫向提示（戰鬥中轉橫自動暫停）
// 只處理瀏覽器行為，不碰遊戲邏輯；樣式在 style.css「iPhone 相容」段
(function () {
  const d = document, html = d.documentElement;
  const editable = t => t && t.closest && t.closest('input,textarea,select,[contenteditable]');
  // 加到主畫面後以 standalone 開啟：加 class（CSS 可依此微調），也給除錯用
  const mq = q => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() { } });
  const standalone = navigator.standalone === true || mq('(display-mode: standalone)').matches;
  html.classList.toggle('standalone', standalone);
  // iOS Safari 不理 viewport 的 user-scalable=no：擋掉捏合縮放（雙擊放大由 CSS touch-action: manipulation 處理，不會吃掉連點）
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => d.addEventListener(t, e => e.preventDefault(), { passive: false }));
  // 長按：不跳「拷貝／查詢」選單（輸入框除外；商店的長按看詳細由 main.js 自己處理）
  d.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
  // 橫向提示：手機橫拿時蓋一層「請轉回直向」；戰鬥中順便暫停
  const rot = d.createElement('div'); rot.id = 'uxRotate';
  rot.innerHTML = '<div><div class="ic">📱</div>請把手機轉回<b>直向</b><br><span>這款遊戲只支援直式畫面</span></div>';
  d.body.appendChild(rot);
  const land = mq('(orientation: landscape) and (max-height: 520px)');
  const onRot = () => {
    if (!land.matches) return;
    const bt = d.getElementById('battle'), bp = d.getElementById('bPause'), m = d.getElementById('modal');
    if (bt && !bt.classList.contains('hidden') && bp && m && m.classList.contains('hidden')) bp.click();
  };
  if (land.addEventListener) land.addEventListener('change', onRot); else if (land.addListener) land.addListener(onRot);
  onRot();
  (globalThis.FA = globalThis.FA || {}).mobile = { standalone, landscape: () => land.matches };
})();
