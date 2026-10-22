# Local FFmpeg executable

`ffmpeg.exe` is a local runtime dependency used by this workstation. It is ignored by Git and is not part of the studio source distribution.

- Observed executable: `studio/tools/ffmpeg.exe`, 76,434,432 bytes.
- Observed version: `ffmpeg version 4.4-essentials_build-www.gyan.dev`, GCC 10.2.0; version output attributes copyright through 2021.
- Source on this workstation: an existing portable executable from a local application installation. The setup script copied that existing file into the project; it did not download software or change a system installation. The workstation-specific original location is retained only in local ignored notes.
- SHA-256: `8D7E6CF86BA7E0462643D3CC3745455ADCA6C9AF5795574D67D125AE238296B2`.
- Configuration reports `--enable-gpl --enable-version3` and includes `libx264`/AAC support. GPL redistribution obligations apply if someone independently chooses to redistribute that binary. This source project does not grant a separate license to FFmpeg or its bundled libraries.
- Verification: executable version check plus actual H.264/AAC MP4 encoding and successful decoding in `tests/server.test.mjs`.

For another workstation, choose a build linked from [FFmpeg's official download page](https://ffmpeg.org/download.html), follow that build's license/source instructions, and install it locally:

```powershell
cd studio
node scripts/setup-ffmpeg.mjs --from "C:/path/to/ffmpeg.exe"
npm start
```

Alternatively set `FFMPEG_PATH` before starting the server. Resolution order is an explicitly configured path, `FFMPEG_PATH`, the local `studio/tools/ffmpeg.exe` (or `ffmpeg` on other operating systems), then the executable on `PATH`. Restart the server after replacing FFmpeg. The project can use a newer compatible build without changing the browser editor.
