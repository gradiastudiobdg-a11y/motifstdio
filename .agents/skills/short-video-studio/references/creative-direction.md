# Creative direction for motivational motion

Use this reference for new scripts, scene design, and deliberate restyling. It is an original house workflow informed by the sources in [the ledger](../../../../docs/MOTION-SOURCES.md), not a copy of a third-party skill.

## Make the takeaway concrete

Prefer a recognizable behavior over broad inspiration. “Put the phone outside your room for one focused block” has a visual cause and effect; “be your best self” needs a specific meaning before it becomes a scene.

Useful story spines include:

- **Friction → reframe → first action:** a familiar obstacle becomes manageable through one small change.
- **False belief → counterexample → experiment:** challenge a belief without shaming the viewer.
- **Before → repeated effort → visible progress:** a concrete object changes gradually, making repetition visible.
- **Question → visual answer → invitation:** the motion itself explains the answer.

Keep promises proportionate. A metaphor is not scientific evidence. Label invented examples as examples, and verify any factual statistic, attributed quote, medical, financial, or legal claim before using it.

## Plan a beat, not a slide

Each scene needs a subject, an action, and a point of emphasis. A useful planning row is:

| Time | Narration | Visual cause/effect | Headline | Motion | Asset |
| --- | --- | --- | --- | --- | --- |
| 0–3s | A question about waiting for motivation | A small starting block holds a much larger stack | MULAI KECIL | Close view opens to reveal the stack | Native shapes |
| 3–7s | A recognizable distraction | Competing cards crowd the subject, then clear | SATU HAL DULU | Side movement clarifies the choice | Native shapes or Flow |

Write the final timings from the selected duration and actual scene list. A generated clip can supply a short source range inside a longer or shorter editorial scene. Do not derive final duration from `ceil(duration/clipDuration)` without trimming the final beat.

The narration should be spoken aloud at the intended pace. Leave a breath after a strong line and room to read a new headline. If a voice recording runs long, revise or retime the edit before rushing it.

## Direction by preset

### Kinetic Type

Let key words become the visual object: a word rises like a step, a label separates from clutter, a progress bar fills from deliberate repetitions. Use short display phrases and a smaller supporting line. A bold accent can mark the verb or turning point. Keep ordinary body text still enough to read.

Use one shared list of beat times for related entrances and accents. A small number of complementary moves usually works: masked rise, lateral snap, scale settle, underline sweep. Change the move when the meaning changes. Do not force every word to bounce.

### Cinematic Pop

Treat frames as composed posters. Add depth with foreground/midground/background separation, motivated light, a restrained texture layer, readable silhouettes, and deliberate camera framing. Preserve the supplied pop skill's strengths: weighted motion, graphic reveals, a calm contrast beat, and an end card with a clear payoff.

Use a small palette: dark foundation, light paper/text, one main accent, and a secondary impact color used sparingly. The supplied navy/cream/yellow/red palette is an available direction, not the only allowed brand palette. Match light direction across objects; texture should enrich the scene without making export noise or hiding text.

A short stepped-time moment can emphasize effort or impact. Keep typography readability and scene handoffs smooth when that better serves the idea. Do not apply aggressive shake or flashes to every beat.

### Editorial Calm

Use spacious composition, warm or neutral contrast, slower reveals, and a small set of line/shape motifs. Let the strongest line hold. A subtle camera push, line draw, or object settling can communicate change without constant visual activity. Keep the hook specific even when the tone is quiet.

### Stickman Minimal

Use a stable character description and a clean light or paper background. Choose a simple pose, expression, and a few explanatory props. The supplied orange hoodie character, classroom duo, and explorer are optional ideas; custom characters are supported.

Repeat the character's proportions, clothing, colors, face, and outline style in each generated prompt. Avoid changing pose, identity, wardrobe, style, and environment at once. A reference image is more useful than an increasingly long textual identity description.

## Reusable visual lock

Before generating a batch, record a compact lock describing:

- Recurring subject or the deliberate absence of a character.
- Proportions, clothing/material, silhouette, and defining colors.
- Palette, type character, background family, lighting, texture, and line style.
- Framing and space reserved for editable headlines/captions.
- Identity reference filename and any object reference filenames.

Keep this lock stable while scene action and framing vary. Change the lock deliberately when the user changes direction. Match prompts to the actual visual references.

## Frame review

Review the hook, a middle beat, the strongest impact, and the end frame at mobile size. Ask whether the story is understandable without the narration, whether the headline can be read in its hold, and whether motion directs attention to the intended change. Inspect peak scale and transition overlap, not only resting poses.

References used for the synthesis: [HyperFrames creative](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-creative/SKILL.md), [kinetic beat recipe](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/rules/kinetic-beat-slam.md), and the project's supplied `pop-cinematic-motion/SKILL.md`. Observed 2026-10-19.
