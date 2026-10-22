# Motion sources and integration notes

Research date: **19 October 2026, Asia/Jakarta**. These are sources studied for a project-specific synthesis, not a claim that all skills shown in the screenshot were found or installed. Upstream `main` links can change after this date. No third-party installer or fetched executable was run as part of this research.

## Verified public sources

| Source | What was checked | How it informs this project |
| --- | --- | --- |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | Official Remotion organization repository; README lists create, markup, studio, render and other skills | Separate composition authoring, preview, and final export; preserve editability |
| [remotion-markup](https://github.com/remotion-dev/skills/blob/main/skills/remotion-markup/SKILL.md) | Frame-driven animation, composition timing, editable scene structure | Requested time determines the picture; scene timing stays data-driven |
| [remotion-create](https://github.com/remotion-dev/skills/blob/main/skills/remotion-create/SKILL.md) | New-project/composition workflow | Inspect an existing project before scaffolding over it |
| [remotion-render](https://github.com/remotion-dev/skills/blob/main/skills/remotion-render/SKILL.md) | Video/still export guidance | Verify representative stills and the real exported file |
| [Remotion spring API](https://www.remotion.dev/docs/spring) | Time/frame input and spring parameters | Weighted physical motion with controlled settling |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Official HeyGen repository, HTML-to-video project and skill tree | Seekable scenes and a clear plan → build → verify → render loop |
| [hyperframes-core](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-core/SKILL.md) and [determinism rules](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-core/references/determinism-rules.md) | Composition contract and reproducible frame sampling | No unseeded visual randomness, clock-dependent motion, or render-time remote assets |
| [hyperframes-animation](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/SKILL.md) and [rule index](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/rules-index.md) | Motion vocabulary and composable scene recipes | A few complementary moves per scene rather than uncontrolled effect stacking |
| [kinetic-beat-slam](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/rules/kinetic-beat-slam.md) | Shared beats and distinct typography entrances | Related visual accents share timing; meaningful changes can use different motion axes |
| [hyperframes-creative](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-creative/SKILL.md) | Creative direction, style tokens, narration and beat planning | Choose the visual grammar before building motion |

The studio uses original local Node/canvas code and FFmpeg for overlays/finishing. The current production route requires Flow footage before those overlays and uses9:16 only. Remotion and HyperFrames are studied expansion routes, not required installed engines. The combined skill is [short-video-studio](../.agents/skills/short-video-studio/SKILL.md).

## Screenshot names and supplied references

| Screenshot/reference | Status |
| --- | --- |
| `pop-cinematic-motion` | The user supplied [the original file](../pop-cinematic-motion/SKILL.md). Preserved unchanged. Public GitHub origin was not verified. Its art direction informs the Cinematic Pop option. |
| `spring-motion` | Exact public skill origin not verified. The new project's spring/render principles use the supplied reference and primary Remotion/HyperFrames material; no repository is presented as the exact screenshot source. |
| `remotion-markup`, `remotion-create`, `remotion-render` | Exact public names are present in official `remotion-dev/skills`. |
| `hyperframes`, `hyperframes-core`, `hyperframes-animation` | Matching public skills are present in official `heygen-com/hyperframes`. |
| `motion-graphics` and other partly visible labels | HyperFrames has a public [motion-graphics workflow](https://github.com/heygen-com/hyperframes/blob/main/skills/motion-graphics/SKILL.md). Other partially legible labels were not assumed to identify a particular public file. |
| Pasted “STICKMAN ANIMATION VIDEO ENGINE” | Supplied as a workflow reference. Kept its useful scene/script/prompt/consistency separation. White backgrounds, stickman-only styling, four-second clips, and mandatory `NEXT` pauses were generalized because the user requested flexible motivational motion graphics. |

A similarly named public `motion-studio` repository was found, but its skill labels did not verify the screenshot's `spring-motion`/`pop-cinematic-motion` origin. Its code and prompts were not imported.

## License observations

- HyperFrames' top-level [LICENSE](https://github.com/heygen-com/hyperframes/blob/main/LICENSE) identifies **Apache-2.0**. This project links and synthesizes ideas rather than vendoring its implementation. If upstream files are imported later, retain the relevant license, notices, attribution, and changes records.
- The inspected `remotion-dev/skills` root did not expose a top-level license file, and its [package metadata](https://github.com/remotion-dev/skills/blob/main/package.json) did not declare a license field. A license for that standalone skills repository was therefore **not confirmed**. No skill text was copied wholesale. Remotion runtime licensing is a separate matter described in its [official license pages](https://www.remotion.dev/docs/license); evaluate the current terms if that engine is added.
- The user-supplied pop skill has no explicit license notice in the provided file. It remains in the user's project and is credited here as a supplied reference.
- This ledger does not grant rights to third-party footage, music, fonts, or generated references. Record their actual source/license when adding assets. The locally detected FFmpeg executable and any fonts retain their own licenses; record the selected binary/build if packaging the application for distribution.

## Flow references

Google's primary [creation guide](https://support.google.com/flow/answer/16353334?hl=en) describes frames/references; its [model support matrix](https://support.google.com/flow/answer/16352836?hl=en) distinguishes generation lengths and feature support. The original MV3 Brave bridge now drives normal visible Flow controls with per-job budgets and durable submission intents. It has local fixture coverage; signed-in UI, paid generation, and real result transfer remain unverified. Details and UI-adapter primary sources: [AUTOPILOT.md](AUTOPILOT.md).

## What was deliberately adapted

The skill uses useful creative decisions rather than mandatory chat stops. It supports varied art direction, separates narration from visual generation, preserves editable JSON, and verifies an actual MP4. The user's later production contract requires real Flow footage for every scene, native motion afterward,9:16, one Brave account, and automatic sequencing. Linux paths in the supplied skill were not treated as this Windows environment's render contract.
