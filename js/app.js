import {feature} from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
// Higher-resolution atlas (50m) for realistic, less "blocky" country borders — same
// package/ID scheme as the 110m fallback, so no compatibility risk if the CDN path moves.
let world;
try{
  world=(await import('https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-50m')).default;
}catch(err){
  world=(await import('https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m')).default;
}

// ===== EDITABLE SETTINGS =====
const SETTINGS={
  millisecondsPerYear:2200,  // Snappy default so the race is visibly moving within a couple of seconds; slow it down with a lower speed step if you want a cinematic pace for recording
  topCountries:10,           // Number of countries in the bar-chart-race
  zoomMode:'leader',         // Map camera mode: 'leader' (follow #1), 'fixed' (lock to one chosen country), or 'manual' (free pan/zoom)
  yearMin:1990,              // First year in the default dataset
  yearMax:2024,              // Last year in the default dataset
  dataUrl:'data/sample-retirement-age.csv', // default dataset, replaced instantly by any uploaded file
  columns:{                  // default CSV column names — irrelevant once you upload your own file (columns are auto-detected)
    entity:'Entity',
    code:'Code',
    year:'Year',
    value:'Average retirement age'
  },
  theme:{
    accent:'#ff3d3d',        // leader glow on the map + record button + scrubber
    accentSoft:'#ff9d2e',    // country history line
    valueColor:'#ffd36b',
    mode:'dark',
    dark:{
      background:'#070b12', panel:'rgba(10,16,27,.86)', ink:'#f5f7fb',
      muted:'#98a6ba', line:'rgba(255,255,255,.13)', land:'#172131'
    },
    light:{
      background:'#eef1f5', panel:'rgba(255,255,255,.88)', ink:'#12151c',
      muted:'#5c6675', line:'rgba(10,16,30,.14)', land:'#d7dce4'
    }
  },
  flags:{                    // Country flag / custom-image icons on bars, tooltip and detail panel
    show:true,
    baseUrl:'https://flagcdn.com/'
  },
  bar:{                       // Default layout of the bar-chart-race — editable live via the ⚙ panel
    orientation:'horizontal'  // 'horizontal' (rows, race grows rightward) | 'vertical' (columns, race grows upward)
  },
  labels:{
    title:'Average Retirement Age Around the World',
    subtitle:'Average age of labour market exit · OECD',
    introKicker:'Global data story',
    introTitle:'Average Retirement Age Around the World',
    introSub:'1990–2024 • average age of labour market exit',
    tooltipValueLabel:'Age',
    announcement:'{name} now has the highest average retirement age worldwide'
  }
};
// =============================

const root=document.getElementById('homicide-story'),d3=window.d3;
const ISO3_TO_ISO2={ABW:'aw',AFG:'af',AGO:'ao',AIA:'ai',ALB:'al',AND:'ad',ARE:'ae',ARG:'ar',ARM:'am',ASM:'as',ATG:'ag',AUS:'au',AUT:'at',AZE:'az',BDI:'bi',BEL:'be',BGD:'bd',BGR:'bg',BHR:'bh',BHS:'bs',BIH:'ba',BLR:'by',BLZ:'bz',BMU:'bm',BOL:'bo',BRA:'br',BRB:'bb',BRN:'bn',BTN:'bt',BWA:'bw',CAN:'ca',CHE:'ch',CHL:'cl',CHN:'cn',CMR:'cm',COK:'ck',COL:'co',CPV:'cv',CRI:'cr',CUB:'cu',CUW:'cw',CYM:'ky',CYP:'cy',CZE:'cz',DEU:'de',DMA:'dm',DNK:'dk',DOM:'do',DZA:'dz',ECU:'ec',EGY:'eg',ERI:'er',ESP:'es',EST:'ee',ETH:'et',FIN:'fi',FJI:'fj',FRA:'fr',FSM:'fm',GBR:'gb',GEO:'ge',GHA:'gh',GIB:'gi',GLP:'gp',GNB:'gw',GRC:'gr',GRD:'gd',GRL:'gl',GTM:'gt',GUF:'gf',GUM:'gu',GUY:'gy',HKG:'hk',HND:'hn',HRV:'hr',HTI:'ht',HUN:'hu',IDN:'id',IMN:'im',IND:'in',IRL:'ie',IRN:'ir',IRQ:'iq',ISL:'is',ISR:'il',ITA:'it',JAM:'jm',JOR:'jo',JPN:'jp',KAZ:'kz',KEN:'ke',KHM:'kh',KIR:'ki',KNA:'kn',KOR:'kr',KWT:'kw',LBN:'lb',LBR:'lr',LCA:'lc',LIE:'li',LKA:'lk',LSO:'ls',LTU:'lt',LUX:'lu',LVA:'lv',MAC:'mo',MAF:'mf',MAR:'ma',MCO:'mc',MDA:'md',MDV:'mv',MEX:'mx',MHL:'mh',MKD:'mk',MLT:'mt',MMR:'mm',MNE:'me',MNG:'mn',MOZ:'mz',MRT:'mr',MSR:'ms',MTQ:'mq',MUS:'mu',MWI:'mw',MYS:'my',MYT:'yt',NAM:'na',NCL:'nc',NER:'ne',NGA:'ng',NIC:'ni',NLD:'nl',NOR:'no',NPL:'np',NZL:'nz',OMN:'om',PAK:'pk',PAN:'pa',PER:'pe',PHL:'ph',PLW:'pw',PNG:'pg',POL:'pl',PRI:'pr',PRT:'pt',PRY:'py',PSE:'ps',PYF:'pf',QAT:'qa',REU:'re',ROU:'ro',RUS:'ru',RWA:'rw',SAU:'sa',SGP:'sg',SHN:'sh',SLB:'sb',SLE:'sl',SLV:'sv',SMR:'sm',SPM:'pm',SRB:'rs',SSD:'ss',STP:'st',SUR:'sr',SVK:'sk',SVN:'si',SWE:'se',SWZ:'sz',SYC:'sc',SYR:'sy',TCA:'tc',THA:'th',TJK:'tj',TKM:'tm',TLS:'tl',TON:'to',TTO:'tt',TUN:'tn',TUR:'tr',TUV:'tv',TZA:'tz',UGA:'ug',UKR:'ua',URY:'uy',USA:'us',UZB:'uz',VAT:'va',VCT:'vc',VEN:'ve',VGB:'vg',VIR:'vi',VNM:'vn',VUT:'vu',WSM:'ws',YEM:'ye',ZAF:'za',ZMB:'zm',ZWE:'zw'};
const hexToRgbStr=hex=>{const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).join(',')};
const T=SETTINGS.theme;
root.style.setProperty('--hot',T.accent);
root.style.setProperty('--hot-rgb',hexToRgbStr(T.accent));
root.style.setProperty('--warm',T.accentSoft);
root.style.setProperty('--value',T.valueColor);
let mode=T.mode==='light'?'light':'dark',activeLand=T[mode].land;

// Distinct, stable per-entity bar color (like Flourish's default categorical theme) — cycle palettes with the 🎨 rail button
const PALETTES=[
  ['#ff7f2a','#2fae60','#ff2f92','#ffce33','#8c98a8','#3355ff','#3c3450','#5f87ab','#2f8f7f','#9fd0d6','#d9b98a','#a8e0bd','#9b6fd9','#e2574c','#4fb8de','#c99a3f'],
  ['#5b8def','#2ec4b6','#ff9f1c','#e71d36','#a06cd5','#43aa8b','#f9c74f','#f94144','#577590','#90be6d','#f3722c','#277da1','#f8961e','#4d908e','#ba181b','#d81159'],
  ['#264653','#2a9d8f','#e9c46a','#f4a261','#e76f51','#023047','#219ebc','#8ecae6','#ffb703','#fb8500','#606c38','#dda15e','#bc6c25','#283618','#a4133c','#c9184a']
];
let paletteIdx=0;
const colorCache=new Map();
function colorForIso(iso){if(colorCache.has(iso))return colorCache.get(iso);let h=0;for(let i=0;i<iso.length;i++)h=(h*31+iso.charCodeAt(i))>>>0;const pal=PALETTES[paletteIdx];const c=pal[h%pal.length];colorCache.set(iso,c);return c}

// Manual per-country overrides set via the detail panel (name + image apply everywhere: bar, tooltip, map)
let saveDebounceTimer=null;
function saveProjectToStorage(){clearTimeout(saveDebounceTimer);saveDebounceTimer=setTimeout(saveProjectToStorageNow,500)}
let manualNameOverrides=new Map();
let manualImageOverrides=new Map();
let manualAnnotations=new Map();
let manualRectImage=new Map();
let noteStyle={x:4,y:50,color:'#ffffff',size:11};
const DEFAULT_RECTIMG_STYLE={x:50,y:50,width:40,height:24,posX:50,posY:50,zoom:1};
let rectImgStyleByIso=new Map();
function getRectImgStyle(iso){return rectImgStyleByIso.get(iso)||DEFAULT_RECTIMG_STYLE}
function ensureRectImgStyle(iso){let s=rectImgStyleByIso.get(iso);if(!s){s={...DEFAULT_RECTIMG_STYLE};rectImgStyleByIso.set(iso,s)}return s}
let imageByIso=new Map();    // auto-detected "Image" column from the uploaded file, if any
let categoryByIso=new Map(); // auto-detected "Category" column, if any

function applyMode(next){mode=next==='light'?'light':'dark';const P=T[mode];activeLand=P.land;root.dataset.mode=mode;const bg=(mode==='dark'?customBgDark:customBgLight)||P.background;root.style.setProperty('--bg',bg);root.style.setProperty('--bg-rgb',hexToRgbStr(bg));root.style.setProperty('--bg-glow',mode==='dark'?'#111c2c':bg);root.style.setProperty('--panel',P.panel);root.style.setProperty('--ink',P.ink);root.style.setProperty('--ink-rgb',hexToRgbStr(P.ink));root.style.setProperty('--muted',P.muted);root.style.setProperty('--line',P.line);root.style.setProperty('--land',P.land);if(!SETTINGS.flags.show){pathByIso.forEach((node,iso)=>{node.setAttribute('fill',iso===renderedLeaderIso?T.accent:P.land)})}const btn=root.querySelector('.theme-toggle');if(btn){btn.textContent=mode==='dark'?'🌙':'☀️';btn.setAttribute('aria-label',mode==='dark'?'Switch to light theme':'Switch to dark theme')}}
function flagUrl(iso3){const iso2=ISO3_TO_ISO2[iso3];return iso2?`${SETTINGS.flags.baseUrl}${iso2}.svg`:null}
function getBadgeUrl(iso3){return manualImageOverrides.get(iso3)||imageByIso.get(iso3)||flagUrl(iso3)}
function isVideoSrc(url){return typeof url==='string'&&(/^data:video\//i.test(url)||/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url))}
function ensureMediaTag(el,url){
  if(!el)return null;
  const wantTag=isVideoSrc(url)?'VIDEO':'IMG';
  if(el.tagName===wantTag)return el;
  const target=document.createElement(wantTag.toLowerCase());
  target.className=el.className;
  target.onerror=()=>{target.style.visibility='hidden'};
  if(wantTag==='VIDEO'){target.autoplay=true;target.loop=true;target.muted=true;target.playsInline=true;target.disablePictureInPicture=true}
  el.replaceWith(target);
  return target;
}
function setFlag(imgEl,iso3,label){if(!imgEl)return;if(!SETTINGS.flags.show){imgEl.style.visibility='hidden';return}const url=getBadgeUrl(iso3);if(!url){imgEl.style.visibility='hidden';return}const el=ensureMediaTag(imgEl,url);el.style.visibility='visible';if(el.getAttribute('src')!==url)el.src=url;el.alt=label||''}
function displayName(iso,fallback){return manualNameOverrides.get(iso)||fallback||iso}
let numberFormat={decimals:1,unit:''};
function formatValue(v){if(v==null||!Number.isFinite(v))return'—';const n=v.toLocaleString(undefined,{minimumFractionDigits:numberFormat.decimals,maximumFractionDigits:numberFormat.decimals});return n+(numberFormat.unit?' '+numberFormat.unit:'')}

const {entity:COL_ENTITY,code:COL_CODE,year:COL_YEAR,value:COL_VALUE}=SETTINGS.columns;
function buildDataset(rawRows,images,categories){const rows=rawRows.filter(d=>d.iso&&Number.isFinite(d.year)&&Number.isFinite(d.value));const names=new Map(rows.map(d=>[d.iso,d.name])),series=d3.group(rows,d=>d.iso);series.forEach(v=>v.sort((a,b)=>a.year-b.year));const yrs=rows.map(d=>d.year);const yearMin=yrs.length?Math.min(...yrs):SETTINGS.yearMin,yearMax=yrs.length?Math.max(...yrs):SETTINGS.yearMax;return{rows,names,series,yearMin,yearMax,imageByIso:images||new Map(),categoryByIso:categories||new Map()}}

const csvText=await fetch(SETTINGS.dataUrl).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).catch(()=>'Entity,Code,Year,Value\n');
const initialRawRows=d3.csvParse(csvText,d=>({name:d[COL_ENTITY],iso:d[COL_CODE],year:+d[COL_YEAR],value:+d[COL_VALUE]})).filter(d=>d.year>=SETTINGS.yearMin&&d.year<=SETTINGS.yearMax);
let {rows,names,series}=buildDataset(initialRawRows);

const svg=d3.select(root.querySelector('.hm-map')),mapG=svg.append('g'),countryG=mapG.append('g'),labelG=mapG.append('g'),svgDefs=svg.append('defs');
const beaconWrap=mapG.append('g').attr('class','leader-beacon-wrap').style('opacity',0);
beaconWrap.append('circle').attr('class','beacon-ring beacon-ring-a').attr('r',7);
beaconWrap.append('circle').attr('class','beacon-ring beacon-ring-b').attr('r',7);
beaconWrap.append('circle').attr('class','beacon-core').attr('r',5);
let leaderCentroid=null,currentZoomK=1;
function updateBeaconTransform(){if(!leaderCentroid)return;beaconWrap.attr('transform',`translate(${leaderCentroid[0]},${leaderCentroid[1]}) scale(${1/currentZoomK})`)}
const mapPanelEl=root.querySelector('.map-panel');
const DEFAULT_MAP_BOX={left:58,top:6,width:36,height:44};
let mapBox={...DEFAULT_MAP_BOX};
function applyMapBox(){mapPanelEl.style.left=mapBox.left+'%';mapPanelEl.style.top=mapBox.top+'%';mapPanelEl.style.width=mapBox.width+'%';mapPanelEl.style.height=mapBox.height+'%'}
function syncMapSizeUI(){
  root.querySelector('.set-map-left').value=Math.round(mapBox.left);root.querySelector('.set-map-left-val').textContent=Math.round(mapBox.left);
  root.querySelector('.set-map-top').value=Math.round(mapBox.top);root.querySelector('.set-map-top-val').textContent=Math.round(mapBox.top);
  root.querySelector('.set-map-w').value=Math.round(mapBox.width);root.querySelector('.set-map-w-val').textContent=Math.round(mapBox.width);
  root.querySelector('.set-map-h').value=Math.round(mapBox.height);root.querySelector('.set-map-h-val').textContent=Math.round(mapBox.height);
}
function resetMapBox(){mapBox={...DEFAULT_MAP_BOX};applyMapBox();syncMapSizeUI();scheduleResize();saveProjectToStorage()}
let mapVisible=true;
function applyMapVisibility(){mapPanelEl.hidden=!mapVisible}

const leaderPanelEl=root.querySelector('.leader-panel');
const DEFAULT_LEADER_BOX={left:58,top:52,width:36,height:18};
let leaderBox={...DEFAULT_LEADER_BOX};
function applyLeaderBox(){leaderPanelEl.style.left=leaderBox.left+'%';leaderPanelEl.style.top=leaderBox.top+'%';leaderPanelEl.style.width=leaderBox.width+'%';leaderPanelEl.style.height=leaderBox.height+'%'}
function syncLeaderSizeUI(){
  root.querySelector('.set-leader-left').value=Math.round(leaderBox.left);root.querySelector('.set-leader-left-val').textContent=Math.round(leaderBox.left);
  root.querySelector('.set-leader-top').value=Math.round(leaderBox.top);root.querySelector('.set-leader-top-val').textContent=Math.round(leaderBox.top);
  root.querySelector('.set-leader-w').value=Math.round(leaderBox.width);root.querySelector('.set-leader-w-val').textContent=Math.round(leaderBox.width);
  root.querySelector('.set-leader-h').value=Math.round(leaderBox.height);root.querySelector('.set-leader-h-val').textContent=Math.round(leaderBox.height);
}
function resetLeaderBox(){leaderBox={...DEFAULT_LEADER_BOX};applyLeaderBox();syncLeaderSizeUI();saveProjectToStorage()}
let leaderVisible=true;
function applyLeaderVisibility(){leaderPanelEl.hidden=!leaderVisible}
let leaderZoom=1,leaderZoomX=50,leaderZoomY=50;
function applyLeaderZoom(){const el=root.querySelector('.leader-spot');el.style.transformOrigin=leaderZoomX+'% '+leaderZoomY+'%';el.style.transform=`scale(${leaderZoom})`}

let topWidgetZ=12;
function bringToFront(panelEl){topWidgetZ++;panelEl.style.zIndex=String(topWidgetZ)}

function setupFloatingWidgetDrag(panelEl,box,applyBox,onResize,dragFromBody){
  const container=root.querySelector('.split-layout'),handle=panelEl.querySelector('.floating-widget-handle'),grip=panelEl.querySelector('.floating-widget-grip');
  const moveSource=dragFromBody?panelEl:handle;
  let move=null,resizeDrag=null;
  panelEl.addEventListener('pointerdown',()=>bringToFront(panelEl));
  moveSource.addEventListener('pointerdown',e=>{
    if(e.target===grip)return;
    const cr=container.getBoundingClientRect();
    move={startX:e.clientX,startY:e.clientY,startLeft:box.left,startTop:box.top,cw:cr.width,ch:cr.height};
    handle.classList.add('dragging');
    moveSource.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  moveSource.addEventListener('pointermove',e=>{
    if(!move)return;
    const dx=(e.clientX-move.startX)/move.cw*100,dy=(e.clientY-move.startY)/move.ch*100;
    box.left=Math.max(0,Math.min(100-box.width,move.startLeft+dx));
    box.top=Math.max(0,Math.min(100-box.height,move.startTop+dy));
    applyBox();
    if(onResize)onResize();
  });
  function endMove(){if(!move)return;move=null;handle.classList.remove('dragging');saveProjectToStorage()}
  moveSource.addEventListener('pointerup',endMove);
  moveSource.addEventListener('pointercancel',endMove);
  grip.addEventListener('pointerdown',e=>{
    const cr=container.getBoundingClientRect();
    resizeDrag={startX:e.clientX,startY:e.clientY,startW:box.width,startH:box.height,cw:cr.width,ch:cr.height};
    grip.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener('pointermove',e=>{
    if(!resizeDrag)return;
    const dx=(e.clientX-resizeDrag.startX)/resizeDrag.cw*100,dy=(e.clientY-resizeDrag.startY)/resizeDrag.ch*100;
    box.width=Math.max(1,Math.min(100-box.left,resizeDrag.startW+dx));
    box.height=Math.max(1,Math.min(100-box.top,resizeDrag.startH+dy));
    applyBox();
    if(onResize)onResize();
  });
  function endResize(){if(!resizeDrag)return;resizeDrag=null;grip.classList.remove('dragging');saveProjectToStorage()}
  grip.addEventListener('pointerup',endResize);
  grip.addEventListener('pointercancel',endResize);
}
setupFloatingWidgetDrag(mapPanelEl,mapBox,applyMapBox,()=>{scheduleResize();syncMapSizeUI()},false);
setupFloatingWidgetDrag(leaderPanelEl,leaderBox,applyLeaderBox,syncLeaderSizeUI,true);
root.querySelector('.map-box-reset-btn').addEventListener('click',resetMapBox);
root.querySelector('.leader-box-reset-btn').addEventListener('click',resetLeaderBox);
root.querySelector('.map-bring-front-btn').addEventListener('click',()=>bringToFront(mapPanelEl));
root.querySelector('.leader-bring-front-btn').addEventListener('click',()=>bringToFront(leaderPanelEl));
root.querySelector('.set-map-visible').addEventListener('change',e=>{mapVisible=e.target.checked;applyMapVisibility();saveProjectToStorage()});
root.querySelector('.set-map-left').addEventListener('input',e=>{mapBox.left=Math.max(0,Math.min(100-mapBox.width,+e.target.value));root.querySelector('.set-map-left-val').textContent=Math.round(mapBox.left);applyMapBox();scheduleResize();saveProjectToStorage()});
root.querySelector('.set-map-top').addEventListener('input',e=>{mapBox.top=Math.max(0,Math.min(100-mapBox.height,+e.target.value));root.querySelector('.set-map-top-val').textContent=Math.round(mapBox.top);applyMapBox();scheduleResize();saveProjectToStorage()});
root.querySelector('.set-map-w').addEventListener('input',e=>{
  mapBox.width=Math.max(1,Math.min(100,+e.target.value));
  mapBox.left=Math.min(mapBox.left,100-mapBox.width);
  root.querySelector('.set-map-w-val').textContent=Math.round(mapBox.width);
  root.querySelector('.set-map-left').value=Math.round(mapBox.left);root.querySelector('.set-map-left-val').textContent=Math.round(mapBox.left);
  applyMapBox();scheduleResize();saveProjectToStorage();
});
root.querySelector('.set-map-h').addEventListener('input',e=>{
  mapBox.height=Math.max(1,Math.min(100,+e.target.value));
  mapBox.top=Math.min(mapBox.top,100-mapBox.height);
  root.querySelector('.set-map-h-val').textContent=Math.round(mapBox.height);
  root.querySelector('.set-map-top').value=Math.round(mapBox.top);root.querySelector('.set-map-top-val').textContent=Math.round(mapBox.top);
  applyMapBox();scheduleResize();saveProjectToStorage();
});
root.querySelector('.set-leader-visible').addEventListener('change',e=>{leaderVisible=e.target.checked;applyLeaderVisibility();saveProjectToStorage()});
root.querySelector('.set-leader-left').addEventListener('input',e=>{leaderBox.left=Math.max(0,Math.min(100-leaderBox.width,+e.target.value));root.querySelector('.set-leader-left-val').textContent=Math.round(leaderBox.left);applyLeaderBox();saveProjectToStorage()});
root.querySelector('.set-leader-top').addEventListener('input',e=>{leaderBox.top=Math.max(0,Math.min(100-leaderBox.height,+e.target.value));root.querySelector('.set-leader-top-val').textContent=Math.round(leaderBox.top);applyLeaderBox();saveProjectToStorage()});
root.querySelector('.set-leader-w').addEventListener('input',e=>{
  leaderBox.width=Math.max(1,Math.min(100,+e.target.value));
  leaderBox.left=Math.min(leaderBox.left,100-leaderBox.width);
  root.querySelector('.set-leader-w-val').textContent=Math.round(leaderBox.width);
  root.querySelector('.set-leader-left').value=Math.round(leaderBox.left);root.querySelector('.set-leader-left-val').textContent=Math.round(leaderBox.left);
  applyLeaderBox();saveProjectToStorage();
});
root.querySelector('.set-leader-h').addEventListener('input',e=>{
  leaderBox.height=Math.max(1,Math.min(100,+e.target.value));
  leaderBox.top=Math.min(leaderBox.top,100-leaderBox.height);
  root.querySelector('.set-leader-h-val').textContent=Math.round(leaderBox.height);
  root.querySelector('.set-leader-top').value=Math.round(leaderBox.top);root.querySelector('.set-leader-top-val').textContent=Math.round(leaderBox.top);
  applyLeaderBox();saveProjectToStorage();
});
root.querySelector('.set-leader-zoom').addEventListener('input',e=>{leaderZoom=+e.target.value;root.querySelector('.set-leader-zoom-val').textContent=leaderZoom.toFixed(1);applyLeaderZoom();saveProjectToStorage()});
root.querySelector('.set-leader-zoom-x').addEventListener('input',e=>{leaderZoomX=+e.target.value;root.querySelector('.set-leader-zoom-x-val').textContent=Math.round(leaderZoomX);applyLeaderZoom();saveProjectToStorage()});
root.querySelector('.set-leader-zoom-y').addEventListener('input',e=>{leaderZoomY=+e.target.value;root.querySelector('.set-leader-zoom-y-val').textContent=Math.round(leaderZoomY);applyLeaderZoom();saveProjectToStorage()});
let barsVisible=true;
function applyBarsVisibility(){root.querySelector('.race-panel').hidden=!barsVisible}
root.querySelector('.set-bars-visible').addEventListener('change',e=>{barsVisible=e.target.checked;applyBarsVisibility();saveProjectToStorage()});
let namesVisible=true;
function applyNamesVisibility(){root.querySelector('.rank-list').classList.toggle('hide-names',!namesVisible)}
root.querySelector('.set-names-visible').addEventListener('change',e=>{namesVisible=e.target.checked;applyNamesVisibility();saveProjectToStorage()});
const geo=feature(world,world.objects.features).features.filter(d=>d.properties.id!=='ATA');
const ISO2_TO_ISO3=Object.fromEntries(Object.entries(ISO3_TO_ISO2).map(([k,v])=>[v.toUpperCase(),k]));
const iso3Set=new Set(geo.map(d=>d.properties.id));
const NAME_ALIASES={'usa':'USA','us':'USA','united states':'USA','united states of america':'USA','uk':'GBR','britain':'GBR','great britain':'GBR','united kingdom':'GBR','south korea':'KOR','korea south':'KOR','korea rep':'KOR','north korea':'PRK','korea north':'PRK','korea dem peoples rep':'PRK','russia':'RUS','russian federation':'RUS','iran':'IRN','iran islamic rep':'IRN','syria':'SYR','syrian arab republic':'SYR','laos':'LAO','lao pdr':'LAO','vietnam':'VNM','viet nam':'VNM','czech republic':'CZE','czechia':'CZE','ivory coast':'CIV',"cote d'ivoire":'CIV','congo dr':'COD','dr congo':'COD','democratic republic of the congo':'COD','congo democratic republic':'COD','congo republic':'COG','republic of congo':'COG','congo rep':'COG','uae':'ARE','united arab emirates':'ARE','venezuela':'VEN','venezuela rb':'VEN','bolivia':'BOL','tanzania':'TZA','moldova':'MDA','palestine':'PSE','west bank and gaza':'PSE','egypt':'EGY','egypt arab rep':'EGY','swaziland':'SWZ','eswatini':'SWZ','macedonia':'MKD','north macedonia':'MKD','myanmar':'MMR','burma':'MMR','turkiye':'TUR','turkey':'TUR','brunei':'BRN','brunei darussalam':'BRN','cape verde':'CPV','cabo verde':'CPV','slovak republic':'SVK','kyrgyz republic':'KGZ','yemen rep':'YEM','gambia the':'GMB','bahamas the':'BHS'};
const normalizeName=s=>String(s).trim().toLowerCase().replace(/[.,'()]/g,'').replace(/\s+/g,' ');
const nameToIso3=new Map();
geo.forEach(d=>{const nm=normalizeName(d.properties.name||'');if(nm)nameToIso3.set(nm,d.properties.id)});
Object.entries(NAME_ALIASES).forEach(([nm,iso])=>{if(iso3Set.has(iso))nameToIso3.set(normalizeName(nm),iso)});
function resolveIso(codeRaw,nameRaw){if(codeRaw!=null&&codeRaw!==''){const c=String(codeRaw).trim().toUpperCase();if(/^[A-Z]{3}$/.test(c)&&iso3Set.has(c))return c;if(/^[A-Z]{2}$/.test(c)&&ISO2_TO_ISO3[c])return ISO2_TO_ISO3[c]}if(nameRaw!=null&&nameRaw!==''){const key=normalizeName(nameRaw);if(nameToIso3.has(key))return nameToIso3.get(key);for(const[nm,iso]of nameToIso3){if(nm.length>3&&(nm.includes(key)||key.includes(nm)))return iso}return 'x:'+key}return null}

function detectColumns(headers){const norm=headers.map(h=>String(h).trim().toLowerCase());const findBy=regexes=>{for(let i=0;i<headers.length;i++){if(regexes.some(r=>r.test(norm[i])))return headers[i]}return null};let nameCol=findBy([/^label$/,/country/,/entity/,/^name/,/ name/,/channel/,/item/,/product/,/company/,/brand/,/team/,/title/,/player/,/^city$/,/دول/,/بلد/,/اسم/]);const codeCol=findBy([/iso/,/code/,/رمز/]);const yearCol=findBy([/^year$/,/سنة/,/عام/,/year/]);const valueCol=findBy([/value/,/rate/,/amount/,/age/,/score/,/قيمة/,/نسبة/,/معدل/]);const imageCol=findBy([/image/,/photo/,/logo/,/avatar/,/صورة/,/شعار/]);const categoryCol=findBy([/categ/,/group/,/region/,/فئة/,/تصنيف/]);const yearHeaders=headers.filter(h=>{const m=String(h).trim().match(/^(\d{4})(?:\.0+)?$/);return m&&+m[1]>=1900&&+m[1]<=2100});if(!nameCol){const yearSet=new Set(yearHeaders);nameCol=headers.find(h=>!yearSet.has(h)&&h!==codeCol&&h!==imageCol&&h!==categoryCol&&h!==valueCol)||null}return{nameCol,codeCol,yearCol,valueCol,imageCol,categoryCol,yearHeaders}}

function autoMapToRows(json,headers){
  const{nameCol,codeCol,yearCol,valueCol,imageCol,categoryCol,yearHeaders}=detectColumns(headers);
  const out=[],images=new Map(),categories=new Map();
  const captureExtras=(iso,r)=>{if(imageCol&&iso&&r[imageCol])images.set(iso,String(r[imageCol]).trim());if(categoryCol&&iso&&r[categoryCol])categories.set(iso,String(r[categoryCol]).trim())};
  if(yearHeaders.length>=3&&nameCol){
    for(const r of json){
      const nm=r[nameCol];if(nm==null||nm==='')continue;
      const iso=resolveIso(codeCol?r[codeCol]:null,nm);if(!iso)continue;
      captureExtras(iso,r);
      for(const yh of yearHeaders){const v=r[yh];if(v==null||v==='')continue;const num=+v;if(!Number.isFinite(num))continue;out.push({name:String(nm).trim(),iso,year:+parseFloat(yh),value:num})}
    }
  }else if(nameCol&&yearCol&&valueCol){
    for(const r of json){
      const nm=r[nameCol];if(nm==null||nm==='')continue;
      const yr=+r[yearCol],val=+r[valueCol];if(!Number.isFinite(yr)||!Number.isFinite(val))continue;
      const iso=resolveIso(codeCol?r[codeCol]:null,nm);if(!iso)continue;
      captureExtras(iso,r);
      out.push({name:String(nm).trim(),iso,year:yr,value:val});
    }
  }
  return {rows:out,images,categories};
}

function applyDataset(ds){
  rows=ds.rows;names=ds.names;series=ds.series;imageByIso=ds.imageByIso||new Map();categoryByIso=ds.categoryByIso||new Map();
  SETTINGS.yearMin=ds.yearMin;SETTINGS.yearMax=ds.yearMax;
  manualNameOverrides.clear();manualImageOverrides.clear();manualAnnotations.clear();manualRectImage.clear();rectImgStyleByIso.clear();
  populateZoomCountrySelect();
  playing=false;selected=null;previousLeader=null;renderedLeaderIso=null;renderedLabelLeaderIso=null;renderedFocusedIso=null;leaderCentroid=null;beaconWrap.style('opacity',0);
  pathByIso.forEach(p=>{p.classList.remove('leader');p.classList.remove('focused')});
  root.querySelector('.race-play').textContent='▶';
  root.querySelector('.detail').classList.remove('show');
  root.querySelector('.annotation').classList.remove('show');
  const scrubberEl=root.querySelector('.scrubber');scrubberEl.min=SETTINGS.yearMin;scrubberEl.max=SETTINGS.yearMax;scrubberEl.value=SETTINGS.yearMin;
  const timelineSpans=root.querySelectorAll('.timeline-labels span'),tlSpan=SETTINGS.yearMax-SETTINGS.yearMin;
  timelineSpans.forEach((el,i)=>{el.textContent=Math.round(SETTINGS.yearMin+tlSpan*i/(timelineSpans.length-1))});
  svg.transition().duration(400).call(zoom.transform,d3.zoomIdentity);
  current=SETTINGS.yearMin;
  resize();
  if(SETTINGS.zoomMode==='fixed')focusFixedCountry();
  seedGridFromDataset();renderGrid();syncGridToChart(true);
}

const projection=d3.geoNaturalEarth1(),path=d3.geoPath(projection);
const zoom=d3.zoom().scaleExtent([1,12]).on('zoom',e=>{mapG.attr('transform',e.transform);currentZoomK=e.transform.k;updateBeaconTransform()});
svg.call(zoom).on('dblclick.zoom',null);
let W=0,H=0,current=SETTINGS.yearMin,playing=false,lastTime=0,selected=null,annotationTimer=null,cinemaTimer=null,previousLeader=null,zoomIntensity=1,recording=false,zoomFixedIso=null;
let renderedLeaderIso=null,renderedLabelLeaderIso=null,renderedFocusedIso=null;
const SPEED_LEVELS=[0.5,1,2,4,8];let speedIdx=1;
const pathByIso=new Map(),labelByIso=new Map(),boundsByIso=new Map(),centroidByIso=new Map();
const valuesAt=y=>{const lo=Math.floor(y),hi=Math.min(SETTINGS.yearMax,Math.ceil(y)),t=y-lo,m=new Map();for(const[iso,recs]of series){const a=recs.find(d=>d.year===lo),b=recs.find(d=>d.year===hi);let v=null;if(a&&b)v=a.value+(b.value-a.value)*t;else if(a)v=a.value;else if(b)v=b.value;else{let before=null,after=null;for(const d of recs){if(d.year<=lo&&(!before||d.year>before.year))before=d;if(d.year>=hi&&(!after||d.year<after.year))after=d}if(before)v=before.value;else if(after)v=after.value}if(v!=null)m.set(iso,v)}return m};
const rankedFromVals=vals=>Array.from(vals,([iso,value])=>({iso,value,name:names.get(iso)||iso})).sort((a,b)=>b.value-a.value);
const rankedAt=y=>rankedFromVals(valuesAt(y));

function mainLandFeature(f){if(f.geometry.type!=='MultiPolygon')return f;const polys=f.geometry.coordinates;let best=polys[0],bestArea=-1;for(const poly of polys){const a=Math.abs(d3.geoArea({type:'Polygon',coordinates:poly}));if(a>bestArea){bestArea=a;best=poly}}return{type:'Feature',properties:f.properties,geometry:{type:'Polygon',coordinates:best}}}
function buildFlagPatterns(){svgDefs.selectAll('pattern.flag-pattern').remove();pathByIso.forEach((node,iso)=>{const url=flagUrl(iso);if(!url){node.setAttribute('fill',activeLand);return}const b=boundsByIso.get(iso);if(!b){node.setAttribute('fill',activeLand);return}const[[x0,y0],[x1,y1]]=b,w=x1-x0,h=y1-y0;if(!w||!h){node.setAttribute('fill',activeLand);return}const patId='flagpat-'+iso;svgDefs.append('pattern').attr('class','flag-pattern').attr('id',patId).attr('patternUnits','userSpaceOnUse').attr('x',x0).attr('y',y0).attr('width',w).attr('height',h).append('image').attr('href',url).attr('x',0).attr('y',0).attr('width',w).attr('height',h).attr('preserveAspectRatio','xMidYMid slice');node.setAttribute('fill',`url(#${patId})`)})}
let flagPatternTimer=null;
function scheduleFlagPatterns(){if(!SETTINGS.flags.show)return;clearTimeout(flagPatternTimer);flagPatternTimer=setTimeout(buildFlagPatterns,150)}
function resize(){if(root.querySelector('.preview-view').offsetParent===null)return;const r=mapPanelEl.getBoundingClientRect();W=r.width||1;H=r.height||1;svg.attr('viewBox',`0 0 ${W} ${H}`);projection.fitExtent([[20,20],[W-20,H-20]],{type:'FeatureCollection',features:geo});countryG.selectAll('path').attr('d',path);scheduleFlagPatterns();boundsByIso.clear();centroidByIso.clear();for(const f of geo){const mf=mainLandFeature(f);boundsByIso.set(f.properties.id,path.bounds(mf));centroidByIso.set(f.properties.id,path.centroid(mf))}renderStaticLabels();if(renderedLeaderIso){leaderCentroid=centroidByIso.get(renderedLeaderIso)||null;updateBeaconTransform()}render(current,false)}
let settingsResizeTimer=null;
function scheduleResize(){clearTimeout(settingsResizeTimer);settingsResizeTimer=setTimeout(resize,120)}
function renderStaticLabels(){labelG.selectAll('*').remove();labelByIso.clear();renderedLabelLeaderIso=null;labelG.selectAll('text.country-name').data(geo,d=>d.properties.id).join('text').attr('class','country-name').attr('transform',d=>{const c=path.centroid(d);return `translate(${c[0]},${c[1]})`}).style('font-size',d=>{const a=path.area(d);return a>5000?'11px':a>1400?'9.5px':a>300?'8px':a>60?'6.5px':'5.5px'}).style('opacity',1).text(d=>displayName(d.properties.id,names.get(d.properties.id)||d.properties.name||d.properties.id)).each(function(d){labelByIso.set(d.properties.id,this)})}
function applyLeaderVisual(iso){if(iso!==renderedLeaderIso){const prev=renderedLeaderIso;if(prev){const p=pathByIso.get(prev);if(p){if(!SETTINGS.flags.show)p.setAttribute('fill',activeLand);p.classList.remove('leader')}}if(iso){const n=pathByIso.get(iso);if(n){if(!SETTINGS.flags.show)n.setAttribute('fill',T.accent);n.classList.add('leader')}}renderedLeaderIso=iso;if(iso&&centroidByIso.has(iso)){leaderCentroid=centroidByIso.get(iso);updateBeaconTransform();beaconWrap.style('opacity',1)}else{leaderCentroid=null;beaconWrap.style('opacity',0)}}if(iso!==renderedLabelLeaderIso){const prevL=renderedLabelLeaderIso;if(prevL===null&&iso){labelByIso.forEach(el=>{el.style.opacity=0});const el=labelByIso.get(iso);if(el)el.style.opacity=1}else if(prevL&&iso===null){labelByIso.forEach(el=>{el.style.opacity=1})}else{if(prevL){const el=labelByIso.get(prevL);if(el)el.style.opacity=0}if(iso){const el=labelByIso.get(iso);if(el)el.style.opacity=1}}renderedLabelLeaderIso=iso}}
function applyFocusVisual(iso){if(iso===renderedFocusedIso)return;if(renderedFocusedIso){const p=pathByIso.get(renderedFocusedIso);if(p)p.classList.remove('focused')}if(iso){const p=pathByIso.get(iso);if(p)p.classList.add('focused')}renderedFocusedIso=iso}

let barSettings={...SETTINGS.bar};
let axisMode={fixed:false,max:100};
function applyBarSettings(){
  renderRanking(rankedAt(current));
  scheduleResize();
  saveProjectToStorage();
}
function renderRanking(ranked){
  const top=ranked.slice(0,SETTINGS.topCountries||10),max=axisMode.fixed?(axisMode.max||1):(top.length?top[0].value:1);
  const listEl=root.querySelector('.rank-list');
  const vertical=barSettings.orientation==='vertical';
  listEl.classList.toggle('vertical',vertical);
  const availH=listEl.clientHeight||520;
  const rowH=vertical?availH:availH/Math.max(top.length,1);
  const colW=64;
  const sel=d3.select(listEl).selectAll('.rank-row').data(top,d=>d.iso);
  const exitSel=sel.exit().filter(function(){return !this.classList.contains('exiting')}).classed('exiting',true);
  exitSel.style('opacity',0).style('transform',vertical?`translateX(${top.length*colW}px)`:`translateY(${top.length*rowH}px)`);
  exitSel.transition().duration(520).remove();
  const e=sel.enter().append('div').attr('class','rank-row').style('opacity',0).on('click',(evt,d)=>selectCountry(d.iso));
  e.append('span').attr('class','rank-name');
  const track=e.append('div').attr('class','rank-bar-track');
  const bar=track.append('div').attr('class','rank-bar');
  const clip=bar.append('div').attr('class','rank-bar-clip');
  clip.append('span').attr('class','rank-note');
  clip.append('div').attr('class','rank-rectimg-wrap').append('img').attr('class','rank-rectimg').attr('alt','');
  bar.append('img').attr('class','flag rank-flag').attr('alt','').attr('onerror',"this.style.visibility='hidden'");
  track.append('span').attr('class','rank-value');
  e.transition().duration(300).style('opacity',1);
  const merged=e.merge(sel);
  merged.interrupt().classed('exiting',false).style('opacity',1).style('transform',null).style('left',null).style('height',vertical?null:rowH+'px');
  if(vertical){merged.style('left',(d,i)=>`${i*colW}px`)}
  else{merged.style('transform',(d,i)=>`translateY(${i*rowH}px)`)}
  merged.each(function(d,i){
    const q=d3.select(this),pct=max?Math.min(100,Math.max(4,Math.pow(Math.max(0,d.value)/max,barScaleExponent)*100)):4;
    const nm=displayName(d.iso,d.name),col=colorForIso(d.iso);
    const bar=q.select('.rank-bar').style('background',col).classed('lead',i===0);
    if(vertical){bar.style('height',pct+'%').style('width',null)}else{bar.style('width',pct+'%').style('height',null)}
    q.select('.rank-name').text(nm);
    setFlag(q.select('.rank-flag').node(),d.iso,nm);
    q.select('.rank-value').text(formatValue(d.value));
    const note=manualAnnotations.get(d.iso)||'';
    q.select('.rank-note').text(note).style('display',note?'':'none').style('left',noteStyle.x+'%').style('top',noteStyle.y+'%').style('transform',`translate(-${noteStyle.x}%,-${noteStyle.y}%)`);
    const rectUrl=manualRectImage.get(d.iso),rs=getRectImgStyle(d.iso);
    q.select('.rank-rectimg-wrap').style('width',rs.width+'px').style('height',rs.height+'px').style('display',rectUrl?'block':'none').style('left',rs.x+'%').style('top',rs.y+'%').style('transform',`translate(-${rs.x}%,-${rs.y}%)`);
    const rectNode=ensureMediaTag(q.select('.rank-rectimg').node(),rectUrl);
    if(rectNode){
      if(rectUrl){if(rectNode.getAttribute('src')!==rectUrl)rectNode.src=rectUrl}else{rectNode.removeAttribute('src')}
      d3.select(rectNode).style('object-position',rs.posX+'% '+rs.posY+'%').style('transform-origin',rs.posX+'% '+rs.posY+'%').style('transform',`scale(${rs.zoom||1})`);
    }
  });
}
function renderLeaderSpotlight(ranked){
  const leader=ranked[0]||null;
  const nameEl=root.querySelector('.leader-spot-name'),valEl=root.querySelector('.leader-spot-value'),barEl=root.querySelector('.leader-spot-bar'),flagEl=root.querySelector('.leader-spot-flag');
  if(!leader){nameEl.textContent='';valEl.textContent='';barEl.style.background='';flagEl.removeAttribute('src');return}
  const nm=displayName(leader.iso,leader.name);
  nameEl.textContent=nm;
  valEl.textContent=formatValue(leader.value);
  barEl.style.background=colorForIso(leader.iso);
  setFlag(flagEl,leader.iso,nm);
}

function render(y,animate=true){current=Math.max(SETTINGS.yearMin,Math.min(SETTINGS.yearMax,y));const vals=valuesAt(current),ranked=rankedFromVals(vals),ranks=new Map(ranked.map((d,i)=>[d.iso,i+1]));const leader=ranked[0]||null,leaderIso=leader?leader.iso:null;root.querySelector('.year').textContent=Math.round(current);root.querySelector('.scrubber').value=current;applyLeaderVisual(leaderIso);applyFocusVisual(selected);renderRanking(ranked);renderLeaderSpotlight(ranked);if(leaderIso!==previousLeader){if(leader)showAnnotation(SETTINGS.labels.announcement.replace('{name}',displayName(leader.iso,leader.name)));cinematicFocus(leaderIso);previousLeader=leaderIso}root._vals=vals;root._ranks=ranks;if(selected){updateSparkFrame(selected);updateDetailPreview(selected)}}
function showAnnotation(text){const el=root.querySelector('.annotation');clearTimeout(annotationTimer);el.textContent=text;el.classList.add('show');annotationTimer=setTimeout(()=>el.classList.remove('show'),2300)}
function focusTransform(iso){const b=boundsByIso.get(iso);if(!b)return null;const [[x0,y0],[x1,y1]]=b,cx=(x0+x1)/2,cy=(y0+y1)/2,dx=x1-x0,dy=y1-y0;const baseK=Math.min(9.5,Math.max(4.2,2.3/Math.max(dx/W,dy/H)));const k=Math.min(12,Math.max(1,baseK*zoomIntensity));return d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-cx,-cy)}
function cinematicFocus(iso){if(selected||SETTINGS.zoomMode!=='leader'||!iso)return;clearTimeout(cinemaTimer);const t=focusTransform(iso);if(t)svg.interrupt().call(zoom.transform,t)}
function focusFixedCountry(){if(SETTINGS.zoomMode!=='fixed'||!zoomFixedIso||selected)return;const t=focusTransform(zoomFixedIso);if(t)svg.interrupt().transition().duration(850).call(zoom.transform,t)}
function tick(ts){if(!playing)return;if(!lastTime)lastTime=ts;current+=(ts-lastTime)/SETTINGS.millisecondsPerYear*SPEED_LEVELS[speedIdx];lastTime=ts;if(current>=SETTINGS.yearMax){current=SETTINGS.yearMax;playing=false;root.querySelector('.race-play').textContent='▶';root.querySelector('.race-play').setAttribute('aria-label','Play animation');if(recording)stopRecording()}try{render(current,true)}catch(err){console.error('render() failed during playback, continuing:',err)}if(playing)requestAnimationFrame(tick)}
root.querySelector('.race-play').addEventListener('click',()=>{if(current>=SETTINGS.yearMax)current=SETTINGS.yearMin;playing=!playing;lastTime=0;const btn=root.querySelector('.race-play');btn.textContent=playing?'❚❚':'▶';btn.setAttribute('aria-label',playing?'Pause animation':'Play animation');if(playing)requestAnimationFrame(tick)});
root.querySelector('.race-restart').addEventListener('click',()=>{playing=false;lastTime=0;const btn=root.querySelector('.race-play');btn.textContent='▶';btn.setAttribute('aria-label','Play animation');render(SETTINGS.yearMin,false)});
root.querySelector('.fullscreen-btn').addEventListener('click',()=>{if(!document.fullscreenElement){(root.requestFullscreen||root.webkitRequestFullscreen)?.call(root)}else{(document.exitFullscreen||document.webkitExitFullscreen)?.call(document)}});
root.querySelector('.speed').addEventListener('click',()=>{speedIdx=(speedIdx+1)%SPEED_LEVELS.length;lastTime=0;const btn=root.querySelector('.speed');btn.textContent=SPEED_LEVELS[speedIdx]+'×';btn.setAttribute('aria-label',`Playback speed ${SPEED_LEVELS[speedIdx]}x`)});
root.querySelector('.scrubber').addEventListener('input',e=>{playing=false;root.querySelector('.race-play').textContent='▶';render(+e.target.value,true)});
function tooltip(e,d){const iso=d.properties.id,val=root._vals.get(iso),rank=root._ranks.get(iso),tip=root.querySelector('.tooltip'),name=displayName(iso,names.get(iso)||d.properties.name||iso);root.querySelector('.tip-name').textContent=name;setFlag(root.querySelector('.tip-flag'),iso,name);root.querySelector('.tip-value').textContent=val==null?'No data':formatValue(val);root.querySelector('.tip-rank').textContent=rank?'#'+rank:'—';root.querySelector('.tip-year').textContent=Math.round(current);const rr=mapPanelEl.getBoundingClientRect();tip.style.left=Math.min(rr.width-175,e.clientX-rr.left+14)+'px';tip.style.top=Math.min(rr.height-115,e.clientY-rr.top+14)+'px';tip.classList.add('show')}
function updateDetailPreview(iso){
  const cname=displayName(iso,names.get(iso)||iso);
  const val=valuesAt(current).get(iso);
  root.querySelector('.dp-name').textContent=cname;
  root.querySelector('.dp-value').textContent=formatValue(val);
  setFlag(root.querySelector('.dp-flag'),iso,cname);
  const rankedNow=rankedAt(current),max=rankedNow.length?rankedNow[0].value:1;
  const pct=(val!=null&&max)?Math.min(100,Math.max(4,(val/max)*100)):20;
  root.querySelector('.dp-bar').style.width=pct+'%';
  root.querySelector('.dp-bar').style.background=colorForIso(iso);
}
function selectCountry(iso){selected=iso;root.querySelector('.detail').classList.add('show');const cname=displayName(iso,names.get(iso)||iso);root.querySelector('.detail-name').value=cname;root.querySelector('.annot-text').value=manualAnnotations.get(iso)||'';setFlag(root.querySelector('.detail-flag'),iso,cname);updateDetailPreview(iso);syncDetailRectImgUI(iso);root.querySelector('.detail-apply-btn').classList.remove('applied');root.querySelector('.detail-apply-btn').textContent='✓ Apply to bar';const b=boundsByIso.get(iso);if(b){const [[x0,y0],[x1,y1]]=b,cx=(x0+x1)/2,cy=(y0+y1)/2,k=Math.min(4.8,.55/Math.max((x1-x0)/W,(y1-y0)/H));svg.transition().duration(850).call(zoom.transform,d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-cx,-cy))}render(current,false);drawSpark(iso)}
function drawSpark(iso){
  const data=series.get(iso)||[],sEl=root.querySelector('.spark'),s=d3.select(sEl);
  const rect=sEl.getBoundingClientRect(),w=Math.max(80,rect.width||420),h=Math.max(50,rect.height||220);
  s.attr('viewBox',`0 0 ${w} ${h}`).selectAll('*').remove();
  if(!data.length){sEl.__scaleX=null;sEl.__scaleY=null;return}
  const x=d3.scaleLinear([SETTINGS.yearMin,SETTINGS.yearMax],[10,w-10]),y=d3.scaleLinear([0,d3.max(data,d=>d.value)||1],[h-16,16]);
  s.append('path').attr('class','spark-line').datum(data).attr('fill','none').attr('stroke',T.accentSoft).attr('stroke-width',2.6).attr('d',d3.line().defined(d=>Number.isFinite(d.value)).x(d=>x(d.year)).y(d=>y(d.value)));
  s.append('circle').attr('class','spark-dot').attr('r',4.5).attr('fill','#fff');
  s.append('text').attr('class','spark-annot').attr('x',14).attr('y',26).attr('fill','#fff').attr('font-size',15).attr('font-weight',600).attr('paint-order','stroke').attr('stroke','rgba(0,0,0,.85)').attr('stroke-width',4).attr('stroke-linejoin','round');
  sEl.__scaleX=x;sEl.__scaleY=y;
  updateSparkFrame(iso);
}
function updateSparkFrame(iso){
  const sEl=root.querySelector('.spark'),x=sEl.__scaleX,y=sEl.__scaleY;
  if(!x||!y)return;
  const val=valuesAt(current).get(iso);
  const dot=d3.select(sEl).select('.spark-dot');
  if(val!=null){dot.attr('cx',x(current)).attr('cy',y(val)).style('display',null)}else{dot.style('display','none')}
  const annotEl=root.querySelector('.annot-text'),annotText=annotEl?annotEl.value.trim():'';
  d3.select(sEl).select('.spark-annot').text(annotText).style('display',annotText?null:'none');
}
root.querySelector('.detail button').addEventListener('click',()=>{selected=null;root.querySelector('.detail').classList.remove('show');const t=SETTINGS.zoomMode==='fixed'&&zoomFixedIso?focusTransform(zoomFixedIso):d3.zoomIdentity;svg.transition().duration(750).call(zoom.transform,t);render(current,false)});
root.querySelector('.annot-text').addEventListener('input',e=>{if(!selected)return;const val=e.target.value.trim();if(val)manualAnnotations.set(selected,val);else manualAnnotations.delete(selected);updateSparkFrame(selected);renderRanking(rankedAt(current))});
root.querySelector('.detail-name').addEventListener('input',e=>{if(!selected)return;const val=e.target.value.trim();if(val)manualNameOverrides.set(selected,val);else manualNameOverrides.delete(selected);renderRanking(rankedAt(current));renderStaticLabels();updateDetailPreview(selected);root.querySelector('.detail-apply-btn').classList.remove('applied');root.querySelector('.detail-apply-btn').textContent='✓ Apply to bar';});
root.querySelector('.annot-image').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  if(!selected){alert('Select a country from the map or one of the bars first.');e.target.value='';return}
  const reader=new FileReader();
  reader.onload=()=>{
    manualImageOverrides.set(selected,reader.result);
    setFlag(root.querySelector('.detail-flag'),selected,root.querySelector('.detail-name').value);
    renderRanking(rankedAt(current));
    updateDetailPreview(selected);
    root.querySelector('.detail-apply-btn').classList.remove('applied');
    root.querySelector('.detail-apply-btn').textContent='✓ Apply to bar';
  };
  reader.readAsDataURL(file);
});
root.querySelector('.detail-apply-btn').addEventListener('click',()=>{
  if(!selected)return;
  const btn=root.querySelector('.detail-apply-btn');
  renderRanking(rankedAt(current));renderStaticLabels();updateDetailPreview(selected);
  saveProjectToStorage();
  btn.classList.add('applied');btn.textContent='✓ Applied';
  setTimeout(()=>{btn.classList.remove('applied');btn.textContent='✓ Apply to bar'},1600);
});

// ===== Settings drawer =====
const settingsBtn=root.querySelector('.settings-btn'),settingsPanel=root.querySelector('.settings-panel');
settingsBtn.addEventListener('click',()=>{settingsPanel.hidden=!settingsPanel.hidden});
root.querySelector('.settings-close').addEventListener('click',()=>{settingsPanel.hidden=true});
root.querySelectorAll('.settings-section-toggle').forEach(btn=>{
  const body=btn.nextElementSibling;
  btn.setAttribute('aria-expanded','false');
  btn.addEventListener('click',()=>{
    const open=body.hidden;
    body.hidden=!open;
    btn.setAttribute('aria-expanded',String(open));
  });
});
root.querySelector('.set-orientation').addEventListener('change',e=>{barSettings.orientation=e.target.value;applyBarSettings()});
root.querySelectorAll('.rail-palette').forEach(btn=>btn.addEventListener('click',()=>{paletteIdx=(paletteIdx+1)%PALETTES.length;colorCache.clear();renderRanking(rankedAt(current));drawMiniPreview();saveProjectToStorage()}));

// ===== Appearance & data-display settings =====
root.querySelector('.set-topn').addEventListener('input',e=>setTopN(+e.target.value));
const fixedAxisCheckbox=root.querySelector('.set-fixed-axis'),axisMaxWrap=root.querySelector('.fixed-axis-max-wrap'),axisMaxInput=root.querySelector('.set-axis-max');
fixedAxisCheckbox.addEventListener('change',e=>{axisMode.fixed=e.target.checked;axisMaxWrap.hidden=!axisMode.fixed;renderRanking(rankedAt(current))});
axisMaxInput.addEventListener('input',e=>{axisMode.max=+e.target.value||1;if(axisMode.fixed)renderRanking(rankedAt(current))});

const IMG_SHAPES={rounded:'8px',circle:'50%',square:'2px'};
let imgShapeKey='rounded',imgSizePx=26;
function applyImageStyle(){root.style.setProperty('--flag-w',imgSizePx+'px');root.style.setProperty('--flag-h',imgSizePx+'px');root.style.setProperty('--flag-radius',IMG_SHAPES[imgShapeKey])}
root.querySelector('.set-imgshape').addEventListener('change',e=>{imgShapeKey=e.target.value;applyImageStyle();saveProjectToStorage()});
root.querySelector('.set-imgsize').addEventListener('input',e=>{imgSizePx=+e.target.value;root.querySelector('.set-imgsize-val').textContent=imgSizePx;applyImageStyle();saveProjectToStorage()});
applyImageStyle();

// Bar caption text styling
function applyNoteVars(){root.style.setProperty('--note-color',noteStyle.color);root.style.setProperty('--note-size',noteStyle.size+'px')}
root.querySelector('.set-note-x').addEventListener('input',e=>{noteStyle.x=+e.target.value;root.querySelector('.set-note-x-val').textContent=noteStyle.x;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.set-note-y').addEventListener('input',e=>{noteStyle.y=+e.target.value;root.querySelector('.set-note-y-val').textContent=noteStyle.y;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.set-note-color').addEventListener('input',e=>{noteStyle.color=e.target.value;applyNoteVars();saveProjectToStorage()});
root.querySelector('.set-note-size').addEventListener('input',e=>{noteStyle.size=+e.target.value;root.querySelector('.set-note-size-val').textContent=noteStyle.size;applyNoteVars();saveProjectToStorage()});
applyNoteVars();

// Bar rectangular image styling — independent per country, edited from the detail panel
function syncDetailRectImgUI(iso){
  const rs=getRectImgStyle(iso);
  root.querySelector('.det-rectimg-w').value=rs.width;root.querySelector('.det-rectimg-w-val').textContent=rs.width;
  root.querySelector('.det-rectimg-h').value=rs.height;root.querySelector('.det-rectimg-h-val').textContent=rs.height;
  root.querySelector('.det-rectimg-x').value=rs.x;root.querySelector('.det-rectimg-x-val').textContent=rs.x;
  root.querySelector('.det-rectimg-y').value=rs.y;root.querySelector('.det-rectimg-y-val').textContent=rs.y;
  root.querySelector('.det-rectimg-px').value=rs.posX;root.querySelector('.det-rectimg-px-val').textContent=rs.posX;
  root.querySelector('.det-rectimg-py').value=rs.posY;root.querySelector('.det-rectimg-py-val').textContent=rs.posY;
  root.querySelector('.det-rectimg-zoom').value=rs.zoom||1;root.querySelector('.det-rectimg-zoom-val').textContent=(rs.zoom||1).toFixed(1);
}
root.querySelector('.det-rectimg-w').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).width=+e.target.value;root.querySelector('.det-rectimg-w-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-h').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).height=+e.target.value;root.querySelector('.det-rectimg-h-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-x').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).x=+e.target.value;root.querySelector('.det-rectimg-x-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-y').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).y=+e.target.value;root.querySelector('.det-rectimg-y-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-px').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).posX=+e.target.value;root.querySelector('.det-rectimg-px-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-py').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).posY=+e.target.value;root.querySelector('.det-rectimg-py-val').textContent=e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.det-rectimg-zoom').addEventListener('input',e=>{if(!selected)return;ensureRectImgStyle(selected).zoom=+e.target.value;root.querySelector('.det-rectimg-zoom-val').textContent=(+e.target.value).toFixed(1);renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.annot-rectimg').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  if(!selected){alert('Select a country from the map or one of the bars first.');e.target.value='';return}
  const reader=new FileReader();
  reader.onload=()=>{manualRectImage.set(selected,reader.result);renderRanking(rankedAt(current));saveProjectToStorage()};
  reader.readAsDataURL(file);
});
root.querySelector('.annot-rectimg-clear').addEventListener('click',()=>{if(!selected)return;manualRectImage.delete(selected);rectImgStyleByIso.delete(selected);syncDetailRectImgUI(selected);renderRanking(rankedAt(current));saveProjectToStorage()});

// Bar thickness (height in horizontal mode) and bar length (how much of the row's width the bar-track gets)
let barThicknessPct=66,barLengthPct=85,barScaleExponent=1;
root.querySelector('.set-thickness').addEventListener('input',e=>{barThicknessPct=+e.target.value;root.querySelector('.set-thickness-val').textContent=barThicknessPct;root.style.setProperty('--bar-thickness',barThicknessPct+'%');saveProjectToStorage()});
root.style.setProperty('--bar-thickness',barThicknessPct+'%');
function applyBarLength(){root.style.setProperty('--barspacer-w',Math.max(0,85-barLengthPct)+'%')}
root.querySelector('.set-barlength').addEventListener('input',e=>{barLengthPct=+e.target.value;root.querySelector('.set-barlength-val').textContent=barLengthPct;applyBarLength();saveProjectToStorage()});
applyBarLength();
root.querySelector('.set-barscale').addEventListener('input',e=>{barScaleExponent=+e.target.value;root.querySelector('.set-barscale-val').textContent=barScaleExponent.toFixed(2);renderRanking(rankedAt(current));saveProjectToStorage()});

// Bar count — quick access in the rail, mirrored in settings
function syncTopNUI(){root.querySelector('.set-topn').value=SETTINGS.topCountries;root.querySelector('.set-topn-val').textContent=SETTINGS.topCountries}
function setTopN(n){SETTINGS.topCountries=Math.max(3,Math.min(30,n));syncTopNUI();renderRanking(rankedAt(current));drawMiniPreview();saveProjectToStorage()}
syncTopNUI();

// Year display: color, size, and free dragging within the race panel
let yearColor=null,yearScale=1,yearPos=null; // yearPos: {left,top} in % of race-panel, once dragged
const yearEl=root.querySelector('.year');
function applyYearStyle(){
  root.style.setProperty('--year-scale',yearScale);
  if(yearColor)root.style.setProperty('--year-color',yearColor);
  if(yearPos){yearEl.style.left=yearPos.left+'%';yearEl.style.top=yearPos.top+'%';yearEl.style.right='auto';yearEl.style.bottom='auto'}
}
root.querySelector('.set-year-color').addEventListener('input',e=>{yearColor=e.target.value;applyYearStyle();saveProjectToStorage()});
root.querySelector('.set-year-size').addEventListener('input',e=>{yearScale=+e.target.value/100;root.querySelector('.set-year-size-val').textContent=e.target.value;applyYearStyle();saveProjectToStorage()});
root.querySelector('.year-reset-btn').addEventListener('click',()=>{yearPos=null;yearEl.style.left='';yearEl.style.top='';yearEl.style.right='';yearEl.style.bottom='';saveProjectToStorage()});
(function enableYearDrag(){
  let dragging=false,startX=0,startY=0,panelRect=null;
  yearEl.addEventListener('pointerdown',e=>{
    dragging=true;yearEl.classList.add('dragging');yearEl.setPointerCapture(e.pointerId);
    panelRect=root.querySelector('.race-panel').getBoundingClientRect();
    startX=e.clientX;startY=e.clientY;
  });
  yearEl.addEventListener('pointermove',e=>{
    if(!dragging||!panelRect)return;
    const leftPct=Math.min(96,Math.max(0,((e.clientX-panelRect.left)/panelRect.width)*100));
    const topPct=Math.min(96,Math.max(0,((e.clientY-panelRect.top)/panelRect.height)*100));
    yearPos={left:leftPct,top:topPct};
    yearEl.style.left=leftPct+'%';yearEl.style.top=topPct+'%';yearEl.style.right='auto';yearEl.style.bottom='auto';
  });
  const endDrag=e=>{if(!dragging)return;dragging=false;yearEl.classList.remove('dragging');saveProjectToStorage()};
  yearEl.addEventListener('pointerup',endDrag);
  yearEl.addEventListener('pointercancel',endDrag);
})();

let customBgDark=null,customBgLight=null;
root.querySelector('.set-bgcolor-dark').addEventListener('input',e=>{customBgDark=e.target.value;applyMode(mode);saveProjectToStorage()});
root.querySelector('.set-bgcolor-light').addEventListener('input',e=>{customBgLight=e.target.value;applyMode(mode);saveProjectToStorage()});
root.querySelector('.set-font').addEventListener('change',e=>{root.style.fontFamily=e.target.value;saveProjectToStorage()});
root.querySelector('.set-fontsize').addEventListener('input',e=>{const pct=+e.target.value;root.style.setProperty('--font-scale',pct/100);root.querySelector('.set-fontsize-val').textContent=pct;saveProjectToStorage()});
root.querySelector('.set-decimals').addEventListener('change',e=>{numberFormat.decimals=+e.target.value;renderRanking(rankedAt(current));saveProjectToStorage()});
root.querySelector('.set-unit').addEventListener('input',e=>{numberFormat.unit=e.target.value.trim();renderRanking(rankedAt(current));saveProjectToStorage()});

let canvasPreset='fill',customCanvasW=1280,customCanvasH=720;
function applyCanvasPreset(){
  root.querySelector('.custom-canvas-row').hidden=canvasPreset!=='custom';
  root.classList.toggle('canvas-fixed',canvasPreset!=='fill');
  if(canvasPreset==='fill'){root.style.width='';root.style.height='100vh';root.style.height='100dvh';root.style.margin='';document.body.style.display='';document.body.style.background='';return}
  const vw=window.innerWidth,vh=window.innerHeight;
  let w,h;
  if(canvasPreset==='custom'){
    w=Math.min(customCanvasW,vw);h=Math.min(customCanvasH,vh);
    const scale=Math.min(w/customCanvasW,h/customCanvasH);
    w=customCanvasW*scale;h=customCanvasH*scale;
  }else{
    const ratios={'16:9':16/9,'9:16':9/16,'1:1':1},ratio=ratios[canvasPreset]||16/9;
    w=vw;h=w/ratio;if(h>vh){h=vh;w=h*ratio}
  }
  root.style.width=w+'px';root.style.height=h+'px';root.style.margin='0';
  document.body.style.display='flex';document.body.style.alignItems='center';document.body.style.justifyContent='center';document.body.style.background='#000';
}
root.querySelector('.set-canvas').addEventListener('change',e=>{canvasPreset=e.target.value;applyCanvasPreset();setTimeout(resize,60);saveProjectToStorage()});
root.querySelector('.set-canvas-w').addEventListener('input',e=>{customCanvasW=Math.max(200,+e.target.value||1280);if(canvasPreset==='custom'){applyCanvasPreset();setTimeout(resize,60)}saveProjectToStorage()});
root.querySelector('.set-canvas-h').addEventListener('input',e=>{customCanvasH=Math.max(200,+e.target.value||720);if(canvasPreset==='custom'){applyCanvasPreset();setTimeout(resize,60)}saveProjectToStorage()});
root.querySelector('.zoom-in').addEventListener('click',()=>svg.transition().duration(300).call(zoom.scaleBy,1.5));
root.querySelector('.zoom-out').addEventListener('click',()=>svg.transition().duration(300).call(zoom.scaleBy,1/1.5));
root.querySelector('.zoom-intensity').addEventListener('input',e=>{zoomIntensity=+e.target.value;root.querySelector('.set-zoom-val').textContent=zoomIntensity.toFixed(1);if(SETTINGS.zoomMode==='fixed')focusFixedCountry()});
root.querySelector('.zoom-reset-btn').addEventListener('click',()=>svg.interrupt().transition().duration(500).call(zoom.transform,d3.zoomIdentity));
function populateZoomCountrySelect(){
  const sel=root.querySelector('.zoom-fixed-country');
  const list=geo.map(f=>({iso:f.properties.id,name:displayName(f.properties.id,names.get(f.properties.id)||f.properties.name||f.properties.id)})).sort((a,b)=>a.name.localeCompare(b.name));
  const keep=zoomFixedIso&&list.some(d=>d.iso===zoomFixedIso)?zoomFixedIso:(list[0]?list[0].iso:null);
  sel.textContent='';
  for(const d of list){const opt=document.createElement('option');opt.value=d.iso;opt.textContent=d.name;sel.appendChild(opt)}
  if(keep)sel.value=keep;
}
populateZoomCountrySelect();
const zoomModeSelect=root.querySelector('.zoom-mode-select'),zoomFixedRow=root.querySelector('.zoom-fixed-country-row'),zoomFixedSelect=root.querySelector('.zoom-fixed-country');
function applyZoomModeUI(){zoomModeSelect.value=SETTINGS.zoomMode;zoomFixedRow.hidden=SETTINGS.zoomMode!=='fixed'}
applyZoomModeUI();
zoomModeSelect.addEventListener('change',e=>{
  SETTINGS.zoomMode=e.target.value;
  applyZoomModeUI();
  if(SETTINGS.zoomMode==='fixed'){if(!zoomFixedIso)zoomFixedIso=zoomFixedSelect.value||null;focusFixedCountry()}
  saveProjectToStorage();
});
zoomFixedSelect.addEventListener('change',e=>{zoomFixedIso=e.target.value||null;focusFixedCountry();saveProjectToStorage()});

// ===== Video recording =====
const recordBtn=root.querySelector('.record-btn'),recordingIndicator=root.querySelector('.recording-indicator');
let mediaRecorder=null,recordedChunks=[];
function setRecordingUI(isRecording){recordBtn.hidden=isRecording;recordingIndicator.hidden=!isRecording}
function stopRecording(){if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop()}
async function startRecording(){if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){alert("Recording isn't supported in this browser — try Chrome or Edge.");return}try{const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false,preferCurrentTab:true});const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'video/webm';recordedChunks=[];mediaRecorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:12000000});mediaRecorder.ondataavailable=e=>{if(e.data&&e.data.size>0)recordedChunks.push(e.data)};mediaRecorder.onstop=()=>{const blob=new Blob(recordedChunks,{type:mimeType}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(SETTINGS.labels.title||'video').replace(/\s+/g,'_')+'.webm';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);stream.getTracks().forEach(t=>t.stop());recording=false;setRecordingUI(false)};stream.getVideoTracks()[0].addEventListener('ended',()=>{if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop()});mediaRecorder.start();recording=true;setRecordingUI(true);current=SETTINGS.yearMin;lastTime=0;playing=true;root.querySelector('.race-play').textContent='❚❚';requestAnimationFrame(tick)}catch(err){if(err&&err.name!=='NotAllowedError')alert('Could not start recording: '+err.message)}}
recordBtn.addEventListener('click',startRecording);
root.querySelector('.record-stop-btn').addEventListener('click',stopRecording);

// ===== Upload → column mapping =====
const uploadInput=root.querySelector('.upload-input'),uploadModal=root.querySelector('.upload-modal');
let pendingUploadJson=null;
function openMappingModal(json,headers){pendingUploadJson=json;const{nameCol,codeCol,yearCol,valueCol,imageCol}=detectColumns(headers);const fill=(sel,withEmpty)=>{sel.innerHTML=(withEmpty?'<option value="">— none —</option>':'')+headers.map(h=>`<option value="${h}">${h}</option>`).join('')};fill(uploadModal.querySelector('.map-name'),false);uploadModal.querySelector('.map-name').value=nameCol||headers[0];fill(uploadModal.querySelector('.map-code'),true);uploadModal.querySelector('.map-code').value=codeCol||'';fill(uploadModal.querySelector('.map-year'),false);uploadModal.querySelector('.map-year').value=yearCol||headers[1]||headers[0];fill(uploadModal.querySelector('.map-value'),false);uploadModal.querySelector('.map-value').value=valueCol||headers[headers.length-1];fill(uploadModal.querySelector('.map-image'),true);uploadModal.querySelector('.map-image').value=imageCol||'';uploadModal.hidden=false}
async function handleWorkbookFile(file){const buf=await file.arrayBuffer();const wb=window.XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const json=window.XLSX.utils.sheet_to_json(ws,{defval:null,raw:true});if(!json.length){alert('The file is empty or unsupported.');return}const headers=Object.keys(json[0]);const mapped=autoMapToRows(json,headers);if(mapped.rows.length){applyDataset(buildDataset(mapped.rows,mapped.images,mapped.categories))}else{openMappingModal(json,headers)}}
uploadInput.addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{await handleWorkbookFile(file)}catch(err){alert('Could not read the file: '+err.message)}finally{uploadInput.value=''}});
uploadModal.querySelector('.map-cancel').addEventListener('click',()=>{uploadModal.hidden=true;pendingUploadJson=null});
uploadModal.querySelector('.map-apply').addEventListener('click',()=>{const nameCol=uploadModal.querySelector('.map-name').value,codeCol=uploadModal.querySelector('.map-code').value||null,yearCol=uploadModal.querySelector('.map-year').value,valueCol=uploadModal.querySelector('.map-value').value,imageCol=uploadModal.querySelector('.map-image').value||null;const out=[],images=new Map();for(const r of pendingUploadJson){const nm=r[nameCol];if(nm==null||nm==='')continue;const yr=+r[yearCol],val=+r[valueCol];if(!Number.isFinite(yr)||!Number.isFinite(val))continue;const iso=resolveIso(codeCol?r[codeCol]:null,nm);if(!iso)continue;if(imageCol&&r[imageCol])images.set(iso,String(r[imageCol]).trim());out.push({name:String(nm).trim(),iso,year:yr,value:val})}if(!out.length){alert('No usable rows found with these columns — check that the year and value columns contain numbers.');return}applyDataset(buildDataset(out,images));uploadModal.hidden=true;pendingUploadJson=null});

countryG.selectAll('path').data(geo).join('path').attr('class','country').attr('fill',activeLand).attr('tabindex',0).attr('aria-label',d=>names.get(d.properties.id)||d.properties.name||d.properties.id).on('pointermove',tooltip).on('pointerleave',()=>root.querySelector('.tooltip').classList.remove('show')).on('click',(e,d)=>selectCountry(d.properties.id)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCountry(d.properties.id)}}).each(function(d){pathByIso.set(d.properties.id,this)});

// ===== Data tab: editable spreadsheet-style grid =====
let gridColumns=['Label','Image','Category'];
let gridData=[];
function seedGridFromDataset(){
  const years=Array.from(new Set(rows.map(r=>r.year))).sort((a,b)=>a-b);
  gridColumns=['Label','Image','Category',...years.map(String)];
  const byIso=d3.group(rows,d=>d.iso);
  gridData=Array.from(byIso,([iso,recs])=>{
    const row=[displayName(iso,recs[0].name),imageByIso.get(iso)||'',categoryByIso.get(iso)||''];
    years.forEach(y=>{const found=recs.find(r=>r.year===y);row.push(found!=null?String(found.value):'')});
    return row;
  });
}
function renderGrid(){
  const table=root.querySelector('.data-grid');
  const thead=table.querySelector('thead'),tbody=table.querySelector('tbody');
  thead.innerHTML='';tbody.innerHTML='';
  const trh=document.createElement('tr');
  gridColumns.forEach((h,ci)=>{const th=document.createElement('th');th.contentEditable='true';th.textContent=h;th.dataset.col=ci;th.addEventListener('blur',onHeaderEdit);th.addEventListener('keydown',stopEnterNewline);trh.appendChild(th)});
  thead.appendChild(trh);
  gridData.forEach((row,ri)=>{
    const tr=document.createElement('tr');
    row.forEach((val,ci)=>{const td=document.createElement('td');td.contentEditable='true';td.textContent=val;td.dataset.row=ri;td.dataset.col=ci;td.addEventListener('blur',onCellEdit);td.addEventListener('keydown',stopEnterNewline);tr.appendChild(td)});
    tbody.appendChild(tr);
  });
}
function stopEnterNewline(e){if(e.key==='Enter'){e.preventDefault();e.target.blur()}}
function onHeaderEdit(e){const ci=+e.target.dataset.col;gridColumns[ci]=e.target.textContent.trim()||gridColumns[ci];scheduleSync()}
function onCellEdit(e){const ri=+e.target.dataset.row,ci=+e.target.dataset.col;gridData[ri][ci]=e.target.textContent.trim();scheduleSync()}
let syncTimer=null;
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncGridToChart(false),500)}
function gridToJson(){const headers=gridColumns.slice();const json=gridData.map(row=>{const obj={};headers.forEach((h,i)=>{obj[h]=row[i]});return obj});return {json,headers}}
function updateRoleDisplay(cols){
  root.querySelector('[data-role="label"]').textContent=cols.nameCol||'—';
  root.querySelector('[data-role="values"]').textContent=cols.yearHeaders&&cols.yearHeaders.length>=3?`${cols.yearHeaders[0]}–${cols.yearHeaders[cols.yearHeaders.length-1]}`:(cols.yearCol&&cols.valueCol?`${cols.yearCol} / ${cols.valueCol}`:'—');
  root.querySelector('[data-role="category"]').textContent=cols.categoryCol||'—';
  root.querySelector('[data-role="image"]').textContent=cols.imageCol||'—';
}
function drawMiniPreview(){
  const svgEl=root.querySelector('.mini-preview-svg');if(!svgEl)return;
  const s=d3.select(svgEl),w=260,h=170;
  s.attr('viewBox',`0 0 ${w} ${h}`).selectAll('*').remove();
  const top=rankedAt(current).slice(0,8),max=top.length?top[0].value:1,rowH=h/Math.max(top.length,1);
  top.forEach((d,i)=>{
    const barW=Math.max(3,(d.value/max)*(w-64));
    s.append('rect').attr('x',60).attr('y',i*rowH+2).attr('width',barW).attr('height',Math.max(2,rowH-5)).attr('rx',2).attr('fill',colorForIso(d.iso));
    s.append('text').attr('x',56).attr('y',i*rowH+rowH/2).attr('text-anchor','end').attr('dominant-baseline','middle').attr('font-size',9).style('fill','var(--ink)').text(displayName(d.iso,d.name));
  });
  root.querySelector('.mini-preview-year').textContent=Math.round(current);
}
function syncGridToChart(silent){
  const {json,headers}=gridToJson();
  const cols=detectColumns(headers);
  updateRoleDisplay(cols);
  const mapped=autoMapToRows(json,headers);
  if(mapped.rows.length){
    const ds=buildDataset(mapped.rows,mapped.images,mapped.categories);
    rows=ds.rows;names=ds.names;series=ds.series;imageByIso=ds.imageByIso;categoryByIso=ds.categoryByIso;
    SETTINGS.yearMin=ds.yearMin;SETTINGS.yearMax=ds.yearMax;
    const scrubberEl=root.querySelector('.scrubber');scrubberEl.min=SETTINGS.yearMin;scrubberEl.max=SETTINGS.yearMax;
    if(current<SETTINGS.yearMin||current>SETTINGS.yearMax)current=SETTINGS.yearMin;
    const timelineSpans=root.querySelectorAll('.timeline-labels span'),tlSpan=SETTINGS.yearMax-SETTINGS.yearMin;
    timelineSpans.forEach((el,i)=>{el.textContent=Math.round(SETTINGS.yearMin+tlSpan*i/(timelineSpans.length-1))});
    renderStaticLabels();
    drawMiniPreview();
    if(!silent)saveProjectToStorage();
  }
}
root.querySelector('.auto-set-btn').addEventListener('click',()=>syncGridToChart(false));
root.querySelector('.add-row-btn').addEventListener('click',()=>{gridData.push(gridColumns.map(()=>''));renderGrid()});
root.querySelector('.add-col-btn').addEventListener('click',()=>{const nextYear=Math.max(SETTINGS.yearMax,...gridColumns.filter(c=>/^\d{4}$/.test(c)).map(Number),SETTINGS.yearMin)+1;gridColumns.push(String(nextYear));gridData.forEach(r=>r.push(''));renderGrid()});

// ===== Tabs =====
root.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    root.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));
    const tab=btn.dataset.tab;
    root.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.classList.contains(tab+'-view')));
    if(tab==='data'){seedGridFromDataset();renderGrid();syncGridToChart(true)}
    else{resize()}
  });
});

const L=SETTINGS.labels;
document.title=L.title;
root.setAttribute('aria-label',`Animated world ${L.title} visualization`);
root.querySelector('.hm-header h1').textContent=L.title;
root.querySelector('.hm-sub').textContent=L.subtitle;
root.querySelector('.intro-kicker').textContent=L.introKicker;
root.querySelector('.intro-title').textContent=L.introTitle;
root.querySelector('.intro-sub').textContent=L.introSub;
root.querySelector('.tip-value-label').textContent=L.tooltipValueLabel;

// Editable title / subtitle
const titleInput=root.querySelector('.set-title'),subtitleInput=root.querySelector('.set-subtitle');
titleInput.value=L.title;subtitleInput.value=L.subtitle;
function applyTitleText(){
  const title=titleInput.value||'Untitled chart',subtitle=subtitleInput.value||'';
  document.title=title;
  root.setAttribute('aria-label',`Animated world ${title} visualization`);
  root.querySelector('.hm-header h1').textContent=title;
  root.querySelector('.hm-sub').textContent=subtitle;
  root.querySelector('.intro-title').textContent=title;
  root.querySelector('.intro-sub').textContent=subtitle;
}
titleInput.addEventListener('input',()=>{applyTitleText();saveProjectToStorage()});
subtitleInput.addEventListener('input',()=>{applyTitleText();saveProjectToStorage()});
const introBanner=root.querySelector('.intro-banner');
setTimeout(()=>{if(introBanner) introBanner.classList.add('hidden');},2400);
const scrubberEl=root.querySelector('.scrubber');scrubberEl.min=SETTINGS.yearMin;scrubberEl.max=SETTINGS.yearMax;scrubberEl.value=SETTINGS.yearMin;
const timelineSpans=root.querySelectorAll('.timeline-labels span'),tlSpan=SETTINGS.yearMax-SETTINGS.yearMin;
timelineSpans.forEach((el,i)=>{el.textContent=Math.round(SETTINGS.yearMin+tlSpan*i/(timelineSpans.length-1))});
root.querySelector('.theme-toggle').addEventListener('click',()=>{applyMode(mode==='dark'?'light':'dark');saveProjectToStorage()});
applyMode(mode);
applyBarSettings();
let resizeTimer=null;
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,70)}).observe(root);
window.addEventListener('resize',()=>{if(canvasPreset!=='fill'){clearTimeout(resizeTimer);resizeTimer=setTimeout(applyCanvasPreset,70)}});
root.querySelector('.loading').remove();resize();render(SETTINGS.yearMin,false);
seedGridFromDataset();renderGrid();syncGridToChart(true);

// ===== Local project persistence =====
const STORAGE_KEY='dib_project_v1';
function saveProjectToStorageNow(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      gridColumns,gridData,
      barSettings,mapBox,mapVisible,zoomMode:SETTINGS.zoomMode,zoomFixedIso,zoomIntensity,leaderBox,leaderVisible,leaderZoom,leaderZoomX,leaderZoomY,barsVisible,namesVisible,paletteIdx,imgShapeKey,imgSizePx,barThicknessPct,barLengthPct,barScaleExponent,
      customBgDark,customBgLight,fontFamily:root.style.fontFamily,fontScale:root.style.getPropertyValue('--font-scale'),
      noteStyle,rectImgStyleByIso:Array.from(rectImgStyleByIso),manualRectImage:Array.from(manualRectImage),
      numberFormat,mode,topCountries:SETTINGS.topCountries,axisMode,canvasPreset,customCanvasW,customCanvasH,
      title:titleInput.value,subtitle:subtitleInput.value,
      yearColor,yearScale,yearPos,
      manualNameOverrides:Array.from(manualNameOverrides),
      manualAnnotations:Array.from(manualAnnotations),
      manualImageOverrides:Array.from(manualImageOverrides)
    }));
  }catch(err){}
}
function loadProjectFromStorage(){
  let p;
  try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return false;p=JSON.parse(raw)}catch(err){return false}
  if(p.gridColumns&&p.gridData&&p.gridData.length){gridColumns=p.gridColumns;gridData=p.gridData;renderGrid();syncGridToChart(true);current=SETTINGS.yearMin}
  if(Array.isArray(p.manualNameOverrides))manualNameOverrides=new Map(p.manualNameOverrides);
  if(Array.isArray(p.manualAnnotations))manualAnnotations=new Map(p.manualAnnotations);
  if(Array.isArray(p.manualImageOverrides))manualImageOverrides=new Map(p.manualImageOverrides);
  if(p.barSettings){barSettings={...barSettings,...p.barSettings};root.querySelector('.set-orientation').value=barSettings.orientation}
  if(p.mapBox){mapBox={...DEFAULT_MAP_BOX,...p.mapBox};applyMapBox();syncMapSizeUI();scheduleResize()}
  if(typeof p.mapVisible==='boolean'){mapVisible=p.mapVisible;root.querySelector('.set-map-visible').checked=mapVisible;applyMapVisibility()}
  if(Number.isFinite(p.zoomIntensity)){zoomIntensity=p.zoomIntensity;root.querySelector('.zoom-intensity').value=zoomIntensity;root.querySelector('.set-zoom-val').textContent=zoomIntensity.toFixed(1)}
  if(p.zoomFixedIso)zoomFixedIso=p.zoomFixedIso;
  populateZoomCountrySelect();
  if(p.zoomMode){SETTINGS.zoomMode=p.zoomMode;applyZoomModeUI();if(SETTINGS.zoomMode==='fixed')focusFixedCountry()}
  if(p.leaderBox){leaderBox={...DEFAULT_LEADER_BOX,...p.leaderBox};applyLeaderBox();syncLeaderSizeUI()}
  if(typeof p.leaderVisible==='boolean'){leaderVisible=p.leaderVisible;root.querySelector('.set-leader-visible').checked=leaderVisible;applyLeaderVisibility()}
  if(Number.isFinite(p.leaderZoom)){leaderZoom=p.leaderZoom;root.querySelector('.set-leader-zoom').value=leaderZoom;root.querySelector('.set-leader-zoom-val').textContent=leaderZoom.toFixed(1)}
  if(Number.isFinite(p.leaderZoomX)){leaderZoomX=p.leaderZoomX;root.querySelector('.set-leader-zoom-x').value=leaderZoomX;root.querySelector('.set-leader-zoom-x-val').textContent=Math.round(leaderZoomX)}
  if(Number.isFinite(p.leaderZoomY)){leaderZoomY=p.leaderZoomY;root.querySelector('.set-leader-zoom-y').value=leaderZoomY;root.querySelector('.set-leader-zoom-y-val').textContent=Math.round(leaderZoomY)}
  applyLeaderZoom();
  if(typeof p.barsVisible==='boolean'){barsVisible=p.barsVisible;root.querySelector('.set-bars-visible').checked=barsVisible;applyBarsVisibility()}
  if(typeof p.namesVisible==='boolean'){namesVisible=p.namesVisible;root.querySelector('.set-names-visible').checked=namesVisible;applyNamesVisibility()}
  if(Number.isInteger(p.paletteIdx))paletteIdx=p.paletteIdx;
  if(p.imgShapeKey){imgShapeKey=p.imgShapeKey;root.querySelector('.set-imgshape').value=imgShapeKey}
  if(Number.isFinite(p.imgSizePx)){imgSizePx=p.imgSizePx;root.querySelector('.set-imgsize').value=imgSizePx;root.querySelector('.set-imgsize-val').textContent=imgSizePx}
  applyImageStyle();
  if(Number.isFinite(p.barThicknessPct)){barThicknessPct=p.barThicknessPct;root.querySelector('.set-thickness').value=barThicknessPct;root.querySelector('.set-thickness-val').textContent=barThicknessPct;root.style.setProperty('--bar-thickness',barThicknessPct+'%')}
  if(Number.isFinite(p.barLengthPct)){barLengthPct=p.barLengthPct;root.querySelector('.set-barlength').value=barLengthPct;root.querySelector('.set-barlength-val').textContent=barLengthPct;applyBarLength()}
  if(Number.isFinite(p.barScaleExponent)){barScaleExponent=p.barScaleExponent;root.querySelector('.set-barscale').value=barScaleExponent;root.querySelector('.set-barscale-val').textContent=barScaleExponent.toFixed(2)}
  if(p.customBgDark){customBgDark=p.customBgDark;root.querySelector('.set-bgcolor-dark').value=customBgDark}
  if(p.customBgLight){customBgLight=p.customBgLight;root.querySelector('.set-bgcolor-light').value=customBgLight}
  if(p.noteStyle){noteStyle={...noteStyle,...p.noteStyle};root.querySelector('.set-note-x').value=noteStyle.x;root.querySelector('.set-note-x-val').textContent=noteStyle.x;root.querySelector('.set-note-y').value=noteStyle.y;root.querySelector('.set-note-y-val').textContent=noteStyle.y;root.querySelector('.set-note-color').value=noteStyle.color;root.querySelector('.set-note-size').value=noteStyle.size;root.querySelector('.set-note-size-val').textContent=noteStyle.size;applyNoteVars()}
  if(Array.isArray(p.rectImgStyleByIso))rectImgStyleByIso=new Map(p.rectImgStyleByIso);
  if(Array.isArray(p.manualRectImage))manualRectImage=new Map(p.manualRectImage);
  if(p.fontFamily){root.style.fontFamily=p.fontFamily;root.querySelector('.set-font').value=p.fontFamily}
  if(p.fontScale){root.style.setProperty('--font-scale',p.fontScale);const pct=Math.round(parseFloat(p.fontScale)*100);if(pct){root.querySelector('.set-fontsize').value=pct;root.querySelector('.set-fontsize-val').textContent=pct}}
  if(p.numberFormat){numberFormat={...numberFormat,...p.numberFormat};root.querySelector('.set-decimals').value=numberFormat.decimals;root.querySelector('.set-unit').value=numberFormat.unit||''}
  if(Number.isInteger(p.topCountries)){SETTINGS.topCountries=p.topCountries;syncTopNUI()}
  if(p.axisMode){axisMode={...axisMode,...p.axisMode};root.querySelector('.set-fixed-axis').checked=axisMode.fixed;root.querySelector('.fixed-axis-max-wrap').hidden=!axisMode.fixed;root.querySelector('.set-axis-max').value=axisMode.max}
  if(Number.isFinite(p.customCanvasW)){customCanvasW=p.customCanvasW;root.querySelector('.set-canvas-w').value=customCanvasW}
  if(Number.isFinite(p.customCanvasH)){customCanvasH=p.customCanvasH;root.querySelector('.set-canvas-h').value=customCanvasH}
  if(p.canvasPreset){canvasPreset=p.canvasPreset;root.querySelector('.set-canvas').value=canvasPreset;applyCanvasPreset()}
  if(p.yearColor){yearColor=p.yearColor;root.querySelector('.set-year-color').value=yearColor}
  if(Number.isFinite(p.yearScale)){yearScale=p.yearScale;root.querySelector('.set-year-size').value=Math.round(yearScale*100);root.querySelector('.set-year-size-val').textContent=Math.round(yearScale*100)}
  if(p.yearPos)yearPos=p.yearPos;
  applyYearStyle();
  if(p.title!=null){titleInput.value=p.title}
  if(p.subtitle!=null){subtitleInput.value=p.subtitle}
  if(p.title!=null||p.subtitle!=null)applyTitleText();
  if(p.mode)mode=p.mode;
  applyBarSettings();applyMode(mode);render(current,false);
  return true;
}
root.querySelector('.new-project-btn').addEventListener('click',()=>{
  if(!confirm('This will clear your locally saved project and restore the default data. Continue?'))return;
  try{localStorage.removeItem(STORAGE_KEY)}catch(err){}
  location.reload();
});
loadProjectFromStorage();
