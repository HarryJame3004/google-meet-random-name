import React, { useState, useEffect } from 'react';
import { Play, CheckCircle, XCircle, Clock, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { runAllTests, TestSuiteSummary } from '../core/test-suite.ts';

export const TestRunnerView: React.FC = () => {
  const [suiteResult, setSuiteResult] = useState<TestSuiteSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const summary = runAllTests();
      setSuiteResult(summary);
      setIsRunning(false);
    }, 150);
  };

  useEffect(() => {
    executeTests();
  }, []);

  const filteredTests = suiteResult?.results.filter((t) => {
    if (filter === 'passed') return t.passed;
    if (filter === 'failed') return !t.passed;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-2">
      {/* Test Runner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Hệ Thống Kiểm Thử Tự Động (Test Suite)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Kiểm thử toàn bộ các ràng buộc nghiêm ngặt: Không trùng lặp, Khắc phục DOM Meet, Quản lý Session, Reset & Xử lý biên.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={executeTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Đang chạy kiểm thử...' : 'Chạy lại toàn bộ Test'}</span>
          </button>
        </div>
      </div>

      {/* Summary Scorecard */}
      {suiteResult && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Tổng số ca kiểm thử</span>
            <div className="text-2xl font-black text-white mt-1">{suiteResult.total} Tests</div>
          </div>

          <div className="bg-slate-900 border border-emerald-500/20 bg-emerald-950/10 p-4 rounded-xl">
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Đạt yêu cầu (Passed)
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {suiteResult.passed} / {suiteResult.total}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs text-rose-400 font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Thất bại (Failed)
            </span>
            <div className="text-2xl font-black text-rose-400 mt-1">{suiteResult.failed}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs text-sky-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Thời gian thực thi
            </span>
            <div className="text-2xl font-black text-sky-400 mt-1">{suiteResult.durationMs} ms</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg transition font-medium ${
            filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Tất cả ({suiteResult?.total || 0})
        </button>
        <button
          onClick={() => setFilter('passed')}
          className={`px-3 py-1.5 rounded-lg transition font-medium ${
            filter === 'passed' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Đạt ({suiteResult?.passed || 0})
        </button>
        <button
          onClick={() => setFilter('failed')}
          className={`px-3 py-1.5 rounded-lg transition font-medium ${
            filter === 'failed' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Lỗi ({suiteResult?.failed || 0})
        </button>
      </div>

      {/* Test List Table */}
      <div className="flex flex-col gap-3">
        {filteredTests?.map((test) => (
          <div
            key={test.id}
            className={`p-4 rounded-xl border transition-all ${
              test.passed
                ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                : 'bg-rose-950/20 border-rose-500/40'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {test.passed ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                      {test.id}
                    </span>
                    <span className="text-sm font-bold text-white">{test.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {test.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{test.message}</p>
                  {test.details && (
                    <div className="mt-1.5 font-mono text-[11px] bg-slate-950/70 p-2 rounded-md border border-slate-800 text-slate-400 overflow-x-auto">
                      {test.details}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[11px] font-mono text-slate-400">{test.durationMs} ms</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
