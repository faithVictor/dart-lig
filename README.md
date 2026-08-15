# Dart Lig

Sunucu gerektirmeyen, tamamen GitHub üzerinde çalışan dart lig uygulaması.

- **Barındırma**: GitHub Pages (statik dosyalar)
- **Veritabanı**: GitHub Issues (her oyuncu ve her maç bir Issue)
- **Hesaplama**: GitHub Actions (ELO, maç Issue'su açılınca otomatik tetiklenir)
- **Okuma**: `data/*.json` — Actions tarafından güncellenen, herkese açık statik dosyalar

Basitlik için **1 repo = 1 lig** olacak şekilde tasarlandı. Birden fazla lig
istersen bu repoyu "Use this template" ile çoğaltıp her lig için ayrı bir
depo oluşturman yeterli.

## Kurulum

### Bir kere yapılacaklar (sen — şablonu yayınlayan kişi)

1. Bu dosyaları kendi GitHub hesabına push et, örn. `dart-lig-sablon` adıyla
   public bir repo olarak.
2. Repo → Settings → **Template repository** kutucuğunu işaretle. Bu,
   herkesin "Use this template" ile kendi kopyasını tek tıkla
   oluşturabilmesini sağlar.
3. `assets/app.js` içindeki `TEMPLATE_REPO` sabitini kendi
   `kullanici-adi/dart-lig-sablon` değerinle güncelle, tekrar push et.

### Her yeni lig için (kullanıcı — uygulamayı ilk açan kişi)

Uygulamanın "Ayarlar" ekranındaki 3 adım bunu otomatikleştiriyor, ama
perde arkasında olan şey şu:

1. **"Kendi lig deponu oluştur" butonu** → `https://github.com/<şablon>/generate`
   adresini açar, GitHub bir tık ile senin hesabında yeni bir repo oluşturur
   (dosya kopyalama, git clone/push gerekmez).
2. Yeni oluşan reponda **Settings → Pages → Source: `main` / `root`**
   ayarını manuel açman gerekiyor (bu adım GitHub API ile otomatikleştirilemiyor).
3. **Settings → Actions → General → Workflow permissions → Read and write
   permissions** seçili olmalı — aksi halde ELO Action'ı issue
   düzenleyemez / commit atamaz.
4. **"İzinleri hazır token oluştur" butonu** → GitHub'ın token oluşturma
   sayfasını, `target_name` (kullanıcı adın) ve `issues=write&contents=write`
   izinleri **önceden doldurulmuş** olarak açar. Sen sadece "Only select
   repositories" kutucuğundan reponu seçip "Generate token"a basıyorsun —
   izin listesinde tek tek arama derdi kalmıyor.
5. Oluşan token'ı uygulamaya yapıştırıp "Bağlan ve kaydet"e basman yeterli.

## Nasıl çalışıyor

```
İstemci (GitHub Pages)
   │  maç sonucu formu
   ▼
Maç Issue'su açılır (label: mac)      ← atomik, çakışma riski yok
   │
   ▼
GitHub Action tetiklenir (issues: opened)
   │
   ▼
ELO hesaplanır, oyuncu Issue'ları güncellenir
   │
   ▼
data/oyuncular.json ve data/lider_tablosu.json commit edilir
   │
   ▼
İstemci bu JSON dosyalarını raw.githubusercontent.com'dan okur
```

## Veri modelleri

**Oyuncu Issue'su** (label: `oyuncu`, başlık = isim)
```json
{ "elo": 1500, "toplam_mac": 0, "galibiyet": 0, "maglubiyet": 0 }
```

**Maç Issue'su** (label: `mac`, frontend tarafından oluşturulur)
```json
{
  "oyuncu1_issue": 12,
  "oyuncu2_issue": 15,
  "kazanan_issue": 12,
  "turnuva_tipi": "haftalik",
  "oyuncu1_kalan_skor": 0,
  "oyuncu2_kalan_skor": 214
}
```

**data/lider_tablosu.json** (Action tarafından üretilir, sadece kazanan satırı eklenir)
```json
[
  { "oyuncu_id": 12, "mac_id": 42, "puan": 30.4, "hafta": "2026-W32", "ay": "2026-08", "yil": "2026", "tarih": "..." }
]
```

## Bilinen sınırlamalar / genişletme noktaları

- **Tek leg 501/301**: Şu an bir maç = tek leg. Gerçek dart formatındaki
  "leg/set" yapısı (örn. ilk 3 leg alan seti kazanır) eklemek istersen,
  `dart-game.js` içindeki `createDartGame`'i bir üst katmanda
  (`bestOfLegs(n, ...)`) sarmalayarak genişletebilirsin.
- **Eşleşme çakışması**: Aynı anda çok sayıda maç bitip Issue açılırsa,
  Action'lar `concurrency: group` sayesinde sıraya girer — hız değil,
  doğruluk önceliklidir.
- **Minimum maç eşiği**: Şu an sıralamaya girmek için bir eşik
  uygulanmıyor; `data/oyuncular.json`daki `toplam_mac` alanını kullanarak
  frontend'de (örn. `toplam_mac < 5` olanları listeden gizle) kolayca
  eklenebilir.
- **Token güvenliği**: Token tarayıcıda (localStorage) saklanır. Fine-grained
  token'ı sadece bu repoya ve sadece Issues iznine sınırlı tutman önemli.
