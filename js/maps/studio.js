// Map Studio — UI, state and preview loop. A standalone page (maps.html); it shares no state
// with the original index.html app.
import {feature} from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import {buildNameIndex,readWorkbook,parseCsvText,detectColumns,toRecords,buildDataset,iso2Of,nameFor,REGIONS} from './data.js';
import {createEngine,SCALES,FORMATS,THEMES} from './engine.js';
import {decodeAudioFile,renderMix,PreviewAudio} from './audio.js';
import {canExportMp4,exportMp4,exportWebmRealtime,exportPng} from './exporter.js';

const d3=window.d3;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ATLAS=res=>`https://cdn.jsdelivr.net/npm/@d3-maps/atlas@1.0.0/dist/world/countries/countries-${res}.json`;
const FLAG=iso2=>`https://flagcdn.com/w640/${iso2}.png`;
const STORE_KEY='mapStudio.v1';
const SAMPLE_URL='data/sample-retirement-age.csv';

const DEFAULTS={
  format:'16:9',projection:'flat',detail:'50m',fill:'hybrid',flagCount:10,palette:'inferno',logScale:false,reverseScale:false,
  mapLabels:3,beacon:true,leaderGlow:true,vignette:true,
  theme:'dark',accent:'#ffcf4d',oceanColor:'',landColor:'',font:'Cairo',
  showBars:true,topN:10,barsSide:'right',barsDir:'rtl',barsWidth:36,barsNameWidth:30,barColor:'country',barFlags:true,axisMode:'zero',barsTitle:'',
  showYear:true,showProgress:true,showLegend:true,legendTitle:'',
  secPerYear:1.2,yearEase:'soft',introDur:4,holdDur:3,outroDur:4.5,
  camMode:'leader',region:'world',flightDur:2.2,zoomIntensity:1,minShot:3,endWide:true,kenBurns:true,
  kicker:'قصة بيانات عالمية',title:'متوسط سن التقاعد حول العالم',subtitle:'متوسط العمر الفعلي للخروج من سوق العمل · 1990–2024',introTitle:'',introSub:'',source:'OECD',sourcePrefix:'المصدر: ',
  lang:'ar',digits:'latin',decimals:1,prefix:'',unit:'سنة',compact:false,textAlign:'right',
  leaderBanner:true,bannerKicker:'صدارة جديدة',bannerText:'{name}',
  channelName:'Atlas in Numbers',watermark:true,wmPos:'tl',wmOpacity:0.9,
  outroTitle:'لا تنسَ الاشتراك',outroSub:'خرائط وأرقام تشرح العالم',subscribeText:'اشترك',subscribedText:'تم الاشتراك ✓',
  musicVolume:0.7,musicFade:2.5,musicLoop:true,sfxOn:true,sfxVolume:0.5,
  exportRes:'1080',exportFps:60,exportQuality:'high',
  events:[],scenes:[],names:{},colors:{}
};

// ---------- control schema (rendered into .auto[data-group]) ----------
const opt=(pairs)=>pairs.map(([v,l])=>({v,l}));
const isLandscape=P=>{const [w,h]=FORMATS[P.format];return w/h>1.4};
const SCHEMA=[
  {g:'format',k:'format',l:'مقاس الفيديو',t:'seg',o:opt([['16:9','يوتيوب 16:9'],['9:16','شورتس 9:16'],['1:1','مربع'],['4:5','إنستغرام 4:5']])},
  {g:'map',k:'projection',l:'نوع الخريطة',t:'seg',o:opt([['flat','مسطحة'],['globe','كرة أرضية 3D']])},
  {g:'map',k:'detail',l:'دقة الحدود',t:'seg',o:opt([['50m','عادية'],['10m','عالية جداً']])},
  {g:'map',k:'fill',l:'تلوين الدول',t:'select',o:opt([['hybrid','أعلام للمتصدرين + ألوان للبقية'],['value','ألوان حسب القيمة'],['flags','أعلام لكل الدول']])},
  {g:'map',k:'flagCount',l:'عدد الأعلام على الخريطة',t:'range',min:1,max:40,step:1,show:P=>P.fill==='hybrid'},
  {g:'map',k:'palette',l:'تدرّج الألوان',t:'select',o:Object.entries(SCALES).map(([v,[l]])=>({v,l})),show:P=>P.fill!=='flags'},
  {g:'map',k:'logScale',l:'مقياس لوغاريتمي',t:'toggle',show:P=>P.fill!=='flags',help:'مفيد لبيانات السكان والناتج المحلي'},
  {g:'map',k:'reverseScale',l:'عكس التدرّج',t:'toggle',show:P=>P.fill!=='flags'},
  {g:'map',k:'mapLabels',l:'بطاقات الأسماء على الخريطة',t:'range',min:0,max:5,step:1},
  {g:'map',k:'beacon',l:'نبض على المتصدّر',t:'toggle'},
  {g:'map',k:'leaderGlow',l:'توهّج حدود المتصدّر',t:'toggle'},
  {g:'map',k:'vignette',l:'تظليل سينمائي للأطراف',t:'toggle'},
  {g:'theme',k:'theme',l:'السمة',t:'seg',o:opt([['dark','داكنة'],['light','فاتحة']])},
  {g:'theme',k:'accent',l:'لون التمييز',t:'color'},
  {g:'theme',k:'oceanColor',l:'لون المحيط',t:'coloropt',def:P=>THEMES[P.theme].sphere},
  {g:'theme',k:'landColor',l:'لون الدول بلا بيانات',t:'coloropt',def:P=>THEMES[P.theme].land},
  {g:'theme',k:'font',l:'الخط',t:'select',o:opt([['Cairo','Cairo'],['Tajawal','Tajawal'],['Almarai','Almarai'],['IBM Plex Sans Arabic','IBM Plex Arabic'],['Noto Kufi Arabic','Noto Kufi'],['Inter','Inter (لاتيني)']])},
  {g:'bars',k:'showBars',l:'إظهار سباق الأعمدة',t:'toggle'},
  {g:'bars',k:'topN',l:'عدد الدول',t:'range',min:3,max:20,step:1,show:P=>P.showBars},
  {g:'bars',k:'barsSide',l:'مكان اللوحة',t:'seg',o:opt([['right','يمين'],['left','يسار']]),show:P=>P.showBars&&isLandscape(P)},
  {g:'bars',k:'barsDir',l:'اتجاه الأعمدة',t:'seg',o:opt([['rtl','من اليمين (عربي)'],['ltr','من اليسار']]),show:P=>P.showBars},
  {g:'bars',k:'barsWidth',l:'عرض اللوحة %',t:'range',min:24,max:50,step:1,show:P=>P.showBars&&isLandscape(P)},
  {g:'bars',k:'barsNameWidth',l:'مساحة الأسماء %',t:'range',min:15,max:50,step:1,show:P=>P.showBars},
  {g:'bars',k:'barColor',l:'لون الأعمدة',t:'seg',o:opt([['country','لون لكل دولة'],['accent','لون موحّد']]),show:P=>P.showBars},
  {g:'bars',k:'barFlags',l:'علم على طرف العمود',t:'toggle',show:P=>P.showBars},
  {g:'bars',k:'axisMode',l:'بداية الأعمدة',t:'seg',o:opt([['zero','من الصفر'],['auto','تكبير الفروقات']]),show:P=>P.showBars,help:'«تكبير الفروقات» يُبرز الاختلافات الصغيرة بين القيم المتقاربة'},
  {g:'bars',k:'barsTitle',l:'عنوان اللوحة',t:'text',ph:'مثال: أعلى 10 دول',show:P=>P.showBars},
  {g:'hud',k:'showYear',l:'السنة الكبيرة',t:'toggle'},
  {g:'hud',k:'showProgress',l:'شريط التقدّم الزمني',t:'toggle',show:P=>P.showYear},
  {g:'hud',k:'showLegend',l:'مفتاح الألوان',t:'toggle',show:P=>P.fill!=='flags'},
  {g:'hud',k:'legendTitle',l:'عنوان المفتاح',t:'text',show:P=>P.showLegend&&P.fill!=='flags'},
  {g:'timing',k:'secPerYear',l:'ثوانٍ لكل سنة',t:'range',min:0.2,max:6,step:0.1},
  {g:'timing',k:'yearEase',l:'إيقاع السنوات',t:'select',o:opt([['soft','ناعم (موصى به)'],['linear','ثابت'],['step','توقّف عند كل سنة']])},
  {g:'timing',k:'introDur',l:'مدة المقدمة (ث)',t:'range',min:0,max:12,step:0.5},
  {g:'timing',k:'holdDur',l:'ثبات على النتيجة (ث)',t:'range',min:0,max:12,step:0.5},
  {g:'timing',k:'outroDur',l:'مدة الخاتمة (ث)',t:'range',min:0,max:12,step:0.5},
  {g:'camera',k:'camMode',l:'وضع الكاميرا',t:'select',o:opt([['leader','تتبّع المتصدّر تلقائياً'],['fixed','ثابتة على منطقة'],['scenes','مشاهد مخصّصة (إخراج يدوي)']])},
  {g:'camera',k:'region',l:'المنطقة الأساسية',t:'select',o:REGIONS.map(r=>({v:r.key,l:r.ar})),help:'تُستخدم للكاميرا الثابتة وللقطة الختامية الواسعة'},
  {g:'camera',k:'flightDur',l:'مدة انتقال الكاميرا (ث)',t:'range',min:0.6,max:6,step:0.1},
  {g:'camera',k:'zoomIntensity',l:'قوة التقريب على الدولة',t:'range',min:0.3,max:2.5,step:0.05},
  {g:'camera',k:'minShot',l:'أقل مدة للّقطة (ث)',t:'range',min:1,max:12,step:0.5,show:P=>P.camMode==='leader',help:'يمنع تنقّل الكاميرا المزعج عندما يتبادل بلدان الصدارة بسرعة'},
  {g:'camera',k:'endWide',l:'لقطة واسعة في النهاية',t:'toggle'},
  {g:'camera',k:'kenBurns',l:'حركة تقريب بطيئة (Ken Burns)',t:'toggle'},
  {g:'titles',k:'kicker',l:'نص صغير فوق العنوان',t:'text'},
  {g:'titles',k:'title',l:'العنوان',t:'text'},
  {g:'titles',k:'subtitle',l:'العنوان الفرعي',t:'text'},
  {g:'titles',k:'introTitle',l:'عنوان المقدمة',t:'text',ph:'(نفس العنوان)'},
  {g:'titles',k:'introSub',l:'وصف المقدمة',t:'text',ph:'(نفس العنوان الفرعي)'},
  {g:'titles',k:'sourcePrefix',l:'بادئة المصدر',t:'text'},
  {g:'titles',k:'source',l:'مصدر البيانات',t:'text'},
  {g:'numbers',k:'lang',l:'أسماء الدول',t:'seg',o:opt([['ar','عربي'],['en','English'],['file','كما في الملف']])},
  {g:'numbers',k:'digits',l:'الأرقام',t:'seg',o:opt([['latin','123'],['arab','١٢٣']])},
  {g:'numbers',k:'decimals',l:'المنازل العشرية',t:'range',min:0,max:4,step:1},
  {g:'numbers',k:'prefix',l:'قبل الرقم',t:'text',ph:'مثال: $'},
  {g:'numbers',k:'unit',l:'الوحدة بعد الرقم',t:'text',ph:'مثال: سنة، %، دولار'},
  {g:'numbers',k:'compact',l:'اختصار الأرقام الكبيرة',t:'toggle',help:'1,500,000 ← 1.5 مليون'},
  {g:'numbers',k:'textAlign',l:'محاذاة العنوان',t:'seg',o:opt([['right','يمين'],['center','وسط'],['left','يسار']]),show:isLandscape},
  {g:'banner',k:'leaderBanner',l:'إظهار التنبيه',t:'toggle'},
  {g:'banner',k:'bannerKicker',l:'النص الصغير',t:'text',show:P=>P.leaderBanner},
  {g:'banner',k:'bannerText',l:'النص ({name} = الدولة)',t:'text',show:P=>P.leaderBanner},
  {g:'brand',k:'channelName',l:'اسم القناة',t:'text'},
  {g:'brand',k:'watermark',l:'علامة مائية',t:'toggle'},
  {g:'brand',k:'wmPos',l:'موضعها',t:'seg',o:opt([['tl','↖'],['tr','↗'],['bl','↙'],['br','↘']]),show:P=>P.watermark},
  {g:'brand',k:'wmOpacity',l:'الشفافية',t:'range',min:0.2,max:1,step:0.05,show:P=>P.watermark},
  {g:'outro',k:'outroTitle',l:'العنوان',t:'text'},
  {g:'outro',k:'outroSub',l:'النص الفرعي',t:'text'},
  {g:'outro',k:'subscribeText',l:'زر الاشتراك',t:'text'},
  {g:'outro',k:'subscribedText',l:'بعد الضغط',t:'text'},
  {g:'audio',k:'musicVolume',l:'مستوى الموسيقى',t:'range',min:0,max:1,step:0.05},
  {g:'audio',k:'musicFade',l:'تلاشي الموسيقى في النهاية (ث)',t:'range',min:0,max:8,step:0.5},
  {g:'audio',k:'musicLoop',l:'تكرار الموسيقى',t:'toggle'},
  {g:'audio',k:'sfxOn',l:'المؤثرات الصوتية',t:'toggle'},
  {g:'audio',k:'sfxVolume',l:'مستوى المؤثرات',t:'range',min:0,max:1,step:0.05,show:P=>P.sfxOn},
  {g:'export',k:'exportRes',l:'الدقة',t:'seg',o:opt([['1080','1080p'],['1440','1440p'],['2160','4K']])},
  {g:'export',k:'exportFps',l:'الإطارات/ث',t:'seg',o:[{v:30,l:'30'},{v:60,l:'60'}]},
  {g:'export',k:'exportQuality',l:'الجودة',t:'seg',o:opt([['standard','قياسية'],['high','عالية'],['max','قصوى']])}
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
  try{features=await loadAtlas(P.detail)}catch(e){if(P.detail!=='50m'){P.detail='50m';features=await loadAtlas('50m')}else{$('#loading').textContent='تعذّر تحميل الخريطة. تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.';throw e}}
  buildNameIndex(features);
  engine=createEngine(features);
  if(!ds){try{const txt=await fetch(SAMPLE_URL).then(r=>r.text());loadTable(parseCsvText(txt),'بيانات تجريبية: متوسط سن التقاعد (OECD)')}catch{}}
  else refreshDataUI();
  applyLogo();
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
  if(obj.records&&obj.records.length){ds=buildDataset(obj.records.map(([id,name,year,value])=>({id,name,year,value})));fileLabel=obj.fileLabel||'مشروع محفوظ'}
}
function restoreFromStorage(){try{const raw=localStorage.getItem(STORE_KEY);if(raw)applyProject(JSON.parse(raw))}catch{}}

// ---------- data ----------
function loadTable(tb,label){
  table=tb;fileLabel=label;
  mapping=detectColumns(tb,engine.validIds);
  applyMapping();
  fillMappingUI();
}
function applyMapping(){
  const {records,unresolved}=toRecords(table,mapping,engine.validIds);
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
  if(!d){el.innerHTML=`<span class="warn">لم يتم التعرّف على بيانات صالحة في «${esc(fileLabel)}». افتح «ربط الأعمدة يدوياً» واختر الأعمدة الصحيحة.</span>`;return}
  const un=unresolved.slice(0,8).map(([n,c])=>esc(n)).join('، ');
  el.innerHTML=`<b>${esc(fileLabel)}</b><br>${d.ids.length} دولة · من ${d.yearMin} إلى ${d.yearMax} · ${d.records.length.toLocaleString('en')} قيمة`+(unresolved.length?`<br><span class="warn">تم تجاهل ${unresolved.length} اسم غير معروف كدولة (مثل المجاميع): ${un}${unresolved.length>8?'…':''}</span>`:'');
}
function refreshDataUI(){if(ds&&!table)showDataInfo(ds);renderCountryList();renderScenes();renderEvents()}
function fillMappingUI(){
  if(!table)return;
  const opts=(withNone)=>(withNone?'<option value="-1">— بدون —</option>':'')+table.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
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
  }catch(e){console.error(e);alert('تعذّرت قراءة الملف: '+e.message)}
}
$('#fileInput').addEventListener('change',e=>handleFile(e.target.files[0]));
const dz=$('#dropzone');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
$('#sampleBtn').addEventListener('click',async()=>{const txt=await fetch(SAMPLE_URL).then(r=>r.text());loadTable(parseCsvText(txt),'بيانات تجريبية: متوسط سن التقاعد (OECD)')});

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
  return ds.ids.map(id=>({id,n:nameFor(id,P.lang==='file'?'ar':P.lang,ds.fileNames.get(id))})).sort((a,b)=>a.n.localeCompare(b.n,'ar')).map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.n)}</option>`).join('');
}
function renderCountryList(){
  const el=$('#countryList');if(!ds){el.innerHTML='';return}
  const q=$('#countrySearch').value.trim().toLowerCase();
  const last=new Map(ds.ids.map(id=>{const a=ds.series.get(id);return [id,a[a.length-1]]}));
  const ids=ds.ids.slice().sort((a,b)=>(last.get(b)||0)-(last.get(a)||0));
  el.innerHTML=ids.filter(id=>!q||engine.nameOf(id).toLowerCase().includes(q)||(ds.fileNames.get(id)||'').toLowerCase().includes(q)||id.toLowerCase().includes(q)).map(id=>{
    const iso2=iso2Of(id),def=nameFor(id,P.lang,ds.fileNames.get(id));
    return `<div class="country-row" data-id="${id}"><img src="${iso2?FLAG(iso2).replace('w640','w80'):''}" alt="" loading="lazy"><input type="text" class="cn" value="${esc(P.names[id]||'')}" placeholder="${esc(def)}"><input type="color" class="cc" value="${P.colors[id]||'#888888'}" title="لون العمود"><button class="x-btn" type="button" title="إعادة الضبط">↺</button></div>`;
  }).join('');
}
$('#countrySearch').addEventListener('input',renderCountryList);
$('#countryList').addEventListener('input',e=>{
  const row=e.target.closest('.country-row');if(!row)return;const id=row.dataset.id;
  if(e.target.classList.contains('cn')){const v=e.target.value.trim();if(v)P.names[id]=v;else delete P.names[id]}
  if(e.target.classList.contains('cc'))P.colors[id]=e.target.value;
  changed();
});
$('#countryList').addEventListener('click',e=>{
  if(!e.target.classList.contains('x-btn'))return;const id=e.target.closest('.country-row').dataset.id;
  delete P.names[id];delete P.colors[id];renderCountryList();changed();
});

// scenes
function targetOptions(sel){return `<optgroup label="مناطق">${REGIONS.map(r=>`<option value="${r.key}"${r.key===sel?' selected':''}>${r.ar}</option>`).join('')}</optgroup><optgroup label="دول">${countryOptions(sel)}</optgroup>`}
function renderScenes(){
  $('#scenesCard').hidden=P.camMode!=='scenes';
  $('#scenesList').innerHTML=P.scenes.map((s,i)=>`<div class="list-row scene-row" data-i="${i}"><input type="number" class="sy" value="${s.year}" step="0.5" title="السنة"><select class="st">${targetOptions(s.target)}</select><input type="range" class="sz" min="0.4" max="3" step="0.1" value="${s.zoom||1}" title="التقريب"><button class="x-btn" type="button">✕</button></div>`).join('')||'<p class="hint">لا توجد مشاهد بعد.</p>';
}
$('#addSceneBtn').addEventListener('click',()=>{
  const y=ds?Math.round(engine.timeline.yearAt(t)):2000;const info=frameInfo();
  P.scenes.push({year:y,target:info.leader||'world',zoom:1});P.scenes.sort((a,b)=>a.year-b.year);renderScenes();changed();
});
$('#scenesList').addEventListener('input',e=>{const row=e.target.closest('.list-row');if(!row)return;const s=P.scenes[+row.dataset.i];if(e.target.classList.contains('sy'))s.year=+e.target.value;if(e.target.classList.contains('st'))s.target=e.target.value;if(e.target.classList.contains('sz'))s.zoom=+e.target.value;changed()});
$('#scenesList').addEventListener('click',e=>{if(!e.target.classList.contains('x-btn'))return;P.scenes.splice(+e.target.closest('.list-row').dataset.i,1);renderScenes();changed()});

// events
function renderEvents(){
  $('#eventsList').innerHTML=P.events.map((ev,i)=>`<div class="list-row event-row" data-i="${i}"><input type="number" class="ey" value="${ev.year}" title="السنة"><input type="text" class="et" value="${esc(ev.text)}" placeholder="نص الحدث"><input type="number" class="ed" value="${ev.dur}" min="1" max="20" step="0.5" title="المدة (ث)"><button class="x-btn" type="button">✕</button></div>`).join('')||'<p class="hint">لا توجد أحداث بعد.</p>';
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
  if(c.t==='coloropt'){const w=document.createElement('div');w.className='colorwrap';w.innerHTML='<input type="color"><button type="button" class="ghost-btn small">تلقائي</button>';w.firstChild.addEventListener('input',e=>set(e.target.value));w.lastChild.addEventListener('click',()=>{set('');syncControls()});return w}
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
  if(key==='detail'){if(reloadingAtlas)return;reloadingAtlas=true;$('#loading').hidden=false;$('#loading').textContent='جاري تحميل حدود عالية الدقة…';try{features=await loadAtlas(P.detail);buildNameIndex(features);engine=createEngine(features);flagPromises.clear();loadFlags();applyLogo()}catch{P.detail='50m'}reloadingAtlas=false;$('#loading').hidden=true;configure(true);syncControls();saveToStorage();return}
  if(['showBars','fill','camMode','showLegend','showYear','leaderBanner','watermark','sfxOn','format','theme'].includes(key))syncControls();
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
  $('#durationInfo').innerHTML=`مدة الفيديو: <b>${fmtTime(tl.total)}</b> — مقدمة ${tl.intro}ث · السباق ${fmtTime(tl.mainEnd-tl.mainStart)} · خاتمة ${fmtTime(tl.total-tl.holdEnd)}`+(tl.banners.length?` · <b>${tl.banners.length}</b> تغيير في الصدارة`:'');
  const w=Math.round(W*res/2)*2,h=Math.round(H*res/2)*2,mbps=Math.min(120,Math.max(6,w*h*P.exportFps*({standard:0.07,high:0.11,max:0.16}[P.exportQuality])/1e6));
  $('#exportInfo').innerHTML=`الناتج: <b>${w}×${h}</b> · ${P.exportFps} إطار/ث · ${fmtTime(tl.total)} · حوالي <b>${Math.round(mbps*tl.total/8)} MB</b><br>${canExportMp4()?'✅ المتصفح يدعم التصدير إطاراً بإطار (MP4)':'⚠️ هذا المتصفح لا يدعم WebCodecs — سيتم التسجيل الحي بصيغة WebM. استخدم Chrome أو Edge لأفضل نتيجة.'}`;
}

// ---------- logo & music ----------
function applyLogo(){
  const pv=$('#logoPreview');
  if(!logoData){engine&&engine.setLogo(null);pv.style.backgroundImage='';pv.textContent='شعار';dirty=true;return}
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
  try{music=await decodeAudioFile(f);musicLabel=f.name;$('#musicName').textContent=`${f.name} (${fmtTime(music.duration)})`;if(playing)startAudio()}catch(err){alert('تعذّرت قراءة الملف الصوتي: '+err.message)}
});
$('#clearMusicBtn').addEventListener('click',()=>{music=null;musicLabel='';$('#musicName').textContent='لا توجد موسيقى';if(playing)startAudio()});
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
  modal.hidden=false;link.hidden=true;$('#closeExportBtn').hidden=true;$('#cancelExportBtn').hidden=false;$('#exportTitle').textContent='جاري تصدير الفيديو…';bar.style.width='0%';
  try{
    status.textContent='تحميل الأعلام والخطوط…';
    await Promise.all([flagsReady(),document.fonts.ready,...[400,600,700,800,900].map(w=>document.fonts.load(`${w} 40px "${P.font}"`).catch(()=>{}))]);
    const scaleOut={1080:1,1440:4/3,2160:2}[P.exportRes]||1,fps=+P.exportFps;
    let result;
    if(canExportMp4()){
      let audio=null;
      if(music||P.sfxOn){status.textContent='مزج الصوت…';audio=await renderMix({...audioArgs(),sampleRate:48000})}
      result=await exportMp4({engine,fps,scale:scaleOut,quality:P.exportQuality,audio,isCancelled:()=>cancelExport,onProgress:(p,eta)=>{bar.style.width=(p*100).toFixed(1)+'%';status.textContent=`الإطار ${Math.round(p*engine.timeline.total*fps)} من ${Math.round(engine.timeline.total*fps)} · ${Math.round(p*100)}% · متبقٍ تقريباً ${fmtTime(eta)}`}});
    }else{
      result=await exportWebmRealtime({engine,fps,scale:scaleOut,isCancelled:()=>cancelExport,onProgress:(p,eta)=>{bar.style.width=(p*100).toFixed(1)+'%';status.textContent=`تسجيل حي… ${Math.round(p*100)}%`}});
    }
    if(!result){modal.hidden=true;return}
    const ext=result.blob.type.includes('mp4')?'mp4':'webm',name=`${safeName()}_${result.width}x${result.height}.${ext}`;
    link.href=download(result.blob,name);link.download=name;link.hidden=false;
    $('#exportTitle').textContent='✅ تم تصدير الفيديو';
    status.textContent=`${name} · ${(result.blob.size/1048576).toFixed(1)} MB · ${result.codec}${result.audioCodec?' + '+result.audioCodec:''}`;
  }catch(e){console.error(e);$('#exportTitle').textContent='تعذّر التصدير';status.textContent=e.message||String(e)}
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
  try{const prevDetail=P.detail;applyProject(JSON.parse(await f.text()));table=null;applyLogo();buildControls();refreshDataUI();if(P.detail!==prevDetail)await changed('detail');configure(true);loadFlags();resizeCanvas();t=0;saveToStorage()}catch(err){alert('ملف المشروع غير صالح: '+err.message)}
  e.target.value='';
});
$('#resetBtn').addEventListener('click',()=>{if(!confirm('إعادة جميع الإعدادات إلى الوضع الافتراضي؟ (البيانات لن تُحذف)'))return;const keep={names:P.names,colors:P.colors};P={...structuredClone(DEFAULTS),...keep};buildControls();refreshDataUI();configure(true);resizeCanvas();saveToStorage()});

// ---------- utils ----------
function fmtTime(s){s=Math.max(0,s||0);const m=Math.floor(s/60),r=Math.floor(s%60);return `${m}:${String(r).padStart(2,'0')}`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

boot().catch(e=>{console.error(e);$('#loading').hidden=false;$('#loading').textContent='حدث خطأ أثناء التشغيل: '+e.message});
