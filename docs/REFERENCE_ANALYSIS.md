# Reference Video — Analysis

| Item | Value |
|---|---|
| Source | Supplied by the owner on 2026-11-03 via WhatsApp: a re-shared TikTok clip by a third-party creator |
| Format | 24.2 s, 576 × 1024 portrait, H.264 25 fps, AAC audio |
| Storage | **Not copied into the project.** It is third-party content and must not be committed or published. Frames were reviewed locally only. |

## What the video shows

The video shows an "AR smart menu" concept in a restaurant:

1. **0–2 s:** A printed menu sits on a table, with a QR code next to a flat pizza photo. A finger points at the QR, and a phone camera frames it.
2. **2–4 s:** A wooden pizza peel appears on the menu with a tiny pizza on it. The pizza **grows** out of the flat page into a full-size 3D pizza.
3. **4–6 s:** The 3D pizza sits on the table with believable scale, lighting and contact shadow. The handheld camera moves around it, and it stays anchored.
4. **6–19 s:** A small **stylised chef character** appears standing on the pizza. It idles and gestures toward the viewer while the camera slowly pushes in.
5. **19–20 s:** Close-up on the character.
6. **20–24 s:** A TikTok end card.

## What we take from it

These are the qualities the specification calls "inspiration".

| Quality in the reference | How THE DEVELOPER'S ROOM uses it |
|---|---|
| **2D becomes 3D.** The object rises out of a flat printed image, which is the "wow" moment. | **Proposed opening (needs owner approval):** the room starts as a glowing **CAD floor plan / blueprint**. It is the same visual language as the portfolio ("ahmed.dwg"). The walls, desk and racks **extrude** up from the plan into the lit room over about 1.5 s. The story becomes *CAD drawing → 3D world → back into the CAD-grid portfolio*. It makes the tagline literal: "FROM ONE SCAN TO A WORLD OF POSSIBILITIES." |
| Growth with a slight overshoot (scale up, settle) | Extrusions use a short `back.out` settle (≤ 4% overshoot), never bouncy |
| **Physical presence:** correct scale, soft contact shadow, lighting that matches the surroundings | Baked contact shadows under the desk, chair and character; consistent key/rim lighting; real-world metre scale (already in `STORYBOARD.md`) |
| **A character as the host who acknowledges the viewer** | Already our core beat: the developer stops typing, turns and acknowledges the visitor |
| Slow camera push-in toward the subject | Matches our dolly moves. We may add a **very subtle** handheld drift (≤ 1 cm, ≤ 0.3°) during holds only; never shake, and it is disabled in reduced motion. |
| Short and to the point (about 20 s of content) | Our timeline is about 21.5 s, and skippable |

## What we deliberately do **not** take

| In the reference | Why not |
|---|---|
| Camera-based AR and image/QR tracking on a physical surface | The spec explicitly forbids AR, camera access and a second scan. Our scene is fully virtual and starts directly from the URL. |
| Cartoon / toy-like character (big head, bobble proportions) | The spec requires a **realistic cinematic** developer with natural proportions |
| Warm restaurant daylight palette | Our direction is deep blue + controlled orange, at night |
| Pop-up subtitles and platform branding | Not part of an experience UI |

## Decision

- **Blueprint-extrusion opening:** **approved by the owner on 2026-11-03** and added to `STORYBOARD.md` §4. Scene 01 is now:
  - **0.0–1.5 s:** the CAD plan draws in. Lines trace with the portfolio's grid colours on `#151a20`.
  - **1.5–3.0 s:** the room geometry extrudes and the lights come up.
  - **3.0–4.5 s:** the establishing dolly continues as designed.

  Total intro: about 22.5 s (+1 s), still within 20–30 s. In reduced-motion mode the plan cross-fades to the lit room with no extrusion.
