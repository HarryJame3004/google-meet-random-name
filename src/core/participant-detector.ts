import { ParticipantRaw } from './student-manager.ts';

export type DetectorStatus = 
  | 'WAITING_FOR_MEET'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR';

export interface DetectorEvent {
  status: DetectorStatus;
  participants: ParticipantRaw[];
  layerUsed: string;
  timestamp: number;
  message?: string;
}

export class ParticipantDetector {
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private heartbeatInterval: number | null = null;
  private isScanning: boolean = false;
  private status: DetectorStatus = 'WAITING_FOR_MEET';
  private debug: boolean = false;
  private onUpdateCallbacks: Array<(event: DetectorEvent) => void> = [];
  private lastParticipantsCount: number = 0;
  private documentRef: Document | null = typeof document !== 'undefined' ? document : null;

  constructor(options?: { debug?: boolean; doc?: Document }) {
    this.debug = options?.debug ?? false;
    if (options?.doc) {
      this.documentRef = options.doc;
    }
  }

  public setDebug(debug: boolean): void {
    this.debug = debug;
  }

  public setDocument(doc: Document): void {
    this.documentRef = doc;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[ParticipantDetector]', ...args);
    }
  }

  public onUpdate(cb: (event: DetectorEvent) => void): () => void {
    this.onUpdateCallbacks.push(cb);
    return () => {
      this.onUpdateCallbacks = this.onUpdateCallbacks.filter((c) => c !== cb);
    };
  }

  private emit(event: DetectorEvent): void {
    this.status = event.status;
    for (const cb of this.onUpdateCallbacks) {
      cb(event);
    }
  }

  /**
   * Check if current page is Google Meet or has Google Meet UI
   */
  public isGoogleMeet(): boolean {
    if (typeof window !== 'undefined' && window.location?.href?.includes('meet.google.com')) {
      return true;
    }
    if (!this.documentRef) return false;
    // Also check for mock Meet environment or characteristic meet elements
    const hasMeetUi = !!(
      this.documentRef.querySelector('[data-meet-mock]') ||
      this.documentRef.querySelector('[data-call-ended]') ||
      this.documentRef.querySelector('button[aria-label*="microphone" i]') ||
      this.documentRef.querySelector('button[aria-label*="micrô" i]') ||
      this.documentRef.querySelector('[data-participant-id]')
    );
    return hasMeetUi;
  }

  /**
   * Start observing DOM changes with MutationObserver
   */
  public start(): void {
    this.stop();

    if (!this.isGoogleMeet()) {
      this.log('Not in Google Meet or Meet not ready yet');
      this.emit({
        status: 'WAITING_FOR_MEET',
        participants: [],
        layerUsed: 'none',
        timestamp: Date.now(),
        message: 'Chờ mở phòng Google Meet...',
      });
      // Set a slow polling to check when user joins Meet
      this.heartbeatInterval = window.setInterval(() => {
        if (this.isGoogleMeet()) {
          this.log('Google Meet detected via heartbeat');
          this.start();
        }
      }, 2000);
      return;
    }

    this.emit({
      status: 'SYNCING',
      participants: [],
      layerUsed: 'initializing',
      timestamp: Date.now(),
      message: 'Đang kết nối Google Meet và đồng bộ danh sách...',
    });

    // Run initial scan
    this.scheduleScan(0);

    // Attach MutationObserver to observe DOM changes efficiently
    const targetNode = this.documentRef?.body || this.documentRef?.documentElement;
    if (targetNode) {
      this.observer = new MutationObserver(() => {
        // Debounce to batch mutations into a single run 300ms later
        this.scheduleScan(300);
      });

      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-participant-id', 'class'],
      });
      this.log('MutationObserver attached with debounce 300ms');
    }

    // Safety heartbeat: check every 4 seconds only if needed (e.g. video layout switch)
    this.heartbeatInterval = window.setInterval(() => {
      this.scheduleScan(0);
    }, 4000);
  }

  public stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.log('Detector stopped and disconnected');
  }

  private scheduleScan(delayMs: number): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    if (delayMs === 0) {
      this.scanNow();
      return;
    }
    this.debounceTimer = window.setTimeout(() => {
      this.scanNow();
    }, delayMs);
  }

  /**
   * Run multi-layer scan
   */
  public scanNow(): DetectorEvent {
    if (this.isScanning) {
      return {
        status: this.status,
        participants: [],
        layerUsed: 'in-progress',
        timestamp: Date.now(),
      };
    }

    this.isScanning = true;
    try {
      // LAYER 1: People Side Panel (most authoritative when open)
      let result = this.scanPeoplePanel();
      if (result.length > 0) {
        return this.finishScan(result, 'Layer 1: People Side Panel');
      }

      // LAYER 2: Video Grid Tiles (always visible in grid view)
      result = this.scanVideoTiles();
      if (result.length > 0) {
        return this.finishScan(result, 'Layer 2: Video Grid Tiles');
      }

      // LAYER 3: Semantic ARIA listitem & accessible roles
      result = this.scanAriaListItems();
      if (result.length > 0) {
        return this.finishScan(result, 'Layer 3: Accessible ARIA List Items');
      }

      // LAYER 4: Mock Meet or Custom data attributes
      result = this.scanDataAttributes();
      if (result.length > 0) {
        return this.finishScan(result, 'Layer 4: Data Attributes / Mock Meet');
      }

      // If no participants found, check if we are in Meet
      if (this.isGoogleMeet()) {
        const event: DetectorEvent = {
          status: 'CONNECTED',
          participants: [],
          layerUsed: 'none',
          timestamp: Date.now(),
          message: 'Đã kết nối Meet. Hãy mở bảng "Mọi người" (People) hoặc kiểm tra học sinh đã vào phòng.',
        };
        this.emit(event);
        return event;
      }

      const event: DetectorEvent = {
        status: 'WAITING_FOR_MEET',
        participants: [],
        layerUsed: 'none',
        timestamp: Date.now(),
        message: 'Chờ phòng Google Meet hoạt động.',
      };
      this.emit(event);
      return event;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log('Scan error:', errMsg);
      const event: DetectorEvent = {
        status: 'ERROR',
        participants: [],
        layerUsed: 'error',
        timestamp: Date.now(),
        message: `Lỗi đọc DOM Google Meet: ${errMsg}`,
      };
      this.emit(event);
      return event;
    } finally {
      this.isScanning = false;
    }
  }

  private finishScan(participants: ParticipantRaw[], layer: string): DetectorEvent {
    // Only emit if count changed or status changed to avoid unnecessary re-renders
    const event: DetectorEvent = {
      status: 'CONNECTED',
      participants,
      layerUsed: layer,
      timestamp: Date.now(),
      message: `Đã phát hiện ${participants.length} thành viên (${layer})`,
    };

    if (participants.length !== this.lastParticipantsCount || this.status !== 'CONNECTED') {
      this.log(`Detected ${participants.length} participants using ${layer}`);
      this.lastParticipantsCount = participants.length;
    }

    this.emit(event);
    return event;
  }

  /**
   * LAYER 1: Scan Google Meet People Side Panel
   */
  private scanPeoplePanel(): ParticipantRaw[] {
    const list: ParticipantRaw[] = [];
    if (!this.documentRef) return list;

    const panelCandidates = [
      // Standard Google Meet People panel
      this.documentRef.querySelector('div[aria-label="People"]'),
      this.documentRef.querySelector('div[aria-label="Mọi người"]'),
      this.documentRef.querySelector('div[aria-label*="Participants" i]'),
      this.documentRef.querySelector('div[aria-label*="Người tham gia" i]'),
      this.documentRef.querySelector('[data-tab-id="1"]'),
      this.documentRef.querySelector('[data-panel-id="participants"]'),
    ];

    const panel = panelCandidates.find((el) => el !== null);
    if (!panel) return list;

    // Look for participant rows within panel
    const rowSelectors = [
      '[role="listitem"]',
      'div[data-participant-id]',
      'div[jsname][data-sort-key]',
      '.kv6M9b', // common Meet class for participant item
      '.c3Xv6b',
    ];

    let rows: Element[] = [];
    for (const sel of rowSelectors) {
      const found = Array.from(panel.querySelectorAll(sel));
      if (found.length > 0) {
        rows = found;
        break;
      }
    }

    for (const row of rows) {
      const name = this.extractNameFromRow(row);
      if (name) {
        const id = row.getAttribute('data-participant-id') || 
                   row.getAttribute('data-initial-participant-id') || 
                   undefined;
        const isHost = this.isHostElement(row);
        const avatarEl = row.querySelector('img');
        list.push({
          id,
          name,
          isHost,
          avatarUrl: avatarEl?.src,
        });
      }
    }

    return this.dedupRawList(list);
  }

  /**
   * LAYER 2: Scan Video Grid Tiles in Main View
   */
  private scanVideoTiles(): ParticipantRaw[] {
    const list: ParticipantRaw[] = [];
    if (!this.documentRef) return list;

    // Select video tile wrappers
    const tileSelectors = [
      'div[data-participant-id]',
      'div[data-requested-participant-id]',
      'div[data-self-name]',
      'div[data-allocation-index]',
      '.Gv10fb', // common video tile class
      '.pHsCke',
    ];

    let tiles: Element[] = [];
    for (const sel of tileSelectors) {
      const found = Array.from(this.documentRef.querySelectorAll(sel));
      if (found.length > 0) {
        tiles = found;
        break;
      }
    }

    for (const tile of tiles) {
      // Find participant name badge on video tile (usually in bottom-left or aria-label)
      const name = this.extractNameFromTile(tile);
      if (name) {
        const id = tile.getAttribute('data-participant-id') || undefined;
        const isHost = this.isHostElement(tile);
        const avatarEl = tile.querySelector('img');
        list.push({
          id,
          name,
          isHost,
          avatarUrl: avatarEl?.src,
        });
      }
    }

    return this.dedupRawList(list);
  }

  /**
   * LAYER 3: Scan ARIA List Items
   */
  private scanAriaListItems(): ParticipantRaw[] {
    const list: ParticipantRaw[] = [];
    if (!this.documentRef) return list;

    const items = Array.from(this.documentRef.querySelectorAll('[role="listitem"]'));

    for (const item of items) {
      const ariaLabel = item.getAttribute('aria-label');
      if (ariaLabel && this.looksLikeParticipantName(ariaLabel)) {
        list.push({
          name: ariaLabel,
          isHost: this.isHostElement(item),
        });
        continue;
      }

      // Check text inside item
      const textName = this.extractNameFromRow(item);
      if (textName) {
        list.push({
          name: textName,
          isHost: this.isHostElement(item),
        });
      }
    }

    return this.dedupRawList(list);
  }

  /**
   * LAYER 4: Custom Mock / Test Data Attributes
   */
  private scanDataAttributes(): ParticipantRaw[] {
    const list: ParticipantRaw[] = [];
    if (!this.documentRef) return list;

    const nodes = Array.from(
      this.documentRef.querySelectorAll('[data-participant="true"], [data-student-name], [data-mock-participant]')
    );

    for (const node of nodes) {
      const name = 
        node.getAttribute('data-student-name') ||
        node.getAttribute('data-name') ||
        node.textContent?.trim();

      if (name && this.looksLikeParticipantName(name)) {
        const id = node.getAttribute('data-id') || undefined;
        const isHost = node.getAttribute('data-is-host') === 'true';
        list.push({ id, name, isHost });
      }
    }

    return this.dedupRawList(list);
  }

  /**
   * Extract human name from a row container
   */
  private extractNameFromRow(row: Element): string {
    // 1. Check title attribute or aria-label of child spans
    const nameSpans = row.querySelectorAll('span[title], div[title], [data-name]');
    for (const el of Array.from(nameSpans)) {
      const title = el.getAttribute('title')?.trim();
      if (title && this.looksLikeParticipantName(title)) {
        return title;
      }
    }

    // 2. Direct child text elements
    const textEls = row.querySelectorAll('span, div');
    for (const el of Array.from(textEls)) {
      // Must not be a button, icon or control
      if (el.closest('button') || el.closest('[role="button"]') || el.querySelector('svg')) {
        continue;
      }
      const txt = el.textContent?.trim() || '';
      if (txt && this.looksLikeParticipantName(txt)) {
        return txt;
      }
    }

    return '';
  }

  /**
   * Extract human name from a video tile container
   */
  private extractNameFromTile(tile: Element): string {
    // Direct self-name attribute
    const selfName = tile.getAttribute('data-self-name');
    if (selfName && this.looksLikeParticipantName(selfName)) {
      return selfName;
    }

    // Overlay name badge in video tile (typically span/div with high z-index or bottom-left class)
    const candidates = tile.querySelectorAll('span, div');
    for (const el of Array.from(candidates)) {
      if (el.closest('button') || el.querySelector('svg') || el.children.length > 2) {
        continue;
      }
      const txt = el.textContent?.trim();
      if (txt && this.looksLikeParticipantName(txt)) {
        return txt;
      }
    }

    return '';
  }

  private isHostElement(el: Element): boolean {
    const text = el.textContent || '';
    const aria = el.getAttribute('aria-label') || '';
    const combined = `${text} ${aria}`.toLowerCase();

    return (
      combined.includes('(host)') ||
      combined.includes('(chủ trì cuộc họp)') ||
      combined.includes('meeting host') ||
      combined.includes('chủ phòng') ||
      el.querySelector('[data-is-host="true"]') !== null
    );
  }

  /**
   * Validates if a string is a plausible participant name and not Google Meet UI text
   */
  private looksLikeParticipantName(str: string): boolean {
    if (!str) return false;
    const clean = str.trim();
    if (clean.length < 2 || clean.length > 60) return false;

    // Check stoplist keywords
    const lower = clean.toLowerCase();
    const stopWords = [
      'turn on', 'turn off', 'microphone', 'camera', 'present now', 'raise hand',
      'lower hand', 'chat', 'people', 'more options', 'leave call', 'meeting details',
      'captions', 'mute', 'pin', 'unpin', 'settings', 'visual effects', 'activities',
      'bật micrô', 'tắt micrô', 'bật máy ảnh', 'tắt máy ảnh', 'trình bày ngay',
      'giơ tay', 'hạ tay', 'trò chuyện', 'mọi người', 'tùy chọn khác', 'rời khỏi cuộc gọi',
      'chi tiết cuộc họp', 'phụ đề', 'tắt tiếng', 'gim', 'bỏ ghim', 'cài đặt', 'hoạt động',
      'joined', 'left', 'waiting', 'search', 'tìm kiếm', 'add people', 'thêm người',
    ];

    for (const sw of stopWords) {
      if (lower === sw || lower.startsWith(sw + ' ') || lower.endsWith(' ' + sw)) {
        return false;
      }
    }

    // Must not be a pure number or time format (like "10:30 AM" or "4/5")
    if (/^\d+([:/]\d+)?\s*(am|pm)?$/i.test(lower)) return false;

    // Must contain letters (Vietnamese or Latin or other scripts)
    if (!/[\p{L}]/u.test(clean)) return false;

    return true;
  }

  /**
   * Clean duplicates from same scan pass
   */
  private dedupRawList(list: ParticipantRaw[]): ParticipantRaw[] {
    const seen = new Set<string>();
    const out: ParticipantRaw[] = [];

    for (const item of list) {
      const key = (item.id || item.name).trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }

    return out;
  }

  public getStatus(): DetectorStatus {
    return this.status;
  }
}
