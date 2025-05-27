// quickInspect.js  --- 一度だけ実行して中身をチェック
import fs from "fs";
const geo = JSON.parse(fs.readFileSync("world_heritage_ja.geojson", "utf8"));
const sample = geo.features.slice(0, 5).map((f) => f.properties);
console.log(sample.map((p) => Object.keys(p)));
