---
name: short-video-studio
description: Build and run this project's automatic Kai Makes Do home-DIY short-video studio with Codex planning, real Google Flow footage through one Brave account, motion overlays after generation, and FFmpeg finishing. All production videos use 9:16.
---

# Short Video Studio

## Current creative direction — adopted 2026-10-21

The user replaced motivational MOTIF with Kai Makes Do. Read `.agents/brand-context.md` and `output/kai-makes-do-brand-kit/kai-makes-do/brand-book.md`. For new projects use style `kai`: silent realistic home DIY, sparse English text, tactile Foley and room tone, optional quiet instrumental music. No dialogue, voiceover or karaoke captions. No AI VISUAL label or episode/step counters in frames. Use material → plausible assembly → useful result shown in use. Keep Kai’s face, sage tee, ordinary room, object state and left daylight consistent. DM Sans with paper/ink/sage/honey/clay. Preserve old motivational jobs with their existing renderer and narration gate.

The existing Google Flow MCP connection through one Brave account is the production transport. The old bridge worker is legacy. Do not change login transport as part of style work. Paid generation waits until the user is ready for the next video.

The sections below describe the legacy motivational workflow where they conflict with the Kai direction above. For Kai, replace narration/caption requirements with actual audible sound design; still studies remain local references, never Flow footage. Procedural cue positions are estimated, not claimed audio alignment.

The production contract is **Codex/brief → real Flow footage → local brand motion → sound design → MP4**, automatically through the local job queue. Every production video uses 9:16. Flow footage is required for every scene; typography-only placeholders are not a completed production video.

## Work from the current implementation

- Read existing project JSON and current `studio/public/planner.mjs` before replacing a plan. Preserve scene IDs, imported media, and user revisions.
- Read the root README for startup. The Node studio runs on loopback port 4317. Read `studio/flow-bridge/` and [AUTOPILOT.md](../../../docs/AUTOPILOT.md) when pairing or diagnosing the Brave worker.
- Use one normal signed-in Google Flow account in Brave. The user can log in later. Never rotate accounts, copy cookies/tokens, bypass CAPTCHA, or substitute an undocumented generation API.
- The bridge pair token authenticates only the local studio and is entered once in the extension popup. Do not put Google credentials or account email into source, project JSON, or logs.
- Automatic production uses the installed authenticated Codex CLI through `studio/automation/codex-plan.mjs`, with structured JSON output and a read-only sandbox. The advanced editor's local planner remains an offline starter. Report CLI authentication, actual planning calls, and model output separately; never claim a model call occurred when only an offline template or readiness probe ran.

## Produce the story

Default to an autonomous draft. Infer reasonable choices and continue authorized work; do not inherit mandatory NEXT pauses from the reference stickman prompt. A requested guided session may pause at meaningful creative choices.

Start from one concrete obstacle and a small practical takeaway. Write a clear hook, recognizable struggle, reframe, and achievable action. Avoid invented statistics/quotes and guaranteed outcomes. Split narration into beats with one visual job each. Exact editorial scene duration is separate from supported generation length; excess footage is trimmed later.

The current styles are Kinetic Type (`kinetic`), Cinematic Pop (`cinematic`), Editorial Calm (`editorial`), and Stickman Minimal (`stickman`). They guide footage art direction and later overlays; none removes the footage requirement. Read [creative direction](references/creative-direction.md) for story/look work. White backgrounds and stickman characters remain optional style choices.

## Generate through the worker

1. Store the editable brief, narration, visual/motion description, generation prompt, and publishing copy in project data.
2. Give the job an explicit maximum generation count and credit budget, with paid generation enabled once for that job. Reuse this authorization within those limits.
3. Queue one scene at a time to the paired Brave extension. Verify visible video mode, 9:16, supported duration/model, exactly one output, and an explicit generation cost.
4. Persist the intent locally and reserve the observed cost with the server before clicking Generate. A timeout or restart may recover that result; it must never cause another paid click for the same intent.
5. Associate a new portrait video with the prompt, download its bytes from allowed Flow/media hosts, and return it with scene provenance.
6. Only after required footage exists, add native motion, readable typography, captions, narration/music, and transitions, then finish with FFmpeg.

Read [Flow handoff](references/flow-handoff.md) for prompts and result requirements. Prompts remain visual-only; narration and exact text belong to local finishing. Maintain a consistent identity/style lock.

## Handle external blocks candidly

The versioned semantic adapter is tested on local DOM fixtures. It has not been verified against the user's signed-in Flow interface. Public Flow research exposed a sign-in gate. Login, CAPTCHA, changed/ambiguous controls, unknown cost, inaccessible media, or unlinked results require actionable status without another paid attempt.

Do not report live generation, automatic transfer, or complete end-to-end success until observed in a real authorized job. Continue independent local work while login is pending. After login, inspect current UI, update selectors if required, and validate one budgeted job before claiming live integration works.

## Keep overlays editable and renderable

Read [render contract](references/render-contract.md). Frame state depends on project data, loaded footage, dimensions, and absolute time. The same timestamp must match after forward/backward/out-of-order seeks. Use seeded texture and analytic springs where useful, clamp opacity/masks, and share beat times between overlays.

Fit real headlines at peak scale and verify the 9:16 source crop. Keep timing, trim, headline, narration, asset ID, and transition editable in JSON. Motion should explain the beat rather than repeat one entrance on every line.

## Finish and deliver

Inspect representative frames and the actual mixed MP4: dimensions, duration, source crop, text/caption fit, and audible timing. Proportional word timing is an estimate, not audio alignment. A script is not a generated voice file.

Deliver the MP4, editable project, and publishing material when complete. If setup prevents live generation, state what is prepared and what remains unverified. Sources: [MOTION-SOURCES.md](../../../docs/MOTION-SOURCES.md). Preserve the original supplied [pop skill](../../../pop-cinematic-motion/SKILL.md).
