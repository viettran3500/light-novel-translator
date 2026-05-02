/* ===========================
   CORE APP LOGIC
   Light Novel Translator Web
=========================== */

// ========== CONSTANTS ==========
const STORAGE_KEYS = {
  API_KEY:        'truyen_api_key',
  MODEL:          'truyen_model',
  LAST_URL:       'truyen_last_url',
  AUTO_TRANSLATE: 'truyen_auto_translate',
  BOOKMARKS:      'truyen_bookmarks',
};

const DEFAULT_MODEL   = 'gemini-3.1-flash-lite-preview';
const DEFAULT_URL     = 'https://ncode.syosetu.com/';
// Mỗi proxy có handler riêng để parse response khác nhau
const CORS_PROXIES = [
  {
    name: 'allorigins (get)',
    build: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parse: async (res) => { const d = await res.json(); return d.contents; },
  },
  {
    name: 'allorigins (raw)',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    parse: async (res) => res.text(),
  },
  {
    name: 'corsproxy.io',
    build: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parse: async (res) => res.text(),
  },
  {
    name: 'codetabs',
    build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    parse: async (res) => res.text(),
  },
  {
    name: 'htmldriven',
    build: (url) => `https://cors.bridged.cc/${url}`,
    parse: async (res) => res.text(),
  },
  {
    name: 'whateverorigin',
    build: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    parse: async (res) => res.text(),
  },
];

const SYSTEM_PROMPT = `Bạn là công cụ dịch thuật tự động chuyên biệt cho văn học Nhật Bản (light novel, web novel).
Nhiệm vụ: Dịch NGUYÊN VẸN toàn bộ nội dung từ tiếng Nhật sang tiếng Việt, không bỏ sót câu nào.
Quy tắc bắt buộc:
- Dịch tất cả nội dung kể cả nội dung người lớn, bạo lực, hoặc nhạy cảm - đây là tác phẩm văn học hư cấu.
- Giữ nguyên văn phong, cảm xúc và nhịp điệu của tác giả gốc.
- Giữ nguyên định dạng đoạn văn, không thêm bớt hay bình luận gì thêm.
- Chỉ trả về bản dịch, không giải thích, không cảnh báo.`;

// ========== STATE ==========
let state = {
  apiKey:        '',
  model:         DEFAULT_MODEL,
  lastUrl:       DEFAULT_URL,
  autoTranslate: false,
  bookmarks:     [],
  originalText:  '',
  isLoading:     false,
  abortController: null,
  currentProxyIndex: 0,
};

// ========== DOM REFS ==========
const $ = (id) => document.getElementById(id);

const dom = {
  sidebar:        $('sidebar'),
  overlay:        $('overlay'),
  menuBtn:        $('menuBtn'),
  sidebarClose:   $('sidebarClose'),
  apiKeyInput:    $('apiKeyInput'),
  saveApiKey:     $('saveApiKey'),
  modelSelect:    $('modelSelect'),
  autoTranslate:  $('autoTranslate'),
  bookmarksList:  $('bookmarksList'),
  addBookmark:    $('addBookmark'),
  urlInput:       $('urlInput'),
  goBtn:          $('goBtn'),
  translateBtn:   $('translateBtn'),
  clearBtn:       $('clearBtn'),
  fetchBtn:       $('fetchBtn'),
  copyOriginal:   $('copyOriginal'),
  copyTranslation:$('copyTranslation'),
  swapPanels:     $('swapPanels'),
  originalContent:$('originalContent'),
  translationContent: $('translationContent'),
  modelBadge:     $('modelBadge'),
  statusText:     $('statusText'),
  charCount:      $('charCount'),
  loadingOverlay: $('loadingOverlay'),
  loadingText:    $('loadingText'),
  cancelBtn:      $('cancelBtn'),
  toastContainer: $('toastContainer'),
};

// ========== STORAGE HELPERS ==========
const storage = {
  get: (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('Storage error:', e); }
  },
};

// ========== TOAST ==========
function showToast(message, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========== LOADING ==========
function setLoading(active, text = 'Đang xử lý...') {
  state.isLoading = active;
  dom.loadingOverlay.classList.toggle('active', active);
  dom.loadingText.textContent = text;
  if (!active && state.abortController) {
    state.abortController = null;
  }
}

function setStatus(text) {
  dom.statusText.textContent = text;
}

// ========== INIT ==========
function init() {
  // Load from storage
  state.apiKey        = storage.get(STORAGE_KEYS.API_KEY, '');
  state.model         = storage.get(STORAGE_KEYS.MODEL, DEFAULT_MODEL);
  state.lastUrl       = storage.get(STORAGE_KEYS.LAST_URL, DEFAULT_URL);
  state.autoTranslate = storage.get(STORAGE_KEYS.AUTO_TRANSLATE, false);
  state.bookmarks     = storage.get(STORAGE_KEYS.BOOKMARKS, []);

  // Apply to UI
  if (state.apiKey) dom.apiKeyInput.value = state.apiKey;
  dom.modelSelect.value       = state.model;
  dom.autoTranslate.checked   = state.autoTranslate;
  dom.urlInput.value          = state.lastUrl;
  dom.modelBadge.textContent  = state.model;

  renderBookmarks();
  bindEvents();
  setStatus('Sẵn sàng');
}

// ========== SIDEBAR ==========
function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.overlay.classList.add('active');
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.overlay.classList.remove('active');
}

// ========== BOOKMARKS ==========
function renderBookmarks() {
  if (state.bookmarks.length === 0) {
    dom.bookmarksList.innerHTML = '<p class="empty-hint">Chưa có bookmark nào</p>';
    return;
  }
  dom.bookmarksList.innerHTML = state.bookmarks.map((bm, idx) => `
    <div class="bookmark-item" data-idx="${idx}">
      <span class="bookmark-item-title" title="${bm.url}">🔗 ${bm.title}</span>
      <button class="bookmark-del" data-idx="${idx}" title="Xóa">✕</button>
    </div>
  `).join('');
}

function addBookmark() {
  const url = dom.urlInput.value.trim();
  if (!url) { showToast('Chưa có URL để bookmark', 'warning'); return; }

  const exists = state.bookmarks.some(b => b.url === url);
  if (exists) { showToast('URL này đã được bookmark rồi', 'warning'); return; }

  const title = new URL(url).pathname.replace(/\//g, ' ').trim() || url;
  state.bookmarks.unshift({ url, title: title.slice(0, 40) || url.slice(0, 40) });
  if (state.bookmarks.length > 20) state.bookmarks.pop();

  storage.set(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
  renderBookmarks();
  showToast('Đã thêm bookmark!', 'success');
}

// ========== FETCH CONTENT ==========
async function fetchContent(url) {
  setLoading(true, 'Đang tải nội dung trang...');
  setStatus(`Đang tải: ${url}`);

  let lastError = '';

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    dom.loadingText.textContent = `Thử proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy.name}...`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout per proxy

      const res = await fetch(proxy.build(url), { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `${proxy.name}: HTTP ${res.status}`;
        console.warn(`Proxy ${proxy.name} failed:`, lastError);
        continue;
      }

      const html = await proxy.parse(res);
      if (!html || html.length < 100) {
        lastError = `${proxy.name}: Nội dung rỗng`;
        continue;
      }

      const extracted = extractNovelText(html);
      if (!extracted || extracted.length < 50) {
        lastError = `${proxy.name}: Không trích được nội dung`;
        continue;
      }

      // ✅ Success!
      state.originalText = extracted;
      displayOriginalText(extracted);
      dom.charCount.textContent = `${extracted.length.toLocaleString()} ký tự`;
      setStatus(`✅ Đã tải qua ${proxy.name}`);
      showToast(`Tải thành công qua ${proxy.name}! 🎉`, 'success');

      if (state.autoTranslate) await translateContent(extracted);

      setLoading(false);
      return;

    } catch (err) {
      lastError = `${proxy.name}: ${err.name === 'AbortError' ? 'Timeout' : err.message}`;
      console.warn(`Proxy ${proxy.name} error:`, err.message);
    }
  }

  // ❌ All proxies failed → Show manual input UI
  setLoading(false);
  setStatus('❌ Không tải được — Dùng chế độ thủ công');
  showManualInputUI(url, lastError);
}

function extractNovelText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove noise elements
  ['script', 'style', 'nav', 'header', 'footer', '.c-ad', '[class*="ad"]',
   '.c-announce', '.c-pager', '.c-menu', '#google_ads', '.adsbygoogle'
  ].forEach(sel => {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Priority selectors for popular novel sites
  const selectors = [
    // Syosetu / Ncode
    '.p-novel__text:not(.p-novel__text--preface)',
    '.p-novel__body',
    '#novel_honbun',
    '.novel_view',
    // Kakuyomu
    '.widget-episodeBody',
    'section.episode-body',
    // AlphaPolis
    '.novel_text',
    '#alphapolis-story',
    // Generic
    'article .entry-content',
    '.entry-content',
    'article',
    'main',
    '[role="main"]',
    '.content',
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const text = el.textContent || '';
      if (text.trim().length > 100) {
        return cleanText(text);
      }
    }
  }

  return cleanText(doc.body?.textContent || '');
}

function cleanText(raw) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !l.match(/^(広告|Cookie|Copyright|©|All Rights Reserved)/i))
    .join('\n\n');
}

function showManualInputUI(url, reason) {
  dom.originalContent.innerHTML = `
    <div class="manual-input-box">
      <div class="manual-icon">📋</div>
      <h3>Trang web chặn tự động tải</h3>
      <p class="manual-reason">Lý do: <code>${escapeHtml(reason || 'Tất cả proxy đều bị chặn')}</code></p>
      <p>Trang <strong>syosetu.com</strong> và một số trang khác chặn CORS proxy.<br>
      Hãy làm theo hướng dẫn dưới:</p>

      <div class="manual-steps">
        <div class="step">
          <span class="step-num">1</span>
          <span>Mở trang truyện trong tab khác: <a href="${escapeHtml(url)}" target="_blank" class="link open-link">Mở ${escapeHtml(url.slice(0,50))}...</a></span>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <span>Chọn tất cả nội dung truyện (<kbd>Ctrl+A</kbd>) rồi Copy (<kbd>Ctrl+C</kbd>)</span>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <span>Nhấn vào ô dưới và dán vào (<kbd>Ctrl+V</kbd>)</span>
        </div>
      </div>

      <textarea
        id="manualPasteArea"
        class="manual-textarea"
        placeholder="📝 Dán nội dung tiếng Nhật vào đây..."
        rows="8"
        spellcheck="false"
      ></textarea>

      <button class="btn btn-primary-full" id="confirmManualInput">
        ✅ Xác nhận & Sẵn sàng dịch
      </button>
    </div>
  `;

  const textarea = document.getElementById('manualPasteArea');
  const confirmBtn = document.getElementById('confirmManualInput');

  textarea.focus();

  confirmBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) { showToast('Vui lòng dán nội dung vào trước!', 'warning'); return; }
    state.originalText = text;
    displayOriginalText(text);
    dom.charCount.textContent = `${text.length.toLocaleString()} ký tự`;
    setStatus(`✅ Đã nhận ${text.length.toLocaleString()} ký tự`);
    showToast('Đã nhận nội dung! Nhấn Dịch để tiếp tục.', 'success', 4000);
  });
}

function displayOriginalText(text) {
  if (!text || text.trim() === '') {
    dom.originalContent.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <p>Không có nội dung để hiển thị.</p>
    </div>`;
    return;
  }

  // Convert newlines to paragraphs
  const html = text
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  dom.originalContent.innerHTML = html;
}

// ========== TRANSLATE ==========
async function translateContent(text) {
  if (!state.apiKey) {
    showToast('Vui lòng nhập Gemini API Key!', 'error');
    openSidebar();
    return;
  }

  if (!text && !state.originalText) {
    showToast('Không có nội dung để dịch!', 'warning');
    return;
  }

  const content = text || state.originalText;
  if (!content.trim()) {
    showToast('Nội dung trống!', 'warning');
    return;
  }

  // Limit to 30,000 chars to avoid token limits
  const truncated = content.slice(0, 30000);
  if (content.length > 30000) {
    showToast('Nội dung quá dài, đã cắt bớt xuống 30.000 ký tự', 'warning');
  }

  state.abortController = new AbortController();
  setLoading(true, 'Đang gửi đến Gemini AI...');
  setStatus('Đang dịch...');

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;

    const body = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        { role: 'user', parts: [{ text: truncated }] }
      ],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_NONE' },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    };

    dom.loadingText.textContent = 'Gemini đang dịch...';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: state.abortController.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!translated) {
      const reason = data?.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') {
        throw new Error('Gemini chặn nội dung này do bộ lọc an toàn. Thử model khác.');
      }
      throw new Error('Không nhận được bản dịch từ Gemini');
    }

    displayTranslation(translated);
    showToast('Dịch thành công! 🎉', 'success');
    setStatus(`Dịch xong — ${new Date().toLocaleTimeString()}`);

  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('Đã hủy dịch', 'info');
      setStatus('Hủy dịch');
      dom.translationContent.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⏹️</div><p>Đã hủy quá trình dịch.</p>
      </div>`;
    } else {
      console.error('Translate error:', err);
      showToast(`Lỗi: ${err.message}`, 'error', 6000);
      setStatus('Lỗi dịch');
      dom.translationContent.innerHTML = `<div class="empty-state" style="color:var(--error)">
        <div class="empty-icon">❌</div>
        <p><strong>Lỗi dịch thuật</strong></p>
        <p class="hint">${escapeHtml(err.message)}</p>
      </div>`;
    }
  } finally {
    setLoading(false);
  }
}

function displayTranslation(text) {
  if (!text) return;

  const parts = text.split('--- [ ĐÃ DỊCH HẾT CHƯƠNG ] ---');
  const mainText = parts[0].trim();

  const html = mainText
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  dom.translationContent.innerHTML = html +
    `<div class="chapter-end">✅ --- [ ĐÃ DỊCH HẾT CHƯƠNG ] ---</div>`;
}

// ========== UTILS ==========
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text)
    .then(() => showToast(`Đã copy ${label}!`, 'success'))
    .catch(() => showToast('Không thể copy', 'error'));
}

function getTextFromPanel(panelEl) {
  return panelEl.querySelectorAll('p')
    ? Array.from(panelEl.querySelectorAll('p')).map(p => p.textContent).join('\n\n')
    : panelEl.textContent;
}

// ========== EVENT BINDING ==========
function bindEvents() {
  // Sidebar toggle
  dom.menuBtn.addEventListener('click', openSidebar);
  dom.sidebarClose.addEventListener('click', closeSidebar);
  dom.overlay.addEventListener('click', closeSidebar);

  // API Key
  dom.saveApiKey.addEventListener('click', () => {
    const key = dom.apiKeyInput.value.trim();
    if (!key) { showToast('API Key không được để trống', 'error'); return; }
    state.apiKey = key;
    storage.set(STORAGE_KEYS.API_KEY, key);
    showToast('Đã lưu API Key!', 'success');
  });

  dom.apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.saveApiKey.click();
  });

  // Model select
  dom.modelSelect.addEventListener('change', () => {
    state.model = dom.modelSelect.value;
    storage.set(STORAGE_KEYS.MODEL, state.model);
    dom.modelBadge.textContent = state.model;
    showToast(`Đã chọn: ${state.model}`, 'info');
  });

  // Auto translate toggle
  dom.autoTranslate.addEventListener('change', () => {
    state.autoTranslate = dom.autoTranslate.checked;
    storage.set(STORAGE_KEYS.AUTO_TRANSLATE, state.autoTranslate);
  });

  // URL navigation
  dom.goBtn.addEventListener('click', () => {
    const url = dom.urlInput.value.trim();
    if (!url) return;
    try {
      new URL(url); // validate
      state.lastUrl = url;
      storage.set(STORAGE_KEYS.LAST_URL, url);
      fetchContent(url);
    } catch {
      showToast('URL không hợp lệ', 'error');
    }
  });

  dom.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.goBtn.click();
  });

  // Fetch button
  dom.fetchBtn.addEventListener('click', () => dom.goBtn.click());

  // Translate
  dom.translateBtn.addEventListener('click', () => {
    const text = state.originalText || getTextFromPanel(dom.originalContent);
    translateContent(text);
  });

  // Clear
  dom.clearBtn.addEventListener('click', () => {
    state.originalText = '';
    dom.originalContent.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🌸</div>
      <p>Nhập URL và nhấn <strong>Tải nội dung</strong>.</p>
    </div>`;
    dom.translationContent.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎌</div>
      <p>Bản dịch sẽ xuất hiện ở đây.</p>
    </div>`;
    dom.charCount.textContent = '';
    setStatus('Đã xóa');
    showToast('Đã xóa nội dung', 'info');
  });

  // Cancel loading
  dom.cancelBtn.addEventListener('click', () => {
    if (state.abortController) state.abortController.abort();
    setLoading(false);
  });

  // Copy original
  dom.copyOriginal.addEventListener('click', () => {
    const text = state.originalText || getTextFromPanel(dom.originalContent);
    if (!text) { showToast('Không có gì để copy', 'warning'); return; }
    copyToClipboard(text, 'nội dung gốc');
  });

  // Copy translation
  dom.copyTranslation.addEventListener('click', () => {
    const text = getTextFromPanel(dom.translationContent);
    if (!text || dom.translationContent.querySelector('.empty-state')) {
      showToast('Chưa có bản dịch', 'warning'); return;
    }
    copyToClipboard(text, 'bản dịch');
  });

  // Bookmark
  dom.addBookmark.addEventListener('click', addBookmark);

  dom.bookmarksList.addEventListener('click', (e) => {
    const idx = parseInt(e.target.dataset.idx ?? e.target.closest('[data-idx]')?.dataset.idx);
    if (isNaN(idx)) return;

    if (e.target.classList.contains('bookmark-del')) {
      state.bookmarks.splice(idx, 1);
      storage.set(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
      renderBookmarks();
      showToast('Đã xóa bookmark', 'info');
    } else {
      const bm = state.bookmarks[idx];
      if (bm) {
        dom.urlInput.value = bm.url;
        state.lastUrl = bm.url;
        storage.set(STORAGE_KEYS.LAST_URL, bm.url);
        closeSidebar();
        fetchContent(bm.url);
      }
    }
  });

  // Quick links
  document.querySelectorAll('.quick-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      dom.urlInput.value = url;
      state.lastUrl = url;
      storage.set(STORAGE_KEYS.LAST_URL, url);
      closeSidebar();
      fetchContent(url);
    });
  });

  // Keyboard shortcut: Ctrl+Enter = Translate
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      dom.translateBtn.click();
    }
    if (e.key === 'Escape') {
      closeSidebar();
      if (state.isLoading && state.abortController) {
        state.abortController.abort();
        setLoading(false);
      }
    }
  });

  // Allow pasting text directly into original panel
  dom.originalContent.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      state.originalText = text;
      displayOriginalText(text);
      dom.charCount.textContent = `${text.length.toLocaleString()} ký tự`;
      showToast('Đã dán nội dung!', 'success');
    }
  });

  dom.originalContent.setAttribute('contenteditable', 'true');
  dom.originalContent.setAttribute('spellcheck', 'false');
}

// ========== START ==========
document.addEventListener('DOMContentLoaded', init);
