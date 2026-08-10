// Bu script GitHub Actions içinde çalışır (Node 20, global fetch mevcut).
// Görevi: yeni açılan "mac" issue'sunu okuyup ELO'yu hesaplamak,
// oyuncu issue'larını güncellemek ve data/*.json dosyalarını
// (statik lider tablosu için) güncel tutmak.

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.REPO; // "owner/repo"
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const API = `https://api.github.com/repos/${REPO}`;

const TURNUVA_AGIRLIKLARI = { haftalik: 1, aylik: 2, senelik: 3 };

async function api(pathSuffix, opts = {}) {
  const res = await fetch(`${API}${pathSuffix}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API hatası ${res.status} @ ${pathSuffix}: ${await res.text()}`);
  }
  return res.json();
}

function jsonBlokCoz(govde) {
  const m = (govde || '').match(/```json\s*([\s\S]*?)```/);
  return m ? JSON.parse(m[1]) : {};
}
function jsonBlokUret(veri) {
  return '```json\n' + JSON.stringify(veri, null, 2) + '\n```';
}

// K-faktörü: az maç oynayan oyuncuda hızlı kalibrasyon, çok maç oynayanda stabil
function kFaktoru(toplamMac) {
  if (toplamMac < 10) return 40;
  if (toplamMac < 30) return 24;
  return 16;
}

function beklenenSkor(kendiElo, rakipElo) {
  return 1 / (1 + Math.pow(10, (rakipElo - kendiElo) / 400));
}

// ISO 8601 hafta numarası (Pazartesi başlangıçlı, yılın ilk Perşembe'sini içeren hafta = W01)
function donemAnahtariHafta(d) {
  const tarih = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const gunNo = (tarih.getUTCDay() + 6) % 7;
  tarih.setUTCDate(tarih.getUTCDate() - gunNo + 3);
  const ilkPersembe = tarih.getTime();
  tarih.setUTCMonth(0, 1);
  if (tarih.getUTCDay() !== 4) tarih.setUTCMonth(0, 1 + ((4 - tarih.getUTCDay()) + 7) % 7);
  const hafta = 1 + Math.round((ilkPersembe - tarih.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getFullYear()}-W${String(hafta).padStart(2, '0')}`;
}
function donemAnahtariAy(d) { return d.toISOString().slice(0, 7); }
function donemAnahtariYil(d) { return String(d.getFullYear()); }

function jsonOku(dosyaYolu, varsayilan) {
  try { return JSON.parse(fs.readFileSync(dosyaYolu, 'utf8')); }
  catch { return varsayilan; }
}
function jsonYaz(dosyaYolu, veri) {
  fs.mkdirSync(path.dirname(dosyaYolu), { recursive: true });
  fs.writeFileSync(dosyaYolu, JSON.stringify(veri, null, 2) + '\n');
}

async function main() {
  const macIssue = await api(`/issues/${ISSUE_NUMBER}`);
  const macVeri = jsonBlokCoz(macIssue.body);

  const [o1Issue, o2Issue] = await Promise.all([
    api(`/issues/${macVeri.oyuncu1_issue}`),
    api(`/issues/${macVeri.oyuncu2_issue}`),
  ]);

  const o1 = { issueNo: o1Issue.number, isim: o1Issue.title, ...jsonBlokCoz(o1Issue.body) };
  const o2 = { issueNo: o2Issue.number, isim: o2Issue.title, ...jsonBlokCoz(o2Issue.body) };

  const kazananNo = Number(macVeri.kazanan_issue);
  const [kazanan, kaybeden] = kazananNo === o1.issueNo ? [o1, o2] : [o2, o1];

  const kKazanan = kFaktoru(kazanan.toplam_mac || 0);
  const kKaybeden = kFaktoru(kaybeden.toplam_mac || 0);

  const eKazanan = beklenenSkor(kazanan.elo || 1500, kaybeden.elo || 1500);
  const eKaybeden = beklenenSkor(kaybeden.elo || 1500, kazanan.elo || 1500);

  const kazananEloDegisimi = kKazanan * (1 - eKazanan);
  const kaybedenEloDegisimi = kKaybeden * (0 - eKaybeden);

  const simdi = new Date().toISOString();

  const kazananYeni = {
    elo: Math.round((kazanan.elo || 1500) + kazananEloDegisimi),
    toplam_mac: (kazanan.toplam_mac || 0) + 1,
    galibiyet: (kazanan.galibiyet || 0) + 1,
    maglubiyet: kazanan.maglubiyet || 0,
    son_mac_tarihi: simdi,
  };
  const kaybedenYeni = {
    elo: Math.round((kaybeden.elo || 1500) + kaybedenEloDegisimi),
    toplam_mac: (kaybeden.toplam_mac || 0) + 1,
    galibiyet: kaybeden.galibiyet || 0,
    maglubiyet: (kaybeden.maglubiyet || 0) + 1,
    son_mac_tarihi: simdi,
  };

  // Oyuncu issue'larını güncelle (rating burada "kalıcı" hale gelir)
  await Promise.all([
    api(`/issues/${kazanan.issueNo}`, { method: 'PATCH', body: JSON.stringify({ body: jsonBlokUret(kazananYeni) }) }),
    api(`/issues/${kaybeden.issueNo}`, { method: 'PATCH', body: JSON.stringify({ body: jsonBlokUret(kaybedenYeni) }) }),
  ]);

  // --- data/oyuncular.json güncelle (frontend'in hızlı okuması için) ---
  const oyuncularYolu = path.join(process.cwd(), 'data', 'oyuncular.json');
  const oyuncular = jsonOku(oyuncularYolu, []);
  const guncelle = (issueNo, isim, yeni) => {
    const idx = oyuncular.findIndex(o => o.issue_no === issueNo);
    const kayit = { issue_no: issueNo, isim, ...yeni };
    if (idx >= 0) oyuncular[idx] = kayit; else oyuncular.push(kayit);
  };
  guncelle(kazanan.issueNo, kazanan.isim, kazananYeni);
  guncelle(kaybeden.issueNo, kaybeden.isim, kaybedenYeni);
  jsonYaz(oyuncularYolu, oyuncular);

  // --- data/lider_tablosu.json güncelle (sadece kazanan pozitif puan alır) ---
  const agirlik = TURNUVA_AGIRLIKLARI[macVeri.turnuva_tipi] || 1;
  const kazanilanPuan = Math.max(0, kazananEloDegisimi) * agirlik;

  const tarihObj = new Date();
  const liderYolu = path.join(process.cwd(), 'data', 'lider_tablosu.json');
  const liderTablosu = jsonOku(liderYolu, []);
  liderTablosu.push({
    oyuncu_id: kazanan.issueNo,
    mac_id: Number(ISSUE_NUMBER),
    puan: Math.round(kazanilanPuan * 10) / 10,
    hafta: donemAnahtariHafta(tarihObj),
    ay: donemAnahtariAy(tarihObj),
    yil: donemAnahtariYil(tarihObj),
    tarih: simdi,
  });
  jsonYaz(liderYolu, liderTablosu);

  console.log(`Tamam: ${kazanan.isim} +${kazananEloDegisimi.toFixed(1)} ELO, ${kaybeden.isim} ${kaybedenEloDegisimi.toFixed(1)} ELO`);
}

main().catch(err => { console.error(err); process.exit(1); });
