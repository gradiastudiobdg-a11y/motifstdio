# Flow-agent untuk MOTIF

Status 19 Oktober 2026: user telah memberi izin eksplisit transfer sesi Google ke runtime lokal. Satu sesi Brave tersimpan dan diagnosis live berhasil. Percobaan pertama `empty` dipulihkan setelah user mengonfirmasi tidak ada video/proses baru, saldo tetap 250, dan tidak ada aset yang cocok. Jatah percobaannya tetap dihitung; reservasi kreditnya dilepas. Percobaan kedua dengan browser terhubung ditolak Google dengan `PUBLIC_ERROR_UNUSUAL_ACTIVITY`, tanpa media ID. Saldo setelah penolakan masih 250. Proses berhenti tanpa retry; belum ada MP4 produksi. Jumlah panggilan 2/4, reservasi yang belum diselesaikan 15 kredit, debit yang teramati dari perubahan saldo 0.

User meminta integrasi [kodelyx/flow-agent](https://github.com/kodelyx/flow-agent) untuk satu akun. Source lokal dipin ke commit `7d7abdd4da1a43954e49603dc2b9214229d891c6`; SHA-256 executable Windows: `863c84a4ed1b35ccfc0fbe00aa4e3377c78599eac5dd8402dd2e7e5bd727f1f7`. Mesin Go dijelaskan di [kodelyx/flow-go](https://github.com/kodelyx/flow-go). README yang terindeks web tidak selalu cocok dengan binary yang dikirim; kemampuan diperiksa dari source lokal dan `--help`.

Worker aktif memakai build lokal dari flow-go commit `70ec73861091267dd1f57184bcf809a922bea85b`, bernama `flow-motif-windows.exe`, SHA-256 `c59d15e93df23e59078f0ebe91f9f2ade3ae460b0afecbc5b5be4f0c35c98000`. Patch yang dapat dijalankan ulang ada di `studio/scripts/patch-flow-go.mjs`: waktu attach doctor 35 detik/generate 45 detik, mode broker tanpa fallback HTTP, dan hasil JSON tetap dikembalikan saat error. Tes CLI dan recaptcha lulus setelah ekspektasi fallback disesuaikan untuk mode broker khusus MOTIF.

## Browser dan koneksi

Extension memakai API Chromium. Brave dapat memuatnya melalui `brave://extensions` → Load unpacked. Folder source: `studio/.studio/vendor/flow-agent/flow-extension`. Chrome tidak wajib, tetapi kompatibilitas dengan sesi Brave ini masih harus diuji live.

Extension ini berbeda dari MOTIF Bridge. Ia membaca sesi Google dan mengirimkannya ke listener lokal, yang menyimpannya dalam `studio/.studio/vendor/flow-agent/flow-agent/cookies/`. Jangan menyalin cookie lewat chat atau clipboard, mencetak token/identitas akun, atau menyimpan sesi dalam source. Semua runtime berada di `.studio/` yang diabaikan Git. Log file upstream diarahkan ke NUL; stdout/stderr bridge tidak diteruskan atau disimpan. Binary tetap dapat menyimpan identitas/session dalam database runtime-nya sendiri.

Sinkronisasi sesi awal: `npm run start:flow-agent` dari `studio/`. Launcher hanya menjalankan listener bridge, tidak memanggil generasi. **Hentikan listener ini sebelum menjalankan job**: proses CLI generate harus dapat memiliki port WebSocket 9222 sendiri untuk menerima extension dan broker browser. Listener lain pada port tersebut membuat diagnosis cookie bisa lulus tanpa koneksi browser. Adapter sekarang mewajibkan check `browser.ok` sebelum reservasi. Matikan worker MOTIF Bridge lama untuk pengujian ini.

## Kontrak integrasi

- `GET /api/flow-agent/status`: instalasi/hash, jumlah sesi, lokasi extension, dan kesiapan lokal; tidak menampilkan identitas/cookie.
- Job memakai `options.flowProvider: "flow-agent"`. Job lama dan naskah/voiceover dipertahankan melalui API resume; jangan buat job tes duplikat.
- Harga produksi sekarang dibaca otomatis dari katalog live Flow sebelum setiap submit, sesudah diagnosis browser. Parser hanya menerima satu baris model/durasi yang cocok dan harga yang sama untuk seluruh tier; perubahan bentuk atau harga ambigu memblokir submit. Katalog live menunjukkan Omni 8 detik/720p 12 kredit dan Omni 10 detik/720p 15 kredit. Data UI dari user sebelumnya 15 kredit tetap dicatat; tabel hard-coded upstream tidak dipakai sebagai bukti harga. Fixture dapat memakai quote UI yang eksplisit tanpa jaringan.
- Sebelum panggilan generate: diagnosis read-only, intent di disk, lalu reservasi anggaran MOTIF. Upstream menerima count 1, portrait, 720p dan durasi scene. Auto-retry dimatikan, scan akun dibatasi satu dan hanya satu file sesi diterima. Tidak memakai `--all`.
- Setelah timeout/hasil ambigu, intent tetap disimpan dan submit ulang ditolak. Pemulihan otomatis hasil yang belum terunduh belum diimplementasikan; hasil dengan receipt lengkap dapat dipakai ulang tanpa panggilan berbayar.
- File yang diterima harus satu hasil dengan job/media ID, model yang sesuai, 9:16 dan cukup durasi. SHA-256, receipt tanpa identitas, dan provenance disimpan. Setelah semua scene diterima, pipeline narasi/motion/caption/musik/FFmpeg berjalan seperti biasa.

Pengujian lokal memakai fixture dan stub proses, bukan Google Flow. Tes memastikan harga tidak diketahui memblokir panggilan, sesi ganda ditolak, intent mendahului submit, hasil ambigu tidak diulang, serta batas 100 kredit/4 generasi ditegakkan.
