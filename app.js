/* app.js  (1 / 2)  – お気に入り機能追加版 */

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

/* ─── DOM ─── */
const $ = (id) => document.getElementById(id);
const langSel = $("langToggle"),
  kwInput = $("kwInput"),
  catSel = $("catSel"),
  ctySel = $("ctySel"),
  hit = $("hitCount"),
  favList = $("favList");

/* ─── Leaflet 初期化 ─── */
const map = L.map("map").setView([20, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);
cluster = L.markerClusterGroup().addTo(map);
L.control
  .locate({ position: "topright", flyTo: true, strings: { title: "現在地へ" } })
  .addTo(map);

/* ─── データ読み込み ─── */
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
    updateFavUI();
  })
  .catch((e) => alert("データ読み込みエラー:\n" + e));
/* app.js  (2 / 2) */

/* ─── UI 初期化 ─── */
function initUI() {
  const p = JSON.parse(localStorage.getItem(PREF) || "{}");
  if (p.lang) langSel.value = p.lang;
  if (p.kw) kwInput.value = p.kw;
  if (p.cat) catSel.value = p.cat;
  if (p.cty) ctySel.value = p.cty;

  langSel.onchange = saveRender;
  [kwInput, catSel, ctySel].forEach((el) =>
    el.addEventListener(el.id === "kwInput" ? "input" : "change", saveRender)
  );

  $("menuBtn").onclick = () =>
    $("sidebar").classList.toggle("-translate-x-full");
  $("resetBtn").onclick = () => {
    kwInput.value = catSel.value = ctySel.value = "";
    saveRender();
  };
}
function saveRender() {
  localStorage.setItem(
    PREF,
    JSON.stringify({
      lang: langSel.value,
      kw: kwInput.value,
      cat: catSel.value,
      cty: ctySel.value,
    })
  );
  renderAll();
}

/* ─── セレクター生成 ─── */
function populateCountrySelect() {
  [...new Set(feats.map((f) => f.properties[CTRY]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((c) => ctySel.add(new Option(c, c)));
}

/* ─── お気に入りロジック ─── */
function loadFavs() {
  return JSON.parse(localStorage.getItem(FAV) || "[]");
}
function saveFavs(arr) {
  localStorage.setItem(FAV, JSON.stringify(arr));
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
    li.onclick = () => gotoFavorite(key);
    favList.appendChild(li);
  });
}
function gotoFavorite(key) {
  const m = markerMap.get(key);
  if (m) {
    map.setView(m.getLatLng(), 7, { animate: true });
    m.openPopup();
  }
}

/* ─── 描画 ─── */
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

/* ─── ヘルパ ─── */
function getKey(f) {
  // 英語名＋国で一意に
  return `${f.properties[EN]} (${f.properties[CTRY]})`;
}
function filterFeats() {
  const kw = kwInput.value.trim().toLowerCase(),
    jp = langSel.value === "ja";

  return feats.filter((f) => {
    const p = f.properties,
      en = p[EN],
      ja = p[JP] || translationMap[en] || en,
      name = jp ? ja : en;

    return (
      (!kw || name.toLowerCase().includes(kw)) &&
      (!catSel.value || p[CAT] === catSel.value) &&
      (!ctySel.value || p[CTRY] === ctySel.value)
    );
  });
}
function featureToMarker(f) {
  const p = f.properties,
    en = p[EN],
    ja = p[JP] || translationMap[en] || en,
    key = getKey(f);

  const nameLine = `${ja} / ${en}`,
    catLine = `${p[CAT]}　${p[YEAR] || ""}`,
    ctyLine = p[CTRY];

  const marker = L.circleMarker(
    [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    { radius: 6, fillColor: "#3b82f6", fillOpacity: 0.85, stroke: false }
  );

  // ポップアップ HTML
  const html = `<strong>${nameLine}</strong><br>${ctyLine}<br>${catLine}<br>
     <button data-key="${key}"
             class="fav-btn bg-amber-400 hover:bg-amber-500
                    text-xs text-white px-2 py-1 mt-1 rounded">
       ★ お気に入り
     </button>`;

  marker.bindPopup(html, { maxWidth: 260 });
  marker.on("popupopen", (e) => {
    const btn = e.popup._contentNode.querySelector(".fav-btn");
    if (btn) btn.onclick = () => addFavorite(btn.dataset.key);
  });

  return marker;
}
