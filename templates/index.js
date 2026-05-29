// KYAN Animated Templates Library — MULTI-BRAND
// Each template exports: name, type, size, duration, preview, render(data)
// data.theme picks the brand palette (kyan / scale / <custom>)
const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const COMMON_HEAD = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;700;800;900&family=Inter:wght@200;400;700;800;900&family=Montserrat:wght@300;400;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">`;

// ════════════════════════════════════════════════════════════════════
// BRAND THEMES — each client gets its own palette + fonts + logo
// ════════════════════════════════════════════════════════════════════
const BRAND_THEMES = {
  // KYAN — Aurora Mind (Adel's personal/agency brand)
  kyan: {
    primary: '#1E1B4B', primaryLight: '#2E1B5B',
    signature: '#EC4899', signatureLight: '#F472B6',
    accent: '#22D3EE', accentBright: '#67E8F9',
    warmth: '#FBF6E3', gold: '#FCD34D',
    arFont: 'Cairo', logo: 'كَيان', logoDot: '.', handle: '@HAWEQ8',
    gradient: 'linear-gradient(135deg,#1E1B4B 0%,#2E1B5B 50%,#3A1B6B 100%)'
  },
  // SCALE — Lighting Design (terracotta/cream/charcoal — their identity)
  scale: {
    primary: '#0F0F0E', primaryLight: '#1F1815',
    signature: '#FF6A1A', signatureLight: '#FF8A3D',
    accent: '#FFC27A', accentBright: '#FFD9A0',
    warmth: '#F6EFE5', gold: '#FFC27A',
    arFont: 'Cairo', logo: 'SCALE', logoDot: '', handle: '@SCALE4DESIGN',
    gradient: 'linear-gradient(135deg,#0F0F0E 0%,#1F1815 50%,#2A1F18 100%)'
  }
};

function getTheme(key) {
  return BRAND_THEMES[key] || BRAND_THEMES.kyan;
}

// Common cinematic CSS layers
const CINEMATIC_LAYERS = `
.grain { position: absolute; inset: 0; opacity: 0.04; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 0.5s steps(2) infinite; }
@keyframes grain { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-2%, 2%); } }
.vignette { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%); }
`;

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 1: HERO REVEAL (Reel 9:16)
// ════════════════════════════════════════════════════════════════════
exports.hero = {
  name: 'Cinematic Hero Reveal',
  type: 'reel',
  size: { width: 1080, height: 1920 },
  duration: 6,
  preview: 'Logo + tagline reveal with light beams + glow',
  render: (d) => {
    const C = getTheme(d.theme);
    const logo = esc(d.logo || C.logo);
    const dot = d.logo ? '.' : C.logoDot;
    const tagline = esc(d.tagline || 'حيث يلتقي الذكاء بالاستراتيجية');
    const en = esc(d.en || 'INTELLIGENCE × STRATEGY · KUWAIT');
    const brand = esc(d.brand || 'BRAND IDENTITY');
    const handle = esc(d.handle || C.handle);
    return `${COMMON_HEAD}<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1920px;font-family:'${C.arFont}',sans-serif;direction:rtl;background:#050505;overflow:hidden;}
.stage{width:1080px;height:1920px;background:${C.gradient};position:relative;overflow:hidden;color:${C.warmth};}
.light-beam{position:absolute;top:-50%;left:50%;width:200%;height:200%;background:conic-gradient(from 0deg,transparent,${C.signature}26,transparent,${C.accent}1A,transparent);animation:rotate 20s linear infinite;transform-origin:center;}
@keyframes rotate{to{transform:translate(-50%,-50%) rotate(360deg);}}
${CINEMATIC_LAYERS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:50px;z-index:5;}
.brand-tag{position:absolute;top:8%;right:8%;font-family:'Inter';font-weight:700;font-size:24px;letter-spacing:8px;color:${C.accentBright};opacity:0;transform:translateY(-30px);animation:tagDrop 1s cubic-bezier(.22,.61,.36,1) 0.3s forwards;}
@keyframes tagDrop{to{opacity:1;transform:translateY(0);}}
.logo-stack{position:relative;perspective:1000px;}
.logo-glow{position:absolute;inset:-80px;border-radius:50%;background:radial-gradient(circle,${C.signature}80,transparent 60%);filter:blur(40px);opacity:0;animation:glowPulse 4s ease-in-out infinite,glowFadeIn 1s ease 1.5s forwards;}
@keyframes glowFadeIn{to{opacity:1;}}
@keyframes glowPulse{0%,100%{transform:scale(1);opacity:0.5;}50%{transform:scale(1.3);opacity:0.9;}}
.logo{font-family:'${C.arFont}';font-weight:900;font-size:${logo.length > 5 ? 180 : 260}px;letter-spacing:-12px;line-height:1;background:linear-gradient(135deg,${C.warmth} 0%,${C.signatureLight} 50%,${C.accent} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;position:relative;opacity:0;transform:rotateY(-90deg) scale(0.5);animation:logoFlip 1.5s cubic-bezier(.22,.61,.36,1) 1s forwards;}
@keyframes logoFlip{to{opacity:1;transform:rotateY(0) scale(1);}}
.logo .accent{display:inline-block;color:${C.signature};-webkit-text-fill-color:${C.signature};opacity:0;transform:scale(0);animation:dotBounce 0.6s cubic-bezier(.5,1.8,.5,1) 2.5s forwards;}
@keyframes dotBounce{0%{opacity:0;transform:scale(0) rotate(-180deg);}60%{opacity:1;transform:scale(1.5) rotate(0);}100%{opacity:1;transform:scale(1);}}
.tagline-mask{overflow:hidden;padding:8px 0;}
.tagline{font-family:'${C.arFont}';font-weight:300;font-size:44px;letter-spacing:4px;color:${C.warmth};transform:translateY(100%);animation:lineUp 1s cubic-bezier(.22,.61,.36,1) 3s forwards;}
@keyframes lineUp{to{transform:translateY(0);}}
.divider-line{width:0;height:3px;background:linear-gradient(90deg,transparent,${C.signature},transparent);animation:lineExpand 1s cubic-bezier(.22,.61,.36,1) 3.5s forwards;}
@keyframes lineExpand{to{width:400px;}}
.en{font-family:'Inter';font-weight:200;font-size:22px;letter-spacing:12px;color:${C.accent};opacity:0;animation:fadeIn 1s ease 4s forwards;}
@keyframes fadeIn{to{opacity:1;}}
.footer{position:absolute;bottom:6%;left:0;right:0;display:flex;justify-content:space-between;padding:0 8%;font-family:'JetBrains Mono';font-size:22px;letter-spacing:3px;color:${C.accent};opacity:0;animation:fadeIn 1s ease 4.5s forwards;}
</style></head><body><div class="stage">
<div class="light-beam"></div><div class="vignette"></div><div class="grain"></div>
<div class="brand-tag">${brand}</div>
<div class="content">
<div class="logo-stack"><div class="logo-glow"></div><div class="logo">${logo}${dot ? '<span class="accent">'+dot+'</span>' : ''}</div></div>
<div class="tagline-mask"><div class="tagline">${tagline}</div></div>
<div class="divider-line"></div>
<div class="en">${en}</div>
</div>
<div class="footer"><span>V1.0 / 2026</span><span>${handle}</span></div>
</div></body></html>`;
  }
};

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 2: STAT COUNTER (Post 1080x1350)
// ════════════════════════════════════════════════════════════════════
exports.stat = {
  name: 'Cinematic Stat Counter',
  type: 'post',
  size: { width: 1080, height: 1350 },
  duration: 6,
  preview: 'Number counts up + reveal label + context fade',
  render: (d) => {
    const C = getTheme(d.theme);
    const num = parseInt(d.number) || 85;
    const isPct = d.is_percent !== false;
    const label = esc(d.label || 'من المسوّقين العرب يستخدمون');
    const labelAccent = esc(d.label_accent || 'AI بشكل خاطئ');
    const context = esc(d.context || 'دراسة شاملة');
    const badge = esc(d.badge || 'RESEARCH · 02');
    const handle = esc(d.handle || C.handle);
    const logo = esc(d.logo || C.logo);
    const dot = d.logo ? '.' : C.logoDot;
    return `${COMMON_HEAD}<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;font-family:'${C.arFont}',sans-serif;direction:rtl;background:#050505;overflow:hidden;}
.stage{width:1080px;height:1350px;background:${C.warmth};color:${C.primary};padding:80px 60px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;}
.bg-ring{position:absolute;top:20%;left:-10%;width:50%;aspect-ratio:1;border:50px solid ${C.signature};border-radius:50%;opacity:0.08;animation:ringFloat 8s ease-in-out infinite;}
@keyframes ringFloat{0%,100%{transform:scale(1) rotate(0);}50%{transform:scale(1.1) rotate(180deg);}}
${CINEMATIC_LAYERS}
.top{display:flex;justify-content:space-between;align-items:center;font-family:'Inter';font-weight:700;font-size:18px;letter-spacing:4px;opacity:0.6;position:relative;z-index:2;}
.top .badge{background:${C.primary};color:${C.warmth};padding:10px 22px;border-radius:100px;font-size:18px;opacity:0;transform:translateX(-20px);animation:badgeIn 0.6s cubic-bezier(.22,.61,.36,1) 0.4s forwards;}
@keyframes badgeIn{to{opacity:1;transform:translateX(0);}}
.stat-area{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center;}
.num-mega{font-family:'Inter';font-weight:900;font-size:380px;line-height:0.9;letter-spacing:-15px;background:linear-gradient(135deg,${C.signature} 0%,${C.primary} 70%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:baseline;}
.num-mega .counter{display:inline-block;opacity:0;animation:numIn 1s cubic-bezier(.22,.61,.36,1) 0.8s forwards;}
@keyframes numIn{to{opacity:1;}}
.num-mega .pct{font-family:'Inter';font-weight:800;font-size:200px;-webkit-text-fill-color:${C.primary};margin-right:-15px;opacity:0;transform:rotate(-90deg) scale(0);animation:pctIn 0.7s cubic-bezier(.5,1.5,.5,1) 3.5s forwards;}
@keyframes pctIn{to{opacity:1;transform:rotate(0) scale(1);}}
.label-area{overflow:hidden;margin-top:40px;padding-bottom:10px;}
.label{font-family:'${C.arFont}';font-weight:900;font-size:64px;line-height:1.25;letter-spacing:-2px;transform:translateY(100%);animation:textUp 0.8s cubic-bezier(.22,.61,.36,1) 4s forwards;}
@keyframes textUp{to{transform:translateY(0);}}
.label .grad{color:${C.signature};position:relative;}
.label .grad::after{content:'';position:absolute;bottom:-5px;left:0;width:0;height:7px;background:${C.signature};animation:underline 0.6s ease 4.8s forwards;}
@keyframes underline{to{width:100%;}}
.context{font-family:'${C.arFont}';font-weight:500;font-size:28px;line-height:1.7;opacity:0;max-width:90%;margin-top:28px;border-right:5px solid ${C.signature};padding-right:24px;transform:translateX(30px);animation:contextIn 0.8s cubic-bezier(.22,.61,.36,1) 5s forwards;}
@keyframes contextIn{to{opacity:0.85;transform:translateX(0);}}
.bottom{position:relative;z-index:2;border-top:2px solid currentColor;padding-top:24px;display:flex;justify-content:space-between;align-items:center;font-family:'Inter';font-weight:800;font-size:18px;letter-spacing:4px;opacity:0;animation:fadeIn 0.6s ease 5.8s forwards;}
@keyframes fadeIn{to{opacity:1;}}
.logo{font-family:'${C.arFont}';font-weight:900;font-size:54px;letter-spacing:${logo.length > 5 ? '4px' : '-3px'};}
.logo .dot{color:${C.signature};}
</style></head><body><div class="stage">
<div class="bg-ring"></div><div class="grain"></div>
<div class="top"><span class="badge">${badge}</span><span>INSIGHTS</span></div>
<div class="stat-area">
<div class="num-mega"><span class="counter" id="cnt" data-target="${num}">0</span>${isPct ? '<span class="pct">%</span>' : ''}</div>
<div class="label-area"><div class="label">${label} <span class="grad">${labelAccent}</span></div></div>
<div class="context">${context}</div>
</div>
<div class="bottom"><span class="logo">${logo}${dot ? '<span class="dot">'+dot+'</span>' : ''}</span><span>${handle}</span></div>
</div>
<script>
(function(){
  const el = document.getElementById('cnt');
  const target = parseInt(el.dataset.target);
  setTimeout(() => {
    const startTime = Date.now(); const duration = 2500;
    const update = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      el.textContent = Math.floor(target * eased);
      if (progress < 1) requestAnimationFrame(update); else el.textContent = target;
    }; update();
  }, 800);
})();
</script></body></html>`;
  }
};

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 3: QUOTE BUILDER (Post)
// ════════════════════════════════════════════════════════════════════
exports.quote = {
  name: 'Cinematic Quote Builder',
  type: 'post',
  size: { width: 1080, height: 1350 },
  duration: 6,
  preview: 'Quote mark bounces + words reveal one by one',
  render: (d) => {
    const C = getTheme(d.theme);
    const quote = esc(d.quote || 'AI لا يحل محل المسوّق — يحل محل المسوّق الذي لا يستخدمه');
    const author = esc(d.author || 'ADEL KH ALHENDAL');
    const handle = esc(d.handle || C.handle);
    const logo = esc(d.logo || C.logo);
    const dot = d.logo ? '.' : C.logoDot;
    const boomFrom = d.boom_from || 'الذي';
    const words = quote.split(/\s+/);
    let foundBoom = false;
    const wordHtml = words.map((w, i) => {
      const isBoom = w.includes(boomFrom) || foundBoom;
      if (w.includes(boomFrom)) foundBoom = true;
      const delay = (1.5 + i * 0.18).toFixed(2);
      return `<span class="word${isBoom ? ' boom' : ''}" style="animation-delay:${delay}s">${w}</span>`;
    }).join(' ');
    const lastDelay = (1.5 + words.length * 0.18 + 0.5).toFixed(2);
    return `${COMMON_HEAD}<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1350px;font-family:'${C.arFont}',sans-serif;direction:rtl;background:#050505;overflow:hidden;}
.stage{width:1080px;height:1350px;background:${C.signature};color:${C.warmth};padding:80px 60px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;}
.stage::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle at 20% 80%,${C.accent}4D,transparent 40%),radial-gradient(circle at 80% 20%,${C.primary}4D,transparent 40%);animation:shift 12s ease-in-out infinite;}
@keyframes shift{50%{background-position:100% 100%;}}
${CINEMATIC_LAYERS}
.top{display:flex;justify-content:space-between;font-family:'Inter';font-weight:700;font-size:20px;letter-spacing:4px;opacity:0;position:relative;z-index:2;animation:fadeIn 0.6s ease 0.3s forwards;}
.mark{font-family:'Inter';font-weight:900;font-size:480px;line-height:0.4;color:${C.accentBright};position:relative;z-index:2;margin-top:50px;opacity:0;transform:scale(0.3) rotate(-15deg);animation:markSpring 1s cubic-bezier(.5,2,.5,1) 0.7s forwards;}
@keyframes markSpring{to{opacity:1;transform:scale(1) rotate(0);}}
.body{position:relative;z-index:2;}
.text{font-family:'${C.arFont}';font-weight:900;font-size:70px;line-height:1.4;letter-spacing:-2px;margin-bottom:50px;}
.word{display:inline-block;opacity:0;transform:translateY(40px) scale(0.95);animation:wordReveal 0.5s cubic-bezier(.22,.61,.36,1) forwards;margin:0 6px;}
@keyframes wordReveal{to{opacity:1;transform:translateY(0) scale(1);}}
.word.boom{color:${C.primary};}
.author-line{display:flex;align-items:center;gap:20px;}
.author-line .line{width:80px;height:3px;background:${C.accentBright};opacity:0;transform:scaleX(0);transform-origin:right;animation:lineScale 0.5s ease ${lastDelay}s forwards;}
@keyframes lineScale{to{opacity:1;transform:scaleX(1);}}
.author{font-family:'Inter';font-weight:800;font-size:22px;letter-spacing:5px;opacity:0;transform:translateX(-30px);animation:authorIn 0.6s cubic-bezier(.22,.61,.36,1) ${lastDelay}s forwards;}
@keyframes authorIn{to{opacity:1;transform:translateX(0);}}
.bottom-line{display:flex;justify-content:space-between;align-items:center;font-family:'Inter';font-size:18px;font-weight:800;letter-spacing:4px;padding-top:24px;border-top:2px solid currentColor;opacity:0;animation:fadeIn 0.6s ease ${(parseFloat(lastDelay) + 0.6).toFixed(2)}s forwards;position:relative;z-index:2;}
@keyframes fadeIn{to{opacity:1;}}
.logo{font-family:'${C.arFont}';font-weight:900;font-size:52px;letter-spacing:${logo.length > 5 ? '3px' : '-3px'};}
.logo .dot{color:${C.primary};}
</style></head><body><div class="stage">
<div class="grain"></div>
<div class="top"><span>QUOTE</span><span>03</span></div>
<div class="mark">"</div>
<div class="body">
<div class="text">${wordHtml}</div>
<div class="author-line"><div class="line"></div><div class="author">${author}</div></div>
</div>
<div class="bottom-line"><span class="logo">${logo}${dot ? '<span class="dot">'+dot+'</span>' : ''}</span><span>${handle}</span></div>
</div></body></html>`;
  }
};

// ════════════════════════════════════════════════════════════════════
// TEMPLATE 4: TIP STORY (9:16)
// ════════════════════════════════════════════════════════════════════
exports.tip = {
  name: 'Cinematic Tip Story',
  type: 'story',
  size: { width: 1080, height: 1920 },
  duration: 5,
  preview: 'Eyebrow → title words flip in → body fades',
  render: (d) => {
    const C = getTheme(d.theme);
    const eyebrow = esc(d.eyebrow || '💡 TIP');
    const title = d.title || '٣ prompts غيّرت طريقتي في التسويق';
    const accentWords = (d.accent_words || []).map(w => String(w).toLowerCase());
    const body = esc(d.body || 'احفظ هذي');
    const highlight = esc(d.highlight || '');
    const handle = esc(d.handle || C.handle);
    const logo = esc(d.logo || C.logo);
    const dot = d.logo ? '.' : C.logoDot;
    const words = title.split(/\s+/);
    const wordHtml = words.map((w, i) => {
      const isAccent = accentWords.some(aw => w.toLowerCase().includes(aw)) || (i % 3 === 1);
      const delay = (0.9 + i * 0.15).toFixed(2);
      return `<span class="w${isAccent ? ' accent' : ''}" style="animation-delay:${delay}s">${esc(w)}</span>`;
    }).join(' ');
    const bodyDelay = (0.9 + words.length * 0.15 + 0.6).toFixed(2);
    const bodyWithHl = (highlight && body.includes(highlight)) ? body.replace(highlight, `<span class="highlight">${highlight}</span>`) : body;
    return `${COMMON_HEAD}<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1080px;height:1920px;font-family:'${C.arFont}',sans-serif;direction:rtl;background:#050505;overflow:hidden;}
.stage{width:1080px;height:1920px;background:linear-gradient(135deg,${C.accent} 0%,${C.accentBright} 100%);color:${C.primary};padding:120px 60px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;}
.stage::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 30%,${C.signature}33,transparent 40%),radial-gradient(circle at 70% 70%,${C.primary}26,transparent 40%);animation:gradFloat 10s ease-in-out infinite;}
@keyframes gradFloat{50%{transform:scale(1.2) rotate(180deg);}}
.arc-deco{position:absolute;top:-10%;right:-15%;width:60%;aspect-ratio:1;border:6px solid ${C.signature};border-radius:50%;opacity:0.15;animation:arcSpin 20s linear infinite;}
@keyframes arcSpin{to{transform:rotate(360deg);}}
${CINEMATIC_LAYERS}
.eyebrow{position:relative;z-index:2;font-family:'Inter';font-weight:700;font-size:22px;letter-spacing:5px;color:${C.primary};margin-bottom:80px;padding:14px 32px;background:${C.primary}1A;border-radius:100px;border:2px solid ${C.primary}33;opacity:0;transform:translateY(-30px) scale(0.8);animation:eyebrowIn 0.8s cubic-bezier(.5,1.5,.5,1) 0.3s forwards;}
@keyframes eyebrowIn{to{opacity:1;transform:translateY(0) scale(1);}}
.title{position:relative;z-index:2;font-family:'${C.arFont}';font-weight:900;font-size:120px;line-height:1.25;letter-spacing:-4px;margin-bottom:80px;max-width:95%;}
.w{display:inline-block;opacity:0;transform:translateY(60px) rotateX(-90deg);animation:wordFlip 0.6s cubic-bezier(.22,.61,.36,1) forwards;transform-origin:bottom;margin:0 8px;}
@keyframes wordFlip{to{opacity:1;transform:translateY(0) rotateX(0);}}
.w.accent{color:${C.signature};text-shadow:0 0 50px ${C.signature}80;}
.body{position:relative;z-index:2;font-family:'${C.arFont}';font-weight:500;font-size:42px;line-height:1.7;max-width:80%;opacity:0;transform:translateY(50px);animation:bodyIn 0.8s cubic-bezier(.22,.61,.36,1) ${bodyDelay}s forwards;}
@keyframes bodyIn{to{opacity:0.85;transform:translateY(0);}}
.highlight{background:${C.signature};color:${C.warmth};padding:4px 16px;border-radius:12px;}
.footer{position:absolute;bottom:60px;left:60px;right:60px;display:flex;justify-content:space-between;font-family:'Inter';font-weight:800;font-size:22px;letter-spacing:4px;padding-top:24px;border-top:2px solid ${C.primary};opacity:0;animation:fadeIn 0.6s ease ${(parseFloat(bodyDelay) + 0.8).toFixed(2)}s forwards;}
@keyframes fadeIn{to{opacity:1;}}
.logo{font-family:'${C.arFont}';font-weight:900;font-size:48px;letter-spacing:${logo.length > 5 ? '2px' : '-2px'};}
.logo .dot{color:${C.signature};}
</style></head><body><div class="stage">
<div class="arc-deco"></div><div class="grain"></div>
<div class="eyebrow">${eyebrow}</div>
<div class="title">${wordHtml}</div>
<div class="body">${bodyWithHl}</div>
<div class="footer"><span class="logo">${logo}${dot ? '<span class="dot">'+dot+'</span>' : ''}</span><span>${handle}</span></div>
</div></body></html>`;
  }
};

// Expose themes for reference
exports._themes = BRAND_THEMES;
