#!/usr/bin/env python3
"""Build a transparent lunar disc and a Deep-Zoom tile pyramid from an equirectangular LROC texture."""
from __future__ import annotations

import argparse
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def smooth_disc_alpha(image: Image.Image, margin: int = 8) -> Image.Image:
    """Give the projected disc an antialiased transparent edge without a bright halo."""
    width, height = image.size
    scale = 4 if max(width, height) < 16384 else 1
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (margin * scale, margin * scale, (width - margin) * scale - 1, (height - margin) * scale - 1),
        fill=255,
    )
    mask = mask.resize((width, height), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(1.5))
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def build_levels(source: Image.Image, output: Path, tile_size: int) -> int:
    width, height = source.size
    max_level = math.ceil(math.log2(max(width, height)))
    output.mkdir(parents=True, exist_ok=True)

    total_tiles = 0
    image = source
    for level in range(max_level, -1, -1):
        level_width, level_height = image.size
        level_dir = output / str(level)
        level_dir.mkdir(parents=True, exist_ok=True)
        columns = math.ceil(level_width / tile_size)
        rows = math.ceil(level_height / tile_size)
        for y in range(rows):
            for x in range(columns):
                left = x * tile_size
                top = y * tile_size
                tile = image.crop((left, top, min(left + tile_size, level_width), min(top + tile_size, level_height)))
                tile.save(level_dir / f"{x}_{y}.webp", "WEBP", quality=90, method=4, exact=True)
                tile.close()
                total_tiles += 1
        if level > 0:
            next_image = image.resize((max(1, math.ceil(level_width / 2)), max(1, math.ceil(level_height / 2))), Image.Resampling.LANCZOS)
            if image is not source:
                image.close()
            image = next_image
    if image is not source:
        image.close()
    return max_level, total_tiles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--tile-size", type=int, default=512)
    args = parser.parse_args()

    source = smooth_disc_alpha(Image.open(args.source).convert("RGBA"))
    width, height = source.size
    if width != height:
        raise SystemExit(f"Expected a square transparent disc, got {source.size}")

    if args.output.exists():
        shutil.rmtree(args.output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.preview.parent.mkdir(parents=True, exist_ok=True)

    preview = source.copy()
    preview.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    preview.save(args.preview, "WEBP", quality=90, method=6)
    preview.close()

    max_level, total_tiles = build_levels(source, args.output, args.tile_size)
    print(f"source={source.size[0]}x{source.size[1]}")
    print(f"tile_size={args.tile_size}")
    print(f"max_level={max_level}")
    print(f"tiles={total_tiles}")


if __name__ == "__main__":
    main()
