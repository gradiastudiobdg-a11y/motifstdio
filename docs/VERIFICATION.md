# Verifikasi MOTIF

## Produksi Flow live selesai — 19 Oktober 2026

Job `7cb9d178-b3ff-4ef4-a558-ce560151039c` selesai melalui Google Flow MCP di Brave. Dua generasi Omni 1.1 Flash, 10 detik, 720×1280, x1, harga UI 15 kredit per klip, cocok dengan prompt dan media ID masing-masing. Saldo sesi 830 → 800. Total percobaan 4 termasuk dua percobaan historis; ledger mempertahankan cadangan lama 15 kredit, total reserved 45, batas 100.

Sumber diedit menjadi dua scene 15 detik, dengan judul dan aksen motion, narasi Ardi Indonesia nyata, timing kata TTS, caption terbakar, serta musik orisinal yang diducking. Output tepat 30 detik, 900 frame, 1080×1920, 30 fps, H.264/AAC. Decode penuh berhasil; voice mean −18 dB, campuran −20 dB dan peak −5,5 dB. Frame representatif diperiksa untuk crop, aksi, judul dan caption. `testFixture:false`. Endpoint unduh studio mengembalikan 200/video-mp4 dengan 15.443.737 byte.

Hasil tersedia di `exports/mulai-sebelum-mood-datang/`: video.mp4, cover.jpg, project.json, subtitle.srt, caption.txt, production.json dan validation.json. JSON membutuhkan media dalam asset store MOTIF untuk penyuntingan. Catatan fixture di bawah adalah riwayat pemeriksaan awal dan tidak lagi menggambarkan status tes Flow terbaru.

Pemeriksaan pada 19 Oktober 2026 di Windows. Hasil uji tersimpan di folder runtime yang diabaikan Git, bukan antrean produksi pengguna.

Suite gabungan terakhir: **38 tes lulus, 0 gagal, 0 dilewati**, termasuk DOM fixture Brave dan tes piksel pada MP4 yang membuktikan footage berubah antarframe. Tes ini juga menguji pemulihan receipt serta revisi yang menunggu checkpoint sebelum melanjutkan.

| Komponen | Hasil yang diamati |
| --- | --- |
| Codex CLI | Login terverifikasi dan panggilan model nyata menghasilkan rencana baru berjudul **Jeda Sebelum Tuntas**, 8 detik, 9:16, satu scene, serta materi publikasi. Tidak memakai fallback template. |
| Narasi online | edge-tts 7.3.1, Ardi Indonesia, WAV 8 detik dengan 12 word boundaries. RMS 0.1128; bukan suara sintetis berupa nada uji. |
| Komposit dengan narasi nyata | MP4 H.264/AAC 1080×1920, 30 fps, 240 frame. Narasi, caption bertiming, musik orisinal, dan overlay digabung dengan **footage fixture lokal**. Decode penuh berhasil; level narasi sendiri −19 dB mean, hasil campuran −19.5 dB mean. Frame representatif diperiksa. Ini bukan produksi Flow. |
| Bridge | DOM fixture di Brave headless dengan profil tes terpisah; budget, receipt, recovery, input terbatas, dan interaksi background dengan HTTP server lokal diuji. Tidak memasang extension di profil pengguna. |
| Flow langsung | **Belum diuji.** Menunggu pemasangan/pairing bridge, login pengguna, dan satu job dengan batas kredit yang jelas. |

Perintah dasar: `cd studio` lalu `npm test`. Tes DOM memerlukan `MOTIF_PLAYWRIGHT_MODULE` dan `MOTIF_BROWSER_PATH`, seperti pada [AUTOPILOT.md](AUTOPILOT.md). Tes tidak mengonsumsi kredit Flow.

Uji online terpisah: `node studio/automation/smoke.mjs --check --voice --codex`. Uji komposit lokal setelah narasi tersedia: dari folder `studio`, `node automation/finish-smoke.mjs`. Keduanya menulis ke `studio/.studio/automation-smoke/` dan tidak membuat job Flow.

Di sesi Codex, sandbox menolak akses ke sebagian file Python hasil instalasi. Uji online dijalankan di luar sandbox pada host pengguna. Launcher Windows menjalankan aplikasi secara normal; setup berikutnya menaruh direktori sementara/cache pip di dalam workspace.

Sebelum mengklaim produksi Flow end-to-end: periksa UI akun yang login, pastikan biaya dan pengaturan terbaca, amati satu generasi resmi per scene beserta transfernya, lalu periksa video final footage + narasi + motion. Fixture tidak menggantikan langkah ini.
