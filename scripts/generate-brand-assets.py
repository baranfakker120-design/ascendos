#!/usr/bin/env python3
"""
Erzeugt alle Branding-Assets aus den beiden Originaldateien.

Quellen, unveraendert, niemals selbst bearbeitet:
  docs/brand/ascendos-logo-original.png    Kombinationsmarke (Symbol+Schriftzug+Claim)
  docs/brand/ascendos-symbol-original.png  Freistehendes Symbol, transparent

Grundsatz aus F4 (docs/f4-product-experience.md, Teil 2), hier angewendet:
"Das Symbol steht immer auf dunklem Grund." Gemessen dort: auf dem hellen
Seitenhintergrund (#F7F6F3) sind 55,4 % der Symbolflaeche unsichtbar, auf
dunklem Grund 0,6 %. Jede Ausgabe unten folgt dieser Regel:
  - Wo ein dunkler Traeger baubar ist (Login-Panel, App-Icons, Social
    Preview): das ORIGINAL-Symbol unveraendert, auf dunklem Grund.
  - Wo NICHT layoutveraendernd ein Traeger hinzugefuegt werden darf
    (Coach-Header, Bottom-Navigation -- User-Vorgabe "keine Aenderungen
    am restlichen Layout"): eine monochrome Silhouette in der Textfarbe
    --color-ink, die auf jedem Untergrund liest, ohne Traeger.

Die monochrome Fassung ist eine MASKE aus dem Alphakanal des Originals,
keine Neuinterpretation: exakt dieselbe Kontur, einfarbig gefuellt. Genau
das hat der Auftrag fuer die Navigation ausdruecklich erlaubt ("erstelle
dafuer automatisch eine vereinfachte monochrome Version, falls
notwendig") und wird hier aus demselben physikalischen Grund auf den
Coach-Header ausgedehnt.
"""

from PIL import Image
import os

ROOT = "/home/claude/work/ascendos"
SRC_LOCKUP = f"{ROOT}/docs/brand/ascendos-logo-original.png"
SRC_SYMBOL = f"{ROOT}/docs/brand/ascendos-symbol-original.png"

BRAND_DIR = f"{ROOT}/public/brand"
ICON_DIR = f"{ROOT}/public/icons"
os.makedirs(BRAND_DIR, exist_ok=True)
os.makedirs(ICON_DIR, exist_ok=True)

# Aus dem Design-System v1 (src/index.css), nicht neu erfunden.
DARK_CARRIER = (26, 27, 30)      # --color-primary, die Graphit-Flaeche
DARK_PAGE_BG = (15, 16, 18)      # #0F1012, theme_color/background_color der PWA
INK = (17, 18, 20)               # --color-ink, Textfarbe

# GRUND: public/-Dateien werden von Vite NICHT content-gehasht, anders
# als importierte Assets im Modulgraph. Beim ersten Branding-Durchgang
# wurden icon-192.png etc. UNTER DEMSELBEN NAMEN ueberschrieben. Jede
# Cache-Schicht, die nach URL schluesselt -- Service-Worker-Precache
# zwischen Builds, ein bereits offener Browser-Tab, vor allem aber das
# iOS-Home-Screen-Icon, das beim Hinzufuegen einmalig geladen und
# danach praktisch nie erneut abgerufen wird -- hatte dadurch keinerlei
# Signal, dass sich der Inhalt geaendert hat.
#
# Ein neuer Dateiname macht diese Mehrdeutigkeit unmoeglich: er ist per
# Definition eine neue Ressource fuer jede Cache-Schicht. Das behebt
# NICHT ein bereits auf dem Homescreen liegendes alt-installiertes
# Icon -- dafuer gibt es keinen serverseitigen Hebel, iOS muesste es
# entfernen und neu hinzufuegen -- aber es macht jede kuenftige
# Installation und jeden Browser-Aufruf eindeutig.
ASSET_VERSION = "v2"


def tight_bbox(im, threshold=40):
    """Bounding-Box der sichtbaren Form, mit derselben Schwelle wie in
    den fruehen Vermessungen (F4/Meilenstein 2), damit Ergebnisse
    vergleichbar bleiben."""
    a = im.getchannel("A")
    w, h = im.size
    px = a.load()
    xs, ys = [], []
    for x in range(0, w, 2):
        for y in range(0, h, 2):
            if px[x, y] > threshold:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def load_symbol_cropped(margin_frac=0.06):
    """Liefert das freistehende Symbol, eng zugeschnitten plus kleinem
    gleichmaessigem Rand. Keine Skalierung, keine Verzerrung."""
    im = Image.open(SRC_SYMBOL).convert("RGBA")
    x0, y0, x1, y1 = tight_bbox(im)
    bw, bh = x1 - x0, y1 - y0
    mx, my = int(bw * margin_frac), int(bh * margin_frac)
    x0, y0 = max(0, x0 - mx), max(0, y0 - my)
    x1, y1 = min(im.width, x1 + mx), min(im.height, y1 + my)
    return im.crop((x0, y0, x1, y1))


def make_mono_from_alpha(symbol_rgba, fill):
    """Monochrome Silhouette: reine Maske aus dem Alphakanal, gefuellt
    mit `fill`. Keine Neuinterpretation der Kontur."""
    a = symbol_rgba.getchannel("A")
    mono = Image.new("RGBA", symbol_rgba.size, (0, 0, 0, 0))
    fill_layer = Image.new("RGBA", symbol_rgba.size, (*fill, 255))
    mono.paste(fill_layer, (0, 0), a)
    return mono


def paste_centered_fit(canvas, glyph, box, fit=0.62):
    """Fuegt `glyph` seitenverhaeltnistreu in die Mitte von `box` ein,
    so dass die groessere Seite `fit` * box-Groesse einnimmt. Keine
    Verzerrung: ein Skalierungsfaktor fuer beide Achsen."""
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    gw, gh = glyph.size
    scale = (min(bw, bh) * fit) / max(gw, gh)
    new_w, new_h = max(1, round(gw * scale)), max(1, round(gh * scale))
    resized = glyph.resize((new_w, new_h), Image.LANCZOS)
    ox = bx0 + (bw - new_w) // 2
    oy = by0 + (bh - new_h) // 2
    canvas.alpha_composite(resized, (ox, oy))


def rounded_mask(size, radius_frac=0.22):
    """Abgerundetes Rechteck als Alphamaske, fuer App-Icons."""
    from PIL import ImageDraw
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    r = int(min(w, h) * radius_frac)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    return mask


def make_app_icon(size, out_path, bg=DARK_CARRIER, fit=0.62, rounded=False):
    """Dunkler Traeger in Groesse `size`x`size`, Symbol zentriert.
    OPAK -- App-Icons duerfen nicht transparent sein: iOS und Android
    fuellen transparente Flaechen sonst selbst auf, unvorhersehbar und
    im Widerspruch zur Vorgabe 'keine weissen Raender'."""
    symbol = load_symbol_cropped()
    canvas = Image.new("RGBA", (size, size), (*bg, 255))
    paste_centered_fit(canvas, symbol, (0, 0, size, size), fit=fit)
    if rounded:
        mask = rounded_mask((size, size))
        base = Image.new("RGBA", (size, size), (*bg, 0))
        base.paste(canvas, (0, 0), mask)
        canvas = base
    canvas.convert("RGB").save(out_path, "PNG")
    return canvas


# ---------------------------------------------------------------
# 1. App-Icons / Favicon / PWA-Manifest, alle aus DEMSELBEN Master
#    (ein Bearbeitungsschritt, keine unterschiedlichen Varianten,
#    wie in Punkt 6 des Auftrags verlangt)
# ---------------------------------------------------------------
make_app_icon(32, f"{ICON_DIR}/icon-32-{ASSET_VERSION}.png", fit=0.66)
make_app_icon(180, f"{ICON_DIR}/icon-180-{ASSET_VERSION}.png", fit=0.62)   # Apple Touch Icon
make_app_icon(192, f"{ICON_DIR}/icon-192-{ASSET_VERSION}.png", fit=0.62)
make_app_icon(512, f"{ICON_DIR}/icon-512-{ASSET_VERSION}.png", fit=0.62)
# Maskable: Android beschneidet auf verschiedene Formen, deshalb mehr
# Sicherheitsabstand (kleinerer fit-Wert), eigene Datei statt
# Wiederverwendung von icon-512 fuer beide Zwecke.
make_app_icon(512, f"{ICON_DIR}/icon-512-maskable-{ASSET_VERSION}.png", fit=0.42)

# favicon.ico, mehrere Aufloesungen in einer Datei.
#
# KORREKTUR: Die erste Fassung uebergab das 16px-Bild als Quelle fuer
# alle drei Groessen. PIL haette daraus 32px und 48px durch HOCHSKALIEREN
# erzeugt, nicht durch Herunterskalieren aus einer scharfen Vorlage --
# das Ergebnis waere unscharf gewesen. Gepruefte Gegenprobe zeigte
# zudem, dass PIL dabei nur EINE Groesse tatsaechlich einbettete, nicht
# drei. Korrigiert: Quelle ist jetzt das schaerfste (48px) Bild, PIL
# skaliert von dort nach UNTEN auf 32 und 16.
#
# favicon.ico bleibt UNVERSIONIERT im Namen (Konvention: Browser fragen
# fest "/favicon.ico" ab, ein anderer Name wuerde dort nicht gefunden).
# Der Cache-Bruch fuer diese eine Datei laeuft stattdessen ueber
# public/_headers, siehe dort.
ico_sizes = [16, 32, 48]
base_48 = make_app_icon(48, f"/tmp/_ico_48.png", fit=0.66)
base_48.convert("RGB").save(
    f"{ROOT}/public/favicon.ico", format="ICO",
    sizes=[(s, s) for s in ico_sizes],
)

# Gegenprobe direkt hier, nicht erst spaeter: die Datei muss alle drei
# Groessen tatsaechlich enthalten.
_check = Image.open(f"{ROOT}/public/favicon.ico")
_check.load()
_sizes = _check.ico.sizes() if hasattr(_check, "ico") else set()
assert _sizes == {(16, 16), (32, 32), (48, 48)}, (
    f"favicon.ico enthaelt nur {_sizes}, erwartet 16/32/48"
)

print(f"App-Icons erzeugt (Version {ASSET_VERSION}): 32, 180, 192, 512, 512-maskable, favicon.ico")

# ---------------------------------------------------------------
# 2. Login-Seite: die Kombinationsmarke UNVERAENDERT kopieren.
#    Kein Traeger mehr (Problem 1, 30. Juli 2026): das Bild wird
#    direkt mit seinem eigenen transparenten Hintergrund angezeigt.
# ---------------------------------------------------------------
import shutil
shutil.copyfile(SRC_LOCKUP, f"{BRAND_DIR}/ascendos-lockup-{ASSET_VERSION}.png")
print("Kombinationsmarke unveraendert nach public/brand/ kopiert")

# ---------------------------------------------------------------
# 3. Monochrome Silhouette fuer Coach-Header und Bottom-Navigation.
#    Reine Alphamaske, Farbe = --color-ink, transparenter Hintergrund,
#    kein Traeger noetig -- funktioniert auf JEDEM Untergrund.
# ---------------------------------------------------------------
symbol = load_symbol_cropped()
mono = make_mono_from_alpha(symbol, INK)
# Hochaufloesend speichern (256px Kantenlaenge der laengeren Seite),
# damit <img class="h-8"> auf hochaufloesenden Bildschirmen scharf bleibt.
scale = 256 / max(mono.size)
mono_hi = mono.resize(
    (round(mono.width * scale), round(mono.height * scale)), Image.LANCZOS
)
mono_hi.save(f"{BRAND_DIR}/ascendos-symbol-mono-{ASSET_VERSION}.png")
print(f"Monochrome Silhouette erzeugt: {mono_hi.size}")

# ---------------------------------------------------------------
# 4. Open Graph / Twitter Card / Share Preview.
#    Eigene Leinwand, dunkler Grund -- hier ist kein Layout zu
#    respektieren, es ist ein eigenstaendiges Bild.
# ---------------------------------------------------------------
OG_SIZE = (1200, 630)
og = Image.new("RGBA", OG_SIZE, (*DARK_PAGE_BG, 255))
lockup = Image.open(SRC_LOCKUP).convert("RGBA")
paste_centered_fit(og, lockup, (0, 0, *OG_SIZE), fit=0.62)
og.convert("RGB").save(f"{BRAND_DIR}/og-image-{ASSET_VERSION}.png", "PNG")
print(f"Social-Preview-Bild erzeugt: {OG_SIZE}")

# ---------------------------------------------------------------
# 5. Alte, unversionierte Dateien aus dem ERSTEN Branding-Durchgang
#    entfernen. Sie liegen sonst als toter, verwirrender Restbestand
#    im Repository, obwohl nichts mehr auf sie verweist.
# ---------------------------------------------------------------
old_files = [
    f"{ICON_DIR}/icon-32.png", f"{ICON_DIR}/icon-180.png",
    f"{ICON_DIR}/icon-192.png", f"{ICON_DIR}/icon-512.png",
    f"{ICON_DIR}/icon-512-maskable.png",
    f"{BRAND_DIR}/ascendos-lockup.png",
    f"{BRAND_DIR}/ascendos-symbol-mono.png",
    f"{BRAND_DIR}/og-image.png",
]
removed_count = 0
for p in old_files:
    if os.path.exists(p):
        os.remove(p)
        removed_count += 1
print(f"Alte unversionierte Dateien tatsaechlich entfernt: {removed_count} von {len(old_files)} erwarteten")

print("\nFertig.")
