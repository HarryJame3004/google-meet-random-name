import React from 'react';
import { Terminal, Trash2, ShieldCheck, Cpu } from 'lucide-react';
import { ExtensionLogEntry } from '../types/index.ts';

interface DebugConsoleProps {
  logs: ExtensionLogEntry[];
  onClear: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({ logs, onClear }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Nhật Ký Sự Kiện Realtime (Debug Stream)
          </h3>
          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
            {logs.length} sự kiện
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Idle CPU: <b className="text-emerald-400 font-bold">~0.0%</b> (Debounce 300ms)</span>
          </div>

          <button
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
            title="Xóa log"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xóa</span>
          </button>
        </div>
      </div>

      <div className="font-mono text-[11px] h-32 overflow-y-auto flex flex-col gap-1 pr-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
        {logs.length === 0 ? (
          <div className="text-slate-600 text-center py-8">Chưa có sự kiện nào. Hãy tương tác với Meet hoặc bấm Random.</div>
        ) : (
          logs.map((log) => {
            let catColor = 'text-sky-400';
            if (log.category === 'ParticipantDetector') catColor = 'text-amber-400';
            if (log.category === 'StudentManager') catColor = 'text-purple-400';
            if (log.category === 'RandomEngine') catColor = 'text-emerald-400';

            let msgColor = 'text-slate-300';
            if (log.type === 'success') msgColor = 'text-emerald-300 font-bold';
            if (log.type === 'warn') msgColor = 'text-amber-300';
            if (log.type === 'error') msgColor = 'text-rose-400 font-bold';

            return (
              <div key={log.id} className="flex items-start gap-2 leading-tight">
                <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                <span className={`font-bold shrink-0 ${catColor}`}>[{log.category}]</span>
                <span className={msgColor}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
