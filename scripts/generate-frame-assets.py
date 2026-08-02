#!/usr/bin/env python3
"""
Erzeugt optimierte Rangrahmen-WebPs für public/brand/frames/.

Quellen (unverändert, nicht ausgeliefert):
  docs/brand/sprint4-frames/frame-XX-upload.png
  docs/brand/sprint4-frames/frame-10-KORRIGIERT-berater-des-monats.png

Ausgabe-Namen folgen resolveFrameSrc() in src/shared/lib/frameAssets.ts:
  /brand/frames/{frame-01…frame-10}-{96|128|160}.webp

Voraussetzung: cwebp (Paket `webp`) im PATH.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "brand" / "sprint4-frames"
OUT = ROOT / "public" / "brand" / "frames"
SIZES = (96, 128, 160)

SOURCES: dict[str, Path] = {
    f"frame-{i:02d}": SRC / f"frame-{i:02d}-upload.png" for i in range(1, 10)
}
# Sprint-4-Plan: fehlerhaftes frame-10-upload.png nicht ausliefern.
SOURCES["frame-10"] = SRC / "frame-10-KORRIGIERT-berater-des-monats.png"


def main() -> int:
    if subprocess.call(["cwebp", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        print("cwebp fehlt. Paket `webp` installieren.", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    created: list[tuple[Path, int]] = []

    for key, src in SOURCES.items():
        if not src.is_file():
            print(f"Quelle fehlt: {src}", file=sys.stderr)
            return 1
        for px in SIZES:
            dest = OUT / f"{key}-{px}.webp"
            subprocess.check_call(
                [
                    "cwebp",
                    "-quiet",
                    "-q",
                    "82",
                    "-alpha_q",
                    "100",
                    "-m",
                    "6",
                    "-resize",
                    str(px),
                    str(px),
                    str(src),
                    "-o",
                    str(dest),
                ]
            )
            created.append((dest, dest.stat().st_size))

    total = sum(size for _, size in created)
    print(f"→ {len(created)} Dateien in {OUT.relative_to(ROOT)} ({total / 1024:.1f} KiB)")
    for dest, size in created:
        print(f"  {dest.name:24} {size / 1024:6.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
