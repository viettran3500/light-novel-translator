/* ===========================
   LIGHT NOVEL TRANSLATOR
   Mobile-first Reader App
=========================== */

// ===== CONSTANTS =====
const STORAGE = {
  API_KEY:   'tn_api_key',
  MODEL:     'tn_model',
  LAST_URL:  'tn_last_url',
  BOOKMARKS: 'tn_bookmarks',
  FONT_SIZE: 'tn_font_size',
  DARK_MODE: 'tn_dark_mode',
};

const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_URL   = 'https://ncode.syosetu.com/';
const FONT_MIN = 13, FONT_MAX = 28;

// Link Google Apps Script Proxy cá nhân của bạn (Thay URL này sau khi bạn deploy script)
const MY_GAS_PROXY = 'https://my-proxy-translator.viettranaptx4869.workers.dev';

const SYSTEM_PROMPT = `Bạn là dịch giả chuyên nghiệp về truyện hư cấu (light novel, web novel, doujinshi, tiểu thuyết online) từ tiếng Nhật sang tiếng Việt. Bạn dịch nguyên vẹn nội dung gốc mà không kiểm duyệt, không cắt bỏ, không làm nhẹ bớt các chi tiết 18+ (bao gồm bạo lực, tình dục, kinh dị, mô tả cơ thể, MTL, v.v.) vì đây là tác phẩm hư cấu 100%, không cổ súy hành động ngoài đời thực.
Yêu cầu cụ thể:
1. Dịch chính xác và trung thực với bản gốc:
    - Không lược bỏ mô tả 18+ dù là chi tiết nhạy cảm nhất.
    - Giữ nguyên cách ví von, ẩn dụ, hành động, lời thoại thô tục (nếu có) bằng tiếng Việt tương ứng mức độ.
    - Không thay thế bằng từ ngữ “giảm nhẹ” (trừ khi tác phẩm gốc cố tình làm thế).
2. Tính văn học và nhịp điệu vẫn được bảo đảm:
    - Dịch đúng sắc thái: khi tác giả viết uyển chuyển thì dịch uyển chuyển, khi viết trực diện thì dịch thẳng.
    - Vẫn giữ nhịp điệu, cảm xúc, phong cách kể chuyện của nguyên tác.
3. Xử lý từ ngữ nhạy cảm:
    - Dùng từ ngữ tiếng Việt đúng cấp độ (từ y khoa, từ lóng, suồng sã, tục… tùy theo văn cảnh).
    - Có thể thêm chú thích ngắn trong ngoặc đơn nếu đây là lần đầu xuất hiện thuật ngữ chuyên sâu về giới tính, bạo lực, bệnh lý – chỉ để làm rõ nghĩa, không nhằm giáo dục hay phán xét.
4. Tính nhất quán:
    - Tên riêng / từ mượn vẫn để nguyên hoặc phiên âm.
    - Phân đoạn rõ ràng, xuống dòng đúng chỗ.
5. Cam kết của bản dịch:
    - Bạn hiểu đây là sản phẩm hư cấu dành cho người trưởng thành (18+).
    - Bạn không thêm bớt ý đồ chính trị, tôn giáo hay đạo đức vào bản dịch.
    - Bạn sẽ dịch mà không che giấu bất kỳ chi tiết nào, kể cả những nội dung gây tranh cãi, miễn là trung thành với tác phẩm.`;

const PROXIES = [
  // Ưu tiên GAS Proxy nếu bạn đã cài đặt
  ...(MY_GAS_PROXY ? [{
    name: 'Cloudflare-Cloud-Proxy',
    build: u => `${MY_GAS_PROXY}?url=${encodeURIComponent(u)}`,
    parse: async r => r.text(),
  }] : []),
  {
    name: 'corsproxy.io',
    build: u => `https://corsproxy.io/?${encodeURIComponent(u)}&t=${Date.now()}`,
    parse: async r => r.text(),
  },
  {
    name: 'allorigins-raw',
    build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}&_=${Date.now()}`,
    parse: async r => r.text(),
  },
  {
    name: 'codetabs',
    build: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    parse: async r => r.text(),
  },
  {
    name: 'corsproxy.org',
    build: u => `https://corsproxy.org/?${encodeURIComponent(u)}`,
    parse: async r => r.text(),
  },
  {
    name: 'allorigins-get',
    build: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&_=${Date.now()}`,
    parse: async r => { const d = await r.json(); return d.contents; },
  },
];

// ===== STATE =====
let state = {
  apiKey:    '',
  model:     DEFAULT_MODEL,
  currentUrl: DEFAULT_URL,
  bookmarks: [],
  fontSize:  18,
  darkMode:  true,
  rawText:   '',       // scraped Japanese text
  abortCtrl: null,
  proxyIdx:  0,
};

// ===== DOM =====
const $ = id => document.getElementById(id);
const dom = {
  sidebar:        $('sidebar'),
  overlay:        $('overlay'),
  menuBtn:        $('menuBtn'),
  sidebarClose:   $('sidebarClose'),
  urlInput:       $('urlInput'),
  goBtn:          $('goBtn'),
  apiKeyInput:    $('apiKeyInput'),
  saveApiKey:     $('saveApiKey'),
  modelSelect:    $('modelSelect'),
  fsDown:         $('fsDown'),
  fsUp:           $('fsUp'),
  fsValue:        $('fsValue'),
  darkMode:       $('darkMode'),
  bookmarksList:  $('bookmarksList'),
  addBookmark:    $('addBookmark'),
  novelTitle:     $('novelTitle'),
  chapterNum:     $('chapterNum'),
  translateBtn:   $('translateBtn'),
  welcomeScreen:  $('welcomeScreen'),
  welcomeOpenBtn: $('welcomeOpenBtn'),
  translationContent: $('translationContent'),
  chapterHeader:  $('chapterHeader'),
  chapterBody:    $('chapterBody'),
  chapterEnd:     $('chapterEnd'),
  manualArea:     $('manualArea'),
  manualReason:   $('manualReason'),
  manualLink:     $('manualLink'),
  manualPasteArea:$('manualPasteArea'),
  confirmManual:  $('confirmManual'),
  prevBtn:        $('prevBtn'),
  nextBtn:        $('nextBtn'),
  navChapterLabel:$('navChapterLabel'),
  loadingOverlay: $('loadingOverlay'),
  loadingText:    $('loadingText'),
  cancelBtn:      $('cancelBtn'),
  toastContainer: $('toastContainer'),
  readerArea:     $('readerArea'),
};

// ===== STORAGE =====
const store = {
  get: (k, fb = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ===== TOAST =====
function toast(msg, type = 'info', ms = 3000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  dom.toastContainer.appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ===== LOADING =====
function setLoading(on, text = 'Đang xử lý...') {
  dom.loadingOverlay.classList.toggle('active', on);
  dom.loadingText.textContent = text;
  if (!on) state.abortCtrl = null;
}

// ===== CHAPTER URL HELPERS =====
/**
 * Parse chapter number from URL.
 * Supports: syosetu  /nXXXXX/3/
 *           kakuyomu /works/ID/episodes/EPISODE_ID (no simple increment)
 */
function parseChapterInfo(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);

    // syosetu pattern: /nCODE/NUM/
    if (/syosetu\.com/.test(u.hostname)) {
      const num = parseInt(parts[parts.length - 1]);
      if (!isNaN(num)) return { num, parts, u, type: 'syosetu' };
    }

    // generic: last path segment is a number
    const last = parseInt(parts[parts.length - 1]);
    if (!isNaN(last)) return { num: last, parts, u, type: 'numeric' };

  } catch {}
  return null;
}

function buildChapterUrl(info, delta) {
  const newNum = info.num + delta;
  if (newNum < 1) return null;
  const newParts = [...info.parts];
  newParts[newParts.length - 1] = String(newNum);
  return `${info.u.origin}/${newParts.join('/')}/`;
}

function updateNavButtons(url) {
  const info = parseChapterInfo(url);
  if (info) {
    dom.prevBtn.disabled = info.num <= 1;
    dom.nextBtn.disabled = false;
    dom.navChapterLabel.textContent = `Chương ${info.num}`;
    dom.chapterNum.textContent = `Chương ${info.num}`;
  } else {
    dom.prevBtn.disabled = true;
    dom.nextBtn.disabled = true;
    dom.navChapterLabel.textContent = '—';
    dom.chapterNum.textContent = '';
  }
}

// ===== FETCH CONTENT =====
async function fetchAndTranslate(url) {
  url = url.trim();
  if (!url) return;

  // Validate
  try { new URL(url); } catch { toast('URL không hợp lệ', 'error'); return; }

  // Cancel any ongoing process
  state.abortCtrl?.abort();
  state.abortCtrl = new AbortController();

  state.currentUrl = url;
  store.set(STORAGE.LAST_URL, url);
  dom.urlInput.value = url;
  updateNavButtons(url);

  // Extract novel title from URL
  try {
    const u = new URL(url);
    dom.novelTitle.textContent = u.hostname.replace('www.', '');
  } catch {}

  // Try all proxies
  setLoading(true, 'Đang tải trang...');
  let lastErr = '';

  for (let i = 0; i < PROXIES.length; i++) {
    const idx = (state.proxyIdx + i) % PROXIES.length;
    const p = PROXIES[idx];
    dom.loadingText.textContent = `Thử proxy ${i + 1}/${PROXIES.length}: ${p.name}`;

    try {
      if (i > 0) await new Promise(r => setTimeout(r, 400)); // Delay nhỏ giữa các lần thử

      const proxyAbort = new AbortController();
      const timer = setTimeout(() => proxyAbort.abort(), 10000);

      const onAbort = () => proxyAbort.abort();
      state.abortCtrl.signal.addEventListener('abort', onAbort);

      const res = await fetch(p.build(url), { signal: proxyAbort.signal });
      clearTimeout(timer);
      state.abortCtrl.signal.removeEventListener('abort', onAbort);

      if (state.abortCtrl.signal.aborted) return;

      if (!res.ok) { lastErr = `${p.name}: HTTP ${res.status}`; continue; }

      const html = await p.parse(res);
      if (!html || html.length < 100) { lastErr = `${p.name}: Nội dung rỗng`; continue; }

      const text = extractText(html, url);
      const title = extractTitle(html);
      if (!text || text.length < 50) { lastErr = `${p.name}: Không trích được nội dung`; continue; }

      state.rawText = text;
      state.proxyIdx = idx; // SUCCESS: Start with this one next time
      setLoading(false);

      // Show chapter header info
      dom.chapterHeader.innerHTML = `
        <div>${new URL(url).hostname}</div>
        <h1>${title || 'Chương ' + (parseChapterInfo(url)?.num || '')}</h1>
      `;

      toast(`Đã tải qua ${p.name}`, 'success');
      await doTranslate(text);
      return;

    } catch (e) {
      if (state.abortCtrl.signal.aborted) return;
      lastErr = `${p.name}: ${e.name === 'AbortError' ? 'Timeout' : e.message}`;
    }
  }

  // All proxies failed → manual mode
  setLoading(false);
  showManual(url, lastErr);
}

function extractText(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove noise
  ['script','style','nav','header','footer','.c-ad','.c-pager','.c-menu',
   '.c-announce','[class*="adsbygoogle"]','#google_ads','noscript'
  ].forEach(s => doc.querySelectorAll(s).forEach(el => el.remove()));

  const selectors = [
    '.p-novel__text:not(.p-novel__text--preface)',
    '.p-novel__body',
    '#novel_honbun',
    '.novel_view',
    '.widget-episodeBody',
    'section.episode-body',
    '.novel_text',
    '.entry-content',
    'article',
    'main',
    '[role="main"]',
    '.content',
  ];

  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el && el.textContent.trim().length > 100) {
      return cleanText(el.textContent);
    }
  }
  return cleanText(doc.body?.textContent || '');
}

function extractTitle(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (
    doc.querySelector('.p-novel__title')?.textContent?.trim() ||
    doc.querySelector('h1.novel-title, h1.ep-title, .episode-title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    ''
  );
}

function cleanText(raw) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !/^(広告|Cookie|Copyright|©|All Rights Reserved|ログイン|ブックマーク)/i.test(l))
    .join('\n\n');
}

// ===== MANUAL INPUT =====
function showManual(url, reason) {
  hideAll();
  dom.manualArea.style.display = 'flex';
  dom.manualReason.textContent = reason || 'Tất cả proxy đều bị chặn';
  dom.manualLink.href = url;
  dom.manualLink.textContent = 'Mở ' + url.slice(0, 50) + '...';
  dom.manualPasteArea.value = '';
  dom.manualPasteArea.focus();
}

// ===== TRANSLATE =====
async function doTranslate(text) {
  if (!state.apiKey) {
    toast('Vui lòng nhập Gemini API Key trong menu!', 'error', 5000);
    openSidebar();
    return;
  }

  const truncated = text.slice(0, 32000);
  if (text.length > 32000) toast('Đã cắt bớt nội dung xuống 32.000 ký tự', 'warning');

  state.abortCtrl = new AbortController();
  setLoading(true, 'Gemini đang dịch...');

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: truncated }] }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: state.abortCtrl.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const translated = candidate?.content?.parts?.map(p => p.text).join('') || '';

    if (!translated) {
      const reason = candidate?.finishReason;
      throw new Error(reason === 'SAFETY'
        ? 'Gemini chặn nội dung do vi phạm chính sách an toàn. Hãy thử model khác hoặc URL khác.'
        : 'Không nhận được bản dịch từ AI. Vui lòng thử lại.');
    }

    showTranslation(translated);
    toast('✅ Dịch xong!', 'success');

  } catch (e) {
    setLoading(false);
    if (e.name === 'AbortError') {
      toast('Đã hủy dịch', 'info');
    } else {
      toast(`Lỗi: ${e.message}`, 'error', 6000);
    }
  } finally {
    setLoading(false);
  }
}

function showTranslation(text) {
  hideAll();

  // Loại bỏ các khối code markdown nếu Gemini bao quanh bản dịch
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }

  // Loại bỏ các câu dẫn thừa nếu có
  cleaned = cleaned.replace(/^(Dưới đây là bản dịch|Bản dịch tiếng Việt|Đây là bản dịch):?\s*\n*/i, '');

  dom.translationContent.style.display = 'block';
  dom.chapterEnd.style.display = 'none';

  // Tách đoạn văn linh hoạt hơn
  const paragraphs = cleaned.split(/\n\s*\n/).filter(p => p.trim());

  const html = paragraphs.length > 0
    ? paragraphs.map(p => `<p>${escHtml(p.trim())}</p>`).join('')
    : `<p>${escHtml(cleaned)}</p>`;

  dom.chapterBody.innerHTML = html;
  dom.chapterEnd.style.display = 'block';

  // Cuộn lên đầu vùng đọc
  dom.readerArea.scrollTop = 0;
}

// ===== HELPERS =====
function hideAll() {
  dom.welcomeScreen.style.display = 'none';
  dom.translationContent.style.display = 'none';
  dom.manualArea.style.display = 'none';
}

function escHtml(t) {
  return t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

function applyFontSize(size) {
  state.fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
  document.documentElement.style.setProperty('--reader-size', state.fontSize + 'px');
  dom.fsValue.textContent = state.fontSize;
  store.set(STORAGE.FONT_SIZE, state.fontSize);
}

function applyDarkMode(dark) {
  state.darkMode = dark;
  document.body.classList.toggle('light', !dark);
  store.set(STORAGE.DARK_MODE, dark);
}

// ===== SIDEBAR =====
function openSidebar()  { dom.sidebar.classList.add('open'); dom.overlay.classList.add('active'); }
function closeSidebar() { dom.sidebar.classList.remove('open'); dom.overlay.classList.remove('active'); }

// ===== BOOKMARKS =====
function renderBookmarks() {
  if (!state.bookmarks.length) {
    dom.bookmarksList.innerHTML = '<p class="empty-hint">Chưa có bookmark nào</p>';
    return;
  }
  dom.bookmarksList.innerHTML = state.bookmarks.map((b, i) => `
    <div class="bm-item" data-i="${i}">
      <span class="bm-title" title="${b.url}">🔗 ${b.title}</span>
      <button class="bm-del" data-i="${i}">✕</button>
    </div>
  `).join('');
}

function addBookmark() {
  const url = state.currentUrl;
  if (!url || url === DEFAULT_URL) { toast('Chưa có trang để bookmark', 'warning'); return; }
  if (state.bookmarks.some(b => b.url === url)) { toast('Đã bookmark rồi', 'warning'); return; }

  const info = parseChapterInfo(url);
  const title = (info ? `Chương ${info.num} - ` : '') + new URL(url).hostname;
  state.bookmarks.unshift({ url, title: title.slice(0, 50) });
  if (state.bookmarks.length > 30) state.bookmarks.pop();
  store.set(STORAGE.BOOKMARKS, state.bookmarks);
  renderBookmarks();
  toast('Đã thêm bookmark!', 'success');
}

// ===== INIT =====
function init() {
  state.apiKey    = store.get(STORAGE.API_KEY, '');
  state.model     = store.get(STORAGE.MODEL, DEFAULT_MODEL);
  state.currentUrl= store.get(STORAGE.LAST_URL, DEFAULT_URL);
  state.bookmarks = store.get(STORAGE.BOOKMARKS, []);
  state.fontSize  = store.get(STORAGE.FONT_SIZE, 18);
  state.darkMode  = store.get(STORAGE.DARK_MODE, true);

  if (state.apiKey) dom.apiKeyInput.value = state.apiKey;
  dom.modelSelect.value = state.model;
  dom.urlInput.value    = state.currentUrl;
  dom.darkMode.checked  = state.darkMode;

  applyFontSize(state.fontSize);
  applyDarkMode(state.darkMode);
  renderBookmarks();
  updateNavButtons(state.currentUrl);

  bindEvents();
}

// ===== EVENTS =====
function bindEvents() {
  // Sidebar
  dom.menuBtn.addEventListener('click', openSidebar);
  dom.sidebarClose.addEventListener('click', closeSidebar);
  dom.overlay.addEventListener('click', closeSidebar);
  dom.welcomeOpenBtn.addEventListener('click', openSidebar);

  // API Key
  dom.saveApiKey.addEventListener('click', () => {
    const key = dom.apiKeyInput.value.trim();
    if (!key) { toast('API Key trống', 'error'); return; }
    state.apiKey = key;
    store.set(STORAGE.API_KEY, key);
    toast('Đã lưu API Key ✅', 'success');
  });
  dom.apiKeyInput.addEventListener('keydown', e => e.key === 'Enter' && dom.saveApiKey.click());

  // Model
  dom.modelSelect.addEventListener('change', () => {
    state.model = dom.modelSelect.value;
    store.set(STORAGE.MODEL, state.model);
    toast(`Model: ${state.model}`, 'info');
  });

  // Go button
  dom.goBtn.addEventListener('click', () => {
    const url = dom.urlInput.value.trim();
    if (!url) return;
    closeSidebar();
    fetchAndTranslate(url);
  });
  dom.urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dom.goBtn.click(); }
  });

  // Translate button (re-translate raw text or re-fetch)
  dom.translateBtn.addEventListener('click', () => {
    if (state.rawText) doTranslate(state.rawText);
    else fetchAndTranslate(state.currentUrl);
  });

  // Font size
  dom.fsDown.addEventListener('click', () => applyFontSize(state.fontSize - 1));
  dom.fsUp.addEventListener('click',   () => applyFontSize(state.fontSize + 1));

  // Dark mode
  dom.darkMode.addEventListener('change', () => applyDarkMode(dom.darkMode.checked));

  // Bookmarks
  dom.addBookmark.addEventListener('click', addBookmark);
  dom.bookmarksList.addEventListener('click', e => {
    const i = parseInt(e.target.dataset.i ?? e.target.closest('[data-i]')?.dataset.i);
    if (isNaN(i)) return;
    if (e.target.classList.contains('bm-del')) {
      state.bookmarks.splice(i, 1);
      store.set(STORAGE.BOOKMARKS, state.bookmarks);
      renderBookmarks();
    } else {
      const bm = state.bookmarks[i];
      if (bm) { closeSidebar(); fetchAndTranslate(bm.url); }
    }
  });

  // Quick links
  document.querySelectorAll('.ql-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.urlInput.value = btn.dataset.url;
      closeSidebar();
    });
  });

  // Chapter navigation
  dom.prevBtn.addEventListener('click', () => navigateChapter(-1));
  dom.nextBtn.addEventListener('click', () => navigateChapter(+1));

  // Manual paste confirm
  dom.confirmManual.addEventListener('click', () => {
    const text = dom.manualPasteArea.value.trim();
    if (!text) { toast('Vui lòng dán nội dung vào trước!', 'warning'); return; }
    state.rawText = text;
    hideAll();
    dom.chapterHeader.innerHTML = `<div>Nhập thủ công</div><h1>Nội dung dán</h1>`;
    dom.translationContent.style.display = 'block';
    dom.chapterBody.innerHTML = '';
    doTranslate(text);
  });

  // Cancel
  dom.cancelBtn.addEventListener('click', () => {
    state.abortCtrl?.abort();
    setLoading(false);
    toast('Đã hủy', 'info');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); dom.translateBtn.click(); }
    if (e.key === 'Escape') { closeSidebar(); state.abortCtrl?.abort(); setLoading(false); }
    if (e.key === 'ArrowRight' && !e.target.matches('input,textarea')) navigateChapter(+1);
    if (e.key === 'ArrowLeft'  && !e.target.matches('input,textarea')) navigateChapter(-1);
  });
}

function navigateChapter(delta) {
  const info = parseChapterInfo(state.currentUrl);
  if (!info) { toast('Không xác định được chương', 'warning'); return; }
  const newUrl = buildChapterUrl(info, delta);
  if (!newUrl) { toast('Đã ở chương đầu tiên', 'info'); return; }
  fetchAndTranslate(newUrl);
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
