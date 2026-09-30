/**
 * Meet Random Picker - In-Meet Floating Widget
 * Non-intrusive, draggable, collapsible floating widget for Google Meet teachers.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (document.getElementById('meet-random-picker-widget-root')) return;

  const engine = new RandomEngine();
  const manager = new StudentManager(engine, { excludeHost: true });
  const detector = new ParticipantDetector();

  let isCollapsed = false;
  let isPicking = false;
  let soundEnabled = true;

  // Simple web audio synthesizer for in-page content script
  function playBeep(freq = 440, type = 'sine', duration = 0.05) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playFanfare() {
    if (!soundEnabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      setTimeout(() => playBeep(freq, 'sine', 0.25), idx * 80);
    });
  }

  // Create UI Root
  const root = document.createElement('div');
  root.id = 'meet-random-picker-widget-root';
  root.className = 'mrp-floating-container';

  root.innerHTML = `
    <div class="mrp-card" id="mrpCard">
      <div class="mrp-header" id="mrpDragHeader">
        <div class="mrp-header-title">
          <span class="mrp-icon">🎓</span>
          <span class="mrp-title-text">Random Picker</span>
          <span class="mrp-status-badge" id="mrpStatusBadge">0</span>
        </div>
        <div class="mrp-header-actions">
          <button class="mrp-btn-icon" id="mrpBtnSound" title="Bật/Tắt âm thanh">🔊</button>
          <button class="mrp-btn-icon" id="mrpBtnCollapse" title="Thu nhỏ">_</button>
        </div>
      </div>

      <div class="mrp-body" id="mrpBody">
        <div class="mrp-stats-row">
          <span class="mrp-stat"><b id="mrpStatRemaining">0</b> còn lại</span>
          <span class="mrp-stat-divider">•</span>
          <span class="mrp-stat"><b id="mrpStatCalled">0</b> đã gọi</span>
        </div>

        <div class="mrp-result-box" id="mrpResultBox">
          <div class="mrp-result-label" id="mrpResultLabel">Học sinh được chọn:</div>
          <div class="mrp-result-name" id="mrpResultName">— Chưa quay —</div>
        </div>

        <button class="mrp-btn-random" id="mrpBtnRandom">
          <span class="mrp-dice">🎲</span> RANDOM HỌC SINH
        </button>

        <div class="mrp-footer-actions">
          <button class="mrp-btn-subtle" id="mrpBtnReset">🔄 Đặt lại vòng mới</button>
          <span class="mrp-layer-info" id="mrpLayerInfo">Sẵn sàng</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // Grab elements
  const card = document.getElementById('mrpCard');
  const dragHeader = document.getElementById('mrpDragHeader');
  const body = document.getElementById('mrpBody');
  const btnCollapse = document.getElementById('mrpBtnCollapse');
  const btnSound = document.getElementById('mrpBtnSound');
  const btnRandom = document.getElementById('mrpBtnRandom');
  const btnReset = document.getElementById('mrpBtnReset');
  const statRemaining = document.getElementById('mrpStatRemaining');
  const statCalled = document.getElementById('mrpStatCalled');
  const statusBadge = document.getElementById('mrpStatusBadge');
  const resultName = document.getElementById('mrpResultName');
  const resultLabel = document.getElementById('mrpResultLabel');
  const resultBox = document.getElementById('mrpResultBox');
  const layerInfo = document.getElementById('mrpLayerInfo');

  // Dragging logic
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  dragHeader.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    offsetX = e.clientX - root.getBoundingClientRect().left;
    offsetY = e.clientY - root.getBoundingClientRect().top;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const x = Math.max(10, Math.min(window.innerWidth - 260, e.clientX - offsetX));
    const y = Math.max(10, Math.min(window.innerHeight - 200, e.clientY - offsetY));
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  // Collapse / Expand
  btnCollapse.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    body.style.display = isCollapsed ? 'none' : 'block';
    btnCollapse.textContent = isCollapsed ? '▢' : '_';
    card.classList.toggle('mrp-collapsed', isCollapsed);
  });

  // Sound toggle
  btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnSound.textContent = soundEnabled ? '🔊' : '🔇';
    playBeep(440);
  });

  // Update UI stats
  function updateUI() {
    const counts = engine.getCounts();
    statRemaining.textContent = counts.available;
    statCalled.textContent = counts.called;
    statusBadge.textContent = `${counts.available} còn`;

    if (counts.available === 0 && counts.called > 0) {
      statusBadge.textContent = 'Hết';
      btnRandom.classList.add('mrp-completed');
      btnRandom.innerHTML = '🎉 ĐÃ GỌI HẾT!';
    } else {
      btnRandom.classList.remove('mrp-completed');
      btnRandom.innerHTML = '<span class="mrp-dice">🎲</span> RANDOM HỌC SINH';
    }
  }

  // Random Pick with smooth shuffle animation
  async function handleRandomPick() {
    if (isPicking) return;
    if (!engine.hasRemaining()) {
      alert('Tất cả học sinh trong danh sách đã được gọi hết! Hãy bấm "Đặt lại vòng mới" để bắt đầu lượt mới.');
      return;
    }

    isPicking = true;
    btnRandom.disabled = true;
    resultBox.classList.add('mrp-rolling');
    resultLabel.textContent = 'Đang chọn ngẫu nhiên...';

    // Shuffle preview animation (600ms)
    const available = engine.getAvailableStudents();
    const shuffleCount = Math.min(8, available.length * 2);
    for (let i = 0; i < shuffleCount; i++) {
      const tempPick = available[Math.floor(Math.random() * available.length)];
      resultName.textContent = tempPick.name;
      playBeep(350 + i * 20, 'triangle', 0.03);
      await new Promise((r) => setTimeout(r, 60));
    }

    // Official pick from engine (guaranteed no duplicates)
    const result = engine.pick();
    resultBox.classList.remove('mrp-rolling');
    btnRandom.disabled = false;
    isPicking = false;

    if (result.status === 'SUCCESS' && result.student) {
      resultLabel.textContent = `🎉 Đã chọn (Lần ${result.calledCount}/${result.totalCount}):`;
      resultName.textContent = result.student.name;
      resultBox.classList.add('mrp-winner');
      setTimeout(() => resultBox.classList.remove('mrp-winner'), 1500);
      playFanfare();
    } else if (result.status === 'ALREADY_COMPLETED') {
      resultLabel.textContent = 'Thông báo:';
      resultName.textContent = '🎉 Đã gọi hết tất cả học sinh!';
    }

    updateUI();
  }

  btnRandom.addEventListener('click', handleRandomPick);

  // Reset confirmation
  btnReset.addEventListener('click', () => {
    const confirmReset = window.confirm('Bạn có chắc chắn muốn đặt lại vòng random mới cho tất cả học sinh?');
    if (confirmReset) {
      engine.reset();
      resultLabel.textContent = 'Đã đặt lại vòng mới:';
      resultName.textContent = '— Sẵn sàng —';
      playBeep(520, 'sine', 0.1);
      updateUI();
    }
  });

  // Connect detector & student manager
  detector.onUpdate((event) => {
    if (event.participants.length > 0) {
      manager.syncFromRawParticipants(event.participants);
      layerInfo.textContent = `${event.layerUsed}`;
    }
    updateUI();
  });

  // Start detector
  detector.start();

  // Listen for Chrome Extension runtime messages
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'TRIGGER_RANDOM_PICK') {
        handleRandomPick();
      } else if (request.action === 'TOGGLE_WIDGET') {
        root.style.display = root.style.display === 'none' ? 'block' : 'none';
      } else if (request.action === 'GET_STATE') {
        sendResponse({
          students: manager.getStudents(),
          counts: engine.getCounts(),
          lastSelected: engine.getLastSelected(),
          detectorStatus: detector.status,
        });
      }
    });
  }
})();
