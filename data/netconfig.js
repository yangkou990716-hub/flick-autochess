// 連線對戰設定（Firebase Realtime Database）
// 還沒設定時保持 null：標題的「🌐 連線對戰」會顯示「尚未設定連線」。
// 設定方法見 docs/firebase-setup.md：把 Firebase 主控台給的 firebaseConfig 整段貼進來，例如：
// FA.NET_CONFIG = { apiKey: '...', authDomain: '...', databaseURL: 'https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: '...', appId: '...' };
(function (g) {
  const FA = g.FA = g.FA || {};
  FA.NET_CONFIG = null;
})(globalThis);
