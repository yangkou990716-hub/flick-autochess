# art-a batch 4 UI 九宮格切線建議

方向 A：手繪水粉、地中海度假泳池。

Logo、節點圖示、按鈕、膠囊、卡框、面板由 `tools/ui-art/gen.py` 繪製（規則見 `docs/art/ui-art-direction.md`），場地與標題背景為生圖。
以下為建議的 9-slice（九宮格）切線，以像素表示：`left, top, right, bottom`。
這些值保守地避開外框花飾、金邊與角落裝飾，適合在 UI 中做縮放。

## 建議切線

- `panel-bg.png` — `64, 100, 64, 64`
- `button-primary-coral.png` — `72, 64, 72, 64`
- `button-secondary-sea.png` — `72, 64, 72, 64`
- `synergy-capsule.png` — `110, 56, 60, 56`（左側圓點不拉伸）
- `shop-frame-1.png` — `96, 96, 96, 96`
- `shop-frame-2.png` — `96, 96, 96, 96`
- `shop-frame-3.png` — `96, 96, 96, 96`
- `shop-frame-4.png` — `96, 96, 96, 96`
- `shop-frame-5.png` — `96, 96, 96, 96`
- `strategy-frame-silver.png` — `96, 96, 96, 96`
- `strategy-frame-gold.png` — `96, 96, 96, 96`
- `strategy-frame-prismatic.png` — `96, 96, 96, 96`

## 不建議做九宮格的素材

以下素材多屬完整插圖、場地或單體圖示，通常不做 9-slice：

- `assets/art/arena/arena-riviera.png`
- `assets/art/arena/arena-boss-dusk.png`
- `assets/art/arena/pillar-swim-ring.png`
- `assets/art/arena/pillar-spikes.png`
- `node-battle.png`
- `node-encounter.png`
- `node-reward.png`
- `node-supply.png`
- `node-boss.png`
- `title-bg.png`
- `title-logo.png`

## 尺寸一覽

### Arena
- `arena-riviera.png` — 1120×1680
- `arena-boss-dusk.png` — 1120×1680
- `pillar-swim-ring.png` — 256×256（透明）
- `pillar-spikes.png` — 256×256（透明）

### UI
- `panel-bg.png` — 640×640（透明）
- `button-primary-coral.png` — 480×160（透明）
- `button-secondary-sea.png` — 480×160（透明）
- `shop-frame-1.png` ~ `shop-frame-5.png` — 512×640（透明）
- `strategy-frame-silver.png` — 512×640（透明）
- `strategy-frame-gold.png` — 512×640（透明）
- `strategy-frame-prismatic.png` — 512×640（透明）
- `synergy-capsule.png` — 360×128（透明）
- `node-battle.png` — 128×128（透明）
- `node-encounter.png` — 128×128（透明）
- `node-reward.png` — 128×128（透明）
- `node-supply.png` — 128×128（透明）
- `node-boss.png` — 128×128（透明）
- `title-bg.png` — 1080×1920
- `title-logo.png` — 1024×512（透明）
