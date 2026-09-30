/**
 * Meet Random Picker - RandomEngine (Core Mathematical Module)
 * Guarantees no duplicate picks, handles session lifecycle and state.
 */

class RandomEngine {
  constructor(options = {}) {
    this.studentsMap = new Map();
    this.availableIds = new Set();
    this.selectedIds = new Set();
    this.excludedIds = new Set();
    this.history = [];
    this.lastSelectedId = null;
    this.debug = Boolean(options.debug);
  }

  setDebug(debug) {
    this.debug = Boolean(debug);
  }

  log(...args) {
    if (this.debug) {
      console.log('[MeetRandom:Engine]', ...args);
    }
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
        if (!s.isHost) {
          this.availableIds.add(id);
        } else {
          this.excludedIds.add(id);
        }
      }
      this.log('Session initialized:', this.availableIds.size, 'available');
      return;
    }

    // Sync mode (preserves already selected & excluded)
    const existingIds = new Set(this.studentsMap.keys());
    this.studentsMap = newStudentsMap;

    for (const [id, s] of this.studentsMap) {
      if (!existingIds.has(id)) {
        if (s.isHost) {
          this.excludedIds.add(id);
        } else if (!this.selectedIds.has(id) && !this.excludedIds.has(id)) {
          this.availableIds.add(id);
          this.log(`New participant available: ${s.name}`);
        }
      }
    }

    for (const id of Array.from(this.availableIds)) {
      if (!this.studentsMap.has(id)) {
        this.availableIds.delete(id);
      }
    }
  }

  pick() {
    const available = Array.from(this.availableIds);

    if (available.length === 0) {
      this.log('No available students to pick');
      return {
        student: null,
        status: this.selectedIds.size > 0 ? 'ALREADY_COMPLETED' : 'EMPTY',
        remainingCount: 0,
        totalCount: this.getEligibleCount(),
        calledCount: this.selectedIds.size,
      };
    }

    // Uniform random pick without replacement
    const randomIndex = Math.floor(Math.random() * available.length);
    const chosenId = available[randomIndex];

    this.availableIds.delete(chosenId);
    this.selectedIds.add(chosenId);
    this.lastSelectedId = chosenId;

    const chosenStudent = this.studentsMap.get(chosenId);
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

  exclude(studentId) {
    if (!this.studentsMap.has(studentId)) return false;
    this.availableIds.delete(studentId);
    this.excludedIds.add(studentId);
    return true;
  }

  include(studentId) {
    if (!this.studentsMap.has(studentId)) return false;
    this.excludedIds.delete(studentId);
    if (!this.selectedIds.has(studentId)) {
      this.availableIds.add(studentId);
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
      if (!this.excludedIds.has(id)) {
        this.availableIds.add(id);
      }
    }
    this.log('Session reset completely');
  }

  hasRemaining() {
    return this.availableIds.size > 0;
  }

  getAvailableStudents() {
    return Array.from(this.availableIds).map((id) => this.studentsMap.get(id)).filter(Boolean);
  }

  getSelectedStudents() {
    return Array.from(this.selectedIds).map((id) => this.studentsMap.get(id)).filter(Boolean);
  }

  getExcludedStudents() {
    return Array.from(this.excludedIds).map((id) => this.studentsMap.get(id)).filter(Boolean);
  }

  getAllStudents() {
    return Array.from(this.studentsMap.values());
  }

  getLastSelected() {
    return this.lastSelectedId ? this.studentsMap.get(this.lastSelectedId) || null : null;
  }

  getCounts() {
    return {
      total: this.studentsMap.size,
      eligible: this.getEligibleCount(),
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

  exportState() {
    return {
      availableIds: Array.from(this.availableIds),
      selectedIds: Array.from(this.selectedIds),
      excludedIds: Array.from(this.excludedIds),
      history: [...this.history],
      lastSelectedId: this.lastSelectedId,
      isCompleted: this.availableIds.size === 0 && this.selectedIds.size > 0,
    };
  }

  importState(state, students) {
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RandomEngine };
}
