#!/usr/bin/env python3
"""
Compose AscendOS presentation boards: iPhone 16 Pro frames + Apple-keynote styles.
Input:  presentation/raw/*.png
Output: presentation/boards/*.png (+ 300 DPI metadata)
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "presentation" / "raw"
OUT = ROOT / "presentation" / "boards"
DOCS = ROOT / "docs" / "presentation"

# Physical phone chrome (px at 3x for print-friendly boards)
PHONE_W, PHONE_H = 402 * 3, 874 * 3  # 1206 × 2622
BEZEL = 18 * 3
RADIUS = 78 * 3
SCREEN_RADIUS = 68 * 3
ISLAND_W, ISLAND_H = 126 * 3, 37 * 3

DPI = 300

# Brand tokens
INK = (17, 18, 20)
GRAPHITE = (26, 27, 30)
CHAMPAGNE = (184, 147, 90)
CHAMPAGNE_DEEP = (138, 108, 60)
CREAM = (247, 246, 243)
WHITE = (255, 255, 255)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def gradient(size: tuple[int, int], c1: tuple[int, int, int], c2: tuple[int, int, int], vertical=True) -> Image.Image:
    w, h = size
    base = Image.new("RGB", size, c1)
    top = Image.new("RGB", size, c2)
    if vertical:
        alpha = Image.linear_gradient("L").resize(size)
    else:
        alpha = Image.linear_gradient("L").rotate(90, expand=True).resize(size)
    return Image.composite(top, base, alpha)


def soft_vignette(size: tuple[int, int], strength=0.35) -> Image.Image:
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((-w * 0.1, -h * 0.15, w * 1.1, h * 1.05), fill=int(255 * strength))
    mask = mask.filter(ImageFilter.GaussianBlur(max(w, h) // 8))
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    dark = Image.new("RGBA", size, (0, 0, 0, 180))
    overlay = Image.composite(dark, overlay, mask)
    return overlay


def glass_panel(size: tuple[int, int], tint=(255, 255, 255, 48)) -> Image.Image:
    panel = Image.new("RGBA", size, tint)
    draw = ImageDraw.Draw(panel)
    draw.rounded_rectangle((1, 1, size[0] - 2, size[1] - 2), radius=48, outline=(255, 255, 255, 70), width=2)
    return panel


def load_screen(name: str) -> Image.Image:
    path = RAW / f"{name}.png"
    if not path.exists():
        raise FileNotFoundError(path)
    img = Image.open(path).convert("RGBA")
    # Fit into phone screen area
    screen_w = PHONE_W - BEZEL * 2
    screen_h = PHONE_H - BEZEL * 2
    fitted = ImageOps.fit(img, (screen_w, screen_h), method=Image.Resampling.LANCZOS)
    return fitted


def make_iphone(screen: Image.Image) -> Image.Image:
    """Realistic iPhone 16 Pro titanium frame with Dynamic Island."""
    phone = Image.new("RGBA", (PHONE_W, PHONE_H), (0, 0, 0, 0))

    # Outer titanium body
    body = Image.new("RGBA", (PHONE_W, PHONE_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(body)
    # subtle metal gradient via layered fills
    metal = gradient((PHONE_W, PHONE_H), (55, 56, 58), (28, 29, 31))
    metal = metal.convert("RGBA")
    mask = rounded_mask((PHONE_W, PHONE_H), RADIUS)
    body = Image.composite(metal, body, mask)

    # Inner black bezel
    inset = BEZEL - 6
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle(
        (inset, inset, PHONE_W - inset - 1, PHONE_H - inset - 1),
        radius=RADIUS - 10,
        fill=(8, 8, 9, 255),
    )

    # Screen
    screen_mask = rounded_mask(screen.size, SCREEN_RADIUS)
    screen_layer = Image.new("RGBA", (PHONE_W, PHONE_H), (0, 0, 0, 0))
    screen_layer.paste(screen, (BEZEL, BEZEL), screen_mask)

    # Dynamic Island
    island = Image.new("RGBA", (PHONE_W, PHONE_H), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(island)
    ix = (PHONE_W - ISLAND_W) // 2
    iy = BEZEL + 18
    idraw.rounded_rectangle((ix, iy, ix + ISLAND_W, iy + ISLAND_H), radius=ISLAND_H // 2, fill=(0, 0, 0, 255))
    # camera glints
    idraw.ellipse((ix + ISLAND_W - 46, iy + 10, ix + ISLAND_W - 18, iy + ISLAND_H - 10), fill=(22, 24, 28, 255))
    idraw.ellipse((ix + ISLAND_W - 38, iy + 16, ix + ISLAND_W - 28, iy + 26), fill=(70, 90, 120, 90))

    # Side buttons (power / volume) as subtle ticks
    btn = Image.new("RGBA", (PHONE_W + 24, PHONE_H), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(btn)
    bdraw.rounded_rectangle((PHONE_W - 2, 320, PHONE_W + 10, 520), radius=4, fill=(40, 41, 43, 255))
    bdraw.rounded_rectangle((0, 280, 10, 380), radius=4, fill=(40, 41, 43, 255))
    bdraw.rounded_rectangle((0, 420, 10, 560), radius=4, fill=(40, 41, 43, 255))

    composed = Image.new("RGBA", (PHONE_W + 24, PHONE_H + 40), (0, 0, 0, 0))
    composed.paste(btn, (0, 20), btn)
    layer = Image.new("RGBA", (PHONE_W + 24, PHONE_H + 40), (0, 0, 0, 0))
    layer.paste(body, (12, 20), body)
    layer.alpha_composite(screen_layer, (12, 20))
    layer.alpha_composite(island, (12, 20))
    composed.alpha_composite(layer)
    return composed


def drop_shadow(img: Image.Image, blur=48, offset=(0, 36), opacity=160) -> Image.Image:
    w, h = img.size
    canvas = Image.new("RGBA", (w + blur * 2, h + blur * 2 + abs(offset[1])), (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, opacity))
    shadow.putalpha(img.split()[-1].point(lambda a: min(a, opacity)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(shadow, (blur + offset[0], blur + offset[1]), shadow)
    canvas.alpha_composite(img, (blur, blur))
    return canvas


def soft_reflection(phone: Image.Image, height_ratio=0.28) -> Image.Image:
    w, h = phone.size
    rh = int(h * height_ratio)
    flipped = ImageOps.flip(phone).crop((0, 0, w, rh))
    alpha = flipped.split()[-1]
    fade = Image.linear_gradient("L").resize((w, rh))
    fade = ImageOps.invert(fade).point(lambda p: int(p * 0.35))
    alpha = Image.composite(fade, Image.new("L", (w, rh), 0), alpha)
    flipped.putalpha(alpha)
    flipped = flipped.filter(ImageFilter.GaussianBlur(1.2))
    return flipped


def save_png(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = PngImagePlugin.PngInfo()
    meta.add_text("Software", "AscendOS Presentation Composer")
    meta.add_text("DPI", str(DPI))
    rgb = img.convert("RGB") if img.mode != "RGB" else img
    # Preserve alpha boards as RGBA
    out = img if img.mode == "RGBA" else rgb
    out.save(path, "PNG", dpi=(DPI, DPI), pnginfo=meta)
    print("wrote", path)


def draw_wordmark(draw: ImageDraw.ImageDraw, xy: tuple[int, int], color=WHITE, size=54):
    draw.text(xy, "AscendOS", font=font(size, bold=True), fill=color)
    draw.text((xy[0], xy[1] + size + 8), "Build a better tomorrow.", font=font(int(size * 0.42)), fill=(*color[:3],) if False else color)


def board_hero(phone_name: str, out_name: str, dark=False):
    phone = drop_shadow(make_iphone(load_screen(phone_name)), blur=60, offset=(0, 50), opacity=170)
    reflection = soft_reflection(phone)
    W, H = 2400, 3000
    if dark:
        bg = gradient((W, H), (8, 9, 11), (26, 27, 30))
    else:
        bg = gradient((W, H), (20, 22, 28), (48, 42, 34))
        # champagne glow
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        g.ellipse((W * 0.15, H * 0.05, W * 0.85, H * 0.55), fill=(*CHAMPAGNE, 40))
        glow = glow.filter(ImageFilter.GaussianBlur(120))
        bg = bg.convert("RGBA")
        bg.alpha_composite(glow)
        bg = bg.convert("RGB")

    canvas = bg.convert("RGBA")
    canvas.alpha_composite(soft_vignette((W, H), 0.45 if dark else 0.25))

    # glass orb
    orb = glass_panel((900, 900), (255, 255, 255, 28 if not dark else 18))
    orb = orb.filter(ImageFilter.GaussianBlur(0.5))
    canvas.alpha_composite(orb, (W // 2 - 450, 380))

    px = (W - phone.size[0]) // 2
    py = 280
    canvas.alpha_composite(phone, (px, py))
    canvas.alpha_composite(reflection, (px, py + phone.size[1] - 40))

    draw = ImageDraw.Draw(canvas)
    title_color = WHITE if dark else WHITE
    draw.text((120, 120), "AscendOS", font=font(64, True), fill=title_color)
    draw.text((120, 200), "The operating system for your workday.", font=font(32), fill=(220, 220, 220))
    save_png(canvas, OUT / out_name)


def board_dual(left: str, right: str, out_name: str, title: str, subtitle: str):
    W, H = 3200, 2200
    bg = gradient((W, H), (245, 244, 240), (230, 226, 218))
    canvas = bg.convert("RGBA")
    # glass band
    band = glass_panel((W - 200, 1600), (255, 255, 255, 55))
    canvas.alpha_composite(band, (100, 320))

    p1 = drop_shadow(make_iphone(load_screen(left)), blur=40, offset=(0, 30), opacity=140)
    p2 = drop_shadow(make_iphone(load_screen(right)), blur=40, offset=(0, 30), opacity=140)
    # scale phones slightly
    scale = 0.78
    p1 = p1.resize((int(p1.width * scale), int(p1.height * scale)), Image.Resampling.LANCZOS)
    p2 = p2.resize((int(p2.width * scale), int(p2.height * scale)), Image.Resampling.LANCZOS)
    # slight rotation for depth
    p1r = p1.rotate(6, resample=Image.Resampling.BICUBIC, expand=True)
    p2r = p2.rotate(-6, resample=Image.Resampling.BICUBIC, expand=True)
    canvas.alpha_composite(p1r, (220, 380))
    canvas.alpha_composite(p2r, (W - p2r.width - 220, 380))

    draw = ImageDraw.Draw(canvas)
    draw.text((140, 100), "AscendOS", font=font(52, True), fill=INK)
    draw.text((140, 170), title, font=font(44, True), fill=GRAPHITE)
    draw.text((140, 230), subtitle, font=font(28), fill=(90, 92, 96))
    save_png(canvas, OUT / out_name)


def board_triple(names: list[str], out_name: str, title: str, subtitle: str):
    W, H = 3600, 2200
    bg = gradient((W, H), (18, 19, 22), (42, 36, 30))
    canvas = bg.convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((400, 200, W - 400, 1400), fill=(*CHAMPAGNE, 28))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(100)))

    phones = []
    for n in names:
        p = drop_shadow(make_iphone(load_screen(n)), blur=36, offset=(0, 28), opacity=150)
        p = p.resize((int(p.width * 0.62), int(p.height * 0.62)), Image.Resampling.LANCZOS)
        phones.append(p)

    # back, mid, front depth
    positions = [
        (280, 520),
        (W // 2 - phones[1].width // 2, 420),
        (W - phones[2].width - 280, 520),
    ]
    order = [0, 2, 1]  # center on top
    for i in order:
        canvas.alpha_composite(phones[i], positions[i])

    draw = ImageDraw.Draw(canvas)
    draw.text((140, 100), "AscendOS", font=font(52, True), fill=WHITE)
    draw.text((140, 170), title, font=font(44, True), fill=WHITE)
    draw.text((140, 230), subtitle, font=font(28), fill=(210, 208, 200))
    save_png(canvas, OUT / out_name)


def board_feature(screen: str, out_name: str, headline: str, body: str, dark=False):
    W, H = 3000, 2000
    if dark:
        bg = gradient((W, H), (6, 7, 9), (20, 21, 24))
        ink = WHITE
        muted = (180, 180, 180)
    else:
        bg = gradient((W, H), (250, 249, 246), (236, 232, 224))
        ink = INK
        muted = (100, 102, 106)
    canvas = bg.convert("RGBA")
    phone = drop_shadow(make_iphone(load_screen(screen)), blur=50, offset=(0, 40), opacity=160)
    phone = phone.resize((int(phone.width * 0.85), int(phone.height * 0.85)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(phone, (120, (H - phone.height) // 2))

    panel_x = 1400
    draw = ImageDraw.Draw(canvas)
    draw.text((panel_x, 420), "AscendOS", font=font(40, True), fill=CHAMPAGNE_DEEP if not dark else CHAMPAGNE)
    draw.text((panel_x, 500), headline, font=font(64, True), fill=ink)
    # wrap body
    y = 620
    words = body.split()
    line = ""
    f = font(30)
    for w in words:
        test = (line + " " + w).strip()
        if draw.textlength(test, font=f) > 1300:
            draw.text((panel_x, y), line, font=f, fill=muted)
            y += 44
            line = w
        else:
            line = test
    if line:
        draw.text((panel_x, y), line, font=f, fill=muted)
    save_png(canvas, OUT / out_name)


def board_appstore(screen: str, out_name: str):
    W, H = 2400, 3000
    canvas = Image.new("RGBA", (W, H), (*WHITE, 255))
    # soft grey floor gradient
    floor = gradient((W, 900), WHITE, (240, 240, 242))
    canvas.paste(floor, (0, H - 900))
    phone = drop_shadow(make_iphone(load_screen(screen)), blur=50, offset=(0, 40), opacity=120)
    px = (W - phone.width) // 2
    py = 280
    canvas.alpha_composite(phone, (px, py))
    canvas.alpha_composite(soft_reflection(phone), (px, py + phone.height - 30))
    draw = ImageDraw.Draw(canvas)
    draw.text((120, 100), "AscendOS", font=font(48, True), fill=INK)
    draw.text((120, 170), "App Store Preview", font=font(28), fill=(120, 120, 124))
    save_png(canvas, OUT / out_name)


def board_dark(screen: str, out_name: str):
    board_hero(screen, out_name, dark=True)


def board_grid(names: list[str], out_name: str):
    """Investor overview: 3×3 phone grid on premium dark glass."""
    W, H = 3600, 3600
    bg = gradient((W, H), (10, 11, 13), (28, 24, 20))
    canvas = bg.convert("RGBA")
    phones = []
    for n in names:
        p = make_iphone(load_screen(n))
        p = drop_shadow(p, blur=28, offset=(0, 18), opacity=130)
        p = p.resize((int(p.width * 0.42), int(p.height * 0.42)), Image.Resampling.LANCZOS)
        phones.append(p)
    cols, rows = 3, 3
    gap_x, gap_y = 80, 60
    total_w = cols * phones[0].width + (cols - 1) * gap_x
    total_h = rows * phones[0].height + (rows - 1) * gap_y
    ox = (W - total_w) // 2
    oy = 420
    for i, p in enumerate(phones[:9]):
        r, c = divmod(i, cols)
        # wait - for 3 cols, index i: row = i//3, col = i%3
        row, col = i // cols, i % cols
        canvas.alpha_composite(p, (ox + col * (p.width + gap_x), oy + row * (p.height + gap_y)))
    draw = ImageDraw.Draw(canvas)
    draw.text((160, 140), "AscendOS", font=font(64, True), fill=WHITE)
    draw.text((160, 230), "Product surface — investor overview", font=font(34), fill=(200, 198, 190))
    save_png(canvas, OUT / out_name)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    if not (RAW / "today.png").exists():
        raise SystemExit(f"Missing raw captures in {RAW}. Run capture-presentation.mjs first.")

    # 1 Hero
    board_hero("today", "01-hero-iphone-today.png", dark=False)
    # 2 Dual
    board_dual("today", "coach", "02-dual-today-coach.png", "Today × Coach", "Plan the day. Lead the conversation.")
    board_dual("team", "contacts", "02b-dual-team-contacts.png", "Structure × Relationships", "See the tree. Move the pipeline.")
    # 3 Triple workflow
    board_triple(["contacts", "today", "coach"], "03-triple-workflow.png", "Lead → Plan → Coach", "One operating loop for recruiting days.")
    # 4 Feature spotlights
    board_feature("team", "04-feature-structure-tree.png", "Structure Tree", "A living genealogy with ranks, streaks, and leadership signals — built for coaching, not screenshots of org charts.")
    board_feature("coach", "04b-feature-coach.png", "Ascent Coach", "Context-first mentoring that ends in one clear next action — never a wall of tips.", dark=True)
    board_feature("analytics", "04c-feature-qualifications.png", "Qualifications", "AP, ranks, and Team Leader progress in one calm leadership surface.")
    # 5 App Store
    board_appstore("today", "05-appstore-today.png")
    board_appstore("profile", "05b-appstore-profile.png")
    # 6 Dark premium
    board_dark("coach", "06-dark-premium-coach.png")
    board_hero("team", "06b-dark-premium-team.png", dark=True)
    # Bonus investor grid
    board_grid(
        ["today", "coach", "team", "contacts", "profile", "settings", "analytics", "more", "dashboard"],
        "07-investor-grid.png",
    )

    # Copy key boards into docs for PR visibility
    for name in [
        "01-hero-iphone-today.png",
        "02-dual-today-coach.png",
        "03-triple-workflow.png",
        "04-feature-structure-tree.png",
        "05-appstore-today.png",
        "06-dark-premium-coach.png",
        "07-investor-grid.png",
    ]:
        src = OUT / name
        if src.exists():
            Image.open(src).save(DOCS / name, "PNG", dpi=(DPI, DPI))

    index = {
        "styles": {
            "hero": ["01-hero-iphone-today.png"],
            "dual": ["02-dual-today-coach.png", "02b-dual-team-contacts.png"],
            "triple": ["03-triple-workflow.png"],
            "feature": [
                "04-feature-structure-tree.png",
                "04b-feature-coach.png",
                "04c-feature-qualifications.png",
            ],
            "app_store": ["05-appstore-today.png", "05b-appstore-profile.png"],
            "dark_premium": ["06-dark-premium-coach.png", "06b-dark-premium-team.png"],
            "investor": ["07-investor-grid.png"],
        },
        "dpi": DPI,
        "device": "iPhone 16 Pro (402×874 @3x, Dynamic Island)",
        "source": "Real AscendOS React application via VITE_PRESENTATION_CAPTURE",
    }
    (OUT / "index.json").write_text(json.dumps(index, indent=2))
    (DOCS / "README.md").write_text(
        """# AscendOS Presentation Renders

Apple-keynote quality iPhone 16 Pro boards generated from the real AscendOS web application.

## Styles
1. **Hero iPhone** — floating device on premium gradient
2. **Dual Showcase** — two related surfaces
3. **Triple Showcase** — workflow sequence
4. **Feature Spotlight** — large device + copy
5. **App Store Style** — minimal white
6. **Dark Premium** — cinematic black

## Regenerate
```bash
npm run presentation:capture
npm run presentation:compose
```

Assets live in `/presentation/boards` (print-ready PNG, 300 DPI metadata).
"""
    )
    print("Done →", OUT)


if __name__ == "__main__":
    main()
