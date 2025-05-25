/* make-translation-map.js 2025-05-27 */
import fs from "fs";
import he from "he";
import { XMLParser } from "fast-xml-parser";

const XML  = "list.xml";
const OUT  = "translationMap.json";
const WAIT = 1000;

/* 0) XML パース -------------------------------------------------- */
const xmlSafe = he.decode(
  fs.readFileSync(XML,"utf8")
     .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g,"&amp;")
);
const rows = new XMLParser({ ignoreAttributes:false })
               .parse(xmlSafe).query.row;
const arr  = Array.isArray(rows) ? rows : [rows];

/* 1) 途中データ読込 --------------------------------------------- */
let map = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT,"utf8")) : {};

/* 2) Google 無償 API -------------------------------------------- */
const ja = async t => {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx"
          + "&sl=en&tl=ja&dt=t&q=" + encodeURIComponent(t);
  try {
    const j = await fetch(u).then(r=>r.json());
    return j[0].map(c=>c[0]).join("");
  } catch { return t; }            // 429 などは英語名のまま
};

/* 3) site 抽出ユーティリティ ------------------------------------ */
function siteText(s) {
  if (!s) return "";
  if (typeof s === "string") return s;
  if (Array.isArray(s))      return siteText(s[0]);
  if (typeof s === "object") return siteText(s["#text"]);
  return "";
}

/* 4) メインループ ------------------------------------------------ */
let processed = 0;
for (const r of arr) {
  const en = siteText(r.site).trim();
  if (!en || map[en]) continue;

  await new Promise(res=>setTimeout(res,WAIT));
  map[en] = await ja(en);
  processed++;

  if (processed % 50 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
    console.log("…saved", Object.keys(map).length);
  }
}
fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
console.log("★ translationMap.json 総件数:", Object.keys(map).length);
