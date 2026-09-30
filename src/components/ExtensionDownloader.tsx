import React, { useState } from 'react';
import { Download, Check, FolderArchive, Chrome, FileCode, ExternalLink, ShieldCheck } from 'lucide-react';
import JSZip from 'jszip';

export const ExtensionDownloader: React.FC = () => {
  const [isPackaging, setIsPackaging] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownloadZip = async () => {
    setIsPackaging(true);
    setDownloadSuccess(false);

    try {
      const zip = new JSZip();

      // Read extension files directly or pack pre-configured strings
      const manifestContent = `{
  "manifest_version": 3,
  "name": "Meet Random Picker - Gọi ngẫu nhiên học sinh Google Meet",
  "short_name": "MeetRandom",
  "version": "1.0.0",
  "description": "Chrome Extension hỗ trợ giáo viên gọi học sinh ngẫu nhiên trong Google Meet không trùng lặp, tự động nhận diện người tham gia theo thời gian thực.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://meet.google.com/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Meet Random Picker",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*"],
      "js": [
        "core/random-engine.js",
        "core/student-manager.js",
        "content/participant-detector.js",
        "content/meet-widget.js"
      ],
      "css": [
        "content/meet-widget.css"
      ],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "random-pick": {
      "suggested_key": {
        "default": "Alt+Shift+R",
        "mac": "Command+Shift+R"
      },
      "description": "Gọi ngẫu nhiên học sinh tiếp theo"
    },
    "toggle-widget": {
      "suggested_key": {
        "default": "Alt+Shift+W",
        "mac": "Command+Shift+W"
      },
      "description": "Bật/tắt widget nổi trong Google Meet"
    }
  }
}`;

      const serviceWorkerContent = `/**
 * Meet Random Picker - Service Worker (Manifest V3)
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    settings: {
      soundEnabled: true,
      animationEnabled: true,
      excludeHost: true,
      showWidget: true,
      debugMode: false,
    },
  });
  console.log('[MeetRandom] Extension installed.');
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('meet.google.com')) return;

  if (command === 'random-pick') {
    chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_RANDOM_PICK' });
  } else if (command === 'toggle-widget') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_WIDGET' });
  }
});
`;

      const randomEngineContent = `class RandomEngine {
  constructor(options = {}) {
    this.studentsMap = new Map();
    this.availableIds = new Set();
    this.selectedIds = new Set();
    this.excludedIds = new Set();
    this.history = [];
    this.lastSelectedId = null;
    this.debug = Boolean(options.debug);
  }

  initialize(students, preserveSession = true) {
    const newStudentsMap = new Map();
    for (const s of students) {
      if (!s.id || !s.name?.trim()) continue;
      newStudentsMap.set(s.id, { ...s, name: s.name.trim() });
    }

    if (!preserveSession) {
      this.studentsMap = newStudentsMap;
      this.availableIds.clear();
      this.selectedIds.clear();
      this.excludedIds.clear();
      this.history = [];
      this.lastSelectedId = null;

      for (const [id, s] of this.studentsMap) {
        if (!s.isHost) this.availableIds.add(id);
        else this.excludedIds.add(id);
      }
      return;
    }

    const existingIds = new Set(this.studentsMap.keys());
    this.studentsMap = newStudentsMap;

    for (const [id, s] of this.studentsMap) {
      if (!existingIds.has(id)) {
        if (s.isHost) this.excludedIds.add(id);
        else if (!this.selectedIds.has(id) && !this.excludedIds.has(id)) {
          this.availableIds.add(id);
        }
      }
    }

    for (const id of Array.from(this.availableIds)) {
      if (!this.studentsMap.has(id)) this.availableIds.delete(id);
    }
  }

  pick() {
    const available = Array.from(this.availableIds);
    if (available.length === 0) {
      return {
        student: null,
        status: this.selectedIds.size > 0 ? 'ALREADY_COMPLETED' : 'EMPTY',
        remainingCount: 0,
        totalCount: this.getEligibleCount(),
        calledCount: this.selectedIds.size,
      };
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const chosenId = available[randomIndex];

    this.availableIds.delete(chosenId);
    this.selectedIds.add(chosenId);
    this.lastSelectedId = chosenId;

    const chosenStudent = this.studentsMap.get(chosenId);
    this.history.push({ studentId: chosenId, timestamp: Date.now() });

    return {
      student: chosenStudent,
      status: 'SUCCESS',
      remainingCount: this.availableIds.size,
      totalCount: this.getEligibleCount(),
      calledCount: this.selectedIds.size,
    };
  }

  exclude(id) {
    if (!this.studentsMap.has(id)) return false;
    this.availableIds.delete(id);
    this.excludedIds.add(id);
    return true;
  }

  include(id) {
    if (!this.studentsMap.has(id)) return false;
    this.excludedIds.delete(id);
    if (!this.selectedIds.has(id)) {
      this.availableIds.add(id);
      return true;
    }
    return false;
  }

  reset() {
    this.selectedIds.clear();
    this.history = [];
    this.lastSelectedId = null;
    this.availableIds.clear();
    for (const [id] of this.studentsMap) {
      if (!this.excludedIds.has(id)) this.availableIds.add(id);
    }
  }

  hasRemaining() {
    return this.availableIds.size > 0;
  }

  getAvailableStudents() {
    return Array.from(this.availableIds).map((id) => this.studentsMap.get(id)).filter(Boolean);
  }

  getCounts() {
    return {
      total: this.studentsMap.size,
      eligible: this.availableIds.size + this.selectedIds.size,
      available: this.availableIds.size,
      called: this.selectedIds.size,
      excluded: this.excludedIds.size,
    };
  }

  getEligibleCount() {
    return this.availableIds.size + this.selectedIds.size;
  }

  isStudentCalled(id) {
    return this.selectedIds.has(id);
  }

  isStudentExcluded(id) {
    return this.excludedIds.has(id);
  }

  getLastSelected() {
    return this.lastSelectedId ? this.studentsMap.get(this.lastSelectedId) || null : null;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { RandomEngine };
`;

      const studentManagerContent = `class StudentManager {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.currentStudents = new Map();
    this.excludeHost = options.excludeHost !== undefined ? options.excludeHost : true;
    this.listeners = [];
  }

  setExcludeHost(val) {
    this.excludeHost = Boolean(val);
    this.reapplyHost();
  }

  syncFromRawParticipants(rawList) {
    const seen = new Map();
    for (const raw of rawList) {
      const name = this.sanitize(raw.name);
      if (!name) continue;
      let id = raw.id || 'std_' + name.toLowerCase().replace(/[\\s\\W]+/g, '_');
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(id + '_' + n)) n++;
        id = id + '_' + n;
      }
      const isHost = Boolean(raw.isHost || /\\((Host|Chủ trì)/i.test(raw.name));
      seen.set(id, { id, name, isHost });
    }
    this.currentStudents = seen;
    this.engine.initialize(Array.from(seen.values()), true);
    this.reapplyHost();
    this.notify();
  }

  reapplyHost() {
    for (const s of this.currentStudents.values()) {
      if (s.isHost) {
        if (this.excludeHost) this.engine.exclude(s.id);
        else if (!this.engine.isStudentCalled(s.id)) this.engine.include(s.id);
      }
    }
  }

  sanitize(raw) {
    if (!raw) return '';
    let name = raw.replace(/\\((You|Bạn|Presentation|Trình bày|Host|Chủ trì cuộc họp)\\)/gi, '').trim();
    name = name.replace(/\\s+/g, ' ').trim();
    const stopWords = ['people', 'mọi người', 'chat', 'trò chuyện', 'turn on', 'turn off', 'microphone', 'bật micrô', 'tắt micrô', 'leave call', 'meeting details', 'captions'];
    const lower = name.toLowerCase();
    if (stopWords.some(sw => lower === sw || lower.startsWith(sw + ' '))) return '';
    return name;
  }

  toggleManualExclude(id) {
    if (this.engine.isStudentExcluded(id)) this.engine.include(id);
    else this.engine.exclude(id);
    this.notify();
  }

  subscribe(cb) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(f => f !== cb); };
  }

  notify() {
    const list = Array.from(this.currentStudents.values());
    const counts = this.engine.getCounts();
    for (const cb of this.listeners) cb(list, counts);
  }

  getStudents() {
    return Array.from(this.currentStudents.values());
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { StudentManager };
`;

      const participantDetectorContent = `class ParticipantDetector {
  constructor(options = {}) {
    this.observer = null;
    this.debounceTimer = null;
    this.heartbeat = null;
    this.status = 'WAITING_FOR_MEET';
    this.listeners = [];
    this.doc = options.doc || document;
  }

  start() {
    this.stop();
    if (!this.isMeet()) {
      this.heartbeat = setInterval(() => { if (this.isMeet()) this.start(); }, 2000);
      return;
    }
    this.scanNow();
    const target = this.doc.body || this.doc.documentElement;
    if (target) {
      this.observer = new MutationObserver(() => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.scanNow(), 300);
      });
      this.observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-participant-id'] });
    }
    this.heartbeat = setInterval(() => this.scanNow(), 4000);
  }

  stop() {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  isMeet() {
    return window.location.hostname === 'meet.google.com' || Boolean(this.doc.querySelector('[data-participant-id], [data-meet-mock]'));
  }

  scanNow() {
    let result = this.scanPeoplePanel();
    if (result.length > 0) return this.emit(result, 'People Panel');
    result = this.scanVideoTiles();
    if (result.length > 0) return this.emit(result, 'Video Grid');
    result = this.scanAria();
    if (result.length > 0) return this.emit(result, 'ARIA List');
  }

  emit(list, layer) {
    this.status = 'CONNECTED';
    for (const fn of this.listeners) fn({ status: 'CONNECTED', participants: list, layerUsed: layer });
  }

  onUpdate(cb) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(f => f !== cb); };
  }

  scanPeoplePanel() {
    const panel = this.doc.querySelector('div[aria-label="People"], div[aria-label="Mọi người"], [data-panel-id="participants"]');
    if (!panel) return [];
    const rows = panel.querySelectorAll('[role="listitem"], div[data-participant-id]');
    const out = [];
    rows.forEach(r => {
      const name = r.querySelector('span[title]')?.getAttribute('title') || r.textContent?.trim();
      if (this.isValid(name)) {
        out.push({ id: r.getAttribute('data-participant-id') || undefined, name, isHost: /host|chủ trì/i.test(r.textContent || '') });
      }
    });
    return out;
  }

  scanVideoTiles() {
    const tiles = this.doc.querySelectorAll('div[data-participant-id], div[data-self-name]');
    const out = [];
    tiles.forEach(t => {
      const name = t.getAttribute('data-self-name') || t.textContent?.trim();
      if (this.isValid(name)) {
        out.push({ id: t.getAttribute('data-participant-id') || undefined, name, isHost: /host|chủ trì/i.test(t.textContent || '') });
      }
    });
    return out;
  }

  scanAria() {
    const items = this.doc.querySelectorAll('[role="listitem"]');
    const out = [];
    items.forEach(it => {
      const aria = it.getAttribute('aria-label');
      if (this.isValid(aria)) out.push({ name: aria, isHost: false });
    });
    return out;
  }

  isValid(s) {
    if (!s || s.length < 2 || s.length > 60) return false;
    const lower = s.toLowerCase();
    if (/^(turn on|turn off|microphone|camera|chat|people|leave|meeting)/.test(lower)) return false;
    return true;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { ParticipantDetector };
`;

      const meetWidgetJs = `(function() {
  if (document.getElementById('meet-random-picker-widget-root')) return;
  const engine = new RandomEngine();
  const manager = new StudentManager(engine, { excludeHost: true });
  const detector = new ParticipantDetector();
  let soundOn = true;

  function beep(freq = 440) {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
  }

  const root = document.createElement('div');
  root.id = 'meet-random-picker-widget-root';
  root.className = 'mrp-floating-container';
  root.innerHTML = \`
    <div class="mrp-card" id="mrpCard">
      <div class="mrp-header" id="mrpDragHeader">
        <div class="mrp-header-title">
          <span>🎓</span> <b>Random Picker</b>
          <span class="mrp-status-badge" id="mrpStatusBadge">0</span>
        </div>
        <div class="mrp-header-actions">
          <button class="mrp-btn-icon" id="mrpBtnSound">🔊</button>
          <button class="mrp-btn-icon" id="mrpBtnCollapse">_</button>
        </div>
      </div>
      <div class="mrp-body" id="mrpBody">
        <div class="mrp-stats-row">
          <span><b id="mrpRem">0</b> còn lại</span> • <span><b id="mrpCal">0</b> đã gọi</span>
        </div>
        <div class="mrp-result-box">
          <div class="mrp-result-label">Học sinh được chọn:</div>
          <div class="mrp-result-name" id="mrpName">— Sẵn sàng —</div>
        </div>
        <button class="mrp-btn-random" id="mrpBtnRandom">🎲 RANDOM HỌC SINH</button>
        <div class="mrp-footer-actions">
          <button class="mrp-btn-subtle" id="mrpReset">🔄 Reset vòng</button>
          <span class="mrp-layer-info" id="mrpLayer">Google Meet</span>
        </div>
      </div>
    </div>
  \`;
  document.body.appendChild(root);

  const rem = document.getElementById('mrpRem');
  const cal = document.getElementById('mrpCal');
  const badge = document.getElementById('mrpStatusBadge');
  const nameBox = document.getElementById('mrpName');
  const btn = document.getElementById('mrpBtnRandom');

  function update() {
    const c = engine.getCounts();
    rem.textContent = c.available;
    cal.textContent = c.called;
    badge.textContent = c.available + ' còn';
  }

  btn.addEventListener('click', async () => {
    if (!engine.hasRemaining()) {
      alert('Đã gọi hết tất cả học sinh!');
      return;
    }
    const avail = engine.getAvailableStudents();
    for (let i = 0; i < 8; i++) {
      nameBox.textContent = avail[Math.floor(Math.random() * avail.length)].name;
      beep(350 + i * 20);
      await new Promise(r => setTimeout(r, 60));
    }
    const res = engine.pick();
    if (res.student) {
      nameBox.textContent = res.student.name;
      beep(523);
      setTimeout(() => beep(659), 100);
      setTimeout(() => beep(784), 200);
    }
    update();
  });

  document.getElementById('mrpReset').addEventListener('click', () => {
    if (confirm('Đặt lại vòng random mới?')) {
      engine.reset();
      nameBox.textContent = '— Sẵn sàng —';
      update();
    }
  });

  document.getElementById('mrpBtnSound').addEventListener('click', () => {
    soundOn = !soundOn;
    document.getElementById('mrpBtnSound').textContent = soundOn ? '🔊' : '🔇';
  });

  detector.onUpdate((e) => {
    manager.syncFromRawParticipants(e.participants);
    update();
  });
  detector.start();
})();
`;

      const meetWidgetCss = `.mrp-floating-container {
  position: fixed;
  bottom: 84px;
  right: 24px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mrp-card {
  width: 270px;
  background: #1e1f22;
  color: #e3e3e3;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.mrp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #2b2d31;
  cursor: grab;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.mrp-header-title { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.mrp-status-badge { background: #22c55e; color: #052e16; font-size: 11px; padding: 1px 6px; border-radius: 99px; font-weight: 700; }
.mrp-btn-icon { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 2px 5px; }
.mrp-body { padding: 14px; }
.mrp-stats-row { display: flex; justify-content: center; gap: 8px; font-size: 12px; color: #9ca3af; margin-bottom: 10px; }
.mrp-stats-row b { color: #38bdf8; }
.mrp-result-box { background: #111214; border-radius: 10px; padding: 10px 6px; text-align: center; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 12px; }
.mrp-result-label { font-size: 10px; color: #9ca3af; margin-bottom: 2px; text-transform: uppercase; }
.mrp-result-name { font-size: 15px; font-weight: 700; color: #fff; }
.mrp-btn-random {
  width: 100%;
  padding: 11px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
}
.mrp-btn-random:hover { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.mrp-footer-actions { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.mrp-btn-subtle { background: none; border: none; color: #9ca3af; font-size: 11px; cursor: pointer; }
.mrp-layer-info { font-size: 10px; color: #6b7280; }
`;

      const popupHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Meet Random Picker</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="app-container">
    <div class="header">
      <div class="brand">🎓 <b>Meet Random Picker</b></div>
    </div>
    <div class="stats">
      <div>Học sinh: <b id="statTot">0</b></div>
      <div>Đã gọi: <b id="statCal" style="color:#22c55e">0</b></div>
      <div>Còn lại: <b id="statRem" style="color:#eab308">0</b></div>
    </div>
    <button id="btnPick" class="btn-main">🎲 RANDOM</button>
    <div class="result-box">
      <div style="font-size:10px;color:#9ca3af">LẦN CHỌN GẦN NHẤT</div>
      <div id="winner" style="font-size:18px;font-weight:bold;color:#fff;margin-top:4px">— Chưa quay —</div>
    </div>
    <div class="actions">
      <button id="btnReset" class="btn-sub">🔄 Reset vòng</button>
    </div>
    <div class="footer">🟢 Sẵn sàng với Google Meet</div>
  </div>
  <script src="../core/random-engine.js"></script>
  <script src="../core/student-manager.js"></script>
  <script src="popup.js"></script>
</body>
</html>`;

      const popupCss = `body { width: 320px; margin: 0; background: #121316; color: #fff; font-family: sans-serif; }
.app-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding-bottom: 8px; }
.stats { display: flex; justify-content: space-between; background: #1a1c20; padding: 10px; border-radius: 8px; font-size: 12px; }
.btn-main { padding: 14px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-weight: bold; font-size: 14px; cursor: pointer; }
.result-box { background: #1a1c20; padding: 12px; text-align: center; border-radius: 8px; }
.actions { display: flex; justify-content: center; }
.btn-sub { background: none; border: 1px solid #333; color: #9ca3af; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; }
.footer { text-align: center; font-size: 11px; color: #22c55e; border-top: 1px solid #222; padding-top: 8px; }`;

      const popupJs = `document.addEventListener('DOMContentLoaded', () => {
  const engine = new RandomEngine();
  const manager = new StudentManager(engine, { excludeHost: true });
  const tot = document.getElementById('statTot');
  const cal = document.getElementById('statCal');
  const rem = document.getElementById('statRem');
  const winner = document.getElementById('winner');

  function update() {
    const c = engine.getCounts();
    tot.textContent = c.eligible;
    cal.textContent = c.called;
    rem.textContent = c.available;
  }

  // Ask tab content script
  chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATE' }, (res) => {
        if (res?.students) manager.syncFromRawParticipants(res.students);
        if (res?.lastSelected) winner.textContent = res.lastSelected.name;
        update();
      });
    }
  });

  document.getElementById('btnPick').addEventListener('click', () => {
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_RANDOM_PICK' });
    });
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('Đặt lại vòng random?')) {
      engine.reset();
      winner.textContent = '— Sẵn sàng —';
      update();
    }
  });
  update();
});`;

      const readmeMd = `# Meet Random Picker - Chrome Extension
Cài đặt:
1. Mở chrome://extensions
2. Bật "Developer mode" (góc trên bên phải)
3. Bấm "Load unpacked" và chọn thư mục này.
4. Mở Google Meet và nhấn phím Alt+Shift+R hoặc click vào biểu tượng!`;

      // Build folder tree in zip
      zip.file('manifest.json', manifestContent);
      zip.file('README.md', readmeMd);
      zip.file('background/service-worker.js', serviceWorkerContent);
      zip.file('core/random-engine.js', randomEngineContent);
      zip.file('core/student-manager.js', studentManagerContent);
      zip.file('content/participant-detector.js', participantDetectorContent);
      zip.file('content/meet-widget.js', meetWidgetJs);
      zip.file('content/meet-widget.css', meetWidgetCss);
      zip.file('popup/popup.html', popupHtml);
      zip.file('popup/popup.css', popupCss);
      zip.file('popup/popup.js', popupJs);

      // Icon base64 png
      const base64Png =
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdp' +
        'AAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAgKADAAQAAAABAAAAgAAAAAAvpErWAAACd0lE' +
        'QVR4Ae3cMRJCMAxF0eb+h64x6cK5c0d2m0gW706+z/N8nS/Xde0117bW/Lpfn+/4d/j6N0CAAAECBAgQIECAAAEC' +
        'BAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQ' +
        'IECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECA' +
        'AAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAEC' +
        'BAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQ' +
        'IECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECA' +
        'AAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAEC' +
        'BAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQ' +
        'IECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECA' +
        'AAECBAgQIECAAAECBAgQIECAAAECBAgQIPB3gdu2fV7f9wN2T3UvJ+n/bQAAAABJRU5ErkJggg==';

      zip.file('icons/icon-16.png', base64Png, { base64: true });
      zip.file('icons/icon-48.png', base64Png, { base64: true });
      zip.file('icons/icon-128.png', base64Png, { base64: true });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meet-random-picker-v1.0.0.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
    } catch (e) {
      console.error(e);
      alert('Không thể tạo file zip: ' + String(e));
    } finally {
      setIsPackaging(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-2">
      {/* Download Action Banner */}
      <div className="bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 w-fit">
              <Chrome className="w-3.5 h-3.5" />
              <span>Manifest V3 • Sẵn sàng cài vào Chrome</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Tải Bộ Cài Đặt Chrome Extension (.ZIP)
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gói toàn bộ mã nguồn sạch của tiện ích: bao gồm Manifest V3, Content Scripts, Floating Widget, Popup UI,
              Service Worker và các icons chuẩn. Chỉ cần giải nén và tải vào trình duyệt Chrome.
            </p>
          </div>

          <button
            onClick={handleDownloadZip}
            disabled={isPackaging}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-xl shadow-blue-600/30 hover:shadow-blue-600/50 transition transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 shrink-0"
          >
            {downloadSuccess ? (
              <>
                <Check className="w-5 h-5 text-emerald-300" />
                <span>Đã tải thành công!</span>
              </>
            ) : isPackaging ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Đang đóng gói ZIP...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>TẢI EXTENSION (.ZIP)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4-Step Installation Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <Chrome className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">4 Bước Cài Đặt Vào Google Chrome (Dưới 30 Giây)</h3>
            <p className="text-xs text-slate-400">Không cần đưa lên Chrome Web Store, hoạt động cục bộ 100% trên máy tính của bạn.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-black text-sm flex items-center justify-center shrink-0 border border-blue-500/30">
              1
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-white">Giải nén file .ZIP</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sau khi tải về, bấm chuột phải vào file <code className="text-sky-300 bg-slate-900 px-1 py-0.5 rounded">meet-random-picker-v1.0.0.zip</code> và chọn <b>Extract All (Giải nén)</b> thành một thư mục.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-black text-sm flex items-center justify-center shrink-0 border border-blue-500/30">
              2
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-white">Mở trang Extensions của Chrome</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Gõ <code className="text-sky-300 bg-slate-900 px-1 py-0.5 rounded">chrome://extensions</code> vào thanh địa chỉ của Google Chrome và nhấn Enter.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-black text-sm flex items-center justify-center shrink-0 border border-blue-500/30">
              3
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-white">Bật Developer Mode</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ở góc trên cùng bên phải màn hình, bật công tắc <b>Chế độ dành cho nhà phát triển (Developer mode)</b> sang trạng thái BẬT.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-black text-sm flex items-center justify-center shrink-0 border border-blue-500/30">
              4
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-white">Tải tiện ích đã giải nén</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Nhấn vào nút <b>Tải tiện ích đã giải nén (Load unpacked)</b> ở góc trên bên trái, sau đó chọn thư mục đã giải nén ở Bước 1. Hoàn tất!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Package Contents Checklist */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <FolderArchive className="w-4 h-4 text-emerald-400" />
          <span>Cấu Trúc Thư Mục Extension Trong File ZIP</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-slate-300">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>manifest.json (Manifest V3)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>core/random-engine.js (Thuật toán không lặp)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>core/student-manager.js (Đồng bộ & Host)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            <span>content/participant-detector.js (Quét DOM Meet)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-purple-400" />
            <span>content/meet-widget.js & .css (Widget nổi)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-teal-400" />
            <span>popup/popup.html, .js, .css (Giao diện popup)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-rose-400" />
            <span>background/service-worker.js (Phím tắt)</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span>icons/ (icon-16, icon-48, icon-128 png)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
