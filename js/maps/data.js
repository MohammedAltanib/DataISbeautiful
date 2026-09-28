// Data layer for the Map Studio: spreadsheet parsing, column detection, country-name
// resolution (English + Arabic), dense per-country series and fast per-frame lookups.
import {ISO3_TO_ISO2,CONTINENT_OF} from './countries.js';

// The atlas uses Natural Earth "adm0" codes for a few territories; standard ISO3 codes in
// uploaded files are folded onto them so they still land on the map.
const ISO_TO_ATLAS={PSE:'PSX',SSD:'SDS',ESH:'SAH',ALA:'ALD',XKX:'KOS',KSV:'KOS'};
export const toAtlasId=code=>ISO_TO_ATLAS[code]||code;
export const iso2Of=id=>ISO3_TO_ISO2[id]||null;
// Every id the studio accepts: countries with a map shape plus ISO territories without one
// (e.g. Gibraltar, Réunion) — those still take part in the bar race, just not on the map.
export function knownIds(mapIds){const s=new Set(mapIds);for(const k of Object.keys(ISO3_TO_ISO2))s.add(toAtlasId(k));return s}

const displayAr=safeDisplayNames('ar'),displayEn=safeDisplayNames('en');
function safeDisplayNames(lang){try{return new Intl.DisplayNames([lang],{type:'region'})}catch{return null}}
// Shorter, broadcast-friendly Arabic names where the CLDR default is long or unusual.
const AR_FIX={ps:'فلسطين',us:'الولايات المتحدة',gb:'المملكة المتحدة',kr:'كوريا الجنوبية',kp:'كوريا الشمالية',cd:'الكونغو الديمقراطية',cg:'الكونغو',ae:'الإمارات',cz:'التشيك',mk:'مقدونيا الشمالية',ba:'البوسنة والهرسك',hk:'هونغ كونغ',mo:'ماكاو',ci:'ساحل العاج',va:'الفاتيكان',ss:'جنوب السودان',eh:'الصحراء الغربية',xk:'كوسوفو',tl:'تيمور الشرقية',cv:'الرأس الأخضر',sz:'إسواتيني',mm:'ميانمار',fm:'ميكرونيزيا'};
const EN_FIX={xk:'Kosovo'};

export function nameFor(id,lang,fileName){
  const iso2=iso2Of(id);
  if(lang==='file'&&fileName)return fileName;
  if(iso2){
    if(lang==='ar'){if(AR_FIX[iso2])return AR_FIX[iso2];try{const n=displayAr&&displayAr.of(iso2.toUpperCase());if(n&&n.toUpperCase()!==iso2.toUpperCase())return n}catch{}}
    if(lang==='en'||lang==='ar'){if(EN_FIX[iso2])return EN_FIX[iso2];try{const n=displayEn&&displayEn.of(iso2.toUpperCase());if(n&&lang==='en'&&n.toUpperCase()!==iso2.toUpperCase())return n}catch{}}
  }
  return fileName||id;
}

// ---- name → id index ----
export function normalizeName(s){
  return String(s??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/['’`´]/g,'')
    .replace(/[ً-ْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
    .replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/^the /,'').replace(/\s+/g,' ').trim();
}
const ALIASES={
  'united states of america':'USA','usa':'USA','us':'USA','america':'USA','uk':'GBR','great britain':'GBR','britain':'GBR','england':'GBR',
  'russia':'RUS','russian federation':'RUS','south korea':'KOR','korea rep':'KOR','korea republic of':'KOR','republic of korea':'KOR','north korea':'PRK','korea dem peoples rep':'PRK',
  'iran':'IRN','iran islamic rep':'IRN','syria':'SYR','syrian arab republic':'SYR','vietnam':'VNM','viet nam':'VNM','laos':'LAO','lao pdr':'LAO','czech republic':'CZE','czechia':'CZE',
  'turkey':'TUR','turkiye':'TUR','ivory coast':'CIV','cote d ivoire':'CIV','dr congo':'COD','congo dem rep':'COD','democratic republic of the congo':'COD','drc':'COD','congo rep':'COG','republic of the congo':'COG','congo':'COG',
  'egypt arab rep':'EGY','yemen rep':'YEM','venezuela rb':'VEN','bolivia':'BOL','tanzania':'TZA','macedonia':'MKD','north macedonia':'MKD','moldova':'MDA','eswatini':'SWZ','swaziland':'SWZ',
  'burma':'MMR','myanmar':'MMR','cape verde':'CPV','cabo verde':'CPV','uae':'ARE','emirates':'ARE','palestine':'PSX','state of palestine':'PSX','west bank and gaza':'PSX','palestinian territories':'PSX',
  'kyrgyz republic':'KGZ','slovak republic':'SVK','gambia the':'GMB','bahamas the':'BHS','micronesia fed sts':'FSM','hong kong sar china':'HKG','macao sar china':'MAC','taiwan':'TWN','kosovo':'KOS',
  'south sudan':'SDS','naoero':'NRU','macau':'MAC','holy see':'VAT','vatican city':'VAT','korea dem rep':'PRK','dem peoples republic of korea':'PRK','democratic peoples republic of korea':'PRK',
  'united republic of tanzania':'TZA','republic of moldova':'MDA','lao peoples democratic republic':'LAO','st martin':'MAF','saint martin':'MAF','sint maarten':'SXM',
  'virgin islands us':'VIR','us virgin islands':'VIR','united states virgin islands':'VIR','virgin islands british':'VGB','netherlands kingdom of the':'NLD','reunion':'REU','curacao':'CUW','western sahara':'SAH','timor leste':'TLS','east timor':'TLS','brunei darussalam':'BRN','st lucia':'LCA','st kitts and nevis':'KNA','st vincent and the grenadines':'VCT',
  'السعوديه':'SAU','المملكه العربيه السعوديه':'SAU','الامارات':'ARE','الامارات العربيه المتحده':'ARE','مصر':'EGY','امريكا':'USA','الولايات المتحده':'USA','الولايات المتحده الامريكيه':'USA',
  'بريطانيا':'GBR','المملكه المتحده':'GBR','روسيا':'RUS','الصين':'CHN','اليابان':'JPN','المانيا':'DEU','فرنسا':'FRA','فلسطين':'PSX','سوريا':'SYR','سوريه':'SYR','العراق':'IRQ','الاردن':'JOR','لبنان':'LBN',
  'الكويت':'KWT','قطر':'QAT','البحرين':'BHR','عمان':'OMN','سلطنه عمان':'OMN','اليمن':'YEM','المغرب':'MAR','الجزائر':'DZA','تونس':'TUN','ليبيا':'LBY','السودان':'SDN','جنوب السودان':'SDS',
  'موريتانيا':'MRT','الصومال':'SOM','جيبوتي':'DJI','جزر القمر':'COM','تركيا':'TUR','ايران':'IRN','الهند':'IND','باكستان':'PAK','كوريا الجنوبيه':'KOR','كوريا الشماليه':'PRK','البرازيل':'BRA','كندا':'CAN'
};
let nameIndex=null;
export function buildNameIndex(features){
  const idx=new Map();
  const add=(name,id)=>{const k=normalizeName(name);if(k&&!idx.has(k))idx.set(k,id)};
  for(const [k,v] of Object.entries(ALIASES))idx.set(normalizeName(k),v);
  for(const f of features){const p=f.properties;add(p.name,p.id);add(p.name_long,p.id)}
  for(const [id,iso2] of Object.entries(ISO3_TO_ISO2)){
    const atlasId=toAtlasId(id);
    try{add(displayEn&&displayEn.of(iso2.toUpperCase()),atlasId)}catch{}
    try{const ar=displayAr&&displayAr.of(iso2.toUpperCase());add(ar,atlasId);if(ar)add(ar.replace(/^ال/,''),atlasId)}catch{}
    if(AR_FIX[iso2])add(AR_FIX[iso2],atlasId);
  }
  nameIndex=idx;
  return idx;
}
export function resolveId(name,code,validIds){
  const c=String(code??'').trim().toUpperCase();
  if(/^[A-Z]{3}$/.test(c)){const id=toAtlasId(c);if(!validIds||validIds.has(id))return id}
  if(/^[A-Z]{2}$/.test(c)){const hit=Object.entries(ISO3_TO_ISO2).find(([,v])=>v===c.toLowerCase());if(hit)return toAtlasId(hit[0])}
  if(!nameIndex)return null;
  const n=normalizeName(name);
  if(nameIndex.has(n))return nameIndex.get(n);
  const noAl=n.replace(/(^| )ال/g,'$1');
  if(nameIndex.has(noAl))return nameIndex.get(noAl);
  // Statistical-office spellings: "Puerto Rico (US)", "St. Martin (French part)", "Bolivia (Plurinational State of)",
  // "China, Hong Kong SAR", "Korea, Dem. People's Rep." — try without the bracketed part, then each comma part.
  const raw=String(name??''),noParen=normalizeName(raw.replace(/\([^)]*\)/g,' '));
  if(noParen&&nameIndex.has(noParen))return nameIndex.get(noParen);
  const inParen=normalizeName(raw.replace(/[()]/g,' ').replace(/\./g,''));
  if(inParen&&nameIndex.has(inParen))return nameIndex.get(inParen);
  const parts=raw.split(',').map(p=>normalizeName(p.replace(/\([^)]*\)/g,' ')).replace(/\b(sar|rep|the|of)\b/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  if(parts.length>1){
    const joined=normalizeName(parts.slice(1).join(' ')+' '+parts[0]);
    for(const c of [joined,...parts.slice().reverse()])if(nameIndex.has(c))return nameIndex.get(c);
  }
  // Also accept a 3-letter code typed in the name column.
  const up=String(name??'').trim().toUpperCase();
  if(/^[A-Z]{3}$/.test(up)&&(!validIds||validIds.has(toAtlasId(up))))return toAtlasId(up);
  return null;
}

// ---- regions (camera targets) ----
const ARAB='DZA BHR COM DJI EGY IRQ JOR KWT LBN LBY MRT MAR OMN PSX QAT SAU SOM SDN SYR TUN ARE YEM SAH SOL'.split(' ');
export const REGIONS=[
  {key:'world',label:'World',ids:null},
  {key:'data',label:'Countries in the data',ids:'data'},
  {key:'arab',label:'Arab world',ids:ARAB},
  {key:'gcc',label:'Gulf states (GCC)',ids:'SAU ARE KWT QAT BHR OMN'.split(' ')},
  {key:'mena',label:'Middle East & North Africa',ids:[...ARAB.filter(d=>!['COM','SOM','DJI','MRT','SOL'].includes(d)),'IRN','ISR','TUR']},
  {key:'eu',label:'Europe',cont:'eu',exclude:['RUS','ISL','FRO']},
  {key:'af',label:'Africa',cont:'af'},
  {key:'as',label:'Asia',cont:'as'},
  {key:'na',label:'North America',cont:'na',exclude:['GRL']},
  {key:'sa',label:'South America',cont:'sa',exclude:['FLK']},
  {key:'oc',label:'Oceania',ids:['AUS','NZL','PNG']}
];
export function regionIds(key,dataIds){
  const r=REGIONS.find(d=>d.key===key);
  if(!r||!r.ids&&!r.cont)return null;
  if(r.ids==='data')return dataIds;
  if(r.ids)return r.ids;
  return Object.keys(CONTINENT_OF).filter(id=>CONTINENT_OF[id]===r.cont&&!(r.exclude||[]).includes(id));
}

// ---- spreadsheet → table ----
export function readWorkbook(arrayBuffer){
  const XLSX=window.XLSX;
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:false});
  let h=0;while(h<rows.length&&rows[h].filter(v=>v!=null&&v!=='').length<2)h++;
  const headers=(rows[h]||[]).map((v,i)=>v==null||v===''?`Column ${i+1}`:String(v).trim());
  return {headers,rows:rows.slice(h+1).filter(r=>r&&r.some(v=>v!=null&&v!==''))};
}
export function parseCsvText(text){
  const d3=window.d3;const rows=d3.csvParseRows(text).map(r=>r.map(v=>{const n=toNum(v);return v!==''&&Number.isFinite(n)&&/^\s*-?[\d.,]+\s*$/.test(v)?n:v}));
  return {headers:(rows[0]||[]).map(String),rows:rows.slice(1)};
}
const YEAR_RE=/^\s*((1[5-9]|2[01])\d\d)(\s*\[.*\])?\s*$/;
const yearOf=v=>{const m=String(v??'').match(YEAR_RE);return m?+m[1]:null};
function toNum(v){if(typeof v==='number')return v;if(v==null)return NaN;const s=String(v).replace(/[\s,٬]/g,'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫','.');return s===''||s==='..'?NaN:+s}

export function detectColumns({headers,rows},validIds){
  const sample=rows.slice(0,400),n=headers.length;
  const stats=headers.map((h,i)=>{
    let num=0,years=0,iso=0,names=0,filled=0;
    for(const r of sample){const v=r[i];if(v==null||v==='')continue;filled++;const x=toNum(v);if(Number.isFinite(x)){num++;if(Number.isInteger(x)&&x>=1500&&x<=2200)years++}
      else{const s=String(v).trim();if(/^[A-Za-z]{3}$/.test(s)&&validIds.has(toAtlasId(s.toUpperCase())))iso++;else if(resolveId(s,null,validIds))names++}}
    return {i,h,num,years,iso,names,filled};
  });
  const yearHeaders=headers.map((h,i)=>({i,y:yearOf(h)})).filter(d=>d.y!=null);
  const best=(arr,key)=>arr.slice().sort((a,b)=>b[key]-a[key])[0];
  const codeCol=best(stats.filter(s=>s.iso>s.filled*0.5),'iso');
  const nameCol=best(stats.filter(s=>s.names>0&&s!==codeCol),'names');
  if(yearHeaders.length>=3){
    return {format:'wide',name:nameCol?nameCol.i:(codeCol?codeCol.i:0),code:codeCol?codeCol.i:-1,year:-1,value:-1,yearCols:yearHeaders.map(d=>d.i)};
  }
  const byHeader=re=>stats.find(s=>re.test(s.h));
  const yearCol=byHeader(/^(year|years|yr|date|time|سنه|سنة|العام|عام|السنه|السنة)$/i)||best(stats.filter(s=>s.years>s.filled*0.9&&s.filled>0),'years');
  const valueCands=stats.filter(s=>s!==yearCol&&s!==codeCol&&s!==nameCol&&s.num>s.filled*0.8&&s.filled>0);
  const valueCol=valueCands[valueCands.length-1];
  return {format:'long',name:nameCol?nameCol.i:(codeCol?codeCol.i:0),code:codeCol?codeCol.i:-1,year:yearCol?yearCol.i:-1,value:valueCol?valueCol.i:-1,yearCols:[]};
}

export function toRecords({headers,rows},map,validIds){
  const out=[],unresolved=new Map();
  const push=(name,code,year,value)=>{
    if(!Number.isFinite(year)||!Number.isFinite(value))return;
    const id=resolveId(name,code,validIds);
    if(!id||!validIds.has(id)){const k=String(name??code??'').trim();if(k)unresolved.set(k,(unresolved.get(k)||0)+1);return}
    out.push({id,name:String(name??'').trim()||id,year,value});
  };
  if(map.format==='wide'){
    const cols=map.yearCols.length?map.yearCols:headers.map((h,i)=>yearOf(h)!=null?i:-1).filter(i=>i>=0);
    for(const r of rows)for(const c of cols)push(r[map.name],map.code>=0?r[map.code]:null,yearOf(headers[c]),toNum(r[c]));
  }else{
    for(const r of rows){const yv=r[map.year];const y=typeof yv==='number'?Math.round(yv):yearOf(yv)??toNum(yv);push(r[map.name],map.code>=0?r[map.code]:null,y,toNum(r[map.value]))}
  }
  return {records:out,unresolved:[...unresolved.entries()].sort((a,b)=>b[1]-a[1])};
}

// Dense per-country arrays over [yearMin,yearMax]: interior gaps are linearly filled,
// values before a country's first year stay empty (it enters later), values after its
// last year are held so it doesn't vanish from the ranking.
export function buildDataset(records){
  if(!records.length)return null;
  let yearMin=Infinity,yearMax=-Infinity,vMin=Infinity,vMax=-Infinity,vMinPos=Infinity;
  for(const r of records){yearMin=Math.min(yearMin,r.year);yearMax=Math.max(yearMax,r.year)}
  const len=yearMax-yearMin+1,series=new Map(),fileNames=new Map();
  for(const r of records){
    let a=series.get(r.id);if(!a){a=new Float64Array(len).fill(NaN);series.set(r.id,a)}
    a[r.year-yearMin]=(Number.isNaN(a[r.year-yearMin])?0:a[r.year-yearMin])+r.value;
    if(!fileNames.has(r.id))fileNames.set(r.id,r.name);
  }
  for(const a of series.values()){
    let last=-1;
    for(let i=0;i<len;i++){if(Number.isNaN(a[i]))continue;if(last>=0&&i-last>1)for(let j=last+1;j<i;j++)a[j]=a[last]+(a[i]-a[last])*(j-last)/(i-last);last=i}
    if(last>=0)for(let j=last+1;j<len;j++)a[j]=a[last];
    for(const v of a)if(Number.isFinite(v)){vMin=Math.min(vMin,v);vMax=Math.max(vMax,v);if(v>0)vMinPos=Math.min(vMinPos,v)}
  }
  const ids=[...series.keys()];
  return {yearMin,yearMax,len,series,ids,fileNames,vMin,vMax,vMinPos:Number.isFinite(vMinPos)?vMinPos:1,records};
}

// Interpolated value of every country at a fractional year → Map id → value
export function valuesAt(ds,year){
  const x=Math.max(0,Math.min(ds.len-1,year-ds.yearMin)),lo=Math.floor(x),hi=Math.min(ds.len-1,lo+1),t=x-lo,out=new Map();
  for(const [id,a] of ds.series){const va=a[lo],vb=a[hi];let v;if(Number.isFinite(va)&&Number.isFinite(vb))v=va+(vb-va)*t;else if(Number.isFinite(va))v=va;else if(Number.isFinite(vb)&&t>0.5)v=vb;else continue;if(Number.isFinite(v))out.set(id,v)}
  return out;
}
export function ranked(vals){return [...vals].sort((a,b)=>b[1]-a[1]).map(([id,value])=>({id,value}))}

export {CONTINENT_OF};
