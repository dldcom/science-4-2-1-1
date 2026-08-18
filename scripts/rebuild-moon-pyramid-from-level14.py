#!/usr/bin/env python3
"""Rebuild lower Deep-Zoom levels from an existing square highest-level tile set."""
from __future__ import annotations

import argparse
import math
import os
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def tile_size_for_level(level: int, max_level: int, image_size: int, tile_size: int) -> tuple[int, int]:
    side = max(1, math.ceil(image_size / (2 ** (max_level - level))))
    return side, side


def load_region(root: Path, level: int, x0: int, y0: int, width: int, height: int, tile_size: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    first_x = x0 // tile_size
    last_x = (x0 + width - 1) // tile_size
    first_y = y0 // tile_size
    last_y = (y0 + height - 1) // tile_size
    level_side = max(1, 2 ** level)
    max_tile = math.ceil(level_side / tile_size) - 1

    for tile_y in range(first_y, last_y + 1):
        for tile_x in range(first_x, last_x + 1):
            if tile_x > max_tile or tile_y > max_tile:
                continue
            path = root / str(level) / f"{tile_x}_{tile_y}.webp"
            if not path.exists():
                continue
            tile = Image.open(path).convert("RGBA")
            tile_left = tile_x * tile_size
            tile_top = tile_y * tile_size
            crop_left = max(x0 - tile_left, 0)
            crop_top = max(y0 - tile_top, 0)
            crop_right = min(x0 + width - tile_left, tile.width)
            crop_bottom = min(y0 + height - tile_top, tile.height)
            if crop_right <= crop_left or crop_bottom <= crop_top:
                tile.close()
                continue
            crop = tile.crop((crop_left, crop_top, crop_right, crop_bottom))
            canvas.paste(crop, (tile_left + crop_left - x0, tile_top + crop_top - y0), crop)
            crop.close()
            tile.close()
    return canvas


def apply_disc_mask(image: Image.Image, level: int, x0: int, y0: int, image_size: int, max_level: int) -> Image.Image:
    side = max(1, 2 ** level)
    center = (side - 1) / 2
    margin = max(1.25, side * 32 / image_size)
    radius = max(0.5, center - margin)
    local = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(local)
    draw.ellipse(
        (center - radius - x0, center - radius - y0, center + radius - x0, center + radius - y0),
        fill=255,
    )
    local = local.filter(ImageFilter.GaussianBlur(1.1))
    image.putalpha(ImageChops.multiply(image.getchannel("A"), local))
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--max-level", type=int, default=14)
    parser.add_argument("--min-level", type=int, default=0)
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--image-size", type=int, default=16384)
    args = parser.parse_args()

    if args.output_root.exists():
        shutil.rmtree(args.output_root)
    args.output_root.mkdir(parents=True, exist_ok=True)

    # Keep the already validated highest level unchanged.
    shutil.copytree(args.source_root / str(args.max_level), args.output_root / str(args.max_level))

    for level in range(args.max_level - 1, args.min_level - 1, -1):
        side = max(1, 2 ** level)
        columns = math.ceil(side / args.tile_size)
        level_dir = args.output_root / str(level)
        level_dir.mkdir(parents=True, exist_ok=True)
        for tile_y in range(columns):
            for tile_x in range(columns):
                width = min(args.tile_size, side - tile_x * args.tile_size)
                height = min(args.tile_size, side - tile_y * args.tile_size)
                region = load_region(args.source_root, level + 1, tile_x * args.tile_size * 2, tile_y * args.tile_size * 2, width * 2, height * 2, args.tile_size)
                reduced = region.resize((width, height), Image.Resampling.LANCZOS)
                region.close()
                apply_disc_mask(reduced, level, tile_x * args.tile_size, tile_y * args.tile_size, args.image_size, args.max_level)
                reduced.save(level_dir / f"{tile_x}_{tile_y}.webp", "WEBP", quality=90, method=4, exact=True)
                reduced.close()
            print(f"level {level} row {tile_y + 1}/{columns}", flush=True)

    print(f"rebuilt_levels={args.min_level}-{args.max_level}")


if __name__ == "__main__":
    main()
