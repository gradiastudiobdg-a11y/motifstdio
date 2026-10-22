# Example media

The original 30-second, 120 BPM music bed was synthesized by `studio/scripts/create-demo.mjs`. It uses no samples or recorded voice. The WAV is stored in this computer's local studio asset directory and referenced by `project.json`; the example folder does not duplicate that file.

Music asset ID: `dbf2f224-f1b5-4864-b65a-af5b407a09dd`.

Open the saved **Mulai dari Dua Menit** project in the studio to edit or export. The provided voiceover is a text script; this demo does not contain a spoken recording. To rebuild media on another computer, start its studio and run `node scripts/create-demo.mjs`. That command intentionally refreshes only the stable demo project `demo-mulai-dua-menit`.
