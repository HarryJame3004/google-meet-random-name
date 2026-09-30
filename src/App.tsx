/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Download,
  ShieldCheck,
  Code2,
  Tv,
  CheckCircle,
  HelpCircle,
  Dice5,
  Users,
  Layers,
} from 'lucide-react';
import { RandomEngine } from './core/random-engine.ts';
import { StudentManager } from './core/student-manager.ts';
import { MeetSimulator } from './components/MeetSimulator.tsx';
import { ExtensionPopupModal } from './components/ExtensionPopupModal.tsx';
import { TestRunnerView } from './components/TestRunnerView.tsx';
import { ExtensionDownloader } from './components/ExtensionDownloader.tsx';
import { CodeViewer } from './components/CodeViewer.tsx';
import { DebugConsole } from './components/DebugConsole.tsx';
import { ExtensionLogEntry } from './types/index.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'tests' | 'download' | 'code'>('simulator');
  const [floatingWidgetVisible, setFloatingWidgetVisible] = useState(true);
  const [excludeHost, setExcludeHost] = useState(true);
  const [showPopupSidePreview, setShowPopupSidePreview] = useState(true);

  // Core engines
  const engine = useMemo(() => new RandomEngine({ debug: true }), []);
  const manager = useMemo(() => new StudentManager(engine, { excludeHost: true, debug: true }), [engine]);

  // Log stream
  const [logs, setLogs] = useState<ExtensionLogEntry[]>([
    {
      id: 'init_1',
      timestamp: new Date().toLocaleTimeString(),
      category: 'MeetRandom',
      message: 'Hệ thống Meet Random Picker đã sẵn sàng. Manifest V3 đã được cấu hình.',
      type: 'info',
    },
    {
      id: 'init_2',
      timestamp: new Date().toLocaleTimeString(),
      category: 'ParticipantDetector',
      message: 'Khởi tạo bộ quét đa tầng (People Panel -> Video Grid -> ARIA listitem -> Data attributes).',
      type: 'info',
    },
  ]);

  const addLog = useCallback((entry: Omit<ExtensionLogEntry, 'id' | 'timestamp'>) => {
    setLogs((prev) => [
      {
        ...entry,
        id: `log_${Date.now()}_${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleToggleExcludeHost = () => {
    const nextVal = !excludeHost;
    setExcludeHost(nextVal);
    manager.setExcludeHost(nextVal);
    addLog({
      category: 'StudentManager',
      message: nextVal ? 'Đã bật chế độ tự động loại trừ Host/Giáo viên' : 'Đã cho phép Giáo viên tham gia Random',
      type: 'warn',
    });
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">
            🎓
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white">Meet Random Picker</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Chrome Extension V3
              </span>
            </div>
            <p className="text-xs text-slate-400">Gọi học sinh ngẫu nhiên Google Meet không trùng lặp cho giáo viên</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Mô Phỏng Google Meet</span>
          </button>

          <button
            onClick={() => setActiveTab('tests')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'tests'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Kiểm Thử (10 Tests)</span>
          </button>

          <button
            onClick={() => setActiveTab('download')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'download'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải Extension (.ZIP)</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'code'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mã Nguồn</span>
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {/* TAB 1: GOOGLE MEET SIMULATOR & EXTENSION PREVIEW */}
        {activeTab === 'simulator' && (
          <div className="flex flex-col gap-6">
            {/* Quick Feature Highlights Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Không Trùng Lặp 100%</span>
                  <span className="text-[11px] text-slate-400">Available vs Selected tách biệt</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Multi-Tier Detector</span>
                  <span className="text-[11px] text-slate-400">Quét 4 tầng chống đổi DOM Meet</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Tự Loại Trừ Giáo Viên</span>
                  <span className="text-[11px] text-slate-400">Không gọi Host / Người chủ trì</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <Dice5 className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">2 Giao Diện Linh Hoạt</span>
                  <span className="text-[11px] text-slate-400">Widget nổi trong Meet & Popup</span>
                </div>
              </div>
            </div>

            {/* Main Stage: Google Meet Simulator + Extension Popup Preview */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Simulator Column */}
              <div className="flex-1 w-full min-h-[580px] flex flex-col">
                <MeetSimulator
                  engine={engine}
                  manager={manager}
                  onLog={addLog}
                  floatingWidgetVisible={floatingWidgetVisible}
                  onToggleFloatingWidget={() => setFloatingWidgetVisible(!floatingWidgetVisible)}
                  excludeHost={excludeHost}
                  onToggleExcludeHost={handleToggleExcludeHost}
                />
              </div>

              {/* Side Column: Chrome Extension Popup Preview */}
              {showPopupSidePreview && (
                <div className="w-full lg:w-[360px] flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span className="font-semibold text-slate-300">Xem trước Extension Popup</span>
                    <button
                      onClick={() => setShowPopupSidePreview(false)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      Ẩn
                    </button>
                  </div>

                  <ExtensionPopupModal
                    engine={engine}
                    manager={manager}
                    onLog={addLog}
                    excludeHost={excludeHost}
                    onToggleExcludeHost={handleToggleExcludeHost}
                    floatingWidgetVisible={floatingWidgetVisible}
                    onToggleFloatingWidget={() => setFloatingWidgetVisible(!floatingWidgetVisible)}
                  />
                </div>
              )}
            </div>

            {/* Debug Console at bottom of simulator */}
            <DebugConsole logs={logs} onClear={() => setLogs([])} />
          </div>
        )}

        {/* TAB 2: AUTOMATED TEST SUITE */}
        {activeTab === 'tests' && <TestRunnerView />}

        {/* TAB 3: DOWNLOAD EXTENSION ZIP & GUIDE */}
        {activeTab === 'download' && <ExtensionDownloader />}

        {/* TAB 4: CODE VIEWER */}
        {activeTab === 'code' && <CodeViewer />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Meet Random Picker • Chrome Extension Manifest V3 • An toàn & Bảo mật cho lớp học</span>
        <span>Phím tắt: Alt+Shift+R (Mac: Option+Shift+R)</span>
      </footer>
    </div>
  );
}
