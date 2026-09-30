import { RandomEngine, Student } from './random-engine.ts';
import { StudentManager } from './student-manager.ts';
import { ParticipantDetector } from './participant-detector.ts';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'RandomEngine' | 'StudentManager' | 'ParticipantDetector' | 'Integration';
  passed: boolean;
  message: string;
  durationMs: number;
  details?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestCaseResult[];
}

export function runAllTests(): TestSuiteSummary {
  const startTime = performance.now();
  const results: TestCaseResult[] = [];

  function record(
    id: string,
    name: string,
    category: TestCaseResult['category'],
    fn: () => { passed: boolean; message: string; details?: string }
  ) {
    const t0 = performance.now();
    try {
      const res = fn();
      const t1 = performance.now();
      results.push({
        id,
        name,
        category,
        passed: res.passed,
        message: res.message,
        durationMs: Math.round((t1 - t0) * 100) / 100,
        details: res.details,
      });
    } catch (err: unknown) {
      const t1 = performance.now();
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        id,
        name,
        category,
        passed: false,
        message: `Exception: ${errMsg}`,
        durationMs: Math.round((t1 - t0) * 100) / 100,
        details: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  // ==========================================
  // REQUIRED TEST 1: Không chọn duplicate trong cùng session
  // ==========================================
  record('T1', 'Không chọn duplicate trong cùng session', 'RandomEngine', () => {
    const engine = new RandomEngine();
    const students: Student[] = [
      { id: '1', name: 'Nguyễn Văn An' },
      { id: '2', name: 'Trần Minh Anh' },
      { id: '3', name: 'Lê Hoàng Nam' },
      { id: '4', name: 'Phạm Minh Đức' },
      { id: '5', name: 'Nguyễn Thu Hà' },
    ];
    engine.initialize(students, false);

    const pickedIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const pick = engine.pick();
      if (!pick.student) {
        return { passed: false, message: `Pick ${i + 1} trả về null trong khi vẫn còn học sinh` };
      }
      if (pickedIds.includes(pick.student.id)) {
        return {
          passed: false,
          message: `Lỗi trùng lặp: Học sinh ${pick.student.name} (${pick.student.id}) đã được chọn trước đó!`,
        };
      }
      pickedIds.push(pick.student.id);
    }

    return {
      passed: true,
      message: `Đã chọn ${pickedIds.length} học sinh liên tiếp không trùng lặp nào.`,
      details: `Các ID đã chọn: ${pickedIds.join(', ')}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 2: Có thể chọn hết tất cả (exhaustion check)
  // ==========================================
  record('T2', 'Có thể chọn hết tất cả học sinh đến khi hoàn tất', 'RandomEngine', () => {
    const engine = new RandomEngine();
    const count = 10;
    const students: Student[] = Array.from({ length: count }, (_, i) => ({
      id: `s_${i}`,
      name: `Học sinh ${i + 1}`,
    }));
    engine.initialize(students, false);

    for (let i = 0; i < count; i++) {
      const res = engine.pick();
      if (res.status !== 'SUCCESS') {
        return { passed: false, message: `Pick ${i + 1} thất bại với status ${res.status}` };
      }
    }

    // Next pick must report already completed
    const exhaustedPick = engine.pick();
    const isCompleted = exhaustedPick.status === 'ALREADY_COMPLETED' && exhaustedPick.remainingCount === 0;

    return {
      passed: isCompleted && !engine.hasRemaining(),
      message: isCompleted
        ? 'Đã gọi hết 10/10 học sinh. Lần gọi thứ 11 trả về ALREADY_COMPLETED.'
        : `Trạng thái không đúng: ${exhaustedPick.status}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 3: Không random khi danh sách rỗng
  // ==========================================
  record('T3', 'Không random khi danh sách rỗng', 'RandomEngine', () => {
    const engine = new RandomEngine();
    engine.initialize([], false);

    const pick = engine.pick();
    const passed = pick.status === 'EMPTY' && pick.student === null && pick.remainingCount === 0;

    return {
      passed,
      message: passed
        ? 'Danh sách rỗng: trả về an toàn student = null, status = EMPTY.'
        : `Thất bại: status = ${pick.status}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 4: Reset hoạt động đúng
  // ==========================================
  record('T4', 'Reset khôi phục toàn bộ danh sách để random vòng mới', 'RandomEngine', () => {
    const engine = new RandomEngine();
    const students: Student[] = [
      { id: '1', name: 'Nguyễn Văn A' },
      { id: '2', name: 'Trần Thị B' },
      { id: '3', name: 'Lê Văn C' },
    ];
    engine.initialize(students, false);

    // Pick 2 students
    engine.pick();
    engine.pick();
    const countsBefore = engine.getCounts();

    // Call Reset
    engine.reset();
    const countsAfter = engine.getCounts();

    const passed =
      countsBefore.called === 2 &&
      countsBefore.available === 1 &&
      countsAfter.called === 0 &&
      countsAfter.available === 3 &&
      engine.hasRemaining();

    return {
      passed,
      message: passed
        ? 'Reset thành công: Đã gọi về 0, Còn lại = 3, tất cả sẵn sàng cho vòng mới.'
        : `Lỗi reset: called=${countsAfter.called}, available=${countsAfter.available}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 5: Thêm participant giữa chừng
  // ==========================================
  record('T5', 'Thêm participant giữa chừng (học sinh vào lớp muộn)', 'StudentManager', () => {
    const engine = new RandomEngine();
    const manager = new StudentManager(engine, { excludeHost: true });

    // Ban đầu có 2 học sinh
    manager.syncFromRawParticipants([
      { name: 'Nguyễn Văn A' },
      { name: 'Trần Thị B' },
    ]);

    // Gọi 1 học sinh
    const pick1 = engine.pick();
    const pickedName = pick1.student?.name;

    // Học sinh thứ 3 vào lớp
    manager.syncFromRawParticipants([
      { name: 'Nguyễn Văn A' },
      { name: 'Trần Thị B' },
      { name: 'Lê Hoàng Nam' },
    ]);

    const available = engine.getAvailableStudents();
    const hasNewStudent = available.some((s) => s.name === 'Lê Hoàng Nam');
    const stillRetainsCalled = engine.getSelectedStudents().some((s) => s.name === pickedName);

    const passed = hasNewStudent && stillRetainsCalled && engine.getCounts().total === 3;

    return {
      passed,
      message: passed
        ? 'Học sinh mới được thêm vào nhóm khả dụng; học sinh đã gọi trước đó vẫn giữ nguyên trạng thái.'
        : 'Thất bại khi đồng bộ học sinh mới vào lớp.',
    };
  });

  // ==========================================
  // REQUIRED TEST 6: Xóa participant (học sinh rời lớp)
  // ==========================================
  record('T6', 'Xóa participant khi học sinh rời lớp không hỏng session', 'StudentManager', () => {
    const engine = new RandomEngine();
    const manager = new StudentManager(engine, { excludeHost: true });

    manager.syncFromRawParticipants([
      { name: 'Học sinh A' },
      { name: 'Học sinh B' },
      { name: 'Học sinh C' },
    ]);

    // Học sinh B rời lớp
    manager.syncFromRawParticipants([
      { name: 'Học sinh A' },
      { name: 'Học sinh C' },
    ]);

    const currentNames = manager.getStudents().map((s) => s.name);
    const passed =
      !currentNames.includes('Học sinh B') &&
      currentNames.includes('Học sinh A') &&
      currentNames.includes('Học sinh C') &&
      engine.getCounts().available === 2;

    return {
      passed,
      message: passed
        ? 'Học sinh rời lớp được gỡ khỏi danh sách khả dụng; tổng còn lại cập nhật chính xác = 2.'
        : `Lỗi cập nhật: ${currentNames.join(', ')}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 7: Danh sách chỉ có 1 người
  // ==========================================
  record('T7', 'Danh sách chỉ có 1 người duy nhất', 'RandomEngine', () => {
    const engine = new RandomEngine();
    engine.initialize([{ id: 'solo_1', name: 'Đoàn Thị Một' }], false);

    const pick1 = engine.pick();
    const pick2 = engine.pick();

    const passed =
      pick1.status === 'SUCCESS' &&
      pick1.student?.name === 'Đoàn Thị Một' &&
      pick2.status === 'ALREADY_COMPLETED' &&
      !engine.hasRemaining();

    return {
      passed,
      message: passed
        ? 'Lần 1 chọn chính xác học sinh duy nhất; lần 2 báo hoàn tất (ALREADY_COMPLETED).'
        : `Thất bại: p1=${pick1.status}, p2=${pick2.status}`,
    };
  });

  // ==========================================
  // REQUIRED TEST 8: Danh sách rỗng & khởi tạo null-safe
  // ==========================================
  record('T8', 'Danh sách rỗng và xử lý null-safe input', 'StudentManager', () => {
    const engine = new RandomEngine();
    const manager = new StudentManager(engine);

    // Provide empty & dirty inputs
    manager.syncFromRawParticipants([
      { name: '' },
      { name: '   ' },
      { name: 'Turn on microphone' }, // stopword
      { name: 'Meeting details' }, // stopword
    ]);

    const students = manager.getStudents();
    const passed = students.length === 0 && engine.getCounts().total === 0;

    return {
      passed,
      message: passed
        ? 'Lọc bỏ hoàn toàn các chuỗi rỗng và UI stopwords của Google Meet; không tạo participant rác.'
        : `Còn sót ${students.length} phần tử rác.`,
    };
  });

  // ==========================================
  // TEST 9: Tự động loại trừ Giáo viên / Host
  // ==========================================
  record('T9', 'Tự động phát hiện và loại trừ Host / Giáo viên khỏi Random', 'StudentManager', () => {
    const engine = new RandomEngine();
    const manager = new StudentManager(engine, { excludeHost: true });

    manager.syncFromRawParticipants([
      { name: 'Thầy Giáo Hoàng (Host)' },
      { name: 'Nguyễn Văn Em' },
      { name: 'Trần Thị Bé' },
    ]);

    const available = engine.getAvailableStudents();
    const excluded = engine.getExcludedStudents();

    const hostExcluded = excluded.some((s) => s.name.includes('Thầy Giáo Hoàng'));
    const studentsAvailable = available.length === 2 && !available.some((s) => s.name.includes('Thầy Giáo Hoàng'));

    const passed = hostExcluded && studentsAvailable;

    return {
      passed,
      message: passed
        ? 'Giáo viên (Host) được loại trừ an toàn; chỉ có 2 học sinh nằm trong danh sách Random.'
        : `Lỗi host exclusion: excluded=${excluded.length}, available=${available.length}`,
    };
  });

  // ==========================================
  // TEST 10: ParticipantDetector trên Mock DOM Google Meet
  // ==========================================
  record('T10', 'ParticipantDetector nhận diện đúng từ Mock DOM Google Meet', 'ParticipantDetector', () => {
    // If in Node environment without jsdom/browser document
    if (typeof document === 'undefined') {
      const createMockRow = (name: string, id: string, isHost = false) => {
        const spanEl = {
          textContent: name,
          getAttribute: (attr: string) => (attr === 'title' ? name : null),
          querySelector: () => null,
          querySelectorAll: () => [],
          closest: () => null,
        };
        return {
          textContent: name,
          getAttribute: (attr: string) => {
            if (attr === 'data-participant-id') return id;
            if (attr === 'aria-label') return name;
            return null;
          },
          querySelector: (sel: string) => {
            if (sel.includes('title')) return spanEl;
            if (sel === 'img') return null;
            if (sel === '[data-is-host="true"]') return isHost ? spanEl : null;
            return null;
          },
          querySelectorAll: (sel: string) => {
            if (sel.includes('title') || sel.includes('span')) return [spanEl];
            return [];
          },
          closest: () => null,
        };
      };

      const mockRows = [
        createMockRow('Phạm Quang Huy', 'p_huy', false),
        createMockRow('Vũ Thị Mai', 'p_mai', false),
        createMockRow('Trần Trọng Đạt (Host)', 'p_dat', true),
      ];

      const mockPanel = {
        querySelectorAll: (sel: string) => (sel.includes('listitem') ? mockRows : []),
      };

      const mockDoc = {
        location: { href: 'https://meet.google.com/abc-defg-hij', hostname: 'meet.google.com' },
        querySelector: (sel: string) => (sel.includes('People') || sel.includes('Mọi người') ? mockPanel : null),
        querySelectorAll: () => [],
      } as unknown as Document;

      const detector = new ParticipantDetector({ doc: mockDoc });
      const scanResult = detector.scanNow();

      const names = scanResult.participants.map((p) => p.name);
      const passed =
        scanResult.participants.length === 3 &&
        names.some((n) => n.includes('Phạm Quang Huy')) &&
        names.some((n) => n.includes('Vũ Thị Mai')) &&
        names.some((n) => n.includes('Trần Trọng Đạt'));

      return {
        passed,
        message: passed
          ? `Đã nhận diện thành công ${scanResult.participants.length} thành viên từ Mock Google Meet (${scanResult.layerUsed}).`
          : `Nhận diện thất bại: ${scanResult.participants.length} người.`,
        details: `Danh sách quét: ${names.join(', ')}`,
      };
    }

    // In Browser environment
    const mockContainer = document.createElement('div');
    mockContainer.innerHTML = `
      <div data-meet-mock="true">
        <div aria-label="People" role="region">
          <div role="list">
            <div role="listitem">
              <span title="Phạm Quang Huy">Phạm Quang Huy</span>
            </div>
            <div role="listitem">
              <span title="Vũ Thị Mai">Vũ Thị Mai</span>
            </div>
            <div role="listitem">
              <span title="Trần Trọng Đạt (Host)">Trần Trọng Đạt (Host)</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const mockDoc = {
      location: { href: 'https://meet.google.com/abc-defg-hij', hostname: 'meet.google.com' },
      body: mockContainer,
      documentElement: mockContainer,
      querySelector: (sel: string) => mockContainer.querySelector(sel),
      querySelectorAll: (sel: string) => mockContainer.querySelectorAll(sel),
    } as unknown as Document;

    const detector = new ParticipantDetector({ doc: mockDoc });
    const scanResult = detector.scanNow();

    const names = scanResult.participants.map((p) => p.name);
    const hasHuy = names.some((n) => n.includes('Phạm Quang Huy'));
    const hasMai = names.some((n) => n.includes('Vũ Thị Mai'));
    const hasHost = names.some((n) => n.includes('Trần Trọng Đạt'));

    const passed = scanResult.participants.length === 3 && hasHuy && hasMai && hasHost;

    return {
      passed,
      message: passed
        ? `Đã nhận diện thành công ${scanResult.participants.length} thành viên từ Mock Google Meet (${scanResult.layerUsed}).`
        : `Nhận diện thất bại: tìm thấy ${scanResult.participants.length} người.`,
      details: `Danh sách quét: ${names.join(', ')}`,
    };
  });

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const passedCount = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    durationMs,
    results,
  };
}
