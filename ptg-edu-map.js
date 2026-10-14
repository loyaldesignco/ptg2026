/* PTG Education hero map v1.0.0 — mounts into #edu-map. Loads Leaflet + d3 + topojson, seeds school points inside real county polygons, breathing office rings. */
(function(){
  var host=document.getElementById('edu-map'); if(!host||host.__ptgMap) return; host.__ptgMap=1;
  var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css=document.createElement('style'); css.textContent='#edu-map{position:absolute;inset:0;pointer-events:none}#edu-map .leaflet-container{background:transparent;font-family:"hanken-grotesk",system-ui,sans-serif}#edu-map .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) grayscale(.8) brightness(1.05) contrast(1.15)}#edu-map .leaflet-control-attribution{background:transparent!important;color:rgba(255,255,255,.28)!important;font-size:9.5px;padding:0 6px}#edu-map .leaflet-control-attribution a{color:rgba(255,255,255,.35)!important}#edu-map .pin{position:relative}#edu-map .pin i{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;display:block;background:url(https://cdn.prod.website-files.com/6a888f48dad6429455c4559e/6a91bfebaa7516ade6e6c330_logo-mark-color.svg) center/contain no-repeat;filter:drop-shadow(0 2px 8px rgba(2,2,2,.85))}#edu-map .pin b{position:absolute;left:22px;top:-7px;white-space:nowrap;font-size:11.5px;font-weight:400;letter-spacing:.02em;color:#fff;text-shadow:0 1px 6px rgba(2,2,2,.9)}#edu-map .pin.ct b{color:#F9B62C}'; document.head.appendChild(css);
  function link(h){ var l=document.createElement('link'); l.rel='stylesheet'; l.href=h; document.head.appendChild(l); }
  function load(s){ return new Promise(function(res,rej){ var e=document.createElement('script'); e.src=s; e.onload=res; e.onerror=rej; document.head.appendChild(e); }); }
  link('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  Promise.all([load('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),load('https://unpkg.com/d3@7.9.0/dist/d3.min.js'),load('https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js')]).then(init).catch(function(){});
  async function init(){
    var offices=[{n:'Long Island HQ',lat:40.8126,lng:-73.6270,cls:''},{n:'Manhattan',lat:40.7580,lng:-73.9855,cls:''},{n:'PTG North \u00b7 Milford, CT',lat:41.2223,lng:-73.0565,cls:'ct'}];
    var map=L.map(host,{center:[40.88,-73.70],zoom:9,zoomControl:false,scrollWheelZoom:false,attributionControl:true,keyboard:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,tap:false,inertia:false,preferCanvas:true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\u00a9 OpenStreetMap contributors',maxZoom:12}).addTo(map);
    var us=await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json').then(function(r){return r.json();});
    var counties=topojson.feature(us,us.objects.counties).features;
    var SEED={'36061':[720,.16],'36047':[900,.2],'36081':[640,.11],'36005':[560,.19],'36085':[150,.07],'36059':[470,.01],'36103':[520,.01],'36119':[370,.03]};
    var rnd=d3.randomLcg(42),pts=[];
    counties.filter(function(f){return SEED[f.id];}).forEach(function(f){ var n=SEED[f.id][0],ch=SEED[f.id][1],b=d3.geoBounds(f),k=0,g=0; while(k<n&&g<n*40){ g++; var lon=b[0][0]+(b[1][0]-b[0][0])*rnd(),lat=b[0][1]+(b[1][1]-b[0][1])*rnd(); if(d3.geoContains(f,[lon,lat])){ pts.push({lat:lat,lon:lon,charter:rnd()<ch}); k++; } } });
    var renderer=L.canvas({padding:.5}),layer=L.layerGroup().addTo(map);
    var circles=pts.map(function(p){ return L.circleMarker([p.lat,p.lon],{renderer:renderer,radius:p.charter?2.4:1.4,stroke:false,fillColor:p.charter?'#FBCD6B':'#F9B62C',fillOpacity:0,interactive:false}).addTo(layer); });
    offices.forEach(function(o){ L.marker([o.lat,o.lng],{interactive:false,icon:L.divIcon({className:'',html:'<span class="pin '+o.cls+'"><i></i><b>'+o.n+'</b></span>',iconSize:[0,0]})}).addTo(map); });
    var xs=pts.map(function(p){return p.lon;}),minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs);
    if(RM){ circles.forEach(function(c){c.setStyle({fillOpacity:.9});}); }
    else { var t0=performance.now(); (function sweep(now){ var t=(now-t0-400)/2400,done=true; circles.forEach(function(c,i){ var p=pts[i],at=(p.lon-minX)/(maxX-minX),o=Math.max(0,Math.min(1,(t-at)*4)); if(o<1) done=false; c.setStyle({fillOpacity:.9*o}); }); if(!done) requestAnimationFrame(sweep); })(t0); }
    var rings=offices.map(function(o){ return {o:o,edge:L.circle([o.lat,o.lng],{radius:0,color:'#F9B62C',weight:1,opacity:0,fill:false}).addTo(map)}; });
    if(!RM){ var ease=function(t){return 1-Math.pow(1-t,3);},DUR=2600,ST=520,HOLD=2200,CYC=DUR+ST*2+HOLD,s0=performance.now(); (function frame(now){ var t=(now-s0)%CYC; rings.forEach(function(r,i){ var l=Math.max(0,Math.min(1,(t-i*ST)/DUR)); r.edge.setRadius(30000*ease(l)); r.edge.setStyle({opacity:.45*(1-l)}); }); requestAnimationFrame(frame); })(s0); }
    addEventListener('resize',function(){map.invalidateSize();}); setTimeout(function(){map.invalidateSize();},400);
  }
})();
