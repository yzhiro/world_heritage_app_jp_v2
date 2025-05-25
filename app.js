/* 世界遺産マップ JP Edition v2 */
const NAME_KEY = "名称";
const COUNTRY_KEY = "国";
const CATEGORY_KEY = "種別";
const YEAR_KEY = "登録年";

const map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Cluster layer
const markersLayer = L.markerClusterGroup();
map.addLayer(markersLayer);

let allFeatures = [];
const nameToMarker = {}; // index: lower-case name -> marker
const siteSelect = document.getElementById('siteSelect');
const sitesList = document.getElementById('sitesList');

// Load GeoJSON
fetch('world_heritage.geojson')
  .then(r => r.json())
  .then(data => {
    allFeatures = data.features;
    populateFilters(allFeatures);
    populateSiteSelect(allFeatures);
    renderFeatures(allFeatures);
  });

// Populate country filter
function populateFilters(features){
  const select = document.getElementById('countryFilter');
  const countries = [...new Set(features.map(f => f.properties[COUNTRY_KEY]))].sort();
  for(const c of countries){
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
}

// Populate datalist for site selection
function populateSiteSelect(features){
  features.forEach(f=>{
    const name = f.properties[NAME_KEY];
    const opt = document.createElement('option');
    opt.value = name;
    sitesList.appendChild(opt);
  });
}

// Render markers based on provided features
function renderFeatures(features){
  markersLayer.clearLayers();
  Object.keys(nameToMarker).forEach(k=>delete nameToMarker[k]); // reset

  const geoLayer = L.geoJSON({type:'FeatureCollection', features},{
    onEachFeature:(feature,layer)=>{
      const p = feature.properties;
      const popup = `
        <div class="text-sm">
          <strong>${p[NAME_KEY]}</strong><br/>
          ${p[COUNTRY_KEY]}<br/>
          種別: ${p[CATEGORY_KEY]}<br/>
          登録年: ${p[YEAR_KEY] ?? "N/A"}
        </div>`;
      layer.bindPopup(popup);
      nameToMarker[p[NAME_KEY].toLowerCase()] = layer;
    }
  });
  markersLayer.addLayer(geoLayer);
}

// Filter logic
function applyFilters(){
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  const country = document.getElementById('countryFilter').value;
  const filtered = allFeatures.filter(f=>{
    const p = f.properties;
    const matchKeyword = !keyword || p[NAME_KEY].toLowerCase().includes(keyword);
    const matchCat = !cat || p[CATEGORY_KEY] === cat;
    const matchCountry = !country || p[COUNTRY_KEY] === country;
    return matchKeyword && matchCat && matchCountry;
  });
  renderFeatures(filtered);
}

// Event listeners
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);
document.getElementById('countryFilter').addEventListener('change', applyFilters);

// Coordinate jump
document.getElementById('gotoBtn').addEventListener('click', ()=>{
  const lat = parseFloat(document.getElementById('latInput').value);
  const lon = parseFloat(document.getElementById('lonInput').value);
  if(isFinite(lat)&&isFinite(lon)){
    map.setView([lat,lon],8);
  }else{
    alert("緯度・経度を正しく入力してください");
  }
});

// Site select enter key handling
siteSelect.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const name = siteSelect.value.trim().toLowerCase();
    const marker = nameToMarker[name];
    if(marker){
      const latlng = marker.getLatLng();
      map.setView(latlng, 8);
      marker.openPopup();
      siteSelect.blur();
    }else{
      alert("該当する世界遺産が見つかりません");
    }
  }
});