import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  PhoneOff,
  Users,
  MessageSquare,
  Sparkles,
  Info,
  Maximize2,
  Volume2,
  VolumeX,
  Plus,
  UserMinus,
  RefreshCw,
  Move,
  Minus,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SimulatedParticipant, ExtensionLogEntry } from '../types/index.ts';
import { INITIAL_CLASSROOM } from '../data/mock-class.ts';
import { StudentManager } from '../core/student-manager.ts';
import { RandomEngine, Student } from '../core/random-engine.ts';
import { soundManager } from '../core/sound-effects.ts';

interface MeetSimulatorProps {
  engine: RandomEngine;
  manager: StudentManager;
  onLog: (entry: Omit<ExtensionLogEntry, 'id' | 'timestamp'>) => void;
  floatingWidgetVisible: boolean;
  onToggleFloatingWidget: () => void;
  excludeHost: boolean;
  onToggleExcludeHost: () => void;
}

export const MeetSimulator: React.FC<MeetSimulatorProps> = ({
  engine,
  manager,
  onLog,
  floatingWidgetVisible,
  onToggleFloatingWidget,
  excludeHost,
  onToggleExcludeHost,
}) => {
  const [participants, setParticipants] = useState<SimulatedParticipant[]>(INITIAL_CLASSROOM);
  const [isPeoplePanelOpen, setIsPeoplePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'people' | 'chat'>('people');
  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);

  // Floating widget states
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState(false);
  const [widgetPosition, setWidgetPosition] = useState({ x: 30, y: 100 });
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPickingAnimation, setIsPickingAnimation] = useState(false);
  const [rollingCandidateName, setRollingCandidateName] = useState<string>('— Chưa quay —');
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [soundOn, setSoundOn] = useState(true);
  const [lastWinnerId, setLastWinnerId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Sync simulator participants to StudentManager & RandomEngine
  useEffect(() => {
    const rawList = participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
    }));

    manager.syncFromRawParticipants(rawList);
    onLog({
      category: 'ParticipantDetector',
      message: `Đã phát hiện ${rawList.length} người trong phòng Google Meet (${isPeoplePanelOpen ? 'Layer 1: People Panel' : 'Layer 2: Video Grid Tiles'})`,
      type: 'info',
    });
  }, [participants, isPeoplePanelOpen]);

  // Handle widget dragging inside simulator
  const handleWidgetMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDraggingWidget(true);
    const rect = widgetRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingWidget || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newX = e.clientX - containerRect.left - dragOffset.x;
      const newY = e.clientY - containerRect.top - dragOffset.y;

      const boundedX = Math.max(10, Math.min(containerRect.width - 290, newX));
      const boundedY = Math.max(10, Math.min(containerRect.height - 240, newY));

      setWidgetPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDraggingWidget(false);
    };

    if (isDraggingWidget) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingWidget, dragOffset]);

  // Trigger Random Pick with smooth animation
  const handleRandomPick = async () => {
    if (isPickingAnimation) return;
    if (!engine.hasRemaining()) {
      soundManager.playCompletedChime();
      onLog({
        category: 'RandomEngine',
        message: 'Tất cả học sinh trong danh sách đã được gọi hết! Vui lòng bấm Reset để bắt đầu vòng mới.',
        type: 'warn',
      });
      alert('🎉 Đã gọi hết tất cả học sinh trong lớp! Hãy bấm "Đặt lại vòng mới" (Reset) để bắt đầu lượt mới.');
      return;
    }

    setIsPickingAnimation(true);
    onLog({
      category: 'RandomEngine',
      message: 'Bắt đầu vòng quay ngẫu nhiên...',
      type: 'info',
    });

    const available = engine.getAvailableStudents();
    const loops = Math.min(10, available.length * 2);

    for (let i = 0; i < loops; i++) {
      const candidate = available[Math.floor(Math.random() * available.length)];
      setRollingCandidateName(candidate.name);
      if (soundOn) soundManager.playTick();
      await new Promise((r) => setTimeout(r, 65));
    }

    // Atomically select candidate from RandomEngine
    const result = engine.pick();
    setIsPickingAnimation(false);

    if (result.status === 'SUCCESS' && result.student) {
      setSelectedStudentName(result.student.name);
      setRollingCandidateName(result.student.name);
      setLastWinnerId(result.student.id);

      onLog({
        category: 'RandomEngine',
        message: `Đã chọn: "${result.student.name}" (Lần ${result.calledCount}/${result.totalCount}). Còn lại: ${result.remainingCount}`,
        type: 'success',
      });

      if (soundOn) {
        soundManager.playWinnerFanfare();
      }

      // Celebrate with confetti
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.65 },
        });
      } catch {
        // Safe fallback
      }
    } else if (result.status === 'ALREADY_COMPLETED') {
      soundManager.playCompletedChime();
      setSelectedStudentName('Đã gọi hết cả lớp');
      onLog({
        category: 'RandomEngine',
        message: 'Tất cả học sinh đã được gọi trong vòng này!',
        type: 'warn',
      });
    }
  };

  // Reset Session
  const handleResetSession = () => {
    const ok = window.confirm('Bạn có chắc chắn muốn đặt lại vòng gọi ngẫu nhiên mới cho toàn bộ học sinh?');
    if (ok) {
      engine.reset();
      setSelectedStudentName('');
      setRollingCandidateName('— Sẵn sàng —');
      setLastWinnerId(null);
      soundManager.playResetSound();
      onLog({
        category: 'RandomEngine',
        message: 'Đã Reset vòng quay: tất cả học sinh đã sẵn sàng cho lượt mới.',
        type: 'info',
      });
    }
  };

  // Simulator helper: add student
  const handleAddStudent = () => {
    const studentNames = [
      'Phan Thế Hiển',
      'Đặng Thùy Dương',
      'Lê Tuấn Khang',
      'Ngô Gia Bảo',
      'Hoàng Yến Nhi',
      'Tô Hoài Nam',
    ];
    const name = studentNames[Math.floor(Math.random() * studentNames.length)];
    const newId = `p_new_${Date.now()}`;
    const newStudent: SimulatedParticipant = {
      id: newId,
      name,
      isHost: false,
      avatarColor: '#10b981',
      isCameraOn: true,
      isMuted: true,
      joinedAt: Date.now(),
    };

    setParticipants((prev) => [...prev, newStudent]);
    onLog({
      category: 'ParticipantDetector',
      message: `[MutationObserver] Phát hiện học sinh mới vào lớp: ${name}`,
      type: 'info',
    });
  };

  // Simulator helper: remove student
  const handleRemoveStudent = () => {
    const studentsOnly = participants.filter((p) => !p.isHost);
    if (studentsOnly.length === 0) return;
    const toRemove = studentsOnly[studentsOnly.length - 1];
    setParticipants((prev) => prev.filter((p) => p.id !== toRemove.id));
    onLog({
      category: 'ParticipantDetector',
      message: `[MutationObserver] Học sinh rời lớp: ${toRemove.name}`,
      type: 'warn',
    });
  };

  // Simulator helper: reset to 25
  const handleResetClassroom = () => {
    setParticipants(INITIAL_CLASSROOM);
    engine.reset();
    setSelectedStudentName('');
    setRollingCandidateName('— Sẵn sàng —');
    onLog({
      category: 'StudentManager',
      message: 'Đã khôi phục lớp học chuẩn 25 học sinh',
      type: 'info',
    });
  };

  const counts = engine.getCounts();

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative">
      {/* Top Test Controls Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
            Mô phỏng Google Meet DOM
          </span>
          <span className="text-slate-400">
            Học sinh hiện tại: <b className="text-white">{participants.length}</b> (Gồm 1 Giáo viên)
          </span>
        </div>

        {/* Meet Action Triggers for testing */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAddStudent}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition"
            title="Thêm học sinh mới vào phòng (Test realtime join)"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Học sinh vào lớp</span>
          </button>

          <button
            onClick={handleRemoveStudent}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition"
            title="Mô phỏng 1 học sinh thoát khỏi cuộc gọi"
          >
            <UserMinus className="w-3.5 h-3.5 text-amber-400" />
            <span>Học sinh rời lớp</span>
          </button>

          <button
            onClick={handleResetClassroom}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition"
            title="Khôi phục danh sách 25 học sinh ban đầu"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Đặt lại 25 HS</span>
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <button
            onClick={onToggleFloatingWidget}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border transition ${
              floatingWidgetVisible
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span>{floatingWidgetVisible ? 'Ẩn Widget nổi' : 'Hiện Widget nổi'}</span>
          </button>

          <button
            onClick={onToggleExcludeHost}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border transition ${
              excludeHost
                ? 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span>{excludeHost ? '🛡️ Tự loại trừ Host' : 'Đang cho phép Host'}</span>
          </button>
        </div>
      </div>

      {/* Main Google Meet Area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative min-h-[520px]">
        {/* Left: Video Tiles Area */}
        <div className="flex-1 flex flex-col bg-[#202124] overflow-hidden relative">
          {/* Google Meet Room Header */}
          <div className="h-10 px-4 flex items-center justify-between text-xs text-slate-400 border-b border-[#2d2e30]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200">Lớp 12A1 — Tiết Toán Hình</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400 font-mono">abc-defg-hij</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Trực tiếp
              </span>
              <span>10:30 AM</span>
            </div>
          </div>

          {/* Video Grid Tiles Container (Tagged with standard Google Meet semantic attributes) */}
          <div
            data-meet-mock="true"
            className="flex-1 p-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 content-start"
          >
            {participants.map((p) => {
              const isSelected = p.id === lastWinnerId;
              const isCalled = engine.isStudentCalled(p.id);

              return (
                <div
                  key={p.id}
                  data-participant-id={p.id}
                  data-self-name={p.name}
                  data-is-host={p.isHost ? 'true' : 'false'}
                  className={`group relative aspect-video rounded-xl bg-[#2b2d30] border flex flex-col items-center justify-center p-2 transition-all duration-300 ${
                    isSelected
                      ? 'border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20 scale-[1.02]'
                      : isCalled
                      ? 'border-slate-700/60 opacity-80'
                      : 'border-transparent hover:border-slate-600'
                  }`}
                >
                  {/* Avatar / Camera view */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-md relative"
                    style={{ backgroundColor: p.avatarColor }}
                  >
                    {p.name.charAt(0)}
                    {isCalled && !p.isHost && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-[#2b2d30]">
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Top-Right Mute Icon */}
                  <div className="absolute top-2 right-2 p-1 rounded-full bg-black/40 text-slate-300">
                    {p.isMuted ? <MicOff className="w-3 h-3 text-red-400" /> : <Mic className="w-3 h-3 text-emerald-400" />}
                  </div>

                  {/* Bottom Participant Name Badge (Crucial Google Meet DOM element parsed by detector) */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-md">
                    <span className="truncate text-slate-200 font-medium" title={p.name}>
                      {p.name}
                    </span>
                    {p.isHost && (
                      <span className="ml-1 text-[9px] bg-blue-600/80 text-white px-1 rounded uppercase tracking-wider shrink-0">
                        Host
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Google Meet Bottom Controls Bar */}
          <div className="h-16 bg-[#202124] border-t border-[#2d2e30] px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 text-sm text-slate-300 font-medium">
              <span>abc-defg-hij</span>
            </div>

            {/* Core Control Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMicActive(!micActive)}
                className={`p-3 rounded-full transition ${
                  micActive ? 'bg-[#3c4043] hover:bg-[#474a4e] text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setCamActive(!camActive)}
                className={`p-3 rounded-full transition ${
                  camActive ? 'bg-[#3c4043] hover:bg-[#474a4e] text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {camActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              <button className="p-3 rounded-full bg-[#3c4043] hover:bg-[#474a4e] text-white">
                <Hand className="w-5 h-5" />
              </button>

              <button className="p-3 rounded-full bg-[#3c4043] hover:bg-[#474a4e] text-white">
                <Sparkles className="w-5 h-5" />
              </button>

              <button className="px-5 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1.5 ml-2">
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>

            {/* Right Meet Toggles (People panel, Chat, Info) */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsPeoplePanelOpen(!isPeoplePanelOpen);
                  setActiveTab('people');
                }}
                className={`p-2.5 rounded-full relative transition ${
                  isPeoplePanelOpen && activeTab === 'people'
                    ? 'bg-blue-600/30 text-blue-400'
                    : 'text-slate-400 hover:bg-[#3c4043]'
                }`}
                title="Mở danh sách mọi người"
              >
                <Users className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 bg-slate-700 text-white text-[10px] px-1.5 rounded-full font-bold">
                  {participants.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setIsPeoplePanelOpen(!isPeoplePanelOpen);
                  setActiveTab('chat');
                }}
                className={`p-2.5 rounded-full transition ${
                  isPeoplePanelOpen && activeTab === 'chat'
                    ? 'bg-blue-600/30 text-blue-400'
                    : 'text-slate-400 hover:bg-[#3c4043]'
                }`}
                title="Mở hộp trò chuyện"
              >
                <MessageSquare className="w-5 h-5" />
              </button>

              <button className="p-2.5 rounded-full text-slate-400 hover:bg-[#3c4043]">
                <Info className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Google Meet People / Chat Side Panel (Matches Layer 1 Detector DOM structure) */}
        {isPeoplePanelOpen && (
          <div
            aria-label="People"
            data-panel-id="participants"
            className="w-72 bg-[#28292c] border-l border-[#3c4043] flex flex-col shrink-0 text-slate-200 transition-all duration-200"
          >
            {/* Panel Tabs */}
            <div className="flex border-b border-[#3c4043] text-xs font-semibold">
              <button
                onClick={() => setActiveTab('people')}
                className={`flex-1 py-3 text-center transition border-b-2 ${
                  activeTab === 'people'
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Mọi người ({participants.length})
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-center transition border-b-2 ${
                  activeTab === 'chat'
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Trò chuyện
              </button>
            </div>

            {activeTab === 'people' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-[#3c4043]/50">
                  <input
                    type="text"
                    placeholder="Tìm kiếm người tham gia..."
                    className="w-full bg-[#1e1f22] text-xs text-slate-200 px-3 py-1.5 rounded-md border border-[#3c4043] outline-none focus:border-blue-500"
                  />
                </div>

                {/* Participant List (Layer 1 DOM role="list" / role="listitem") */}
                <div role="list" className="flex-1 overflow-y-auto divide-y divide-[#3c4043]/30">
                  {participants.map((p) => {
                    const isCalled = engine.isStudentCalled(p.id);
                    const isExcluded = engine.isStudentExcluded(p.id);

                    return (
                      <div
                        key={p.id}
                        role="listitem"
                        data-participant-id={p.id}
                        className="px-3 py-2 flex items-center justify-between hover:bg-[#343538] transition group"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: p.avatarColor }}
                          >
                            {p.name.charAt(0)}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span
                              className={`text-xs font-medium truncate ${
                                isCalled ? 'text-slate-400' : 'text-slate-200'
                              }`}
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            {p.isHost && (
                              <span className="text-[10px] text-blue-400 font-semibold">Chủ trì cuộc họp</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isCalled && !p.isHost && (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                              ✓ Đã gọi
                            </span>
                          )}
                          {isExcluded && !p.isHost && (
                            <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                              ✕ Loại trừ
                            </span>
                          )}
                          <div className="text-slate-500 p-1">
                            {p.isMuted ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 p-4 flex flex-col items-center justify-center text-slate-500 text-xs text-center">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <span>Không có tin nhắn nào trong cuộc gọi.</span>
              </div>
            )}
          </div>
        )}

        {/* IN-MEET FLOATING DRAGGABLE WIDGET (Interactive representation) */}
        {floatingWidgetVisible && (
          <div
            ref={widgetRef}
            style={{
              position: 'absolute',
              left: `${widgetPosition.x}px`,
              top: `${widgetPosition.y}px`,
              zIndex: 50,
            }}
            className="w-72 bg-[#1e1f22]/95 backdrop-blur-md text-slate-100 rounded-2xl shadow-2xl border border-white/10 select-none overflow-hidden transition-shadow hover:shadow-blue-500/10"
          >
            {/* Widget Draggable Header */}
            <div
              onMouseDown={handleWidgetMouseDown}
              className="px-3.5 py-2.5 bg-[#2b2d31] flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-white/5"
            >
              <div className="flex items-center gap-2">
                <Move className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold tracking-tight">🎓 Random Picker</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded-full">
                  {counts.available} còn
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSoundOn(!soundOn)}
                  className="p-1 rounded text-slate-400 hover:text-white transition"
                  title="Bật/Tắt âm thanh"
                >
                  {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                <button
                  onClick={() => setIsWidgetCollapsed(!isWidgetCollapsed)}
                  className="p-1 rounded text-slate-400 hover:text-white transition"
                  title={isWidgetCollapsed ? 'Mở rộng' : 'Thu nhỏ'}
                >
                  {isWidgetCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Widget Body */}
            {!isWidgetCollapsed && (
              <div className="p-3.5 flex flex-col gap-3">
                {/* Stats Row */}
                <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                  <span>
                    <b className="text-sky-400 font-bold">{counts.available}</b> còn lại
                  </span>
                  <span className="text-slate-600">•</span>
                  <span>
                    <b className="text-emerald-400 font-bold">{counts.called}</b> đã gọi
                  </span>
                </div>

                {/* Pick Showcase Box */}
                <div
                  className={`bg-[#121316] rounded-xl p-3 text-center border transition-all duration-200 ${
                    isPickingAnimation
                      ? 'border-sky-500/50 shadow-md shadow-sky-500/20'
                      : selectedStudentName
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-white/5'
                  }`}
                >
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    {isPickingAnimation ? 'Đang quay...' : 'Học sinh được chọn:'}
                  </div>
                  <div className="text-base font-extrabold text-white truncate min-h-[24px]">
                    {rollingCandidateName}
                  </div>
                </div>

                {/* RANDOM Button */}
                <button
                  onClick={handleRandomPick}
                  disabled={isPickingAnimation}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs tracking-wide shadow-lg flex items-center justify-center gap-2 transition duration-200 ${
                    counts.available === 0 && counts.called > 0
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0'
                  }`}
                >
                  <span className="text-sm">🎲</span>
                  <span>
                    {counts.available === 0 && counts.called > 0
                      ? '🎉 ĐÃ GỌI HẾT CẢ LỚP!'
                      : 'RANDOM HỌC SINH'}
                  </span>
                </button>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-400">
                  <button
                    onClick={handleResetSession}
                    className="flex items-center gap-1 hover:text-white transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>Reset vòng</span>
                  </button>
                  <span className="text-[10px] text-slate-500">Phím tắt: Alt+Shift+R</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
