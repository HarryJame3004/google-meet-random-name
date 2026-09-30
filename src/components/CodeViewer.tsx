import React, { useState } from 'react';
import { Copy, Check, FileCode, Folder } from 'lucide-react';

interface FileDefinition {
  path: string;
  name: string;
  category: string;
  language: string;
  content: string;
}

export const CodeViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const files: FileDefinition[] = [
    {
      path: 'manifest.json',
      name: 'manifest.json',
      category: 'Config',
      language: 'json',
      content: `{
  "manifest_version": 3,
  "name": "Meet Random Picker - Gọi ngẫu nhiên học sinh Google Meet",
  "short_name": "MeetRandom",
  "version": "1.0.0",
  "description": "Chrome Extension hỗ trợ giáo viên gọi học sinh ngẫu nhiên trong Google Meet không trùng lặp, tự động nhận diện người tham gia theo thời gian thực.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://meet.google.com/*"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Meet Random Picker"
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*"],
      "js": [
        "core/random-engine.js",
        "core/student-manager.js",
        "content/participant-detector.js",
        "content/meet-widget.js"
      ],
      "css": ["content/meet-widget.css"],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "random-pick": {
      "suggested_key": { "default": "Alt+Shift+R", "mac": "Command+Shift+R" },
      "description": "Gọi ngẫu nhiên học sinh tiếp theo"
    },
    "toggle-widget": {
      "suggested_key": { "default": "Alt+Shift+W", "mac": "Command+Shift+W" },
      "description": "Bật/tắt widget nổi trong Meet"
    }
  }
}`,
    },
    {
      path: 'core/random-engine.js',
      name: 'random-engine.js',
      category: 'Core',
      language: 'javascript',
      content: `/**
 * Meet Random Picker - RandomEngine (Core Mathematical Module)
 * Guarantees zero duplicate picks in the same session without replacement.
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
        if (!s.isHost) this.availableIds.add(id);
        else this.excludedIds.add(id);
      }
      return;
    }

    // Sync mode preserves already selected/excluded students
    const existingIds = new Set(this.studentsMap.keys());
    this.studentsMap = newStudentsMap;

    for (const [id, s] of this.studentsMap) {
      if (!existingIds.has(id)) {
        if (s.isHost) this.excludedIds.add(id);
        else if (!this.selectedIds.has(id) && !this.excludedIds.has(id)) {
          this.availableIds.add(id);
        }
      }
    }

    for (const id of Array.from(this.availableIds)) {
      if (!this.studentsMap.has(id)) this.availableIds.delete(id);
    }
  }

  pick() {
    const available = Array.from(this.availableIds);
    if (available.length === 0) {
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
    this.history.push({ studentId: chosenId, timestamp: Date.now() });

    return {
      student: chosenStudent,
      status: 'SUCCESS',
      remainingCount: this.availableIds.size,
      totalCount: this.getEligibleCount(),
      calledCount: this.selectedIds.size,
    };
  }

  reset() {
    this.selectedIds.clear();
    this.history = [];
    this.lastSelectedId = null;
    this.availableIds.clear();
    for (const [id] of this.studentsMap) {
      if (!this.excludedIds.has(id)) this.availableIds.add(id);
    }
  }

  hasRemaining() {
    return this.availableIds.size > 0;
  }

  getCounts() {
    return {
      total: this.studentsMap.size,
      eligible: this.availableIds.size + this.selectedIds.size,
      available: this.availableIds.size,
      called: this.selectedIds.size,
      excluded: this.excludedIds.size,
    };
  }
}`,
    },
    {
      path: 'content/participant-detector.js',
      name: 'participant-detector.js',
      category: 'Content',
      language: 'javascript',
      content: `/**
 * Multi-layer resilient Google Meet Participant Detector
 * Uses MutationObserver with 300ms debounce to maintain near-zero CPU usage.
 */
class ParticipantDetector {
  constructor(options = {}) {
    this.observer = null;
    this.debounceTimer = null;
    this.heartbeat = null;
    this.listeners = [];
    this.doc = options.doc || document;
  }

  start() {
    this.stop();
    this.scheduleScan(0);

    const target = this.doc.body || this.doc.documentElement;
    if (target) {
      this.observer = new MutationObserver(() => this.scheduleScan(300));
      this.observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-participant-id', 'class']
      });
    }

    this.heartbeat = setInterval(() => this.scheduleScan(0), 4000);
  }

  scheduleScan(delay) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (delay === 0) return this.scanNow();
    this.debounceTimer = setTimeout(() => this.scanNow(), delay);
  }

  scanNow() {
    let result = this.scanPeoplePanel();
    if (result.length > 0) return this.emit(result, 'Layer 1: People Panel');
    result = this.scanVideoTiles();
    if (result.length > 0) return this.emit(result, 'Layer 2: Video Grid');
    result = this.scanAria();
    if (result.length > 0) return this.emit(result, 'Layer 3: ARIA List');
  }

  emit(participants, layer) {
    for (const cb of this.listeners) cb({ status: 'CONNECTED', participants, layerUsed: layer });
  }

  onUpdate(cb) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(f => f !== cb); };
  }
}`,
    },
    {
      path: 'content/meet-widget.js',
      name: 'meet-widget.js',
      category: 'Widget',
      language: 'javascript',
      content: `/**
 * Draggable Floating In-Meet Widget with sound and animation
 */
(function() {
  if (document.getElementById('meet-random-picker-widget-root')) return;
  const engine = new RandomEngine();
  const manager = new StudentManager(engine, { excludeHost: true });
  const detector = new ParticipantDetector();

  // Create UI Root
  const root = document.createElement('div');
  root.id = 'meet-random-picker-widget-root';
  root.className = 'mrp-floating-container';
  // ... (Full implementation in /extension/content/meet-widget.js)
})();`,
    },
  ];

  const [selectedFile, setSelectedFile] = useState<FileDefinition>(files[0]);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto py-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Trình Xem Mã Nguồn Extension</h2>
          <p className="text-xs text-slate-400">Xem trực tiếp từng tệp cấu thành Chrome Extension Manifest V3</p>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Đã sao chép!' : 'Sao chép mã'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl min-h-[500px]">
        {/* Sidebar file list */}
        <div className="bg-slate-950/60 p-3 border-r border-slate-800 flex flex-col gap-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5" />
            <span>Files (/extension)</span>
          </div>

          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition text-left ${
                selectedFile.path === file.path
                  ? 'bg-blue-600/20 text-blue-300 font-bold border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">
                {file.category}
              </span>
            </button>
          ))}
        </div>

        {/* Code display area */}
        <div className="md:col-span-3 flex flex-col overflow-hidden bg-slate-950">
          <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>{selectedFile.path}</span>
            <span className="text-[11px] text-slate-500 uppercase">{selectedFile.language}</span>
          </div>

          <pre className="flex-1 p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed select-text">
            <code>{selectedFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
