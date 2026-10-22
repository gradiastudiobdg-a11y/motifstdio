# Forward test: istirahat, 30 detik

Request: “Bikin short 30 detik tentang istirahat, editorial calm, Flow footage plus captions”.

The unified skill was read with its creative-direction, Flow-handoff, and render-contract references. Assumptions: Indonesian, vertical 9:16, 30 fps, warm paper editorial design, no recurring human character, four 8-second source clips. The edit uses 8 + 8 + 8 + 6 seconds; the last source is trimmed by two seconds.

The story reframes rest without demanding extra productivity: recognize guilt → allow space → put down the phone and take a simple break → give permission to rest. The 30-second project has 59 narration words and editable captions.

1. Import project.json using the studio's JSON import.
2. Review the four scene headlines and narration.
3. Generate the four image/animation pairs from flow-pack.md in a supported Flow model/mode. Approve the first frame as the recurring paper/material/palette reference.
4. Import downloaded clips into scene-01 through scene-04. Keep trimStart at 0, with final scene at 6 seconds.
5. Record/import voiceover.txt separately if desired; captions.srt contains estimated timing based on scene word proportions.
6. Preview crop, captions, pacing, and final holds; export MP4 locally.

Files: project.json, flow-pack.md, production.md, voiceover.txt, captions.srt, codex-brief.txt, validation.json. Regenerate with node studio/examples/rest-forward-test/generate.mjs.

Validation: 13 checks passed, including both project validators, exact timing, voiceover separation, palette/reference locks, and final subtitle endpoint. No external request or paid generation was made. Flow footage, spoken audio, and a finished MP4 are not claimed to exist in this example.
