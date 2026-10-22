# Kai Makes Do — brand kit v1

Identitas kerja yang diadopsi untuk studio dan akun DIY AI yang sederhana, berbahasa Inggris, dan tanpa dialog atau voiceover.

## Mulai dari sini

- `brand-board.png`: ringkasan visual yang bisa dibagikan.
- `brand-preview.html`: buka di browser untuk melihat contoh opening, proses, dan reveal. Semua font dan gambar dimuat dari folder ini; tidak memerlukan koneksi internet.
- `brand-book.md`: strategi, pilihan nama, karakter, palet, font, koordinat header/footer, 10 episode awal, rencana konten, dan arah monetisasi.
- `opening-1080x1920.png` serta `process-1080x1920.png`: contoh komposisi 9:16.
- `wordmark.svg` dan `wordmark.png`: wordmark vektor dan versi transparan.
- `assets/kai-home-reference.png`: referensi karakter pilihan sementara.
- `brand-context.md`: fondasi brand yang juga disimpan di `.agents/brand-context.md` proyek.
- `brand-tokens.json`: spesifikasi identitas dalam bentuk terstruktur.
- `generation-prompt.txt`: prompt persis untuk gambar karakter terpilih; dibuat memakai tool image generation bawaan.

Status: nama dan gaya diadopsi untuk studio pada 21 Oktober 2026; handle dan rencana publikasi belum ditetapkan. Ketersediaan handle/domain/merek belum diverifikasi. Belum ada akun dibuat atau konten dipublikasikan.

Opening/proses/reveal menggunakan **satu still yang sama** untuk memperlihatkan tata letak grafis. File-file ini bukan video Flow atau bukti craft sudah dibuat dan diuji secara fisik.

Simpan folder `assets/fonts` bersama pratinjau. Lisensi SIL OFL disertakan; font belum dipasang ke sistem operasi.

Pratinjau diperiksa di desktop serta lebar 390px dan 320px; tidak ditemukan horizontal overflow atau galat JavaScript. `visual-qa.json` menyimpan hasilnya. Skrip `render-preview.cjs` menggunakan runtime lokal pembuat paket dan mungkin perlu penyesuaian jalur jika dipindahkan ke komputer lain.

Pembaruan studio: label AI VISUAL dan nomor episode/step telah dihapus dari semua contoh frame. Gaya Kai juga dipakai pada web studio, planner, dan renderer. Preview motion aktif tersedia di http://127.0.0.1:4317/kai-look.html.
