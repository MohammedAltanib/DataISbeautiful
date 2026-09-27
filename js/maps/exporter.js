// Frame-exact video export for the Map Studio.
// Each frame is rendered at an exact timestamp (i / fps) and pushed through WebCodecs into an
// MP4 container — no screen capture, so there are no dropped frames and the output resolution
// is independent of the monitor (1080p, 1440p or 4K at 30/60 fps).
const MUXER_URL='https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm';

const even=n=>Math.max(2,Math.round(n/2)*2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function pickVideoConfig(width,height,fps,bitrate){
  const cands=[
    ['avc1.640034','avc'],['avc1.640033','avc'],['avc1.64002A','avc'],['avc1.640028','avc'],['avc1.4D0034','avc'],['avc1.42E034','avc'],
    ['vp09.00.51.08','vp9'],['vp09.00.41.08','vp9'],['av01.0.12M.08','av1'],['av01.0.08M.08','av1']
  ];
  for(const [codec,mux] of cands){
    const cfg={codec,width,height,bitrate,framerate:fps,latencyMode:'quality',bitrateMode:'variable'};
    if(mux==='avc')cfg.avc={format:'avc'};
    try{const r=await VideoEncoder.isConfigSupported(cfg);if(r.supported)return {cfg:r.config,mux}}catch{}
  }
  return null;
}
async function pickAudioConfig(sampleRate,numberOfChannels){
  if(!window.AudioEncoder)return null;
  for(const [codec,mux] of [['mp4a.40.2','aac'],['opus','opus']]){
    const cfg={codec,sampleRate,numberOfChannels,bitrate:192000};
    try{const r=await AudioEncoder.isConfigSupported(cfg);if(r.supported)return {cfg:r.config,mux}}catch{}
  }
  return null;
}

export function canExportMp4(){return typeof window.VideoEncoder==='function'&&typeof window.VideoFrame==='function'}

export async function exportMp4({engine,fps,scale,quality,audio,onProgress,isCancelled}){
  const {Muxer,ArrayBufferTarget}=await import(MUXER_URL);
  const [W,H]=engine.size,width=even(W*scale),height=even(H*scale),total=engine.timeline.total;
  const pixels=width*height*fps,bitrate=Math.round(Math.min(120e6,Math.max(6e6,pixels*({standard:0.07,high:0.11,max:0.16}[quality]||0.11))));
  const v=await pickVideoConfig(width,height,fps,bitrate);
  if(!v)throw new Error('المتصفح لا يدعم ترميز الفيديو بهذه الدقة. جرّب دقة أقل أو استخدم Chrome/Edge.');
  const a=audio?await pickAudioConfig(audio.sampleRate,audio.numberOfChannels):null;

  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec:v.mux,width,height,frameRate:fps},audio:a?{codec:a.mux,sampleRate:audio.sampleRate,numberOfChannels:audio.numberOfChannels}:undefined,fastStart:'in-memory',firstTimestampBehavior:'offset'});
  let failure=null;

  if(a){
    const ae=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>{failure=e}});
    ae.configure(a.cfg);
    const sr=audio.sampleRate,ch=audio.numberOfChannels,len=Math.min(audio.length,Math.ceil(total*sr)),block=4096;
    const chans=[...Array(ch)].map((_,i)=>audio.getChannelData(i));
    for(let off=0;off<len;off+=block){
      const n=Math.min(block,len-off),data=new Float32Array(n*ch);
      for(let c=0;c<ch;c++)data.set(chans[c].subarray(off,off+n),c*n);
      const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:ch,timestamp:Math.round(off/sr*1e6),data});
      ae.encode(ad);ad.close();
      if(ae.encodeQueueSize>32)await sleep(0);
    }
    await ae.flush();ae.close();
  }

  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});
  const ve=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>{failure=e}});
  ve.configure(v.cfg);
  const frames=Math.max(1,Math.round(total*fps)),gop=fps*2,dur=1e6/fps,s=width/W;
  const started=performance.now();
  for(let i=0;i<frames;i++){
    if(failure)throw failure;
    if(isCancelled&&isCancelled()){ve.close();return null}
    engine.draw(ctx,i/fps,s);
    const frame=new VideoFrame(canvas,{timestamp:Math.round(i*dur),duration:Math.round(dur)});
    ve.encode(frame,{keyFrame:i%gop===0});frame.close();
    while(ve.encodeQueueSize>4)await sleep(1);
    if(i%3===0){const el=(performance.now()-started)/1000,p=(i+1)/frames;onProgress&&onProgress(p,el/p-el);await sleep(0)}
  }
  await ve.flush();ve.close();
  if(failure)throw failure;
  muxer.finalize();
  onProgress&&onProgress(1,0);
  return {blob:new Blob([target.buffer],{type:'video/mp4'}),width,height,codec:v.cfg.codec,audioCodec:a?a.cfg.codec:null};
}

// Fallback for browsers without WebCodecs (e.g. older Firefox): real-time capture to WebM.
export async function exportWebmRealtime({engine,fps,scale,onProgress,isCancelled}){
  const [W,H]=engine.size,width=even(W*scale),height=even(H*scale),total=engine.timeline.total;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});
  const stream=canvas.captureStream(fps);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'video/webm';
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:25e6}),chunks=[];
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(r=>rec.onstop=r);
  rec.start();const t0=performance.now();
  for(;;){
    const t=(performance.now()-t0)/1000;if(t>total||(isCancelled&&isCancelled()))break;
    engine.draw(ctx,t,width/W);onProgress&&onProgress(t/total,total-t);
    await new Promise(r=>requestAnimationFrame(r));
  }
  rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return {blob:new Blob(chunks,{type:'video/webm'}),width,height,codec:mime};
}

export async function exportPng({engine,t,scale}){
  const [W,H]=engine.size,canvas=document.createElement('canvas');
  canvas.width=even(W*scale);canvas.height=even(H*scale);
  engine.draw(canvas.getContext('2d'),t,canvas.width/W);
  return new Promise(r=>canvas.toBlob(r,'image/png'));
}
