/* make-geojson-from-xml.js – robust 2025-05-27 */
import fs from "fs";
import he from "he";
import { XMLParser } from "fast-xml-parser";

const SRC_XML = "list.xml";
const OUT_GEO = "world_heritage.geojson";

/* ---------- 1. XML を安全にパース ---------- */
const xml = fs.readFileSync(SRC_XML, "utf8")
              .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, "&amp;");

const rows = new XMLParser({ ignoreAttributes: false })
               .parse(he.decode(xml)).query.row;
const arr  = Array.isArray(rows) ? rows : [rows];

/* ---------- 2. ユーティリティ (null 安全) ---------- */
const pick = (obj, ...keys) =>
  keys.find(k => obj?.[k] !== undefined) ? obj[keys.find(k => obj?.[k] !== undefined)] : "";

const toFloat = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const getSite = s => {
  if (!s) return "";
  if (typeof s === "string") return s.trim();
  if (Array.isArray(s))      return getSite(s[0]);
  if (typeof s === "object") return getSite(s["#text"]);
  return "";
};

/* ---------- 3. 生成 ---------- */
const features = [];

for (const r of arr) {
  const en = getSite(r.site);
  if (!en) continue;                      /* site が無い行はスキップ */

  const lat = toFloat(pick(r, "latitude", "lat", "latitude_deg"));
  const lon = toFloat(pick(r, "longitude", "lon", "longitude_deg"));

  features.push({
    type: "Feature",
    geometry: lat !== null && lon !== null
      ? { type: "Point", coordinates: [lon, lat] }
      : null,                             /* 座標欠損は geometry:null */
    properties: {
      name_en: en,
      国     : pick(r, "states", "country", "state") || "",
      種別   : r.category === "Cultural" ? "文化遺産"
             : r.category === "Natural"  ? "自然遺産"
             : "複合遺産",
      登録年 : pick(r, "date_inscribed", "year") || ""
    }
  });
}

/* ---------- 4. 保存 ---------- */
fs.writeFileSync(
  OUT_GEO,
  JSON.stringify({ type: "FeatureCollection", features }, null, 2)
);
console.log(`✓ ${OUT_GEO} 生成完了 – 件数:`, features.length);
