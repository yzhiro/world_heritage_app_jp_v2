/* ─── 定数 & 状態 ─── */
const JP = "name_ja",
  EN = "name_en",
  CTRY = "国",
  CAT = "種別",
  YEAR = "登録年";
const PREF = "wh_prefs";
let feats = [], // GeoJSON 全件
  translationMap = {}, // EN→JA 補完
  cluster; // MarkerClusterGroup

/* ─── DOM ─── */
const $ = (id) => document.getElementById(id);
const langSel = $("langToggle"),
  kwInput = $("kwInput"),
  catSel = $("catSel"),
  ctySel = $("ctySel"),
  hit = $("hitCount");

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
  })
  .catch((e) => alert("データ読み込みエラー:\n" + e));

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

/* ─── 描画 ─── */
function renderAll() {
  const list = filterFeats();
  hit.textContent = `${list.length} / ${feats.length} sites`;

  cluster.clearLayers();
  list.forEach((f) => cluster.addLayer(featureToMarker(f)));
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
    nameLine = `${ja} / ${en}`,
    catLine = `${p[CAT]}　${p[YEAR] || ""}`,
    ctyLine = p[CTRY];

  return L.circleMarker(
    [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    { radius: 6, fillColor: "#3b82f6", fillOpacity: 0.85, stroke: false }
  ).bindPopup(`<strong>${nameLine}</strong><br>${ctyLine}<br>${catLine}`, {
    maxWidth: 260,
  });
}
