# Licences

## Shipped with the site (runtime dependencies)

| Package | Version | Licence | Notes |
|---|---|---|---|
| three | 0.187.0 | MIT | real-time "3d" mode only (Phase 2 prototype) |
| gsap | 3.15.0 | GSAP Standard "No Charge" License (https://gsap.com/standard-license) | "3d" mode only |
| @fontsource/space-grotesk | 5.3.0 | SIL Open Font License 1.1 | UI font, and baked into the video's monitor texts |
| @fontsource/jetbrains-mono | 5.3.0 | SIL Open Font License 1.1 | UI font |

## Development only (not shipped)

Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT), happy-dom (MIT), Playwright (Apache-2.0), @axe-core/playwright (MPL-2.0), ESLint (MIT), typescript-eslint (MIT), @eslint/js (MIT), globals (MIT), @types/three (MIT).

Separately installed tools (not project dependencies): Grafana k6 (AGPL-3.0), Blender 5.2.3 LTS (GPL; its output belongs to the author), FFmpeg (LGPL/GPL build; used locally to encode).

## Assets in the rendered intro video (`public/media/story-*`)

| Asset | Source | Licence | Used as |
|---|---|---|---|
| Character "Ch06" (as downloaded, unmodified apart from two import fixes: Metallic 0, glossiness → roughness) | Mixamo (Adobe), downloaded by the owner with his own account, 2026-11-04 | Mixamo terms: royalty-free use in projects; raw files are **not** redistributed (`blender/` files are git-ignored) | the developer |
| Animations "Typing", "Sitting Idle", "Pointing" (right arm only, re-targeted) | Mixamo (Adobe), downloaded by the owner, 2026-11-03 | as above | his motion |
| HDRI `modern_buildings_night` (4K) | Poly Haven | CC0 1.0 | the night city behind the window (brightness soft-compressed) |
| Models `potted_plant_01`, `potted_plant_02`, `potted_plant_04`, `desk_lamp_arm_01` (1K glTF) | Poly Haven | CC0 1.0 | plants, desk lamp |
| Textures `hangar_concrete_floor`, `dark_wood`, `plaster_grey_04`, `metal_plate_02`, `fabric_pattern_07` (2K) | Poly Haven | CC0 1.0 | floor, desks, walls, racks |
| Everything else (room, racks, servers, switches, cables, monitors and their screen content, PCs, chair, neon sign) | built procedurally by `tools/blender/*.py` | project's own | — |

Every Poly Haven file was downloaded from `dl.polyhaven.org` and verified against the MD5 hash published by the Poly Haven API (`tools/fetch_polyhaven.py`). The list with URLs and hashes is in `blender/sources/polyhaven/manifest.json`.

**Not used (and not shipped):** the "hoodie" (Ahmad Riazi, CC-BY-4.0), "Black Hoodie" (muthuraj6805, CC-BY-4.0), "Low-poly Hoodie" (RanJJ, Sketchfab Standard) and the Mixamo character Ch44. They were evaluated and then dropped when the owner chose Ch06 as-is, so no attribution is required for them.

## Third-party reference material

The reference video supplied by the owner (a re-shared TikTok clip by another creator) is **not** part of this project and must never be committed. See `docs/REFERENCE_ANALYSIS.md`.
