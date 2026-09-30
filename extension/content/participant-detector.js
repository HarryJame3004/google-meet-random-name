/**
 * Meet Random Picker - ParticipantDetector (Content Script)
 * Resilient multi-tier DOM scanner with MutationObserver & stoplist protection.
 */

class ParticipantDetector {
  constructor(options = {}) {
    this.debug = Boolean(options.debug);
    this.observer = null;
    this.debounceTimer = null;
    this.heartbeatInterval = null;
    this.isScanning = false;
    this.status = 'WAITING_FOR_MEET';
    this.listeners = [];
    this.lastCount = 0;
    this.doc = options.doc || document;
  }

  setDebug(debug) {
    this.debug = Boolean(debug);
  }

  log(...args) {
    if (this.debug) {
      console.log('[MeetRandom:Detector]', ...args);
    }
  }

  onUpdate(cb) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }

  emit(event) {
    this.status = event.status;
    for (const fn of this.listeners) {
      fn(event);
    }
  }

  isGoogleMeet() {
    return (
      window.location.hostname === 'meet.google.com' ||
      Boolean(this.doc.querySelector('[data-participant-id], [data-meet-mock], [data-tab-id]'))
    );
  }

  start() {
    this.stop();

    if (!this.isGoogleMeet()) {
      this.emit({
        status: 'WAITING_FOR_MEET',
        participants: [],
        layerUsed: 'none',
        message: 'Đang đợi tham gia phòng Google Meet...',
      });

      this.heartbeatInterval = window.setInterval(() => {
        if (this.isGoogleMeet()) {
          this.start();
        }
      }, 2000);
      return;
    }

    this.emit({
      status: 'SYNCING',
      participants: [],
      layerUsed: 'init',
      message: 'Đang kết nối và đồng bộ người tham gia...',
    });

    this.scheduleScan(0);

    const targetNode = this.doc.body || this.doc.documentElement;
    if (targetNode) {
      this.observer = new MutationObserver(() => {
        this.scheduleScan(300);
      });

      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-participant-id', 'class'],
      });
      this.log('MutationObserver active');
    }

    this.heartbeatInterval = window.setInterval(() => {
      this.scheduleScan(0);
    }, 4000);
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleScan(delayMs) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (delayMs === 0) {
      this.scanNow();
      return;
    }
    this.debounceTimer = setTimeout(() => this.scanNow(), delayMs);
  }

  scanNow() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      // Layer 1: People panel
      let result = this.scanPeoplePanel();
      if (result.length > 0) {
        return this.finishScan(result, 'People Panel');
      }

      // Layer 2: Video grid
      result = this.scanVideoTiles();
      if (result.length > 0) {
        return this.finishScan(result, 'Video Grid');
      }

      // Layer 3: ARIA listitem
      result = this.scanAriaListItems();
      if (result.length > 0) {
        return this.finishScan(result, 'ARIA List Items');
      }

      // Layer 4: Custom / Mock
      result = this.scanDataAttributes();
      if (result.length > 0) {
        return this.finishScan(result, 'Data Attributes');
      }

      if (this.isGoogleMeet()) {
        const evt = {
          status: 'CONNECTED',
          participants: [],
          layerUsed: 'none',
          message: 'Đã kết nối Meet. Hãy mở bảng "Mọi người" nếu danh sách chưa hiện.',
        };
        this.emit(evt);
        return evt;
      }
    } catch (err) {
      this.log('Scan error:', err);
    } finally {
      this.isScanning = false;
    }
  }

  finishScan(participants, layer) {
    const evt = {
      status: 'CONNECTED',
      participants,
      layerUsed: layer,
      message: `Đã phát hiện ${participants.length} thành viên (${layer})`,
    };

    if (participants.length !== this.lastCount || this.status !== 'CONNECTED') {
      this.log(`Detected ${participants.length} via ${layer}`);
      this.lastCount = participants.length;
    }

    this.emit(evt);
    return evt;
  }

  scanPeoplePanel() {
    const list = [];
    const panelCandidates = [
      this.doc.querySelector('div[aria-label="People"]'),
      this.doc.querySelector('div[aria-label="Mọi người"]'),
      this.doc.querySelector('div[aria-label*="Participants" i]'),
      this.doc.querySelector('div[aria-label*="Người tham gia" i]'),
      this.doc.querySelector('[data-tab-id="1"]'),
      this.doc.querySelector('[data-panel-id="participants"]'),
    ];

    const panel = panelCandidates.find(Boolean);
    if (!panel) return list;

    const rows = Array.from(panel.querySelectorAll('[role="listitem"], div[data-participant-id], div[jsname][data-sort-key]'));
    for (const row of rows) {
      const name = this.extractNameFromRow(row);
      if (name) {
        const id = row.getAttribute('data-participant-id') || undefined;
        const isHost = this.isHostElement(row);
        list.push({ id, name, isHost });
      }
    }
    return this.dedup(list);
  }

  scanVideoTiles() {
    const list = [];
    const tiles = Array.from(
      this.doc.querySelectorAll('div[data-participant-id], div[data-requested-participant-id], div[data-self-name], .Gv10fb, .pHsCke')
    );

    for (const tile of tiles) {
      const name = this.extractNameFromTile(tile);
      if (name) {
        const id = tile.getAttribute('data-participant-id') || undefined;
        const isHost = this.isHostElement(tile);
        list.push({ id, name, isHost });
      }
    }
    return this.dedup(list);
  }

  scanAriaListItems() {
    const list = [];
    const items = Array.from(this.doc.querySelectorAll('[role="listitem"]'));
    for (const item of items) {
      const aria = item.getAttribute('aria-label');
      if (aria && this.isValidName(aria)) {
        list.push({ name: aria, isHost: this.isHostElement(item) });
      } else {
        const text = this.extractNameFromRow(item);
        if (text) {
          list.push({ name: text, isHost: this.isHostElement(item) });
        }
      }
    }
    return this.dedup(list);
  }

  scanDataAttributes() {
    const list = [];
    const nodes = Array.from(
      this.doc.querySelectorAll('[data-participant="true"], [data-student-name], [data-mock-participant]')
    );
    for (const node of nodes) {
      const name = node.getAttribute('data-student-name') || node.textContent?.trim();
      if (name && this.isValidName(name)) {
        list.push({
          id: node.getAttribute('data-id') || undefined,
          name,
          isHost: node.getAttribute('data-is-host') === 'true',
        });
      }
    }
    return this.dedup(list);
  }

  extractNameFromRow(row) {
    const nameSpans = row.querySelectorAll('span[title], div[title]');
    for (const el of Array.from(nameSpans)) {
      const title = el.getAttribute('title')?.trim();
      if (title && this.isValidName(title)) return title;
    }

    const textEls = row.querySelectorAll('span, div');
    for (const el of Array.from(textEls)) {
      if (el.closest('button') || el.closest('[role="button"]') || el.querySelector('svg')) continue;
      const txt = el.textContent?.trim();
      if (txt && this.isValidName(txt)) return txt;
    }
    return '';
  }

  extractNameFromTile(tile) {
    const selfName = tile.getAttribute('data-self-name');
    if (selfName && this.isValidName(selfName)) return selfName;

    const candidates = tile.querySelectorAll('span, div');
    for (const el of Array.from(candidates)) {
      if (el.closest('button') || el.querySelector('svg') || el.children.length > 2) continue;
      const txt = el.textContent?.trim();
      if (txt && this.isValidName(txt)) return txt;
    }
    return '';
  }

  isHostElement(el) {
    const text = (el.textContent || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    return (
      text.includes('(host)') ||
      text.includes('(chủ trì') ||
      aria.includes('(host)') ||
      aria.includes('(chủ trì') ||
      el.querySelector('[data-is-host="true"]') !== null
    );
  }

  isValidName(str) {
    if (!str) return false;
    const clean = str.trim();
    if (clean.length < 2 || clean.length > 60) return false;

    const lower = clean.toLowerCase();
    const stopWords = [
      'turn on', 'turn off', 'microphone', 'camera', 'present now', 'raise hand',
      'lower hand', 'chat', 'people', 'more options', 'leave call', 'meeting details',
      'captions', 'mute', 'pin', 'settings', 'bật micrô', 'tắt micrô', 'bật máy ảnh',
      'tắt máy ảnh', 'trình bày ngay', 'giơ tay', 'mọi người', 'trò chuyện', 'rời khỏi',
      'chi tiết cuộc họp', 'phụ đề', 'joined', 'left', 'waiting', 'search', 'add people'
    ];

    for (const sw of stopWords) {
      if (lower === sw || lower.startsWith(sw + ' ') || lower.endsWith(' ' + sw)) return false;
    }

    if (/^\d+([:/]\d+)?\s*(am|pm)?$/i.test(lower)) return false;
    if (!/[\p{L}]/u.test(clean)) return false;

    return true;
  }

  dedup(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const key = (item.id || item.name).trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParticipantDetector };
}
