# Google Flow MCP untuk MOTIF

## Sambungan live pulih — 20 Oktober 2026

Session handoff lama berhasil setelah pengguna mengirim sesi dan memilih akun di Brave. API produksi mengembalikan `connected:true`, saldo 810, dan web menampilkan Google Flow **SIAP**; Codex, narasi serta finishing juga SIAP. Tidak ada generasi baru atau kredit yang dibelanjakan untuk pemeriksaan koneksi ini. Bukti tampilan: `exports/motif-flow-connected.png`.

Builder compatibility broker kini mengenali kontrol workspace Flow Indonesia, tidak membuka project atau mengubah persetujuan Agent saat handoff, dan mempertahankan jendela Brave terlihat. Login/verifikasi tetap dilakukan pengguna. Server MOTIF berjalan sebagai proses latar belakang agar layanan bridge tidak bergantung pada durasi satu perintah terminal.

Perbaikan status penting: field upstream `recaptcha:true` hanya menunjukkan library Enterprise terpasang, bukan tantangan CAPTCHA. Kesiapan sekarang diperiksa melalui workspace dan status sesi; iframe tantangan yang terlihat atau instruksi verifikasi yang terlihat tetap menghentikan produksi. Regression test membedakan kedua keadaan tersebut. Patch referensi dan builder broker menyimpan perubahan agar runtime dapat dibangun ulang.

## Alur web otomatis — 20 Oktober 2026

Form produksi kini memilih `google-flow-mcp` secara default. Input ide/durasi/batas kredit diteruskan ke planner Codex 10 detik; project Flow dibuat otomatis, satu output portrait per scene diterima, narasi Indonesia dan timing kata dibuat, lalu motion/caption/musik dan FFmpeg menghasilkan MP4. Semua job satu akun diproses serial. Budget kurang menghentikan job sebelum paid call pertama, dan response hilang tidak memicu retry. Resume mempertahankan project, aset, attempt counter, serta reserve kredit.

Login memakai **broker sesi lama** (`GoogleFlowMcp.openExisting`) untuk membuka profil Brave yang sebelumnya diizinkan dan menyediakan CDP lokal. Runtime produksi baru hanya menghubungkan sesi tersebut. Jika Google menolak login di jendela otomatis, jangan memaksakan login atau mengubah proteksi browser. Login manual di Brave biasa, lalu gunakan **Sambungkan ulang sesi → Flow Login Bridge / Connect Flow → Session sent → Sesi sudah terkirim**. Pengguna memilih akun yang sama di chooser. Penghubung sesi hanya mengirim ke runtime lokal yang sudah disetujui; tidak pernah meneruskan identitas akun/token ke status web atau log. Tidak ada account rotation.

Pemeriksaan `flow_browser_state` membedakan login, login ditolak, jaringan, loading, dan workspace tanpa mengambil identitas atau screenshot akun. Endpoint `/api/flow-production/status` dan `/check` memakai runtime produksi yang sama dengan job. Status broker extension tidak dijadikan bukti bahwa produksi sudah login. Refresh web mempertahankan petunjuk session handoff yang masih aktif; token handoff hanya di memori.

Tes baru memverifikasi form/API orchestration hingga unduhan, antrean dua job, budget stop/resume tanpa mengulang planner, unknown submission menghentikan job berikutnya, schema planner 10 detik, serta trim FFmpeg 10→5 detik dari fixture lokal. Tes stub tidak diklaim sebagai live generasi tambahan. Saat sesi 20 Oktober disambungkan ulang, handoff menerima Session sent namun menunggu/kehabisan waktu pada pemilihan akun; status live terakhir `login_required`. Produksi Flow live dan MP4 30 detik pada 19 Oktober tetap tersimpan. Tidak ada kredit tambahan dibelanjakan untuk tes perubahan web ini.

## Status live terbaru (menggantikan catatan setup di bawah)

**Produksi 30 detik selesai.** Kedua klip berhasil, saldo sesi 830 → 800 (30 kredit terverifikasi). Total 4 percobaan termasuk 2 historis; ledger tetap konservatif 45 kredit reserved termasuk cadangan lama 15. Final H.264/AAC 1080×1920 30 fps, 900 frame, tepat 30 detik, narasi Indonesia nyata dan musik orisinal. Seluruh MP4 didecode dan level audio diukur; frame representatif diperiksa. Hasil di `exports/mulai-sebelum-mood-datang/video.mp4`, project editable, SRT, caption publikasi, cover dan validation JSON ada di folder yang sama. Ini produksi Flow asli dengan `testFixture:false`.

Tool MCP baru sudah aktif setelah restart Codex. Dry-run live berhasil membaca **15 kredit** untuk Omni 1.1 Flash, 720p, 10 detik, 9:16, x1. Generasi pertama berhasil: prompt terverifikasi cocok dengan ID hasil persis, saldo 830 → 815. Berkas asli H.264 720×1280, 10,01 detik berhasil diunduh. Ini footage Flow sungguhan.

Provider `google-flow-mcp` sekarang terhubung ke Autopilot melalui `studio/automation/flow-mcp-production.mjs`. Receipt fsync dan reserve batas job fsync mendahului satu panggilan paid. Respons hilang berhenti, tanpa retry. Poll dan download mengikuti media ID yang sama. Setelah validasi portrait/durasi, sumber diedit lokal dan diimpor dengan provenance.

Job `7cb9d178-b3ff-4ef4-a558-ce560151039c` telah dimigrasi ke dua scene 15 detik dengan narasi Indonesia sungguhan. Dua percobaan lama tetap dihitung dan cadangan lama 15 kredit tetap dipertahankan; receipt penolakan eksplisit dan bukti SQLite empty tanpa media diarsipkan. Counter terkini ada di job.json. Batas tetap total 4 percobaan/100 kredit. Gunakan `scripts/continue-first-flow-test.mjs` untuk handoff staged tool MCP; jangan jalankan dua pengendali job bersamaan.

Panel handoff login MOTIF lama belum disatukan dengan runtime produksi baru. Panel itu bukan indikator koneksi sesi aktif; tidak perlu mengulang login lewat extension lama. MP4 baru selesai setelah finishing nyata dan `finish-validation.json` tersedia. Bagian selanjutnya adalah riwayat setup sebelum koneksi baru berhasil.

## Pembaruan koneksi dan status tes

Sesi Brave yang dipilih pengguna berhasil diverifikasi memakai runtime kompatibilitas terpisah. MCP resmi yang sudah dimuat di percakapan masih menunjuk entry lama dan salah mengklasifikasikan halaman Flow baru sebagai signed out. Jangan mengulang login pengguna untuk mengatasi bug selector ini.

Konfigurasi Codex `google_flow` sekarang menunjuk `studio/scripts/start-google-flow-mcp.mjs`, launcher untuk [RohaanA/google-flow-mcp](https://github.com/RohaanA/google-flow-mcp), commit `a357dc36b8b9c2e8c85c809e4d80210149652fd0`. Varian ini mendukung `flow_status`, `flow_list_models`, `flow_generate_video` dengan `dry_run` dan `max_credits`, serta download berdasarkan media ID yang tepat. Source lokal dipatch secara tercatat di `studio/automation/vendor-patches/`; source miyakejima asli tetap utuh. Sembilan tes protokol upstream lulus; fixture DOM lokal memverifikasi selector Indonesia, 9:16, x1, harga 15 dan tidak ada klik Generate. Dry-run live belum lulus setelah perbaikan terakhir; jangan klaim produksi siap.

Pengguna secara eksplisit memilih akun yang sekarang bersaldo 830 kredit dan menegaskan total anggaran tetap 100 kredit/4 generasi. Tidak ada pergantian akun otomatis. Pemeriksaan live MCP membaca `abra_t2v_10s`, Omni 1.1 Flash, 720p, 10 detik, harga katalog 15; harga UI harus dibaca ulang oleh dry-run sebelum reserve/submit.

Launcher menghubungkan browser lokal yang sudah terbuka bila tersedia, atau membuka profil Brave persisten yang sama jika browser telah ditutup. Tidak memakai flag penyamaran AutomationControlled. Profil tidak disalin ke layanan lain. Konfigurasi memakai launcher agar port lokal sementara tidak menjadi setting permanen.

**Blok saat ini:** katalog tool dalam percakapan masih berisi 11 tool server lama (`flow_list_accounts`/`flow_inspect_account`), bukan tool server baru (`flow_status`/`flow_list_models`). Muat ulang klien/koneksi MCP sebelum tes Flow dilanjutkan. Semua operasi Flow dari agen selanjutnya harus melalui tool namespace MCP yang tersedia; jangan memakai shell/SDK/browser sebagai jalur cadangan ketika inspeksi server lama menyatakan signed out.

Rencana dua shot dan narasi Indonesia 30 detik sungguhan telah disiapkan terpisah di `.studio/first-flow-test-prep/two-shot-project.json` dan `two-shot-voice/voice/voiceover.wav`; belum mengganti project aktif. Rencana finishing adalah dua sumber 10 detik dengan time scale 1.5 menjadi dua scene 15 detik; validasi footage dan retiming belum dijalankan. Project Flow tes terisolasi tersimpan di `.studio/first-flow-test-prep/quoted-mcp.json`. Jangan buat project tes baru.

Job aktif tetap 2/4 panggilan, 15 kredit reservasi lama, nol klip produksi dan belum ada MP4 produksi. Receipt penolakan provider lama tetap belum diselesaikan. Belum ada generasi berbayar pada akun 830 kredit. Setelah MCP dimuat ulang: jalankan status/model dan dry-run project tersimpan; selesaikan migrasi receipt lama tanpa menghapus jatah yang sudah terpakai; hubungkan provider MCP ke checkpoint produksi; baru submit maksimal dua kali dengan harga UI yang terbaca dan reserve sebelum submit. Integrasi generation provider MCP belum selesai; jangan menekan Resume yang masih menunjuk flow-agent.

## Riwayat instalasi awal

19 Oktober 2026: source [miyakejima/google-flow-mcp](https://github.com/miyakejima/google-flow-mcp) versi 0.2.3, commit `6826452a4a2e93bf7313d1be1626a9034fd7dc27`, dipasang di `studio/.studio/vendor/google-flow-mcp`. Source upstream tidak diubah. `npm ci` dan `npm run check` selesai; 33 tes upstream lulus. SDK stdio nyata berhasil menginisialisasi server, menemukan 11 tool, memanggil `flow_help` dan `flow_list_accounts`. Belum ada akun terverifikasi atau generasi melalui connector ini.

## Sambungkan akun

MOTIF menjalankan satu koneksi stdio yang tetap hidup untuk handoff login. Konfigurasi Codex global juga memiliki entry `google_flow` dengan absolute entrypoint yang sama. Sesi/data lokal berada di `studio/.studio/google-flow-mcp`, bukan source. Discovery tool di percakapan Codex yang sudah berjalan belum diuji ulang; koneksi SDK dari MOTIF sudah diuji langsung.

1. Di Brave buka `brave://extensions`, Load unpacked folder `studio/.studio/vendor/google-flow-mcp/extension`. Nama extension **Flow Login Bridge**, berbeda dari MOTIF Bridge dan Flow Bridge lama. Matikan worker bridge lama agar tidak menjalankan job paralel.
2. Di panel **Google Flow MCP** dalam MOTIF, pilih **Sambungkan akun**.
3. Buka popup Flow Login Bridge, klik **Connect Flow**, tunggu **Session sent**. Extension hanya mengirim sesi Google ke loopback lokal setelah klik pengguna; izin transfer lokal telah diberikan pengguna.
4. Di MOTIF pilih **Sesi sudah terkirim**. Pengguna memilih akun yang sudah ada di jendela pemilih Google; MOTIF menunggu verifikasi workspace. Tidak mengotomatisasi password, CAPTCHA, atau verifikasi keamanan.

Token handoff hanya disimpan di memori proses MOTIF/MCP. Langkah 3–4 perlu berdekatan karena session antrean upstream kedaluwarsa setelah dua menit. Setelah server restart atau handoff kedaluwarsa, ulangi dari Sambungkan akun. Maksimal satu akun; tidak ada rotasi.

MCP mendukung executable Brave melalui `FLOW_MCP_BROWSER_EXECUTABLE`. Tidak memasang browser Playwright. Upstream membuka chooser terlihat saat login, lalu secara default beralih ke profil terkelola headless setelah verifikasi; `FLOW_MCP_HEADLESS=0` sendiri tidak mengalahkan flag profil tersebut. Upstream juga mengaktifkan preferensi persetujuan generasi otomatis saat menyelesaikan koneksi. Batas kredit dan intent MOTIF tetap perlu ditegakkan sebelum generation tool digunakan.

## Batas integrasi yang sudah diuji

- `GET /api/google-flow-mcp/status`: discovery dan jumlah akun tanpa identitas akun.
- `POST /api/google-flow-mcp/begin`: meminta transfer sesi; tidak generate.
- `POST /api/google-flow-mcp/complete`: perlu `userConfirmedSessionSent: true`; memilih akun dilakukan pengguna.
- Tidak ada endpoint HTTP untuk memanggil tool generasi bebas. Provider produksi lama belum otomatis diganti. Adapter produksi MCP dan verifikasi harga live tetap perlu diselesaikan setelah koneksi akun terverifikasi.
- Job tes lama tetap tersimpan: 30 detik, 9:16, batas 100 kredit/4 panggilan. Dua panggilan provider lama sudah dihitung, nol klip; receipt kedua `PUBLIC_ERROR_UNUSUAL_ACTIVITY` tetap belum diselesaikan. Instalasi MCP tidak menghapusnya atau memicu retry.
- `npm audit` pada lockfile upstream melaporkan 7 kerentanan (3 moderate, 3 high, 1 critical), termasuk HTTP/OAuth SDK transitif. Instalasi ini memakai stdio lokal tanpa HTTP MCP/OAuth. Lockfile tidak diubah atau ditambal diam-diam; tinjau ulang sebelum menambah transport HTTP/OAuth.

Jangan klaim MP4 produksi selesai sampai footage asli, suara, finishing dan validasi hasil benar-benar tersedia. Lihat [riwayat provider lama](FLOW-AGENT.md).
