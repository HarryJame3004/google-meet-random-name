/**
 * Meet Random Picker - StudentManager
 * Handles participant list sync, deduplication, host exclusion, and state notifications.
 */

class StudentManager {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.currentStudents = new Map();
    this.excludeHost = options.excludeHost !== undefined ? options.excludeHost : true;
    this.debug = Boolean(options.debug);
    this.listeners = [];
  }

  setExcludeHost(exclude) {
    this.excludeHost = Boolean(exclude);
    this.reapplyHostExclusion();
  }

  setDebug(debug) {
    this.debug = Boolean(debug);
    this.engine.setDebug(debug);
  }

  log(...args) {
    if (this.debug) {
      console.log('[MeetRandom:StudentManager]', ...args);
    }
  }

  subscribe(cb) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }

  notify() {
    const students = Array.from(this.currentStudents.values());
    const counts = this.engine.getCounts();
    for (const cb of this.listeners) {
      cb(students, counts);
    }
  }

  syncFromRawParticipants(rawList) {
    const seenMap = new Map();

    for (const raw of rawList) {
      const cleanName = this.sanitizeName(raw.name);
      if (!cleanName) continue;

      let id = raw.id;
      if (!id) {
        id = `student_${cleanName.toLowerCase().replace(/[\s\W]+/g, '_')}`;
      }

      if (seenMap.has(id)) {
        let suffix = 2;
        while (seenMap.has(`${id}_${suffix}`)) {
          suffix++;
        }
        id = `${id}_${suffix}`;
      }

      const isHost = Boolean(raw.isHost || this.isHostName(raw.name));

      seenMap.set(id, {
        id,
        name: cleanName,
        isHost,
        avatar: raw.avatarUrl,
        joinedAt: this.currentStudents.get(id)?.joinedAt || Date.now(),
      });
    }

    const updatedList = Array.from(seenMap.values());
    this.currentStudents = seenMap;

    this.engine.initialize(updatedList, true);
    this.reapplyHostExclusion();
    this.notify();
  }

  reapplyHostExclusion() {
    for (const s of this.currentStudents.values()) {
      if (s.isHost) {
        if (this.excludeHost) {
          this.engine.exclude(s.id);
        } else {
          if (!this.engine.isStudentCalled(s.id)) {
            this.engine.include(s.id);
          }
        }
      }
    }
  }

  sanitizeName(raw) {
    if (!raw) return '';
    let name = raw.trim();
    name = name.replace(/\((You|Bạn|Presentation|Trình bày|Host|Chủ trì cuộc họp|Co-host|Đồng chủ trì)\)/gi, '');
    name = name.replace(/\s+/g, ' ').trim();

    if (this.isUiStopword(name)) {
      return '';
    }
    return name;
  }

  isHostName(raw) {
    return /\((Host|Chủ trì cuộc họp|Co-host|Đồng chủ trì)\)/i.test(raw);
  }

  isUiStopword(text) {
    const lower = text.toLowerCase();
    const stopWords = [
      'people', 'mọi người', 'chat', 'trò chuyện', 'turn on microphone', 'bật micrô',
      'turn off microphone', 'tắt micrô', 'turn on camera', 'bật máy ảnh',
      'turn off camera', 'tắt máy ảnh', 'present now', 'trình bày ngay',
      'raise hand', 'giơ tay', 'lower hand', 'hạ tay', 'more options', 'tùy chọn khác',
      'leave call', 'rời khỏi cuộc gọi', 'meeting details', 'chi tiết cuộc họp',
      'captions', 'phụ đề', 'info', 'thông tin', 'participants', 'người tham gia',
      'add people', 'thêm người', 'host controls', 'quyền kiểm soát của chủ phòng',
    ];
    return stopWords.some((sw) => lower === sw || lower.startsWith(sw + ' '));
  }

  toggleManualExclude(studentId) {
    if (this.engine.isStudentExcluded(studentId)) {
      this.engine.include(studentId);
    } else {
      this.engine.exclude(studentId);
    }
    this.notify();
  }

  getStudents() {
    return Array.from(this.currentStudents.values());
  }

  getEngine() {
    return this.engine;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StudentManager };
}
