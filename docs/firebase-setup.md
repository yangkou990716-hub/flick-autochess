# 連線對戰設定（Firebase）— 只用手機也能完成

連線對戰用 Google 的免費服務 **Firebase Realtime Database** 傳送「每一發的輸入」。
整個設定大約 10 分鐘，**不用寫程式**，最後把一段設定貼給 Claude 就好。
免費方案（Spark）對這個遊戲綽綽有餘，不需要綁信用卡。

> 建議用 iPhone 的 Safari 操作；畫面太擠時，按網址列左邊的「大小」→「切換為桌面版網站」。

---

## 1. 建立 Firebase 專案

1. 打開 <https://console.firebase.google.com>，用你的 Google 帳號登入。
2. 按「**建立專案**」（或「新增專案」）。
3. 專案名稱隨便取，例如 `flick-autochess`，按「繼續」。
4. 「Google Analytics」可以**關掉**（用不到），按「建立專案」，等它跑完按「繼續」。

## 2. 開啟 Realtime Database

1. 左邊選單（手機版在左上角 ☰）→「**建構**（Build）」→「**Realtime Database**」。
   - 注意是 **Realtime Database**，不是 Firestore。
2. 按「**建立資料庫**」。
3. 位置選 **新加坡 `asia-southeast1`**（離台灣最近、延遲最低），按「下一步」。
4. 安全規則先選「**以鎖定模式啟動**」，按「啟用」。
5. 建好之後，畫面上方會看到資料庫網址，長得像：
   `https://flick-autochess-default-rtdb.asia-southeast1.firebasedatabase.app`
   （等一下的設定裡會有，不用抄。）

## 3. 貼上安全規則

1. 在 Realtime Database 頁面點上方的「**規則**（Rules）」分頁。
2. 把裡面原本的內容**全部刪掉**，貼上下面整段，按「**發布**」。

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "$code.matches(/^[0-9]{4}$/)",
        ".write": "$code.matches(/^[0-9]{4}$/) && newData.exists() && (!data.exists() || data.child('createdAt').val() < now - 43200000)",
        ".validate": "newData.hasChildren(['createdAt', 'hostId', 'state'])",
        "v": { ".validate": "newData.isNumber()" },
        "createdAt": { ".validate": "newData.isNumber() && newData.val() <= now" },
        "hostId": {
          ".write": "data.parent().exists()",
          ".validate": "newData.isString() && newData.val().length <= 24"
        },
        "state": {
          ".write": "data.parent().exists()",
          ".validate": "newData.isString() && newData.val().matches(/^(lobby|battle|over)$/)"
        },
        "players": {
          ".write": "data.parent().exists()",
          "$pid": {
            ".validate": "$pid.matches(/^p[a-z0-9]{4,20}$/) && newData.hasChildren(['name', 'seat', 'team'])",
            "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12" },
            "team": { ".validate": "newData.isString() && newData.val().length <= 4000" },
            "seat": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 7" },
            "ready": { ".validate": "newData.isBoolean()" },
            "online": { ".validate": "newData.isBoolean()" },
            "joinedAt": { ".validate": "newData.isNumber()" },
            "lastSeen": { ".validate": "newData.isNumber()" },
            "$other": { ".validate": false }
          }
        },
        "battle": {
          ".write": "data.parent().exists()",
          ".validate": "newData.hasChildren(['gen', 'seed', 'seats', 'teams'])",
          "gen": { ".validate": "newData.isNumber()" },
          "seed": { ".validate": "newData.isNumber()" },
          "at": { ".validate": "newData.isNumber()" },
          "seats": { "$i": { ".validate": "$i.matches(/^[0-7]$/) && newData.isString() && newData.val().length <= 24" } },
          "teams": { "$i": { ".validate": "$i.matches(/^[0-7]$/) && newData.isString() && newData.val().length <= 4000" } },
          "names": { "$i": { ".validate": "$i.matches(/^[0-7]$/) && newData.isString() && newData.val().length <= 12" } },
          "$other": { ".validate": false }
        },
        "moves": {
          "$k": {
            ".write": "data.parent().parent().exists() && (!data.exists() || !newData.exists())",
            ".validate": "$k.matches(/^g[0-9]{1,6}_[0-9]{4}$/) && newData.hasChildren(['g', 'n', 'by', 'idx', 'angle', 'power'])",
            "g": { ".validate": "newData.isNumber()" },
            "n": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 10000" },
            "by": { ".validate": "newData.isString() && newData.val().length <= 40" },
            "idx": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 64" },
            "angle": { ".validate": "newData.isNumber() && newData.val() > -20 && newData.val() < 20" },
            "power": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1" },
            "ult": { ".validate": "newData.isBoolean()" },
            "tap": {
              ".validate": "newData.hasChildren(['t', 'x', 'y'])",
              "t": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 3000" },
              "x": { ".validate": "newData.isNumber() && newData.val() > -2000 && newData.val() < 2000" },
              "y": { ".validate": "newData.isNumber() && newData.val() > -2000 && newData.val() < 2000" },
              "$other": { ".validate": false }
            },
            "$other": { ".validate": false }
          }
        },
        "snap": {
          ".write": "data.parent().exists()",
          ".validate": "newData.hasChildren(['g', 'n', 'hash'])",
          "g": { ".validate": "newData.isNumber()" },
          "n": { ".validate": "newData.isNumber()" },
          "hash": { ".validate": "newData.isString() && newData.val().length <= 16" },
          "$other": { ".validate": false }
        },
        "snapData": {
          ".write": "data.parent().exists()",
          ".validate": "newData.hasChildren(['g', 'n', 'data'])",
          "g": { ".validate": "newData.isNumber()" },
          "n": { ".validate": "newData.isNumber()" },
          "data": { ".validate": "newData.isString() && newData.val().length <= 200000" },
          "$other": { ".validate": false }
        },
        "result": {
          ".write": "data.parent().exists()",
          "g": { ".validate": "newData.isNumber()" },
          "winner": { ".validate": "newData.isNumber()" },
          "n": { ".validate": "newData.isNumber()" },
          "hash": { ".validate": "newData.isString() && newData.val().length <= 16" },
          "$other": { ".validate": false }
        },
        "$other": { ".validate": false }
      }
    },
    "leagues": {
      "$code": {
        ".read": "$code.matches(/^[0-9]{4}$/)",
        ".write": "$code.matches(/^[0-9]{4}$/) && newData.exists() && (!data.exists() || data.child('createdAt').val() < now - 43200000)",
        ".validate": "newData.hasChildren(['createdAt', 'hostId', 'state'])",
        "v": { ".validate": "newData.isNumber()" },
        "createdAt": { ".validate": "newData.isNumber() && newData.val() <= now" },
        "hostId": { ".write": "data.parent().exists()", ".validate": "newData.isString() && newData.val().length <= 24" },
        "state": { ".write": "data.parent().exists()", ".validate": "newData.isString() && newData.val().matches(/^(lobby|play|over)$/)" },
        "players": {
          ".write": "data.parent().exists()",
          "$pid": {
            ".validate": "$pid.matches(/^p[a-z0-9]{4,20}$/) && newData.hasChildren(['name', 'seat'])",
            "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12" },
            "seat": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 7" },
            "online": { ".validate": "newData.isBoolean()" },
            "joinedAt": { ".validate": "newData.isNumber()" },
            "lastSeen": { ".validate": "newData.isNumber()" },
            "hp": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999" },
            "out": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 99" },
            "place": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 8" },
            "rdy": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 99" },
            "quit": { ".validate": "newData.isBoolean()" },
            "team": { ".validate": "newData.isString() && newData.val().length <= 4000" },
            "prev": { ".validate": "newData.isString() && newData.val().length <= 4000" },
            "opps": { ".validate": "newData.isString() && newData.val().length <= 600" },
            "$other": { ".validate": false }
          }
        },
        "lg": {
          ".write": "data.parent().exists()",
          ".validate": "newData.hasChildren(['round', 'phase', 'ends', 'seed'])",
          "round": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 99" },
          "phase": { ".validate": "newData.isString() && newData.val().matches(/^(shop|battle|over)$/)" },
          "ends": { ".validate": "newData.isNumber()" },
          "seed": { ".validate": "newData.isNumber()" },
          "np": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 4" },
          "$other": { ".validate": false }
        },
        "pairs": {
          ".write": "data.parent().exists()",
          "$i": {
            ".validate": "$i.matches(/^[0-3]$/) && newData.hasChildren(['r', 'a', 'b', 'seed', 'teams', 'names'])",
            "r": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 99" },
            "a": { ".validate": "newData.isString() && newData.val().length <= 24" },
            "b": { ".validate": "newData.isString() && newData.val().length <= 24" },
            "src": { ".validate": "newData.isString() && newData.val().length <= 24" },
            "seed": { ".validate": "newData.isNumber()" },
            "teams": {
              "$t": { ".validate": "$t.matches(/^[01]$/) && newData.isString() && newData.val().length <= 4000" }
            },
            "names": {
              "$t": { ".validate": "$t.matches(/^[01]$/) && newData.isString() && newData.val().length <= 16" }
            },
            "$other": { ".validate": false }
          }
        },
        "pm": {
          ".write": "data.parent().exists() && !newData.exists()",
          "$i": {
            ".validate": "$i.matches(/^[0-3]$/)",
            "$k": {
              ".write": "data.parent().parent().parent().exists() && (!data.exists() || !newData.exists())",
              ".validate": "$k.matches(/^r[0-9]{1,2}_[0-9]{4}$/) && newData.hasChildren(['r', 'n', 'by', 'idx', 'angle', 'power'])",
              "r": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 99" },
              "n": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 9999" },
              "by": { ".validate": "newData.isString() && newData.val().length <= 40" },
              "idx": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 63" },
              "angle": { ".validate": "newData.isNumber() && newData.val() > -20 && newData.val() < 20" },
              "power": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1" },
              "ult": { ".validate": "newData.isBoolean()" },
              "tap": {
                ".validate": "newData.hasChildren(['t', 'x', 'y'])",
                "t": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 3000" },
                "x": { ".validate": "newData.isNumber() && newData.val() > -2000 && newData.val() < 2000" },
                "y": { ".validate": "newData.isNumber() && newData.val() > -2000 && newData.val() < 2000" },
                "$other": { ".validate": false }
              },
              "$other": { ".validate": false }
            }
          }
        },
        "ps": {
          ".write": "data.parent().exists()",
          "$i": {
            ".validate": "$i.matches(/^[0-3]$/) && newData.hasChildren(['r', 'n', 'hash'])",
            "r": { ".validate": "newData.isNumber()" },
            "n": { ".validate": "newData.isNumber()" },
            "hash": { ".validate": "newData.isString() && newData.val().length <= 16" },
            "$other": { ".validate": false }
          }
        },
        "psd": {
          ".write": "data.parent().exists()",
          "$i": {
            ".validate": "$i.matches(/^[0-3]$/) && newData.hasChildren(['r', 'n', 'data'])",
            "r": { ".validate": "newData.isNumber()" },
            "n": { ".validate": "newData.isNumber()" },
            "data": { ".validate": "newData.isString() && newData.val().length <= 200000" },
            "$other": { ".validate": false }
          }
        },
        "pr": {
          ".write": "data.parent().exists()",
          "$i": {
            ".validate": "$i.matches(/^[0-3]$/) && newData.hasChildren(['r', 'winner', 'left'])",
            "r": { ".validate": "newData.isNumber()" },
            "winner": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1" },
            "left": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 99" },
            "n": { ".validate": "newData.isNumber()" },
            "hash": { ".validate": "newData.isString() && newData.val().length <= 16" },
            "$other": { ".validate": false }
          }
        },
        "res": {
          ".write": "data.parent().exists()",
          "$pid": {
            ".validate": "$pid.matches(/^p[a-z0-9]{4,20}$/) && newData.hasChildren(['r', 'win', 'dmg', 'hp'])",
            "r": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 99" },
            "win": { ".validate": "newData.isBoolean()" },
            "dmg": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999" },
            "left": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 99" },
            "hp": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999" },
            "opp": { ".validate": "newData.isString() && newData.val().length <= 12" },
            "$other": { ".validate": false }
          }
        },
        "$other": { ".validate": false }
      }
    }
  }
}
```

這份規則做了什麼：
- `rooms/` 是 1v1 連線對戰，`leagues/` 是「🏆 連線自走棋」（2～4 人），兩邊各自驗證。
- 只能讀寫 `rooms/` 底下、房號是 **4 位數字**的房間；其他位置全部禁止。
- 每個欄位都限制型別與長度（名稱 ≤ 12 字、隊伍代碼 ≤ 4000 字、快照 ≤ 200 KB），亂塞資料會被擋。
- 已經寫入的「每一發」不能被改（只能新增或清除），避免被竄改。
- 每一發可帶「二次操作」`tap`（`t` 物理步數 1～3000、`x`/`y` 場地座標），給飛行中點畫面的角色用（遙控炸彈、幻影劍士）。
- 房間不能被整個刪掉；超過 12 小時的舊房間才能被新房間覆蓋。
- 沒有登入機制，所以知道房號的人都能進房看資料；遊戲裡沒有個資，只有名稱與隊伍。

## 4. 新增 Web 應用，取得 firebaseConfig

1. 左上角「**專案總覽**」旁的齒輪 ⚙ →「**專案設定**」。
2. 往下捲到「**你的應用程式**」，按 **`</>`**（網頁）圖示。
3. 應用程式暱稱隨便取，例如 `flick-web`；「Firebase Hosting」**不用勾**，按「註冊應用程式」。
4. 畫面會出現一段程式碼，找到這段（數值是你自己的）：

```js
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "flick-autochess.firebaseapp.com",
  databaseURL: "https://flick-autochess-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "flick-autochess",
  storageBucket: "flick-autochess.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

5. **長按選取從 `const firebaseConfig = {` 到 `};` 整段**，複製。
   - 如果裡面**沒有 `databaseURL`**，回到 Realtime Database 頁面，把上方的資料庫網址也一起複製。

## 5. 貼給 Claude

在對話裡說：「這是我的 firebaseConfig，幫我填進連線對戰設定」，然後貼上。
Claude 會把它填進 `data/netconfig.js`（`FA.NET_CONFIG = {...}`）並更新到 GitHub Pages。

> `apiKey` 不是密碼，放在網頁裡是正常的；真正保護資料的是第 3 步的安全規則。

## 6. 開始玩

1. 兩支手機都先開「單人新遊戲」，在商店把**前台**佈好（連線對戰用的是你目前單人局的隊伍）。
2. 回標題按「🌐 連線對戰」。
3. 一人按「建立房間」，把畫面上的 **4 碼房號**告訴朋友；朋友輸入房號按「加入」。
4. 兩人都按「準備」就開打：輪流彈射，動數先歸零的一方輸。
5. 中途切出 App、鎖螢幕或斷線都沒關係：回來會自動接回；離線期間由房主手機的 AI 代打。

## 連線自走棋（2～4 人）

1. 標題按「🏆 連線自走棋（2～4 人）」。不需要先有單人局，每人在房間裡從零開始經營商店。
2. 一人「建立房間」，其他人輸入 4 碼房號加入；房主在 2 人以上時按「開始」。
3. 每回合：商店 45 秒（可提早按「準備」，時間到自動送出）→ 兩兩對戰（人數奇數時，落單的人打另一位玩家上回合隊伍的「幽靈」）→ 輸家扣小隊血量。
4. 血量歸零淘汰，可留下觀戰；剩 1 人或第 15 回合結束依血量排名。
5. 掉線或切出 App：回來自動接回；商店階段掉線就用上回合的隊伍，對戰由 AI 代打。
6. 規則更新：第 3 步的 JSON 已含 `leagues` 區塊，**舊版規則要重新貼上並發布**，否則建立房間會失敗。
7. 規則更新（第八輪・二次操作）：`rooms` 的 `moves` 與 `leagues` 的 `pm` 多了 `tap` 欄位，**請重新貼上第 3 步整段並發布**；沒更新的話，遙控炸彈／幻影劍士在飛行中點畫面的那一發會被擋下（送出失敗，最後由 AI 代打）。

## 常見問題

- **按「連線對戰」顯示「尚未設定連線」**：還沒做第 5 步，或 GitHub Pages 還沒更新（等 1～2 分鐘後重開 App）。
- **建立房間一直失敗**：檢查第 3 步規則是否已「發布」，以及資料庫位置是不是 Realtime Database。
- **想清掉舊房間**：Realtime Database →「資料」分頁 → 在 `rooms` 上按 ⋮ →「刪除」（主控台不受規則限制）。
