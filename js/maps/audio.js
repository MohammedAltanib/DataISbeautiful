// Audio for the Map Studio: background music + synthesized sound effects (whoosh on camera
// moves, a chime for a new #1, pop/click for the outro). The same scheduling code drives the
// live preview (AudioContext) and the export mix (OfflineAudioContext), so what you hear while
// previewing is what ends up in the MP4.

export async function decodeAudioFile(file){
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  try{return await ac.decodeAudioData(await file.arrayBuffer())}finally{ac.close()}
}

let noiseCache=new WeakMap();
function noise(ac,seconds){
  let m=noiseCache.get(ac);if(!m){m=new Map();noiseCache.set(ac,m)}
  const key=seconds;if(m.has(key))return m.get(key);
  const b=ac.createBuffer(1,Math.ceil(ac.sampleRate*seconds),ac.sampleRate),d=b.getChannelData(0);
  let seed=1234567;for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=seed/1073741823.5-1}
  m.set(key,b);return b;
}

export function playSfx(ac,dest,type,when,volume){
  const out=ac.createGain();out.gain.value=volume;out.connect(dest);
  const env=(g,peakAt,peak,endAt)=>{g.gain.setValueAtTime(0.0001,when);g.gain.exponentialRampToValueAtTime(peak,when+peakAt);g.gain.exponentialRampToValueAtTime(0.0001,when+endAt)};
  if(type==='whoosh'){
    const src=ac.createBufferSource();src.buffer=noise(ac,1.2);
    const bp=ac.createBiquadFilter();bp.type='bandpass';bp.Q.value=1.1;
    bp.frequency.setValueAtTime(250,when);bp.frequency.exponentialRampToValueAtTime(2600,when+0.45);bp.frequency.exponentialRampToValueAtTime(500,when+1.1);
    const g=ac.createGain();env(g,0.42,0.9,1.15);
    src.connect(bp).connect(g).connect(out);src.start(when);src.stop(when+1.2);
  }else if(type==='ding'){
    for(const [f,a] of [[1318.5,0.5],[1975.5,0.28],[659.25,0.22]]){
      const o=ac.createOscillator();o.type='sine';o.frequency.value=f;const g=ac.createGain();env(g,0.01,a,1.6);o.connect(g).connect(out);o.start(when);o.stop(when+1.7);
    }
  }else if(type==='pop'){
    const o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(620,when);o.frequency.exponentialRampToValueAtTime(160,when+0.16);
    const g=ac.createGain();env(g,0.008,0.9,0.3);o.connect(g).connect(out);o.start(when);o.stop(when+0.32);
  }else if(type==='click'){
    const src=ac.createBufferSource();src.buffer=noise(ac,0.1);const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=2500;
    const g=ac.createGain();env(g,0.002,0.8,0.06);src.connect(hp).connect(g).connect(out);src.start(when);src.stop(when+0.08);
  }else if(type==='tick'){
    const o=ac.createOscillator();o.type='triangle';o.frequency.value=880;const g=ac.createGain();env(g,0.005,0.35,0.35);o.connect(g).connect(out);o.start(when);o.stop(when+0.4);
  }
}

function scheduleMusic(ac,dest,music,{volume,fade,loop,total},offset=0){
  if(!music)return null;
  const g=ac.createGain();g.connect(dest);
  const src=ac.createBufferSource();src.buffer=music;src.loop=!!loop;src.connect(g);
  const now=ac.currentTime,fadeStart=Math.max(0,total-fade);
  g.gain.setValueAtTime(volume,now);
  if(fade>0){
    if(offset<fadeStart){g.gain.setValueAtTime(volume,now+(fadeStart-offset));g.gain.linearRampToValueAtTime(0.0001,now+(total-offset))}
    else g.gain.setValueAtTime(volume*Math.max(0,(total-offset)/fade),now);
  }
  const startIn=loop?offset%music.duration:offset;
  if(!loop&&startIn>=music.duration)return null;
  src.start(now,startIn);src.stop(now+Math.max(0,total-offset));
  return src;
}

// Offline mix for export → AudioBuffer covering [0,total]
export async function renderMix({music,settings,sfx,total,sampleRate=48000}){
  const ac=new OfflineAudioContext(2,Math.ceil(total*sampleRate),sampleRate);
  const master=ac.createDynamicsCompressor();master.threshold.value=-10;master.ratio.value=4;master.connect(ac.destination);
  scheduleMusic(ac,master,music,{volume:settings.musicVolume,fade:settings.musicFade,loop:settings.musicLoop,total});
  if(settings.sfxOn)for(const e of sfx)if(e.t<total)playSfx(ac,master,e.type,e.t,settings.sfxVolume);
  return ac.startRendering();
}

// Live preview audio that follows the play head.
export class PreviewAudio{
  constructor(){this.ac=null;this.nodes=[];this.lastT=null}
  start(t,{music,settings,sfx,total}){
    this.stop();
    if(!music&&!settings.sfxOn)return;
    this.ac=this.ac||new (window.AudioContext||window.webkitAudioContext)();
    if(this.ac.state==='suspended')this.ac.resume();
    this.master=this.ac.createGain();this.master.connect(this.ac.destination);
    this.music=scheduleMusic(this.ac,this.master,music,{volume:settings.musicVolume,fade:settings.musicFade,loop:settings.musicLoop,total},t);
    this.sfx=settings.sfxOn?sfx:[];this.vol=settings.sfxVolume;this.lastT=t;
  }
  tick(t){
    if(!this.ac||this.lastT==null)return;
    for(const e of this.sfx)if(e.t>this.lastT&&e.t<=t)playSfx(this.ac,this.master,e.type,this.ac.currentTime,this.vol);
    this.lastT=t;
  }
  stop(){
    if(this.music){try{this.music.stop()}catch{}this.music=null}
    if(this.master){this.master.disconnect();this.master=null}
    this.lastT=null;
  }
}
