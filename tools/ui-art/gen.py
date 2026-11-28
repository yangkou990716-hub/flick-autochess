"""產生「彈射自走棋」介面素材（Logo、節點圖示、按鈕、膠囊、卡框、面板）。

設計原則（見 docs/art/ui-art-direction.md）：
- 與角色同一套視覺語言：深棕粗外框、平塗兩階明暗、一道高光，不用寫實光影與碎花裝飾。
- 圖示先做剪影：圖形取自 game-icons.net（CC BY 3.0），只保留一個主體。
- 全套共用：外框粗細、圓角、配色、陰影方向（左上光）。
- 最後疊一層輕微水粉紙紋，讓向量圖跟手繪角色放在一起不突兀。

用法：python3 tools/ui-art/gen.py <game-icons 目錄> <輸出目錄> [角色圖目錄]
"""
import io, math, os, re, sys
import numpy as np
import cairosvg
from PIL import Image, ImageFilter

GI, OUT = sys.argv[1], sys.argv[2]
UNITS = sys.argv[3] if len(sys.argv) > 3 else None

# ---- 色票（取自角色外框與 style-guide 主色）----
INK = '#4E2A2E'      # 外框：角色用的深暖棕
CREAM = '#FFF3DC'
CREAM_D = '#F3D9B1'
CORAL = '#F0765A'; CORAL_D = '#C9533D'; CORAL_L = '#FFA88C'
SEA = '#2F86C6'; SEA_D = '#1E5E96'; SEA_L = '#7CC3EE'
MINT = '#57C2A0'; MINT_D = '#2E8F73'
GOLD = '#F2B93B'; GOLD_D = '#C98A1C'; GOLD_L = '#FFE08A'
PLUM = '#7B4A8E'; PLUM_D = '#54306A'
STONE = '#A9A39A'; STONE_D = '#7A746C'
EMER = '#3FAE6E'; EMER_D = '#2A7C4E'
SAPH = '#3B7FD9'; SAPH_D = '#2A59A3'
AMET = '#9A5CC8'; AMET_D = '#6C3C96'
SILV = '#C9D2DA'; SILV_D = '#8C98A4'
SW = 7  # 主外框粗細（128px 圖示基準）


def render(svg, w, h):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def paper(im, strength=0.06, seed=1):
    """輕微紙紋＋筆觸方向雜訊，只作用在不透明區。"""
    a = np.asarray(im).astype(np.float32)
    rng = np.random.default_rng(seed)
    h, w = a.shape[:2]
    n = rng.normal(0, 1, (h // 3 + 1, w // 3 + 1)).astype(np.float32)
    n = np.asarray(Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
                   .filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255 - 0.5
    a[..., :3] *= (1 + n[..., None] * strength * 2)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def glyph(name):
    for d in ('lorc', 'delapouite', 'skoll'):
        p = os.path.join(GI, d, name + '.svg')
        if os.path.exists(p):
            s = open(p).read()
            paths = re.findall(r'<path[^>]*d="([^"]+)"', s)
            return [d for d in paths if not d.startswith('M0 0h512v512H0z')]
    raise FileNotFoundError(name)


def save(im, rel):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    print('wrote', rel, im.size)


# ---------- 節點圖示 128×128 ----------
NODES = {
    'battle':    ('crossed-swords', CORAL, CORAL_D, CORAL_L),
    'encounter': ('uncertainty', MINT, MINT_D, '#9FE3CB'),
    'reward':    ('chest', GOLD, GOLD_D, GOLD_L),
    'supply':    ('life-buoy', SEA, SEA_D, SEA_L),
    'boss':      ('crowned-skull', PLUM, PLUM_D, '#B58AC6'),
}


def node_icon(key):
    g, base, dark, light = NODES[key]
    paths = ''.join(f'<path d="{d}"/>' for d in glyph(g))
    boss = key == 'boss'
    r = 54 if not boss else 47
    # 首領：圓外再加四個尖角，剪影一眼跟其他節點不同
    spikes = ''
    if boss:
        for ang in (45, 135, 225, 315):
            spikes += f'<path transform="rotate({ang} 64 64)" d="M64 2 L84 32 L44 32 Z" fill="{GOLD}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><clipPath id="c"><circle cx="64" cy="64" r="{r}"/></clipPath></defs>
  {spikes}
  <circle cx="64" cy="{64+4}" r="{r}" fill="{INK}"/>
  <circle cx="64" cy="64" r="{r}" fill="{base}"/>
  <g clip-path="url(#c)">
    <ellipse cx="64" cy="{64+r+10}" rx="{r+8}" ry="{r*0.55}" fill="{dark}"/>
    <ellipse cx="46" cy="34" rx="22" ry="11" fill="{light}" opacity=".75" transform="rotate(-28 46 34)"/>
  </g>
  <circle cx="64" cy="64" r="{r}" fill="none" stroke="{INK}" stroke-width="{SW}"/>
  <g transform="translate(64 66) scale(0.125) translate(-256 -256)">
    <g fill="{INK}" stroke="{INK}" stroke-width="64" stroke-linejoin="round" transform="translate(0 18)">{paths}</g>
    <g fill="{INK}" stroke="{INK}" stroke-width="56" stroke-linejoin="round">{paths}</g>
    <g fill="{CREAM}">{paths}</g>
  </g>
</svg>'''
    return paper(render(svg, 128, 128), seed=hash(key) % 99)


# ---------- 按鈕 480×160（九宮格：左右 72px、上下 64px 不可拉伸）----------
def button(base, dark, light):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160">
  <rect x="10" y="22" width="460" height="128" rx="56" fill="{INK}"/>
  <rect x="10" y="10" width="460" height="128" rx="56" fill="{dark}"/>
  <rect x="10" y="10" width="460" height="112" rx="56" fill="{base}"/>
  <rect x="44" y="24" width="392" height="30" rx="15" fill="{light}" opacity=".55"/>
  <rect x="10" y="10" width="460" height="128" rx="56" fill="none" stroke="{INK}" stroke-width="10"/>
</svg>'''
    return paper(render(svg, 480, 160), 0.05)


def capsule():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 128">
  <rect x="8" y="18" width="344" height="100" rx="50" fill="{INK}"/>
  <rect x="8" y="10" width="344" height="100" rx="50" fill="{CREAM}"/>
  <rect x="8" y="80" width="344" height="30" rx="15" fill="{CREAM_D}"/>
  <circle cx="60" cy="60" r="34" fill="{SEA}" stroke="{INK}" stroke-width="7"/>
  <ellipse cx="50" cy="46" rx="12" ry="6" fill="{SEA_L}" opacity=".8" transform="rotate(-28 50 46)"/>
  <rect x="8" y="10" width="344" height="100" rx="50" fill="none" stroke="{INK}" stroke-width="8"/>
</svg>'''
    return paper(render(svg, 360, 128), 0.05)


# ---------- 卡框 512×640（中央透明，九宮格：四邊 96px）----------
def card_frame(base, dark, pips, prism=False):
    border = base
    defs = ''
    if prism:
        defs = '''<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF8FA3"/><stop offset=".25" stop-color="#FFD36E"/>
      <stop offset=".5" stop-color="#7FE0B8"/><stop offset=".75" stop-color="#7CB8FF"/>
      <stop offset="1" stop-color="#C792FF"/></linearGradient></defs>'''
        border = 'url(#p)'
    gems = ''
    if pips:
        tw = pips * 52 + 40
        gems += f'<rect x="{256-tw/2}" y="6" width="{tw}" height="60" rx="32" fill="{CREAM}" stroke="{INK}" stroke-width="8"/>'
        x0 = 256 - (pips - 1) * 26
        for i in range(pips):
            gems += f'<path d="M{x0+i*52} 16 L{x0+i*52+16} 36 L{x0+i*52} 56 L{x0+i*52-16} 36 Z" fill="{base}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
            gems += f'<path d="M{x0+i*52} 24 L{x0+i*52-8} 35 L{x0+i*52} 35 Z" fill="#fff" opacity=".6"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640">{defs}
  <path fill-rule="evenodd" fill="{INK}" d="M62 26 H450 A48 48 0 0 1 498 74 V582 A48 48 0 0 1 450 630 H62 A48 48 0 0 1 14 582 V74 A48 48 0 0 1 62 26 Z M84 86 H428 A26 26 0 0 1 454 112 V560 A26 26 0 0 1 428 586 H84 A26 26 0 0 1 58 560 V112 A26 26 0 0 1 84 86 Z"/>
  <path fill-rule="evenodd" fill="{border}" d="M62 14 H450 A48 48 0 0 1 498 62 V570 A48 48 0 0 1 450 618 H62 A48 48 0 0 1 14 570 V62 A48 48 0 0 1 62 14 Z M84 74 H428 A26 26 0 0 1 454 100 V548 A26 26 0 0 1 428 574 H84 A26 26 0 0 1 58 548 V100 A26 26 0 0 1 84 74 Z"/>
  <rect x="14" y="584" width="484" height="34" rx="17" fill="{dark}" opacity=".5"/>
  <rect x="50" y="26" width="240" height="14" rx="7" fill="#fff" opacity=".35"/>
  <rect x="14" y="14" width="484" height="604" rx="48" fill="none" stroke="{INK}" stroke-width="10"/>
  <rect x="58" y="74" width="396" height="500" rx="26" fill="none" stroke="{INK}" stroke-width="8"/>
  {gems}
</svg>'''
    return paper(render(svg, 512, 640), 0.05, seed=pips + 7)


def panel():
    tiles = ''
    for i in range(14):
        x = 46 + i * 42
        tiles += f'<rect x="{x}" y="42" width="16" height="16" transform="rotate(45 {x+8} 50)" fill="{SEA}" stroke="{INK}" stroke-width="3"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect x="14" y="26" width="612" height="600" rx="44" fill="{INK}"/>
  <rect x="14" y="14" width="612" height="600" rx="44" fill="{CREAM}"/>
  <rect x="14" y="14" width="612" height="72" rx="36" fill="{CORAL}"/>
  <rect x="14" y="58" width="612" height="28" fill="{CORAL}"/>
  <rect x="14" y="86" width="612" height="6" fill="{INK}"/>
  {tiles.replace(SEA, CREAM)}
  <rect x="14" y="14" width="612" height="600" rx="44" fill="none" stroke="{INK}" stroke-width="10"/>
</svg>'''
    return paper(render(svg, 640, 640), 0.05)


# ---------- Logo 1024×512 ----------
def logo():
    chars = '彈射自走棋'
    xs = [150, 330, 512, 694, 874]
    ys = [300, 270, 292, 262, 290]
    rot = [-7, 4, -3, 5, -6]
    size = [178, 168, 160, 168, 178]
    def layer(fill, stroke, sw, dy=0, extra=''):
        out = ''
        for c, x, y, r, s in zip(chars, xs, ys, rot, size):
            out += (f'<text x="{x}" y="{y+dy}" font-family="jf-openhuninn-2.1" font-size="{s}" text-anchor="middle" '
                    f'transform="rotate({r} {x} {y})" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
                    f'stroke-linejoin="round" paint-order="stroke" {extra}>{c}</text>')
        return out
    traj = ''
    # 彈射軌跡：虛線弧從左下彈到右上，碰到字再彈開
    traj = f'<path d="M60 150 Q 300 -20 560 60 Q 760 120 900 70" fill="none" stroke="{CREAM}" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 26"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF8E6"/><stop offset=".62" stop-color="#FFE3B8"/><stop offset="1" stop-color="#FFB98F"/></linearGradient></defs>
  {traj}
  {layer(INK, INK, 34, dy=16)}
  {layer(CORAL_D, CORAL_D, 26, dy=12)}
  {layer(CORAL, CORAL, 26, dy=6)}
  {layer(INK, INK, 30)}
  {layer('#FFE9C7', '#FFE9C7', 12)}
  {layer('url(#f)', 'none', 0)}
  <rect x="236" y="372" width="552" height="64" rx="32" fill="{SEA}" stroke="{INK}" stroke-width="8"/>
  <text x="512" y="415" font-family="jf-openhuninn-2.1" font-size="34" text-anchor="middle" fill="{CREAM}" letter-spacing="6">FLICK · AUTO CHESS</text>
</svg>'''
    im = render(svg, 1024, 512)
    if UNITS and os.path.exists(os.path.join(UNITS, 'ironball.png')):
        ball = Image.open(os.path.join(UNITS, 'ironball.png')).convert('RGBA').resize((150, 150), Image.LANCZOS)
        im.alpha_composite(ball, (880, 0))
    return paper(im, 0.04)


if __name__ == '__main__':
    for k in NODES:
        save(node_icon(k), f'ui/node-{k}.png')
    save(button(CORAL, CORAL_D, CORAL_L), 'ui/button-primary-coral.png')
    save(button(SEA, SEA_D, SEA_L), 'ui/button-secondary-sea.png')
    save(capsule(), 'ui/synergy-capsule.png')
    tiers = [(STONE, STONE_D), (EMER, EMER_D), (SAPH, SAPH_D), (AMET, AMET_D), (GOLD, GOLD_D)]
    for i, (b, d) in enumerate(tiers, 1):
        save(card_frame(b, d, i), f'ui/shop-frame-{i}.png')
    save(card_frame(SILV, SILV_D, 0), 'ui/strategy-frame-silver.png')
    save(card_frame(GOLD, GOLD_D, 0), 'ui/strategy-frame-gold.png')
    save(card_frame(SILV, SILV_D, 0, prism=True), 'ui/strategy-frame-prismatic.png')
    save(panel(), 'ui/panel-bg.png')
    save(logo(), 'ui/title-logo.png')
