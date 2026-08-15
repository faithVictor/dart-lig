// ============================================
// AYARLAR / YAPILANDIRMA
// ============================================

// Bu şablon deposunu kendi hesabına push ettikten sonra burayı güncelle:
// örn 'faith-dev/dart-lig-sablon'. "Use this template" linki bu değeri kullanır.
const TEMPLATE_REPO = 'faithvictor/dart-lig';

const CFG_KEY = 'dartlig_config';

function cfgYukle() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
  catch { return null; }
}
function cfgKaydet(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

let CFG = cfgYukle();

function apiBase() { return `https://api.github.com/repos/${CFG.owner}/${CFG.repo}`; }
function rawBase() { return `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/main`; }

async function ghFetch(path, opts = {}) {
  const res = await fetch(apiBase() + path, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${CFG.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const detay = await res.text().catch(() => '');
    throw new Error(`GitHub API hatası (${res.status}): ${detay}`);
  }
  return res.json();
}

// ============================================
// OYUNCU İŞLEMLERİ (GitHub Issues, label: oyuncu)
// ============================================
function oyuncuBodyOlustur(veri) {
  return '```json\n' + JSON.stringify(veri, null, 2) + '\n```';
}
function jsonBlokCoz(gövde) {
  const m = gövde.match(/```json\s*([\s\S]*?)```/);
  return m ? JSON.parse(m[1]) : {};
}

async function oyunculariGetir() {
  const issues = await ghFetch('/issues?labels=oyuncu&state=open&per_page=100');
  return issues.map(i => ({
    issueNo: i.number,
    isim: i.title,
    ...jsonBlokCoz(i.body || ''),
  }));
}

async function oyuncuEkle(isim) {
  const baslangic = { elo: 1500, toplam_mac: 0, galibiyet: 0, maglubiyet: 0 };
  return ghFetch('/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: isim,
      labels: ['oyuncu'],
      body: oyuncuBodyOlustur(baslangic),
    }),
  });
}

// ============================================
// MAÇ İŞLEMLERİ (GitHub Issues, label: mac)
// GitHub Action bu issue'yu görünce ELO'yu hesaplar
// ============================================
async function macIssueOlustur({ oyuncu1, oyuncu2, kazananIssueNo, turnuvaTipi, oyuncu1Skor, oyuncu2Skor }) {
  const govde = {
    oyuncu1_issue: oyuncu1.issueNo,
    oyuncu2_issue: oyuncu2.issueNo,
    kazanan_issue: kazananIssueNo,
    turnuva_tipi: turnuvaTipi,
    oyuncu1_kalan_skor: oyuncu1Skor,
    oyuncu2_kalan_skor: oyuncu2Skor,
  };
  return ghFetch('/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: `Maç: ${oyuncu1.isim} vs ${oyuncu2.isim}`,
      labels: ['mac'],
      body: oyuncuBodyOlustur(govde),
    }),
  });
}

// ============================================
// LİDER TABLOSU (statik JSON, GitHub Action tarafından üretilir)
// ============================================
async function liderTablosuGetir(donemTipi) {
  const [puanlar, oyuncular] = await Promise.all([
    fetch(`${rawBase()}/data/lider_tablosu.json?t=${Date.now()}`).then(r => r.json()).catch(() => []),
    fetch(`${rawBase()}/data/oyuncular.json?t=${Date.now()}`).then(r => r.json()).catch(() => []),
  ]);

  const anahtar = donemTipi === 'hafta' ? donemAnahtariHafta()
                : donemTipi === 'ay' ? donemAnahtariAy()
                : donemAnahtariYil();

  const alanAdi = donemTipi === 'hafta' ? 'hafta' : donemTipi === 'ay' ? 'ay' : 'yil';

  const toplamlar = {};
  for (const kayit of puanlar) {
    if (kayit[alanAdi] !== anahtar) continue;
    toplamlar[kayit.oyuncu_id] = (toplamlar[kayit.oyuncu_id] || 0) + kayit.puan;
  }

  const isimHaritasi = {};
  for (const o of oyuncular) isimHaritasi[o.issue_no] = o.isim;

  return Object.entries(toplamlar)
    .map(([oyuncuId, puan]) => ({ isim: isimHaritasi[oyuncuId] || `#${oyuncuId}`, puan }))
    .sort((a, b) => b.puan - a.puan);
}

function donemAnahtariHafta(d = new Date()) {
  const tarih = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const gunNo = (tarih.getUTCDay() + 6) % 7;
  tarih.setUTCDate(tarih.getUTCDate() - gunNo + 3);
  const ilkPersembe = tarih.getTime();
  tarih.setUTCMonth(0, 1);
  if (tarih.getUTCDay() !== 4) tarih.setUTCMonth(0, 1 + ((4 - tarih.getUTCDay()) + 7) % 7);
  const hafta = 1 + Math.round((ilkPersembe - tarih.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getFullYear()}-W${String(hafta).padStart(2, '0')}`;
}
function donemAnahtariAy(d = new Date()) { return d.toISOString().slice(0, 7); }
function donemAnahtariYil(d = new Date()) { return String(d.getFullYear()); }

// ============================================
// ARAYÜZ BAĞLAMA
// ============================================
const el = (id) => document.getElementById(id);

function ekranlariAyarla() {
  if (CFG && CFG.owner && CFG.repo && CFG.token) {
    el('config-screen').hidden = true;
    el('app').hidden = false;
    oyuncuListesiniYenile();
    liderTablosunuYenile('hafta');
  } else {
    el('config-screen').hidden = false;
    el('app').hidden = true;
  }
}

// --- Kolay kurulum: şablon linki ve önceden izinli token linki ---
el('templateBtn').addEventListener('click', () => {
  window.open(`https://github.com/${TEMPLATE_REPO}/generate`, '_blank');
});

function tokenOlusturmaLinkiUret(owner, repoAdi, ekIzinler = {}) {
  const params = new URLSearchParams({
    name: `Dart Lig${repoAdi ? ' - ' + repoAdi : ''}`,
    description: 'Dart lig uygulamasının erişimi',
    target_name: owner,
    expires_in: '366',
    issues: 'write',
    contents: 'write',
    ...ekIzinler,
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}

el('cfgOwner').addEventListener('input', () => {
  el('tokenLinkBtn').disabled = !el('cfgOwner').value.trim();
});
el('tokenLinkBtn').addEventListener('click', () => {
  const owner = el('cfgOwner').value.trim();
  if (!owner) return;
  window.open(tokenOlusturmaLinkiUret(owner, el('cfgRepo').value.trim()), '_blank');
});

// --- Otomatik kurulum: repo oluştur + Pages aç + Actions izinlerini ayarla ---
// Bu, geniş yetkili (Administration: write, "All repositories") bir
// "kurulum token'ı" gerektirir. İşlem bitince bu token silinebilir.
el('setupOwner').addEventListener('input', () => {
  el('setupTokenLinkBtn').disabled = !el('setupOwner').value.trim();
});

el('setupTokenLinkBtn').addEventListener('click', () => {
  const owner = el('setupOwner').value.trim();
  if (!owner) return;
  const params = new URLSearchParams({
    name: 'Dart Lig - Kurulum (tek kullanımlık)',
    description: 'Yeni lig deposu oluşturmak için tek seferlik token. Kullanımdan sonra silinebilir.',
    target_name: owner,
    expires_in: '1',
    administration: 'write',
    contents: 'write',
    pages: 'write',
  });
  window.open(`https://github.com/settings/personal-access-tokens/new?${params.toString()}`, '_blank');
});

async function ghApiCagir(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function bekle(ms) { return new Promise(r => setTimeout(r, ms)); }

el('otomatikKurBtn').addEventListener('click', async () => {
  const owner = el('setupOwner').value.trim();
  const repoAdi = el('setupRepoAdi').value.trim();
  const setupToken = el('setupToken').value.trim();
  const log = el('setupLog');

  if (!owner || !repoAdi || !setupToken) {
    log.textContent = 'Kullanıcı adı, repo adı ve kurulum token\'ı gerekli.';
    return;
  }

  el('otomatikKurBtn').disabled = true;
  try {
    log.textContent = '1/3 — Şablondan repo oluşturuluyor…';
    await ghApiCagir(`https://api.github.com/repos/${TEMPLATE_REPO}/generate`, setupToken, {
      method: 'POST',
      body: JSON.stringify({ owner, name: repoAdi, private: false, include_all_branches: false }),
    });

    log.textContent = 'Repo hazırlanıyor, birkaç saniye bekleniyor…';
    await bekle(4000);

    log.textContent = '2/3 — GitHub Pages açılıyor…';
    await ghApiCagir(`https://api.github.com/repos/${owner}/${repoAdi}/pages`, setupToken, {
      method: 'POST',
      body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } }),
    }).catch(() => { /* Pages zaten açıksa veya repo tam hazır değilse burada hata dönebilir, devam et */ });

    log.textContent = '3/3 — Actions izinleri ayarlanıyor…';
    await ghApiCagir(`https://api.github.com/repos/${owner}/${repoAdi}/actions/permissions/workflow`, setupToken, {
      method: 'PUT',
      body: JSON.stringify({ default_workflow_permissions: 'write', can_approve_pull_request_reviews: false }),
    });

    el('cfgOwner').value = owner;
    el('cfgRepo').value = repoAdi;
    el('tokenLinkBtn').disabled = false;
    log.textContent = `✅ Hazır! ${owner}/${repoAdi} oluşturuldu. Kurulum token'ını GitHub'dan silebilirsin. Şimdi 4. adımdan günlük token'ı oluştur.`;
  } catch (e) {
    log.textContent = `Hata: ${e.message} — Pages veya Actions adımı yarıda kalmış olabilir, reponun Settings sayfasından elle kontrol edebilirsin.`;
  } finally {
    el('otomatikKurBtn').disabled = false;
  }
});

el('cfgKaydet').addEventListener('click', () => {
  CFG = {
    owner: el('cfgOwner').value.trim(),
    repo: el('cfgRepo').value.trim(),
    token: el('cfgToken').value.trim(),
  };
  if (!CFG.owner || !CFG.repo || !CFG.token) { alert('Tüm alanları doldur.'); return; }
  cfgKaydet(CFG);
  ekranlariAyarla();
});

el('ayarlarBtn').addEventListener('click', () => {
  el('config-screen').hidden = false;
  el('app').hidden = true;
  if (CFG) {
    el('cfgOwner').value = CFG.owner;
    el('cfgRepo').value = CFG.repo;
  }
});

// --- Sekmeler ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
    btn.classList.add('active');
    el('tab-' + btn.dataset.tab).hidden = false;
  });
});

// --- Oyuncular ---
let OYUNCULAR = [];

async function oyuncuListesiniYenile() {
  OYUNCULAR = await oyunculariGetir();
  const liste = el('oyuncuListesi');
  liste.innerHTML = '';
  OYUNCULAR.forEach(o => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${o.isim}</span><span>${o.elo ?? 1500} puan · ${o.toplam_mac ?? 0} maç</span>`;
    liste.appendChild(li);
  });

  const dolduSelect = (sel) => {
    sel.innerHTML = OYUNCULAR.map(o => `<option value="${o.issueNo}">${o.isim}</option>`).join('');
  };
  dolduSelect(el('secOyuncu1'));
  dolduSelect(el('secOyuncu2'));
}

el('oyuncuEkleBtn').addEventListener('click', async () => {
  const isim = el('yeniOyuncuIsim').value.trim();
  if (!isim) return;
  el('oyuncuEkleBtn').disabled = true;
  try {
    await oyuncuEkle(isim);
    el('yeniOyuncuIsim').value = '';
    await oyuncuListesiniYenile();
  } catch (e) {
    alert(e.message);
  } finally {
    el('oyuncuEkleBtn').disabled = false;
  }
});

// --- Maç / dart ekranı ---
let OYUN = null;
let AKTIF_TURNUVA_TIPI = 'haftalik';

el('macBaslatBtn').addEventListener('click', () => {
  const o1 = OYUNCULAR.find(o => o.issueNo == el('secOyuncu1').value);
  const o2 = OYUNCULAR.find(o => o.issueNo == el('secOyuncu2').value);
  if (!o1 || !o2 || o1.issueNo === o2.issueNo) { alert('İki farklı oyuncu seç.'); return; }

  AKTIF_TURNUVA_TIPI = el('secTurnuvaTipi').value;
  const baslangicSkoru = parseInt(el('secBaslangicSkor').value, 10);
  OYUN = createDartGame(baslangicSkoru, o1.isim, o2.isim);
  OYUN.oyuncuNesneleri = { 1: o1, 2: o2 };

  el('macKurulum').hidden = true;
  el('oyunEkrani').hidden = false;
  el('p1isim').textContent = o1.isim;
  el('p2isim').textContent = o2.isim;
  oyunEkraniniGuncelle();
});

function oyunEkraniniGuncelle() {
  el('p1skor').textContent = OYUN.state.skorlar[1];
  el('p2skor').textContent = OYUN.state.skorlar[2];
  el('p1sira').textContent = OYUN.state.aktif === 1 ? '● sırada' : '';
  el('p2sira').textContent = OYUN.state.aktif === 2 ? '● sırada' : '';

  const noktalar = el('dartNoktalari');
  noktalar.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('div');
    d.className = 'dart-nokta' + (i < OYUN.state.turAtislari.length ? ' dolu' : '');
    noktalar.appendChild(d);
  }
}

let AKTIF_CARPAN = 1;
document.querySelectorAll('.carpan-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.carpan-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    AKTIF_CARPAN = parseInt(btn.dataset.carpan, 10);
  });
});

const numpad = el('numpad');
for (let i = 1; i <= 20; i++) {
  const b = document.createElement('button');
  b.textContent = i;
  b.addEventListener('click', () => atisIsle(i, AKTIF_CARPAN));
  numpad.appendChild(b);
}
const bullBtn = document.createElement('button');
bullBtn.textContent = '25';
bullBtn.addEventListener('click', () => atisIsle(25, AKTIF_CARPAN));
numpad.appendChild(bullBtn);

const iskaBtn = document.createElement('button');
iskaBtn.textContent = 'Iska';
iskaBtn.style.gridColumn = 'span 2';
iskaBtn.addEventListener('click', () => atisIsle(0, 1));
numpad.appendChild(iskaBtn);

async function atisIsle(deger, carpan) {
  if (!OYUN || OYUN.state.bitti) return;
  const sonuc = OYUN.atisYap(deger, carpan);
  el('macLog').textContent = sonuc.mesaj || sonuc.hata || '';
  oyunEkraniniGuncelle();

  if (sonuc.bitti) {
    const kazananNo = sonuc.kazanan;
    const kaybedenNo = kazananNo === 1 ? 2 : 1;
    const o1 = OYUN.oyuncuNesneleri[1];
    const o2 = OYUN.oyuncuNesneleri[2];
    const kazananOyuncu = OYUN.oyuncuNesneleri[kazananNo];

    try {
      await macIssueOlustur({
        oyuncu1: o1,
        oyuncu2: o2,
        kazananIssueNo: kazananOyuncu.issueNo,
        turnuvaTipi: AKTIF_TURNUVA_TIPI,
        oyuncu1Skor: OYUN.state.skorlar[1],
        oyuncu2Skor: OYUN.state.skorlar[2],
      });
      el('macLog').textContent += ' — Maç kaydedildi, ELO birazdan güncellenecek.';
    } catch (e) {
      el('macLog').textContent += ` — Kayıt hatası: ${e.message}`;
    }
  }
}

el('geriAlBtn').addEventListener('click', () => {
  if (!OYUN) return;
  const sonuc = OYUN.sonAtisiGeriAl();
  el('macLog').textContent = sonuc.hata || 'Son atış geri alındı.';
  oyunEkraniniGuncelle();
});

// --- Lider tablosu ---
document.querySelectorAll('.donem-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.donem-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    liderTablosunuYenile(btn.dataset.donem);
  });
});

async function liderTablosunuYenile(donemTipi) {
  const tbody = document.querySelector('#liderTablo tbody');
  tbody.innerHTML = '<tr><td colspan="3">Yükleniyor…</td></tr>';
  try {
    const siralama = await liderTablosuGetir(donemTipi);
    tbody.innerHTML = siralama.length
      ? siralama.map((s, i) => `<tr><td>${i + 1}</td><td>${s.isim}</td><td>${s.puan.toFixed(1)}</td></tr>`).join('')
      : '<tr><td colspan="3">Henüz veri yok.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3">Yüklenemedi: ${e.message}</td></tr>`;
  }
}

// ============================================
// BAŞLAT
// ============================================
ekranlariAyarla();
