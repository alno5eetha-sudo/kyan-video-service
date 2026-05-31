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
async function renderScreenshotFromHtml({ html, width = 1080, height = 1920, delay = 4500 }) {
  const id = uuidv4();
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
async function renderPdfFromHtml({ html, landscape = false }) {
  const id = uuidv4();
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
    p.on('close', code => { clearTimeout(to); code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-900))); });
    p.on('error', e => { clearTimeout(to); reject(e); });
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
// API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ service: 'KYAN Video Render', status: 'ok', endpoints: ['/health', '/templates', '/render', '/render-template', '/screenshot', '/screenshot-template', '/pdf', '/slideshow'] });
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
    const { html, landscape } = req.body;
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'missing html' });
    if (html.length > 10_000_000) return res.status(400).json({ error: 'html too large' });
    const result = await renderPdfFromHtml({ html, landscape: !!landscape });
    res.json(result);
  } catch(e) {
    console.error('PDF error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Fast PNG preview of arbitrary HTML (debug / design review)
app.post('/screenshot', async (req, res) => {
  try {
    const { html, width, height, delay } = req.body;
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'missing html' });
    const result = await renderScreenshotFromHtml({ html, width, height, delay });
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
