# Retro Weather Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all app launcher icons and TV banner with a "Retro Weather" branded design using ws4kp's Scattered-Showers-1994.gif icon on a dark starfield background with Star4000 gold text, and rename the app to "Retro Weather".

**Architecture:** A temporary HTML page renders each icon at exact pixel dimensions, served by the already-running brainstorm dev server. A Python Playwright script screenshots each size and saves the PNGs directly to the correct Android resource paths. No changes to the build system — assets are committed as static files.

**Tech Stack:** Python 3 + playwright-python, HTML/CSS, Android mipmap PNG resources

---

## Constants

```
SCREEN_DIR=/home/cyberrange/weatherstartv/.superpowers/brainstorm/3433323-1773871460
SERVER_URL=http://localhost:60235
PROJECT_DIR=/home/cyberrange/weatherstartv
```

Verify the brainstorm server is still running before starting Task 2:
```bash
cat $SCREEN_DIR/.server-info
# Must show JSON with "type":"server-started" — if .server-stopped exists instead,
# restart with: /home/cyberrange/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5/skills/brainstorming/scripts/start-server.sh --project-dir $PROJECT_DIR
```

---

## File Map

| Action | Path |
|---|---|
| Modify | `app/src/main/AndroidManifest.xml` line 18 |
| Replace | `app/src/main/res/mipmap-mdpi/ic_launcher.png` |
| Replace | `app/src/main/res/mipmap-hdpi/ic_launcher.png` |
| Replace | `app/src/main/res/mipmap-xhdpi/ic_launcher.png` |
| Replace | `app/src/main/res/mipmap-xxhdpi/ic_launcher.png` |
| Replace | `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` |
| Replace | `app/src/main/res/drawable/tv_banner.png` |
| Temp create+delete | `$SCREEN_DIR/generate-icons.html` |
| Temp create+delete | `/tmp/generate-icons.py` |

---

## Task 1: Update app name in AndroidManifest.xml

**Files:**
- Modify: `app/src/main/AndroidManifest.xml:18`

- [ ] **Step 1: Edit the manifest label**

  In `app/src/main/AndroidManifest.xml` line 18, change:
  ```xml
  android:label="WeatherStar"
  ```
  to:
  ```xml
  android:label="Retro Weather"
  ```

- [ ] **Step 2: Verify the change**

  ```bash
  grep 'android:label' /home/cyberrange/weatherstartv/app/src/main/AndroidManifest.xml
  ```
  Expected output:
  ```
  android:label="Retro Weather"
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd /home/cyberrange/weatherstartv
  git add app/src/main/AndroidManifest.xml
  git commit -m "feat: rename app to Retro Weather"
  ```

---

## Task 2: Write the icon generator HTML page

**Files:**
- Create (temp): `$SCREEN_DIR/generate-icons.html`

This page renders a single icon at a time based on `?size=` URL param. The viewport is set to exactly the target pixel dimensions so a full-page screenshot = the exact PNG output. No margin, no scrollbar, no border-radius (Android launcher applies masking — the PNG is square).

- [ ] **Step 1: Write generate-icons.html**

  Write this file to `/home/cyberrange/weatherstartv/.superpowers/brainstorm/3433323-1773871460/generate-icons.html`:

  ```html
  <!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #060d30; }
    @font-face {
      font-family: 'Star4000';
      src: url('Star4000.woff') format('woff');
    }
    #root {
      width: 100%; height: 100%;
      background: linear-gradient(160deg, #0d1a5e 0%, #060d30 100%);
      border-radius: 22.5%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    #root::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.5) 0%, transparent 100%),
        radial-gradient(1px 1px at 72% 12%, rgba(255,255,255,0.35) 0%, transparent 100%),
        radial-gradient(1px 1px at 88% 60%, rgba(255,255,255,0.45) 0%, transparent 100%),
        radial-gradient(1px 1px at 28% 82%, rgba(255,255,255,0.3) 0%, transparent 100%),
        radial-gradient(1px 1px at 52% 42%, rgba(255,255,255,0.25) 0%, transparent 100%),
        radial-gradient(1px 1px at 40% 25%, rgba(255,255,255,0.2) 0%, transparent 100%),
        radial-gradient(1px 1px at 65% 78%, rgba(255,255,255,0.3) 0%, transparent 100%);
      pointer-events: none;
    }
    img {
      image-rendering: pixelated;
      animation-play-state: paused !important;
      animation-delay: 0s !important;
      position: relative;
      z-index: 1;
      display: block;
    }
    .label {
      font-family: 'Star4000', 'Courier New', monospace;
      color: #FFD700;
      font-weight: bold;
      text-align: center;
      line-height: 1.1;
      position: relative;
      z-index: 1;
      text-shadow: 0 0 8px rgba(255,215,0,0.6);
      letter-spacing: 1px;
      white-space: pre-line;
    }
    /* Banner overrides — no border-radius for TV banner (rectangular asset) */
    #root.banner {
      flex-direction: row;
      justify-content: flex-start;
      padding: 0 7%;
      gap: 7%;
      border-radius: 0;
    }
    #root.banner img { height: 52%; width: auto; flex-shrink: 0; }
    .text-block {
      display: flex; flex-direction: column;
      gap: 7px; position: relative; z-index: 1;
    }
    .banner-title {
      font-family: 'Star4000', 'Courier New', monospace;
      color: #FFD700; font-size: 52px; font-weight: bold;
      letter-spacing: 3px; line-height: 1.05;
      text-shadow: 0 0 16px rgba(255,215,0,0.5);
      white-space: pre-line;
    }
    .divider { width: 60px; height: 3px; background: #FFD700; opacity: 0.5; border-radius: 2px; }
    .banner-sub {
      font-family: 'Star4000', 'Courier New', monospace;
      color: #87CEEB; font-size: 18px; letter-spacing: 4px; opacity: 0.8;
    }
  </style>
  </head>
  <body>
  <div id="root"></div>
  <script>
  var p = {};
  location.search.replace(/^\?/,'').split('&').forEach(function(s){var kv=s.split('=');p[kv[0]]=kv[1];});
  var size = p.size || '192';
  var root = document.getElementById('root');

  var cfgs = {
    '48':  {fontSize:'5px',  label:'RETRO\nWX',      marginTop:'-4px', pb:'3px'},
    '72':  {fontSize:'7px',  label:'RETRO\nWX',      marginTop:'-4px', pb:'4px'},
    '96':  {fontSize:'9px',  label:'RETRO\nWEATHER', marginTop:'-4px', pb:'5px'},
    '144': {fontSize:'14px', label:'RETRO\nWEATHER', marginTop:'-6px', pb:'7px'},
    '192': {fontSize:'18px', label:'RETRO\nWEATHER', marginTop:'-8px', pb:'10px'}
  };

  if (size === 'banner') {
    root.className = 'banner';
    var img = document.createElement('img');
    img.src = 'Scattered-Showers-1994.gif';
    root.appendChild(img);
    var tb = document.createElement('div');
    tb.className = 'text-block';
    var t = document.createElement('div'); t.className = 'banner-title'; t.textContent = 'RETRO\nWEATHER'; tb.appendChild(t);
    var d = document.createElement('div'); d.className = 'divider'; tb.appendChild(d);
    var s = document.createElement('div'); s.className = 'banner-sub'; s.textContent = 'WS 4000+ KIOSK'; tb.appendChild(s);
    root.appendChild(tb);
  } else {
    var cfg = cfgs[size] || cfgs['192'];
    var img = document.createElement('img');
    img.src = 'Scattered-Showers-1994.gif';
    img.style.width = '62%'; img.style.height = 'auto'; img.style.marginTop = cfg.marginTop;
    root.appendChild(img);
    var lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.style.fontSize = cfg.fontSize; lbl.style.paddingBottom = cfg.pb;
    lbl.textContent = cfg.label;
    root.appendChild(lbl);
  }
  </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Verify it's served correctly**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:60235/files/generate-icons.html
  ```
  Expected: `200`

---

## Task 3: Generate icons with Python Playwright

**Files:**
- Temp create+delete: `/tmp/generate-icons.py`
- Replace: all 6 PNG targets

- [ ] **Step 1: Install playwright Python package**

  ```bash
  pip3 install playwright --quiet && python3 -m playwright install chromium --quiet
  ```
  Expected: exits 0. Takes ~1 minute on first run.

- [ ] **Step 2: Write the generation script**

  Write to `/tmp/generate-icons.py`:

  ```python
  import asyncio
  from playwright.async_api import async_playwright

  BASE = 'http://localhost:60235/files/generate-icons.html'
  PROJECT = '/home/cyberrange/weatherstartv'

  TARGETS = [
      {'size': '48',     'w': 48,  'h': 48,  'out': 'app/src/main/res/mipmap-mdpi/ic_launcher.png'},
      {'size': '72',     'w': 72,  'h': 72,  'out': 'app/src/main/res/mipmap-hdpi/ic_launcher.png'},
      {'size': '96',     'w': 96,  'h': 96,  'out': 'app/src/main/res/mipmap-xhdpi/ic_launcher.png'},
      {'size': '144',    'w': 144, 'h': 144, 'out': 'app/src/main/res/mipmap-xxhdpi/ic_launcher.png'},
      {'size': '192',    'w': 192, 'h': 192, 'out': 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'},
      {'size': 'banner', 'w': 320, 'h': 180, 'out': 'app/src/main/res/drawable/tv_banner.png'},
  ]

  async def main():
      async with async_playwright() as pw:
          browser = await pw.chromium.launch()
          for t in TARGETS:
              page = await browser.new_page()
              await page.set_viewport_size({'width': t['w'], 'height': t['h']})
              await page.goto(f"{BASE}?size={t['size']}")
              await page.wait_for_load_state('networkidle')
              await page.wait_for_timeout(400)
              out = f"{PROJECT}/{t['out']}"
              element = await page.query_selector('#root')
              await element.screenshot(path=out)
              await page.close()
              print(f"OK  {t['w']}x{t['h']}  ->  {t['out']}")
          await browser.close()

  asyncio.run(main())
  ```

- [ ] **Step 3: Run the script**

  ```bash
  python3 /tmp/generate-icons.py
  ```

  Expected output:
  ```
  OK  48x48    ->  app/src/main/res/mipmap-mdpi/ic_launcher.png
  OK  72x72    ->  app/src/main/res/mipmap-hdpi/ic_launcher.png
  OK  96x96    ->  app/src/main/res/mipmap-xhdpi/ic_launcher.png
  OK  144x144  ->  app/src/main/res/mipmap-xxhdpi/ic_launcher.png
  OK  192x192  ->  app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
  OK  320x180  ->  app/src/main/res/drawable/tv_banner.png
  ```

---

## Task 4: Verify output dimensions

- [ ] **Step 1: Check all PNG dimensions are correct**

  ```bash
  cd /home/cyberrange/weatherstartv
  python3 -c "
  from PIL import Image
  checks = [
    ('app/src/main/res/mipmap-mdpi/ic_launcher.png',    48,  48),
    ('app/src/main/res/mipmap-hdpi/ic_launcher.png',    72,  72),
    ('app/src/main/res/mipmap-xhdpi/ic_launcher.png',   96,  96),
    ('app/src/main/res/mipmap-xxhdpi/ic_launcher.png',  144, 144),
    ('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, 192),
    ('app/src/main/res/drawable/tv_banner.png',          320, 180),
  ]
  for path, w, h in checks:
    img = Image.open(path)
    assert img.size == (w, h), f'{path}: expected {w}x{h}, got {img.size}'
    print(f'OK {w}x{h}  {path}')
  print('All dimensions correct.')
  "
  ```
  Expected: all lines print `OK`, final line prints `All dimensions correct.`

  Note: If you get `ModuleNotFoundError: No module named 'PIL'`, run `pip3 install pillow --quiet` first.

- [ ] **Step 2: Visual spot-check the xxxhdpi icon**

  ```bash
  cd /home/cyberrange/weatherstartv
  python3 -c "
  from PIL import Image
  img = Image.open('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')
  print('Size:', img.size)
  print('Mode:', img.mode)
  # Sample center pixel — should be dark blue (not white/blank)
  px = img.getpixel((96, 70))
  print('Center pixel (should be dark blue-ish):', px)
  "
  ```
  Expected: size `(192, 192)`, mode `RGB` or `RGBA`, center pixel not `(255,255,255)`.

---

## Task 5: Commit and clean up

- [ ] **Step 1: Commit the new icons**

  ```bash
  cd /home/cyberrange/weatherstartv
  git add \
    app/src/main/res/mipmap-mdpi/ic_launcher.png \
    app/src/main/res/mipmap-hdpi/ic_launcher.png \
    app/src/main/res/mipmap-xhdpi/ic_launcher.png \
    app/src/main/res/mipmap-xxhdpi/ic_launcher.png \
    app/src/main/res/mipmap-xxxhdpi/ic_launcher.png \
    app/src/main/res/drawable/tv_banner.png
  git commit -m "feat: add Retro Weather icons and TV banner (ws4kp aesthetic)"
  ```

- [ ] **Step 2: Delete temp files**

  ```bash
  rm /tmp/generate-icons.py
  rm /home/cyberrange/weatherstartv/.superpowers/brainstorm/3433323-1773871460/generate-icons.html
  ```

- [ ] **Step 3: Confirm clean state**

  ```bash
  cd /home/cyberrange/weatherstartv && git status
  ```
  Expected: `nothing to commit, working tree clean`
