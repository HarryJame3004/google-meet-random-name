/**
 * RandomEngine - Pure mathematical random selection without replacement.
 * Zero-dependency, testable, deterministic state transitions.
 * 
 * Guarantees:
 * 1. No student is ever picked twice within the same session.
 * 2. When available list is empty, picking is halted and 'COMPLETED' is returned.
 * 3. Preserves history in chronological order.
 * 4. Supports manual exclusions and additions mid-session.
 */

export interface Student {
  id: string;
  name: string;
  isHost?: boolean;
  avatar?: string;
  joinedAt?: number;
}

export interface PickResult {
  student: Student | null;
  status: 'SUCCESS' | 'EMPTY' | 'ALREADY_COMPLETED';
  remainingCount: number;
  totalCount: number;
  calledCount: number;
}

export interface RandomEngineState {
  availableIds: string[];
  selectedIds: string[];
  excludedIds: string[];
  history: Array<{ studentId: string; timestamp: number }>;
  lastSelectedId: string | null;
  isCompleted: boolean;
}

export class RandomEngine {
  private studentsMap: Map<string, Student> = new Map();
  private availableIds: Set<string> = new Set();
  private selectedIds: Set<string> = new Set();
  private excludedIds: Set<string> = new Set();
  private history: Array<{ studentId: string; timestamp: number }> = [];
  private lastSelectedId: string | null = null;
  private debug: boolean = false;

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
  }

  public setDebug(debug: boolean): void {
    this.debug = debug;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[RandomEngine]', ...args);
    }
  }

  /**
   * Initialize or sync students list.
   * If students are already in session, preserves their selected/excluded status.
   */
  public initialize(students: Student[], preserveSession = true): void {
    const newStudentsMap = new Map<string, Student>();
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
        if (!s.isHost) {
          this.availableIds.add(id);
        } else {
          this.excludedIds.add(id);
        }
      }
      this.log('Initialized brand new session with', this.availableIds.size, 'available students');
      return;
    }

    // Sync mode: preserve selected, excluded, and history
    const existingIds = new Set(this.studentsMap.keys());
    this.studentsMap = newStudentsMap;

    // Check newly added students
    for (const [id, s] of this.studentsMap) {
      if (!existingIds.has(id)) {
        // New student joined
        if (s.isHost) {
          this.excludedIds.add(id);
        } else if (!this.selectedIds.has(id) && !this.excludedIds.has(id)) {
          this.availableIds.add(id);
          this.log(`New student added to available: ${s.name} (${id})`);
        }
      }
    }

    // Clean up available students who left
    for (const id of Array.from(this.availableIds)) {
      if (!this.studentsMap.has(id)) {
        this.availableIds.delete(id);
        this.log(`Available student left the call: ${id}`);
      }
    }

    // Note: We do NOT delete from selectedIds if they leave, to preserve session integrity.
    // However, if they rejoin, they remain in selectedIds!
  }

  /**
   * Pick one random student from available students.
   * Uses cryptographically secure or pseudo-random distribution.
   */
  public pick(): PickResult {
    const availableArray = Array.from(this.availableIds);

    if (availableArray.length === 0) {
      this.log('Pick attempted but no students available');
      return {
        student: null,
        status: this.selectedIds.size > 0 ? 'ALREADY_COMPLETED' : 'EMPTY',
        remainingCount: 0,
        totalCount: this.studentsMap.size,
        calledCount: this.selectedIds.size,
      };
    }

    // Uniform random index
    const randomIndex = Math.floor(Math.random() * availableArray.length);
    const chosenId = availableArray[randomIndex];

    // Atomically move from available to selected
    this.availableIds.delete(chosenId);
    this.selectedIds.add(chosenId);
    this.lastSelectedId = chosenId;

    const chosenStudent = this.studentsMap.get(chosenId)!;
    this.history.push({
      studentId: chosenId,
      timestamp: Date.now(),
    });

    this.log(`Picked: ${chosenStudent.name} (${chosenId}). Remaining: ${this.availableIds.size}`);

    return {
      student: chosenStudent,
      status: 'SUCCESS',
      remainingCount: this.availableIds.size,
      totalCount: this.getEligibleCount(),
      calledCount: this.selectedIds.size,
    };
  }

  /**
   * Exclude a student from being selected (e.g. host or manual teacher toggle)
   */
  public exclude(studentId: string): boolean {
    if (!this.studentsMap.has(studentId)) return false;
    this.availableIds.delete(studentId);
    this.excludedIds.add(studentId);
    this.log(`Student excluded: ${studentId}`);
    return true;
  }

  /**
   * Include a student back into available pool (if not already selected)
   */
  public include(studentId: string): boolean {
    if (!this.studentsMap.has(studentId)) return false;
    this.excludedIds.delete(studentId);
    if (!this.selectedIds.has(studentId)) {
      this.availableIds.add(studentId);
      this.log(`Student re-included: ${studentId}`);
      return true;
    }
    return false;
  }

  /**
   * Reset session: all eligible students become available again,
   * selected and history are cleared.
   */
  public reset(): void {
    this.selectedIds.clear();
    this.history = [];
    this.lastSelectedId = null;
    this.availableIds.clear();

    for (const [id, s] of this.studentsMap) {
      if (!this.excludedIds.has(id)) {
        this.availableIds.add(id);
      }
    }
    this.log('Session reset. All eligible students available again:', this.availableIds.size);
  }

  public hasRemaining(): boolean {
    return this.availableIds.size > 0;
  }

  public getAvailableStudents(): Student[] {
    return Array.from(this.availableIds)
      .map((id) => this.studentsMap.get(id))
      .filter((s): s is Student => s !== undefined);
  }

  public getSelectedStudents(): Student[] {
    return Array.from(this.selectedIds)
      .map((id) => this.studentsMap.get(id))
      .filter((s): s is Student => s !== undefined);
  }

  public getExcludedStudents(): Student[] {
    return Array.from(this.excludedIds)
      .map((id) => this.studentsMap.get(id))
      .filter((s): s is Student => s !== undefined);
  }

  public getAllStudents(): Student[] {
    return Array.from(this.studentsMap.values());
  }

  public getLastSelected(): Student | null {
    if (!this.lastSelectedId) return null;
    return this.studentsMap.get(this.lastSelectedId) || null;
  }

  public getHistory(): Array<{ student: Student; timestamp: number }> {
    return this.history
      .map((item) => {
        const student = this.studentsMap.get(item.studentId);
        if (!student) return null;
        return { student, timestamp: item.timestamp };
      })
      .filter((item): item is { student: Student; timestamp: number } => item !== null);
  }

  public getCounts() {
    return {
      total: this.studentsMap.size,
      eligible: this.getEligibleCount(),
      available: this.availableIds.size,
      called: this.selectedIds.size,
      excluded: this.excludedIds.size,
    };
  }

  public getEligibleCount(): number {
    return this.availableIds.size + this.selectedIds.size;
  }

  public isStudentCalled(id: string): boolean {
    return this.selectedIds.has(id);
  }

  public isStudentExcluded(id: string): boolean {
    return this.excludedIds.has(id);
  }

  public exportState(): RandomEngineState {
    return {
      availableIds: Array.from(this.availableIds),
      selectedIds: Array.from(this.selectedIds),
      excludedIds: Array.from(this.excludedIds),
      history: [...this.history],
      lastSelectedId: this.lastSelectedId,
      isCompleted: this.availableIds.size === 0 && this.selectedIds.size > 0,
    };
  }

  public importState(state: RandomEngineState, students: Student[]): void {
    this.studentsMap.clear();
    for (const s of students) {
      this.studentsMap.set(s.id, s);
    }
    this.availableIds = new Set(state.availableIds.filter((id) => this.studentsMap.has(id)));
    this.selectedIds = new Set(state.selectedIds);
    this.excludedIds = new Set(state.excludedIds);
    this.history = [...state.history];
    this.lastSelectedId = state.lastSelectedId;
  }
}
