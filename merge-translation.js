// merge-translation.js
import fs from "fs";

const GEO_IN  = "world_heritage.geojson";
const MAP_IN  = "translationMap.json";
const GEO_OUT = "world_heritage_ja.geojson";

// 1) 読み込み
const geo = JSON.parse(fs.readFileSync(GEO_IN, "utf8"));
const map = JSON.parse(fs.readFileSync(MAP_IN, "utf8"));

// 2) 変換
geo.features.forEach(f => {
  const en = f.properties.name_en;
  if (map[en]) f.properties.name_ja = map[en];
});

// 3) 保存
fs.writeFileSync(world_heritage.geojson, JSON.stringify(geo, null, 2));
console.log(`✓ 変換完了 → ${world_heritage.geojson}  (${geo.features.length} features)`);
