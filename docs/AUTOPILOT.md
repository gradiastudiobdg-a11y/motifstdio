# Brave Flow autopilot

## Alur web aktif — 20 Oktober 2026

Form **Produksi otomatis** kini mengirim provider `google-flow-mcp`, klip 10 detik, 30 fps, dan batas kredit pilihan pengguna. Planner Codex memakai jumlah scene `ceil(durasi/10)` serta jadwal yang totalnya persis. Project Flow dibuat otomatis per job. Sesi Brave dibuka melalui broker lokal yang sama dengan login lama; MCP produksi menghubungkan endpoint lokalnya. Jika perlu login ulang, pengguna mengirim sesi valid dari Brave biasa dengan Flow Login Bridge, lalu memilih akun sendiri. Tidak mengotomatisasi password, CAPTCHA, atau melewati penolakan login Google.

Setiap job menjalankan reserve fsync → satu paid call → receipt media ID → poll/download ID yang sama → validasi dan trim lokal → narasi nyata → canvas motion bersama → mixing dan MP4 tervalidasi. Semua pekerjaan satu akun diantrekan serial. Job terputus dipulihkan dari checkpoint saat server hidup lagi. Submission tanpa media ID tidak pernah dicoba ulang dan menghalangi job berikutnya sampai dipulihkan. Batas kredit dinaikkan melalui brief dan tombol Lanjutkan, tanpa menghapus counter lama.

Tes HTTP lokal memverifikasi ide sampai unduhan, dua job serial, budget stop sebelum paid call, resume tanpa mengulang planner, serta unknown submission. Stub MCP/TTS/finish pada tes orchestration bukan bukti live generasi baru. Produksi Flow live sebelumnya dan MP4 30 detiknya tetap menjadi bukti integrasi nyata. Bagian berikut adalah riwayat worker extension lama.

Bridge menghubungkan queue studio lokal dengan **satu akun Flow di Brave**. Alur: brief menjadi footage Flow, footage kembali otomatis, lalu studio menambahkan motion overlay dan finishing MP4 vertikal. Implementasi tersedia dan fixture lokal lulus; UI setelah login, generasi berbayar, serta download hasil nyata **belum diverifikasi live**.

## Setup satu kali

1. Jalankan studio di port 4317 dan buka dashboard.
2. Di Brave buka `brave://extensions`, aktifkan **Developer mode**, pilih **Load unpacked**, lalu pilih folder `studio/flow-bridge` yang berisi `manifest.json`. Jika memakai ZIP, ekstrak dahulu dan pilih folder hasil ekstrak.

   Brave meminta izin debugging tab. Implementasi membatasi debugger ke tiga perintah input: klik mouse, tombol keyboard, dan teks. Setiap input memverifikasi tab Flow yang dipilih tetap aktif/terlihat dan job masih berlaku. Tidak ada perintah debugger untuk membaca jaringan, cookie, storage browser, atau menjalankan JavaScript di halaman.
3. Buat token pairing melalui tombol studio. Buka popup **Motif — Flow Local Bridge**, tempel token, dan klik **Pair dengan studio**. Token ini hanya untuk server lokal; jangan tempel password/token Google.
4. Buka proyek Flow dan login sendiri ke satu akun saat siap. Gunakan satu tab proyek sebagai worker.
5. Aktifkan worker di popup. Di dashboard berikan batas jumlah generasi, kredit, dan izin generasi berbayar sekali untuk job tersebut.

Brave mendukung ekstensi Chromium. [Brave Help](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave). Langkah unpacked extension: [Chrome Extensions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Saat job berjalan

Worker mengoperasikan tab Flow terlihat/aktif. Ia menunggu scene, mengisi prompt visual, lalu memverifikasi video, 9:16, satu output, model/durasi, dan biaya. Harga harus tertulis di kontrol generasi; saldo akun bukan harga.

Sebelum klik Generate, intent dan baseline video tersimpan di ekstensi serta anggaran direservasi di server. Worker mencari video baru yang terkait prompt itu. Hasil portrait dikirim ke lokal; scene berikutnya berjalan sesudah server menerima hasil. Tipografi, gerak grafis, caption, voice, dan musik ditambahkan setelah tahap footage.

Intent tidak dikirim ulang setelah timeout/restart. Jika upload sudah diterima tetapi respons terputus, receipt polling dapat membersihkan state lokal tanpa generasi baru. State yang tidak dapat dibuktikan akan diblokir untuk pemulihan.

## Status

| Status | Makna / tindakan |
| --- | --- |
| `paired`, worker OFF | Token cocok; aktifkan worker saat Flow siap. |
| `ready` | Menunggu job yang diizinkan. |
| `preparing` | Memeriksa kontrol dan harga. |
| `generating` | Intent direservasi; menunggu hasil yang sama. |
| `downloading` | Mengambil video dan mengirimkannya ke lokal. |
| `waiting_login` | Login normal di Brave diperlukan, lalu resume. |
| `blocked` / `error` | Baca pesan: CAPTCHA, dialog, UI berubah, harga tidak pasti, hasil ambigu, atau download bermasalah. Perbaiki penyebab; jangan klik Generate ulang untuk memperbaiki transfer. |

Jangan membuat generasi manual lain di tab worker saat job aktif. Pakai tab yang sama untuk memulihkan hasil. Pemilihan tab lain ditolak selama intent masih tercatat.

## Batas adapter awal

- Selector: `studio/flow-bridge/selectors.mjs`, versi dicatat melalui `ADAPTER_VERSION`. Adapter mempelajari pola UI publik dan fixture; UI akun yang login masih harus diperiksa.
- Mendukung textarea/contenteditable, select atau dropdown berlabel, dan kartu hasil video yang memuat teks prompt. UI di luar kontrak diblokir dengan pesan; sesuaikan berdasarkan DOM nyata sebelum mengklaim live automation.
- Model dibatasi ke keluarga yang dikenali adapter. Ratio dan satu output wajib terverifikasi. Batas kredit/gen tetap ditegakkan server.
- Upload ingredients/start/end frames belum otomatis. Jangan menjanjikan identitas persis dari reference image otomatis sebelum dukungan itu ditambahkan dan diuji.
- Download awal mendukung URL HTTPS pada video dari Flow atau `*.googleusercontent.com` yang memberikan MP4/WebM. Blob-only, host lain, alur download tambahan, atau video tanpa metadata portrait menunggu perbaikan adapter.
- Login/CAPTCHA tidak dilewati. Tidak ada rotasi akun, ekstraksi cookie, pembacaan history/identitas, atau endpoint generasi tak terdokumentasi. Izin debugger digunakan hanya untuk tiga perintah input yang dibatasi pada `trusted-input.mjs`.

## Pengujian

`node --test studio/flow-bridge/tests/core.test.mjs studio/flow-bridge/tests/background.test.mjs` memeriksa izin URL, task portrait/satu output, harga ambigu, intent persisten sebelum submit, penolakan duplikasi, dan pemulihan receipt.

Fixture HTML lokal dijalankan dengan Playwright dan Brave **headless, profil tes terpisah**: prompt, mode/ratio/durasi/output, harga, perubahan kontrol, hasil portrait yang terkait prompt, hasil ambigu, serta login gate. Fixture bukan UI Flow live dan tidak memakai akun/generasi.

Ulangi fixture dengan runtime lokal:

```powershell
$env:MOTIF_PLAYWRIGHT_MODULE = 'path/to/node_modules/playwright'
$env:MOTIF_BROWSER_PATH = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
node --test studio/flow-bridge/tests/adapter.test.mjs
```

Setelah login masih perlu: inspeksi UI nyata, perbaiki selector bila perlu, jalankan satu job dengan budget jelas, amati footage kembali, lalu cek MP4 footage+overlay. Sebelum itu, jalur Flow end-to-end belum terbukti.

## Sumber primer yang dipelajari

Kode asli tanpa installer pihak ketiga. Referensi: [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [MV3 lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).

Input tepercaya mengikuti [Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) dan tiga metode [CDP Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/). Pola kontrol project/popover dipelajari dari [gflow-cli](https://github.com/swissmarley/gflow-cli). Kode upstream, API generasi internal, dan tooling cookie tidak diimpor.

Adapter UI primer: [browser-use actor element](https://github.com/browser-use/browser-use/blob/main/browser_use/actor/element.py), [DOM service](https://github.com/browser-use/browser-use/blob/main/browser_use/dom/service.py). Dipelajari pemilihan elemen terlihat, verifikasi setelah aksi, dan penanganan aksi yang mungkin sudah terjadi sebelum timeout. Kode/CDP/cookie tooling dari repo itu tidak diimpor.

[Panduan Flow](https://support.google.com/flow/answer/16353334?hl=en) dan [dukungan model](https://support.google.com/flow/answer/16352836?hl=en) memberi kontrak fitur umum, bukan selector UI login. Dipelajari 19 Oktober 2026. Halaman publik Flow mengarah ke sign-in saat penelitian; tidak ada login atau generasi berbayar yang dijalankan.
