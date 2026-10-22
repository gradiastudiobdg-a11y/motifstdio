# MOTIF Flow Bridge

Bridge lokal untuk satu akun Google Flow di Brave. Login dilakukan sendiri saat siap. Bridge ini belum diuji pada UI Flow yang sudah login; tes otomatis memakai fixture lokal.

## Pasang sekali

1. Buka MOTIF di http://127.0.0.1:4317 dan klik **Siapkan Brave**.
2. Ekstrak ZIP ini. Di Brave buka `brave://extensions`, aktifkan **Developer mode**, klik **Load unpacked**, lalu pilih folder yang berisi `manifest.json`.
3. Brave meminta izin debugging tab. Kode bridge membatasi pemakaiannya ke input klik, keyboard, dan teks pada tab Flow aktif yang dipasangkan. Kode tidak membaca password, cookie, jaringan, atau isi tab lain lewat debugger.
4. Buka satu project Google Flow di https://labs.google/fx/tools/flow dan login normal.
5. Buat token pairing dari studio, lalu tempel ke popup **Motif — Flow Local Bridge**. Token ini hanya menghubungkan server lokal; jangan masukkan kredensial Google.
6. Aktifkan worker. Biarkan tab project Flow aktif dan terlihat selama generasi. Isi batas kredit di studio ketika akan membuat job.

## Saat produksi

MOTIF menulis naskah, mengirim prompt visual per scene, mengambil footage, lalu menambahkan motion, suara Indonesia, caption, dan musik. Semua hasil produksi memakai 9:16. Server studio dan Brave harus tetap berjalan.

Bridge memeriksa kontrol dan harga yang terlihat, mencatat intent serta anggaran sebelum klik Generate. Bila login, CAPTCHA, biaya, kontrol, atau hasil tidak jelas, bridge berhenti. Setelah timeout, pulihkan hasil yang sama; jangan klik Generate lagi untuk memperbaiki download.

Tab lain dapat dipilih lewat popup hanya jika tidak ada intent aktif. Tidak ada rotasi akun atau pembelian kredit otomatis.

Panduan lengkap ada di `docs/AUTOPILOT.md` dalam proyek MOTIF. Source dan ZIP dibuat dari kode proyek yang sama; kemas ulang melalui `studio/scripts/package-bridge.ps1` setelah mengubah runtime bridge.
