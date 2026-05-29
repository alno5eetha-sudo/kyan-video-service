// KYAN Video Render Service
// Converts animated HTML → MP4 / GIF using Puppeteer + FFmpeg (via puppeteer-screen-recorder)
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
    await new Promise(r => setTimeout(r, 1500)); // settle animations start

    const recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: false,
      fps,
      videoFrame: { width, height },
      videoCrf: 18,
      videoCodec: 'libx264',
      videoPreset: 'fast',
      videoBitrate: 4000,
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
// API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ service: 'KYAN Video Render', status: 'ok', endpoints: ['/health', '/templates', '/render', '/render-template', '/screenshot', '/screenshot-template', '/pdf'] });
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
