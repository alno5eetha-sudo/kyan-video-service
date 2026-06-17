// KYAN Video Render Service
// Converts animated HTML → MP4 / GIF using Puppeteer + FFmpeg (via puppeteer-screen-recorder)
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
// Lazy-loaded heavy deps (so server starts even if a dep has issues)
let puppeteer = null;
let PuppeteerScreenRecorder = null;
function loadDeps() {
  if (!puppeteer) puppeteer = require('puppeteer');
  if (!PuppeteerScreenRecorder) PuppeteerScreenRecorder = require('puppeteer-screen-recorder').PuppeteerScreenRecorder;
}

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data/videos';
const RETENTION_HOURS = parseInt(process.env.RETENTION_HOURS || '72');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use('/videos', express.static(OUTPUT_DIR, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Background cleanup
setInterval(() => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR);
    const cutoff = Date.now() - RETENTION_HOURS * 3600 * 1000;
    files.forEach(f => {
      if (f.indexOf('lm_') === 0) return; // lead-magnet files are permanent (never auto-deleted)
      const fp = path.join(OUTPUT_DIR, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(fp);
        console.log('Cleaned', f);
      }
    });
  } catch(e) { console.error('Cleanup error:', e.message); }
}, 3600 * 1000); // hourly

const TEMPLATES = require('./templates');

let browserInstance = null;
async function getBrowser() {
  loadDeps();
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
      '--allow-file-access-from-files',
      '--enable-features=NetworkService'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  });
  return browserInstance;
}

async function renderVideoFromHtml({ html, duration = 6, width = 1080, height = 1920, fps = 30 }) {
  const id = uuidv4();
  const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait for fonts to load
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await new Promise(r => setTimeout(r, 500)); // brief paint buffer (fonts already awaited)

    const recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: false,
      fps,
      videoFrame: { width, height },
      videoCrf: 16,            // higher quality (less banding on gradients)
      videoCodec: 'libx264',
      videoPreset: 'medium',   // better compression quality
      videoBitrate: 12000,     // 3x bitrate -> rich, un-washed color
      autopad: { color: 'black' },
      aspectRatio: `${width}:${height}`
    });

    await recorder.start(outputPath);
    await new Promise(r => setTimeout(r, duration * 1000));
    await recorder.stop();

    return {
      url: `${PUBLIC_URL}/videos/${id}.mp4`,
      id,
      duration, width, height, fps
    };
  } finally {
    await page.close();
  }
}

// Capture a single PNG frame (fast preview / debug — no video encoding)
async function renderScreenshotFromHtml({ html, width = 1080, height = 1920, delay = 4500, keep = false }) {
  const id = (keep ? 'lm_' : '') + uuidv4();
  const outputPath = path.join(OUTPUT_DIR, `${id}.png`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await new Promise(r => setTimeout(r, delay));
    await page.screenshot({ path: outputPath, type: 'png' });
    return { url: `${PUBLIC_URL}/videos/${id}.png`, id, width, height };
  } finally {
    await page.close();
  }
}

// Render an HTML document to a print-ready PDF (honours CSS @page size)
async function renderPdfFromHtml({ html, landscape = false, keep = false }) {
  const id = (keep ? 'lm_' : '') + uuidv4();
  const outputPath = path.join(OUTPUT_DIR, `${id}.pdf`);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await new Promise(r => setTimeout(r, 1200)); // let webfonts paint
    await page.pdf({
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: true,
      format: 'A4',
      landscape,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    return { url: `${PUBLIC_URL}/videos/${id}.pdf`, id };
  } finally {
    await page.close();
  }
}

// ─────────────────────────────────────────────────────────────────────
// SLIDESHOW: carousel images (+ music) → MP4 with crossfades (FFmpeg)
// ─────────────────────────────────────────────────────────────────────
async function downloadTo(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch ' + r.status + ' ' + url);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

function runFfmpeg(args, timeoutMs = 150000) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args);
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 24000) err = err.slice(-24000); });
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch(e){} reject(new Error('ffmpeg timeout')); }, timeoutMs);
    p.on('close', code => { clearTimeout(to); code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-2600))); });
    p.on('error', e => { clearTimeout(to); reject(e); });
  });
}

// Probe media duration in seconds (0 if unknown).
function probeDuration(file){
  return new Promise(resolve => {
    try {
      const p = spawn('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', file]);
      let out = '';
      p.stdout.on('data', d => out += d.toString());
      p.on('close', () => { const v = parseFloat((out||'').trim()); resolve(isFinite(v) && v > 0 ? v : 0); });
      p.on('error', () => resolve(0));
    } catch(e){ resolve(0); }
  });
}

// images: array of URLs · audio: optional URL (else original synthesized ambient pad)
async function renderSlideshow({ images, audio, perSlide = 3.2, fade = 0.7, width = 1080, height = 1350, bg = '0xF4EEE1' }) {
  if (!Array.isArray(images) || !images.length) throw new Error('no images');
  const id = uuidv4();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-'));
  const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
  try {
    const localImgs = [];
    for (let i = 0; i < images.length; i++) {
      const m = (images[i].split('?')[0].match(/\.(png|jpe?g|webp)$/i) || [null, 'png']);
      const ext = (m[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
      const dest = path.join(work, `img${i}.${ext}`);
      await downloadTo(images[i], dest);
      localImgs.push(dest);
    }
    const N = localImgs.length;
    const D = Math.max(1.5, +perSlide || 3.2);
    const T = N > 1 ? Math.min(+fade || 0.7, D - 0.3) : 0;
    const total = +(N * D - (N - 1) * T).toFixed(3);

    const args = ['-y'];
    localImgs.forEach(f => { args.push('-loop', '1', '-t', String(D), '-i', f); });

    // audio source
    let synth = true;
    const PAD = [130.81, 261.63, 329.63, 392.00, 587.33]; // C3 + Cmaj9 voicing — calm, modern
    if (audio) {
      const am = (audio.split('?')[0].match(/\.(mp3|m4a|aac|wav|ogg)$/i) || [null, 'mp3']);
      const aext = (am[1] || 'mp3').toLowerCase();
      const aLocal = path.join(work, `music.${aext}`);
      await downloadTo(audio, aLocal);
      args.push('-stream_loop', '-1', '-i', aLocal);
      synth = false;
    } else {
      PAD.forEach(fq => args.push('-f', 'lavfi', '-i', `sine=frequency=${fq}:sample_rate=44100`));
    }

    // video filter: scale/pad each, then xfade chain
    let fc = '';
    localImgs.forEach((f, i) => {
      fc += `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1,fps=30,format=yuv420p[v${i}];`;
    });
    if (N === 1) {
      fc += `[v0]copy[vout];`;
    } else {
      let prev = 'v0';
      for (let k = 1; k < N; k++) {
        const off = (k * (D - T)).toFixed(3);
        const out = (k === N - 1) ? 'vout' : `x${k}`;
        fc += `[${prev}][v${k}]xfade=transition=fade:duration=${T}:offset=${off}[${out}];`;
        prev = out;
      }
    }

    // audio filter
    const aStart = N;
    if (synth) {
      const labels = PAD.map((_, j) => `[${aStart + j}:a]`).join('');
      fc += `${labels}amix=inputs=${PAD.length}:duration=longest:weights=0.6 1 0.85 0.8 0.5,aformat=channel_layouts=stereo,tremolo=f=0.12:d=0.5,aecho=0.85:0.9:55:0.35,lowpass=f=2200,volume=3.2,afade=t=in:d=1.6,afade=t=out:st=${Math.max(0, total - 2).toFixed(3)}:d=2[aout]`;
    } else {
      fc += `[${aStart}:a]aformat=channel_layouts=stereo,volume=0.85,afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, total - 1.8).toFixed(3)}:d=1.8[aout]`;
    }

    args.push(
      '-filter_complex', fc,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
      '-t', String(total), '-movflags', '+faststart',
      outputPath
    );
    await runFfmpeg(args);
    return { url: `${PUBLIC_URL}/videos/${id}.mp4`, id, duration: total, width, height, slides: N, music: synth ? 'synth-ambient' : 'custom' };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch(e){}
  }
}

// ─────────────────────────────────────────────────────────────────────
// FILM ASSEMBLE: AI scene clips + Arabic captions + brand outro → one MP4
// (captions rendered as transparent PNGs via Puppeteer → sidesteps Arabic
//  shaping issues in FFmpeg drawtext; brand outro card; music or synth pad)
// ─────────────────────────────────────────────────────────────────────
function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dimsFor(aspect){
  if (aspect === '16:9') return { W:1920, H:1080 };
  if (aspect === '1:1')  return { W:1080, H:1080 };
  return { W:1080, H:1920 }; // 9:16 default
}

// Lower-third Arabic caption over a transparent frame
function captionHtml({ text, W, H, accent }){
  const fontSize = Math.max(30, Math.min(Math.round(W * 0.052), 64));
  const bar = Math.max(6, Math.round(W * 0.012));
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:'Cairo',sans-serif}
.scrim{position:absolute;left:0;right:0;bottom:0;height:44%;background:linear-gradient(to top,rgba(0,0,0,.74) 0%,rgba(0,0,0,.42) 48%,rgba(0,0,0,0) 100%)}
.cap{position:absolute;left:6%;right:6%;bottom:${Math.round(H*0.085)}px;display:flex;align-items:center;gap:${Math.round(W*0.026)}px;direction:rtl}
.bar{flex:0 0 auto;width:${bar}px;align-self:stretch;min-height:${Math.round(fontSize*1.25)}px;background:${accent};border-radius:99px;box-shadow:0 0 26px ${accent}bb}
.txt{font-weight:900;font-size:${fontSize}px;line-height:1.32;color:#fff;text-shadow:0 3px 20px rgba(0,0,0,.9);letter-spacing:-1px}</style></head>
<body><div class="scrim"></div><div class="cap"><span class="bar"></span><span class="txt">${_esc(text)}</span></div></body></html>`;
}

// Branded end card (logo + CTA + handle)
function outroHtml({ W, H, brandKit, cta, handle, logo, title }){
  const bg = brandKit.bg || brandKit.a2 || '#0B0B0D';
  const accent = brandKit.a1 || '#E8B04B';
  const isImg = typeof logo === 'string' && /^https?:\/\//.test(logo);
  const logoText = (logo && !isImg) ? logo : (brandKit.logo || title || '');
  const logoBlock = isImg
    ? `<img class="logo-img" src="${_esc(logo)}">`
    : `<div class="logo-txt">${_esc(logoText)}</div>`;
  const ctaBlock = cta ? `<div class="cta">${_esc(cta)}</div>` : '';
  const handleBlock = handle ? `<div class="handle">${_esc(handle)}</div>` : '';
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Inter:wght@700;800&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${bg};font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center}
.glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${Math.round(W*0.9)}px;height:${Math.round(W*0.9)}px;background:radial-gradient(circle,${accent}26 0%,transparent 62%);pointer-events:none}
.wrap{position:relative;z-index:2;text-align:center;padding:8%;max-width:90%}
.logo-img{max-width:${Math.round(W*0.52)}px;max-height:${Math.round(H*0.20)}px;object-fit:contain;display:block;margin:0 auto ${Math.round(H*0.035)}px}
.logo-txt{font-weight:900;font-size:${Math.round(W*0.13)}px;line-height:1;color:#fff;letter-spacing:-3px;margin-bottom:${Math.round(H*0.03)}px}
.accent-line{width:${Math.round(W*0.16)}px;height:6px;background:${accent};border-radius:99px;margin:0 auto ${Math.round(H*0.04)}px}
.cta{font-weight:900;font-size:${Math.round(W*0.07)}px;line-height:1.34;color:#fff;margin-bottom:${Math.round(H*0.05)}px}
.handle{font-family:'Inter',sans-serif;font-weight:800;font-size:${Math.round(W*0.03)}px;letter-spacing:3px;color:${accent};direction:ltr}</style></head>
<body><div class="glow"></div><div class="wrap">${logoBlock}<div class="accent-line"></div>${ctaBlock}${handleBlock}</div></body></html>`;
}

// Render HTML → PNG file in tmp (transparent optional). Returns local path.
async function pngFromHtml({ html, W, H, transparent, dir }){
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    await new Promise(r => setTimeout(r, 450));
    const p = path.join(dir, uuidv4() + '.png');
    await page.screenshot({ path: p, type: 'png', omitBackground: !!transparent });
    return p;
  } finally { await page.close(); }
}

async function assembleFilm({ scenes, brandKit = {}, cta = '', handle = '', aspect = '9:16', music = '', title = '', logo = '', voiceover = [] }){
  const { W, H } = dimsFor(aspect);
  const accent = brandKit.a1 || '#E8B04B';
  const id = uuidv4();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'film-'));
  const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
  try {
    const segs = [];
    const starts = [];
    let total = 0;

    const hasVO = Array.isArray(voiceover) && voiceover.some(v => v && /^https?:/.test(v));
    const LEAD = 0.35, TAIL = 0.65; // breathing room before/after each spoken line
    // pre-download + probe each voiceover so the VOICE drives scene pacing (editor's cut)
    const voFiles = [];
    if (hasVO){
      for (let i = 0; i < scenes.length; i++){
        const vu = voiceover[i];
        if (vu && /^https?:/.test(vu)){
          const am = (vu.split('?')[0].match(/\.(mp3|m4a|aac|wav|ogg)$/i) || [null, 'mp3']);
          const vLocal = path.join(work, `vo${i}.${(am[1] || 'mp3').toLowerCase()}`);
          try { await downloadTo(vu, vLocal); voFiles[i] = { file: vLocal, dur: await probeDuration(vLocal) }; }
          catch(e){ voFiles[i] = null; }
        } else voFiles[i] = null;
      }
    }

    // 1) per-scene: scene length follows its VO line; clip time-stretched (setpts) to fill smoothly
    for (let i = 0; i < scenes.length; i++){
      const sc = scenes[i] || {};
      const vd = (voFiles[i] && voFiles[i].dur) || 0;
      const dur = vd > 0
        ? Math.min(Math.max(vd + LEAD + TAIL, 3), 12)
        : Math.min(Math.max(+sc.duration || 5, 2), 10);
      starts.push(total);
      const clipLocal = path.join(work, `clip${i}.mp4`);
      await downloadTo(sc.clip, clipLocal);
      let clipDur = await probeDuration(clipLocal); if (!(clipDur > 0)) clipDur = 5;
      const factor = Math.min(Math.max(dur / clipDur, 0.5), 2.2); // smooth speed-fit to scene length
      const seg = path.join(work, `seg${i}.mp4`);
      const args = ['-y', '-i', clipLocal];
      const base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,setpts=${factor.toFixed(4)}*PTS,fps=30`;
      let fc;
      if ((sc.onscreen || '').trim()){
        const capPng = await pngFromHtml({ html: captionHtml({ text: sc.onscreen, W, H, accent }), W, H, transparent: true, dir: work });
        args.push('-i', capPng);
        fc = `${base}[b];[b][1:v]overlay=0:0,format=yuv420p[v]`;
      } else {
        fc = `${base},format=yuv420p[v]`;
      }
      args.push('-filter_complex', fc, '-map', '[v]', '-an', '-t', dur.toFixed(3),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-preset', 'veryfast', seg);
      await runFfmpeg(args, 120000);
      segs.push(seg); total += dur;
    }
    // 2) branded outro card
    const outroDur = 2.6;
    const outroPng = await pngFromHtml({ html: outroHtml({ W, H, brandKit, cta, handle, logo, title }), W, H, transparent: false, dir: work });
    const outroSeg = path.join(work, 'outro.mp4');
    await runFfmpeg(['-y', '-loop', '1', '-t', String(outroDur), '-i', outroPng,
      '-filter_complex', `[0:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p,fade=t=in:d=0.5[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-preset', 'veryfast', outroSeg], 60000);
    segs.push(outroSeg); total = +(total + outroDur).toFixed(2);

    // 3) concat (demuxer) + audio (provided music or synth ambient pad) + master fades
    const listFile = path.join(work, 'list.txt');
    fs.writeFileSync(listFile, segs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));

    const fargs = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
    const PAD = [130.81, 261.63, 329.63, 392.00, 587.33]; // C3 + Cmaj9 — calm cinematic pad
    let synth = true, musicIdx = -1, nextIdx = 1; // [0] = concat video
    if (music && /^https?:/.test(music)){
      const am = (music.split('?')[0].match(/\.(mp3|m4a|aac|wav|ogg)$/i) || [null, 'mp3']);
      const aLocal = path.join(work, `music.${(am[1] || 'mp3').toLowerCase()}`);
      await downloadTo(music, aLocal);
      fargs.push('-stream_loop', '-1', '-i', aLocal); musicIdx = nextIdx++; synth = false;
    } else {
      PAD.forEach(fq => fargs.push('-f', 'lavfi', '-i', `sine=frequency=${fq}:sample_rate=44100`));
      nextIdx += PAD.length;
    }
    // per-scene voiceover inputs, placed sequentially (no overlap) above a ducked bed
    const voMix = [];
    if (hasVO){
      for (let i = 0; i < scenes.length; i++){
        if (voFiles[i] && voFiles[i].file){
          fargs.push('-i', voFiles[i].file);
          voMix.push({ idx: nextIdx++, startMs: Math.round(((starts[i] || 0) + LEAD) * 1000) });
        }
      }
    }
    let fc2 = `[0:v]fade=t=in:d=0.4,fade=t=out:st=${Math.max(0, total - 0.5).toFixed(2)}:d=0.5[v];`;
    const bedVol = hasVO ? (synth ? 0.5 : 0.25) : (synth ? 3.0 : 0.9);
    if (synth){
      const labels = PAD.map((_, j) => `[${1 + j}:a]`).join('');
      fc2 += `${labels}amix=inputs=${PAD.length}:duration=longest:weights=0.6 1 0.85 0.8 0.5,aformat=channel_layouts=stereo,tremolo=f=0.12:d=0.5,aecho=0.85:0.9:55:0.35,lowpass=f=2200,volume=${bedVol},afade=t=in:d=1.4,afade=t=out:st=${Math.max(0, total - 2).toFixed(2)}:d=2[bed];`;
    } else {
      fc2 += `[${musicIdx}:a]aformat=channel_layouts=stereo,volume=${bedVol},afade=t=in:d=1.2,afade=t=out:st=${Math.max(0, total - 1.8).toFixed(2)}:d=1.8[bed];`;
    }
    if (hasVO && voMix.length){
      // mono VO → adelay with all=1 (channel-count safe); sum non-overlapping clips with normalize=0
      voMix.forEach((v, n) => { fc2 += `[${v.idx}:a]adelay=${v.startMs}:all=1,volume=1.9[vo${n}];`; });
      const voL = voMix.map((_, n) => `[vo${n}]`).join('');
      fc2 += `${voL}amix=inputs=${voMix.length}:duration=longest:normalize=0[voice];`;
      fc2 += `[bed][voice]amix=inputs=2:duration=longest:normalize=0,aformat=channel_layouts=stereo,volume=1.0,afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[aout]`;
    } else {
      fc2 += `[bed]anull[aout]`;
    }
    fargs.push('-filter_complex', fc2, '-map', '[v]', '-map', '[aout]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '18', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-t', String(total), '-movflags', '+faststart', outputPath);
    await runFfmpeg(fargs, 240000);

    return { url: `${PUBLIC_URL}/videos/${id}.mp4`, id, duration: total, width: W, height: H, scenes: scenes.length, music: synth ? 'synth-ambient' : 'custom' };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch(e){}
  }
}

// ─────────────────────────────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ service: 'KYAN Video Render', status: 'ok', endpoints: ['/health', '/templates', '/render', '/render-template', '/screenshot', '/screenshot-template', '/pdf', '/slideshow', '/film-assemble'] });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    templates: Object.keys(TEMPLATES),
    timestamp: new Date().toISOString()
  });
});

app.get('/templates', (req, res) => {
  res.json({
    templates: Object.keys(TEMPLATES).map(key => ({
      key,
      name: TEMPLATES[key].name,
      type: TEMPLATES[key].type,
      duration: TEMPLATES[key].duration,
      size: TEMPLATES[key].size,
      preview: TEMPLATES[key].preview
    }))
  });
});

// Render arbitrary HTML
app.post('/render', async (req, res) => {
  try {
    const { html, duration, width, height, fps } = req.body;
    if (!html) return res.status(400).json({ error: 'missing html' });
    if (typeof html !== 'string' || html.length > 5_000_000) return res.status(400).json({ error: 'invalid html' });
    const result = await renderVideoFromHtml({ html, duration, width, height, fps });
    res.json(result);
  } catch(e) {
    console.error('Render error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Render a named template with data
app.post('/render-template', async (req, res) => {
  try {
    const { template, data = {} } = req.body;
    if (!template) return res.status(400).json({ error: 'missing template' });
    const tmpl = TEMPLATES[template];
    if (!tmpl) return res.status(404).json({ error: 'template not found', available: Object.keys(TEMPLATES) });

    const html = tmpl.render(data);
    const result = await renderVideoFromHtml({
      html,
      duration: data.duration || tmpl.duration,
      width: tmpl.size.width,
      height: tmpl.size.height,
      fps: data.fps || 30
    });
    res.json({ ...result, template });
  } catch(e) {
    console.error('Render template error:', e);
    res.status(500).json({ error: e.message });
  }
});

// HTML document → print-ready PDF (A4, honours CSS @page)
app.post('/pdf', async (req, res) => {
  try {
    const { html, landscape, keep } = req.body;
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'missing html' });
    if (html.length > 10_000_000) return res.status(400).json({ error: 'html too large' });
    const result = await renderPdfFromHtml({ html, landscape: !!landscape, keep: !!keep });
    res.json(result);
  } catch(e) {
    console.error('PDF error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Fast PNG preview of arbitrary HTML (debug / design review)
app.post('/screenshot', async (req, res) => {
  try {
    const { html, width, height, delay, keep } = req.body;
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'missing html' });
    const result = await renderScreenshotFromHtml({ html, width, height, delay, keep: !!keep });
    res.json(result);
  } catch(e) {
    console.error('Screenshot error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Fast PNG preview of a named template (debug / design review)
app.post('/screenshot-template', async (req, res) => {
  try {
    const { template, data = {} } = req.body;
    if (!template) return res.status(400).json({ error: 'missing template' });
    const tmpl = TEMPLATES[template];
    if (!tmpl) return res.status(404).json({ error: 'template not found', available: Object.keys(TEMPLATES) });
    const html = tmpl.render(data);
    const result = await renderScreenshotFromHtml({
      html,
      width: tmpl.size.width,
      height: tmpl.size.height,
      delay: data.delay || 4500
    });
    res.json({ ...result, template });
  } catch(e) {
    console.error('Screenshot template error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Carousel images (+ optional music URL) → MP4 slideshow with crossfades + ambient music
app.post('/slideshow', async (req, res) => {
  try {
    const { images, audio, perSlide, fade, width, height, bg } = req.body;
    if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'missing images[]' });
    if (images.length > 12) return res.status(400).json({ error: 'too many images (max 12)' });
    const result = await renderSlideshow({ images, audio, perSlide, fade, width, height, bg });
    res.json(result);
  } catch(e) {
    console.error('Slideshow error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Film assembly: AI scene clips (+ Arabic captions + brand outro + music) → one MP4
app.post('/film-assemble', async (req, res) => {
  try {
    const { scenes, brandKit, cta, handle, aspect, music, title, logo, voiceover } = req.body;
    if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'missing scenes[]' });
    if (scenes.length > 8) return res.status(400).json({ error: 'too many scenes (max 8)' });
    for (const s of scenes) {
      if (!s || typeof s.clip !== 'string' || !/^https?:\/\//.test(s.clip)) return res.status(400).json({ error: 'each scene needs a clip URL' });
    }
    const result = await assembleFilm({
      scenes, brandKit: brandKit || {}, cta: cta || '', handle: handle || '',
      aspect: aspect || '9:16', music: music || '', title: title || '', logo: logo || '',
      voiceover: Array.isArray(voiceover) ? voiceover : []
    });
    res.json(result);
  } catch(e) {
    console.error('Film assemble error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Store a base64 image (e.g. an AI illustration) and return a hosted URL — used so slide re-render keeps the same illustration
app.post('/upload', (req, res) => {
  try {
    const { data, ext } = req.body;
    if (!data || typeof data !== 'string') return res.status(400).json({ error: 'missing data' });
    const e = (ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png';
    const id = uuidv4();
    fs.writeFileSync(path.join(OUTPUT_DIR, id + '.' + e), Buffer.from(data, 'base64'));
    res.json({ url: `${PUBLIC_URL}/videos/${id}.${e}`, id });
  } catch(e) { console.error('Upload error:', e.message); res.status(500).json({ error: e.message }); }
});

process.on('uncaughtException', (e) => console.error('uncaughtException:', e.message));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 KYAN Video Render running on 0.0.0.0:${PORT}`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);
  console.log(`🌐 Public: ${PUBLIC_URL}`);
  console.log(`📋 Templates: ${Object.keys(TEMPLATES).length}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
