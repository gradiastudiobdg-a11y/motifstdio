---
name: "pop-cinematic-motion"
description: "Use when making a promo, ad or social reel video from code that should look like a polished, cinematic comic-pop motion design piece rather than flat motion graphics."
---

# Pop Cinematic Motion (style + pipeline)

Art direction learned from the "Tampol Online" 9:16 promo. Goal: every frame looks like a designed poster, not flat clip-art. Flat shapes + light + texture + camera + graphic transitions + stepped-time moments.

Use together with: `spring-motion` (all motion = closed-form springs) and `motion-studio` (Playwright + ffmpeg render contract). Every frame is a pure function of time: `window.seek(t)`; no CSS transitions, rAF, Math.random (use a seeded `hash(n)`).

## 1. Brief → structure
- Comedy/ad structure that works: 2–3 "problem" scenes (label each with a kicker like `MASALAH 01`) → calm beat ("Tenang.") → brand reveal → how-it-works (phone UI) → service/payoff gag → end card with CTA.
- 9:16, 1080×1920, 30fps, ~20–30s. Something new on screen every 2–4s. Hook in first 1s.
- Keep key text in the band y 150–1500 (bottom is covered by reels UI).
- Characters are always generic/fictional; never draw a recognizable real person, party emblem or brand.

## 2. Design tokens (swap per brand, keep the structure)
```
NAVY #141235  NAVY2 #23205A  NAVY3 #34307A   (deep background family)
OUT  #17132E  (outline – deep violet-navy, never pure black)
CREAM #F7EEDB (paper / light text)
BRAND #FFD21F  BRAND2 #F2A516 (accent + its shade)
RED #FF3B30  RED2 #B81F2A (impact, alerts, extrusion color)
SKIN #EDB08A  SKIN2 #C98463
```
Rule: dark scenes in the navy family, one calm light scene (cream), brand color reserved for headlines, logo, buttons, light sources. Red only for impact/emphasis/extrusion.

Fonts: one condensed display (Anton, uppercase, line-height .9) + one UI sans (Inter 800–900). Google Fonts is usually blocked in the sandbox → `npm i @fontsource/anton` and load the woff2 with @font-face; wait on `document.fonts.load('100px Anton')` before rendering.

## 3. Making flat art look rich (the core techniques)
1. **Core-shadow shading on every shape** (light from top-left). Helper:
```js
function sh(shape, fill, shade, ox=-16, oy=-14, sw=6, stroke=OUT){
  const id='c'+(UID++);
  return `<clipPath id="${id}">${shape}</clipPath><g clip-path="url(#${id})"><g fill="${shade}">${shape}</g><g fill="${fill}" transform="translate(${ox} ${oy})">${shape}</g></g><g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">${shape}</g>`;
}
```
   `shape` is a bare SVG element string with no fill. Use for bodies, heads, furniture, doors, boxes.
2. **Motivated lighting per scene**: radial/linear gradient shapes with `mix-blend-mode:screen` (lamp pool, TV flicker, spotlight cone, light wedge on the floor from an opening door, sun bloom). A `soft-light` brand-colored rect fades in when a light source turns on. Red `multiply` flash on shock moments.
3. **Depth**: blurred foreground silhouette (`filter:blur(7px)`) that parallaxes faster than the camera; wallpaper stripes/floor planks at low opacity.
4. **Global texture**: full-frame grain PNG (512px seeded noise) with `mix-blend-mode:overlay`, opacity ~.4, re-positioned by seeded hash each frame (15fps); plus a vignette radial-gradient overlay.
5. **Typography as graphics**:
   - Stacked hard extrusion: `text-shadow` built from 1..n px offsets in RED2 + one long soft drop shadow.
   - Mask-rise reveal: line inside `overflow:hidden` wrapper, translateY 105%→0 with a no-overshoot spring. ALWAYS also set opacity 0 before start (otherwise extrusion/descenders leak through the padding as dashes).
   - Tape strip (zig-zag clip-path polygon, rotated -4°, scaleX in from left) for the punch word.
   - Kicker label: small caps Inter, wide tracking, with a short bar before it.
   - Outline numerals (`-webkit-text-stroke`, transparent fill) for step numbers.
   - Rubber stamp: double red border, rotated -11°, slams from scale 2.4→1 with shake.
6. **Comic UI**: speech bubbles in cream with OUT border + hard offset shadow in RED; buttons with a bottom hard shadow that compresses on press; phone mockups with dynamic island, hard brand-color offset shadow, or CSS 3D tilt (perspective + rotateX/Y drifting) with a moving glass sheen.
7. **Brand system**: circular badge logo (icon on navy disc, brand ring, rotating textPath slogan) + rotating sunburst (alternating navy wedges) behind reveals and end card. Wordmark extruded; secondary word in a pill with hard shadow.
8. **Impact moment kit**: halftone dot pattern (SVG pattern, radial mask) + radial speed lines replacing the background for ~0.6s, starburst with stacked-text 3D "PLAK!", 1-frame white flash then 2 frames `filter:invert(1)` on the stage, camera zoom punch + decaying shake, object knocked off on a ballistic arc `x=v*t, y=-u*t+g*t²`, dizzy spirals + orbiting stars, slap mark.

## 4. Motion & camera
- Springs only (see spring-motion table). Text: k170 d26–28 (no overshoot). UI pops: k300–500 d20–24. Heavy logos: k90 d14–16. Gag pop-ups: k300 d11 (boing).
- Camera per scene: slow push-in (scale +0.02/s) + snap zoom on the beat of the event; shake = decaying sinusoid from a start time (pure function).
- Idle life: breathing, swaying, mouth flap via |sin|, dust motes drifting in spotlight, marquee outline-text rows scrolling behind (opacity ~.1).

## 5. Posterize time (stepped 8fps + heavy noise)
Pick 2–3 dramatic/character scenes; leave UI, reveal and end card smooth for contrast.
```js
const POSTER=[[0,3],[6,11.5],[20,22.75]], PFPS=8;
const P = POSTER.some(([a,b])=>Treal>=a&&Treal<b);
const T = P ? Math.floor(Treal*PFPS+1e-6)/PFPS : Treal;   // drive scene logic with T
// in poster windows: grain opacity .85, scale 1.6, re-seeded per poster frame;
// line boil: scene el translate ±3.5px + rotate ±0.17deg from hash(frame);
// stage filter contrast(1.12) saturate(1.1)
```
Keep transitions, flashes and audio-sync checks on real time. Put event times (door opens, hit) on multiples of 1/8s so they land on a stepped frame; a big move can be shown as 1–2 key poses (e.g. hand off-screen → mid-swing pose → impact) instead of a tween.

## 6. Graphic transitions (never plain cuts between all scenes)
- **Double diagonal slash**: two oversized rotated panels (brand + navy, or red + OUT) sweep across; cut the scene at full cover. Position = -W + W*S(t-(tc-.28)) + W*S(t-tc).
- **Shutter bars**: 6 vertical bars alternating cream/brand drop with 25ms stagger.
- **Iris**: next scene `clip-path: circle(R at x y)` growing from the gag object.
- **Hard cut + record scratch** into the calm scene; **flash** into the reveal.

## 7. Sound (synthesized, numpy)
120 BPM groove (kick, clap 2&4, hats, bass, pluck arp), drop out for the calm beat, riser into the reveal boom. SFX on events: whooshes at every transition, door burst, shock sting, message pops, typing blips, formant mumble for gibberish speech, 1kHz BEEP with music ducked, PLAK = high-passed noise crack + pitch-dropping thump, knocks, creak, boing, stamp thud, success ding. Normalize with ffmpeg `loudnorm=I=-14:TP=-1:LRA=11`.

## 8. Pipeline & gotchas
- Project folder with index.html (CSS + empty scene containers), comp.js (builds SVG/HTML strings once, then `seek`), lib/motion.js, audio.py, render.mjs.
- ES modules need a tiny node http server in render.mjs (file:// module imports fail).
- Chromium at `/opt/pw-browsers/chromium-*/chrome-linux/chrome`; never `playwright install`.
- Contact sheet first: render one frame per beat (out of order = seek-safety check), tile with ffmpeg, LOOK, fix the worst 3 issues, repeat. Typical bugs: text leaking before its reveal, label crossfades overlapping, elements visible at scale 0 (gray discs), headline overflowing right edge, impact burst overlapping the next headline.
- Long renders: run in background with `setsid nohup`, and wait by checking file mtime or a log, NOT `pgrep -f name` (it matches the waiting shell itself).
- Heavy grain makes huge files (CRF16 ≈ 140MB for 26s). Keep the CRF16 master; deliver a 2-pass ~8 Mbps encode (`-b:v 8000k -maxrate 12000k -bufsize 16000k`) to stay under the 30MB chat upload limit.

## 9. Delivery note to the user
List any copy/labels you invented (UI names, gag text) so they can change them, and offer voice-over as an optional extra.