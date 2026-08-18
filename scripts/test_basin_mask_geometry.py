import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare-moon-formation-textures.py")
spec = importlib.util.spec_from_file_location("moon_texture_prep", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

mask = module.broad_basin_shapes()
histogram = mask.histogram()
total = sum(histogram)
coverage = sum(histogram[33:]) / total
assert coverage < 0.22, f"educational basin guide covers too much of the map: {coverage:.3f}"

center_x = int(module.BASIN_TARGET[0] * (mask.width - 1))
center_y = int(module.BASIN_TARGET[1] * (mask.height - 1))
assert mask.getpixel((center_x, center_y)) > 180, "primary basin target is not inside the guide"
