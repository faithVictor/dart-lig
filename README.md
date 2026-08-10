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

1. **Depoyu oluştur**: Bu dosyaları kendi GitHub deponuza push edin (repo
   public olmalı — Issues API'sinin token'sız okunmasına gerek yoksa private
   de olabilir, ama Pages ve raw dosya erişimi için public daha basittir).

2. **GitHub Pages'i aç**: Repo → Settings → Pages → Source: `main` dalı,
   `/ (root)` klasörü.

3. **Actions izinlerini ayarla**: Repo → Settings → Actions → General →
   "Workflow permissions" → **Read and write permissions** seçili olmalı.
   Aksi halde ELO hesaplama Action'ı Issue düzenleyemez / commit atamaz.

4. **Erişim token'ı oluştur**: GitHub → Settings → Developer settings →
   Fine-grained personal access tokens → sadece bu repo için,
   **Issues: Read and write** izniyle bir token üret. Bu token, uygulamanın
   "Ayarlar" ekranına girilecek (tarayıcıda saklanır, sadece bu depoya
   issue açabilir — başka hiçbir yetkisi yoktur).

5. **Uygulamayı aç**: `https://<kullanici-adin>.github.io/<repo-adi>/`
   adresine gidip Ayarlar'dan kullanıcı adı / repo adı / token'ı gir.

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
