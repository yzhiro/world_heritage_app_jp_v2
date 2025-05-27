// ---- injectLinks.js ----
// 依存: npm i fast-xml-parser he
import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import he from "he";
const { decode } = he;

/* ── 0. Stop 語 & 略称展開 ── */
const STOP = new Set([
  "of",
  "and",
  "the",
  "a",
  "an",
  "in",
  "on",
  "for",
  "at",
  "to",
  "from",
  "with",
  "without",
  "city",
  "cities",
  "town",
  "village",
  "province",
  "state",
  "region",
  "historic",
  "monuments",
  "cultural",
  "natural",
  "landscape",
  "archaeological",
  "site",
  "area",
  "group",
  "complex",
  "property",
  "properties",
]);
const REPLACE = {
  np: "national park",
  npark: "national park",
  npk: "national park",
  mts: "mount",
  mt: "mount",
  st: "saint",
  sts: "saints",
  caves: "cave",
};

/* ── 1. list.xml → linkArr ── */
const rows = new XMLParser({
  ignoreAttributes: true,
  isArray: (n) => n === "row",
  textNodeName: "#text",
}).parse(fs.readFileSync("list.xml", "utf8")).query.row;

const linkArr = rows.map((r) => {
  const raw = extract(r.site || r.site_name_en || r.name_en || r.site_en);
  return {
    tokens: tok(raw), // Set<string>
    url: (r.http_url || "").trim(),
    image: (r.image_url || "").trim(),
  };
});

/* ── 2. GeoJSON へ注入 ── */
const geoPath = "world_heritage_ja.geojson";
const geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));
let imgHit = 0;
geo.features.forEach((f) => {
  const gTok = tok(f.properties.name_en);

  // 2-A: Jaccard 類似度で最良候補
  let best = null,
    bestS = 0;
  for (const rec of linkArr) {
    const inter = intersect(gTok, rec.tokens);
    if (!inter) continue;
    const s = inter / (gTok.size + rec.tokens.size - inter);
    if (s > bestS) {
      bestS = s;
      best = rec;
    }
    if (s === 1) break;
  }

  // 2-B: スコア 0.40 以上なら採用
  if (best && bestS >= 0.4) {
    if (best.url) f.properties.url = best.url;
    if (best.image) (f.properties.image = best.image), imgHit++;
  }

  // 2-C: url がまだ無ければ “検索 URL” を補完
  if (!f.properties.url) {
    const q = encodeURIComponent(f.properties.name_en);
    f.properties.url = `https://whc.unesco.org/en/list/?search=${q}`;
  }
});

/* ── 3. 保存 & ログ ── */
fs.copyFileSync(geoPath, geoPath + ".bak");
fs.writeFileSync(geoPath, JSON.stringify(geo, null, 2));
console.log(
  `✅ 画像注入: ${imgHit} 件 / URL は全 ${geo.features.length} 件に追加済み`
);

/* ── ヘルパ ── */
function extract(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return Object.values(v).map(extract).join(" ");
}
function tok(str) {
  return new Set(
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .flatMap((w) => (REPLACE[w] ?? w).split(/\s+/))
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}
function intersect(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}
