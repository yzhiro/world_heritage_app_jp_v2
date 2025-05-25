/* make-wh-geo-and-map.js — 2025-05-29 bullet-proof */
import fs from "fs";
import he from "he";
import { XMLParser } from "fast-xml-parser";

const XML  = "list.xml";
const GEO  = "world_heritage.geojson";
const MAP  = "translationMap.json";
const WAIT = 1000;                          // Google API ディレイ

/* ---------- 0. list.xml を丸ごと読み出し ---------- */
let raw = fs.readFileSync(XML,"utf8")
            .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g,"&amp;");
raw = he.decode(raw);

/* ---------- 1. <row> … </row> だけ抽出 (正規表現) ---------- */
const rowRegex = /<row[\s\S]*?<\/row>/gi;
const rowsXML  = raw.match(rowRegex) || [];
console.log("抽出行数:", rowsXML.length);   // 1220 前後になる

/* ---------- 2. 途中成果を読む ─ 再開用 ---------- */
let geo = fs.existsSync(GEO)
          ? JSON.parse(fs.readFileSync(GEO,"utf8"))
          : {type:"FeatureCollection",features:[]};

let map = fs.existsSync(MAP)
          ? JSON.parse(fs.readFileSync(MAP,"utf8"))
          : {};

const done = new Set(Object.keys(map));
const parser = new XMLParser({ ignoreAttributes:false });

/* ---------- 3. 翻訳ヘルパ ---------- */
const ja = async t=>{
  try{
    const j = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx"
     + "&sl=en&tl=ja&dt=t&q="+encodeURIComponent(t)
    ).then(r=>r.json());
    return j[0].map(c=>c[0]).join("");
  }catch{ return t; }          // 失敗は英語で
};

/* ---------- 4. 行ごと処理 (構文エラーは try/catch) ---------- */
let processed=0;
for(const xmlRow of rowsXML){
  let row;
  try{
    row = parser.parse(xmlRow).row;
  }catch{
    console.warn("× 構文エラー行スキップ");
    continue;
  }

  /* --- site 抽出 (string / obj / arr) --- */
  const siteRaw = row.site;
  const en = typeof siteRaw==="string"?siteRaw.trim()
           : Array.isArray(siteRaw)      ? (typeof siteRaw[0]==="string"?siteRaw[0]:siteRaw[0]._||"").trim()
           : typeof siteRaw==="object"   ? (siteRaw._||siteRaw["#text"]||"").trim()
           : "";
  if(!en){ continue; }

  /* --- 翻訳テーブル --- */
  if(!map[en]){
    await new Promise(r=>setTimeout(r,WAIT));
    map[en]=await ja(en);
    console.log("✓",en,"→",map[en]);
  }

  /* --- GeoJSON --- */
  const toNum = v=>Number.isFinite(parseFloat(v))?parseFloat(v):null;
  const lat = toNum(row.latitude ?? row.lat ?? row.latitude_deg);
  const lon = toNum(row.longitude?? row.lon?? row.longitude_deg);

  geo.features.push({
    type:"Feature",
    geometry: lat!==null&&lon!==null ? {type:"Point",coordinates:[lon,lat]} : null,
    properties:{
      name_en: en,
      国     : (row.states ?? row.country ?? "").split(",")[0].trim(),
      種別   : row.category==="Cultural" ? "文化遺産"
             : row.category==="Natural"  ? "自然遺産" : "複合遺産",
      登録年 : row.date_inscribed ?? row.year ?? ""
    }
  });

  /* --- 100 行ごとに保存 --- */
  if(++processed % 100 === 0){
    fs.writeFileSync(GEO, JSON.stringify(geo,null,2));
    fs.writeFileSync(MAP, JSON.stringify(map,null,2));
    console.log("…progress saved", processed);
  }
}

/* ---------- 5. 完了保存 ---------- */
fs.writeFileSync(GEO, JSON.stringify(geo,null,2));
fs.writeFileSync(MAP, JSON.stringify(map,null,2));
console.log("★ 完了 GeoJSON:", geo.features.length,
            "/ 翻訳:", Object.keys(map).length);
