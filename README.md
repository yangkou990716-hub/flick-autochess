# 彈射自走棋

貨幣戰爭的商店經營 × 彈射碰撞，回合制手機網頁遊戲（iPhone 直式、PWA 可離線）。

- 遊玩：GitHub Pages
- 資料檔：`data/`（角色、羈絆、裝備/武器、敵人/首領、開局詞綴/投資環境/投資策略/獎勵、設定，平衡只改這裡）
- 核心邏輯：`src/core/`（可在 Node 無畫面執行，物理固定步長可重現）
- 畫面：`src/ui/`、`src/main.js`
- 平衡模擬：`node sim/simulate.js 1000`
- 連線對戰：`src/online.js`（Firebase Realtime Database，設定見 `docs/firebase-setup.md`）；測試 `python3 tests/online_e2e.py`（假 Firebase，網址加 `?netmock=1`）
