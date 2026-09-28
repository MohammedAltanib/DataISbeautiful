// Map Studio — UI, state and preview loop. A standalone page (maps.html); it shares no state
// with the original index.html app.
import {feature} from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import {knownIds,buildNameIndex,readWorkbook,parseCsvText,detectColumns,toRecords,buildDataset,iso2Of,nameFor,REGIONS} from './data.js';
import {createEngine,SCALES,FORMATS,THEMES} from './engine.js';
import {decodeAudioFile,renderMix,PreviewAudio} from './audio.js';
import {canExportMp4,exportMp4,exportWebmRealtime,exportPng} from './exporter.js';

const d3=window.d3;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ATLAS=res=>`https://cdn.jsdelivr.net/npm/@d3-maps/atlas@1.0.0/dist/world/countries/countries-${res}.json`;
const FLAG=iso2=>`https://flagcdn.com/w640/${iso2}.png`;
const STORE_KEY='mapStudio.v2';
const SAMPLE_URL='data/sample-retirement-age.csv';

const DEFAULTS={
  format:'16:9',projection:'flat',detail:'50m',fill:'hybrid',flagCount:10,palette:'inferno',logScale:false,reverseScale:false,cartogramIntensity:1,
  mapLabels:3,beacon:true,leaderGlow:true,vignette:true,
  theme:'dark',accent:'#ffcf4d',oceanColor:'',landColor:'',font:'Inter',
  showBars:true,topN:10,barsSide:'left',barsDir:'ltr',barsWidth:36,barsNameWidth:30,barColor:'country',barSingleColor:'',axisMode:'zero',barsTitle:'',
  panelCustom:false,panelX:3,panelY:18,panelW:36,panelH:74,panelBg:true,panelOpacity:1,panelPad:18,panelRadius:22,
  barThickness:66,barMaxLen:100,barMinLen:40,barOffset:0,barScale:'linear',barRadius:10,barFill:true,barGradient:true,barGloss:true,barGlow:true,
  showRank:true,namePos:'outside',nameInsideAlign:'start',nameSize:100,nameColor:'',valuePos:'outside',valueSize:100,valueColor:'',
  barImg:'box',barImgShape:'circle',barImgW:84,barImgH:84,barImgX:100,barImgY:50,barImgZoom:1,barImgPanX:50,barImgPanY:50,barImgOpacity:1,barImgRing:true,barImgClip:false,
  showYear:true,showProgress:true,showLegend:true,legendTitle:'',
  secPerYear:1.2,yearEase:'soft',introDur:4,holdDur:3,outroDur:4.5,
  camMode:'leader',region:'world',flightDur:2.2,zoomIntensity:1,minShot:3,endWide:true,kenBurns:true,
  kicker:'GLOBAL DATA STORY',title:'Average Retirement Age Around the World',subtitle:'Average effective age of labour market exit · 1990–2024',introTitle:'',introSub:'',source:'OECD',sourcePrefix:'Source: ',
  lang:'en',digits:'latin',decimals:1,prefix:'',unit:'yrs',compact:false,textAlign:'left',
  leaderBanner:true,bannerKicker:'NEW #1',bannerText:'{name} takes the lead',
  channelName:'Atlas in Numbers',watermark:true,wmPos:'tr',wmOpacity:0.9,
  outroTitle:"Don't forget to subscribe",outroSub:'Maps and numbers that explain the world',subscribeText:'Subscribe',subscribedText:'Subscribed ✓',
  musicVolume:0.7,musicFade:2.5,musicLoop:true,sfxOn:true,sfxVolume:0.5,
  exportRes:'1080',exportFps:60,exportQuality:'high',
  events:[],scenes:[],names:{},colors:{},images:{},imgStyles:{}
};

// ---------- control schema (rendered into .auto[data-group]) ----------
const opt=(pairs)=>pairs.map(([v,l])=>({v,l}));
const isLandscape=P=>{const [w,h]=FORMATS[P.format];return w/h>1.4};
const SCHEMA=[
  {g:'format',k:'format',l:'Video format',t:'seg',o:opt([['16:9','YouTube 16:9'],['9:16','Shorts 9:16'],['1:1','Square'],['4:5','Instagram 4:5']])},
  {g:'map',k:'projection',l:'Map type',t:'seg',o:opt([['flat','Flat'],['globe','3D globe'],['cartogram','Cartogram (by value)']])},
  {g:'map',k:'cartogramIntensity',l:'Cartogram distortion',t:'range',min:0,max:1,step:0.05,show:P=>P.projection==='cartogram',help:'0 = true geography, 1 = full size-by-value distortion (countries can overlap)'},
  {g:'map',k:'detail',l:'Border detail',t:'seg',o:opt([['50m','Standard'],['10m','High']])},
  {g:'map',k:'fill',l:'Country fill',t:'select',o:opt([['hybrid','Flags for leaders + colors for the rest'],['value','Colors by value'],['flags','Flags for every country']])},
  {g:'map',k:'flagCount',l:'Flags on the map',t:'range',min:1,max:40,step:1,show:P=>P.fill==='hybrid'},
  {g:'map',k:'palette',l:'Color scale',t:'select',o:Object.entries(SCALES).map(([v,[l]])=>({v,l})),show:P=>P.fill!=='flags'},
  {g:'map',k:'logScale',l:'Log scale',t:'toggle',show:P=>P.fill!=='flags',help:'Useful for population or GDP data'},
  {g:'map',k:'reverseScale',l:'Reverse scale',t:'toggle',show:P=>P.fill!=='flags'},
  {g:'map',k:'mapLabels',l:'Name cards on the map',t:'range',min:0,max:5,step:1},
  {g:'map',k:'beacon',l:'Pulse on the leader',t:'toggle'},
  {g:'map',k:'leaderGlow',l:'Leader border glow',t:'toggle'},
  {g:'map',k:'vignette',l:'Cinematic vignette',t:'toggle'},
  {g:'theme',k:'theme',l:'Theme',t:'seg',o:opt([['dark','Dark'],['light','Light']])},
  {g:'theme',k:'accent',l:'Accent color',t:'color'},
  {g:'theme',k:'oceanColor',l:'Ocean color',t:'coloropt',def:P=>THEMES[P.theme].sphere},
  {g:'theme',k:'landColor',l:'No-data country color',t:'coloropt',def:P=>THEMES[P.theme].land},
  {g:'theme',k:'font',l:'Font',t:'select',o:opt([['Inter','Inter'],['Cairo','Cairo'],['Tajawal','Tajawal'],['Almarai','Almarai'],['IBM Plex Sans Arabic','IBM Plex Arabic'],['Noto Kufi Arabic','Noto Kufi']])},
  {g:'panel',k:'panelCustom',l:'Custom position & size',t:'toggle',help:'Place and size the bar panel anywhere on the frame'},
  {g:'panel',k:'barsSide',l:'Panel side',t:'seg',o:opt([['left','Left'],['right','Right']]),show:P=>!P.panelCustom&&isLandscape(P)},
  {g:'panel',k:'barsWidth',l:'Panel width %',t:'range',min:15,max:60,step:1,show:P=>!P.panelCustom&&isLandscape(P)},
  {g:'panel',k:'panelX',l:'Left (% of frame)',t:'range',min:0,max:95,step:0.5,show:P=>P.panelCustom},
  {g:'panel',k:'panelY',l:'Top (% of frame)',t:'range',min:0,max:95,step:0.5,show:P=>P.panelCustom},
  {g:'panel',k:'panelW',l:'Width (% of frame)',t:'range',min:5,max:100,step:0.5,show:P=>P.panelCustom},
  {g:'panel',k:'panelH',l:'Height (% of frame)',t:'range',min:5,max:100,step:0.5,show:P=>P.panelCustom},
  {g:'panel',k:'panelBg',l:'Panel background',t:'toggle'},
  {g:'panel',k:'panelOpacity',l:'Background opacity',t:'range',min:0.05,max:1,step:0.05,show:P=>P.panelBg},
  {g:'panel',k:'panelRadius',l:'Corner radius',t:'range',min:0,max:60,step:1,show:P=>P.panelBg},
  {g:'panel',k:'panelPad',l:'Inner padding (px)',t:'range',min:0,max:80,step:1},
  {g:'panel',k:'barsTitle',l:'Panel title',t:'text',ph:'e.g. Top 10 countries'},
  {g:'bars',k:'showBars',l:'Show bar race',t:'toggle'},
  {g:'bars',k:'topN',l:'Countries shown',t:'range',min:3,max:20,step:1,show:P=>P.showBars},
  {g:'bars',k:'barsDir',l:'Bar direction',t:'seg',o:opt([['ltr','Left to right'],['rtl','Right to left']]),show:P=>P.showBars},
  {g:'bars',k:'barThickness',l:'Thickness (% of row)',t:'range',min:10,max:150,step:1},
  {g:'bars',k:'barMaxLen',l:'Max length %',t:'range',min:10,max:100,step:1},
  {g:'bars',k:'barMinLen',l:'Min length (px)',t:'range',min:0,max:400,step:2},
  {g:'bars',k:'barOffset',l:'Start offset (px)',t:'range',min:-200,max:400,step:2,help:'Shifts where the bars begin'},
  {g:'bars',k:'barScale',l:'Length scale',t:'seg',o:opt([['linear','Linear'],['sqrt','Square root'],['log','Log']]),help:'Square root or log keeps small values visible when one country dominates (e.g. population)'},
  {g:'bars',k:'axisMode',l:'Baseline',t:'seg',o:opt([['zero','From zero'],['auto','Emphasize gaps']]),help:'"Emphasize gaps" makes small differences between close values visible'},
  {g:'bars',k:'barRadius',l:'Corner radius',t:'range',min:0,max:60,step:1},
  {g:'bars',k:'barColor',l:'Bar color',t:'seg',o:opt([['country','Per country'],['scale','Map colors'],['accent','Single color']]),help:'Per-country colors can be set in the Data tab'},
  {g:'bars',k:'barSingleColor',l:'Single color',t:'coloropt',def:P=>P.accent,show:P=>P.barColor==='accent'},
  {g:'bars',k:'barFill',l:'Fill bars',t:'toggle'},
  {g:'bars',k:'barGradient',l:'Gradient',t:'toggle',show:P=>P.barFill},
  {g:'bars',k:'barGloss',l:'Gloss highlight',t:'toggle',show:P=>P.barFill},
  {g:'bars',k:'barGlow',l:'Leader glow',t:'toggle',show:P=>P.barFill},
  {g:'barlabels',k:'showRank',l:'Rank numbers',t:'toggle'},
  {g:'barlabels',k:'namePos',l:'Country name',t:'seg',o:opt([['outside','Beside bar'],['inside','Inside bar'],['hidden','Hidden']])},
  {g:'barlabels',k:'nameInsideAlign',l:'Name inside at',t:'seg',o:opt([['start','Bar start'],['end','Bar end']]),show:P=>P.namePos==='inside'},
  {g:'barlabels',k:'barsNameWidth',l:'Name column %',t:'range',min:5,max:60,step:1,show:P=>P.namePos==='outside'},
  {g:'barlabels',k:'nameSize',l:'Name size %',t:'range',min:40,max:250,step:5,show:P=>P.namePos!=='hidden'},
  {g:'barlabels',k:'nameColor',l:'Name color',t:'coloropt',def:P=>THEMES[P.theme].ink,show:P=>P.namePos!=='hidden'},
  {g:'barlabels',k:'valuePos',l:'Value',t:'seg',o:opt([['outside','After bar'],['inside','Inside bar'],['hidden','Hidden']])},
  {g:'barlabels',k:'valueSize',l:'Value size %',t:'range',min:40,max:250,step:5,show:P=>P.valuePos!=='hidden'},
  {g:'barlabels',k:'valueColor',l:'Value color',t:'coloropt',def:P=>THEMES[P.theme].ink,show:P=>P.valuePos!=='hidden'},
  {g:'barimg',k:'barImg',l:'Image',t:'seg',o:opt([['box','On the bar'],['fill','Fills the bar'],['none','None']])},
  {g:'barimg',k:'barImgShape',l:'Shape',t:'seg',o:opt([['circle','Circle'],['rounded','Rounded'],['square','Square']]),show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgW',l:'Width (% of thickness)',t:'range',min:10,max:600,step:1,show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgH',l:'Height (% of thickness)',t:'range',min:10,max:300,step:1,show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgX',l:'Position: start ↔ end',t:'range',min:0,max:100,step:1,show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgY',l:'Position: top ↕ bottom',t:'range',min:0,max:100,step:1,show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgZoom',l:'Zoom in / out',t:'range',min:0.3,max:5,step:0.05,show:P=>P.barImg!=='none'},
  {g:'barimg',k:'barImgPanX',l:'Pan left ↔ right',t:'range',min:0,max:100,step:1,show:P=>P.barImg!=='none'},
  {g:'barimg',k:'barImgPanY',l:'Pan up ↕ down',t:'range',min:0,max:100,step:1,show:P=>P.barImg!=='none'},
  {g:'barimg',k:'barImgOpacity',l:'Opacity',t:'range',min:0.05,max:1,step:0.05,show:P=>P.barImg!=='none'},
  {g:'barimg',k:'barImgRing',l:'White border',t:'toggle',show:P=>P.barImg==='box'},
  {g:'barimg',k:'barImgClip',l:'Clip to the bar',t:'toggle',show:P=>P.barImg==='box'},
  {g:'hud',k:'showYear',l:'Big year counter',t:'toggle'},
  {g:'hud',k:'showProgress',l:'Timeline progress bar',t:'toggle',show:P=>P.showYear},
  {g:'hud',k:'showLegend',l:'Color legend',t:'toggle',show:P=>P.fill!=='flags'},
  {g:'hud',k:'legendTitle',l:'Legend title',t:'text',show:P=>P.showLegend&&P.fill!=='flags'},
  {g:'timing',k:'secPerYear',l:'Seconds per year',t:'range',min:0.2,max:6,step:0.1},
  {g:'timing',k:'yearEase',l:'Year pacing',t:'select',o:opt([['soft','Soft (recommended)'],['linear','Constant'],['step','Pause on each year']])},
  {g:'timing',k:'introDur',l:'Intro length (s)',t:'range',min:0,max:12,step:0.5},
  {g:'timing',k:'holdDur',l:'Hold on result (s)',t:'range',min:0,max:12,step:0.5},
  {g:'timing',k:'outroDur',l:'Outro length (s)',t:'range',min:0,max:12,step:0.5},
  {g:'camera',k:'camMode',l:'Camera mode',t:'select',o:opt([['leader','Follow the leader automatically'],['fixed','Fixed on a region'],['scenes','Custom scenes (manual direction)']])},
  {g:'camera',k:'region',l:'Main region',t:'select',o:REGIONS.map(r=>({v:r.key,l:r.label})),help:'Used by the fixed camera and the wide closing shot'},
  {g:'camera',k:'flightDur',l:'Camera move length (s)',t:'range',min:0.6,max:6,step:0.1},
  {g:'camera',k:'zoomIntensity',l:'Zoom strength on countries',t:'range',min:0.3,max:2.5,step:0.05},
  {g:'camera',k:'minShot',l:'Minimum shot length (s)',t:'range',min:1,max:12,step:0.5,show:P=>P.camMode==='leader',help:'Stops the camera jumping back and forth when two countries keep swapping the lead'},
  {g:'camera',k:'endWide',l:'Wide shot at the end',t:'toggle'},
  {g:'camera',k:'kenBurns',l:'Slow push-in (Ken Burns)',t:'toggle'},
  {g:'titles',k:'kicker',l:'Kicker above title',t:'text'},
  {g:'titles',k:'title',l:'Title',t:'text'},
  {g:'titles',k:'subtitle',l:'Subtitle',t:'text'},
  {g:'titles',k:'introTitle',l:'Intro title',t:'text',ph:'(same as title)'},
  {g:'titles',k:'introSub',l:'Intro description',t:'text',ph:'(same as subtitle)'},
  {g:'titles',k:'sourcePrefix',l:'Source prefix',t:'text'},
  {g:'titles',k:'source',l:'Data source',t:'text'},
  {g:'numbers',k:'lang',l:'Country names',t:'seg',o:opt([['en','English'],['ar','Arabic'],['file','As in file']])},
  {g:'numbers',k:'digits',l:'Digits',t:'seg',o:opt([['latin','123'],['arab','١٢٣']])},
  {g:'numbers',k:'decimals',l:'Decimal places',t:'range',min:0,max:4,step:1},
  {g:'numbers',k:'prefix',l:'Before the number',t:'text',ph:'e.g. $'},
  {g:'numbers',k:'unit',l:'Unit after the number',t:'text',ph:'e.g. years, %, USD'},
  {g:'numbers',k:'compact',l:'Abbreviate big numbers',t:'toggle',help:'1,500,000 → 1.5M'},
  {g:'numbers',k:'textAlign',l:'Title alignment',t:'seg',o:opt([['left','Left'],['center','Center'],['right','Right']]),show:isLandscape},
  {g:'banner',k:'leaderBanner',l:'Show banner',t:'toggle'},
  {g:'banner',k:'bannerKicker',l:'Small label',t:'text',show:P=>P.leaderBanner},
  {g:'banner',k:'bannerText',l:'Text ({name} = country)',t:'text',show:P=>P.leaderBanner},
  {g:'brand',k:'channelName',l:'Channel name',t:'text'},
  {g:'brand',k:'watermark',l:'Watermark',t:'toggle'},
  {g:'brand',k:'wmPos',l:'Position',t:'seg',o:opt([['tl','↖'],['tr','↗'],['bl','↙'],['br','↘']]),show:P=>P.watermark},
  {g:'brand',k:'wmOpacity',l:'Opacity',t:'range',min:0.2,max:1,step:0.05,show:P=>P.watermark},
  {g:'outro',k:'outroTitle',l:'Title',t:'text'},
  {g:'outro',k:'outroSub',l:'Subtitle',t:'text'},
  {g:'outro',k:'subscribeText',l:'Subscribe button',t:'text'},
  {g:'outro',k:'subscribedText',l:'After the click',t:'text'},
  {g:'audio',k:'musicVolume',l:'Music volume',t:'range',min:0,max:1,step:0.05},
  {g:'audio',k:'musicFade',l:'Music fade-out (s)',t:'range',min:0,max:8,step:0.5},
  {g:'audio',k:'musicLoop',l:'Loop music',t:'toggle'},
  {g:'audio',k:'sfxOn',l:'Sound effects',t:'toggle'},
  {g:'audio',k:'sfxVolume',l:'Effects volume',t:'range',min:0,max:1,step:0.05,show:P=>P.sfxOn},
  {g:'export',k:'exportRes',l:'Resolution',t:'seg',o:opt([['1080','1080p'],['1440','1440p'],['2160','4K']])},
  {g:'export',k:'exportFps',l:'Frame rate',t:'seg',o:[{v:30,l:'30'},{v:60,l:'60'}]},
  {g:'export',k:'exportQuality',l:'Quality',t:'seg',o:opt([['standard','Standard'],['high','High'],['max','Max']])}
];
const LAYOUT_KEYS=new Set(['format','showBars','barsSide','barsWidth','textAlign']);

// ---------- state ----------
let P=structuredClone(DEFAULTS),ds=null,engine=null,features=null,table=null,mapping=null,fileLabel='',logoData=null,music=null,musicLabel='';
let t=0,playing=false,lastTs=0,dirty=true,exporting=false,cancelExport=false;
const previewAudio=new PreviewAudio();
const canvas=$('#preview'),ctx=canvas.getContext('2d');
let scale=1;

// ---------- boot ----------
async function loadAtlas(res){
  const r=await fetch(ATLAS(res));if(!r.ok)throw new Error('atlas '+r.status);
  const topo=await r.json();
  return feature(topo,topo.objects.features).features.filter(f=>f.properties.id!=='ATA');
}
async function boot(){
  restoreFromStorage();
  try{features=await loadAtlas(P.detail)}catch(e){if(P.detail!=='50m'){P.detail='50m';features=await loadAtlas('50m')}else{$('#loading').textContent='Could not load the map. Check your internet connection and reload the page.';throw e}}
  buildNameIndex(features);
  engine=createEngine(features);
  if(!ds){try{const txt=await fetch(SAMPLE_URL).then(r=>r.text());loadTable(parseCsvText(txt),'Sample data: average retirement age (OECD)')}catch{}}
  else refreshDataUI();
  applyLogo();applyCustomImages();
  buildControls();
  configure(true);
  loadFlags();
  await document.fonts.ready;
  $('#loading').hidden=true;
  resizeCanvas();
  dirty=true;
  requestAnimationFrame(loop);
}

// ---------- persistence ----------
function saveToStorage(){
  clearTimeout(saveToStorage.tm);
  saveToStorage.tm=setTimeout(()=>{
    try{localStorage.setItem(STORE_KEY,JSON.stringify(projectJson()))}
    catch{try{localStorage.setItem(STORE_KEY,JSON.stringify({...projectJson(),records:null}))}catch{}}
  },400);
}
function projectJson(){return {version:1,settings:P,fileLabel,logo:logoData,records:ds?ds.records.map(r=>[r.id,r.name,r.year,r.value]):null}}
function applyProject(obj){
  P={...structuredClone(DEFAULTS),...(obj.settings||{})};
  logoData=obj.logo||null;
  if(obj.records&&obj.records.length){ds=buildDataset(obj.records.map(([id,name,year,value])=>({id,name,year,value})));fileLabel=obj.fileLabel||'Saved project'}
}
function restoreFromStorage(){try{const raw=localStorage.getItem(STORE_KEY);if(raw)applyProject(JSON.parse(raw))}catch{}}

// ---------- data ----------
function loadTable(tb,label){
  table=tb;fileLabel=label;
  mapping=detectColumns(tb,knownIds(engine.validIds));
  applyMapping();
  fillMappingUI();
}
function applyMapping(){
  const {records,unresolved}=toRecords(table,mapping,knownIds(engine.validIds));
  if(!records.length){showDataInfo(null,unresolved);$('#mappingCard').open=true;return}
  ds=buildDataset(records);
  showDataInfo(ds,unresolved);
  P.scenes=P.scenes.filter(s=>s.year>=ds.yearMin-1);
  refreshDataUI();
  if(engine){configure();loadFlags();t=0;dirty=true}
  saveToStorage();
}
function showDataInfo(d,unresolved=[]){
  const el=$('#dataInfo');
  if(!d){el.innerHTML=`<span class="warn">No usable data was found in "${esc(fileLabel)}". Open "Map columns manually" and pick the right columns.</span>`;return}
  const un=unresolved.slice(0,8).map(([n,c])=>esc(n)).join(', ');
  el.innerHTML=`<b>${esc(fileLabel)}</b><br>${d.ids.length} countries · ${d.yearMin}–${d.yearMax} · ${d.records.length.toLocaleString('en')} values`+(unresolved.length?`<br><span class="warn">Ignored ${unresolved.length} name(s) that aren't countries (e.g. aggregates): ${un}${unresolved.length>8?'…':''}</span>`:'');
}
function refreshDataUI(){if(ds&&!table)showDataInfo(ds);renderCountryList();renderScenes();renderEvents()}
function fillMappingUI(){
  if(!table)return;
  const opts=(withNone)=>(withNone?'<option value="-1">— none —</option>':'')+table.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
  $('#mapName').innerHTML=opts(false);$('#mapCode').innerHTML=opts(true);$('#mapYear').innerHTML=opts(false);$('#mapValue').innerHTML=opts(false);
  $('#mapFormat').value=mapping.format;$('#mapName').value=mapping.name;$('#mapCode').value=mapping.code;$('#mapYear').value=Math.max(0,mapping.year);$('#mapValue').value=Math.max(0,mapping.value);
  syncMappingVisibility();
}
function syncMappingVisibility(){$$('.long-only').forEach(el=>el.hidden=$('#mapFormat').value!=='long')}
$('#mapFormat').addEventListener('change',syncMappingVisibility);
$('#applyMappingBtn').addEventListener('click',()=>{
  if(!table)return;
  mapping={format:$('#mapFormat').value,name:+$('#mapName').value,code:+$('#mapCode').value,year:+$('#mapYear').value,value:+$('#mapValue').value,yearCols:[]};
  applyMapping();
});
async function handleFile(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const tb=/\.csv$|\.tsv$/i.test(file.name)?parseCsvText(new TextDecoder().decode(buf).replace(/\t/g,',')):readWorkbook(buf);
    loadTable(tb,file.name);
  }catch(e){console.error(e);alert('Could not read the file: '+e.message)}
}
$('#fileInput').addEventListener('change',e=>handleFile(e.target.files[0]));
const dz=$('#dropzone');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
$('#sampleBtn').addEventListener('click',async()=>{const txt=await fetch(SAMPLE_URL).then(r=>r.text());loadTable(parseCsvText(txt),'Sample data: average retirement age (OECD)')});

// flags
const flagPromises=new Map();
function loadFlags(){
  if(!ds)return;
  for(const id of ds.ids){
    if(flagPromises.has(id))continue;
    const iso2=iso2Of(id);if(!iso2){flagPromises.set(id,Promise.resolve());continue}
    const img=new Image();img.crossOrigin='anonymous';img.decoding='async';
    flagPromises.set(id,new Promise(res=>{img.onload=()=>{engine.setFlag(id,img);dirty=true;res()};img.onerror=()=>res()}));
    img.src=FLAG(iso2);
  }
}
const flagsReady=()=>Promise.race([Promise.all([...flagPromises.values()]),new Promise(r=>setTimeout(r,8000))]);

// countries list
function countryOptions(sel){
  if(!ds)return '';
  return ds.ids.map(id=>({id,n:nameFor(id,P.lang==='file'?'en':P.lang,ds.fileNames.get(id))})).sort((a,b)=>a.n.localeCompare(b.n,P.lang==='ar'?'ar':'en')).map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.n)}</option>`).join('');
}
function renderCountryList(){
  const el=$('#countryList');if(!ds){el.innerHTML='';return}
  const q=$('#countrySearch').value.trim().toLowerCase();
  const last=new Map(ds.ids.map(id=>{const a=ds.series.get(id);return [id,a[a.length-1]]}));
  const ids=ds.ids.slice().sort((a,b)=>(last.get(b)||0)-(last.get(a)||0));
  el.innerHTML=ids.filter(id=>!q||engine.nameOf(id).toLowerCase().includes(q)||(ds.fileNames.get(id)||'').toLowerCase().includes(q)||id.toLowerCase().includes(q)).map(id=>{
    const iso2=iso2Of(id),def=nameFor(id,P.lang,ds.fileNames.get(id)),st=P.imgStyles[id]||{},open=openCountry===id;
    const thumb=P.images[id]||(iso2?FLAG(iso2).replace('w640','w80'):'');
    const rng=(cls,label,min,max,step,val)=>`<label>${label}<span class="range"><input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${val}</output></span></label>`;
    return `<div class="country-item${open?' open':''}" data-id="${id}"><div class="country-row"><img src="${thumb}" alt="" loading="lazy"><input type="text" class="cn" value="${esc(P.names[id]||'')}" placeholder="${esc(def)}"><input type="color" class="cc" value="${P.colors[id]||(/^#[0-9a-f]{6}$/i.test(engine.barColorOf(id))?engine.barColorOf(id):'#888888')}" title="Bar color"><label class="x-btn img-btn" title="Upload a custom image for this bar">🖼<input type="file" class="ci" accept="image/*" hidden></label><button class="x-btn cs" type="button" title="Image framing for this country">⚙</button><button class="x-btn cr" type="button" title="Reset name, color and image">↺</button></div>`+
      (open?`<div class="country-extra">${rng('iz','Zoom',0.3,5,0.05,st.zoom??P.barImgZoom)}${rng('ix','Pan ↔',0,100,1,st.panX??P.barImgPanX)}${rng('iy','Pan ↕',0,100,1,st.panY??P.barImgPanY)}<div class="row-btns"><button class="ghost-btn small cfr" type="button">Use global framing</button>${P.images[id]?'<button class="ghost-btn small crm" type="button">Remove custom image</button>':''}</div></div>`:'')+`</div>`;
  }).join('');
}
let openCountry=null;
function applyCustomImages(){
  if(!engine)return;
  for(const [id,url] of Object.entries(P.images||{})){const img=new Image();img.onload=()=>{engine.setCustomImage(id,img);dirty=true};img.src=url}
}
async function fileToDataUrl(f,max=480){
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(f)});
  const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);
  const webp=c.toDataURL('image/webp',0.9);return webp.startsWith('data:image/webp')?webp:c.toDataURL('image/png');
}
$('#countrySearch').addEventListener('input',renderCountryList);
$('#countryList').addEventListener('input',e=>{
  const item=e.target.closest('.country-item');if(!item)return;const id=item.dataset.id,cl=e.target.classList;
  if(cl.contains('cn')){const v=e.target.value.trim();if(v)P.names[id]=v;else delete P.names[id]}
  if(cl.contains('cc'))P.colors[id]=e.target.value;
  const key=cl.contains('iz')?'zoom':cl.contains('ix')?'panX':cl.contains('iy')?'panY':null;
  if(key){(P.imgStyles[id]=P.imgStyles[id]||{})[key]=+e.target.value;e.target.nextElementSibling.textContent=e.target.value}
  changed();
});
$('#countryList').addEventListener('change',async e=>{
  if(!e.target.classList.contains('ci'))return;const id=e.target.closest('.country-item').dataset.id,f=e.target.files[0];if(!f)return;
  try{P.images[id]=await fileToDataUrl(f);const img=new Image();img.onload=()=>{engine.setCustomImage(id,img);dirty=true};img.src=P.images[id];openCountry=id;renderCountryList();changed()}catch(err){alert('Could not read the image: '+err.message)}
});
$('#countryList').addEventListener('click',e=>{
  const item=e.target.closest('.country-item');if(!item)return;const id=item.dataset.id,cl=e.target.classList;
  if(cl.contains('cs')){openCountry=openCountry===id?null:id;renderCountryList();return}
  if(cl.contains('cfr')){delete P.imgStyles[id];renderCountryList();changed();return}
  if(cl.contains('crm')){delete P.images[id];engine.setCustomImage(id,null);renderCountryList();changed();return}
  if(cl.contains('cr')){delete P.names[id];delete P.colors[id];delete P.images[id];delete P.imgStyles[id];engine.setCustomImage(id,null);renderCountryList();changed()}
});

// scenes
function targetOptions(sel){return `<optgroup label="Regions">${REGIONS.map(r=>`<option value="${r.key}"${r.key===sel?' selected':''}>${r.label}</option>`).join('')}</optgroup><optgroup label="Countries">${countryOptions(sel)}</optgroup>`}
function renderScenes(){
  $('#scenesCard').hidden=P.camMode!=='scenes';
  $('#scenesList').innerHTML=P.scenes.map((s,i)=>`<div class="list-row scene-row" data-i="${i}"><input type="number" class="sy" value="${s.year}" step="0.5" title="Year"><select class="st">${targetOptions(s.target)}</select><input type="range" class="sz" min="0.4" max="3" step="0.1" value="${s.zoom||1}" title="Zoom"><button class="x-btn" type="button">✕</button></div>`).join('')||'<p class="hint">No scenes yet.</p>';
}
$('#addSceneBtn').addEventListener('click',()=>{
  const y=ds?Math.round(engine.timeline.yearAt(t)):2000;const info=frameInfo();
  P.scenes.push({year:y,target:info.leader||'world',zoom:1});P.scenes.sort((a,b)=>a.year-b.year);renderScenes();changed();
});
$('#scenesList').addEventListener('input',e=>{const row=e.target.closest('.list-row');if(!row)return;const s=P.scenes[+row.dataset.i];if(e.target.classList.contains('sy'))s.year=+e.target.value;if(e.target.classList.contains('st'))s.target=e.target.value;if(e.target.classList.contains('sz'))s.zoom=+e.target.value;changed()});
$('#scenesList').addEventListener('click',e=>{if(!e.target.classList.contains('x-btn'))return;P.scenes.splice(+e.target.closest('.list-row').dataset.i,1);renderScenes();changed()});

// events
function renderEvents(){
  $('#eventsList').innerHTML=P.events.map((ev,i)=>`<div class="list-row event-row" data-i="${i}"><input type="number" class="ey" value="${ev.year}" title="Year"><input type="text" class="et" value="${esc(ev.text)}" placeholder="Event text"><input type="number" class="ed" value="${ev.dur}" min="1" max="20" step="0.5" title="Duration (s)"><button class="x-btn" type="button">✕</button></div>`).join('')||'<p class="hint">No events yet.</p>';
}
$('#addEventBtn').addEventListener('click',()=>{const y=ds?Math.round(engine.timeline.yearAt(t)):2000;P.events.push({year:y,text:'',dur:4});renderEvents();changed();$('#eventsList .list-row:last-child .et')?.focus()});
$('#eventsList').addEventListener('input',e=>{const row=e.target.closest('.list-row');if(!row)return;const ev=P.events[+row.dataset.i];if(e.target.classList.contains('ey'))ev.year=+e.target.value;if(e.target.classList.contains('et'))ev.text=e.target.value;if(e.target.classList.contains('ed'))ev.dur=+e.target.value;changed()});
$('#eventsList').addEventListener('click',e=>{if(!e.target.classList.contains('x-btn'))return;P.events.splice(+e.target.closest('.list-row').dataset.i,1);renderEvents();changed()});

// ---------- controls ----------
function buildControls(){
  for(const box of $$('.auto')){
    box.innerHTML='';
    for(const c of SCHEMA.filter(c=>c.g===box.dataset.group)){
      const row=document.createElement('div');row.className='ctl';row.dataset.key=c.k;
      const lab=document.createElement('span');lab.textContent=c.l;if(c.help)lab.title=c.help;row.appendChild(lab);
      row.appendChild(makeInput(c));box.appendChild(row);
    }
  }
  syncControls();
}
function makeInput(c){
  const set=v=>{P[c.k]=v;changed(c.k)};
  if(c.t==='seg'){const w=document.createElement('div');w.className='seg';for(const o of c.o){const b=document.createElement('button');b.type='button';b.textContent=o.l;b.dataset.v=o.v;b.addEventListener('click',()=>{set(o.v);syncControls()});w.appendChild(b)}return w}
  if(c.t==='select'){const s=document.createElement('select');s.innerHTML=c.o.map(o=>`<option value="${o.v}">${esc(o.l)}</option>`).join('');s.addEventListener('change',()=>set(s.value));return s}
  if(c.t==='toggle'){const l=document.createElement('label');l.className='switch';l.innerHTML='<input type="checkbox"><i></i>';l.firstChild.addEventListener('change',e=>set(e.target.checked));return l}
  if(c.t==='range'){const w=document.createElement('div');w.className='range';w.innerHTML=`<input type="range" min="${c.min}" max="${c.max}" step="${c.step}"><output></output>`;const r=w.firstChild;r.addEventListener('input',()=>{w.lastChild.textContent=r.value;set(+r.value)});return w}
  if(c.t==='color'){const i=document.createElement('input');i.type='color';i.addEventListener('input',()=>set(i.value));return i}
  if(c.t==='coloropt'){const w=document.createElement('div');w.className='colorwrap';w.innerHTML='<input type="color"><button type="button" class="ghost-btn small">Auto</button>';w.firstChild.addEventListener('input',e=>set(e.target.value));w.lastChild.addEventListener('click',()=>{set('');syncControls()});return w}
  const i=document.createElement('input');i.type='text';if(c.ph)i.placeholder=c.ph;i.addEventListener('input',()=>set(i.value));return i;
}
function syncControls(){
  for(const c of SCHEMA){
    const row=document.querySelector(`.ctl[data-key="${c.k}"]`);if(!row)continue;
    row.hidden=c.show?!c.show(P):false;
    const v=P[c.k],el=row.lastChild;
    if(c.t==='seg')el.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(b.dataset.v)===String(v)));
    else if(c.t==='toggle')el.querySelector('input').checked=!!v;
    else if(c.t==='range'){el.firstChild.value=v;el.lastChild.textContent=v}
    else if(c.t==='coloropt')el.firstChild.value=v||c.def(P);
    else if(document.activeElement!==el)el.value=v??'';
  }
  $('#scenesCard').hidden=P.camMode!=='scenes';
}
let reloadingAtlas=false;
async function changed(key){
  if(key==='detail'){if(reloadingAtlas)return;reloadingAtlas=true;$('#loading').hidden=false;$('#loading').textContent='Loading high-detail borders…';try{features=await loadAtlas(P.detail);buildNameIndex(features);engine=createEngine(features);flagPromises.clear();loadFlags();applyLogo();applyCustomImages()}catch{P.detail='50m'}reloadingAtlas=false;$('#loading').hidden=true;configure(true);syncControls();saveToStorage();return}
  if(key==='panelCustom'&&P.panelCustom&&engine){const b=engine.layout.barsAuto,[W,H]=engine.size,r=v=>Math.round(v*2)/2;P.panelX=r(b.x/W*100);P.panelY=r(b.y/H*100);P.panelW=r(b.w/W*100);P.panelH=r(b.h/H*100)}
  syncControls();
  if(key==='lang')renderCountryList();
  if(key==='camMode')renderScenes();
  configure(LAYOUT_KEYS.has(key));
  if(key==='format')resizeCanvas();
  if(playing&&['musicVolume','musicFade','musicLoop','sfxOn','sfxVolume'].includes(key))startAudio();
  saveToStorage();
}
function configure(layoutChanged=false){
  if(!engine)return;
  engine.configure(P,ds,{layoutChanged});
  document.documentElement.style.setProperty('--accent',P.accent);
  const tl=engine.timeline;$('#scrubber').max=tl.total.toFixed(2);t=Math.min(t,tl.total);
  updateInfo();dirty=true;
}
function updateInfo(){
  const tl=engine.timeline,res={1080:1,1440:4/3,2160:2}[P.exportRes],[W,H]=FORMATS[P.format];
  $('#durationInfo').innerHTML=`Video length: <b>${fmtTime(tl.total)}</b> — intro ${tl.intro}s · race ${fmtTime(tl.mainEnd-tl.mainStart)} · outro ${fmtTime(tl.total-tl.holdEnd)}`+(tl.banners.length?` · <b>${tl.banners.length}</b> lead change(s)`:'');
  const w=Math.round(W*res/2)*2,h=Math.round(H*res/2)*2,mbps=Math.min(120,Math.max(6,w*h*P.exportFps*({standard:0.07,high:0.11,max:0.16}[P.exportQuality])/1e6));
  $('#exportInfo').innerHTML=`Output: <b>${w}×${h}</b> · ${P.exportFps} fps · ${fmtTime(tl.total)} · about <b>${Math.round(mbps*tl.total/8)} MB</b><br>${canExportMp4()?'✅ This browser supports frame-by-frame MP4 export':'⚠️ This browser has no WebCodecs support — it will fall back to real-time WebM recording. Use Chrome or Edge for the best result.'}`;
}

// ---------- logo & music ----------
function applyLogo(){
  const pv=$('#logoPreview');
  if(!logoData){engine&&engine.setLogo(null);pv.style.backgroundImage='';pv.textContent='Logo';dirty=true;return}
  const img=new Image();img.onload=()=>{engine.setLogo(img);dirty=true};img.src=logoData;
  pv.style.backgroundImage=`url(${logoData})`;pv.textContent='';
}
$('#logoInput').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(f)});
  const s=Math.min(1,512/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  logoData=c.toDataURL('image/png');applyLogo();saveToStorage();
});
$('#clearLogoBtn').addEventListener('click',()=>{logoData=null;applyLogo();saveToStorage()});
$('#musicInput').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{music=await decodeAudioFile(f);musicLabel=f.name;$('#musicName').textContent=`${f.name} (${fmtTime(music.duration)})`;if(playing)startAudio()}catch(err){alert('Could not read the audio file: '+err.message)}
});
$('#clearMusicBtn').addEventListener('click',()=>{music=null;musicLabel='';$('#musicName').textContent='No music';if(playing)startAudio()});
const audioArgs=()=>({music,settings:P,sfx:engine.timeline.sfx,total:engine.timeline.total});
function startAudio(){previewAudio.start(t,audioArgs())}

// ---------- preview ----------
function resizeCanvas(){
  if(!engine)return;
  const st=$('#stage'),[W,H]=engine.size,aw=st.clientWidth,ah=st.clientHeight;
  const k=Math.min(aw/W,ah/H),cw=Math.max(50,Math.floor(W*k)),ch=Math.max(50,Math.floor(H*k)),dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.style.width=cw+'px';canvas.style.height=ch+'px';
  canvas.width=Math.round(Math.min(W,cw*dpr));canvas.height=Math.round(canvas.width*H/W);
  scale=canvas.width/W;dirty=true;
}
new ResizeObserver(resizeCanvas).observe($('#stage'));
function frameInfo(){return engine&&ds?{year:engine.timeline.yearAt(t),leader:null,...lastInfo}:{year:0}}
let lastInfo={};
function loop(ts){
  if(playing&&!exporting){
    const dt=lastTs?(ts-lastTs)/1000:0;lastTs=ts;t+=Math.min(dt,0.1);
    if(t>=engine.timeline.total){t=engine.timeline.total;setPlaying(false)}
    previewAudio.tick(t);dirty=true;
  }
  if(dirty&&engine&&!exporting){
    dirty=false;
    try{lastInfo=engine.draw(ctx,t,scale,{safeArea:$('#safeAreaChk').checked})}catch(e){console.error(e)}
    $('#scrubber').value=t;$('#timeLabel').textContent=`${fmtTime(t)} / ${fmtTime(engine.timeline.total)}`;
    $('#yearLabel').textContent=ds?engine.fmtYear(lastInfo.year):'—';
  }
  requestAnimationFrame(loop);
}
function setPlaying(v){
  playing=v;lastTs=0;$('#playBtn').textContent=v?'❚❚':'▶';
  if(v){if(t>=engine.timeline.total-0.01)t=0;startAudio()}else previewAudio.stop();
}
$('#playBtn').addEventListener('click',()=>setPlaying(!playing));
$('#restartBtn').addEventListener('click',()=>{t=0;dirty=true;if(playing)startAudio()});
$('#scrubber').addEventListener('input',e=>{t=+e.target.value;dirty=true;if(playing)startAudio()});
$('#safeAreaChk').addEventListener('change',()=>dirty=true);
$('#fullscreenBtn').addEventListener('click',()=>{const st=$('#stage');document.fullscreenElement?document.exitFullscreen():st.requestFullscreen&&st.requestFullscreen()});
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>{const tl=engine.timeline,j=b.dataset.jump;t=j==='intro'?0:j==='main'?tl.mainStart:j==='end'?Math.max(0,tl.mainEnd-0.01):tl.holdEnd+0.01;t=Math.min(t,tl.total);dirty=true;if(playing)startAudio()}));
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||exporting)return;
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing)}
  if(e.code==='ArrowRight'||e.code==='ArrowLeft'){t=Math.max(0,Math.min(engine.timeline.total,t+(e.code==='ArrowRight'?1:-1)*(e.shiftKey?5:1)));dirty=true;if(playing)startAudio()}
});

// tabs
$$('.tab').forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab))}));

// ---------- export ----------
function safeName(){return (P.title||'map-video').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'_').slice(0,80)||'map-video'}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000);return a.href}
async function doExport(){
  if(exporting||!engine)return;
  setPlaying(false);exporting=true;cancelExport=false;
  const modal=$('#exportModal'),bar=$('#exportBar'),status=$('#exportStatus'),link=$('#downloadLink');
  modal.hidden=false;link.hidden=true;$('#closeExportBtn').hidden=true;$('#cancelExportBtn').hidden=false;$('#exportTitle').textContent='Exporting video…';bar.style.width='0%';
  try{
    status.textContent='Loading flags and fonts…';
    await Promise.all([flagsReady(),document.fonts.ready,...[400,600,700,800,900].map(w=>document.fonts.load(`${w} 40px "${P.font}"`).catch(()=>{}))]);
    const scaleOut={1080:1,1440:4/3,2160:2}[P.exportRes]||1,fps=+P.exportFps;
    let result;
    if(canExportMp4()){
      let audio=null;
      if(music||P.sfxOn){status.textContent='Mixing audio…';audio=await renderMix({...audioArgs(),sampleRate:48000})}
      result=await exportMp4({engine,fps,scale:scaleOut,quality:P.exportQuality,audio,isCancelled:()=>cancelExport,onProgress:(p,eta)=>{bar.style.width=(p*100).toFixed(1)+'%';status.textContent=`Frame ${Math.round(p*engine.timeline.total*fps)} of ${Math.round(engine.timeline.total*fps)} · ${Math.round(p*100)}% · about ${fmtTime(eta)} left`}});
    }else{
      result=await exportWebmRealtime({engine,fps,scale:scaleOut,isCancelled:()=>cancelExport,onProgress:(p,eta)=>{bar.style.width=(p*100).toFixed(1)+'%';status.textContent=`Recording in real time… ${Math.round(p*100)}%`}});
    }
    if(!result){modal.hidden=true;return}
    const ext=result.blob.type.includes('mp4')?'mp4':'webm',name=`${safeName()}_${result.width}x${result.height}.${ext}`;
    link.href=download(result.blob,name);link.download=name;link.hidden=false;
    $('#exportTitle').textContent='✅ Video exported';
    status.textContent=`${name} · ${(result.blob.size/1048576).toFixed(1)} MB · ${result.codec}${result.audioCodec?' + '+result.audioCodec:''}`;
  }catch(e){console.error(e);$('#exportTitle').textContent='Export failed';status.textContent=e.message||String(e)}
  finally{exporting=false;dirty=true;$('#cancelExportBtn').hidden=true;$('#closeExportBtn').hidden=false}
}
$('#exportBtn').addEventListener('click',doExport);
$('#quickExportBtn').addEventListener('click',doExport);
$('#cancelExportBtn').addEventListener('click',()=>{cancelExport=true});
$('#closeExportBtn').addEventListener('click',()=>{$('#exportModal').hidden=true});
$('#thumbBtn').addEventListener('click',async()=>{await flagsReady();const blob=await exportPng({engine,t,scale:{1080:1,1440:4/3,2160:2}[P.exportRes]||1});download(blob,`${safeName()}_frame.png`)});

// project files
function saveProjectFile(){download(new Blob([JSON.stringify(projectJson())],{type:'application/json'}),`${safeName()}.mapstudio.json`)}
$('#saveProjectBtn').addEventListener('click',saveProjectFile);$('#saveProjectBtn2').addEventListener('click',saveProjectFile);
$('#loadProjectInput').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const prevDetail=P.detail;applyProject(JSON.parse(await f.text()));table=null;applyLogo();applyCustomImages();buildControls();refreshDataUI();if(P.detail!==prevDetail)await changed('detail');configure(true);loadFlags();resizeCanvas();t=0;saveToStorage()}catch(err){alert('Invalid project file: '+err.message)}
  e.target.value='';
});
$('#resetBtn').addEventListener('click',()=>{if(!confirm('Reset all settings to their defaults? (Your data will be kept.)'))return;const keep={names:P.names,colors:P.colors,images:P.images,imgStyles:P.imgStyles};P={...structuredClone(DEFAULTS),...keep};buildControls();refreshDataUI();configure(true);resizeCanvas();saveToStorage()});

// ---------- utils ----------
function fmtTime(s){s=Math.max(0,s||0);const m=Math.floor(s/60),r=Math.floor(s%60);return `${m}:${String(r).padStart(2,'0')}`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

boot().catch(e=>{console.error(e);$('#loading').hidden=false;$('#loading').textContent='Something went wrong while starting: '+e.message});
