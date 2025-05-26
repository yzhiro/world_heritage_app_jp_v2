/* app.js (1 / 2) – 言語切替 & 遺産プルダウン対応 */

const JP = "name_ja",
  EN = "name_en",
  CTRY = "国",
  CAT = "種別",
  YEAR = "登録年";
const PREF = "wh_prefs",
  FAV = "wh_favs",
  MAX_FAV = 5;

let feats = [],
  translationMap = {},
  cluster,
  markerMap = new Map(); // key → marker

/* ── DOM ── */
const $ = (id) => document.getElementById(id);
const langSel = $("langToggle"),
  siteSel = $("siteSel"),
  kwInput = $("kwInput"),
  catSel = $("catSel"),
  ctySel = $("ctySel"),
  hit = $("hitCount"),
  favList = $("favList");

/* ── Leaflet ── */
const map = L.map("map").setView([20, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);
cluster = L.markerClusterGroup().addTo(map);
L.control
  .locate({ position: "topright", flyTo: true, strings: { title: "現在地へ" } })
  .addTo(map);

/* ── データ読み込み ── */
Promise.all([
  fetch("world_heritage_ja.geojson").then((r) => r.json()),
  fetch("translationMap.json").then((r) => r.json()),
])
  .then(([geo, tmap]) => {
    feats = geo.features.filter(
      (f) => f.geometry && f.geometry.type === "Point"
    );
    translationMap = tmap;
    populateCountrySelect();
    initUI();
    renderAll();
    updateSiteSelect();
    updateFavUI();
  })
  .catch((e) => alert("データ読み込みエラー:\n" + e));
/* app.js (2 / 2) */

/* ────────────────── UI 初期化 ────────────────── */
function initUI() {
  const p = JSON.parse(localStorage.getItem(PREF) || "{}");
  if (p.lang) langSel.value = p.lang;
  if (p.kw) kwInput.value = p.kw;
  if (p.cat) catSel.value = p.cat;
  if (p.cty) ctySel.value = p.cty;

  langSel.onchange = () => {
    savePrefs();
    renderAll();
    updateSiteSelect();
  };
  siteSel.onchange = () => goToKey(siteSel.value);

  [kwInput, catSel, ctySel].forEach((el) =>
    el.addEventListener(el.id === "kwInput" ? "input" : "change", () => {
      savePrefs();
      renderAll();
      updateSiteSelect();
    })
  ); // ★追記

  $("menuBtn").onclick = () =>
    $("sidebar").classList.toggle("-translate-x-full");
  $("resetBtn").onclick = () => {
    kwInput.value = catSel.value = ctySel.value = "";
    savePrefs();
    renderAll();
  };
}
const savePrefs = () =>
  localStorage.setItem(
    PREF,
    JSON.stringify({
      lang: langSel.value,
      kw: kwInput.value,
      cat: catSel.value,
      cty: ctySel.value,
    })
  );

/* ────────────────── セレクター生成 ────────────────── */
function populateCountrySelect() {
  [...new Set(feats.map((f) => f.properties[CTRY]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((c) => ctySel.add(new Option(c, c)));
}
// ★ 現在のフィルタをそのまま使う版
function updateSiteSelect() {
  const jp = langSel.value === "ja";
  const list = filterFeats(); // ← ここだけ変更
  const opts = list.sort((a, b) => {
    const n1 = jp ? getJa(a) : getEn(a);
    const n2 = jp ? getJa(b) : getEn(b);
    return n1.localeCompare(n2, "ja");
  });

  siteSel.innerHTML = "";
  opts.forEach((f) => {
    const key = getKey(f),
      label = jp ? getJa(f) : getEn(f);
    siteSel.add(new Option(label, key));
  });
  siteSel.value = "";
}

/* ────────────────── お気に入り ────────────────── */
function loadFavs() {
  return JSON.parse(localStorage.getItem(FAV) || "[]");
}
function saveFavs(a) {
  localStorage.setItem(FAV, JSON.stringify(a));
}
function addFavorite(key) {
  let favs = loadFavs();
  if (!favs.includes(key)) {
    favs.unshift(key);
    if (favs.length > MAX_FAV) favs = favs.slice(0, MAX_FAV);
    saveFavs(favs);
    updateFavUI();
  }
}
function updateFavUI() {
  favList.innerHTML = "";
  loadFavs().forEach((key) => {
    const li = document.createElement("li");
    li.textContent = key;
    li.onclick = () => goToKey(key);
    favList.appendChild(li);
  });
}
function goToKey(key) {
  const m = markerMap.get(key);
  if (m) {
    map.setView(m.getLatLng(), 7, { animate: true });
    m.openPopup();
  }
}

/* ────────────────── 描画 ────────────────── */
function renderAll() {
  const list = filterFeats();
  hit.textContent = `${list.length} / ${feats.length} sites`;

  cluster.clearLayers();
  markerMap.clear();
  list.forEach((f) => {
    const m = featureToMarker(f);
    cluster.addLayer(m);
    markerMap.set(getKey(f), m);
  });
}

/* ────────────────── ヘルパ ────────────────── */
const getJa = (f) =>
  f.properties[JP] || translationMap[f.properties[EN]] || f.properties[EN];
const getEn = (f) => f.properties[EN];

function getKey(f) {
  return `${getEn(f)} (${f.properties[CTRY]})`;
}

function filterFeats() {
  const kw = kwInput.value.trim().toLowerCase(),
    jp = langSel.value === "ja";
  return feats.filter((f) => {
    const name = jp ? getJa(f) : getEn(f),
      p = f.properties;
    return (
      (!kw || name.toLowerCase().includes(kw)) &&
      (!catSel.value || p[CAT] === catSel.value) &&
      (!ctySel.value || p[CTRY] === ctySel.value)
    );
  });
}

function featureToMarker(f) {
  const key = getKey(f),
    ja = getJa(f),
    en = getEn(f),
    p = f.properties,
    nameBold = langSel.value === "ja" ? ja : en,
    nameSmall = langSel.value === "ja" ? en : ja,
    html = `
          <strong>${nameBold}</strong><br><span class="text-xs">${nameSmall}</span><br>
          ${p[CTRY]}<br>${p[CAT]}　${p[YEAR] || ""}<br>
          <button data-k="${key}"
                  class="fav-btn bg-amber-400 hover:bg-amber-500
                         text-xs text-white px-2 py-1 mt-1 rounded">
            ★ お気に入り
          </button>`;

  const m = L.circleMarker(
    [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    { radius: 6, fillColor: "#3b82f6", fillOpacity: 0.85, stroke: false }
  );
  m.bindPopup(html, { maxWidth: 260 });
  m.on("popupopen", (e) => {
    const btn = e.popup._contentNode.querySelector(".fav-btn");
    if (btn) btn.onclick = () => addFavorite(btn.dataset.k);
  });
  return m;
}
