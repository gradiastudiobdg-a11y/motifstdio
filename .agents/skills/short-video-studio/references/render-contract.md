# Local motion and render contract

Use this reference when implementing scene motion or diagnosing a preview/export mismatch. Current production requires real Flow footage in every scene, 9:16 output, and motion overlays after footage generation. Check current `studio/public/`, automation code, and server before choosing function names or modifying JSON.

## One time value determines a frame

Preview and export must draw through the same renderer. A frame should depend on project JSON, loaded assets, dimensions, and a requested absolute time. The preview may use a playback clock to request frames, but the drawing function must not integrate state from previous frames.

- Compute the active scene from cumulative scene durations and use local scene time.
- Reset or assign all visual properties on every draw. A property hidden at one time must not remain hidden after seeking backward.
- Use seeded/index-derived values for grain, particles, or line boil. Do not use render-time randomness, the wall clock, mouse position, or network responses for visual state.
- Quantize stepped effects from the requested time. Keep editorial events on the real timeline rather than quantizing the whole project unintentionally.
- Load fonts and media before recording begins. Seek video to `trimStart + localTime`, wait for the decoded frame, then draw it. A video whose current image comes from real-time playback is not a deterministic export source.

The underlying ideas are shared by [Remotion markup guidance](https://github.com/remotion-dev/skills/blob/main/skills/remotion-markup/SKILL.md) and [HyperFrames determinism guidance](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-core/references/determinism-rules.md). This app implements its own canvas path; do not introduce those runtimes merely to match their examples.

## Springs and timing

Evaluate a damped spring analytically at elapsed time for weighted object motion. Higher damping reduces visible oscillation; adjust mass/stiffness with the scale of the object. Keep a readable final hold. Use a bounded smooth ramp for alpha and masking so overshoot does not produce invalid opacity or negative dimensions. [Remotion spring reference](https://www.remotion.dev/docs/spring).

A scene's beat times should be data, reused by text, graphic accents, and any sound cues. Avoid several overlapping controllers for the same property. Transitions should have a clear ownership rule: a scene can draw its handoff within its time window without changing the JSON duration behind the user's back.

## Layout

Design in a 9:16 logical frame and fit the imported portrait footage deliberately. Fit the longest actual headline and supporting copy using the loaded font, and reserve space for the maximum animated scale, not only its resting size. Older multi-aspect preview capabilities do not change the production contract.

Safe margins are configurable editing guides. Platform chrome changes, so a local guide should not be presented as the exact current YouTube/TikTok boundary. Keep important copy away from the bottom and right-edge overlay areas, then inspect the intended posting context.

## Export path

The local finish renders deterministic overlay frames against validated Flow footage and invokes FFmpeg to produce MP4 under the configured `.studio/` data area. The editor also supports browser-captured preview/export frames. Check the current automation implementation for its headless renderer and output paths. Do not label a preview, script, queued job, or generated text-only draft as a completed production video.

Narration and music are optional uploaded audio assets referenced by `voiceoverAssetId` and `musicAssetId`. The finish uses the implementation's gain/normalization behavior; inspect the actual file before claiming measured loudness or successful ducking. A target such as -14 LUFS/-1 dBTP is an editorial setting, not proof of the final measurement.

The current implementation caps duration, frame rate, dimensions, and scene count to keep local capture manageable. Preview at lower resolution when checking rhythm; use the intended final dimensions only for the final export after the sample frames look correct.

## Practical verification

1. Seek to the hook, a transition midpoint, an impact at peak scale, and the final frame.
2. Seek those times in a different order and compare the visible result. The same timestamp must not inherit state from a previous seek.
3. Export a short draft after changing renderer, media decoding, or mixing behavior. Inspect the encoded file, including its first/last frames and audible timing.
4. For the requested final, verify MP4 exists, video dimensions/fps/duration match the intended settings, text stays within the frame, and supplied audio is present and intelligible.

Use available local FFmpeg/ffprobe tools for file metadata checks. Keep explicit local source/output paths and do not overwrite a user's source asset during a transcode.

## Original pop reference adaptation

The supplied pop skill is useful art direction, but its `/opt/pw-browsers/`, Linux background-process examples, and upload-size assumptions are historical environment notes. This Windows project uses its current local server and export controls. Preserve the original file for provenance; make platform-specific choices from the actual environment.
