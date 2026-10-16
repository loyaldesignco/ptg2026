/* PTG Real Estate portfolio map v1.0.0 — mounts into #re-map. Leaflet + dark OSM tiles, framed on Manhattan + western Queens/Brooklyn.
   Pins come from window.__ptgReBuildings = [{name, lat, lng, st}] ; st 0 managed · 1 project · 2 onboarding.
   Emits CustomEvent 'ptg:re-pick' {detail:{index}} on the host when a pin is clicked; call host.__ptgSelect(i) to highlight. */
(function(){
  var host=document.getElementById('re-map'); if(!host||host.__ptgMap) return; host.__ptgMap=1;
  var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css=document.createElement('style'); css.textContent='#re-map{position:absolute;inset:0;z-index:0}#re-map .leaflet-container{background:#000;font-family:"hanken-grotesk",system-ui,sans-serif}#re-map .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) grayscale(.92) brightness(.75) contrast(1.3);opacity:1}#re-map .leaflet-control-attribution{background:transparent!important;color:rgba(255,255,255,.22)!important;font-size:9.5px;padding:0 6px}#re-map .leaflet-control-attribution a{color:rgba(255,255,255,.35)!important}#re-map .bld{position:relative;cursor:pointer}#re-map .bld i{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;display:block;background:#F9B62C;border:1.2px solid #F9B62C;box-shadow:0 0 0 0 rgba(249,182,44,0);transition:box-shadow .3s}#re-map .bld.s1 i{background:#020202}#re-map .bld.s2 i{background:#020202;border-color:rgba(255,255,255,.6)}#re-map .bld.on i{box-shadow:0 0 0 7px rgba(249,182,44,.22)}#re-map .bld b{position:absolute;left:12px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:11px;font-weight:400;letter-spacing:.04em;color:rgba(255,255,255,.82);text-shadow:0 1px 6px rgba(2,2,2,.95);padding:2px 4px}#re-map .bld.s1 b{color:#F9B62C}#re-map .bld.s2 b{color:rgba(255,255,255,.6)}#re-map .bld.on b{color:#fff}#re-map .bld.lf b{left:auto;right:12px}#re-map .bld.bt b{left:50%;top:14px;transform:translateX(-50%)}#re-map .off{position:relative;pointer-events:none}#re-map .off i{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;display:block;background:url(https://cdn.prod.website-files.com/6a888f48dad6429455c4559e/6a91bfebaa7516ade6e6c330_logo-mark-color.svg) center/contain no-repeat;filter:drop-shadow(0 2px 8px rgba(2,2,2,.85))}#re-map .off b{position:absolute;left:50%;top:16px;transform:translateX(-50%);white-space:nowrap;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#F9B62C;text-shadow:0 1px 6px rgba(2,2,2,.9)}'; document.head.appendChild(css);
  function link(h){ var l=document.createElement('link'); l.rel='stylesheet'; l.href=h; document.head.appendChild(l); }
  function load(s){ return new Promise(function(res,rej){ if(s.indexOf('leaflet')>-1&&window.L) return res(); var e=document.createElement('script'); e.src=s; e.onload=res; e.onerror=rej; document.head.appendChild(e); }); }
  link('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  load('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').then(init).catch(function(){});
  function init(){
    var B=window.__ptgReBuildings||[];
    var offices=[{n:'Manhattan office',lat:40.7580,lng:-73.9855},{n:'Long Island HQ',lat:40.8126,lng:-73.6270}];
    var map=L.map(host,{center:[40.74,-73.95],zoom:12,zoomSnap:.1,zoomControl:false,scrollWheelZoom:false,attributionControl:true,keyboard:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,tap:false,inertia:false});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\u00a9 OpenStreetMap contributors',maxZoom:15}).addTo(map);
    /* Manhattan below 96th + LIC/Astoria + Brooklyn waterfront */
    var FOCUS=L.latLngBounds([[40.698,-74.015],[40.775,-73.915]]);
    function frame(){ var w=host.clientWidth||1000,h=host.clientHeight||560; map.invalidateSize({animate:false}); map.fitBounds(FOCUS,{paddingTopLeft:[Math.round(w*.03),Math.round(h*.05)],paddingBottomRight:[Math.round(w*.03),Math.round(h*.12)],animate:false}); }
    frame();
    offices.forEach(function(o){ L.marker([o.lat,o.lng],{interactive:false,icon:L.divIcon({className:'',html:'<span class="off"><i></i><b>'+o.n+'</b></span>',iconSize:[0,0]})}).addTo(map); });
    var markers=B.map(function(b,i){ var m=L.marker([b.lat,b.lng],{icon:L.divIcon({className:'',html:'<span class="bld s'+(b.st||0)+(b.a==='l'?' lf':b.a==='b'?' bt':'')+'" data-i="'+i+'"><i></i><b>'+b.name+'</b></span>',iconSize:[0,0]})}).addTo(map); m.on('click',function(){ host.dispatchEvent(new CustomEvent('ptg:re-pick',{detail:{index:i}})); }); return m; });
    host.__ptgSelect=function(i){ host.querySelectorAll('.bld').forEach(function(el){ el.classList.toggle('on',+el.getAttribute('data-i')===i); }); if(markers[i]) markers[i].setZIndexOffset(1000); };
    host.__ptgSelect(0);
    /* dashed link from each building to its nearest office */
    B.forEach(function(b){ var o=offices.reduce(function(a,c){ return Math.hypot(c.lat-b.lat,c.lng-b.lng)<Math.hypot(a.lat-b.lat,a.lng-b.lng)?c:a; }); L.polyline([[o.lat,o.lng],[b.lat,b.lng]],{color:'#F9B62C',weight:1,opacity:.22,dashArray:'3 5',interactive:false}).addTo(map); });
    if(!RM){ var rings=offices.map(function(o){ return L.circle([o.lat,o.lng],{radius:0,color:'#F9B62C',weight:1,opacity:0,fill:false,interactive:false}).addTo(map); }); var ease=function(t){return 1-Math.pow(1-t,3);},DUR=2600,ST=520,HOLD=2200,CYC=DUR+ST*2+HOLD,s0=performance.now(); (function fr(now){ var t=(now-s0)%CYC; rings.forEach(function(r,i){ var l=Math.max(0,Math.min(1,(t-i*ST)/DUR)); r.setRadius(6000*ease(l)); r.setStyle({opacity:.4*(1-l)}); }); requestAnimationFrame(fr); })(s0); }
    var rt; addEventListener('resize',function(){ clearTimeout(rt); rt=setTimeout(frame,150); }); setTimeout(frame,400);
  }
})();
