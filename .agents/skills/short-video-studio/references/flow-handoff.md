# Automated Flow footage contract

Real Flow footage is required before motion finishing. Every production scene uses 9:16 and one output per submission. The Brave bridge drives normal visible Flow controls, without an undocumented generation API.

## Keep prompts visual

Store keyframe direction, animation prompt, narrator script, and timeline notes separately. Narration can appear in surrounding editorial notes but must stay outside the submitted generation prompt. Add reliable typography, captions, voice, music, and exact timing after footage generation.

Example visual prompt:

> Create a 9:16 video using the supported length selected in Flow. Maintain the same subject proportions, clothing, colors, materials, and lighting. Start with the subject facing one low step. During the first half, the subject steps up with visible effort while the step stays fixed. During the second half, the subject settles upright. Use a gentle camera push that settles before the final pose. Keep the upper third clear for later typography. Keep the subject's mouth at rest and the frame free of generated lettering.

Adapt the metaphor. For abstract footage, identity means stable geometry, materials, arrangement, and palette. Prefer one main transformation when continuity is fragile.

## Model and reference support

Choose a duration/mode supported by the active model. Google's [creation guide](https://support.google.com/flow/answer/16353334?hl=en) covers frames/references; the [support matrix](https://support.google.com/flow/answer/16352836?hl=en) distinguishes model durations. Some reference modes observed 2026-10-19 require eight seconds; generate eight and trim when using that route.

The initial bridge handles a text-video composer with visible supported controls. It does not yet automate reference ingredients or start/end-frame upload. Preserve style in prompts; add and verify reference UI support before promising exact recurring identity from an uploaded image automatically. Never silently drop an explicit reference requirement.

## Submission and result

The job grants paid generation once within count/credit limits. Before clicking Generate, verify the prompt persisted, the controls still show video/9:16/requested length/one output, and the explicit generation cost. Account balance is not the price. Persist an intent and baseline video list, then reserve that intent and cost with the server.

Only one scene is in flight. Restart means recover the existing result. Missing/inconsistent receipt state blocks rather than generating again.

A result must be new against the baseline, appear in a card containing the current prompt excerpt, and expose portrait metadata. Its HTTPS URL must belong to allowed Flow/Googleusercontent hosts and return supported video bytes. Ambiguous matches, blob-only sources, other hosts, failed fetches, or timeout need review rather than another paid attempt. The server checks returned media/provenance before continuing.

The unpacked extension is in `studio/flow-bridge/`. Installation/pairing happens once; the user logs in normally in Brave. Signed-in operation, generation, and actual result download remain unverified. See [AUTOPILOT.md](../../../../docs/AUTOPILOT.md).
