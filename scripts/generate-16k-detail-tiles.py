#!/usr/bin/env python3
"""Generate the highest Deep-Zoom level directly from a large equirectangular Moon map.

This avoids materializing a full 16K x 16K RGBA projection in memory. Existing lower
levels can be reused from the 8K orthographic pyramid.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def bilinear_sample(source: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    height, width, _ = source.shape
    u = np.mod(u, width - 1e-6)
    v = np.clip(v, 0, height - 1.000001)
    x0 = np.floor(u).astype(np.int32)
    y0 = np.floor(v).astype(np.int32)
    x1 = (x0 + 1) % width
    y1 = np.minimum(y0 + 1, height - 1)
    wx = (u - x0)[..., None].astype(np.float32)
    wy = (v - y0)[..., None].astype(np.float32)

    c00 = source[y0, x0].astype(np.float32)
    c10 = source[y0, x1].astype(np.float32)
    c01 = source[y1, x0].astype(np.float32)
    c11 = source[y1, x1].astype(np.float32)
    top = c00 * (1 - wx) + c10 * wx
    bottom = c01 * (1 - wx) + c11 * wx
    return top * (1 - wy) + bottom * wy


def make_tile(source: np.ndarray, tile_x: int, tile_y: int, tile_size: int, output_size: int, margin: int) -> Image.Image:
    source_height, source_width, _ = source.shape
    center = (output_size - 1) / 2
    radius = center - margin
    x = tile_x * tile_size + np.arange(tile_size, dtype=np.float32) + 0.5
    y = tile_y * tile_size + np.arange(tile_size, dtype=np.float32) + 0.5
    xx, yy = np.meshgrid(x, y)
    nx = (xx - center) / radius
    ny = (yy - center) / radius
    r2 = nx * nx + ny * ny
    inside = r2 <= 1

    z = np.sqrt(np.clip(1 - r2, 0, 1))
    longitude = np.arctan2(nx, z)
    latitude = np.arcsin(np.clip(-ny, -1, 1))
    u = (longitude / (2 * math.pi) + 0.5) * source_width
    v = (0.5 - latitude / math.pi) * source_height
    rgb = bilinear_sample(source, u, v)

    distance = np.sqrt(r2)
    feather = 2.5 / radius
    alpha_float = np.clip((1 - distance) / feather, 0, 1)
    alpha_float = alpha_float * alpha_float * (3 - 2 * alpha_float)
    alpha = (alpha_float * 255).astype(np.uint8)
    alpha[~inside] = 0

    rgba = np.empty((tile_size, tile_size, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[..., 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size", type=int, default=16384)
    parser.add_argument("--tile-size", type=int, default=512)
    args = parser.parse_args()

    image = Image.open(args.source).convert("RGB")
    source = np.asarray(image, dtype=np.uint8)
    image.close()
    source_height, source_width, _ = source.shape
    if source_width != args.size or source_height * 2 != args.size:
        raise SystemExit(f"Expected equirectangular {args.size}x{args.size // 2}, got {source_width}x{source_height}")

    max_level = math.ceil(math.log2(args.size))
    level_dir = args.output / str(max_level)
    level_dir.mkdir(parents=True, exist_ok=True)
    tiles_per_side = math.ceil(args.size / args.tile_size)
    for tile_y in range(tiles_per_side):
        for tile_x in range(tiles_per_side):
            tile = flatten_transparent_edge(make_tile(source, tile_x, tile_y, args.tile_size, args.size, margin=12))
            tile.save(level_dir / f"{tile_x}_{tile_y}.webp", "WEBP", quality=90, method=4, exact=True)
            tile.close()
        print(f"row {tile_y + 1}/{tiles_per_side}", flush=True)

    print(f"source={source_width}x{source_height}")
    print(f"level={max_level}")
    print(f"tiles={tiles_per_side * tiles_per_side}")


if __name__ == "__main__":
    main()
