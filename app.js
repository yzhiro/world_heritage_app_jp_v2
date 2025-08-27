/*==================================================
  World Heritage Map – app.js (リファクタ & コメント拡充)
  --------------------------------------------------
  📌 概要
  --------------------------------------------------
  Leaflet を利用して世界遺産（Point 形式の GeoJSON）を地図上に可視化します。
  - 🇯🇵 / 🇺🇸 言語切り替え (日本語⇄英語)
  - 🔍 キーワード検索 / 種別・国フィルタ
  - 🌍 選択した遺産までの自動ズーム & ポップアップ表示
  - ⭐️ お気に入り登録（ローカルストレージ / 上限 5 件）
  - 📦 マーカークラスタリングによる描画負荷軽減

  依存ファイル:
  --------------------------------------------------
  - world_heritage_ja.geojson … 遺産ごとの座標 & 属性
  - translationMap.json       … EN→JA 名称対応表（欠損補完用）

  主要ライブラリ:
  --------------------------------------------------
  - Leaflet 1.9.x
  - Leaflet.markercluster 1.5.x
  - Leaflet.LocateControl 0.79.x
  - Tailwind CSS (UI スタイリング)
==================================================*/

/*──────────────────── 定数 (不変値) ────────────────────*/
// GeoJSON プロパティのキー: 意味を分かりやすくまとめておく
const JP   = "name_ja";   // 日本語名
const EN   = "name_en";   // 英語名
const CTRY = "国";        // 国名 (日本語)
const CAT  = "種別";      // 遺産種別 (文化 / 自然 / 複合)
const YEAR = "登録年";    // ユネスコ登録年

// LocalStorage キー
const PREF    = "wh_prefs"; // UI の状態保存
const FAV     = "wh_favs";  // お気に入りリスト
const MAX_FAV = 5;           // お気に入り保存上限

/*──────────────────── 状態 (可変値) ────────────────────*/
let feats = [];                 // 全 Feature を格納
let translationMap = {};        // EN→JA 対応表
let cluster;                    // MarkerCluster Layer インスタンス
const markerMap = new Map();    // key → Leaflet マーカー (再利用/検索用)

/*──────────────────── DOM ユーティリティ ────────────────────*/
// ⚠️ 直接 querySelector を書き連ねると長くなるため id 取得関数を用意
const $ = (id) => document.getElementById(id);

// よく参照する要素をキャッシュ (1 度だけ評価)
const langSel = $("langToggle");    // 言語トグル
const siteSel = $("siteSel");       // 遺産プルダウン
const kwInput = $("kwInput");       // キーワード入力
const catSel  = $("catSel");        // 種別フィルタ
const ctySel  = $("ctySel");        // 国フィルタ
const hit     = $("hitCount");      // ヒット件数表示
const favList = $("favList");       // お気に入り一覧

/*──────────────────── Leaflet マップ生成 ────────────────────*/
// 初期ビューポート: 緯度 20°, 経度 0° (アフリカ中央上空)
const map = L.map("map").setView([20, 0], 2);

// OSM タイル (無料 / attribution 必須) を使用
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

// マーカークラスタレイヤ追加 (パフォーマンス向上)
cluster = L.markerClusterGroup().addTo(map);

// 現在地ジャンプ (ブラウザの Geolocation API 使用)
L.control.locate({
  position: "topright",
  flyTo: true,
  strings: { title: "現在地へ" },
}).addTo(map);

/*──────────────────── データ読み込み ────────────────────*/
// GeoJSON と翻訳表を並列取得 (Promise.all)
Promise.all([
  fetch("world_heritage_ja.geojson").then((r) => r.json()),
  fetch("translationMap.json").then((r) => r.json()),
])
  .then(([geo, tmap]) => {
    // 1) Point タイプのみ抽出 (LineString 等は対象外)
    feats = geo.features.filter((f) => f.geometry?.type === "Point");

    // 2) 翻訳マップを保存
    translationMap = tmap;

    // 3) UI 準備 (セレクタ選択肢など)
    populateCountrySelect();
    initUI();

    // 4) 初回描画
    renderAll();
    updateSiteSelect();
    updateFavUI();
  })
  .catch((e) => alert("データ読み込みエラー:\n" + e));

/*──────────────────── UI 初期化 ────────────────────*/
function initUI() {
  // ▼ 前回セッションの状態を復元
  const p = JSON.parse(localStorage.getItem(PREF) || "{}");
  if (p.lang) langSel.value = p.lang;
  if (p.kw)   kwInput.value = p.kw;
  if (p.cat)  catSel.value = p.cat;
  if (p.cty)  ctySel.value = p.cty;

  // ▼ イベントバインド
  langSel.onchange = () => {
    savePrefs();         // 変更を保存
    renderAll();         // 再描画 (名称言語が変わる)
    updateSiteSelect();  // 遺産リスト更新
  };

  siteSel.onchange = () => goToKey(siteSel.value);

  // 検索/フィルタ関連は input or change でまとめて処理
  [kwInput, catSel, ctySel].forEach((el) => {
    const ev = el.id === "kwInput" ? "input" : "change";
    el.addEventListener(ev, () => {
      savePrefs();
      renderAll();
      updateSiteSelect();
    });
  });

  // サイドバー開閉 (モバイル向け)
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("-translate-x-full");

  // 「Reset」ボタン: 入力をクリアして全件表示に戻す
  $("resetBtn").onclick = () => {
    kwInput.value = catSel.value = ctySel.value = "";
    savePrefs();
    renderAll();
  };

  // ドラッグアンドドロップ機能
  const sidebar = $("sidebar");
  const sidebarHeader = $("sidebar-header");
  let isDragging = false;
  let offsetX, offsetY;

  sidebarHeader.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - sidebar.getBoundingClientRect().left;
    offsetY = e.clientY - sidebar.getBoundingClientRect().top;
    sidebar.style.transition = "none"; // ドラッグ中はトランジションを無効化
  });

  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      sidebar.style.left = `${x}px`;
      sidebar.style.top = `${y}px`;
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    sidebar.style.transition = ""; // ドラッグ終了時にトランジションを戻す
  });
}

// 🗄️ 現 UI 状態を LocalStorage に保存
const savePrefs = () => {
  localStorage.setItem(
    PREF,
    JSON.stringify({
      lang: langSel.value,
      kw:   kwInput.value,
      cat:  catSel.value,
      cty:  ctySel.value,
    })
  );
};

/*──────────────────── セレクター生成 ────────────────────*/
// 国名プルダウン初期化
function populateCountrySelect() {
  // 重複排除 & アルファベット順 (日本語でも localeCompare("ja"))
  [...new Set(feats.map((f) => f.properties[CTRY]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"))
    .forEach((c) => ctySel.add(new Option(c, c)));
}

// 遺産プルダウン更新 (フィルタ後のリストを反映)
function updateSiteSelect() {
  const jp   = langSel.value === "ja"; // true = 日本語表示
  const list = filterFeats();           // フィルタ結果

  // 名称昇順ソート (表示言語に合わせ比較)
  const opts = list.sort((a, b) => {
    const n1 = jp ? getJa(a) : getEn(a);
    const n2 = jp ? getJa(b) : getEn(b);
    return n1.localeCompare(n2, "ja");
  });

  siteSel.innerHTML = ""; // 既存削除
  opts.forEach((f) => {
    const key   = getKey(f);
    const label = jp ? getJa(f) : getEn(f);
    siteSel.add(new Option(label, key));
  });

  siteSel.value = ""; // 空選択にリセット
}

/*──────────────────── お気に入り機能 ────────────────────*/
function loadFavs() {
  return JSON.parse(localStorage.getItem(FAV) || "[]");
}

function saveFavs(arr) {
  localStorage.setItem(FAV, JSON.stringify(arr));
}

// ★ ボタン押下 → お気に入り追加
function addFavorite(key) {
  let favs = loadFavs();

  // 既に登録済みなら無視
  if (!favs.includes(key)) {
    favs.unshift(key);             // 先頭に追加 (新しい順)
    if (favs.length > MAX_FAV) {
      favs = favs.slice(0, MAX_FAV); // 超過分は切り捨て
    }
    saveFavs(favs);
    updateFavUI();
  }
}

// お気に入り一覧描画
function updateFavUI() {
  favList.innerHTML = "";
  loadFavs().forEach((key) => {
    const li = document.createElement("li");
    li.textContent = key;
    li.onclick = () => goToKey(key);
    favList.appendChild(li);
  });
}

// 対応マーカーへズーム + ポップアップ
function goToKey(key) {
  const m = markerMap.get(key);
  if (m) {
    map.setView(m.getLatLng(), 7, { animate: true });
    m.openPopup();
  }
}

/*──────────────────── メイン描画 ────────────────────*/
function renderAll() {
  const list = filterFeats();

  // 件数表示 (例: "120 / 1248 sites")
  hit.textContent = `${list.length} / ${feats.length} sites`;

  // 既存マーカーを全て除去
  cluster.clearLayers();
  markerMap.clear();

  // フィルタに合致する Feature だけを描画
  list.forEach((f) => {
    const m = featureToMarker(f);
    cluster.addLayer(m);
    markerMap.set(getKey(f), m);
  });
}

/*──────────────────── ヘルパ関数群 ────────────────────*/
// ▼ 名称取得 (日本語優先, 不足分は翻訳表で補完)
const getJa = (f) =>
  f.properties[JP] || translationMap[f.properties[EN]] || f.properties[EN];

const getEn = (f) => f.properties[EN];

// ▼ ユニークキー生成 (英語名 + 国名) … お気に入り識別などに使用
function getKey(f) {
  return `${getEn(f)} (${f.properties[CTRY]})`;
}

// ▼ 検索フィルタ (入力に応じて真偽判定)
function filterFeats() {
  const kw   = kwInput.value.trim().toLowerCase();
  const jp   = langSel.value === "ja";

  return feats.filter((f) => {
    const name = jp ? getJa(f) : getEn(f);
    const p    = f.properties;

    return (
      (!kw || name.toLowerCase().includes(kw)) &&   // キーワード (空なら pass)
      (!catSel.value || p[CAT] === catSel.value) &&  // 種別一致
      (!ctySel.value || p[CTRY] === ctySel.value)    // 国一致
    );
  });
}

/*──────────────────── マーカー生成 ────────────────────*/
// Feature → Leaflet マーカー (+ ポップアップ HTML)
function featureToMarker(f) {
  const key = getKey(f);
  const ja  = getJa(f);
  const en  = getEn(f);
  const p   = f.properties;

  // 表示名 (太字 + 小文字)
  const nameBold  = langSel.value === "ja" ? ja : en;
  const nameSmall = langSel.value === "ja" ? en : ja;

  // UNESCO 公式ページリンク (存在しない場合は空文字)
  const linkLine = p.url
    ? `<a href="${p.url}" target="_blank" class="underline text-blue-600">UNESCOページ ▶</a><br>`
    : "";

  // サムネイル画像 (image プロパティがある場合のみ)
  const imgLine = p.image
    ? `<img src="${p.image}" alt="thumb" class="mt-1 w-full h-auto rounded-lg" />`
    : "";

  // ポップアップ HTML テンプレート
  const html = `
      <strong>${nameBold}</strong><br><span class="text-xs">${nameSmall}</span><br>
      ${p[CTRY]}<br>${p[CAT]}　${p[YEAR] || ""}<br>
      ${linkLine}${imgLine}
      <button data-k="${key}" class="fav-btn bg-amber-400 hover:bg-amber-500 text-xs text-white px-2 py-1 mt-1 rounded">★ お気に入り</button>`;

  // ▼ CircleMarker を作成 (スタイル固定)
  const m = L.circleMarker(
    [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    {
      radius: 6,
      fillColor: "#3b82f6", // Tailwind blue-500
      fillOpacity: 0.85,
      stroke: false,
    }
  );

  // ポップアップ設定
  m.bindPopup(html, { maxWidth: 260 });

  // ポップアップ開時にお気に入りボタンへイベント追加
  m.on("popupopen", (e) => {
    const btn = e.popup._contentNode.querySelector(".fav-btn");
    if (btn) btn.onclick = () => addFavorite(btn.dataset.k);
  });

  return m;
}