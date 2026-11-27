# 第 4 批：場地＋介面素材

方向 A：地中海度假泳池；採水粉／不透明水彩質感，主色為珊瑚橘、奶油白、地中海藍、薄荷綠與金色。所有介面圖檔不含文字，供遊戲依語系疊字。

## 場地
- `assets/art/arena/arena-riviera.svg`：一般戰場，1120×1680；以既有 `assets/art/samples/arena-A.png` 作為來源圖層，不覆寫樣品。
- `assets/art/arena/arena-boss-dusk.svg`：暮色暗紅首領戰場，1120×1680；以同一場地構圖套用暗紅色調與首領中央徽記。
- `assets/art/arena/pillar-swim-ring.svg`：泳圈柱，256×256，透明背景。
- `assets/art/arena/pillar-spikes.svg`：尖刺柱，256×256，透明背景。

## 介面
- `panel-bg.svg`：640×640 面板底圖。
- `button-primary-coral.svg`、`button-secondary-sea.svg`：480×160 主／次按鈕。
- `shop-frame-1-stone.svg` 至 `shop-frame-5-gold.svg`：512×640 商店卡框，依序為石、翠、藍、紫晶、金箔感。
- `strategy-frame-silver.svg`、`strategy-frame-gold.svg`、`strategy-frame-prismatic.svg`：512×640 策略卡框。
- `synergy-capsule.svg`：360×128 羈絆膠囊底圖。

## 九宮格切線（左上為原點，單位 px）
- 面板 640×640：X = 64、576；Y = 64、576。四角保留 64×64，邊緣可延伸，中央可平鋪／拉伸。
- 主／次按鈕 480×160：X = 48、432；Y = 40、120。四角保留 48×40，中央水平拉伸。
- 商店／策略卡框 512×640：X = 76、436；Y = 86、538。四角保留 76×86，側框與上下飾條可延伸，卡面中央保持透明。
- 羈絆膠囊 360×128：X = 54、306；Y = 36、92。兩端保留 54×36，中段水平拉伸。

## 待補項目
本次依「圖太多先做場地和按鈕、卡框」的優先順序交付場地、障礙柱、面板、按鈕、商店卡框、策略卡框與羈絆膠囊。節點圖示 5 種、標題畫面背景與透明 Logo 留待下一批補齊。
