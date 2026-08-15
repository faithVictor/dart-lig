// Basit tek-leg dart oyun motoru (501/301).
// Gerçek dart kuralı: bitiriş mutlaka duble ile olmalı (double-out).
// Genişletme noktası: leg/set yönetimi eklemek için DartGame'i bir üst
// katmanda (örn. bestOfLegs) sarmalayabilirsin.

function createDartGame(baslangicSkor, oyuncu1, oyuncu2) {
  const state = {
    skorlar: { 1: baslangicSkor, 2: baslangicSkor },
    aktif: 1,
    turAtislari: [],
    turBaslangicSkoru: baslangicSkor,
    bitti: false,
    kazanan: null,
  };

  const isimler = { 1: oyuncu1, 2: oyuncu2 };

  function digerOyuncu(p) { return p === 1 ? 2 : 1; }

  function turuBitirVeGecis() {
    state.turAtislari = [];
    state.aktif = digerOyuncu(state.aktif);
    state.turBaslangicSkoru = state.skorlar[state.aktif];
  }

  // deger: 1-20, 25 (bull), veya 0 (ıska — tahtaya hiç değmedi)
  // carpan: 1 (tekli), 2 (duble), 3 (triple). Iska'da carpan'ın etkisi yok.
  function atisYap(deger, carpan) {
    if (state.bitti) return { hata: 'Maç zaten bitti.' };
    if (state.turAtislari.length >= 3) return { hata: 'Bu turda 3 atış hakkı doldu.' };

    let puan;
    if (deger === 0) {
      puan = 0; // ıska
    } else if (deger === 25) {
      puan = carpan === 2 ? 50 : 25;
    } else {
      puan = deger * carpan;
    }

    const oyuncu = state.aktif;
    const kalan = state.skorlar[oyuncu] - puan;

    // Bust kuralı: 0'ın altına düşme, 1'de kalma, ya da duble olmadan 0'a inme
    const bustMu = kalan < 0 || kalan === 1 || (kalan === 0 && carpan !== 2 && !(deger === 25 && carpan === 2));

    if (bustMu) {
      state.skorlar[oyuncu] = state.turBaslangicSkoru; // tur içindeki tüm atışlar iptal
      const mesaj = `Bust! ${isimler[oyuncu]} bu turdaki puanı alamadı.`;
      turuBitirVeGecis();
      return { bust: true, mesaj };
    }

    state.turAtislari.push({ deger, carpan, puan });
    state.skorlar[oyuncu] = kalan;

    if (kalan === 0) {
      state.bitti = true;
      state.kazanan = oyuncu;
      return { bitti: true, kazanan: oyuncu, mesaj: `${isimler[oyuncu]} maçı kazandı!` };
    }

    const mesaj = deger === 0
      ? `${isimler[oyuncu]} ıska geçti (kalan ${kalan})`
      : `${isimler[oyuncu]} attı: ${puan} puan (kalan ${kalan})`;

    if (state.turAtislari.length === 3) {
      turuBitirVeGecis();
    }

    return { devam: true, mesaj };
  }

  function sonAtisiGeriAl() {
    if (state.turAtislari.length === 0) return { hata: 'Bu turda geri alınacak atış yok.' };
    const son = state.turAtislari.pop();
    state.skorlar[state.aktif] += son.puan;
    return { geriAlindi: son };
  }

  return {
    state,
    isimler,
    atisYap,
    sonAtisiGeriAl,
  };
}
