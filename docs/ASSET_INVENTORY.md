# THE DEVELOPER'S ROOM — Asset Inventory

**Status legend:**
- **P2-placeholder:** code-built geometry used only in the Phase 2 prototype, clearly named `PLACEHOLDER_*` in the scene graph.
- **P3:** final asset produced in Phase 3.

Licences marked *verify* must be checked against the source's current terms on the day of download, and recorded in `LICENSES.md` with the URL and date. Nothing is downloaded yet.

---

## 1. Sources (all free, no subscriptions)

| Source | Licence (as published; *verify* at download) | Used for | Notes |
|---|---|---|---|
| Blender (blender.org) | GPL (the tool); output belongs to the author | modelling, rig fixes, baking, export | **5.2.3 LTS installed** at `D:\Programs\Blender\` (verified headless) |
| Mixamo (Adobe) | Royalty-free use in projects; no redistribution as standalone assets (*verify*) | character base + seated clips (typing, sitting idle, turns, pointing) | **Approved by the owner, 2026-11-03.** Needs a free Adobe account, which **the owner signs into and downloads from**. Raw FBX files are not committed to a public repo if the terms disallow it. Only the baked GLB used by the site ships. |
| MakeHuman / MPFB (Blender add-on) | CC0 for exported models (*verify*) | alternative realistic base body if Mixamo is declined | Rig retargeted to the Mixamo skeleton for clips |
| Poly Haven | CC0 | PBR textures (concrete, metal, fabric), HDRI for reflections | — |
| ambientCG | CC0 | extra PBR materials | — |
| Freesound | per-sound (only CC0 will be chosen) | keyboard, chime, chair, room tone, whoosh | Each sound is listed individually |
| Google Fonts *files*, self-hosted | SIL OFL 1.1 | Space Grotesk, JetBrains Mono | Subset to the needed glyphs |

Rejected:
- Quaternius and other low-poly CC0 packs: stylised, which conflicts with the "realistic cinematic" direction.
- Paid marketplaces: cost rule.

## 2. Budgets

| | Low (phones) | Medium | High (desktop) |
|---|---|---|---|
| Visible triangles | ≤ 200 k | ≤ 350 k | ≤ 700 k |
| Draw calls | ≤ 60 | ≤ 90 | ≤ 150 |
| Texture memory (GPU, est.) | ≤ 64 MB | ≤ 128 MB | ≤ 256 MB |
| Max texture size | 1024 | 2048 | 2048 (4096 lightmap atlas only) |
| Critical download (groups 0–2, compressed) | ≤ 6 MB | ≤ 8 MB | ≤ 12 MB |

**Format rules:**
- GLB with Meshopt geometry compression and KTX2 textures: UASTC for normal maps and the screen bezel, ETC1S for albedo/roughness.
- Lightmaps go in KTX2, or RGBM PNG if KTX2 banding shows.
- One material per object where possible, with atlases for small props.

## 3. Inventory

| # | Asset | Purpose | Group | Tri budget (high) | Textures | Source plan | Status |
|---|---|---|---|---|---|---|---|
| A01 | Room shell (floor, walls, ceiling, back-wall panels) | Space and scale | 1 | 8 k | atlas 2k + lightmap | Blender, Poly Haven materials | P2-placeholder (boxes) → P3 |
| A02 | Window wall + mullions + glass | Depth, city view | 1 | 3 k | — (glass shader, low reflectance) | Blender | P2-placeholder → P3 |
| A03 | City exterior (3–4 parallax layers + instanced towers) | Night atmosphere | 1 (near) / 3 (far) | 20 k | emissive window atlas 1–2k | Blender + procedural windows | P2-placeholder (flat emissive planes) → P3 |
| A04 | Desk | Workstation anchor | 1 | 4 k | 1k | Blender | P2 → P3 |
| A05 | **Main monitor** (bezel, stand, screen mesh with exact 0.70 × 0.39 m UV-0..1 screen) | Gateway; transition target | 1 | 3 k | 1k bezel + runtime CanvasTexture | Blender. **The screen rectangle must match the config exactly.** | P2 (exact dims) → P3 |
| A06 | Secondary monitors ×2 | Composition, light | 1 | 2 × 2.5 k | shared with A05 | instanced from A05 variant | P2 → P3 |
| A07 | Keyboard (black, key caps as an instanced group) | Typing sync | 1 | 6 k | 512 | Blender | P2 → P3 |
| A08 | Mouse | Detail | 3 | 1 k | shared | Blender | P3 |
| A09 | Workstation tower (glass side, internal glow) | Tech identity, orange accent | 3 | 6 k | 1k | Blender | P3 |
| A10 | **Chair** (separate base + seat pivot empty on the gas-lift axis) | Turn animation | 1 | 10 k | 1k | Blender | P2 (pivot correct) → P3 |
| A11 | Server racks ×2 (frame, front panels, vents via normal map, LED strip) | Tech identity, right-side frame | 1 (shell) / 3 (detail) | 2 × 8 k | 2k shared | Blender | P2 → P3 |
| A12 | Cable management (under-desk tray, a few visible runs) | Believability | 3 | 3 k | shared | Blender | P3 |
| A13 | Desk accessories (2–3 max: mug, headphones on stand, small lamp) | Lived-in detail | 3 | 6 k | atlas 1k | Blender + Poly Haven | P3 |
| A14 | Ceiling / cove practical fixtures | Practical lights | 1 | 2 k | emissive | Blender | P3 |
| C01 | **Developer character, black hoodie** | Story | 2 | ≤ 30 k, 1 skinned mesh, ≤ 65 bones, ≤ 3 materials (skin, hoodie, trousers/shoes) | 2k hoodie (albedo/normal/roughness), 1k skin, 1k other | Mixamo base (or MPFB) + hoodie modelled/adjusted in Blender, fabric normal map with folds | P2-placeholder (capsule mannequin with the correct seated proportions and pivots) → P3 |
| C02 | Clips: idle, typing (2 takes), stopTyping, headReaction, chairTurn, lookTowardVisitor, lookTowardMonitor, pointTowardMonitor, returnToIdle | Story | 2 (first 11 s) / 3 (rest) | — | — | Mixamo seated clips, retimed and blended in Blender; chair-turn hand-keyed against the chair pivot | P2-placeholder (procedural transforms on the mannequin) → P3 |
| T00 | Blueprint plan lines + extrusion | Opening (S01a/b), CAD bookend | 1 | ≤ 4 k line segments | none (generated at runtime from mesh footprints) | code (`BlueprintReveal.ts`). Room meshes must keep their **origin on the floor** so the `uRise` extrusion scales from y = 0. | P2 (final logic) |
| T01 | Monitor UI states (code, notification, message, grid) | Story + handoff | 0/1 | — | runtime canvas | code (`MonitorScreen.ts`) | P2 (final logic) |
| F01 | Space Grotesk 500/600 (subset) | Display text | 0 | — | woff2 ≈ 20 KB | OFL | P2 |
| F02 | JetBrains Mono 400/500 (subset) | Screen code / UI | 1 | — | woff2 ≈ 25 KB | OFL | P2 |
| S01 | Room tone (loop, 10 s) | Ambience | 4 | — | Opus 48 kbps + AAC fallback | Freesound CC0 or synthesised | P4 |
| S02 | Keyboard typing (loop) | Sync with the clip | 4 | — | same | Freesound CC0 | P4 |
| S03 | Notification chime | Scene 03 | 4 | — | same | synthesised (Web Audio) or CC0 | P4 |
| S04 | Chair creak (subtle) | Scene 03 | 4 | — | same | CC0 | P4 |
| S05 | Transition whoosh | Scene 06 | 4 | — | same | synthesised | P4 |
| I01 | Favicon + Open Graph image | Sharing | 0 | — | PNG/SVG | rendered from the final scene | P8 |
| Q01 | QR code (SVG + 1024 px PNG) | Entry | — | — | — | `tools/generate-qr.mjs` | P8, after the URL is live |

## 4. Naming and folders

- Scene graph names follow `Category_Name_Variant`, for example `Workstation_MonitorMain`, `Char_Developer`, `Pivot_ChairSeat`. Placeholders are prefixed `PLACEHOLDER_`.
- Published files go in `public/assets/models/room.glb`, `public/assets/models/developer.glb`, `public/assets/textures/lightmap_{1k,2k,4k}.ktx2`, `public/assets/audio/*.{opus,m4a}` and `public/assets/fonts/*.woff2`.
- Blender sources go in `blender/` (room, character, animations). If source files are large they are tracked with Git LFS only on the owner's approval; otherwise they are kept out of the public repo and documented.
- `public/assets/manifest.json` is **generated at build time**. It lists each file with its byte size and group; the loader uses it for real progress.

## 5. Handling the open decisions

| Decision | Status | Impact |
|---|---|---|
| Mixamo | **Approved** (2026-11-03) | The final character and clips come from Mixamo, prepared in Blender |
| Blender | **Installed**, 5.2.3 LTS (2026-11-03) | Phase 3 unblocked |
| Reference video | Provided and analysed (`REFERENCE_ANALYSIS.md`); not stored in the repo | Inspires the proposed blueprint-extrusion opening |
