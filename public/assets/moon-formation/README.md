# Moon formation runtime assets

These runtime assets are derived from NASA Scientific Visualization Studio's CGI Moon Kit. NASA describes the kit's color and elevation maps as data assembled from the Lunar Reconnaissance Orbiter camera and laser altimeter instrument teams.

- Color source: [NASA 4K 16-bit sRGB LROC map](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif), converted to the 2K browser texture `moon-color-2k.jpg`
- Elevation source: [NASA LOLA displacement map](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif), converted to `moon-height-2k.webp`
- NASA project page: [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)
- Formation context: [NASA Earth's Moon in Depth](https://solarsystem.nasa.gov/moons/earths-moon/in-depth/)

The browser receives only small optimized derivatives. The source TIFF files are used during preparation and are not part of the app.

## Formation materials

- `moon-early-crust-2k.webp`: a separately rematerialized low-relief early-crust surface used only in the first phase. It is not a claim that a photograph of the first Moon exists.
- `moon-early-crust-height-2k.webp`: a separate low-amplitude elevation map made from NASA LOLA data for the first phase, so the early surface uses a genuinely flatter height field instead of only a blurred color map.
- `moon-basalt-2k.webp`: dark, low-contrast basalt material for cooled lava plains.
- `moon-basin-mask-2k.webp`: NASA LOLA low-elevation signal constrained by a broad primary-basin guide so unrelated lowlands do not turn the whole globe into one lava field.
- `moon-cracks-2k.webp`: deterministic fracture paths that open after large impacts and glow while magma is active.
- `moon-crater-decal-512.webp`: radial bowl, raised rim, and ejecta-ray material applied to revealed impact sites.
- `moon-meteor-256.webp`: rocky meteor material used by the impact projectiles.
- `moon-meteor-trail-256.webp`: procedural irregular smoky-hot wake used by the moving meteor.
- `moon-impact-shockwave-256.webp`: procedural broken shockwave and irregular ejecta halo used only during contact.
- `moon-impact-flash-256.webp`: procedural hot center flash with a noisy radial falloff used only at contact.
- `moon-impact-dust-256.webp`: procedural smoky multi-lobed dust plume sprite used only during contact.

The basin, crack, and transient impact materials are educational visualizations, not new geological classifications. The timeline uses simplified date labels based on NASA's broad formation and mare-volcanism ranges; it does not claim to reproduce a precise lunar chronology.

## Preparation

```bash
python scripts/prepare-moon-formation-textures.py \
  --color /path/to/lroc_color_16bit_srgb_4k.tif \
  --height /path/to/ldem_16_uint.tif
```
