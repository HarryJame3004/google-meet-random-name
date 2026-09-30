import { Student, RandomEngine } from './random-engine.ts';

export interface ParticipantRaw {
  id?: string;
  name: string;
  isHost?: boolean;
  avatarUrl?: string;
}

export interface StudentManagerOptions {
  excludeHost?: boolean;
  debug?: boolean;
}

export class StudentManager {
  private engine: RandomEngine;
  private currentStudents: Map<string, Student> = new Map();
  private excludeHost: boolean = true;
  private debug: boolean = false;
  private onStudentsChangeCallbacks: Array<(students: Student[], counts: { total: number; available: number; called: number }) => void> = [];

  constructor(engine: RandomEngine, options?: StudentManagerOptions) {
    this.engine = engine;
    this.excludeHost = options?.excludeHost ?? true;
    this.debug = options?.debug ?? false;
  }

  public setExcludeHost(exclude: boolean): void {
    if (this.excludeHost === exclude) return;
    this.excludeHost = exclude;
    this.reapplyHostExclusion();
  }

  public setDebug(debug: boolean): void {
    this.debug = debug;
    this.engine.setDebug(debug);
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[StudentManager]', ...args);
    }
  }

  public subscribe(cb: (students: Student[], counts: { total: number; available: number; called: number }) => void): () => void {
    this.onStudentsChangeCallbacks.push(cb);
    return () => {
      this.onStudentsChangeCallbacks = this.onStudentsChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private notify(): void {
    const students = Array.from(this.currentStudents.values());
    const counts = this.engine.getCounts();
    for (const cb of this.onStudentsChangeCallbacks) {
      cb(students, {
        total: counts.total,
        available: counts.available,
        called: counts.called,
      });
    }
  }

  /**
   * Deduplicate raw participants detected from Google Meet.
   * If Google Meet provides stable participant identifiers (like participant-id or email), we use them.
   * If raw name only is provided, we use a normalized key, but if multiple participants share the exact same name,
   * we assign stable disambiguated keys to avoid collapsing two distinct people while avoiding duplicate DOM nodes of the same person.
   */
  public syncFromRawParticipants(rawList: ParticipantRaw[]): void {
    const seenMap = new Map<string, Student>();

    for (const raw of rawList) {
      const cleanName = this.sanitizeName(raw.name);
      if (!cleanName) continue;

      // Determine stable ID
      let id = raw.id;
      if (!id) {
        // Normalize name
        id = `student_${cleanName.toLowerCase().replace(/[\s\W]+/g, '_')}`;
      }

      // Check if this exact ID or name already processed in this batch
      if (seenMap.has(id)) {
        // Disambiguate if truly a distinct participant node
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

    // Determine additions and removals
    const updatedList = Array.from(seenMap.values());
    this.currentStudents = seenMap;

    // Synchronize into RandomEngine
    this.engine.initialize(updatedList, true);

    // Apply host exclusion if setting is enabled
    this.reapplyHostExclusion();

    this.log(`Synchronized ${updatedList.length} participants`);
    this.notify();
  }

  private reapplyHostExclusion(): void {
    for (const s of this.currentStudents.values()) {
      if (s.isHost) {
        if (this.excludeHost) {
          this.engine.exclude(s.id);
        } else {
          // If teacher wants to include host, only include if not already called
          if (!this.engine.isStudentCalled(s.id)) {
            this.engine.include(s.id);
          }
        }
      }
    }
  }

  /**
   * Sanitizes raw text from Google Meet participant tiles/list:
   * Removes "(You)", "(Bạn)", "(Presentation)", "(Trình bày)", "(Host)", etc.
   */
  public sanitizeName(raw: string): string {
    if (!raw) return '';
    let name = raw.trim();

    // Remove common Meet UI parentheticals
    name = name.replace(/\((You|Bạn|Presentation|Trình bày|Host|Chủ trì cuộc họp|Co-host|Đồng chủ trì)\)/gi, '');
    // Clean up multiple spaces
    name = name.replace(/\s+/g, ' ').trim();

    // Check if name is purely UI text
    if (this.isUiStopword(name)) {
      return '';
    }

    return name;
  }

  public isHostName(raw: string): boolean {
    return /\((Host|Chủ trì cuộc họp|Co-host|Đồng chủ trì)\)/i.test(raw);
  }

  private isUiStopword(text: string): boolean {
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

  public toggleManualExclude(studentId: string): void {
    if (this.engine.isStudentExcluded(studentId)) {
      this.engine.include(studentId);
    } else {
      this.engine.exclude(studentId);
    }
    this.notify();
  }

  public getStudents(): Student[] {
    return Array.from(this.currentStudents.values());
  }

  public getEngine(): RandomEngine {
    return this.engine;
  }
}
