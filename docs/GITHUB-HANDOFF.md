# MOTIF / Kai Makes Do — GitHub handoff

Prepared 22 October 2026. The owner supplied [gradiastudiobdg-a11y/motifstdio](https://github.com/gradiastudiobdg-a11y/motifstdio) as the destination. Local branch: `main`. This document records the source handoff; use GitHub's branch history to confirm remote publication.

## What the owner needs

1. A GitHub account signed in through the browser.
2. A destination repository URL. Suggested initial name: `motif-video-studio`, private. If creating it on GitHub first, leave README, license and gitignore initialization off because this project already contains files.
3. Decide whether the next goal is personal production on this workstation or an online service for other people. Those need different deployment work.

Git and Node are present on this workstation. GitHub CLI (`gh`) was not found on PATH; Git Credential Manager is bundled with Git and can handle GitHub authorization. The repository-local author uses the supplied GitHub username and its `users.noreply.github.com` address. No password, Google session or pairing token belongs in the repository.

## Repository contents

Keep application source, tests, package manifests/lockfile, local setup scripts, recorded vendor patches, documentation, fonts/licenses and the adopted Kai brand kit.

The root `.gitignore` excludes browser/runtime folders, `.env` files, production exports and receipts, generated video/audio, installed dependencies, local FFmpeg binaries and exploratory output outside the adopted kit. Ignoring a file does not delete it. Existing episode files stay on this workstation and need a separate media backup.

Do a staged-file review and secret scan before the first commit/push. If any excluded file has already been tracked in a later repository, `.gitignore` alone does not remove it from history.

## Production architecture today

The server binds to `127.0.0.1:4317`. It uses local files, FFmpeg/native canvas, an authenticated Codex CLI, and the existing one-account Brave/Google Flow worker. Login and verification remain interactive when the session needs them.

Putting source on GitHub preserves/version-controls code. GitHub Pages serves static sites and cannot run this Node/FFmpeg/Brave production worker. Do not expose the current local server or browser control endpoint directly to the internet.

For initial personal use, keep the complete worker on the owner's computer and use GitHub for source control. No hosting or domain purchase is needed for that arrangement.

For a later online service, plan authentication/authorization, a durable job queue, media/object storage, per-user budgets, HTTPS and a separately secured rendering/Flow worker. That deployment has not been implemented or verified by this handoff.

## Reproducibility work before a release

- Verify a clean clone on a fresh workstation. Current live production on this workstation is not evidence of a clean installation.
- Automate the pinned Flow connector clones/builds and recorded patches. Their working installs intentionally live under ignored `.studio/` and will not arrive through GitHub.
- Verify runtime versions and make the current Brave executable default configurable for other machines.
- Install local FFmpeg separately using the documented setup script or `FFMPEG_PATH`; see `studio/tools/FFMPEG-PROVENANCE.md`.
- Install native canvas through `studio/automation` and verify Codex login separately.
- Run `npm test` from `studio/`. Local fixtures are not live Flow tests. Paid generation requires a separately authorized budget.
- Keep personal production ledgers, browser sessions and original output outside source control. No account rotation is included.
- Choose a project license deliberately before any public release; retain upstream notices. No new license was selected here.

The manual episode pilot scripts and the web automatic pipeline are separate paths. A completed pilot MP4 does not by itself verify that the same image-first editing choices run unattended from the web UI.

## Local source handoff checks

`npm test` on 22 October 2026: 68 tests, 67 passed, 1 optional legacy DOM test skipped, 0 failed. This includes local FFmpeg encoding/decoding fixtures, not a new paid Flow generation or a fresh-clone test. The staged-file audit checks excluded runtime/media paths, file sizes and common secret patterns; generated sessions and the audit report stay under ignored `.studio/`.

## References

- [Import local code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [GitHub Pages scope](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
