# Kai Makes Do — Little Makes Studio

**Small ideas. Everyday stuff.** The user adopted Kai Makes Do as a full creative replacement for motivational MOTIF on 2026-10-21.

Silent home DIY shorts: **material → plausible assembly → useful result shown in use**. All production masters are **9:16, 1080×1920, 30 fps**, with sparse English text, tactile sound design and room tone. Music is optional. No narrator, motivational monologue or karaoke captions.

## Repository and release status

Source repository: [gradiastudiobdg-a11y/motifstdio](https://github.com/gradiastudiobdg-a11y/motifstdio).

This is the local workstation studio, verified here on Windows with Node.js 24.21.0. Browser sessions, credentials, generated episodes, job receipts, installed connector runtimes and FFmpeg binaries are deliberately excluded from Git. A new machine needs its own setup and login; clean-clone installation has not yet been verified.

The latest image-first Kai episodes were produced through the episode pilot scripts in `studio/scripts/`. Their detailed reference-image and editing decisions are not yet the same unattended workflow as the web form's ten-second-source planner below. Online multi-user deployment is also separate work. See [GitHub handoff and release checklist](docs/GITHUB-HANDOFF.md).

## Open

Double-click **Mulai Studio.cmd** and visit **http://127.0.0.1:4317**. Or run `npm start` from `studio/`. Node.js 20+, local FFmpeg and native canvas are required. `npm run setup:automation` installs adapters; `npm run setup:ffmpeg` prepares FFmpeg if missing. Kai does not require the legacy Indonesian TTS adapter.

## Automatic production

Enter a DIY idea, final duration and credit limit. Approve spending for the job with the checkbox, then click **Buat video otomatis**.

1. **Codex CLI** writes fresh shots and English publishing copy using structured JSON. No template fallback is claimed as model output.
2. **Google Flow MCP** creates actual portrait footage through one Brave account. Existing session transport is preserved. Omni 10-second sources are downloaded and trimmed to the exact duration.
3. **Kai canvas** adds sparse brand overlays: 0–2.5s opening, clean process or one short note, last 3s useful result and brand signature.
4. **Local finishing** creates audible original Foley/room-tone textures, mixes optional music, and encodes H.264/AAC. Full decoding validates duration, frame rate, dimensions and audio before completion.

Initial Foley cue positions are estimated from scene actions, not aligned to actual generated hand movements. This is recorded in the finishing report. Editable `project.soundCues` entries use `{ "time": 4.2, "kind": "paper" }`; kinds: paper, cut, pencil, tap. Inspect cue timing once footage exists.

Cost is checked live before spending. Durable credit/generation caps, uncertain-result recovery and login/CAPTCHA stops remain enforced. Never silently repeat a possibly charged click. A 30-second plan uses three 10-second clips; 45 credits at the previously observed 15/clip is an estimate, not a guaranteed price. One account; no rotation.

## Brand and motion review

Canonical kit: [Kai Makes Do](output/kai-makes-do-brand-kit/kai-makes-do/brand-book.md). Runtime identity: `studio/public/kai-brand.mjs`. The browser and MP4 share `studio/public/kai-motion.mjs` through drawFrame.

- DM Sans; IBM Plex Mono for studio metadata.
- Paper #F4EFE6, ink #29332D, sage #7D8C74, honey #E8B65E, clay #C68163.
- Same fictional Kai, faded sage tee, ordinary home table and daylight from the left.
- Header LITTLE HOME IDEAS; footer KAI MAKES DO / LITTLE MAKES.
- No AI VISUAL, episode number or step counter in video frames. Truthful AI-fiction context remains in publishing metadata.

Open **http://127.0.0.1:4317/kai-look.html** for the interactive motion study. It uses the kit concept still, not Flow video. The supplied kit HTML and opening/process/reveal PNGs have the requested label removals too.

## Flow connection

[Google Flow MCP](docs/GOOGLE-FLOW-MCP.md) uses the existing Brave session broker. To reconnect: sign in manually in normal Brave → Sambungkan ulang sesi in the studio → Connect Flow in Flow Login Bridge → after Session sent, click Sesi sudah terkirim and select the same account if asked. Never enter a password into an automated window rejected by Google. Old MOTIF Bridge/Flow Bridge workers are not needed for MCP generation.

## Editor, archives and checks

The advanced editor supports process, text and media revisions, plus draft exports. A still-backed study or draft without actual Flow footage is not a completed production.

Historical MOTIF projects, narration, videos and spending receipts are preserved in ignored `studio/.studio/`. Kai uses separate browser draft preferences; its queue view shows Kai jobs. Historical projects remain accessible through the project menu. Back up the media alongside JSON. Keep account identity/session secrets out of source, logs and screenshots.

Run **npm test** from `studio/`. Checks cover planning, budget gates, recovery, seek-safe overlays, orchestration and actual local H.264/AAC encoding. Fixtures are explicitly synthetic and rejected by the production Flow gate; these checks do not claim a live Kai generation.
