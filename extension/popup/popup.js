/**
 * Meet Random Picker - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const engine = new RandomEngine();
  const manager = new StudentManager(engine, { excludeHost: true });

  let activeTabId = null;
  let isGoogleMeet = false;
  let isPicking = false;

  // DOM Elements
  const statTotal = document.getElementById('statTotal');
  const statCalled = document.getElementById('statCalled');
  const statRemaining = document.getElementById('statRemaining');
  const btnRandom = document.getElementById('btnRandom');
  const selectedName = document.getElementById('selectedName');
  const resultMeta = document.getElementById('resultMeta');
  const btnViewStudents = document.getElementById('btnViewStudents');
  const btnListCount = document.getElementById('btnListCount');
  const btnResetSession = document.getElementById('btnResetSession');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Navigation views
  const mainView = document.getElementById('mainView');
  const listView = document.getElementById('listView');
  const settingsView = document.getElementById('settingsView');
  const btnSettingsToggle = document.getElementById('btnSettingsToggle');
  const btnBackFromList = document.getElementById('btnBackFromList');
  const btnBackFromSettings = document.getElementById('btnBackFromSettings');
  const btnRefreshList = document.getElementById('btnRefreshList');

  // List elements
  const listTitleCount = document.getElementById('listTitleCount');
  const subCalledCount = document.getElementById('subCalledCount');
  const subRemainCount = document.getElementById('subRemainCount');
  const subExcludeCount = document.getElementById('subExcludeCount');
  const searchInput = document.getElementById('searchStudentInput');
  const studentListContainer = document.getElementById('studentListContainer');

  // Settings elements
  const settingSound = document.getElementById('settingSound');
  const settingAnim = document.getElementById('settingAnim');
  const settingExcludeHost = document.getElementById('settingExcludeHost');
  const settingWidget = document.getElementById('settingWidget');
  const settingDebug = document.getElementById('settingDebug');

  // Audio helper
  function playChime(type = 'pick') {
    if (!settingSound.checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(360, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.03);
      } else if (type === 'pick') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.08, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.25);
        });
      }
    } catch (e) {}
  }

  // Load Settings from storage
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['settings'], (res) => {
      if (res?.settings) {
        settingSound.checked = res.settings.soundEnabled ?? true;
        settingAnim.checked = res.settings.animationEnabled ?? true;
        settingExcludeHost.checked = res.settings.excludeHost ?? true;
        settingWidget.checked = res.settings.showWidget ?? true;
        settingDebug.checked = res.settings.debugMode ?? false;
        manager.setExcludeHost(settingExcludeHost.checked);
        manager.setDebug(settingDebug.checked);
      }
    });
  }

  function saveSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        settings: {
          soundEnabled: settingSound.checked,
          animationEnabled: settingAnim.checked,
          excludeHost: settingExcludeHost.checked,
          showWidget: settingWidget.checked,
          debugMode: settingDebug.checked,
        },
      });
    }
    manager.setExcludeHost(settingExcludeHost.checked);
    manager.setDebug(settingDebug.checked);
    updateUI();
  }

  [settingSound, settingAnim, settingExcludeHost, settingWidget, settingDebug].forEach((el) => {
    el.addEventListener('change', saveSettings);
  });

  // Query Active Tab
  async function checkMeetConnection() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      statusText.textContent = '⚪ Chế độ kiểm thử cục bộ';
      statusDot.className = 'status-dot waiting';
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    activeTabId = tab.id;
    if (tab.url.includes('meet.google.com')) {
      isGoogleMeet = true;
      statusDot.className = 'status-dot connected';
      statusText.textContent = '🟢 Đã kết nối Google Meet';

      // Ask content script for current state
      chrome.tabs.sendMessage(activeTabId, { action: 'GET_STATE' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          statusText.textContent = '🔵 Đang đồng bộ người tham gia...';
          statusDot.className = 'status-dot syncing';
        } else {
          if (response.students?.length) {
            manager.syncFromRawParticipants(response.students);
          }
          if (response.lastSelected) {
            selectedName.textContent = response.lastSelected.name;
          }
          updateUI();
        }
      });
    } else {
      isGoogleMeet = false;
      statusDot.className = 'status-dot waiting';
      statusText.textContent = '⚪ Đang đợi mở Google Meet';
    }
  }

  // Update UI Stats
  function updateUI() {
    const counts = engine.getCounts();
    statTotal.textContent = counts.eligible;
    statCalled.textContent = counts.called;
    statRemaining.textContent = counts.available;
    btnListCount.textContent = counts.eligible;

    if (counts.available === 0 && counts.called > 0) {
      btnRandom.classList.add('completed');
      btnRandom.innerHTML = '🎉 ĐÃ GỌI HẾT HỌC SINH!';
    } else {
      btnRandom.classList.remove('completed');
      btnRandom.innerHTML = '<span class="dice-icon">🎲</span><span class="btn-text">RANDOM HỌC SINH</span>';
    }

    renderStudentList();
  }

  // Handle Random Pick
  async function triggerRandom() {
    if (isPicking) return;
    if (!engine.hasRemaining()) {
      alert('Tất cả học sinh trong danh sách đã được gọi hết! Bấm "RESET VÒNG" để bắt đầu lượt mới.');
      return;
    }

    isPicking = true;
    btnRandom.disabled = true;
    resultMeta.textContent = 'Đang chọn ngẫu nhiên...';

    // Animation
    if (settingAnim.checked) {
      const available = engine.getAvailableStudents();
      const loops = Math.min(8, available.length * 2);
      for (let i = 0; i < loops; i++) {
        const temp = available[Math.floor(Math.random() * available.length)];
        selectedName.textContent = temp.name;
        playChime('tick');
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    const pickResult = engine.pick();
    btnRandom.disabled = false;
    isPicking = false;

    if (pickResult.status === 'SUCCESS' && pickResult.student) {
      resultMeta.textContent = `🎉 Đã chọn (${pickResult.calledCount}/${pickResult.totalCount}):`;
      selectedName.textContent = pickResult.student.name;
      selectedName.classList.add('highlight-flash');
      setTimeout(() => selectedName.classList.remove('highlight-flash'), 1200);
      playChime('pick');

      // Also notify content script if on Meet tab
      if (activeTabId && isGoogleMeet) {
        chrome.tabs.sendMessage(activeTabId, { action: 'TRIGGER_RANDOM_PICK' });
      }
    } else if (pickResult.status === 'ALREADY_COMPLETED') {
      resultMeta.textContent = 'Thông báo:';
      selectedName.textContent = '🎉 Đã gọi hết tất cả học sinh!';
    }

    updateUI();
  }

  btnRandom.addEventListener('click', triggerRandom);

  // Handle Reset with confirmation
  btnResetSession.addEventListener('click', () => {
    const ok = window.confirm('Bạn có chắc chắn muốn đặt lại vòng random mới? Tất cả học sinh sẽ được tính là chưa gọi.');
    if (ok) {
      engine.reset();
      resultMeta.textContent = 'Đã đặt lại vòng mới:';
      selectedName.textContent = '— Sẵn sàng —';
      updateUI();
    }
  });

  // Render Student List Drawer
  function renderStudentList() {
    const students = manager.getStudents();
    const query = searchInput.value.toLowerCase().trim();
    const counts = engine.getCounts();

    listTitleCount.textContent = students.length;
    subCalledCount.textContent = counts.called;
    subRemainCount.textContent = counts.available;
    subExcludeCount.textContent = counts.excluded;

    const filtered = students.filter((s) => s.name.toLowerCase().includes(query));
    studentListContainer.innerHTML = '';

    if (filtered.length === 0) {
      studentListContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;font-size:12px;">Chưa có học sinh nào phù hợp</div>';
      return;
    }

    filtered.forEach((student) => {
      const isCalled = engine.isStudentCalled(student.id);
      const isExcluded = engine.isStudentExcluded(student.id);

      const row = document.createElement('div');
      row.className = `student-row ${isCalled ? 'is-called' : ''} ${isExcluded ? 'is-excluded' : ''}`;

      let statusIcon = '○';
      let statusClass = 'uncalled';
      if (isExcluded) {
        statusIcon = '✕';
        statusClass = 'excluded';
      } else if (isCalled) {
        statusIcon = '✓';
        statusClass = 'called';
      }

      row.innerHTML = `
        <div class="student-name-box">
          <span class="status-icon ${statusClass}">${statusIcon}</span>
          <span>${student.name}</span>
          ${student.isHost ? '<span class="host-tag">Giáo viên / Host</span>' : ''}
        </div>
        <button class="exclude-toggle-btn" title="${isExcluded ? 'Bỏ loại trừ' : 'Loại trừ khỏi Random'}">
          ${isExcluded ? 'Khôi phục' : 'Loại trừ'}
        </button>
      `;

      row.querySelector('.exclude-toggle-btn').addEventListener('click', () => {
        manager.toggleManualExclude(student.id);
        updateUI();
      });

      studentListContainer.appendChild(row);
    });
  }

  searchInput.addEventListener('input', renderStudentList);

  // View Navigation
  function switchView(target) {
    [mainView, listView, settingsView].forEach((v) => v.classList.remove('active'));
    target.classList.add('active');
  }

  btnViewStudents.addEventListener('click', () => {
    switchView(listView);
    renderStudentList();
  });
  btnBackFromList.addEventListener('click', () => switchView(mainView));
  btnSettingsToggle.addEventListener('click', () => switchView(settingsView));
  btnBackFromSettings.addEventListener('click', () => switchView(mainView));

  btnRefreshList.addEventListener('click', () => {
    checkMeetConnection();
  });

  // Initial check
  checkMeetConnection();
  updateUI();
});
