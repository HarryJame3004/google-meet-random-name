import React, { useState } from 'react';
import {
  RotateCcw,
  Users,
  Settings,
  ArrowLeft,
  Search,
  CheckCircle2,
  Circle,
  XCircle,
  Volume2,
  Sparkles,
  Shield,
  Layout,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RandomEngine } from '../core/random-engine.ts';
import { StudentManager } from '../core/student-manager.ts';
import { soundManager } from '../core/sound-effects.ts';
import { ExtensionLogEntry } from '../types/index.ts';

interface ExtensionPopupModalProps {
  engine: RandomEngine;
  manager: StudentManager;
  onLog: (entry: Omit<ExtensionLogEntry, 'id' | 'timestamp'>) => void;
  excludeHost: boolean;
  onToggleExcludeHost: () => void;
  floatingWidgetVisible: boolean;
  onToggleFloatingWidget: () => void;
}

export const ExtensionPopupModal: React.FC<ExtensionPopupModalProps> = ({
  engine,
  manager,
  onLog,
  excludeHost,
  onToggleExcludeHost,
  floatingWidgetVisible,
  onToggleFloatingWidget,
}) => {
  const [currentView, setCurrentView] = useState<'main' | 'list' | 'settings'>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [rollingCandidate, setRollingCandidate] = useState<string>('— Chưa quay —');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animEnabled, setAnimEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  const counts = engine.getCounts();
  const students = manager.getStudents();
  const lastSelected = engine.getLastSelected();

  const handleRandomPick = async () => {
    if (isPicking) return;
    if (!engine.hasRemaining()) {
      soundManager.playCompletedChime();
      alert('Tất cả học sinh trong danh sách đã được gọi hết! Bấm "RESET VÒNG" để bắt đầu lượt mới.');
      return;
    }

    setIsPicking(true);
    onLog({
      category: 'RandomEngine',
      message: '[Popup] Bắt đầu quay ngẫu nhiên học sinh...',
      type: 'info',
    });

    if (animEnabled) {
      const available = engine.getAvailableStudents();
      const loops = Math.min(8, available.length * 2);
      for (let i = 0; i < loops; i++) {
        const temp = available[Math.floor(Math.random() * available.length)];
        setRollingCandidate(temp.name);
        if (soundEnabled) soundManager.playTick();
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    const result = engine.pick();
    setIsPicking(false);

    if (result.status === 'SUCCESS' && result.student) {
      setRollingCandidate(result.student.name);
      onLog({
        category: 'RandomEngine',
        message: `[Popup] Đã chọn học sinh: ${result.student.name} (${result.calledCount}/${result.totalCount})`,
        type: 'success',
      });

      if (soundEnabled) soundManager.playWinnerFanfare();
      try {
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
      } catch {}
    } else if (result.status === 'ALREADY_COMPLETED') {
      soundManager.playCompletedChime();
      setRollingCandidate('🎉 Đã gọi hết tất cả học sinh!');
    }
  };

  const handleReset = () => {
    const ok = window.confirm('Bạn có chắc chắn muốn đặt lại vòng random mới? Tất cả học sinh sẽ được tính là chưa gọi.');
    if (ok) {
      engine.reset();
      setRollingCandidate('— Sẵn sàng —');
      soundManager.playResetSound();
      onLog({
        category: 'RandomEngine',
        message: '[Popup] Đã đặt lại vòng random',
        type: 'info',
      });
    }
  };

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-[360px] bg-[#121316] text-slate-100 rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden font-sans">
      {/* Chrome Action Header */}
      <div className="bg-[#1a1c20] px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎓</span>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">Meet Random Picker</h1>
            <span className="text-[10px] text-slate-400">Chrome Extension Manifest V3</span>
          </div>
        </div>

        <button
          onClick={() => setCurrentView(currentView === 'settings' ? 'main' : 'settings')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Cài đặt"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* VIEW 1: MAIN DASHBOARD */}
      {currentView === 'main' && (
        <div className="p-4 flex flex-col gap-4">
          {/* Stats Dashboard */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#1e2025] p-2.5 rounded-xl border border-white/5 text-center flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">👥 Học sinh</span>
              <span className="text-lg font-extrabold text-sky-400">{counts.eligible}</span>
            </div>
            <div className="bg-[#1e2025] p-2.5 rounded-xl border border-white/5 text-center flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">✓ Đã gọi</span>
              <span className="text-lg font-extrabold text-emerald-400">{counts.called}</span>
            </div>
            <div className="bg-[#1e2025] p-2.5 rounded-xl border border-white/5 text-center flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium">○ Còn lại</span>
              <span className="text-lg font-extrabold text-amber-400">{counts.available}</span>
            </div>
          </div>

          {/* Primary RANDOM Button */}
          <button
            onClick={handleRandomPick}
            disabled={isPicking}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide shadow-lg flex items-center justify-center gap-2.5 transition duration-200 ${
              counts.available === 0 && counts.called > 0
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <span className="text-lg">🎲</span>
            <span>
              {counts.available === 0 && counts.called > 0 ? '🎉 ĐÃ GỌI HẾT HỌC SINH!' : 'RANDOM HỌC SINH'}
            </span>
          </button>

          {/* Result Showcase */}
          <div className="bg-[#181a1e] rounded-xl p-3 text-center border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {isPicking ? 'Đang chọn...' : 'Lần chọn gần nhất:'}
            </span>
            <span className="text-lg font-extrabold text-white truncate min-h-[28px] flex items-center justify-center">
              {rollingCandidate !== '— Chưa quay —' ? rollingCandidate : lastSelected?.name || '— Chưa quay —'}
            </span>
          </div>

          {/* Secondary Actions Grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCurrentView('list')}
              className="py-2.5 px-3 bg-[#1e2025] hover:bg-[#25282f] text-slate-200 rounded-xl border border-white/5 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Xem DS ({counts.eligible})</span>
            </button>

            <button
              onClick={handleReset}
              className="py-2.5 px-3 bg-[#1e2025] hover:bg-rose-950/30 text-rose-300 hover:text-rose-200 rounded-xl border border-white/5 hover:border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>RESET VÒNG</span>
            </button>
          </div>

          {/* Connection Status Indicator */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 font-medium">🟢 Đã kết nối Google Meet</span>
            </div>
            <span className="text-[10px] text-slate-400">Alt+Shift+R</span>
          </div>
        </div>
      )}

      {/* VIEW 2: STUDENT LIST DRAWER */}
      {currentView === 'list' && (
        <div className="p-4 flex flex-col gap-3 h-[420px]">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('main')}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại</span>
            </button>
            <span className="text-xs font-bold text-white">Danh sách học sinh ({students.length})</span>
            <button
              onClick={() => {
                onLog({ category: 'ParticipantDetector', message: 'Quét lại DOM Google Meet...', type: 'info' });
              }}
              className="p-1 text-slate-400 hover:text-white"
              title="Quét lại"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Breakdown Pills */}
          <div className="flex items-center justify-around bg-[#1e2025] py-2 px-3 rounded-lg text-[11px] text-slate-300">
            <span>✓ <b className="text-emerald-400">{counts.called}</b> Đã gọi</span>
            <span>○ <b className="text-amber-400">{counts.available}</b> Chưa gọi</span>
            <span>✕ <b className="text-rose-400">{counts.excluded}</b> Loại trừ</span>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Tìm tên học sinh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1e2025] pl-8 pr-3 py-1.5 text-xs text-white rounded-lg border border-white/5 outline-none focus:border-sky-500"
            />
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">Không tìm thấy học sinh nào</div>
            ) : (
              filteredStudents.map((s) => {
                const isCalled = engine.isStudentCalled(s.id);
                const isExcluded = engine.isStudentExcluded(s.id);

                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between p-2 rounded-lg bg-[#1a1c20] border transition text-xs ${
                      isCalled
                        ? 'border-emerald-500/20 text-slate-400'
                        : isExcluded
                        ? 'border-rose-500/20 opacity-50 line-through'
                        : 'border-white/5 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isExcluded ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : isCalled ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate">{s.name}</span>
                      {s.isHost && (
                        <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded shrink-0">Host</span>
                      )}
                    </div>

                    {!s.isHost && (
                      <button
                        onClick={() => manager.toggleManualExclude(s.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                          isExcluded
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                        }`}
                      >
                        {isExcluded ? 'Khôi phục' : 'Loại trừ'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: SETTINGS PANEL */}
      {currentView === 'settings' && (
        <div className="p-4 flex flex-col gap-3 h-[420px]">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('main')}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại</span>
            </button>
            <span className="text-xs font-bold text-white">Cài đặt Extension</span>
            <div className="w-4" />
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="flex items-center justify-between p-2.5 bg-[#1e2025] rounded-xl border border-white/5 cursor-pointer hover:bg-[#25282f] transition">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Hiệu ứng âm thanh</span>
                  <span className="text-[10px] text-slate-400">Chuông chúc mừng khi quay trúng</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => {
                  setSoundEnabled(e.target.checked);
                  soundManager.setEnabled(e.target.checked);
                }}
                className="rounded accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#1e2025] rounded-xl border border-white/5 cursor-pointer hover:bg-[#25282f] transition">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Hiệu ứng lướt tên</span>
                  <span className="text-[10px] text-slate-400">Animation 600ms trước khi dừng</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={animEnabled}
                onChange={(e) => setAnimEnabled(e.target.checked)}
                className="rounded accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#1e2025] rounded-xl border border-white/5 cursor-pointer hover:bg-[#25282f] transition">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Tự loại trừ Giáo viên (Host)</span>
                  <span className="text-[10px] text-slate-400">Không random người chủ trì phòng</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={excludeHost}
                onChange={onToggleExcludeHost}
                className="rounded accent-purple-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#1e2025] rounded-xl border border-white/5 cursor-pointer hover:bg-[#25282f] transition">
              <div className="flex items-center gap-2">
                <Layout className="w-4 h-4 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Widget nổi trong Meet</span>
                  <span className="text-[10px] text-slate-400">Thanh bấm trực tiếp trên Google Meet</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={floatingWidgetVisible}
                onChange={onToggleFloatingWidget}
                className="rounded accent-amber-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-[#1e2025] rounded-xl border border-white/5 cursor-pointer hover:bg-[#25282f] transition">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Chế độ Debug Log</span>
                  <span className="text-[10px] text-slate-400">Ghi log sự kiện vào console</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => {
                  setDebugMode(e.target.checked);
                  manager.setDebug(e.target.checked);
                }}
                className="rounded accent-blue-600"
              />
            </label>
          </div>

          <div className="mt-auto text-center text-[10px] text-slate-500 pt-3 border-t border-white/5">
            Meet Random Picker v1.0.0 • Local-First & Private
          </div>
        </div>
      )}
    </div>
  );
};
