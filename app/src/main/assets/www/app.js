'use strict';

(() => {
  /* ================= constants ================= */
  const native = window.RangNative || null;
  const OPENROUTER_URL = 'https://openrouter.ai/api/v1/images';
  const OPENROUTER_MODEL = 'black-forest-labs/flux-3-image-klein';
  const FAL_EDIT = 'https://fal.run/fal-ai/qwen-image-edit-2511';
  const FAL_EDIT_LORA = 'https://fal.run/fal-ai/qwen-image-edit-plus-lora';
  const HF = 'https://huggingface.co/';
  const MAX_SIDE = 1536;           // pictures are shrunk to this before upload
  const MAX_EXTRAS = 2;            // Qwen takes 3 pictures in total
  const KEEP_SUFFIX = ' Keep the original manga art style, line art, characters, faces and composition unchanged except for the requested change.';

  // Manga / anime add-ons (LoRAs) for Qwen Image Edit (Apache-2.0 list from
  // PRITHIVSAKTHIUR/Qwen-Image-Edit-2511-LoRAs-Fast-Lazy-Load; each LoRA keeps its own license).
  const LORAS = {
    tone: HF + 'nappa114514/Qwen-Image-Edit-2509-Manga-Tone/resolve/main/tone001.safetensors',
    anime: HF + 'prithivMLmods/Qwen-Image-Edit-2511-Anime/resolve/main/Qwen-Image-Edit-2511-Anime-2000.safetensors',
    photo2anime: HF + 'autoweeb/Qwen-Image-Edit-2509-Photo-to-Anime/resolve/main/Qwen-Image-Edit-2509-Photo-to-Anime_000001000.safetensors',
    angle: HF + 'fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors',
    noir: HF + 'prithivMLmods/Qwen-Image-Edit-2511-Noir-Comic-Book-Panel/resolve/main/Noir-Comic-Book-Panel_20.safetensors',
    sharpen: HF + 'prithivMLmods/Qwen-Image-Edit-2511-Unblur-Upscale/resolve/main/Qwen-Image-Edit-Unblur-Upscale_15.safetensors'
  };

  // id, label, prompt template ({c} = what the user typed), add-on, needs text, keep-style applies, placeholder
  const QUICK = [
    { id: 'custom', label: 'Custom', t: '{c}', lora: null, need: true, keep: true, ph: 'Make her hair red and add a small smile' },
    { id: 'color', label: 'Colorize', t: 'Colorize this manga image with clean, vibrant anime colors. {c}', lora: null, need: false, keep: true, ph: 'Optional: red hair, blue school uniform' },
    { id: 'tone', label: 'Screentone B&W', t: 'Paint with manga tone.', lora: 'tone', need: false, keep: true, ph: 'Nothing to write for this one' },
    { id: 'notext', label: 'Remove text', t: 'Remove all text from the speech bubbles and captions, leaving the bubbles clean and empty.', lora: null, need: false, keep: true, ph: 'Nothing to write for this one' },
    { id: 'p2a', label: 'Photo → anime', t: 'Transform into anime. {c}', lora: 'photo2anime', need: false, keep: false, ph: 'Optional extra detail' },
    { id: 'anime', label: 'Anime style', t: 'Transform into anime. {c}', lora: 'anime', need: false, keep: false, ph: 'Optional extra detail' },
    { id: 'face', label: 'Expression', t: "Change the character's facial expression to {c}. Keep the same character, outfit and pose.", lora: null, need: true, keep: true, ph: 'angry / crying / shy smile / surprised' },
    { id: 'pose', label: 'Pose / action', t: 'Make the character {c}. Keep the same character design, outfit and background.', lora: null, need: true, keep: true, ph: 'sit on the chair / raise his sword / wave her hand' },
    { id: 'angle', label: 'Camera angle', t: '{c}', lora: 'angle', need: false, keep: true, ph: 'Rotate the camera 45 degrees to the left' },
    { id: 'place', label: 'Add extra pictures', t: "Place the characters or objects from the other pictures into the first picture: {c}. Keep the first picture's background, lighting and art style, and draw everyone in the same manga style.", lora: null, need: false, keep: false, ph: 'both sitting on the sofa, talking' },
    { id: 'noir', label: 'Noir panel', t: 'Transform into a noir comic book panel. {c}', lora: 'noir', need: false, keep: false, ph: 'Optional extra detail' },
    { id: 'sharp', label: 'Sharpen', t: 'Unblur and sharpen the image, keeping every detail of the drawing. {c}', lora: 'sharpen', need: false, keep: false, ph: 'Optional extra detail' }
  ];

  const BLOCKED = /\b(nsfw|nude|nudity|naked|topless|bottomless|undress\w*|stripping|striptease|lingerie|underwear|bikini|sex\w*|porn\w*|hentai|ecchi|erotic\w*|explicit|genital\w*|nipples?|breasts?|boobs?|cleavage|seductive|lewd|fetish\w*)\b|नंगा|नंगी|नग्न|सेक्स|अश्लील/i;

  /* ================= helpers ================= */
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const parseJSON = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const dataUrl = (b64, mime) => 'data:' + mime + ';base64,' + b64;
  const splitDataUrl = (u) => {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(u || '');
    return m ? { mime: m[1], b64: m[2] } : null;
  };

  class CancelError extends Error { constructor() { super('cancelled'); this.name = 'CancelError'; } }

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('rangmanga.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('rangmanga.' + key, JSON.stringify(value)); } catch (e) { /* storage off */ }
    }
  };

  /* ================= network (native bridge; fetch fallback for browser tests) ================= */
  const pending = new Map();
  let reqSeq = 0;
  window.__nativeHttpDone = (id, json) => {
    const done = pending.get(id);
    if (!done) return;
    pending.delete(id);
    done(parseJSON(json) || { status: 0, error: 'Bad response from phone' });
  };

  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function request(opts) {
    const method = opts.method || 'GET';
    if (native && typeof native.http === 'function') {
      return new Promise((resolve) => {
        const id = 'r' + (++reqSeq);
        pending.set(id, resolve);
        native.http(JSON.stringify({
          id, method, url: opts.url, headers: opts.headers || {},
          body: opts.body == null ? null : opts.body, binary: !!opts.binary
        }));
      });
    }
    return fetch(opts.url, { method, headers: opts.headers || {}, body: opts.body == null ? undefined : opts.body })
      .then(async (r) => {
        const out = { status: r.status, contentType: r.headers.get('content-type') || '' };
        if (opts.binary && r.ok) out.body = bytesToB64(new Uint8Array(await r.arrayBuffer()));
        else out.body = await r.text();
        return out;
      })
      .catch((e) => ({ status: 0, error: String((e && e.message) || e) }));
  }

  /* ================= local database ================= */
  // pics: every picture (uploads and edits). Gallery shows edits only.
  const db = (() => {
    let opening = null;
    function open() {
      if (!opening) {
        opening = new Promise((resolve, reject) => {
          let req;
          try { req = indexedDB.open('rang-manga', 1); } catch (e) { reject(e); return; }
          req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('full')) d.createObjectStore('full', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('Storage is not available'));
        });
        opening.catch(() => { opening = null; });
      }
      return opening;
    }
    function run(mode, work) {
      return open().then((d) => new Promise((resolve, reject) => {
        const t = d.transaction(['meta', 'full'], mode);
        let result;
        work(t.objectStore('meta'), t.objectStore('full'), (v) => { result = v; });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || new Error('Storage error'));
        t.onabort = () => reject(t.error || new Error('Storage error (phone may be full)'));
      }));
    }
    return {
      put: (meta, full) => run('readwrite', (m, f) => { m.put(meta); f.put(full); }),
      remove: (id) => run('readwrite', (m, f) => { m.delete(id); f.delete(id); }),
      clear: () => run('readwrite', (m, f) => { m.clear(); f.clear(); }),
      meta: (id) => run('readonly', (m, f, set) => { const r = m.get(id); r.onsuccess = () => set(r.result || null); }),
      full: (id) => run('readonly', (m, f, set) => { const r = f.get(id); r.onsuccess = () => set(r.result || null); }),
      list: () => run('readonly', (m, f, set) => {
        const r = m.getAll();
        r.onsuccess = () => set((r.result || []).sort((a, b) => b.created - a.created));
      })
    };
  })();

  /* ================= image helpers ================= */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read the picture'));
      img.src = src;
    });
  }

  function canvasOf(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // Shrinks a picture to MAX_SIDE and returns a JPEG data URL + size.
  async function prepare(src, maxSide) {
    const img = await loadImage(src);
    const s = Math.min(1, (maxSide || MAX_SIDE) / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvasOf(img.naturalWidth * s, img.naturalHeight * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
  }

  async function thumbOf(src) {
    const t = await prepare(src, 360);
    return t.url;
  }

  async function savePicture(src, kind, info) {
    const p = splitDataUrl(src);
    if (!p) throw new Error('Bad picture data');
    const img = await loadImage(src);
    const meta = Object.assign({
      id: uid(), created: Date.now(), kind, thumb: await thumbOf(src),
      w: img.naturalWidth, h: img.naturalHeight
    }, info || {});
    await db.put(meta, { id: meta.id, b64: p.b64, mime: p.mime });
    return meta;
  }

  async function srcOf(id) {
    const full = await db.full(id);
    if (!full) throw new Error('Picture not found');
    return dataUrl(full.b64, full.mime);
  }

  function nearestAspect(w, h) {
    const options = [['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5], ['9:16', 0.5625], ['16:9', 16 / 9]];
    const r = w / h;
    let best = options[0];
    options.forEach((o) => { if (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r))) best = o; });
    return best[0];
  }

  /* ================= engines ================= */
  function apiError(service, res, json) {
    if (res.status === 0) return 'No internet connection. Check your data or Wi-Fi and try again.';
    const raw = json && (json.error && (json.error.message || json.error) || json.detail || json.message);
    const msg = typeof raw === 'string' ? raw : (Array.isArray(raw) && raw[0] && raw[0].msg) || '';
    if (res.status === 401) return 'Your ' + service + ' key is wrong. Check it in Settings.';
    if (res.status === 402 || /balance|credit|insufficient|exhausted/i.test(msg)) {
      return 'Your ' + service + ' account has no credit left. Add a little credit on the ' + service + ' website.';
    }
    if (res.status === 403) return service + ' refused this request' + (msg ? ': ' + msg : '. Check your key and credit.');
    if (/moderat|flagged|safety|nsfw/i.test(msg)) return 'The safety filter blocked this edit. Try a different change.';
    if (res.status === 429) return 'Too many requests right now. Wait a minute and try again.';
    if (res.status >= 500) return service + ' is having trouble right now. Try again in a few minutes.';
    return service + ' error (' + res.status + ')' + (msg ? ': ' + msg : '');
  }

  const engines = {
    klein: {
      name: 'OpenRouter',
      label: 'FLUX 3 Klein',
      keyName: 'openrouter',
      async edit(o, job) {
        const key = store.get('key.openrouter', '');
        if (!key) throw new Error('Add your OpenRouter key in Settings first (one edit costs about $0.008).');
        const body = {
          model: OPENROUTER_MODEL,
          prompt: o.prompt,
          input_references: o.images.map((u) => ({ type: 'image_url', image_url: { url: u } })),
          n: 1,
          aspect_ratio: o.aspect
        };
        if (o.seed) body.seed = o.seed;
        const headers = {
          Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/sanjeevraja091-blip/manga-editor', 'X-Title': 'Rang Manga'
        };
        let res = await request({ method: 'POST', url: OPENROUTER_URL, headers, body: JSON.stringify(body) });
        if (job.cancelled) throw new CancelError();
        let json = parseJSON(res.body);
        if (res.status === 400 && /aspect/i.test(String(res.body || ''))) {
          delete body.aspect_ratio; // some providers do not take aspect_ratio for edits
          res = await request({ method: 'POST', url: OPENROUTER_URL, headers, body: JSON.stringify(body) });
          if (job.cancelled) throw new CancelError();
          json = parseJSON(res.body);
        }
        if (res.status !== 200 || !json) throw new Error(apiError('OpenRouter', res, json));
        const item = json.data && json.data[0];
        if (!item || !item.b64_json) throw new Error('OpenRouter returned no picture. Try again.');
        const cost = json.usage && typeof json.usage.cost === 'number' ? json.usage.cost : null;
        return { src: dataUrl(item.b64_json, item.media_type || 'image/png'), cost, blocked: false };
      }
    },
    qwen: {
      name: 'fal',
      label: 'Qwen Edit 2511',
      keyName: 'fal',
      async edit(o, job) {
        const key = store.get('key.fal', '');
        if (!key) throw new Error('Add your fal key in Settings first (one edit costs about $0.03–0.04).');
        const body = {
          prompt: o.prompt,
          image_urls: o.images,
          num_images: 1,
          enable_safety_checker: true,
          output_format: 'png',
          sync_mode: true,
          acceleration: 'regular'
        };
        if (o.seed) body.seed = o.seed;
        let url = FAL_EDIT;
        if (o.lora) {
          url = FAL_EDIT_LORA;
          body.loras = [{ path: LORAS[o.lora], scale: 1 }];
        }
        const res = await request({
          method: 'POST', url,
          headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (job.cancelled) throw new CancelError();
        const json = parseJSON(res.body);
        if (res.status !== 200 || !json) throw new Error(apiError('fal', res, json));
        const blocked = Array.isArray(json.has_nsfw_concepts) && json.has_nsfw_concepts[0] === true;
        const img = json.images && json.images[0];
        if (!img || !img.url) throw new Error('fal returned no picture. Try again.');
        let src = img.url;
        if (/^https:\/\//.test(src)) {
          const d = await request({ url: src, binary: true });
          if (d.status !== 200 || !d.body) throw new Error('Could not download the picture. Try again.');
          const ct = String(d.contentType || img.content_type || 'image/png').split(';')[0].trim();
          src = dataUrl(d.body, /^image\//.test(ct) ? ct : 'image/png');
        } else if (!/^data:image\//.test(src)) {
          throw new Error('fal returned an unknown picture format.');
        }
        return { src, cost: null, blocked };
      }
    }
  };

  /* ================= state ================= */
  let quickId = store.get('quick', 'custom');
  if (!QUICK.some((q) => q.id === quickId)) quickId = 'custom';
  let engineId = store.get('engine', 'klein') === 'qwen' ? 'qwen' : 'klein';
  let chain = store.get('chain', []);          // picture ids: [original, edit1, edit2, ...]
  let extras = store.get('extras', []);        // picture ids of extra pictures
  let gallery = [];                            // edit metas, newest first
  let job = null;
  let viewerItem = null;
  let currentTab = 'edit';
  const saveChain = () => store.set('chain', chain);
  const saveExtras = () => store.set('extras', extras);

  /* ================= toast / confirm ================= */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
  }
  let sheetResolve = null;
  function askConfirm(text, okLabel) {
    $('sheetText').textContent = text;
    $('sheetOk').textContent = okLabel || 'Delete';
    $('sheet').hidden = false;
    return new Promise((resolve) => { sheetResolve = resolve; });
  }
  function closeSheet(answer) {
    $('sheet').hidden = true;
    if (sheetResolve) { const r = sheetResolve; sheetResolve = null; r(answer); }
  }

  /* ================= edit screen ================= */
  function renderQuick() {
    const box = $('quickChips');
    box.textContent = '';
    QUICK.forEach((q) => {
      const b = el('button', 'chip' + (q.id === quickId ? ' on' : ''), q.label);
      b.type = 'button';
      b.addEventListener('click', () => { quickId = q.id; store.set('quick', quickId); renderQuick(); renderEngineNote(); });
      box.appendChild(b);
    });
    const q = QUICK.find((x) => x.id === quickId);
    $('prompt').placeholder = q.ph;
    $('promptHint').textContent = q.need ? 'English works best' : 'optional';
  }

  function renderEngine() {
    document.querySelectorAll('#engineSeg button').forEach((b) => b.classList.toggle('on', b.dataset.engine === engineId));
    $('engineTag').textContent = engines[engineId].label;
    renderEngineNote();
  }

  function renderEngineNote() {
    const q = QUICK.find((x) => x.id === quickId);
    let note = engineId === 'klein'
      ? 'Fast and cheap. Good at following instructions.'
      : 'Best for manga. Takes 10–40 seconds.';
    if (q.lora && engineId === 'klein') note = '"' + q.label + '" works best with Qwen Edit 2511 (it has a manga add-on for it). Klein will try with the text only.';
    const key = store.get('key.' + engines[engineId].keyName, '');
    if (!key) note += ' Add your ' + engines[engineId].name + ' key in Settings.';
    $('engineNote').textContent = note;
  }

  async function renderStage() {
    const img = $('stageImg');
    const has = chain.length > 0;
    $('stageEmpty').hidden = has;
    img.hidden = !has;
    $('stageBadge').hidden = !has;
    $('toolCompare').disabled = chain.length < 2;
    $('toolUndo').disabled = chain.length < 2;
    $('toolSave').disabled = !has;
    if (!has) { $('stage').style.aspectRatio = '3 / 4'; return; }
    const id = chain[chain.length - 1];
    try {
      const meta = await db.meta(id);
      if (meta && meta.w && meta.h) $('stage').style.aspectRatio = meta.w + ' / ' + meta.h;
      img.src = await srcOf(id);
      $('stageBadge').textContent = chain.length > 1 ? 'Edit ' + (chain.length - 1) : (meta && meta.kind === 'edit' ? 'Starting picture' : 'Original');
    } catch (e) {
      chain = []; saveChain();
      renderStage();
    }
  }

  async function renderExtras() {
    const box = $('extras');
    box.querySelectorAll('.extra').forEach((n) => n.remove());
    const add = $('extraAdd');
    const kept = [];
    for (const id of extras) {
      const meta = await db.meta(id).catch(() => null);
      if (!meta) continue;
      kept.push(id);
      const d = el('div', 'extra');
      const i = el('img'); i.src = meta.thumb; i.alt = '';
      const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove');
      x.addEventListener('click', () => { extras = extras.filter((e) => e !== id); saveExtras(); renderExtras(); });
      d.appendChild(i); d.appendChild(x);
      box.insertBefore(d, add);
    }
    if (kept.length !== extras.length) { extras = kept; saveExtras(); }
    add.hidden = extras.length >= MAX_EXTRAS;
    $('extrasHint').textContent = extras.length ? extras.length + ' of ' + MAX_EXTRAS : 'characters / objects to add';
  }

  function setBusy(busy, title, sub) {
    $('stage').classList.toggle('busy', busy);
    $('progress').hidden = !busy;
    if (busy) { $('progressTitle').textContent = title || 'Editing…'; $('progressSub').textContent = sub || ''; }
    $('genBtn').classList.toggle('cancel', busy);
    $('genLabel').textContent = busy ? 'Cancel' : 'Edit picture';
  }

  function showError(msg) {
    $('stageError').hidden = false;
    $('stageErrorMsg').textContent = msg;
  }

  async function pickMain(file) {
    if (!file) return;
    let url = null;
    try {
      url = URL.createObjectURL(file);
      const p = await prepare(url);
      const meta = await savePicture(p.url, 'upload', {});
      chain = [meta.id];
      saveChain();
      $('stageError').hidden = true;
      await renderStage();
      toast('Picture ready. Write what should change, then tap Edit.');
    } catch (e) {
      toast('Could not open that picture.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      $('fileMain').value = '';
    }
  }

  async function pickExtra(file) {
    if (!file) return;
    let url = null;
    try {
      url = URL.createObjectURL(file);
      const p = await prepare(url, 1024);
      const meta = await savePicture(p.url, 'extra', {});
      extras = extras.concat(meta.id).slice(-MAX_EXTRAS);
      saveExtras();
      await renderExtras();
    } catch (e) {
      toast('Could not open that picture.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      $('fileExtra').value = '';
    }
  }

  function buildPrompt() {
    const q = QUICK.find((x) => x.id === quickId);
    let c = $('prompt').value.trim().replace(/[.\s]+$/, '');
    if (q.need && !c) throw new Error('Write what should change, e.g. "' + q.ph + '".');
    if (q.id === 'angle' && !c) c = q.ph;
    let p = q.t.replace('{c}', c).replace(/\s+/g, ' ').trim();
    if (p && !/[.!?]$/.test(p)) p += '.';
    if (q.keep && $('keepStyle').checked) p += KEEP_SUFFIX;
    return { prompt: p, quick: q };
  }

  async function runEdit() {
    if (job) { cancelJob(); return; }
    if (!chain.length) { $('fileMain').click(); return; }
    let built;
    try { built = buildPrompt(); } catch (e) { toast(e.message); $('prompt').focus(); return; }
    if (BLOCKED.test(built.prompt)) { toast('The safety filter blocked this edit. Try a different change.'); return; }
    const q = built.quick;
    if (q.id === 'place' && !extras.length) { toast('First add the characters under "Extra pictures".'); return; }

    const eng = engines[engineId];
    const thisJob = { cancelled: false };
    job = thisJob;
    $('stageError').hidden = true;
    setBusy(true, 'Sending to ' + eng.label + '…', engineId === 'qwen' ? 'Usually 10–40 seconds' : 'Usually 5–20 seconds');
    try {
      const sourceId = chain[chain.length - 1];
      const source = await srcOf(sourceId);
      const sourceMeta = await db.meta(sourceId);
      const images = [source];
      if (q.id === 'place' || q.id === 'custom') {
        for (const id of extras) images.push(await srcOf(id));
      }
      if (thisJob.cancelled) throw new CancelError();
      setBusy(true, 'Editing with ' + eng.label + '…', engineId === 'qwen' ? 'Usually 10–40 seconds' : 'Usually 5–20 seconds');
      const out = await eng.edit({
        prompt: built.prompt, images, lora: engineId === 'qwen' ? q.lora : null,
        aspect: nearestAspect(sourceMeta ? sourceMeta.w : 3, sourceMeta ? sourceMeta.h : 4), seed: null
      }, thisJob);
      if (thisJob.cancelled) throw new CancelError();
      if (out.blocked) throw new Error('The safety filter blocked this result. Try a different change.');
      const meta = await savePicture(out.src, 'edit', {
        prompt: built.prompt, said: $('prompt').value.trim(), quick: q.label, engine: engineId,
        lora: engineId === 'qwen' ? q.lora : null, parent: sourceId, cost: out.cost
      });
      chain.push(meta.id);
      saveChain();
      gallery.unshift(meta);
      renderGallery();
      await renderStage();
      toast('Done' + (out.cost != null ? ' · cost $' + out.cost.toFixed(4) : '') + '. Write the next change, or Undo.');
    } catch (e) {
      if (!(e instanceof CancelError) && !thisJob.cancelled) showError(e && e.message ? e.message : 'Something went wrong. Please try again.');
    } finally {
      if (job === thisJob) { job = null; setBusy(false); }
    }
  }

  function cancelJob() {
    if (!job) return;
    job.cancelled = true;
    job = null;
    setBusy(false);
    toast('Cancelled');
  }

  async function undo() {
    if (chain.length < 2) return;
    chain.pop();
    saveChain();
    await renderStage();
    toast('Went back one step. The undone edit stays in the Gallery.');
  }

  // Hold the button to see the picture before the last edit.
  function setupCompare() {
    const btn = $('toolCompare');
    let showing = false;
    const show = async (e) => {
      if (btn.disabled || chain.length < 2) return;
      if (e) e.preventDefault();
      showing = true;
      btn.classList.add('holding');
      try {
        $('stageImg').src = await srcOf(chain[chain.length - 2]);
        $('stageBadge').textContent = chain.length === 2 ? 'Original' : 'Edit ' + (chain.length - 2);
      } catch (err) { /* ignore */ }
    };
    const hide = () => {
      if (!showing) return;
      showing = false;
      btn.classList.remove('holding');
      renderStage();
    };
    btn.addEventListener('pointerdown', show);
    btn.addEventListener('pointerup', hide);
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('pointercancel', hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ================= saving / sharing ================= */
  async function jpegOf(id) {
    const src = await srcOf(id);
    const img = await loadImage(src);
    const c = canvasOf(img.naturalWidth, img.naturalHeight);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  }

  async function saveToPhone(id) {
    try {
      const jpeg = await jpegOf(id);
      const name = 'rang-manga-' + id + '.jpg';
      if (native && typeof native.saveImage === 'function') {
        const r = String(native.saveImage(jpeg, 'image/jpeg', name));
        if (r === 'ok') toast('Saved to Pictures › Rang Manga');
        else if (r === 'permission') toast('Allow storage access, then tap Save again.');
        else toast('Could not save: ' + r.replace(/^error:/, ''));
      } else {
        const a = el('a'); a.href = dataUrl(jpeg, 'image/jpeg'); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) { toast('Could not save: ' + e.message); }
  }

  async function shareImage(id) {
    try {
      const jpeg = await jpegOf(id);
      if (native && typeof native.shareImage === 'function') {
        const r = String(native.shareImage(jpeg, 'image/jpeg', 'rang-manga-' + id + '.jpg'));
        if (r !== 'ok') toast('Could not share: ' + r.replace(/^error:/, ''));
      } else {
        toast('Sharing works in the Android app.');
      }
    } catch (e) { toast('Could not share: ' + e.message); }
  }

  /* ================= gallery & viewer ================= */
  function renderGallery() {
    const grid = $('galGrid');
    grid.textContent = '';
    gallery.forEach((m) => {
      const b = el('button', 'tile');
      b.type = 'button';
      const i = el('img'); i.src = m.thumb; i.alt = m.said || m.prompt || ''; i.loading = 'lazy';
      b.appendChild(i);
      b.addEventListener('click', () => openViewer(m));
      grid.appendChild(b);
    });
    $('galEmpty').hidden = gallery.length > 0;
    $('galCount').textContent = gallery.length ? gallery.length + (gallery.length === 1 ? ' picture' : ' pictures') : '';
    $('storageInfo').textContent = gallery.length
      ? gallery.length + (gallery.length === 1 ? ' edited picture is' : ' edited pictures are') + ' kept on this phone.'
      : 'Pictures are kept on this phone.';
  }

  async function openViewer(m) {
    viewerItem = m;
    $('viewer').hidden = false;
    $('viewerImg').src = m.thumb;
    $('viewerPrompt').textContent = m.said || m.prompt || '';
    const parts = [m.quick, m.engine === 'qwen' ? 'Qwen Edit 2511' : 'FLUX 3 Klein'];
    if (m.w && m.h) parts.push(m.w + '×' + m.h);
    if (m.cost != null) parts.push('$' + Number(m.cost).toFixed(4));
    $('viewerMeta').textContent = parts.filter(Boolean).join(' · ');
    $('viewerDate').textContent = new Date(m.created).toLocaleString();
    try {
      const src = await srcOf(m.id);
      if (viewerItem && viewerItem.id === m.id) $('viewerImg').src = src;
    } catch (e) { /* keep thumb */ }
  }

  function closeViewer() {
    $('viewer').hidden = true;
    $('viewerImg').removeAttribute('src');
    viewerItem = null;
  }

  async function editMore(m) {
    chain = [m.id];
    saveChain();
    closeViewer();
    switchTab('edit');
    await renderStage();
    toast('Loaded. Write the next change.');
  }

  async function deleteImage(m) {
    const ok = await askConfirm('Delete this picture from the gallery?', 'Delete');
    if (!ok) return;
    try {
      await db.remove(m.id);
      gallery = gallery.filter((x) => x.id !== m.id);
      if (chain.includes(m.id)) {
        chain = chain.slice(0, chain.indexOf(m.id));
        saveChain();
        await renderStage();
      }
      renderGallery();
      closeViewer();
      toast('Deleted');
    } catch (e) { toast('Could not delete: ' + e.message); }
  }

  /* ================= tabs & back ================= */
  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    $('genBar').hidden = name !== 'edit';
    $('main').scrollTop = 0;
    if (name === 'edit') renderEngineNote();
  }

  window.__onBack = () => {
    if (!$('sheet').hidden) { closeSheet(false); return true; }
    if (!$('viewer').hidden) { closeViewer(); return true; }
    if (currentTab !== 'edit') { switchTab('edit'); return true; }
    return false;
  };

  /* ================= settings ================= */
  const KEY_FIELDS = { openrouter: 'keyOpenrouter', fal: 'keyFal' };
  const KEY_RULES = { openrouter: /^sk-or-[A-Za-z0-9_-]{10,200}$/, fal: /^[A-Za-z0-9_:.-]{16,200}$/ };

  function renderSettings() {
    Object.keys(KEY_FIELDS).forEach((k) => { $(KEY_FIELDS[k]).value = store.get('key.' + k, ''); });
    let version = '1.0';
    try { if (native && typeof native.appVersion === 'function') version = String(native.appVersion()); } catch (e) { /* ignore */ }
    $('aboutText').textContent = 'Rang Manga · version ' + version;
  }

  /* ================= wiring ================= */
  function wire() {
    $('keepStyle').checked = store.get('keep', true) !== false;
    $('keepStyle').addEventListener('change', () => store.set('keep', $('keepStyle').checked));
    $('prompt').value = store.get('draft', '');
    $('prompt').addEventListener('input', () => store.set('draft', $('prompt').value));

    $('stageEmpty').addEventListener('click', () => $('fileMain').click());
    $('toolPick').addEventListener('click', () => $('fileMain').click());
    $('fileMain').addEventListener('change', (e) => pickMain(e.target.files && e.target.files[0]));
    $('extraAdd').addEventListener('click', () => $('fileExtra').click());
    $('fileExtra').addEventListener('change', (e) => pickExtra(e.target.files && e.target.files[0]));
    $('toolUndo').addEventListener('click', undo);
    $('toolSave').addEventListener('click', () => { if (chain.length) saveToPhone(chain[chain.length - 1]); });
    $('stageImg').addEventListener('click', async () => {
      const id = chain[chain.length - 1];
      const m = gallery.find((x) => x.id === id) || await db.meta(id);
      if (m) openViewer(m);
    });
    setupCompare();

    document.querySelectorAll('#engineSeg button').forEach((b) => {
      b.addEventListener('click', () => { engineId = b.dataset.engine; store.set('engine', engineId); renderEngine(); });
    });
    $('genBtn').addEventListener('click', runEdit);
    $('stageErrorOk').addEventListener('click', () => { $('stageError').hidden = true; });

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('viewerClose').addEventListener('click', closeViewer);
    $('vSave').addEventListener('click', () => viewerItem && saveToPhone(viewerItem.id));
    $('vShare').addEventListener('click', () => viewerItem && shareImage(viewerItem.id));
    $('vEdit').addEventListener('click', () => viewerItem && editMore(viewerItem));
    $('vDelete').addEventListener('click', () => viewerItem && deleteImage(viewerItem));
    $('sheetCancel').addEventListener('click', () => closeSheet(false));
    $('sheetOk').addEventListener('click', () => closeSheet(true));
    $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(false); });

    document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
      const i = $(b.dataset.show);
      i.type = i.type === 'password' ? 'text' : 'password';
      b.textContent = i.type === 'password' ? 'Show' : 'Hide';
    }));
    document.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.save;
      const v = $(KEY_FIELDS[k]).value.trim();
      if (!v) { toast('Paste the key first.'); return; }
      if (!KEY_RULES[k].test(v)) { toast('That does not look like a ' + (k === 'fal' ? 'fal' : 'OpenRouter') + ' key.'); return; }
      store.set('key.' + k, v);
      renderEngineNote();
      toast('Key saved on this phone');
    }));
    document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.clear;
      store.set('key.' + k, '');
      $(KEY_FIELDS[k]).value = '';
      renderEngineNote();
      toast('Key removed');
    }));
    $('clearGallery').addEventListener('click', async () => {
      const ok = await askConfirm('Delete all pictures, including the one you are editing? This cannot be undone.', 'Delete all');
      if (!ok) return;
      try {
        await db.clear();
        gallery = []; chain = []; extras = [];
        saveChain(); saveExtras();
        renderGallery(); renderExtras(); renderStage();
        toast('All pictures deleted');
      } catch (e) { toast('Could not delete: ' + e.message); }
    });
  }

  async function init() {
    wire();
    renderQuick();
    renderEngine();
    renderSettings();
    try {
      gallery = (await db.list()).filter((m) => m.kind === 'edit');
    } catch (e) {
      gallery = [];
      toast('Picture storage is not available on this phone.');
    }
    renderGallery();
    await renderExtras();
    await renderStage();
  }

  init();
})();
