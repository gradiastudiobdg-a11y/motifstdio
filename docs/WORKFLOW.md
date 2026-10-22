# Alur produksi otomatis

Kontrak produksi: **brief/Codex → footage asli Flow → motion overlay → audio/caption → MP4**. Semua video produksi memakai **9:16**. Tiap scene wajib punya footage Flow; preview bentuk/teks saja belum dianggap hasil produksi selesai.

## Setup sekali

Jalankan dari folder project:

```powershell
node .\studio\server.mjs
```

Buka alamat lokal yang ditampilkan, port default 4317. Pasang extension unpacked dari `studio/flow-bridge/` di Brave, pair memakai token studio, dan aktifkan worker. Login ke satu akun Flow di Brave saat siap. Detail ada di [AUTOPILOT.md](AUTOPILOT.md).

Adapter sudah diuji dengan fixture DOM lokal di Brave headless. UI setelah login dan generasi berbayar belum diuji; kesiapan kode belum membuktikan generasi live.

## Dari brief ke hasil

1. **Cerita.** Isi pesan, audiens, durasi, dan gaya. Codex memperdalam ide/hook/narasi. Planner offline menyediakan template awal yang dapat diedit.
2. **Anggaran per job.** Tetapkan jumlah generasi maksimum dan batas kredit, lalu izinkan generasi berbayar untuk job itu. Tidak perlu persetujuan tiap scene selama dalam batas.
3. **Footage.** Queue mengirim scene satu per satu ke tab Flow terlihat. Worker memverifikasi video, 9:16, satu output, model/durasi yang didukung, dan biaya yang tertulis jelas.
4. **Ambil hasil.** Worker menghubungkan video baru ke prompt, mengirim file ke studio, lalu lanjut. Intent tersimpan sebelum submit agar restart tidak menekan Generate dua kali.
5. **Motion dan finish.** Setelah footage tersedia, studio menambahkan tipografi/gerak grafis, transisi, voiceover/musik, caption, dan encoding FFmpeg. Hasil MP4 tetap dilengkapi JSON proyek dan bahan publishing.

Art direction tersedia: Kinetic Type, Cinematic Pop, Editorial Calm, dan Stickman Minimal. Gaya memengaruhi footage dan overlay; footage Flow tetap wajib. Narasi terpisah dari prompt visual.

## Saat job menunggu

Login, CAPTCHA, biaya yang tidak terbaca, UI berubah, hasil ambigu, atau download tidak tersedia menghentikan langkah yang bergantung pada Flow. Baca status, bereskan penyebab di tab yang sama, lalu resume job/worker. Tidak ada rotasi akun atau retry generasi berbayar diam-diam.

Jangan membuat generasi manual lain di tab worker saat job aktif. Biarkan satu tab proyek Flow aktif dan server lokal berjalan. Jika video sudah dibuat tetapi transfer gagal, pulihkan hasil itu; jangan generate ulang untuk mengatasi download.

## Revisi dan pemeriksaan

JSON menyimpan scene, headline, narasi, trim, durasi, aset, dan transisi. Codex bisa merevisi cerita; pertahankan ID/aset yang sudah benar. Durasi footage boleh lebih panjang dari bagian yang dipakai.

Cek MP4 sungguhan: awal/akhir, crop, teks pada puncak animasi, durasi, dan suara. Caption/SRT proporsional belum sama dengan alignment rekaman. Simpan JSON, sumber media, dan MP4. Bahan publishing tidak berarti video sudah terunggah.

Sumber: [MOTION-SOURCES.md](MOTION-SOURCES.md). Skill: [short-video-studio](../.agents/skills/short-video-studio/SKILL.md).
