# THE DEVELOPER'S ROOM — Phase 0: Project Audit

Audit date: 2026-11-03
Scope: the local working folder, the live portfolio at `https://ahshika.github.io/`, its public GitHub repository, and the local toolchain.

Everything below was observed directly (HTTP requests, the GitHub API, local commands). Anything not observed is listed under *Missing information*.

---

## 1. Local working folder

| Item | Finding |
|---|---|
| Path | `D:\Project\Programes\My QR` |
| Contents | **Empty** (no files, no hidden files) |
| Git | Not a git repository |
| Existing assets | None |

There is no existing code for the experience. Nothing local can be overwritten by this project.

## 2. Existing portfolio — `https://ahshika.github.io/`

### 2.1 Hosting and delivery

| Item | Finding |
|---|---|
| Repository | `Ahshika/Ahshika.github.io` (public, default branch `main`, last push 2026-10-31) |
| Hosting | GitHub Pages (user site), served through Fastly |
| HTTPS | Yes, with `Strict-Transport-Security: max-age=31556952` |
| Caching | `Cache-Control: max-age=600` |
| Framing headers | **No `X-Frame-Options` and no `Content-Security-Policy`** header or `<meta http-equiv>`, so the page can be loaded in an iframe |
| CORS | `Access-Control-Allow-Origin: *` |
| `robots.txt` / `sitemap.xml` | Not present (404) |

### 2.2 Architecture

- **No framework and no build step.** The whole site is one `index.html` (54.6 KB) of hand-written HTML, CSS and vanilla JavaScript in a single inline `<script>`.
- **Concept:** "ahmed.dwg", a portfolio drawn as a CAD file. It has an AutoCAD-style crosshair, projects shown as "blocks", skill layers as toggleable CAD layers, an FTTH network SVG (owner = OLT, layers = splitters, projects = FAT terminals) and a working command line (`open fiberlens`, `layer ai`, `contact`, `help`).
- **Data at runtime:** `data/projects.json` (projects, `{version, updated, projects[]}`) and `stats.json` (automated test counts), both loaded with `fetch(..., {cache:'no-cache'})`.
- **Security posture already present:** HTML escaping (`esc`) and an `https://`-only URL filter (`safeUrl`) on rendered links. It also respects `prefers-reduced-motion`.
- **Fonts:** Google Fonts (Archivo, IBM Plex Sans, JetBrains Mono).
- **Palette:** dark CAD theme with page background `#151a20`, ink `#e7ecf1`, accents `#2f7bff`, `#62c9ff`, `#ff5148`.

### 2.3 Routes (all in-page anchors on one page)

`#projects`, `#layers`, `#properties`, `#contact`, plus project anchors `#blk-<id>`.

Separate resources: `cv/Ahmed-Hassan-CV-EN.pdf`, `cv/Ahmed-Hassan-CV-AR.pdf`, `og.png`, and the separate Games portfolio at `https://ahshika.github.io/games/` (its own repo, `Ahshika/games`).

### 2.4 Real portfolio content (verified)

Owner: **Ahmed Hassan Mostafa**, Full-stack developer (React) and AI automation, Alexandria, Egypt.

Projects from `data/projects.json` (11 entries, all software):

| id | Name | Layer | Live app |
|---|---|---|---|
| fiberlens | FiberLens | web | https://fiberlens.pages.dev |
| translator | AI Live Translator | ai | — |
| fixtrack | FixTrack | mobile | — |
| orderly | Order Ly | mobile | https://orderly-yvzug.web.app |
| nightgold | NightGold V3 | desktop | — |
| pgv2 | Password Generator V2 | desktop | — |
| pgv1 | Password Generator V1 | desktop | — |
| geosnap | GeoSnap Pro | mobile | — |
| wedding | Wedding Decor Bot | ai | — |
| optinav | Opti Nav | desktop | — |
| basket | Basket | mobile | — |

Every project has a GitHub repo under `github.com/Ahshika/`.

Contact links found on the page: email (`mailto:`), phone (`tel:`), LinkedIn, GitHub, and the two CV PDFs.

**Games rule:** already enforced upstream. `tools/validate-portfolio.mjs`, run by `.github/workflows/validate.yml` on every push and PR, fails any change that adds a game or a duplicate. Games live only at `/games/`.

### 2.5 Existing automation in the portfolio repo

| Workflow | Purpose |
|---|---|
| `validate.yml` | Validates `data/projects.json` (no games, no duplicates, valid data) |
| `update-stats.yml` | Every 6 h: counts automated tests across public repos and writes `stats.json` |
| `update-cv.yml` | Daily 06:00 UTC: adds new repos to both CVs and re-renders the PDFs |

These workflows mean the portfolio changes by itself. **The experience must never copy portfolio content into its own code.** It must hand off to the live site, so content stays current with no extra work.

### 2.6 Observation (not changed)

The page's `og:description` says "10 projects", but `data/projects.json` holds 11. This audit does not modify the portfolio. Fixing it is the owner's call.

## 3. Local toolchain

| Tool | Version | Status |
|---|---|---|
| Node.js | v26.2.0 | Installed |
| npm | 11.13.0 | Installed |
| Git | 2.55.0.windows.3 | Installed. Global identity: `Ahmed` / `ahmedhassanshika655@gmail.com` |
| GitHub CLI | 2.96.0 | Installed, logged in as **Ahshika** |
| Python | 3.13.15 | Installed |
| Grafana k6 | v2.3.0 | Installed |
| Playwright | — | Not installed. It will be added later as a project-local dev dependency |
| **Blender** | 5.2.3 LTS | Installed by the owner on 2026-11-03 at `D:\Programs\Blender\blender.exe` (not on PATH). Verified headless (`--background`, `bpy` OK) with the glTF exporter (`io_scene_gltf2`) enabled. *(At the first audit it was not installed.)* |

## 4. Integration strategy

### 4.1 Hosting decision (confirmed by the owner on 2026-11-03)

- A **new repository `Ahshika/developers-room`**, deployed with GitHub Pages as a project site.
- Stable QR destination: **`https://ahshika.github.io/developers-room/`**
- The repository name is currently free; the owner's repos were listed through the GitHub API.
- It is free and HTTPS, and it does not touch the portfolio repository.

**Key consequence:** the experience and the portfolio share the **same origin** (`https://ahshika.github.io`). Because of that:

- The experience can load the real portfolio in a same-origin iframe if needed, since there is no framing restriction.
- It can prefetch the portfolio document and its data, so the final navigation is near-instant.
- Cross-document View Transitions are technically possible. They need a one-line opt-in on the portfolio side, which requires the owner's approval and is **not** planned by default.

### 4.2 Handoff options to validate in the Phase 2 prototype

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Matched navigation** (leading candidate) | The monitor shows the portfolio as a texture during the camera approach. When the screen plane fills the viewport, the final frame matches the portfolio background (`#151a20`), and the experience navigates to `https://ahshika.github.io/` (prefetched). | The real site, its real URL, refresh and deep links work natively, and the portfolio needs no changes | Needs careful frame matching to avoid a visible flash |
| **B. Live iframe on the monitor** | The real portfolio is rendered in an iframe aligned to the monitor (CSS3D). It expands to fill the viewport, then a real navigation follows. | The screen shows the *live* site during the approach | Iframe-in-3D alignment is harder on iOS Safari, and the page loads twice |
| C. Iframe stays as the final page | The intro page keeps the portfolio in a full-screen iframe | Seamless | Wrong URL, broken refresh/back/deep links, and nested scrolling on iOS. **Rejected.** |

The texture in option A is used only for the transition. The destination is always the real, usable site. The final choice is made after testing A and B on desktop and mobile emulation.

**Back button:** navigation uses `location.assign`. A visitor who presses Back returns to the experience, which detects the return through `pageshow` and session state and shows the optional ending ("THANK YOU FOR VISITING." / "LET'S BUILD SOMETHING GREAT.") instead of replaying the full intro.

### 4.3 Recommended stack (to be confirmed in `ARCHITECTURE.md`)

| Layer | Choice | Reason |
|---|---|---|
| Build | Vite + TypeScript | Static output for GitHub Pages, fast dev server, type safety, and code-splitting of 3D code away from the loader/fallback |
| 3D | **Three.js, used directly** (not React Three Fiber) | The experience is one directed scene with no React UI to integrate, and the portfolio is a separate vanilla site. Direct control over the render loop, disposal and quality scaling. React would add weight with no benefit. |
| Timeline | GSAP | One master timeline for camera, text, screen and audio events. Skip is a single `timeline.kill()` |
| Character animation | `THREE.AnimationMixer`, driven from the GSAP timeline | One clock; crossfades between clips |
| Audio | Web Audio API (no library) | A few short sounds, muted by default and unlocked on user gesture. Howler adds ~10 KB for features not needed |
| Assets | GLB with Meshopt geometry and KTX2 textures | Supported by Three.js loaders on mobile |
| Tests | Vitest (unit), Playwright (E2E and mobile emulation), Lighthouse (load performance) | See section 5 for k6 |

## 5. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Blender is not installed** | Asset prep, rigging, export and Blender source files are blocked | Install Blender (free, official blender.org) when Phase 3 starts, with the owner's approval. Phase 2 uses code-built placeholder geometry. |
| R2 | **Realistic character quality.** Hand-modelling a realistic human at cinematic quality is not feasible here. | The "realistic" target may fall short | Use a licensed free rigged character plus animations (Mixamo is the leading candidate; its licence must be reviewed) and adapt it in Blender: black hoodie, seated pose, chair. Document licences in `LICENSES.md`. |
| R3 | **Screen-entry transition** is the hardest technical proof | A visible flash or jump breaks the concept | Prototype it first (Phase 2) and test options A and B |
| R4 | Mobile GPU and memory limits (iOS Safari especially) | Crashes and low FPS | Quality presets, a capped device pixel ratio, baked lighting, a strict asset budget, `webglcontextlost` handling, and a fallback |
| R5 | Portfolio updated by automation | A static texture of the site can go stale | Generate the transition texture at build time or keep it neutral. The destination is always the live site. |
| R6 | **Real-device testing** (iPhone, Android, printed QR) cannot be done from this machine | Unverified compatibility | Automated mobile emulation here. The owner runs real-device tests with a checklist, and results are recorded honestly. |
| R7 | k6 relevance | The project is a static site with no API, so k6 load results would measure GitHub's CDN, not this code. Load-testing GitHub Pages is also not appropriate. | Use k6 only against the local static build (asset delivery under concurrency) if useful. Primary performance tools: Lighthouse, frame-time measurement, and asset-size budgets. |
| R8 | Autoplay audio restrictions | Sound cannot start by itself | Visuals start automatically and audio unlocks on the first user gesture through the Sound toggle |

## 6. Missing information

1. ~~The reference video~~: **provided on 2026-11-03.** Analysis is in `docs/REFERENCE_ANALYSIS.md`. The file itself is not stored in the project because it is third-party content.
2. ~~Character asset source approval~~: **Mixamo approved by the owner on 2026-11-03.**
3. ~~Blender installation~~: **done (5.2.3 LTS), 2026-11-03.**
4. Whether the owner wants the optional one-line View Transition opt-in on the portfolio. It is not required.

## 7. Recommended implementation plan

1. **Phase 1:** `ARCHITECTURE.md`, `STORYBOARD.md` (room coordinate system, camera shots, timings), `ASSET_INVENTORY.md`, `PERFORMANCE_PLAN.md`.
2. **Phase 2 — prototype:** Vite + TypeScript + Three.js project scaffold, central validated config, capability check and fallback, loader with real progress, a code-built placeholder room (clearly marked) with a correctly placed monitor, a GSAP master timeline, the camera approach, handoff options A/B, Skip Intro, a sound toggle, reduced motion, and Vitest + Playwright tests. Then a local preview and a report.
3. Phases 3–8 follow only after the transition is proven and approved.

Nothing has been committed, pushed or deployed. The portfolio repository was only read.
