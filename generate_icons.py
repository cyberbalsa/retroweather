#!/usr/bin/env python3
"""Generate retro WeatherStar 4000+ themed launcher icons for WeatherStar Kiosk Android app."""

from PIL import Image, ImageDraw
import os
import math

# Color palette
COLOR_BG_DARK = (13, 27, 42)       # #0d1b2a - deep navy
COLOR_BG_MID = (26, 58, 92)        # #1a3a5c - mid navy
COLOR_ACCENT_CYAN = (124, 185, 232) # #7cb9e8 - ice blue
COLOR_ORANGE = (200, 96, 42)        # #c8602a - warm orange/amber
COLOR_YELLOW = (235, 230, 0)        # #ebe600 - yellow highlight
COLOR_WHITE = (255, 255, 255)
COLOR_CLOUD_LIGHT = (220, 235, 245) # light blue-white for cloud
COLOR_CLOUD_MID = (160, 195, 220)   # mid cloud shade
COLOR_SCANLINE = (0, 0, 0, 30)      # semi-transparent scanlines


def draw_navy_gradient(draw, width, height):
    """Draw a deep navy gradient background."""
    for y in range(height):
        t = y / height
        r = int(COLOR_BG_DARK[0] + (COLOR_BG_MID[0] - COLOR_BG_DARK[0]) * t)
        g = int(COLOR_BG_DARK[1] + (COLOR_BG_MID[1] - COLOR_BG_DARK[1]) * t)
        b = int(COLOR_BG_DARK[2] + (COLOR_BG_MID[2] - COLOR_BG_DARK[2]) * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))


def draw_scanlines(img, width, height, spacing=4, alpha=18):
    """Overlay CRT scanlines on the image."""
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(0, height, spacing):
        draw.line([(0, y), (width, y)], fill=(0, 0, 0, alpha))
    img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay)
    return img


def draw_pixel_grid(draw, width, height, cell=4, alpha=12):
    """Draw a subtle pixel grid for retro CRT feel."""
    for x in range(0, width, cell):
        draw.line([(x, 0), (x, height)], fill=(0, 0, 20, alpha))
    for y in range(0, height, cell):
        draw.line([(0, y), (width, y)], fill=(0, 0, 20, alpha))


def draw_rounded_rect_mask(draw, width, height, radius):
    """Draw a rounded rectangle mask."""
    draw.rounded_rectangle([(0, 0), (width - 1, height - 1)], radius=radius, fill=(255, 255, 255, 255))


def draw_cloud_pixel(draw, cx, cy, scale):
    """
    Draw a chunky pixel-art style storm cloud.
    cx, cy = center of the cloud assembly
    scale = multiplier for sizing
    """
    s = scale

    def px(x, y, w, h, color):
        draw.rectangle([
            (int(cx + x * s), int(cy + y * s)),
            (int(cx + (x + w) * s - 1), int(cy + (y + h) * s - 1))
        ], fill=color)

    # Chunky pixel-art cloud built from rectangles
    # Cloud body - main blocks (centered around cx, cy)
    # Using a grid approach: each unit = s pixels

    # Bottom row of cloud (widest)
    px(-8, 2, 16, 4, COLOR_CLOUD_LIGHT)

    # Middle tier
    px(-7, -1, 14, 4, COLOR_CLOUD_LIGHT)

    # Upper left bump
    px(-6, -4, 6, 4, COLOR_CLOUD_LIGHT)

    # Upper right bump
    px(1, -3, 5, 3, COLOR_CLOUD_LIGHT)

    # Top center peak
    px(-3, -6, 6, 3, COLOR_CLOUD_LIGHT)

    # Shading - darker edges (bottom/right of cloud chunks)
    px(-8, 5, 16, 1, COLOR_CLOUD_MID)   # bottom shadow
    px(7, 2, 1, 4, COLOR_CLOUD_MID)     # right shadow mid
    px(5, -1, 2, 3, COLOR_CLOUD_MID)    # right shadow upper

    # Cloud highlight (top-left bright areas)
    px(-5, -5, 3, 2, COLOR_WHITE)
    px(-6, -2, 2, 2, COLOR_WHITE)
    px(-7, 2, 2, 2, COLOR_WHITE)

    # Dark underside for stormy look
    px(-7, 4, 14, 2, (130, 150, 170))


def draw_lightning_bolt(draw, cx, cy, scale):
    """
    Draw a pixel-art zigzag lightning bolt below the cloud.
    cx, cy = tip of bolt (top of bolt)
    """
    s = scale

    def scaled(pts):
        return [(int(cx + x * s), int(cy + y * s)) for x, y in pts]

    # Main bolt shape - chunky zigzag polygon
    bolt_points = [
        (1, 0),    # top right
        (-1, 0),   # top left
        (-1, 4),   # mid-left going down
        (2, 4),    # jog right at middle
        (-2, 10),  # bottom left
        (0, 10),   # bottom right
        (3, 4),    # jog up
        (1, 4),    # back to center
    ]
    draw.polygon(scaled(bolt_points), fill=COLOR_YELLOW)

    # Orange outline/core for depth
    inner_bolt = [
        (0.5, 0.5),
        (-0.5, 0.5),
        (-0.5, 3.5),
        (1.5, 3.5),
        (-1.5, 9.5),
        (-0.2, 9.5),
        (2.5, 3.5),
        (0.5, 3.5),
    ]
    draw.polygon(scaled(inner_bolt), fill=COLOR_ORANGE)


def create_icon(size, output_path):
    """Create a square launcher icon at the given size."""
    w = h = size

    # Create RGBA image
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    # Draw rounded rect mask
    mask = Image.new('L', (w, h), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = int(w * 0.22)  # Android adaptive icon style rounding
    mask_draw.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=radius, fill=255)

    # Background gradient layer
    bg = Image.new('RGB', (w, h))
    bg_draw = ImageDraw.Draw(bg)
    draw_navy_gradient(bg_draw, w, h)

    # Convert to RGBA and apply mask
    bg = bg.convert('RGBA')
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)

    # Draw on a fresh RGBA layer for the icon elements
    elements = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    elem_draw = ImageDraw.Draw(elements)

    # Scale factor: base design at 48px
    scale = w / 48.0

    # Subtle pixel grid overlay
    grid_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid_layer)
    cell = max(2, int(4 * scale))
    for x in range(0, w, cell):
        grid_draw.line([(x, 0), (x, h)], fill=(0, 0, 30, 15))
    for y in range(0, h, cell):
        grid_draw.line([(0, y), (w, y)], fill=(0, 0, 30, 15))

    # Cloud center position
    cloud_cx = w * 0.5
    cloud_cy = h * 0.40

    # Lightning starts below cloud center
    bolt_cx = w * 0.52
    bolt_cy = h * 0.52

    # Draw cloud
    draw_cloud_pixel(elem_draw, cloud_cx, cloud_cy, scale)

    # Draw lightning bolt
    draw_lightning_bolt(elem_draw, bolt_cx, bolt_cy, scale)

    # Cyan glow accent around cloud (subtle border)
    # Small pixel-art stars/dots in the background
    dot_positions = [
        (0.12, 0.10), (0.85, 0.08), (0.90, 0.35),
        (0.08, 0.65), (0.88, 0.72), (0.15, 0.85),
        (0.75, 0.88), (0.05, 0.45),
    ]
    dot_size = max(1, int(2 * scale))
    for dx, dy in dot_positions:
        px, py = int(dx * w), int(dy * h)
        elem_draw.rectangle([(px, py), (px + dot_size - 1, py + dot_size - 1)],
                             fill=(124, 185, 232, 120))

    # Compose: img + grid + elements
    img = Image.alpha_composite(img, grid_layer)
    img = Image.alpha_composite(img, elements)

    # Scanlines overlay
    scan = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    scan_draw = ImageDraw.Draw(scan)
    scan_spacing = max(2, int(3 * scale))
    for y in range(0, h, scan_spacing * 2):
        scan_draw.line([(0, y), (w, y)], fill=(0, 0, 0, 22))
    img = Image.alpha_composite(img, scan)

    # Apply rounded mask to final image
    final = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    final.paste(img, mask=mask)

    # Save as RGB PNG (Android expects no alpha on mipmap icons typically, but RGBA is fine)
    final.save(output_path, 'PNG')
    print(f"  Saved {w}x{h}: {output_path}")


def create_tv_banner(output_path):
    """Create the Android TV home screen banner (320x180)."""
    w, h = 320, 180

    img = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(h):
        t = y / h
        r = int(COLOR_BG_DARK[0] + (COLOR_BG_MID[0] - COLOR_BG_DARK[0]) * t)
        g = int(COLOR_BG_DARK[1] + (COLOR_BG_MID[1] - COLOR_BG_DARK[1]) * t)
        b = int(COLOR_BG_DARK[2] + (COLOR_BG_MID[2] - COLOR_BG_DARK[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # Pixel grid
    for x in range(0, w, 4):
        draw.line([(x, 0), (x, h)], fill=(0, 0, 30, 12))
    for y in range(0, h, 4):
        draw.line([(0, y), (w, y)], fill=(0, 0, 30, 12))

    # Bottom orange accent bar (like ws4kp's bottom bar)
    bar_h = 10
    for y in range(h - bar_h, h):
        t = (y - (h - bar_h)) / bar_h
        r = int(COLOR_ORANGE[0] * (1 - t * 0.3))
        g = int(COLOR_ORANGE[1] * (1 - t * 0.3))
        b = int(COLOR_ORANGE[2] * (1 - t * 0.3))
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # Top accent line (thin cyan)
    draw.line([(0, 0), (w, 0)], fill=COLOR_ACCENT_CYAN)
    draw.line([(0, 1), (w, 1)], fill=(COLOR_ACCENT_CYAN[0], COLOR_ACCENT_CYAN[1], COLOR_ACCENT_CYAN[2], 100))

    # Left side: cloud icon (scaled for banner)
    cloud_scale = 2.8
    cloud_cx = 68
    cloud_cy = 80

    # Draw cloud on banner
    draw_cloud_pixel(draw, cloud_cx, cloud_cy, cloud_scale)

    # Lightning bolt
    bolt_cx = cloud_cx + 10
    bolt_cy = cloud_cy + 18
    draw_lightning_bolt(draw, bolt_cx, bolt_cy, cloud_scale)

    # Cyan vertical separator line
    sep_x = 108
    for y in range(15, h - 15):
        alpha = 180 if (y % 3 != 0) else 60
        draw.point((sep_x, y), fill=(COLOR_ACCENT_CYAN[0], COLOR_ACCENT_CYAN[1], COLOR_ACCENT_CYAN[2], alpha))

    # ---- Text: "WeatherStar" in pixel-art block letters ----
    # We'll draw pixel-art style text using rectangles
    text_x = 116
    text_y = 30

    def draw_pixel_char(draw, char, x, y, scale, color):
        """Draw a single pixel-art character using a 5x7 bitmap font."""
        # 5-wide x 7-tall pixel font bitmaps
        FONT = {
            'W': [
                "1...1",
                "1...1",
                "1.1.1",
                "1.1.1",
                "11111",
                ".1.1.",
                ".1.1.",
            ],
            'E': [
                "11111",
                "1....",
                "1....",
                "1111.",
                "1....",
                "1....",
                "11111",
            ],
            'A': [
                ".111.",
                "1...1",
                "1...1",
                "11111",
                "1...1",
                "1...1",
                "1...1",
            ],
            'T': [
                "11111",
                "..1..",
                "..1..",
                "..1..",
                "..1..",
                "..1..",
                "..1..",
            ],
            'H': [
                "1...1",
                "1...1",
                "1...1",
                "11111",
                "1...1",
                "1...1",
                "1...1",
            ],
            'R': [
                "1111.",
                "1...1",
                "1...1",
                "1111.",
                "11...",
                "1.1..",
                "1..1.",
            ],
            'S': [
                ".1111",
                "1....",
                "1....",
                ".111.",
                "....1",
                "....1",
                "1111.",
            ],
            'K': [
                "1...1",
                "1..1.",
                "1.1..",
                "11...",
                "1.1..",
                "1..1.",
                "1...1",
            ],
            'I': [
                "11111",
                "..1..",
                "..1..",
                "..1..",
                "..1..",
                "..1..",
                "11111",
            ],
            'O': [
                ".111.",
                "1...1",
                "1...1",
                "1...1",
                "1...1",
                "1...1",
                ".111.",
            ],
            ' ': [
                ".....",
                ".....",
                ".....",
                ".....",
                ".....",
                ".....",
                ".....",
            ],
        }
        bitmap = FONT.get(char.upper(), FONT[' '])
        p = scale
        for row_i, row in enumerate(bitmap):
            for col_i, pixel in enumerate(row):
                if pixel == '1':
                    px = x + col_i * p
                    py = y + row_i * p
                    draw.rectangle([(px, py), (px + p - 1, py + p - 1)], fill=color)
        return x + (len(bitmap[0]) + 1) * p  # return next x position

    # Draw "WeatherStar" - use scale=2 so 11 chars * 12px = 132px, plenty of room in 320px banner
    big_scale = 2
    cx = text_x
    for char in "WEATHERSTAR":
        cx = draw_pixel_char(draw, char, cx, text_y, big_scale, COLOR_ACCENT_CYAN)

    # Draw "KIOSK" - yellow text below
    small_scale = 2
    kiosk_text = "KIOSK"
    kiosk_x = text_x
    kiosk_y = text_y + 7 * big_scale + big_scale * 2  # below WeatherStar
    for char in kiosk_text:
        kiosk_x = draw_pixel_char(draw, char, kiosk_x, kiosk_y, small_scale, COLOR_YELLOW)

    # Scanlines overlay
    scan = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    scan_draw = ImageDraw.Draw(scan)
    for y in range(0, h, 4):
        scan_draw.line([(0, y), (w, y)], fill=(0, 0, 0, 20))
    img = Image.alpha_composite(img, scan)

    img.save(output_path, 'PNG')
    print(f"  Saved TV banner 320x180: {output_path}")


def _draw_store_banner_base(draw, img, w, h, cloud_scale, cloud_cx, cloud_cy,
                             title_text, title_scale, title_x, title_y,
                             subtitle_text, subtitle_scale):
    """Shared layout for feature graphic and TV store banner."""
    # Background gradient
    for y in range(h):
        t = y / h
        r = int(COLOR_BG_DARK[0] + (COLOR_BG_MID[0] - COLOR_BG_DARK[0]) * t)
        g = int(COLOR_BG_DARK[1] + (COLOR_BG_MID[1] - COLOR_BG_DARK[1]) * t)
        b = int(COLOR_BG_DARK[2] + (COLOR_BG_MID[2] - COLOR_BG_DARK[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # Pixel grid
    for x in range(0, w, 6):
        draw.line([(x, 0), (x, h)], fill=(0, 0, 30, 10))
    for y in range(0, h, 6):
        draw.line([(0, y), (w, y)], fill=(0, 0, 30, 10))

    # Scattered cyan pixel dots
    import random
    rng = random.Random(42)
    dot_size = max(2, w // 200)
    for _ in range(60):
        dx, dy = rng.randint(0, w - dot_size), rng.randint(0, h - dot_size)
        alpha = rng.randint(40, 120)
        draw.rectangle([(dx, dy), (dx + dot_size, dy + dot_size)],
                       fill=(COLOR_ACCENT_CYAN[0], COLOR_ACCENT_CYAN[1], COLOR_ACCENT_CYAN[2], alpha))

    # Cloud + lightning
    draw_cloud_pixel(draw, cloud_cx, cloud_cy, cloud_scale)
    draw_lightning_bolt(draw, cloud_cx + cloud_scale * 2, cloud_cy + cloud_scale * 18, cloud_scale)

    # Vertical cyan separator
    sep_x = int(w * 0.28)
    for y in range(h // 8, h - h // 8):
        alpha = 180 if (y % 3 != 0) else 60
        draw.point((sep_x, y),
                   fill=(COLOR_ACCENT_CYAN[0], COLOR_ACCENT_CYAN[1], COLOR_ACCENT_CYAN[2], alpha))

    # Title text
    def draw_char(draw, char, x, y, scale, color):
        FONT = {
            'W': ["1...1","1...1","1.1.1","1.1.1","11111",".1.1.",".1.1."],
            'E': ["11111","1....","1....","1111.","1....","1....","11111"],
            'A': [".111.","1...1","1...1","11111","1...1","1...1","1...1"],
            'T': ["11111","..1..","..1..","..1..","..1..","..1..","..1.."],
            'H': ["1...1","1...1","1...1","11111","1...1","1...1","1...1"],
            'R': ["1111.","1...1","1...1","1111.","11...","1.1..","1..1."],
            'S': [".1111","1....","1....","0111.","....1","....1","1111."],
            'O': [".111.","1...1","1...1","1...1","1...1","1...1",".111."],
            'K': ["1...1","1..1.","1.1..","11...","1.1..","1..1.","1...1"],
            'I': ["11111","..1..","..1..","..1..","..1..","..1..","11111"],
            'N': ["1...1","11..1","1.1.1","1..11","1...1","1...1","1...1"],
            'G': [".111.","1...1","1....","1.111","1...1","1...1",".111."],
            'L': ["1....","1....","1....","1....","1....","1....","11111"],
            'Y': ["1...1","1...1",".1.1.",".1.1.","..1..","..1..","..1.."],
            'V': ["1...1","1...1","1...1","1...1",".1.1.",".1.1.","..1.."],
            'D': ["111..","1..1.","1...1","1...1","1...1","1..1.","111.."],
            'C': [".111.","1...1","1....","1....","1....","1...1",".111."],
            ' ': [".....",".....",".....",".....",".....",".....","....."],
        }
        bitmap = FONT.get(char.upper(), FONT[' '])
        p = scale
        for row_i, row in enumerate(bitmap):
            for col_i, pixel in enumerate(row):
                if pixel == '1':
                    px2 = x + col_i * p
                    py2 = y + row_i * p
                    draw.rectangle([(px2, py2), (px2 + p - 1, py2 + p - 1)], fill=color)
        return x + (len(bitmap[0]) + 1) * p

    cx = title_x
    for char in title_text:
        cx = draw_char(draw, char, cx, title_y, title_scale, COLOR_ACCENT_CYAN)

    cx = title_x
    sub_y = title_y + 7 * title_scale + title_scale * 3
    for char in subtitle_text:
        cx = draw_char(draw, char, cx, sub_y, subtitle_scale, COLOR_YELLOW)

    # Bottom orange accent bar
    bar_h = max(8, h // 25)
    for y in range(h - bar_h, h):
        t = (y - (h - bar_h)) / bar_h
        r = int(COLOR_ORANGE[0] * (1 - t * 0.3))
        g = int(COLOR_ORANGE[1] * (1 - t * 0.3))
        b2 = int(COLOR_ORANGE[2] * (1 - t * 0.3))
        draw.line([(0, y), (w, y)], fill=(r, g, b2))

    # Top cyan accent line
    draw.line([(0, 0), (w, 0)], fill=COLOR_ACCENT_CYAN)
    draw.line([(0, 1), (w, 1)],
              fill=(COLOR_ACCENT_CYAN[0], COLOR_ACCENT_CYAN[1], COLOR_ACCENT_CYAN[2], 100))

    # Scanlines
    scan = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    scan_draw = ImageDraw.Draw(scan)
    for y in range(0, h, 4):
        scan_draw.line([(0, y), (w, y)], fill=(0, 0, 0, 18))
    return Image.alpha_composite(img, scan)


def create_feature_graphic(output_path):
    """Create the 1024x500 Google Play feature graphic."""
    w, h = 1024, 500
    img = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    cloud_scale = 7.0
    cloud_cx = int(w * 0.14)
    cloud_cy = int(h * 0.42)

    img = _draw_store_banner_base(
        draw, img, w, h,
        cloud_scale, cloud_cx, cloud_cy,
        title_text="RETRO WEATHER",
        title_scale=5,
        title_x=int(w * 0.31),
        title_y=int(h * 0.20),
        subtitle_text="WEATHERSTAR 4000+ FOR ANDROID",
        subtitle_scale=2,
    )
    img.save(output_path, 'PNG')
    print(f"  Saved feature graphic 1024x500: {output_path}")


def create_tv_store_banner(output_path):
    """Create the 1280x720 Google Play TV banner."""
    w, h = 1280, 720
    img = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    cloud_scale = 9.0
    cloud_cx = int(w * 0.13)
    cloud_cy = int(h * 0.43)

    img = _draw_store_banner_base(
        draw, img, w, h,
        cloud_scale, cloud_cx, cloud_cy,
        title_text="RETRO WEATHER",
        title_scale=7,
        title_x=int(w * 0.31),
        title_y=int(h * 0.22),
        subtitle_text="RETRO WEATHER ON YOUR TV",
        subtitle_scale=3,
    )
    img.save(output_path, 'PNG')
    print(f"  Saved TV store banner 1280x720: {output_path}")


def main():
    base = "/home/cyberrange/weatherstartv/app/src/main/res"

    icon_specs = [
        (48,  f"{base}/mipmap-mdpi/ic_launcher.png"),
        (72,  f"{base}/mipmap-hdpi/ic_launcher.png"),
        (96,  f"{base}/mipmap-xhdpi/ic_launcher.png"),
        (144, f"{base}/mipmap-xxhdpi/ic_launcher.png"),
        (192, f"{base}/mipmap-xxxhdpi/ic_launcher.png"),
    ]

    print("Generating launcher icons...")
    for size, path in icon_specs:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        create_icon(size, path)

    print("\nGenerating TV banner...")
    banner_path = f"{base}/drawable/tv_banner.png"
    os.makedirs(os.path.dirname(banner_path), exist_ok=True)
    create_tv_banner(banner_path)

    print("\nGenerating Play Store assets...")
    store_dir = "/home/cyberrange/weatherstartv/store"
    os.makedirs(store_dir, exist_ok=True)
    create_icon(512, f"{store_dir}/icon-512.png")
    create_feature_graphic(f"{store_dir}/feature-graphic.png")
    create_tv_store_banner(f"{store_dir}/tv-banner.png")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()
