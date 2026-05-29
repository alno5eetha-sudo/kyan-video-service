# 🎬 KYAN Video Render Service

Converts animated HTML → MP4 videos using Puppeteer + FFmpeg.

## Endpoints

### `GET /health`
Returns service status + available templates.

### `GET /templates`
Lists all available templates with metadata.

### `POST /render`
Render arbitrary HTML to MP4.
```json
{
  "html": "<html>...</html>",
  "duration": 6,
  "width": 1080,
  "height": 1920,
  "fps": 30
}
```
Returns: `{ "url": "https://...mp4", "id": "uuid", ... }`

### `POST /render-template`
Render a named template with data.
```json
{
  "template": "hero",
  "data": {
    "logo": "كَيان",
    "tagline": "حيث يلتقي الذكاء بالاستراتيجية"
  }
}
```

## Templates

| Key | Type | Size | Duration |
|-----|------|------|----------|
| `hero` | Reel | 1080×1920 | 6s |
| `stat` | Post | 1080×1350 | 6s |
| `quote` | Post | 1080×1350 | 6s |
| `tip` | Story | 1080×1920 | 5s |

## Local Dev

```bash
npm install
npm start
```

## Docker

```bash
docker build -t kyan-video-render .
docker run -p 3000:3000 -v $(pwd)/videos:/data/videos kyan-video-render
```

## Environment

- `PORT` - default 3000
- `PUBLIC_URL` - base URL for video links (e.g. https://video.kyan.my)
- `OUTPUT_DIR` - where MP4s are saved (default /data/videos)
- `RETENTION_HOURS` - auto-cleanup (default 72)
