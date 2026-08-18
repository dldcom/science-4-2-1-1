#!/usr/bin/env python3
"""Prepare small NASA-derived textures for the formation-only 3D scene.

The large NASA elevation TIFF is used only while preparing the runtime assets.
No source TIFF is copied into public/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import tempfile
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

GEOMETRY_PATH = Path(__file__).resolve().parents[1] / "src/formation3d/formationGeometry.json"
GEOMETRY = json.loads(GEOMETRY_PATH.read_text(encoding="utf-8"))

COLOR_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif"
HEIGHT_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif"
TARGET_SIZE = (2048, 1024)
CRACK_PATHS = GEOMETRY["crackPaths"]
LAVA_PATHS = GEOMETRY["lavaPaths"]
BASIN_TARGET = GEOMETRY["basinTarget"]


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "science-moon-observatory/0.1"})
    with urllib.request.urlopen(request, timeout=180) as response, target.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_height_map(source: Path, output: Path) -> dict[str, object]:
    source_image = Image.open(source)
    source_min, source_max = source_image.getextrema()
    resized = source_image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    span = max(1, source_max - source_min)
    values = bytearray(
        max(0, min(255, (int(value) - source_min) * 255 // span))
        for value in resized.getdata()
    )
    height = Image.frombytes("L", TARGET_SIZE, bytes(values))
    height = height.filter(ImageFilter.GaussianBlur(0.45))
    height.save(output, "WEBP", quality=78, method=6)
    return {
        "source_size": list(source_image.size),
        "source_mode": source_image.mode,
        "source_range": [source_min, source_max],
        "runtime_size": list(TARGET_SIZE),
    }


def normalized_height(source: Path) -> Image.Image:
    source_image = Image.open(source)
    source_min, source_max = source_image.getextrema()
    resized = source_image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    span = max(1, source_max - source_min)
    values = bytearray(
        max(0, min(255, (int(value) - source_min) * 255 // span))
        for value in resized.getdata()
    )
    return Image.frombytes("L", TARGET_SIZE, bytes(values))


def make_early_crust_height(source: Path, output: Path) -> dict[str, object]:
    """Create a separate low-amplitude relief map for the early crust phase."""
    normalized = normalized_height(source)
    broad = normalized.resize((96, 48), Image.Resampling.BOX).resize(TARGET_SIZE, Image.Resampling.BICUBIC)
    broad = ImageEnhance.Contrast(broad).enhance(0.22)
    broad = ImageEnhance.Brightness(broad).enhance(0.5)
    broad = broad.filter(ImageFilter.GaussianBlur(0.7))
    broad.save(output, "WEBP", quality=78, method=6)
    return {
        "runtime_size": list(TARGET_SIZE),
        "source": "NASA LOLA elevation map",
        "method": "96x48 low-frequency elevation remapped to a narrow early-crust relief range",
        "relief_amplitude": "approximately 15% of the detailed runtime height range",
    }


def broad_basin_shapes() -> Image.Image:
    """Return broad basin areas used only to keep the classroom reveal legible."""
    width, height = TARGET_SIZE
    mask = Image.new("L", TARGET_SIZE, 0)
    draw = ImageDraw.Draw(mask)
    center_x = BASIN_TARGET[0] * width
    center_y = BASIN_TARGET[1] * height

    def ellipse(box: tuple[float, float, float, float], fill: int = 255) -> None:
        draw.ellipse(tuple(int(value) for value in box), fill=fill)

    def polygon(points: list[tuple[float, float]], fill: int = 255) -> None:
        draw.polygon([(int(x), int(y)) for x, y in points], fill=fill)

    # Broad lowland groups are centered on the primary impact target.
    polygon([
        (center_x - 0.22 * width, center_y - 0.11 * height),
        (center_x - 0.16 * width, center_y - 0.21 * height),
        (center_x - 0.02 * width, center_y - 0.25 * height),
        (center_x + 0.15 * width, center_y - 0.18 * height),
        (center_x + 0.21 * width, center_y - 0.03 * height),
        (center_x + 0.14 * width, center_y + 0.14 * height),
        (center_x - 0.02 * width, center_y + 0.21 * height),
        (center_x - 0.18 * width, center_y + 0.13 * height),
    ])
    ellipse((center_x - 0.17 * width, center_y - 0.17 * height, center_x + 0.17 * width, center_y + 0.17 * height))
    ellipse((center_x + 0.02 * width, center_y - 0.12 * height, center_x + 0.25 * width, center_y + 0.08 * height))
    ellipse((center_x - 0.28 * width, center_y - 0.06 * height, center_x - 0.08 * width, center_y + 0.16 * height))

    return mask


def make_basin_mask(height_source: Path, output: Path) -> dict[str, object]:
    """Combine NASA LOLA low-elevation data with broad educational basin edges."""
    height = normalized_height(height_source)
    lowlands = height.point(lambda value: 255 if value < 96 else 0)
    lowlands = lowlands.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(4))
    # Keep NASA's low-elevation signal only inside the primary educational
    # basin guide. This prevents unrelated maria-like lowlands from turning
    # the whole globe into one lava field.
    mask = ImageChops.multiply(lowlands, broad_basin_shapes())
    mask = mask.filter(ImageFilter.GaussianBlur(7))
    mask.save(output, "WEBP", quality=84, method=6)
    return {
        "runtime_size": list(TARGET_SIZE),
        "method": "NASA LOLA low-elevation threshold constrained by a broad primary-basin guide",
        "low_elevation_threshold": 96,
        "guide_center_uv": BASIN_TARGET,
    }


def make_crack_mask(output: Path) -> dict[str, object]:
    width, height = TARGET_SIZE
    mask = Image.new("L", TARGET_SIZE, 0)
    draw = ImageDraw.Draw(mask)
    for path_index, path in enumerate(CRACK_PATHS):
        points = []
        for segment_index, (start, end) in enumerate(zip(path, path[1:])):
            sx, sy = start
            ex, ey = end
            dx, dy = ex - sx, ey - sy
            length = max(math.hypot(dx, dy), 0.001)
            normal_x, normal_y = -dy / length, dx / length
            for fraction in ((0.0,) if segment_index else (0.0, 0.34, 0.68)):
                x = sx + dx * fraction
                y = sy + dy * fraction
                wobble = 0.009 * math.sin((path_index + 2) * 4.1 + segment_index * 2.7 + fraction * 8.0)
                points.append((int((x + normal_x * wobble) * width), int((y + normal_y * wobble) * height)))
        points.append((int(path[-1][0] * width), int(path[-1][1] * height)))
        draw.line(points, fill=88, width=9, joint="curve")
        draw.line(points, fill=172, width=3, joint="curve")
        # A few short, uneven branches make the fracture read as broken crust
        # instead of a single vector line crossing the moon.
        for branch_index, (x, y) in enumerate(points[1:-1:2]):
            direction = -1 if (branch_index + path_index) % 2 else 1
            branch_length = 0.028 + 0.012 * ((branch_index + path_index) % 3)
            branch_end = (x + direction * int(branch_length * width), y + int((0.012 + branch_index * 0.004) * height))
            draw.line([(x, y), branch_end], fill=116, width=3)
    mask = mask.filter(ImageFilter.GaussianBlur(2.6))
    mask.save(output, "WEBP", quality=86, method=6)
    return {"runtime_size": list(TARGET_SIZE), "paths": len(CRACK_PATHS), "method": "short deterministic basin-fracture branches without synthetic cross-lines"}


def make_lava_arrival_map(output: Path) -> dict[str, object]:
    """Encode normalized travel distance from fissure sources along lava paths."""
    width, height = TARGET_SIZE
    segments = []
    for path in LAVA_PATHS:
        points = path["points"]
        lengths = [math.hypot(end[0] - start[0], end[1] - start[1]) for start, end in zip(points, points[1:])]
        total = max(sum(lengths), 0.001)
        passed = 0.0
        for (start, end), length in zip(zip(points, points[1:]), lengths):
            segments.append((
                start,
                end,
                passed,
                total,
                float(path.get("flowStart", 0.0)),
                float(path.get("flowEnd", 1.0)),
            ))
            passed += length

    values = bytearray(width * height)
    for y in range(height):
        v = y / max(1, height - 1)
        for x in range(width):
            u = x / max(1, width - 1)
            nearest = 1.0
            for (x1, y1), (x2, y2), passed, total, flow_start, flow_end in segments:
                dx = x2 - x1
                dy = y2 - y1
                denominator = dx * dx + dy * dy or 1.0
                t = max(0.0, min(1.0, ((u - x1) * dx + (v - y1) * dy) / denominator))
                qx = x1 + dx * t
                qy = y1 + dy * t
                distance = math.hypot(u - qx, v - qy)
                if distance <= 0.16:
                    local_progress = (passed + math.sqrt(denominator) * t) / total
                    progress = flow_start + local_progress * (flow_end - flow_start)
                    nearest = min(nearest, min(1.0, progress + distance * 0.72))
            values[y * width + x] = int(nearest * 255)
    image = Image.frombytes("L", TARGET_SIZE, bytes(values)).filter(ImageFilter.GaussianBlur(1.2))
    image.save(output, "WEBP", quality=84, method=6)
    return {
        "runtime_size": list(TARGET_SIZE),
        "paths": len(LAVA_PATHS),
        "method": "nearest-path arrival distance from fissure sources with shared flow schedule",
        "flow_schedule": [
            {"id": path["id"], "start": path.get("flowStart", 0.0), "end": path.get("flowEnd", 1.0)}
            for path in LAVA_PATHS
        ],
    }


def make_early_crust(color: Image.Image, output: Path) -> dict[str, object]:
    """Make a separate low-relief crust material, not a lightly blurred screenshot."""
    coarse = color.resize((256, 128), Image.Resampling.BOX).resize(TARGET_SIZE, Image.Resampling.BICUBIC)
    coarse = ImageEnhance.Color(coarse).enhance(0.28)
    coarse = ImageEnhance.Contrast(coarse).enhance(0.58)
    coarse = ImageEnhance.Brightness(coarse).enhance(1.04)
    neutral = Image.new("RGB", TARGET_SIZE, (156, 158, 160))
    coarse = Image.blend(neutral, coarse, 0.62)
    large_noise = Image.effect_noise(TARGET_SIZE, 10).filter(ImageFilter.GaussianBlur(18))
    large_noise = ImageOps.autocontrast(large_noise).convert("RGB")
    coarse = Image.blend(coarse, large_noise, 0.035)
    coarse.save(output, "WEBP", quality=84, method=6)
    return {"runtime_size": list(TARGET_SIZE), "method": "NASA color map low-relief crust rematerialized at 256x128 with broad mineral texture and subdued high-frequency detail"}


def make_basalt_texture(color: Image.Image, output: Path) -> dict[str, object]:
    basalt = color.resize((512, 256), Image.Resampling.BOX).resize(TARGET_SIZE, Image.Resampling.BICUBIC)
    basalt = ImageEnhance.Color(basalt).enhance(0.42)
    basalt = ImageEnhance.Contrast(basalt).enhance(0.78)
    basalt = ImageEnhance.Brightness(basalt).enhance(0.66)
    basalt.save(output, "WEBP", quality=84, method=6)
    return {"runtime_size": list(TARGET_SIZE), "method": "NASA color map low-contrast basaltic cooling material"}


def make_crater_texture(output: Path) -> dict[str, object]:
    """Build a low-contrast, irregular impact bowl/ejecta decal without converging rays."""
    size = 512
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5 - size / 2) / (size / 2)
            ny = (y + 0.5 - size / 2) / (size / 2)
            radius = math.sqrt(nx * nx + ny * ny)
            if radius >= 1.08:
                pixels.append((0, 0, 0, 0))
                continue

            broad_noise = (
                math.sin(x * 0.017 + y * 0.011)
                + math.sin(x * 0.031 - y * 0.019)
                + math.sin((x + y) * 0.009)
                + 3
            ) / 6
            grain_noise = (
                math.sin(x * 0.093 + y * 0.071)
                + math.sin(x * 0.137 - y * 0.047)
                + 2
            ) / 4
            irregular_edge = 0.92 + 0.11 * math.sin(nx * 8.0 + ny * 5.0) + 0.06 * math.sin(nx * 17.0 - ny * 11.0)
            bowl = max(0.0, 1.0 - min(1.0, radius / 0.72))
            rim = math.exp(-((radius - 0.76) / 0.105) ** 2) * irregular_edge
            ejecta = max(0.0, 1.0 - smoothstep(0.66, 1.04, radius)) * (0.42 + broad_noise * 0.58)
            mottling = (broad_noise - 0.5) * 16 + (grain_noise - 0.5) * 7
            red = int(max(42, min(174, 94 - bowl * 22 + rim * 13 + ejecta * 7 + mottling)))
            green = int(max(43, min(174, 95 - bowl * 20 + rim * 12 + ejecta * 7 + mottling)))
            blue = int(max(48, min(182, 101 - bowl * 16 + rim * 11 + ejecta * 8 + mottling)))
            alpha_edge = max(0.0, min(1.0, (1.0 - max(0.0, radius - 0.86) / 0.22) * (0.82 + broad_noise * 0.18)))
            alpha = int(alpha_edge * 196)
            pixels.append((red, green, blue, alpha))
    Image.frombytes("RGBA", (size, size), bytes(value for pixel in pixels for value in pixel)).save(output, "WEBP", quality=88, method=6)
    return {"runtime_size": [size, size], "method": "low-contrast mottled impact bowl, uneven rim, and non-radial ejecta texture"}


def make_meteor_texture(output: Path, reference: Path | None = None) -> dict[str, object]:
    size = 256
    if reference is not None:
        material = ImageOps.fit(Image.open(reference).convert("RGB"), (size, size), method=Image.Resampling.LANCZOS)
        material = ImageEnhance.Color(material).enhance(0.78)
        material = ImageEnhance.Contrast(material).enhance(1.04)
        material = ImageEnhance.Brightness(material).enhance(1.16)
        material.save(output, "WEBP", quality=90, method=6)
        return {
            "runtime_size": [size, size],
            "method": "generated carbonaceous-chondrite surface reference, desaturated for a matte rocky albedo",
            "reference": reference.name,
        }
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = x / (size - 1)
            ny = y / (size - 1)
            noise = (math.sin(x * 0.19 + y * 0.07) + math.sin(x * 0.051 - y * 0.17) + 2) / 4
            band = 0.72 + 0.22 * math.sin(nx * math.pi * 5 + ny * 2)
            value = max(0.0, min(1.0, noise * 0.35 + band * 0.65))
            pixels.extend((int(68 + value * 122), int(57 + value * 108), int(49 + value * 91), 255))
    Image.frombytes("RGBA", (size, size), bytes(pixels)).save(output, "WEBP", quality=84, method=6)
    return {"runtime_size": [size, size], "method": "deterministic rocky iron-silicate meteor material"}


def make_meteor_normal_texture(source: Path, output: Path) -> dict[str, object]:
    """Derive a restrained tangent-space normal map from the rocky albedo."""
    size = 256
    gray = ImageOps.autocontrast(Image.open(source).convert("L"), cutoff=2).filter(ImageFilter.GaussianBlur(0.55))
    values = list(gray.getdata())
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            left = values[y * size + ((x - 1) % size)]
            right = values[y * size + ((x + 1) % size)]
            up = values[((y - 1) % size) * size + x]
            down = values[((y + 1) % size) * size + x]
            dx = (right - left) / 255.0
            dy = (down - up) / 255.0
            pixels.extend((int(max(0, min(255, 128 - dx * 112))), int(max(0, min(255, 128 - dy * 112))), 255))
    Image.frombytes("RGB", (size, size), bytes(pixels)).save(output, "WEBP", quality=88, method=6)
    return {
        "runtime_size": [size, size],
        "method": "albedo-derived tangent-space normal map with restrained micro-relief",
    }


def make_meteor_roughness_texture(source: Path, output: Path) -> dict[str, object]:
    """Create a high-roughness map so the meteor reads as dusty stone, not plastic."""
    size = 256
    gray = ImageOps.autocontrast(Image.open(source).convert("L"), cutoff=2)
    values = list(gray.getdata())
    roughness = bytes(int(max(205, min(248, 226 + (255 - value) * 0.11))) for value in values)
    Image.frombytes("L", (size, size), roughness).save(output, "WEBP", quality=86, method=6)
    return {
        "runtime_size": [size, size],
        "method": "high-roughness dusty stone map derived from meteor albedo",
    }


def make_meteor_trail_texture(output: Path) -> dict[str, object]:
    """Create an irregular smoky-hot wake for a moving meteor sprite."""
    size = 256
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5 - size / 2) / (size / 2)
            ny = (y + 0.5 - size / 2) / (size / 2)
            bend = 0.1 * math.sin(ny * 4.2 + 0.8) + 0.035 * math.sin(ny * 11.0)
            taper = 0.72 + (ny + 1.0) * 0.28
            width = 0.24 + 0.12 * taper
            center = math.exp(-(((nx - bend) / width) ** 2))
            lobe_a = math.exp(-(((nx + 0.03 - bend) / 0.3) ** 2) - (((ny + 0.42) / 0.27) ** 2))
            lobe_b = math.exp(-(((nx - 0.07 - bend) / 0.25) ** 2) - (((ny - 0.16) / 0.34) ** 2))
            length_fade = max(0.0, min(1.0, 1.0 - smoothstep(0.82, 1.08, abs(ny))))
            broken = 0.58 + 0.42 * (
                math.sin(x * 0.11 + y * 0.037)
                + math.sin(x * 0.027 - y * 0.093)
                + 2
            ) / 4
            smoke = max(center * 0.72, lobe_a * 0.62, lobe_b * 0.55)
            alpha = int(max(0.0, min(190.0, smoke * length_fade * broken * 190)))
            heat = max(0.0, min(1.0, (center * 0.72 + lobe_a * 0.32) * (0.68 + 0.32 * length_fade)))
            pixels.append((int(146 + heat * 92), int(92 + heat * 76), int(72 + heat * 54), alpha))
    Image.frombytes("RGBA", (size, size), bytes(value for pixel in pixels for value in pixel)).save(output, "WEBP", quality=88, method=6)
    return {"runtime_size": [size, size], "method": "procedural irregular smoky-hot meteor wake"}


def make_impact_shockwave_texture(output: Path) -> dict[str, object]:
    """Create an irregular, broken shockwave decal instead of a perfect ring."""
    size = 256
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5 - size / 2) / (size / 2)
            ny = (y + 0.5 - size / 2) / (size / 2)
            radius = math.sqrt(nx * nx + ny * ny)
            angle = math.atan2(ny, nx)
            angular = (
                math.sin(angle * 5.0 + 0.7)
                + math.sin(angle * 9.0 - 1.4)
                + math.sin(angle * 17.0 + 0.3)
                + 3
            ) / 6
            broken = max(0.0, min(1.0, (angular - 0.38) / 0.42))
            segment_noise = (
                math.sin(angle * 23.0 + 0.4)
                + math.sin(angle * 31.0 - 1.1)
                + 2
            ) / 4
            ring_radius = 0.58 + (angular - 0.5) * 0.14 + (segment_noise - 0.5) * 0.035
            ring = math.exp(-((radius - ring_radius) / 0.052) ** 2)
            inner_smoke = math.exp(-((radius - 0.38) / 0.18) ** 2) * 0.16
            ejecta_streak = max(
                0.0,
                math.sin(angle * 13.0 + radius * 18.0) * 0.5 + 0.5,
            ) * math.exp(-((radius - 0.72) / 0.16) ** 2) * 0.22
            outer_fade = max(0.0, 1.0 - smoothstep(0.88, 1.08, radius))
            alpha = int(max(0.0, min(224.0, (ring * broken * (0.34 + segment_noise * 0.66) + inner_smoke + ejecta_streak) * outer_fade * 224)))
            mottling = 0.82 + 0.18 * math.sin(x * 0.11 + y * 0.07)
            tone = int(max(48, min(148, 88 + 25 * mottling + 12 * angular)))
            pixels.append((tone + 10, tone + 7, tone + 2, alpha))
    Image.frombytes("RGBA", (size, size), bytes(value for pixel in pixels for value in pixel)).save(output, "WEBP", quality=88, method=6)
    return {"runtime_size": [size, size], "method": "procedural broken shockwave and irregular ejecta halo"}


def make_impact_flash_texture(output: Path) -> dict[str, object]:
    """Create a short-lived hot center flash with a noisy soft edge."""
    size = 256
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5 - size / 2) / (size / 2)
            ny = (y + 0.5 - size / 2) / (size / 2)
            radius = math.sqrt(nx * nx + ny * ny)
            noise = (
                math.sin(x * 0.13 + y * 0.08)
                + math.sin(x * 0.037 - y * 0.17)
                + 2
            ) / 4
            core = math.exp(-((radius / 0.33) ** 2))
            halo = math.exp(-((radius / 0.78) ** 2)) * (0.62 + noise * 0.25)
            edge = max(0.0, min(1.0, 1.0 - smoothstep(0.76, 1.08, radius)))
            alpha = int(max(0.0, min(224.0, (core * 0.88 + halo * 0.25) * edge * 230)))
            heat = max(0.0, min(1.0, core * 0.92 + halo * 0.3))
            pixels.append((255, int(105 + heat * 145), int(32 + heat * 145), alpha))
    Image.frombytes("RGBA", (size, size), bytes(value for pixel in pixels for value in pixel)).save(output, "WEBP", quality=88, method=6)
    return {"runtime_size": [size, size], "method": "procedural hot impact flash with noisy radial falloff"}


def make_impact_dust_texture(output: Path) -> dict[str, object]:
    """Create a low, asymmetric lunar-regolith plume without radial streaks."""
    size = 256
    lobes = [
        (-0.66, 0.28, 0.22),
        (-0.48, 0.12, 0.30),
        (-0.27, 0.23, 0.34),
        (-0.04, 0.08, 0.42),
        (0.20, 0.18, 0.38),
        (0.43, 0.29, 0.29),
        (0.65, 0.34, 0.20),
        (0.08, 0.43, 0.24),
    ]
    pixels = []
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5 - size / 2) / (size / 2)
            ny = (y + 0.5 - size / 2) / (size / 2)
            cloud = 0.0
            for cx, cy, spread in lobes:
                dx = (nx - cx) / (spread * 1.18)
                dy = (ny - cy) / (spread * 0.62)
                cloud = max(cloud, math.exp(-(dx * dx + dy * dy) * 1.7))

            # A low shelf and a gently wavering upper edge suggest ejecta
            # sliding across the ground rather than a radial explosion.
            shelf = math.exp(-(((ny - 0.45) / 0.16) ** 2)) * math.exp(-((nx / 0.96) ** 6)) * 0.54
            upper_edge = math.exp(-(((ny - (0.04 + 0.035 * math.sin(nx * 5.4))) / 0.105) ** 2)) * 0.22
            cloud = max(cloud, shelf, upper_edge)

            broad_noise = (
                math.sin(x * 0.061 + y * 0.037)
                + math.sin(x * 0.023 - y * 0.071)
                + math.sin((x + y) * 0.013)
                + 3
            ) / 6
            fine_noise = (
                math.sin(x * 0.23 + y * 0.17)
                + math.sin(x * 0.11 - y * 0.29)
                + 2
            ) / 4
            edge = max(0.0, 1.0 - smoothstep(0.86, 1.12, math.sqrt(nx * nx + (ny * 0.92) ** 2)))
            alpha = int(max(0.0, min(224.0, (cloud ** 0.72) * edge * (0.7 + broad_noise * 0.3) * 224)))
            tone = int(max(64, min(156, 104 + broad_noise * 32 + (fine_noise - 0.5) * 14)))
            pixels.append((tone + 14, tone + 8, tone + 2, alpha))

    Image.frombytes("RGBA", (size, size), bytes(value for pixel in pixels for value in pixel)).save(output, "WEBP", quality=90, method=6)
    return {
        "runtime_size": [size, size],
        "method": "procedural low asymmetric lunar-regolith dust shelf with lumpy granular edges; no radial streaks",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--color", type=Path)
    parser.add_argument("--height", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/assets/moon-formation"))
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="moon-formation-") as temp_dir:
        temp = Path(temp_dir)
        color_source = args.color or temp / "lroc_color_2k.jpg"
        height_source = args.height or temp / "ldem_16_uint.tif"
        if args.color is None and (args.refresh or not color_source.exists()):
            download(COLOR_URL, color_source)
        if args.height is None and (args.refresh or not height_source.exists()):
            download(HEIGHT_URL, height_source)
        if not color_source.exists() or not height_source.exists():
            raise SystemExit("Both --color and --height must point to existing files when downloads are disabled")

        color = Image.open(color_source).convert("RGB")
        if color.size != TARGET_SIZE:
            color = color.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        color_path = output / "moon-color-2k.jpg"
        color.save(color_path, "JPEG", quality=88, optimize=True, progressive=True)

        height_path = output / "moon-height-2k.webp"
        height_meta = make_height_map(height_source, height_path)
        early_crust_height_path = output / "moon-early-crust-height-2k.webp"
        early_crust_height_meta = make_early_crust_height(height_source, early_crust_height_path)
        early_crust_path = output / "moon-early-crust-2k.webp"
        early_crust_meta = make_early_crust(color, early_crust_path)
        basalt_path = output / "moon-basalt-2k.webp"
        basalt_meta = make_basalt_texture(color, basalt_path)
        basin_path = output / "moon-basin-mask-2k.webp"
        basin_meta = make_basin_mask(height_source, basin_path)
        crack_path = output / "moon-cracks-2k.webp"
        crack_meta = make_crack_mask(crack_path)
        lava_arrival_path = output / "moon-lava-arrival-2k.webp"
        lava_arrival_meta = make_lava_arrival_map(lava_arrival_path)
        crater_path = output / "moon-crater-decal-512.webp"
        crater_meta = make_crater_texture(crater_path)
        meteor_path = output / "moon-meteor-256.webp"
        meteor_reference = Path(__file__).resolve().parent / "source-assets/meteor-material-reference.png"
        meteor_meta = make_meteor_texture(meteor_path, meteor_reference if meteor_reference.exists() else None)
        meteor_normal_path = output / "moon-meteor-normal-256.webp"
        meteor_normal_meta = make_meteor_normal_texture(meteor_path, meteor_normal_path)
        meteor_roughness_path = output / "moon-meteor-roughness-256.webp"
        meteor_roughness_meta = make_meteor_roughness_texture(meteor_path, meteor_roughness_path)
        meteor_trail_path = output / "moon-meteor-trail-256.webp"
        meteor_trail_meta = make_meteor_trail_texture(meteor_trail_path)
        shockwave_path = output / "moon-impact-shockwave-256.webp"
        shockwave_meta = make_impact_shockwave_texture(shockwave_path)
        flash_path = output / "moon-impact-flash-256.webp"
        flash_meta = make_impact_flash_texture(flash_path)
        dust_path = output / "moon-impact-dust-256.webp"
        dust_meta = make_impact_dust_texture(dust_path)

    files = [
        color_path,
        height_path,
        early_crust_height_path,
        early_crust_path,
        basalt_path,
        basin_path,
        crack_path,
        lava_arrival_path,
        crater_path,
        meteor_path,
        meteor_normal_path,
        meteor_roughness_path,
        meteor_trail_path,
        shockwave_path,
        flash_path,
        dust_path,
    ]
    manifest = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "runtime_size": list(TARGET_SIZE),
        "sources": {
            "color": {"url": COLOR_URL, "file": "moon-color-2k.jpg", "source_detail": "NASA 4K 16-bit sRGB map converted to 2K JPEG"},
            "height": {"url": HEIGHT_URL, "file": "moon-height-2k.webp", **height_meta},
            "early_crust_height": {"url": HEIGHT_URL, "file": "moon-early-crust-height-2k.webp", **early_crust_height_meta},
        },
        "assets": {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in files
        },
        "derived_materials": {
            "early_crust": early_crust_meta,
            "basalt": basalt_meta,
            "basin_mask": basin_meta,
            "cracks": crack_meta,
            "lava_arrival": lava_arrival_meta,
            "crater_decal": crater_meta,
            "meteor": meteor_meta,
            "meteor_normal": meteor_normal_meta,
            "meteor_roughness": meteor_roughness_meta,
            "meteor_trail": meteor_trail_meta,
            "impact_shockwave": shockwave_meta,
            "impact_flash": flash_meta,
            "impact_dust": dust_meta,
        },
        "notes": [
            "The color and elevation data are NASA CGI Moon Kit derivatives.",
            "The basin mask constrains NASA LOLA low-elevation data to a broad primary-basin guide so unrelated lowlands do not become one lava field.",
            "The early-crust, basalt, crater, meteor, and crack materials are runtime derivatives or procedural overlays; they are not new NASA geological classifications.",
            "Source TIFF files are preparation-only and are not shipped to the browser.",
        ],
    }
    (output / "moon-formation-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(output), "total_bytes": sum(path.stat().st_size for path in files), "assets": manifest["assets"]}, indent=2))


if __name__ == "__main__":
    main()
