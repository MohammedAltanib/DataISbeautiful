// Map Studio rendering engine.
// Everything on screen is a pure function of the timeline time `t` (seconds), drawn onto a
// 2D canvas in fixed "design units" (1920×1080, 1080×1920, …). The live preview and the
// frame-by-frame video export call the exact same draw(ctx,t,scale) — which is what makes
// the exported MP4 perfectly smooth regardless of how fast the computer is.
import {valuesAt,ranked,nameFor,iso2Of,regionIds} from './data.js';

const d3=window.d3;
export const FORMATS={'16:9':[1920,1080],'9:16':[1080,1920],'1:1':[1080,1080],'4:5':[1080,1350]};
export const THEMES={
  dark:{bg:'#050a14',bg2:'#0c1a2e',sphere:'#0a1a2f',land:'#1d2838',border:'rgba(3,8,16,.95)',grat:'rgba(140,170,210,.07)',ink:'#f4f6fb',muted:'#96a3b8',panel:'rgba(7,12,22,.66)',panelLine:'rgba(255,255,255,.09)',track:'rgba(255,255,255,.07)',vignette:.5},
  light:{bg:'#dfe7f1',bg2:'#f4f7fb',sphere:'#e9f0f8',land:'#c8d0da',border:'rgba(255,255,255,.95)',grat:'rgba(30,60,100,.07)',ink:'#0f1622',muted:'#586476',panel:'rgba(255,255,255,.8)',panelLine:'rgba(10,20,40,.1)',track:'rgba(10,20,40,.07)',vignette:.12}
};
export const SCALES={
  inferno:['Inferno',d3.interpolateInferno,.2,.98],magma:['Magma',d3.interpolateMagma,.22,.98],plasma:['Plasma',d3.interpolatePlasma,.05,.95],
  viridis:['Viridis',d3.interpolateViridis,0,1],turbo:['Turbo',d3.interpolateTurbo,.08,.94],cividis:['Cividis',d3.interpolateCividis,0,1],
  ylorrd:['Yellow → Red',d3.interpolateYlOrRd,.12,1],orrd:['Orange',d3.interpolateOrRd,.15,1],blues:['Blues',d3.interpolateBlues,.25,1],
  greens:['Greens',d3.interpolateGreens,.25,1],purples:['Purples',d3.interpolatePurples,.25,1],rdylgn:['Red → Green',d3.interpolateRdYlGn,0,1],
  spectral:['Spectral',d3.interpolateSpectral,0,1],accent:['Accent color',null,0,1]
};
const BAR_PALETTE=['#ff7f2a','#2fae60','#ff2f92','#ffce33','#3d7bff','#2ec4b6','#9b6fd9','#e2574c','#4fb8de','#c99a3f','#90be6d','#f3722c','#277da1','#f94144','#a8e0bd','#d81159'];

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const easeInOut=d3.easeCubicInOut,easeOut=d3.easeCubicOut,easeBack=d3.easeBackOut.overshoot(1.6);
const HAS_AR=/[؀-ۿ]/;
const span01=(t,a,b)=>clamp((t-a)/(b-a),0,1);

export function createEngine(features){
  const byId=new Map(features.map(f=>[f.properties.id,f]));
  const validIds=new Set(byId.keys());
  const mainland=new Map();
  for(const f of features)mainland.set(f.properties.id,mainlandOf(f));
  // Angular footprint of each country on the globe, for back-face culling.
  const geoInfo=new Map();
  for(const f of features){const c=d3.geoCentroid(mainland.get(f.properties.id));let r=0;const b=d3.geoBounds(f);if(b[1][0]<b[0][0])r=Math.PI;else for(const p of [[b[0][0],b[0][1]],[b[1][0],b[1][1]],[b[0][0],b[1][1]],[b[1][0],b[0][1]]])r=Math.max(r,d3.geoDistance(c,p));geoInfo.set(f.properties.id,{c,r})}
  const graticule=d3.geoGraticule10();

  let P=null,ds=null,L=null,flat=null,tl=null,theme=THEMES.dark,colorOf=null;
  const flags=new Map(),customImgs=new Map();let logo=null;
  const imgOf=id=>customImgs.get(id)||flags.get(id);
  const rankCache=new Map();

  // ---------- layout ----------
  function computeLayout(){
    const [W,H]=FORMATS[P.format]||FORMATS['16:9'];
    const portrait=H>W*1.2,square=!portrait&&W/H<1.4;
    const pad=portrait?60:56,end=P.textAlign==='right'?'right':P.textAlign==='center'?'center':'left';
    const o={W,H,portrait,square,pad};
    if(!portrait&&!square){
      const bw=P.showBars?W*P.barsWidth/100:0,left=P.barsSide==='left';
      o.header={x:end==='left'?pad:end==='center'?W/2:W-pad,y:52,w:W-2*pad-(P.logoCorner==='top'?0:0),align:end,titleSize:54,subSize:27};
      o.bars={x:left?pad:W-pad-bw,y:190,w:bw,h:H-190-92};
      const fx0=P.showBars&&left?pad+bw+24:pad,fx1=P.showBars&&!left?W-pad-bw-24:W-pad;
      o.focus={x:fx0,y:165,w:fx1-fx0,h:H-165-100};
      o.year={x:left||!P.showBars?W-pad:fx0+10,y:H-62,align:left||!P.showBars?'right':'left',size:150};
      o.legend={x:left||!P.showBars?W-pad:fx0+10,y:H-250,align:left||!P.showBars?'right':'left',w:300};
      o.event={x:left||!P.showBars?fx0+20:fx1-20,y:H-110,align:left||!P.showBars?'left':'right',w:Math.min(560,o.focus.w*0.55)};
      o.banner={x:o.focus.x+o.focus.w/2,y:o.focus.y+6};
      o.source={x:P.showBars?(left?pad:W-pad):(end==='left'?W-pad:pad),y:H-30,align:P.showBars?(left?'left':'right'):(end==='left'?'right':'left')};
    }else{
      const hy=portrait?150:104;
      const mapBottom=portrait?1030:Math.round(H*0.58),fy=portrait?330:196;
      o.header={x:W/2,y:hy,w:W-2*pad,align:'center',titleSize:portrait?58:44,subSize:portrait?30:23};
      o.focus={x:pad,y:fy,w:W-2*pad,h:mapBottom-fy};
      o.bars={x:pad,y:mapBottom+14,w:W-2*pad-(portrait?70:0),h:(portrait?1620:H-60)-mapBottom-14};
      if(!P.showBars){o.focus.h=(portrait?1560:H-120)-o.focus.y}
      o.year={x:W-pad-10,y:o.focus.y+o.focus.h-24,align:'right',size:portrait?120:96};
      o.legend={x:pad+10,y:o.focus.y+o.focus.h-60,align:'left',w:260};
      o.event={x:W/2,y:o.focus.y+(portrait?210:160),align:'center',w:W-2*pad-40};
      o.banner={x:W/2,y:o.focus.y+10};
      o.source={x:W/2,y:portrait?1650:H-24,align:'center'};
    }
    o.barsAuto={...o.bars};
    if(P.panelCustom)o.bars={x:W*P.panelX/100,y:H*P.panelY/100,w:Math.max(40,W*P.panelW/100),h:Math.max(40,H*P.panelH/100)};
    o.focus.cx=o.focus.x+o.focus.w/2;o.focus.cy=o.focus.y+o.focus.h/2;
    // Screen areas covered by HUD elements — map labels steer clear of them.
    const hw=o.portrait||o.square?W-2*pad:W*0.55,hh=o.header.titleSize*(o.portrait?2.5:1.3)+o.header.subSize+10;
    o.obstacles=[{x:o.header.align==='right'?o.header.x-hw:o.header.align==='center'?o.header.x-hw/2:o.header.x,y:o.header.y-6,w:hw,h:hh}];
    if(P.showBars)o.obstacles.push({x:o.bars.x-8,y:o.bars.y-8,w:o.bars.w+16,h:o.bars.h+16});
    if(P.showYear){const yw=Math.max(o.year.size*2.8,300);o.obstacles.push({x:o.year.align==='right'?o.year.x-yw:o.year.x,y:o.year.y-o.year.size*0.95,w:yw,h:o.year.size*0.95+50})}
    if(P.showLegend&&P.fill!=='flags')o.obstacles.push({x:o.legend.align==='right'?o.legend.x-o.legend.w:o.legend.x,y:o.legend.y-40,w:o.legend.w,h:80});
    return o;
  }

  // ---------- projections ----------
  function buildFlat(){
    const f=L.focus,world={type:'FeatureCollection',features};
    const fit=d3.geoNaturalEarth1().fitSize([f.w,f.h],world);
    const base=d3.geoNaturalEarth1().scale(fit.scale()).translate([0,0]);
    const path=d3.geoPath(base);
    const o={base,paths:new Map(),bounds:new Map(),full:new Map(),centroid:new Map(),area:new Map(),all:new Path2D()};
    for(const ft of features){const id=ft.properties.id,str=path(ft);if(!str)continue;const p=new Path2D(str);o.paths.set(id,p);o.all.addPath(p);const m=mainland.get(id);o.bounds.set(id,path.bounds(m));o.full.set(id,path.bounds(ft));o.centroid.set(id,path.centroid(m));o.area.set(id,Math.abs(path.area(ft)))}
    o.sphere=new Path2D(path({type:'Sphere'}));o.grat=new Path2D(path(graticule));
    const wb=path.bounds(world);o.world={x:(wb[0][0]+wb[1][0])/2,y:(wb[0][1]+wb[1][1])/2,k:1};
    return o;
  }
  const globeR=()=>Math.min(L.focus.w,L.focus.h)*0.47;
  function globeProj(cam){return d3.geoOrthographic().rotate([-cam.lon,-cam.lat]).scale(globeR()*cam.k).translate([L.focus.cx,L.focus.cy]).precision(0.4).clipExtent([[-20,-20],[L.W+20,L.H+20]])}

  // ---------- camera targets ----------
  const isGlobe=()=>P.projection==='globe';
  const isCartogram=()=>P.projection==='cartogram';
  function targetIds(key){
    if(!key||key==='world')return null;
    if(validIds.has(key))return [key];
    const ids=regionIds(key,ds?ds.ids:null);
    return ids?ids.filter(id=>validIds.has(id)):null;
  }
  function camFor(key,zoomMul=1){
    const ids=targetIds(key),single=ids&&ids.length===1&&validIds.has(key);
    const fill=single?0.5:0.94;
    if(!isGlobe()){
      if(!ids||!ids.length)return {...flat.world,k:flat.world.k*(key==='world'?zoomMul:1)};
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      for(const id of ids){const b=flat.bounds.get(id);if(!b)continue;x0=Math.min(x0,b[0][0]);y0=Math.min(y0,b[0][1]);x1=Math.max(x1,b[1][0]);y1=Math.max(y1,b[1][1])}
      if(!Number.isFinite(x0))return {...flat.world};
      let k=Math.min(L.focus.w*fill/Math.max(1,x1-x0),L.focus.h*fill/Math.max(1,y1-y0));
      if(single)k*=P.zoomIntensity;
      k=clamp(k*zoomMul,1,single?22:14);
      return {x:(x0+x1)/2,y:(y0+y1)/2,k};
    }
    const worldLon=()=>{const c=ds?d3.geoCentroid({type:'FeatureCollection',features:ds.ids.filter(id=>mainland.has(id)).map(id=>mainland.get(id))}):[20,15];return {lon:c[0],lat:clamp(c[1],-10,30)}};
    if(!ids||!ids.length){const w=worldLon();return {lon:w.lon,lat:w.lat,k:zoomMul}}
    const fc={type:'FeatureCollection',features:ids.filter(id=>mainland.has(id)).map(id=>mainland.get(id))};
    const [lon,lat]=d3.geoCentroid(fc);
    const b=d3.geoPath(globeProj({lon,lat,k:1})).bounds(fc);
    let k=Math.min(L.focus.w*fill/Math.max(1,b[1][0]-b[0][0]),L.focus.h*fill/Math.max(1,b[1][1]-b[0][1]));
    if(single)k*=P.zoomIntensity;
    return {lon,lat,k:clamp(k*zoomMul,0.9,single?16:8)};
  }
  function interpCam(a,b){
    if(!isGlobe()){
      const w=L.focus.w,iz=d3.interpolateZoom([a.x,a.y,w/a.k],[b.x,b.y,w/b.k]);
      return u=>{const [x,y,ww]=iz(u);return {x,y,k:w/ww}};
    }
    const gi=d3.geoInterpolate([a.lon,a.lat],[b.lon,b.lat]),dist=d3.geoDistance([a.lon,a.lat],[b.lon,b.lat]);
    const la=Math.log(a.k),lb=Math.log(b.k),dip=Math.min(0.6,dist/Math.PI*1.1)*(Math.max(a.k,b.k)>1.4?1:0.35);
    return u=>{const [lon,lat]=gi(u);return {lon,lat,k:Math.max(0.55,Math.exp(lerp(la,lb,u))*(1-dip*Math.sin(Math.PI*u)))}};
  }
  function evalShot(s,t){
    let cam;
    if(s.dur<=0||t>=s.t+s.dur)cam={...s.to};
    else cam=s.interp(easeInOut(span01(t,s.t,s.t+s.dur)));
    const idle=t-(s.t+s.dur);
    if(idle>0){
      if(P.kenBurns)cam.k*=1+Math.min(0.14,idle*0.011);
      if(isGlobe()&&s.spin)cam.lon-=idle*4.5;
    }
    return cam;
  }
  function cameraAt(t){
    const S=tl.shots;let i=S.length-1;while(i>0&&S[i].t>t)i--;
    return evalShot(S[i],t);
  }

  // ---------- timeline ----------
  function yearAtFn(mainStart,yMin,yMax){
    const spy=P.secPerYear,mode=P.yearEase;
    return t=>{
      const u=clamp((t-mainStart)/spy,0,yMax-yMin),i=Math.floor(u),f=u-i;
      const e=mode==='linear'?f:mode==='step'?easeInOut(f):0.5*f+0.5*easeInOut(f);
      return yMin+i+e;
    };
  }
  function leaderAtYear(y){const vals=valuesAt(ds,y);let best=null,bv=-Infinity;for(const [id,v] of vals)if(v>bv){bv=v;best=id}return best}
  function buildTimeline(){
    const intro=Math.max(0,P.introDur),outro=Math.max(0,P.outroDur),hold=Math.max(0,P.holdDur);
    const o={intro,shots:[],banners:[],sfx:[]};
    if(!ds){o.mainStart=intro;o.mainEnd=intro+6;o.holdEnd=o.mainEnd;o.total=o.mainEnd+outro;o.yearAt=()=>0;o.timeOfYear=()=>0;o.shots=[mkShot(0,0,camFor(P.region))];return o}
    o.mainStart=intro;o.mainEnd=intro+(ds.yearMax-ds.yearMin)*P.secPerYear;o.holdEnd=o.mainEnd+hold;o.total=o.holdEnd+outro;
    o.yearAt=yearAtFn(o.mainStart,ds.yearMin,ds.yearMax);
    o.timeOfYear=y=>o.mainStart+(clamp(y,ds.yearMin,ds.yearMax)-ds.yearMin)*P.secPerYear;
    const flight=Math.max(0.3,P.flightDur);
    const firstLeader=leaderAtYear(ds.yearMin);
    const plan=[];
    if(P.camMode==='leader'){
      plan.push({t:o.mainStart,key:firstLeader,kind:'leader',id:firstLeader});
      const dt=1/24;let last={t:o.mainStart,id:firstLeader};
      for(let t=o.mainStart+dt;t<=o.mainEnd+1e-6;t+=dt){
        if(t-last.t<P.minShot)continue;
        const id=leaderAtYear(o.yearAt(t));
        if(id&&id!==last.id){plan.push({t,key:id,kind:'leader',id});last={t,id}}
      }
    }else if(P.camMode==='scenes'&&P.scenes.length){
      if(Math.min(...P.scenes.map(sc=>+sc.year))>ds.yearMin)plan.push({t:o.mainStart,key:P.region,kind:'fixed'});
      for(const sc of P.scenes.slice().sort((a,b)=>a.year-b.year))plan.push({t:sc.year<=ds.yearMin?o.mainStart:o.timeOfYear(sc.year),key:sc.target,zoom:sc.zoom||1,kind:'scene'});
    }else plan.push({t:o.mainStart,key:P.region,kind:'fixed'});
    // Intro: start wide (globe rotated away) and fly into the first shot as the intro ends.
    const first=plan[0],firstCam=camFor(first.key,first.zoom||1);
    let startCam;
    if(isGlobe()){startCam={...camFor('world'),k:intro>0?0.82:1};startCam.lon=firstCam.lon+(intro>0?100:0)}
    else startCam={...flat.world,k:intro>0?0.94:1};
    o.shots.push(mkShot(0,0,startCam,true));
    const firstFlight=intro>0?Math.min(intro,flight+0.9):0;
    pushShot(o,Math.max(0,o.mainStart-firstFlight*0.75),firstFlight,firstCam);
    if(first.kind==='leader'&&intro>0)o.sfx.push({t:Math.max(0,o.mainStart-firstFlight*0.75),type:'whoosh'});
    for(const s of plan.slice(1)){
      pushShot(o,s.t,flight,camFor(s.key,s.zoom||1));
      o.sfx.push({t:s.t,type:'whoosh'});
      if(s.kind==='leader'){o.banners.push({t:s.t,id:s.id});o.sfx.push({t:s.t+0.25,type:'ding'})}
    }
    if(P.endWide&&(hold>0.5||outro>0))pushShot(o,o.mainEnd+0.25,flight+0.6,camFor(P.region==='world'||!P.region?'world':P.region),true);
    if(outro>0)o.sfx.push({t:o.holdEnd+0.2,type:'pop'},{t:o.holdEnd+1.9,type:'click'});
    for(const e of P.events||[])if(e.text)o.sfx.push({t:o.timeOfYear(+e.year),type:'tick'});
    return o;
  }
  function mkShot(t,dur,to,spin=false){return {t,dur,to,spin,interp:null}}
  function pushShot(o,t,dur,to,spin=false){
    const prev=o.shots[o.shots.length-1];
    const s=mkShot(t,dur,to,spin);
    const from=evalShot(prev,t);
    s.interp=interpCam(from,to);
    o.shots.push(s);
  }

  // ---------- ranking with smooth rank swaps ----------
  function rankIndex(y){
    const key=Math.round(y*1000);
    let m=rankCache.get(key);
    if(!m){m=new Map(ranked(valuesAt(ds,y)).map((d,i)=>[d.id,i]));if(rankCache.size>300)rankCache.clear();rankCache.set(key,m)}
    return m;
  }
  function rankPositions(year,N){
    const g=clamp(0.5/P.secPerYear,0.02,1),a=Math.floor((year-ds.yearMin)/g+1e-9),y0=Math.min(ds.yearMax,ds.yearMin+a*g),y1=Math.min(ds.yearMax,y0+g),f=y1>y0?clamp((year-y0)/(y1-y0),0,1):1;
    const r0=rankIndex(y0),r1=rankIndex(y1),out=new Map(),e=easeInOut(f);
    const consider=id=>{if(out.has(id))return;const p0=Math.min(r0.has(id)?r0.get(id):N,N),p1=Math.min(r1.has(id)?r1.get(id):N,N);const p=lerp(p0,p1,e);if(p<N)out.set(id,p)};
    for(const [id,i] of r0)if(i<N)consider(id);
    for(const [id,i] of r1)if(i<N)consider(id);
    return out;
  }

  // ---------- colors / formatting ----------
  function buildColorScale(){
    if(!ds){colorOf=()=>theme.land;return}
    const [,interp0,lo,hi]=SCALES[P.palette]||SCALES.inferno;
    const interp=interp0||d3.interpolateRgb(theme.land,P.accent);
    const log=P.logScale&&ds.vMinPos>0,min=log?Math.log(ds.vMinPos):ds.vMin,max=log?Math.log(Math.max(ds.vMax,ds.vMinPos*1.0001)):ds.vMax;
    colorOf=v=>{let u=max>min?((log?Math.log(Math.max(v,ds.vMinPos)):v)-min)/(max-min):0.5;u=clamp(u,0,1);if(P.reverseScale)u=1-u;return interp(lo+(hi-lo)*u)};
  }
  const catCache=new Map();
  function barColor(id,v){
    if(P.colors&&P.colors[id])return P.colors[id];
    if(P.barColor==='accent')return P.barSingleColor||P.accent;
    if(P.barColor==='scale'&&Number.isFinite(v)&&colorOf)return colorOf(v);
    if(catCache.has(id))return catCache.get(id);
    let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;
    const c=BAR_PALETTE[h%BAR_PALETTE.length];catCache.set(id,c);return c;
  }
  const locale=()=>P.digits==='arab'?'ar-EG':'en-US';
  function fmt(v){
    if(!Number.isFinite(v))return '—';
    let n=v,suffix='';
    if(P.compact){const ar=P.lang==='ar',abs=Math.abs(v);const steps=[[1e12,ar?' تريليون':'T'],[1e9,ar?' مليار':'B'],[1e6,ar?' مليون':'M'],[1e3,ar?' ألف':'K']];for(const [d,s] of steps)if(abs>=d){n=v/d;suffix=s;break}}
    const s=n.toLocaleString(locale(),{minimumFractionDigits:P.decimals,maximumFractionDigits:P.decimals});
    return (P.prefix||'')+s+suffix+(P.unit?(/^[%٪]$/.test(P.unit)?'':' ')+P.unit:'');
  }
  const fmtYear=y=>Math.floor(y+1e-6).toLocaleString(locale(),{useGrouping:false});
  const nameOf=id=>(P.names&&P.names[id])||nameFor(id,P.lang,ds&&ds.fileNames.get(id));
  const font=(w,s)=>`${w} ${s}px "${P.font}", "Cairo", "Segoe UI", sans-serif`;

  // ---------- drawing helpers ----------
  function text(ctx,s,x,y,align='left'){ctx.direction=HAS_AR.test(s)?'rtl':'ltr';ctx.textAlign=align;ctx.fillText(s,x,y)}
  function fitText(ctx,s,maxW){if(ctx.measureText(s).width<=maxW)return s;let lo=0,hi=s.length;while(lo<hi){const m=(lo+hi+1)>>1;if(ctx.measureText(s.slice(0,m)+'…').width<=maxW)lo=m;else hi=m-1}return s.slice(0,lo)+'…'}
  function wrap(ctx,s,maxW,maxLines=2){const words=String(s).split(/\s+/),lines=[];let cur='';for(const w of words){const test=cur?cur+' '+w:w;if(ctx.measureText(test).width>maxW&&cur){lines.push(cur);cur=w}else cur=test}if(cur)lines.push(cur);if(lines.length>maxLines){const keep=lines.slice(0,maxLines);keep[maxLines-1]=fitText(ctx,lines.slice(maxLines-1).join(' '),maxW);return keep}return lines}
  function rrect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,h/2,w/2))}
  function drawCover(ctx,img,x,y,w,h){const ir=img.naturalWidth/img.naturalHeight,r=w/h;let sw=img.naturalWidth,sh=img.naturalHeight,sx=0,sy=0;if(ir>r){sw=sh*r;sx=(img.naturalWidth-sw)/2}else{sh=sw/r;sy=(img.naturalHeight-sh)/2}ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}
  function flagCircle(ctx,id,cx,cy,r,ring=true){
    const img=imgOf(id);
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.closePath();
    if(img&&img.complete&&img.naturalWidth){ctx.clip();drawCover(ctx,img,cx-r*1.35,cy-r,r*2.7,r*2)}else{ctx.fillStyle=barColor(id);ctx.fill()}
    ctx.restore();
    if(ring){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=Math.max(1.5,r*0.09);ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke()}
  }
  const flagReady=id=>{const img=imgOf(id);return img&&img.complete&&img.naturalWidth>0};

  // ---------- map ----------
  function countryFill(id,vals){const v=vals.get(id);return v==null?theme.land:colorOf(v)}
  function flagSetFor(rk){
    if(P.fill==='value')return new Set();
    if(P.fill==='flags')return new Set(rk.map(d=>d.id));
    return new Set(rk.slice(0,P.flagCount).map(d=>d.id));
  }
  function drawMapFlat(ctx,s,cam,vals,rk,leader){
    const f=L.focus,k=cam.k;
    ctx.save();
    ctx.setTransform(s*k,0,0,s*k,s*(f.cx-cam.x*k),s*(f.cy-cam.y*k));
    ctx.fillStyle=theme.sphere;ctx.fill(flat.sphere);
    ctx.lineWidth=0.8/k;ctx.strokeStyle=theme.grat;ctx.stroke(flat.grat);
    const vx0=cam.x-f.cx/k,vx1=cam.x+(L.W-f.cx)/k,vy0=cam.y-f.cy/k,vy1=cam.y+(L.H-f.cy)/k;
    const inView=id=>{const b=flat.full.get(id);return b&&b[1][0]>=vx0&&b[0][0]<=vx1&&b[1][1]>=vy0&&b[0][1]<=vy1};
    const fset=flagSetFor(rk);
    for(const [id,p] of flat.paths){if(!inView(id))continue;ctx.fillStyle=countryFill(id,vals);ctx.fill(p)}
    for(const id of fset){
      const p=flat.paths.get(id);if(!p||!flagReady(id)||!inView(id))continue;
      const b=flat.bounds.get(id);ctx.save();ctx.clip(p);drawCover(ctx,imgOf(id),b[0][0],b[0][1],b[1][0]-b[0][0],b[1][1]-b[0][1]);ctx.restore();
    }
    ctx.lineWidth=0.7/k;ctx.strokeStyle=theme.border;ctx.stroke(flat.all);
    if(leader&&P.leaderGlow&&flat.paths.has(leader)){
      const p=flat.paths.get(leader);ctx.shadowColor=P.accent;ctx.shadowBlur=22*s;ctx.strokeStyle=P.accent;ctx.lineWidth=2.6/k;ctx.stroke(p);ctx.stroke(p);ctx.shadowBlur=0;
    }
    ctx.restore();
    return id=>{const c=flat.centroid.get(id);return c?[f.cx+(c[0]-cam.x)*k,f.cy+(c[1]-cam.y)*k]:null};
  }
  // Non-contiguous area cartogram: each country's own shape is scaled around its own centroid
  // so its area matches its value at the world's average value/area density. Real position and
  // outline are kept, so big countries can spill over their neighbors — that overlap is the look.
  function cartogramScales(vals){
    let totalV=0,totalA=0;
    for(const id of validIds){const v=vals.get(id),a=flat.area.get(id);if(v!=null&&v>0&&a>0){totalV+=v;totalA+=a}}
    const density=totalA>0&&totalV>0?totalV/totalA:1;
    const blend=clamp(P.cartogramIntensity??1,0,1),m=new Map();
    for(const id of validIds){
      const v=vals.get(id),a=flat.area.get(id);
      const k=(v!=null&&v>0&&a>0)?clamp(Math.sqrt((v/a)/density),0.12,6):1;
      m.set(id,lerp(1,k,blend));
    }
    return m;
  }
  function drawMapCartogram(ctx,s,cam,vals,rk,leader){
    const f=L.focus,k=cam.k;
    ctx.save();
    ctx.setTransform(s*k,0,0,s*k,s*(f.cx-cam.x*k),s*(f.cy-cam.y*k));
    ctx.fillStyle=theme.sphere;ctx.fill(flat.sphere);
    ctx.lineWidth=0.8/k;ctx.strokeStyle=theme.grat;ctx.stroke(flat.grat);
    const vx0=cam.x-f.cx/k,vx1=cam.x+(L.W-f.cx)/k,vy0=cam.y-f.cy/k,vy1=cam.y+(L.H-f.cy)/k;
    const inView=id=>{const b=flat.full.get(id);return b&&b[1][0]>=vx0&&b[0][0]<=vx1&&b[1][1]>=vy0&&b[0][1]<=vy1};
    const fset=flagSetFor(rk),scales=cartogramScales(vals);
    // Smallest shapes drawn last (on top) so big overlapping neighbors don't bury them.
    const order=[...flat.paths.keys()].filter(inView).sort((a,b)=>(scales.get(b)||1)-(scales.get(a)||1));
    for(const id of order){
      const p=flat.paths.get(id),c=flat.centroid.get(id);if(!c)continue;
      const sc=scales.get(id)||1;
      ctx.save();ctx.translate(c[0],c[1]);ctx.scale(sc,sc);ctx.translate(-c[0],-c[1]);
      ctx.fillStyle=countryFill(id,vals);ctx.fill(p);
      if(fset.has(id)&&flagReady(id)){const b=flat.bounds.get(id);ctx.save();ctx.clip(p);drawCover(ctx,imgOf(id),b[0][0],b[0][1],b[1][0]-b[0][0],b[1][1]-b[0][1]);ctx.restore()}
      ctx.lineWidth=(0.7/k)/Math.max(sc,0.3);ctx.strokeStyle=theme.border;ctx.stroke(p);
      ctx.restore();
    }
    if(leader&&P.leaderGlow&&flat.paths.has(leader)){
      const p=flat.paths.get(leader),c=flat.centroid.get(leader),sc=scales.get(leader)||1;
      ctx.save();ctx.translate(c[0],c[1]);ctx.scale(sc,sc);ctx.translate(-c[0],-c[1]);
      ctx.shadowColor=P.accent;ctx.shadowBlur=22*s;ctx.strokeStyle=P.accent;ctx.lineWidth=(2.6/k)/Math.max(sc,0.3);ctx.stroke(p);ctx.stroke(p);ctx.shadowBlur=0;
      ctx.restore();
    }
    ctx.restore();
    return id=>{const c=flat.centroid.get(id);return c?[f.cx+(c[0]-cam.x)*k,f.cy+(c[1]-cam.y)*k]:null};
  }
  function drawMapGlobe(ctx,s,cam,vals,rk,leader){
    const proj=globeProj(cam),path=d3.geoPath(proj,ctx),[cx,cy]=proj.translate(),R=proj.scale(),center=[cam.lon,cam.lat];
    ctx.save();ctx.setTransform(s,0,0,s,0,0);
    // atmosphere
    const atm=ctx.createRadialGradient(cx,cy,R*0.96,cx,cy,R*1.16);atm.addColorStop(0,hexA(P.accent,0.28));atm.addColorStop(0.35,hexA(P.accent,0.08));atm.addColorStop(1,hexA(P.accent,0));
    ctx.fillStyle=atm;ctx.beginPath();ctx.arc(cx,cy,R*1.16,0,Math.PI*2);ctx.fill();
    const oc=ctx.createRadialGradient(cx-R*0.35,cy-R*0.4,R*0.1,cx,cy,R);oc.addColorStop(0,lighten(theme.sphere,0.12));oc.addColorStop(1,theme.sphere);
    ctx.beginPath();path({type:'Sphere'});ctx.fillStyle=oc;ctx.fill();
    ctx.beginPath();path(graticule);ctx.lineWidth=0.8;ctx.strokeStyle=theme.grat;ctx.stroke();
    const visible=id=>{const g=geoInfo.get(id);return g&&d3.geoDistance(g.c,center)<Math.PI/2+g.r};
    const vis=features.filter(ft=>visible(ft.properties.id));
    for(const ft of vis){ctx.beginPath();path(ft);ctx.fillStyle=countryFill(ft.properties.id,vals);ctx.fill()}
    const fset=flagSetFor(rk);
    for(const ft of vis){const id=ft.properties.id;if(!fset.has(id)||!flagReady(id))continue;const b=path.bounds(mainland.get(id));const w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];if(!(w>1&&h>1))continue;ctx.save();ctx.beginPath();path(ft);ctx.clip();drawCover(ctx,imgOf(id),b[0][0],b[0][1],w,h);ctx.restore()}
    ctx.beginPath();for(const ft of vis)path(ft);ctx.lineWidth=0.7;ctx.strokeStyle=theme.border;ctx.stroke();
    if(leader&&P.leaderGlow&&byId.has(leader)&&visible(leader)){ctx.beginPath();path(byId.get(leader));ctx.shadowColor=P.accent;ctx.shadowBlur=22*s;ctx.strokeStyle=P.accent;ctx.lineWidth=2.6;ctx.stroke();ctx.stroke();ctx.shadowBlur=0}
    // terminator-style shading for depth
    const sh=ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.2,cx,cy,R*1.02);sh.addColorStop(0,'rgba(255,255,255,0.05)');sh.addColorStop(0.7,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,0.38)');
    ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=sh;ctx.fill();
    ctx.restore();
    return id=>{const g=geoInfo.get(id);if(!g||d3.geoDistance(g.c,center)>Math.PI/2-0.08)return null;return proj(g.c)};
  }

  function drawBackground(ctx){
    const g=ctx.createRadialGradient(L.focus.cx,L.focus.cy,0,L.focus.cx,L.focus.cy,Math.max(L.W,L.H)*0.75);
    g.addColorStop(0,P.oceanColor||theme.bg2);g.addColorStop(1,P.oceanColor?darken(P.oceanColor,0.35):theme.bg);
    ctx.fillStyle=g;ctx.fillRect(0,0,L.W,L.H);
  }
  function drawVignette(ctx){
    if(!P.vignette)return;
    const g=ctx.createRadialGradient(L.W/2,L.H/2,Math.min(L.W,L.H)*0.35,L.W/2,L.H/2,Math.hypot(L.W,L.H)*0.56);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${theme.vignette})`);
    ctx.fillStyle=g;ctx.fillRect(0,0,L.W,L.H);
  }
  function drawBeacon(ctx,pt,t){
    if(!pt||!P.beacon)return;
    for(const off of [0,0.8]){const ph=((t+off)%1.6)/1.6;ctx.beginPath();ctx.arc(pt[0],pt[1],10+46*ph,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle=hexA(P.accent,(1-ph)*0.9);ctx.stroke()}
    ctx.beginPath();ctx.arc(pt[0],pt[1],7,0,Math.PI*2);ctx.fillStyle=P.accent;ctx.shadowColor=P.accent;ctx.shadowBlur=14;ctx.fill();ctx.shadowBlur=0;
  }
  function drawMapLabels(ctx,rk,project,alpha){
    const n=Math.min(P.mapLabels,rk.length);if(!n||alpha<=0)return;
    const placed=L.obstacles.slice(),inside=(p,r)=>p[0]>=r.x&&p[0]<=r.x+r.w&&p[1]>=r.y&&p[1]<=r.y+r.h;
    ctx.save();ctx.globalAlpha=alpha;
    for(let i=0;i<n;i++){
      const d=rk[i],pt=project(d.id);if(!pt||pt[0]<0||pt[1]<0||pt[0]>L.W||pt[1]>L.H||L.obstacles.some(r=>inside(pt,r)))continue;
      const lead=i===0,sc=lead?1.12:0.92,fs=26*sc,vs=22*sc,r=17*sc,padX=14*sc,h=48*sc;
      ctx.font=font(800,fs);const nm=fitText(ctx,nameOf(d.id),320);const nw=ctx.measureText(nm).width;
      ctx.font=font(600,vs);const vt=fmt(d.value),vw=ctx.measureText(vt).width;
      const w=padX*2+r*2+10+nw+12+vw;
      let x=pt[0]-w/2,y=pt[1]-h-22;
      const hit=(a)=>placed.some(b=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y);
      let rect={x:clamp(x,10,L.W-w-10),y,w,h};if(hit(rect)){rect.y=pt[1]+22;if(hit(rect))continue}
      x=rect.x;y=clamp(rect.y,10,L.H-h-10);placed.push({x,y,w,h});
      ctx.beginPath();ctx.moveTo(pt[0],pt[1]);ctx.lineTo(clamp(pt[0],x+10,x+w-10),y<pt[1]?y+h:y);ctx.lineWidth=2;ctx.strokeStyle=lead?P.accent:hexA(theme.ink,0.5);ctx.stroke();
      rrect(ctx,x,y,w,h,h/2);ctx.fillStyle=theme.panel;ctx.fill();ctx.lineWidth=lead?3:1.5;ctx.strokeStyle=lead?P.accent:theme.panelLine;ctx.stroke();
      flagCircle(ctx,d.id,x+padX+r,y+h/2,r,false);
      ctx.fillStyle=theme.ink;ctx.font=font(800,fs);ctx.textBaseline='middle';text(ctx,nm,x+padX+r*2+10,y+h/2+1,'left');
      ctx.fillStyle=lead?P.accent:theme.muted;ctx.font=font(700,vs);text(ctx,vt,x+w-padX,y+h/2+1,'right');
      if(!lead){ctx.beginPath();ctx.arc(pt[0],pt[1],5,0,Math.PI*2);ctx.fillStyle=theme.ink;ctx.fill()}
    }
    ctx.restore();ctx.textBaseline='alphabetic';
  }

  // ---------- HUD ----------
  function drawHeader(ctx,alpha){
    if(alpha<=0||(!P.title&&!P.subtitle))return;
    const h=L.header;ctx.save();ctx.globalAlpha=alpha;ctx.textBaseline='top';
    // Soft scrim so the title stays readable over bright flags/colors.
    const sb=h.y+h.titleSize*(L.portrait?2.6:1.4)+h.subSize+60,sg=ctx.createLinearGradient(0,0,0,sb);
    sg.addColorStop(0,hexA(theme.bg,0.82));sg.addColorStop(0.65,hexA(theme.bg,0.45));sg.addColorStop(1,hexA(theme.bg,0));
    ctx.fillStyle=sg;ctx.fillRect(0,0,L.W,sb);
    ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=P.theme==='dark'?16:0;
    ctx.font=font(900,h.titleSize);const lines=wrap(ctx,P.title||'',h.w,L.portrait?2:1);
    let y=h.y;ctx.fillStyle=theme.ink;for(const ln of lines){text(ctx,ln,h.x,y,h.align);y+=h.titleSize*1.22}
    if(P.subtitle){ctx.font=font(600,h.subSize);ctx.fillStyle=theme.muted;text(ctx,fitText(ctx,P.subtitle,h.w),h.x,y+4,h.align)}
    ctx.restore();
  }
  // Draws an image into a box with cover-fit, then zoom (>1 crops in, <1 shrinks) around a focal point.
  function drawImageFramed(ctx,img,x,y,w,h,zoom=1,px=50,py=50){
    const iw=img.naturalWidth||img.videoWidth,ih=img.naturalHeight||img.videoHeight;if(!iw||!ih||w<=0||h<=0)return;
    const r=w/h;let sw=iw,sh=ih;if(iw/ih>r)sw=ih*r;else sh=iw/r;
    if(zoom>=1){sw/=zoom;sh/=zoom;ctx.drawImage(img,(iw-sw)*px/100,(ih-sh)*py/100,sw,sh,x,y,w,h)}
    else{const dw=w*zoom,dh=h*zoom;ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,x+(w-dw)*px/100,y+(h-dh)*py/100,dw,dh)}
  }
  function shapePath(ctx,shape,x,y,w,h,r){
    ctx.beginPath();
    if(shape==='circle')ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
    else ctx.roundRect(x,y,w,h,shape==='square'?0:Math.min(r,w/2,h/2));
  }
  function drawBars(ctx,year,vals,alpha,t){
    if(!P.showBars||alpha<=0||!ds)return;
    const R=L.bars,N=Math.max(1,P.topN),rtl=P.barsDir==='rtl';
    ctx.save();ctx.globalAlpha=alpha;
    if(P.panelBg){ctx.save();ctx.globalAlpha=alpha*P.panelOpacity;rrect(ctx,R.x,R.y,R.w,R.h,P.panelRadius);ctx.fillStyle=theme.panel;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=theme.panelLine;ctx.stroke();ctx.restore()}
    const padX=P.panelPad,headH=P.barsTitle?48:Math.min(10,P.panelPad),x0=R.x+padX,Wp=Math.max(20,R.w-padX*2);
    if(P.barsTitle){ctx.font=font(700,24);ctx.fillStyle=theme.muted;ctx.textBaseline='middle';text(ctx,fitText(ctx,P.barsTitle,Wp),rtl?x0+Wp:x0,R.y+30,rtl?'right':'left')}
    const top=R.y+headH+Math.min(6,P.panelPad),rowH=(R.h-headH-Math.min(14,P.panelPad*2))/N,barH=Math.max(2,Math.min(rowH*P.barThickness/100,rowH*1.5));
    const pos=rankPositions(year,N);
    const items=[...pos].map(([id,p])=>({id,p,v:vals.get(id)})).filter(d=>Number.isFinite(d.v)).sort((a,b)=>b.p-a.p);
    let hi=-Infinity,lo=Infinity;for(const d of items)if(d.p<N-0.5){hi=Math.max(hi,d.v);lo=Math.min(lo,d.v)}
    if(!Number.isFinite(hi)){hi=1;lo=0}
    const base=P.axisMode==='auto'&&hi>lo?Math.max(0,lo-(hi-lo)*0.8):Math.min(0,lo);
    const fs=L.portrait?clamp(rowH*0.44,22,36):clamp(rowH*0.36,14,30);
    const nfs=fs*P.nameSize/100,vfs=fs*P.valueSize/100,rfs=fs*0.9*P.nameSize/100;
    const rankW=P.showRank?Math.max(28,rfs*1.7):0,nameW=P.namePos==='outside'?Wp*(P.barsNameWidth/100):0;
    const barX=rankW+nameW+(nameW||rankW?12:0)+P.barOffset;
    ctx.font=font(800,vfs);const valueW=P.valuePos==='outside'?Math.max(ctx.measureText(fmt(hi)).width,ctx.measureText(fmt(lo)).width)+16:0;
    const barMax=Math.max(20,(Wp-barX-valueW)*P.barMaxLen/100);
    const X=(u,w=0)=>rtl?x0+Wp-u-w:x0+u,AL=a=>rtl?(a==='left'?'right':'left'):a;
    const shape=v=>{const f=clamp(hi>base?(v-base)/(hi-base):1,0,1);return P.barScale==='sqrt'?Math.sqrt(f):P.barScale==='log'?Math.log1p(f*99)/Math.log(100):f};
    const nameInk=P.nameColor||theme.ink,valueInk=P.valueColor||theme.ink;
    ctx.save();ctx.beginPath();ctx.rect(R.x-40,top-4-barH,R.w+80,R.h-headH+barH);ctx.clip();
    ctx.textBaseline='middle';
    for(const d of items){
      const a=clamp(N-d.p,0,1),cy=top+d.p*rowH+rowH/2,lead=d.p<0.5;
      ctx.globalAlpha=alpha*a;
      const col=barColor(d.id,d.v);
      // image box size (relative to bar thickness) — also sets the minimum bar length so the image fits
      const imgOn=P.barImg!=='none'&&flagReady(d.id),iw=barH*P.barImgW/100,ih=barH*P.barImgH/100;
      const minLen=Math.max(P.barMinLen,imgOn&&P.barImg==='box'&&!P.barImgClip?iw:0);
      const bl=Math.max(minLen,shape(d.v)*barMax);
      if(P.showRank){ctx.fillStyle=d.p<3?[P.accent,'#d7deea','#e39a5c'][Math.round(d.p)]||theme.muted:theme.muted;ctx.font=font(800,rfs);text(ctx,String(Math.round(d.p)+1).replace(/\d/g,c=>P.digits==='arab'?'٠١٢٣٤٥٦٧٨٩'[c]:c),X(rankW/2),cy,'center')}
      if(P.namePos==='outside'){ctx.fillStyle=nameInk;ctx.font=font(700,nfs);text(ctx,fitText(ctx,nameOf(d.id),nameW-6),X(rankW+nameW),cy,AL('right'))}
      const bx=X(barX,bl),by=cy-barH/2,br=Math.min(P.barRadius,barH/2,bl/2);
      if(P.barFill){
        let fill=col;if(P.barGradient){const g=ctx.createLinearGradient(bx,0,bx+bl,0);g.addColorStop(0,rtl?col:darken(col,0.25));g.addColorStop(1,rtl?darken(col,0.25):col);fill=g}
        if(lead&&P.barGlow){ctx.shadowColor=hexA(col,0.8);ctx.shadowBlur=24}
        rrect(ctx,bx,by,bl,barH,br);ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;
      }
      if(imgOn&&P.barImg==='fill'){
        ctx.save();rrect(ctx,bx,by,bl,barH,br);ctx.clip();ctx.globalAlpha=alpha*a*P.barImgOpacity;
        const st=imgStyle(d.id);drawImageFramed(ctx,imgOf(d.id),bx,by,bl,barH,st.zoom,st.panX,st.panY);ctx.restore();
      }
      if(P.barFill&&P.barGloss){const hl=ctx.createLinearGradient(0,by,0,by+barH);hl.addColorStop(0,'rgba(255,255,255,.22)');hl.addColorStop(0.5,'rgba(255,255,255,0)');ctx.fillStyle=hl;rrect(ctx,bx,by,bl,barH,br);ctx.fill()}
      if(imgOn&&P.barImg==='box'){
        const u=(bl-iw)*P.barImgX/100,ix=rtl?bx+bl-u-iw:bx+u,iy=by+(barH-ih)*P.barImgY/100,st=imgStyle(d.id);
        ctx.save();
        if(P.barImgClip){rrect(ctx,bx,by,bl,barH,br);ctx.clip()}
        ctx.globalAlpha=alpha*a*P.barImgOpacity;
        shapePath(ctx,P.barImgShape,ix,iy,iw,ih,Math.min(iw,ih)*0.22);ctx.save();ctx.clip();drawImageFramed(ctx,imgOf(d.id),ix,iy,iw,ih,st.zoom,st.panX,st.panY);ctx.restore();
        if(P.barImgRing){shapePath(ctx,P.barImgShape,ix,iy,iw,ih,Math.min(iw,ih)*0.22);ctx.lineWidth=Math.max(1.5,Math.min(iw,ih)*0.07);ctx.strokeStyle='rgba(255,255,255,.85)';ctx.stroke()}
        ctx.restore();
      }
      // text inside the bar (falls back to just outside the bar when it doesn't fit); keeps clear of an image on the bar
      let outsideEnd=barX+bl+10,resS=0,resE=0;
      if(imgOn&&P.barImg==='box'){const u=(bl-iw)*P.barImgX/100;if(P.barImgX<=50)resS=u+iw;else resE=bl-u}
      if(imgOn&&P.barImg==='box'&&resE>0&&!P.barImgClip)outsideEnd=Math.max(outsideEnd,barX+bl+Math.max(0,iw-resE)+10);
      if(P.namePos==='inside'){
        ctx.font=font(800,nfs);const nm=nameOf(d.id),tw=ctx.measureText(nm).width,pad=Math.max(8,barH*0.25);
        ctx.fillStyle=P.nameColor||'#ffffff';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=6;
        if(tw+pad*2+resS+resE<=bl){const atEnd=P.nameInsideAlign==='end';text(ctx,nm,atEnd?X(barX+bl-pad-resE):X(barX+pad+resS),cy,AL(atEnd?'right':'left'))}
        else{ctx.fillStyle=nameInk;text(ctx,nm,X(outsideEnd),cy,AL('left'));outsideEnd+=tw+12}
        ctx.shadowBlur=0;
      }
      if(P.valuePos!=='hidden'){
        ctx.font=font(800,vfs);const vt=fmt(d.v),vw=ctx.measureText(vt).width;
        const nameRoom=P.namePos==='inside'?(ctx.font=font(800,nfs),ctx.measureText(nameOf(d.id)).width+16):0;ctx.font=font(800,vfs);
        if(P.valuePos==='inside'&&vw+20+resS+resE+nameRoom<=bl&&!(P.namePos==='inside'&&P.nameInsideAlign==='end')){ctx.fillStyle=P.valueColor||'#ffffff';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=6;text(ctx,vt,X(barX+bl-10-resE),cy,AL('right'));ctx.shadowBlur=0}
        else{ctx.fillStyle=lead&&!P.valueColor?P.accent:valueInk;text(ctx,vt,X(outsideEnd),cy,AL('left'))}
      }
    }
    ctx.restore();ctx.restore();ctx.textBaseline='alphabetic';
  }
  function imgStyle(id){const o=(P.imgStyles&&P.imgStyles[id])||{};return {zoom:o.zoom??P.barImgZoom,panX:o.panX??P.barImgPanX,panY:o.panY??P.barImgPanY}}
  function drawYear(ctx,year,alpha){
    if(!P.showYear||alpha<=0||!ds)return;
    const Y=L.year;ctx.save();ctx.globalAlpha=alpha;
    ctx.font=font(900,Y.size);ctx.textBaseline='alphabetic';
    ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=P.theme==='dark'?30:0;
    ctx.fillStyle=hexA(theme.ink,0.94);text(ctx,fmtYear(year),Y.x,Y.y-18,Y.align);ctx.shadowBlur=0;
    if(P.showProgress){
      const w=Math.min(Y.size*2.6,420),x=Y.align==='right'?Y.x-w:Y.x,y=Y.y,pr=clamp((year-ds.yearMin)/Math.max(1,ds.yearMax-ds.yearMin),0,1);
      rrect(ctx,x,y-3,w,6,3);ctx.fillStyle=theme.track;ctx.fill();
      rrect(ctx,x,y-3,Math.max(6,w*pr),6,3);ctx.fillStyle=P.accent;ctx.fill();
      ctx.beginPath();ctx.arc(x+w*pr,y,9,0,Math.PI*2);ctx.fillStyle=P.accent;ctx.shadowColor=P.accent;ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;
      ctx.font=font(600,18);ctx.fillStyle=theme.muted;ctx.textBaseline='top';text(ctx,fmtYear(ds.yearMin),x,y+14,'left');text(ctx,fmtYear(ds.yearMax),x+w,y+14,'right');
    }
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawLegend(ctx,alpha){
    if(!P.showLegend||alpha<=0||!ds||P.fill==='flags')return;
    const G=L.legend,w=G.w,h=12,x=G.align==='right'?G.x-w:G.x,y=G.y;
    ctx.save();ctx.globalAlpha=alpha;
    const g=ctx.createLinearGradient(x,0,x+w,0);
    const log=P.logScale&&ds.vMinPos>0;
    for(let i=0;i<=12;i++){const u=i/12,v=log?Math.exp(Math.log(ds.vMinPos)+(Math.log(ds.vMax)-Math.log(ds.vMinPos))*u):ds.vMin+(ds.vMax-ds.vMin)*u;g.addColorStop(u,colorOf(v))}
    if(P.legendTitle){ctx.font=font(700,20);ctx.fillStyle=theme.muted;ctx.textBaseline='bottom';text(ctx,P.legendTitle,G.align==='right'?x+w:x,y-8,G.align)}
    rrect(ctx,x,y,w,h,6);ctx.fillStyle=g;ctx.fill();
    ctx.font=font(700,18);ctx.fillStyle=theme.ink;ctx.textBaseline='top';
    text(ctx,fmt(log?ds.vMinPos:ds.vMin),x,y+h+6,'left');text(ctx,fmt(ds.vMax),x+w,y+h+6,'right');
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawBanner(ctx,t){
    if(!P.leaderBanner)return;
    let b=null;for(const e of tl.banners)if(t>=e.t&&t<e.t+2.8)b=e;if(!b)return;
    const u=t-b.t,inn=easeBack(span01(u,0,0.45)),out=1-easeInOut(span01(u,2.35,2.8)),a=Math.min(span01(u,0,0.25),out);
    const label=(P.bannerText||'{name}').replace('{name}',nameOf(b.id)),kicker=P.bannerKicker||'';
    ctx.save();ctx.globalAlpha=a;
    ctx.font=font(900,40);const tw=ctx.measureText(label).width;ctx.font=font(700,20);const kw=kicker?ctx.measureText(kicker).width:0;
    const r=30,w=Math.max(tw,kw)+r*2+64,h=kicker?96:78,x=L.banner.x-w/2,y=L.banner.y-30+30*inn;
    ctx.translate(L.banner.x,y+h/2);ctx.scale(0.85+0.15*inn,0.85+0.15*inn);ctx.translate(-L.banner.x,-(y+h/2));
    rrect(ctx,x,y,w,h,h/2);ctx.fillStyle=theme.panel;ctx.shadowColor=hexA(P.accent,0.6);ctx.shadowBlur=30;ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=3;ctx.strokeStyle=P.accent;ctx.stroke();
    const rtl=HAS_AR.test(label);
    const fx=rtl?x+w-18-r:x+18+r,tx=rtl?fx-r-16:fx+r+16,al=rtl?'right':'left';
    flagCircle(ctx,b.id,fx,y+h/2,r);
    ctx.textBaseline='middle';
    if(kicker){ctx.font=font(700,20);ctx.fillStyle=P.accent;text(ctx,kicker,tx,y+28,al);ctx.font=font(900,40);ctx.fillStyle=theme.ink;text(ctx,label,tx,y+62,al)}
    else{ctx.font=font(900,40);ctx.fillStyle=theme.ink;text(ctx,label,tx,y+h/2+2,al)}
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawEvents(ctx,t){
    const evs=(P.events||[]).filter(e=>e.text);if(!evs.length)return;
    let cur=null;for(const e of evs){const t0=tl.timeOfYear(+e.year),d=Math.max(1,+e.dur||4);if(t>=t0&&t<t0+d)cur={...e,t0,d}}
    if(!cur)return;
    const u=t-cur.t0,a=Math.min(easeOut(span01(u,0,0.5)),1-easeInOut(span01(u,cur.d-0.5,cur.d)));
    const E=L.event;ctx.save();ctx.globalAlpha=a;
    ctx.font=font(700,30);const lines=wrap(ctx,cur.text,E.w-60,3);
    const h=34+lines.length*40+18,w=E.w;
    const x=E.align==='left'?E.x:E.align==='right'?E.x-w:E.x-w/2,y=(L.portrait||L.square?E.y:E.y-h)+(1-a)*24;
    rrect(ctx,x,y,w,h,18);ctx.fillStyle=theme.panel;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=theme.panelLine;ctx.stroke();
    const rtl=HAS_AR.test(cur.text);
    ctx.fillStyle=P.accent;ctx.fillRect(rtl?x+w-8:x,y+14,8,h-28);
    ctx.textBaseline='top';ctx.font=font(800,22);ctx.fillStyle=P.accent;text(ctx,fmtYear(+cur.year),rtl?x+w-28:x+28,y+14,rtl?'right':'left');
    ctx.font=font(700,30);ctx.fillStyle=theme.ink;lines.forEach((ln,i)=>text(ctx,ln,rtl?x+w-28:x+28,y+46+i*40,rtl?'right':'left'));
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawWatermark(ctx,alpha){
    if(!P.watermark||alpha<=0||(!logo&&!P.channelName))return;
    const pos=P.wmPos||'tl',r=L.portrait?30:28,m=L.portrait?44:36;
    ctx.save();ctx.globalAlpha=alpha*P.wmOpacity;
    ctx.font=font(800,24);const nw=P.channelName?ctx.measureText(P.channelName).width+14:0,w=(logo?r*2:0)+nw;
    const x=pos[1]==='l'?m:L.W-m-w,y=pos[0]==='t'?(L.portrait?60:m):L.H-m-r*2;
    let cx=x;
    if(logo){ctx.save();ctx.beginPath();ctx.arc(x+r,y+r,r,0,Math.PI*2);ctx.clip();drawCover(ctx,logo,x,y,r*2,r*2);ctx.restore();cx+=r*2+14}
    if(P.channelName){ctx.fillStyle=theme.ink;ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=8;text(ctx,P.channelName,cx,y+r,'left')}
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawSource(ctx,alpha){
    if(!P.source||alpha<=0)return;
    ctx.save();ctx.globalAlpha=alpha*0.85;ctx.font=font(600,L.portrait?24:20);ctx.fillStyle=theme.muted;ctx.textBaseline='middle';
    text(ctx,(P.sourcePrefix||'')+P.source,L.source.x,L.source.y,L.source.align);ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawIntro(ctx,t){
    const I=tl.intro;if(I<=0||t>=I)return;
    const out=1-easeInOut(span01(t,I-0.7,I));
    ctx.save();
    const g=ctx.createLinearGradient(0,0,0,L.H);g.addColorStop(0,hexA(theme.bg,0.2*out));g.addColorStop(0.5,hexA(theme.bg,0.62*out));g.addColorStop(1,hexA(theme.bg,0.2*out));
    ctx.fillStyle=g;ctx.fillRect(0,0,L.W,L.H);
    const cx=L.W/2,cy=L.H*(L.portrait?0.42:0.46),tw=L.W*(L.portrait?0.86:0.74);
    const el=(d,delay)=>{const e=easeOut(span01(t,delay,delay+0.8));return {a:e*out,dy:(1-e)*40-(1-out)*30}};
    ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=P.theme==='dark'?24:0;
    ctx.font=font(900,L.portrait?84:92);const tl2=wrap(ctx,P.introTitle||P.title||'',tw,3),lh=(L.portrait?84:92)*1.2,th=tl2.length*lh;
    if(P.kicker){const k=el(0,0.15);ctx.globalAlpha=k.a;ctx.font=font(800,30);ctx.fillStyle=P.accent;text(ctx,P.kicker,cx,cy-th/2-62+k.dy,'center');
      const lw=easeOut(span01(t,0.3,1.1))*160;ctx.fillRect(cx-lw/2,cy-th/2-32+k.dy,lw,4)}
    const ti=el(0,0.35);ctx.globalAlpha=ti.a;ctx.font=font(900,L.portrait?84:92);ctx.fillStyle=theme.ink;tl2.forEach((ln,i)=>text(ctx,ln,cx,cy-th/2+lh/2+i*lh+ti.dy,'center'));
    if(P.introSub||P.subtitle){const su=el(0,0.7);ctx.globalAlpha=su.a;ctx.font=font(600,L.portrait?36:38);ctx.fillStyle=theme.muted;const sl=wrap(ctx,P.introSub||P.subtitle,tw,2);sl.forEach((ln,i)=>text(ctx,ln,cx,cy+th/2+42+i*48+su.dy,'center'))}
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawOutro(ctx,t){
    if(tl.total-tl.holdEnd<=0||t<tl.holdEnd)return;
    const u=t-tl.holdEnd,a=easeOut(span01(u,0,0.6));
    ctx.save();ctx.fillStyle=hexA(theme.bg,0.78*a);ctx.fillRect(0,0,L.W,L.H);
    const cx=L.W/2,cy=L.H*0.44,R=L.portrait?110:96;
    const pop=easeBack(span01(u,0.15,0.75));
    if(pop>0){ctx.save();ctx.translate(cx,cy-R*0.9);ctx.scale(pop,pop);ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.shadowColor=hexA(P.accent,0.6);ctx.shadowBlur=40;ctx.fillStyle=P.accent;ctx.fill();ctx.shadowBlur=0;
      if(logo){ctx.save();ctx.beginPath();ctx.arc(0,0,R-6,0,Math.PI*2);ctx.clip();drawCover(ctx,logo,-R+6,-R+6,(R-6)*2,(R-6)*2);ctx.restore()}
      else{ctx.fillStyle='#111';ctx.font=font(900,R);ctx.textBaseline='middle';text(ctx,(P.channelName||'★').trim().charAt(0),0,6,'center')}
      ctx.restore()}
    ctx.textBaseline='middle';
    const e1=easeOut(span01(u,0.45,1.1));ctx.globalAlpha=e1;ctx.font=font(900,L.portrait?64:60);ctx.fillStyle=theme.ink;text(ctx,P.outroTitle||P.channelName||'',cx,cy+R*0.55+(1-e1)*30,'center');
    const e2=easeOut(span01(u,0.6,1.25));ctx.globalAlpha=e2;ctx.font=font(600,L.portrait?34:32);ctx.fillStyle=theme.muted;text(ctx,P.outroSub||'',cx,cy+R*0.55+68+(1-e2)*30,'center');
    const e3=easeBack(span01(u,0.85,1.45));
    if(e3>0){
      const pressed=u>1.95,press=1-0.08*Math.sin(Math.PI*span01(u,1.85,2.1));
      const label=pressed?(P.subscribedText||'✓'):(P.subscribeText||'Subscribe');
      ctx.globalAlpha=Math.min(1,e3);ctx.font=font(900,L.portrait?44:40);const bw=Math.max(300,ctx.measureText(label).width+110),bh=L.portrait?96:88,by=cy+R*0.55+150;
      ctx.save();ctx.translate(cx,by+bh/2);ctx.scale(e3*press,e3*press);
      rrect(ctx,-bw/2,-bh/2,bw,bh,bh/2);ctx.fillStyle=pressed?'#5b6472':'#ff0033';ctx.shadowColor=pressed?'transparent':'rgba(255,0,51,.55)';ctx.shadowBlur=pressed?0:30+10*Math.sin(u*5);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#fff';text(ctx,label,0,3,'center');ctx.restore();
      // cursor tap
      const cu=span01(u,1.2,1.85);if(u>1.2&&u<2.6){const px=cx+bw*0.3+(1-easeInOut(cu))*160,py=by+bh*0.7+(1-easeInOut(cu))*120;ctx.globalAlpha=Math.min(1,e3)*(1-span01(u,2.3,2.6));drawCursor(ctx,px,py,u>1.85&&u<2.1)}
    }
    ctx.restore();ctx.textBaseline='alphabetic';
  }
  function drawCursor(ctx,x,y,down){ctx.save();ctx.translate(x,y);ctx.scale(down?1.6:1.8,down?1.6:1.8);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,26);ctx.lineTo(7,20);ctx.lineTo(12,31);ctx.lineTo(17,29);ctx.lineTo(12,18);ctx.lineTo(21,18);ctx.closePath();ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=1.6;ctx.fill();ctx.stroke();ctx.restore()}
  function drawSafeArea(ctx){
    ctx.save();ctx.setLineDash([12,10]);ctx.lineWidth=3;ctx.strokeStyle='rgba(255,60,90,.9)';ctx.fillStyle='rgba(255,60,90,.14)';
    if(L.portrait){ctx.fillRect(0,0,L.W,120);ctx.fillRect(0,L.H-360,L.W,360);ctx.fillRect(L.W-130,L.H*0.45,130,L.H*0.55-360);ctx.strokeRect(0,120,L.W-130,L.H-480)}
    else{const mx=L.W*0.05,my=L.H*0.05;ctx.strokeRect(mx,my,L.W-2*mx,L.H-2*my);ctx.fillRect(L.W-440,L.H-120,440,120)}
    ctx.restore();
  }

  // ---------- public ----------
  function draw(ctx,t,s,opts={}){
    ctx.setTransform(s,0,0,s,0,0);ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.imageSmoothingQuality='high';
    t=clamp(t,0,tl.total);
    drawBackground(ctx);
    const year=ds?tl.yearAt(t):0,vals=ds?valuesAt(ds,year):new Map(),rk=ranked(vals),leader=rk[0]?rk[0].id:null;
    const cam=cameraAt(t);
    const project=isGlobe()?drawMapGlobe(ctx,s,cam,vals,rk,leader):isCartogram()?drawMapCartogram(ctx,s,cam,vals,rk,leader):drawMapFlat(ctx,s,cam,vals,rk,leader);
    ctx.setTransform(s,0,0,s,0,0);
    drawVignette(ctx);
    const hud=tl.intro>0?easeInOut(span01(t,tl.intro-0.5,tl.intro+0.5)):1;
    drawBeacon(ctx,leader&&hud>0.5?project(leader):null,t);
    drawMapLabels(ctx,rk,project,hud);
    drawHeader(ctx,hud);drawBars(ctx,year,vals,hud,t);drawYear(ctx,year,hud);drawLegend(ctx,hud);
    drawEvents(ctx,t);drawBanner(ctx,t);drawSource(ctx,hud);drawWatermark(ctx,1);
    drawIntro(ctx,t);drawOutro(ctx,t);
    if(!ds){ctx.font=font(800,44);ctx.fillStyle=theme.ink;ctx.textBaseline='middle';text(ctx,'Upload a data file to start',L.W/2,L.H/2,'center')}
    if(opts.safeArea)drawSafeArea(ctx);
    return {year,leader};
  }
  function configure(settings,dataset,{layoutChanged=true}={}){
    P=settings;ds=dataset;theme={...THEMES[P.theme]||THEMES.dark};if(P.landColor)theme.land=P.landColor;if(P.oceanColor)theme.sphere=P.oceanColor;
    rankCache.clear();catCache.clear();
    const nl=computeLayout();
    if(layoutChanged||!flat||!L||nl.W!==L.W||nl.H!==L.H||JSON.stringify(nl.focus)!==JSON.stringify(L.focus)){L=nl;flat=buildFlat()}else L=nl;
    buildColorScale();tl=buildTimeline();
  }
  return {
    configure,draw,validIds,
    get size(){return [L.W,L.H]},get layout(){return L},barColorOf:id=>barColor(id),setCustomImage(id,img){if(img)customImgs.set(id,img);else customImgs.delete(id)},get timeline(){return tl},
    setFlag(id,img){flags.set(id,img)},hasFlag:id=>flags.has(id),setLogo(img){logo=img},
    nameOf:id=>nameOf(id),fmt:v=>fmt(v),fmtYear:y=>fmtYear(y)
  };
}

function mainlandOf(f){
  if(f.geometry.type!=='MultiPolygon')return f;
  let best=f.geometry.coordinates[0],ba=-1;
  for(const poly of f.geometry.coordinates){const a=Math.abs(d3.geoArea({type:'Polygon',coordinates:poly}));if(a>ba){ba=a;best=poly}}
  return {type:'Feature',properties:f.properties,geometry:{type:'Polygon',coordinates:best}};
}
function parseColor(c){
  if(c.startsWith('#')){let h=c.slice(1);if(h.length===3)h=h.split('').map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))}
  const m=c.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0];
}
function hexA(c,a){const [r,g,b]=parseColor(c);return `rgba(${r},${g},${b},${a})`}
function lighten(c,k){const [r,g,b]=parseColor(c);return `rgb(${r+(255-r)*k|0},${g+(255-g)*k|0},${b+(255-b)*k|0})`}
function darken(c,k){const [r,g,b]=parseColor(c);return `rgb(${r*(1-k)|0},${g*(1-k)|0},${b*(1-k)|0})`}
