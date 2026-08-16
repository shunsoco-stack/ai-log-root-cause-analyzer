"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FileCode2,
  FileText,
  Filter,
  Info,
  LoaderCircle,
  LockKeyhole,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createLocalAnalysis, parseAnalysisResponse } from "@/lib/analysis";
import {
  buildDataset,
  citationFor,
  filterLogEntries,
  timestampToMs,
} from "@/lib/log-engine";
import { buildIncidentReport, buildShareSummary } from "@/lib/report";
import type {
  AnalysisDataset,
  AnalysisResult,
  LogEntry,
  LogLevel,
  LogSource,
} from "@/lib/types";
import { demoScenarios } from "@/data/demos";

type AppStage = "input" | "processing" | "result";
type MobileTab = "logs" | "analysis" | "timeline";
type ReviewStatus = "未確認" | "確認済み" | "対応候補" | "対象外";

const phases = ["Parsing", "Sanitizing", "Grouping", "AI Analysis", "Report"];
const acceptedExtensions = [".log", ".txt", ".json"];

function formatTime(timestamp: string | null) {
  if (!timestamp) return "--:--:--";
  const match = timestamp.match(/\d{2}:\d{2}:\d{2}/);
  return match?.[0] ?? timestamp;
}

function statusClass(level: LogLevel) {
  return `level level-${level.toLowerCase()}`;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warning" | "secure";
}) {
  return (
    <div className={`stat-card ${tone ? `stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InputWorkspace({
  onAnalyze,
}: {
  onAnalyze: (sources: LogSource[], demoId?: string) => void;
}) {
  const [mode, setMode] = useState<"demo" | "paste" | "upload">("demo");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<LogSource[]>([]);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const readFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const selected = [...(event.target.files ?? [])];
    if (!selected.length) return;
    if (selected.length > 8) {
      setError("一度に読み込めるファイルは8件までです。");
      return;
    }
    const unsupported = selected.find(
      (file) =>
        !acceptedExtensions.some((extension) =>
          file.name.toLowerCase().endsWith(extension),
        ),
    );
    if (unsupported) {
      setError(`${unsupported.name} は対応していません。.log / .txt / .json を選択してください。`);
      return;
    }
    const oversized = selected.find((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} は5MBを超えています。`);
      return;
    }
    const loaded = await Promise.all(
      selected.map(async (file) => ({ name: file.name, content: await file.text() })),
    );
    setFiles(loaded);
  };

  const start = () => {
    setError("");
    if (mode === "demo") {
      onAnalyze(demoScenarios[0].sources, demoScenarios[0].id);
      return;
    }
    const sources =
      mode === "paste"
        ? [{ name: "pasted.log", content: text }]
        : files;
    if (!sources.length || sources.every((source) => !source.content.trim())) {
      setError("解析するログを入力してください。");
      return;
    }
    onAnalyze(sources);
  };

  return (
    <main className="input-shell">
      <section className="intro" aria-labelledby="page-title">
        <div className="eyebrow">
          <ShieldCheck size={16} aria-hidden="true" />
          Local-first log triage
        </div>
        <h1 id="page-title">障害調査を、根拠まで辿れる形に。</h1>
        <p>
          ログをブラウザ内でParse・マスク・集約し、AIは原因候補の解釈だけを担当。
          件数と時系列は決定論的に算出します。
        </p>
        <div className="workflow-line" aria-label="解析ワークフロー">
          {["Parse", "Sanitize", "Group", "Analyze", "Review"].map((item, index) => (
            <span key={item}>
              <b>{item}</b>
              {index < 4 && <ChevronRight size={14} aria-hidden="true" />}
            </span>
          ))}
        </div>
      </section>

      <section className="input-card" aria-labelledby="input-heading">
        <div className="section-heading">
          <div>
            <span className="step-label">01 · INPUT</span>
            <h2 id="input-heading">解析するログを選択</h2>
          </div>
          <span className="privacy-chip">
            <LockKeyhole size={14} aria-hidden="true" />
            生ログは保存しません
          </span>
        </div>

        <div className="segmented" role="tablist" aria-label="入力方法">
          {(
            [
              ["demo", Play, "Demo"],
              ["paste", Clipboard, "Paste"],
              ["upload", Upload, "File Upload"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              type="button"
              key={value}
              role="tab"
              aria-selected={mode === value}
              className={mode === value ? "active" : ""}
              onClick={() => {
                setMode(value);
                setError("");
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {mode === "demo" && (
          <div className="demo-grid">
            {demoScenarios.map((demo, index) => (
              <button
                type="button"
                className="demo-card"
                key={demo.id}
                onClick={() => onAnalyze(demo.sources, demo.id)}
              >
                <span className="demo-number">0{index + 1}</span>
                <div>
                  <strong>{demo.title}</strong>
                  <p>{demo.description}</p>
                </div>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {mode === "paste" && (
          <div className="paste-field">
            <label htmlFor="log-input">ログ本文</label>
            <textarea
              id="log-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="2026-08-16T10:32:01Z ERROR Database connection timeout..."
              spellCheck={false}
            />
            <span>{text.split("\n").filter(Boolean).length.toLocaleString()} lines</span>
          </div>
        )}

        {mode === "upload" && (
          <div>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".log,.txt,.json"
              multiple
              onChange={readFiles}
            />
            <button
              type="button"
              className="drop-zone"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={24} aria-hidden="true" />
              <strong>ログファイルを選択</strong>
              <span>.log / .txt / .json · 各5MBまで · 最大8ファイル</span>
            </button>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((file) => (
                  <li key={file.name}>
                    <FileText size={16} aria-hidden="true" />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      aria-label={`${file.name}を削除`}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item.name !== file.name),
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {mode !== "demo" && (
          <div className="input-actions">
            <p>
              Parse・検索・マスキング・集約はブラウザ内で実行されます。
            </p>
            <button type="button" className="primary-button" onClick={start}>
              解析を開始
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function ProcessingView({ phase }: { phase: number }) {
  return (
    <main className="processing-shell" aria-live="polite">
      <div className="processing-mark">
        <LoaderCircle size={28} aria-hidden="true" />
      </div>
      <span className="step-label">ANALYSIS PIPELINE</span>
      <h1>{phases[phase]}...</h1>
      <p>元ログを保持したまま、安全な解析用コピーを生成しています。</p>
      <ol className="phase-list">
        {phases.map((item, index) => (
          <li
            key={item}
            className={index < phase ? "done" : index === phase ? "current" : ""}
          >
            <span>{index < phase ? <Check size={14} /> : index + 1}</span>
            {item}
          </li>
        ))}
      </ol>
    </main>
  );
}

function LogViewer({
  dataset,
  selectedEntry,
  onSelectEntry,
  selectedGroup,
  onSelectGroup,
}: {
  dataset: AnalysisDataset;
  selectedEntry: string | null;
  onSelectEntry: (id: string) => void;
  selectedGroup: string;
  onSelectGroup: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const [level, setLevel] = useState<LogLevel | "ALL">("ALL");
  const [source, setSource] = useState("ALL");
  const [timeRange, setTimeRange] = useState<"ALL" | "ERROR_WINDOW">("ALL");
  const [showNoise, setShowNoise] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const sources = [...new Set(dataset.entries.map((entry) => entry.source))];
  const errorTimes = dataset.entries
    .filter((entry) => entry.level === "ERROR")
    .map((entry) => timestampToMs(entry.timestamp))
    .filter((time): time is number => time !== null);
  const range =
    timeRange === "ERROR_WINDOW" && errorTimes.length
      ? {
          from: Math.min(...errorTimes) - 30_000,
          to: Math.max(...errorTimes) + 30_000,
        }
      : { from: null, to: null };
  const filtered = useMemo(
    () =>
      filterLogEntries(dataset.entries, {
        query: deferredQuery,
        level,
        source,
        groupId: selectedGroup,
        showNoise,
        from: range.from,
        to: range.to,
      }),
    [
      dataset.entries,
      deferredQuery,
      level,
      range.from,
      range.to,
      selectedGroup,
      showNoise,
      source,
    ],
  );
  // TanStack Virtual intentionally exposes imperative methods for windowing.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  useEffect(() => {
    if (!selectedEntry) return;
    const index = filtered.findIndex((entry) => entry.id === selectedEntry);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [filtered, selectedEntry, virtualizer]);

  const clearFilters = () => {
    setQuery("");
    setLevel("ALL");
    setSource("ALL");
    setTimeRange("ALL");
    onSelectGroup("");
  };

  return (
    <section className="log-panel" aria-labelledby="log-viewer-heading">
      <div className="panel-header">
        <div>
          <span className="step-label">SOURCE EVIDENCE</span>
          <h2 id="log-viewer-heading">Log Viewer</h2>
        </div>
        <span>{filtered.length.toLocaleString()} / {dataset.entries.length.toLocaleString()} events</span>
      </div>
      <div className="log-toolbar">
        <label className="search-box">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">ログを検索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="timeout, 500, Request ID..."
          />
          {query && (
            <button type="button" aria-label="検索をクリア" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </label>
        <select
          aria-label="ログレベル"
          value={level}
          onChange={(event) => setLevel(event.target.value as LogLevel | "ALL")}
        >
          <option value="ALL">All levels</option>
          <option value="ERROR">Error</option>
          <option value="WARN">Warning</option>
          <option value="INFO">Info</option>
          <option value="DEBUG">Debug</option>
        </select>
        <select
          aria-label="ログソース"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="ALL">All sources</option>
          {sources.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="時間範囲"
          value={timeRange}
          onChange={(event) =>
            setTimeRange(event.target.value as "ALL" | "ERROR_WINDOW")
          }
        >
          <option value="ALL">All time</option>
          <option value="ERROR_WINDOW">障害前後30秒</option>
        </select>
      </div>
      <div className="filter-row">
        <button
          type="button"
          className={showNoise ? "filter-active" : ""}
          onClick={() => setShowNoise((current) => !current)}
        >
          <Filter size={14} aria-hidden="true" />
          Noise {showNoise ? "表示中" : "除外中"}
        </button>
        {selectedGroup && (
          <button type="button" className="filter-chip" onClick={() => onSelectGroup("")}>
            Error group
            <X size={13} aria-hidden="true" />
          </button>
        )}
        {(query ||
          level !== "ALL" ||
          source !== "ALL" ||
          timeRange !== "ALL" ||
          selectedGroup) && (
          <button type="button" className="clear-button" onClick={clearFilters}>
            すべてクリア
          </button>
        )}
      </div>
      <div className="log-columns" aria-hidden="true">
        <span>Line</span>
        <span>Time</span>
        <span>Level</span>
        <span>Source / Message</span>
      </div>
      <div className="log-scroll" ref={parentRef}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={22} aria-hidden="true" />
            <strong>一致するログがありません</strong>
            <button type="button" onClick={clearFilters}>フィルターを解除</button>
          </div>
        ) : (
          <div
            className="virtual-list"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = filtered[virtualItem.index];
              return (
                <button
                  type="button"
                  key={entry.id}
                  data-entry-id={entry.id}
                  className={`log-row ${selectedEntry === entry.id ? "selected" : ""}`}
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  onClick={() => onSelectEntry(entry.id)}
                  title={entry.raw}
                >
                  <span className="line-number">{entry.lineStart}</span>
                  <time>{formatTime(entry.timestamp)}</time>
                  <span className={statusClass(entry.level)}>{entry.level}</span>
                  <span className="log-message">
                    <b>{entry.source}</b>
                    <span>{entry.message.split("\n")[0]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function AnalysisPanel({
  analysis,
  aiState,
  aiError,
  onRunAi,
  onEvidence,
  onAnalysisChange,
  onExport,
  onCopy,
}: {
  analysis: AnalysisResult;
  aiState: "idle" | "loading" | "success" | "error";
  aiError: string;
  onRunAi: () => void;
  onEvidence: (entryId: string) => void;
  onAnalysisChange: (next: AnalysisResult) => void;
  onExport: () => void;
  onCopy: () => void;
}) {
  const updateCandidate = (
    candidateId: string,
    changes: Partial<AnalysisResult["rootCauseCandidates"][number]>,
  ) => {
    onAnalysisChange({
      ...analysis,
      rootCauseCandidates: analysis.rootCauseCandidates.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...changes } : candidate,
      ),
    });
  };

  const updateAction = (index: number, status: ReviewStatus) => {
    onAnalysisChange({
      ...analysis,
      recommendedActions: analysis.recommendedActions.map((action, itemIndex) =>
        itemIndex === index ? { ...action, status } : action,
      ),
    });
  };

  return (
    <section className="analysis-panel" aria-labelledby="analysis-heading">
      <div className="panel-header analysis-heading">
        <div>
          <span className="step-label">HUMAN REVIEW</span>
          <h2 id="analysis-heading">Root Cause Analysis</h2>
        </div>
        <button
          type="button"
          className="ai-button"
          onClick={onRunAi}
          disabled={aiState === "loading"}
        >
          {aiState === "loading" ? (
            <LoaderCircle size={15} className="spin" aria-hidden="true" />
          ) : (
            <Sparkles size={15} aria-hidden="true" />
          )}
          {aiState === "success" ? "AI再解析" : "AI解析を実行"}
        </button>
      </div>

      {aiError && (
        <div className="inline-notice notice-warning" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <div>
            <strong>AI解析を利用できません</strong>
            <p>{aiError} 決定論的なローカル解析結果を表示しています。</p>
          </div>
        </div>
      )}

      <div className="analysis-scroll">
        <article className="summary-block">
          <div className="summary-meta">
            <span className={`severity severity-${analysis.severity.toLowerCase()}`}>
              {analysis.severity}
            </span>
            <span>{aiState === "success" ? "AI + Deterministic" : "Local analysis"}</span>
          </div>
          <h3>Incident Summary</h3>
          <p>{analysis.incidentSummary}</p>
          <dl className="impact-grid">
            <div><dt>影響Service</dt><dd>{analysis.impact.services.join(", ") || "確認できません"}</dd></div>
            <div><dt>Endpoint</dt><dd>{analysis.impact.endpoints.join(", ") || "確認できません"}</dd></div>
            <div><dt>Error Count</dt><dd>{analysis.impact.errorCount}</dd></div>
            <div><dt>Duration</dt><dd>{analysis.impact.duration}</dd></div>
          </dl>
        </article>

        <section className="analysis-section">
          <div className="subheading">
            <div>
              <span>CAUSE CANDIDATES</span>
              <h3>原因候補</h3>
            </div>
            <small>断定ではありません</small>
          </div>
          <div className="candidate-list">
            {analysis.rootCauseCandidates.length === 0 ? (
              <div className="empty-compact">原因候補を生成できるエラーがありません。</div>
            ) : (
              analysis.rootCauseCandidates.map((candidate, index) => (
                <article className="candidate-card" key={candidate.id}>
                  <div className="candidate-top">
                    <span className="candidate-index">0{index + 1}</span>
                    <div>
                      <h4>{candidate.title}</h4>
                      <p>{candidate.rationale}</p>
                    </div>
                    <span className={`confidence confidence-${candidate.confidence.toLowerCase()}`}>
                      {candidate.confidence}
                    </span>
                  </div>
                  <div className="evidence-block">
                    <strong>Evidence</strong>
                    <div>
                      {candidate.evidence.map((evidence) => (
                        <button
                          type="button"
                          key={`${candidate.id}-${evidence.entryId}`}
                          onClick={() => onEvidence(evidence.entryId)}
                        >
                          <FileCode2 size={14} aria-hidden="true" />
                          {evidence.citation}
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="review-controls">
                    <label>
                      確認状態
                      <select
                        value={candidate.reviewStatus}
                        onChange={(event) =>
                          updateCandidate(candidate.id, {
                            reviewStatus: event.target.value as ReviewStatus,
                          })
                        }
                      >
                        <option>未確認</option>
                        <option>確認済み</option>
                        <option>対応候補</option>
                        <option>対象外</option>
                      </select>
                    </label>
                    <label>
                      Human Note
                      <textarea
                        value={candidate.note}
                        placeholder="検証結果や担当者メモを追加"
                        onChange={(event) =>
                          updateCandidate(candidate.id, { note: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="analysis-section">
          <div className="subheading">
            <div>
              <span>NEXT CHECKS</span>
              <h3>確認すべき箇所</h3>
            </div>
          </div>
          <ol className="investigation-list">
            {analysis.investigationSteps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="analysis-section">
          <div className="subheading">
            <div>
              <span>RESPONSE PLAN</span>
              <h3>対応案</h3>
            </div>
          </div>
          <div className="action-list">
            {analysis.recommendedActions.map((action, index) => (
              <div key={`${action.category}-${action.action}`}>
                <span>{action.category}</span>
                <p>{action.action}</p>
                <select
                  aria-label={`${action.action}の確認状態`}
                  value={action.status}
                  onChange={(event) =>
                    updateAction(index, event.target.value as ReviewStatus)
                  }
                >
                  <option>未確認</option>
                  <option>確認済み</option>
                  <option>対応候補</option>
                  <option>対象外</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <div className="report-actions">
          <button type="button" onClick={onCopy}>
            <Copy size={15} aria-hidden="true" />
            障害共有用Summaryをコピー
          </button>
          <button type="button" onClick={onExport}>
            <Download size={15} aria-hidden="true" />
            Markdown Report
          </button>
        </div>
        <p className="analysis-disclaimer">
          <Info size={14} aria-hidden="true" />
          原因候補と対応案は人間による確認が必要です。このツールは本番操作を実行しません。
        </p>
      </div>
    </section>
  );
}

function TimelineView({
  dataset,
  onEvidence,
}: {
  dataset: AnalysisDataset;
  onEvidence: (id: string) => void;
}) {
  const events = dataset.entries.filter(
    (entry) => !entry.isNoise && entry.level !== "DEBUG",
  );
  return (
    <section className="timeline-mobile" aria-labelledby="timeline-heading">
      <div className="panel-header">
        <div>
          <span className="step-label">INCIDENT SEQUENCE</span>
          <h2 id="timeline-heading">Timeline</h2>
        </div>
        <span>{events.length} events</span>
      </div>
      <ol>
        {events.map((entry) => (
          <li key={entry.id}>
            <button type="button" onClick={() => onEvidence(entry.id)}>
              <time>{formatTime(entry.timestamp)}</time>
              <span className={statusClass(entry.level)}>{entry.level}</span>
              <div>
                <b>{entry.source}</b>
                <p>{entry.message.split("\n")[0]}</p>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AnalyzerApp() {
  const [stage, setStage] = useState<AppStage>("input");
  const [phase, setPhase] = useState(0);
  const [dataset, setDataset] = useState<AnalysisDataset | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("analysis");
  const [aiState, setAiState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [sources, setSources] = useState<LogSource[]>([]);
  const [copied, setCopied] = useState(false);

  const runPipeline = async (inputSources: LogSource[]) => {
    setSources(inputSources);
    setStage("processing");
    setAiState("idle");
    setAiError("");
    for (let current = 0; current < phases.length; current += 1) {
      setPhase(current);
      await new Promise((resolve) => setTimeout(resolve, current === 3 ? 260 : 150));
    }
    const nextDataset = buildDataset(inputSources);
    const nextAnalysis = createLocalAnalysis(nextDataset);
    setDataset(nextDataset);
    setAnalysis(nextAnalysis);
    setSelectedEntry(null);
    setStage("result");
  };

  const focusEvidence = (entryId: string) => {
    setSelectedGroup("");
    setSelectedEntry(entryId);
    setMobileTab("logs");
    window.setTimeout(() => {
      document
        .querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  };

  const runAi = async () => {
    if (!dataset) return;
    setAiState("loading");
    setAiError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sanitizedLog: dataset.sanitizedText,
          deterministicFacts: {
            totalLogs: dataset.entries.length,
            errorCount: dataset.entries.filter((entry) => entry.level === "ERROR")
              .length,
            warningCount: dataset.entries.filter((entry) => entry.level === "WARN")
              .length,
            timeSpan: dataset.timeSpan,
            groups: dataset.groups.map((group) => ({
              id: group.id,
              message: group.representativeMessage,
              count: group.count,
              evidence: group.entryIds.slice(0, 3).flatMap((entryId) => {
                const entry = dataset.entries.find((item) => item.id === entryId);
                return entry
                  ? [{ entryId, citation: citationFor(entry) }]
                  : [];
              }),
            })),
          },
        }),
      });
      const body = (await response.json()) as {
        result?: unknown;
        error?: string;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "AI解析に失敗しました。");
      }
      setAnalysis(parseAnalysisResponse(body.result, dataset.entries));
      setAiState("success");
    } catch (error) {
      setAiState("error");
      setAiError(error instanceof Error ? error.message : "AI解析に失敗しました。");
    }
  };

  const exportReport = () => {
    if (!analysis || !dataset) return;
    const blob = new Blob([buildIncidentReport(analysis, dataset)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `incident-report-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copySummary = async () => {
    if (!analysis) return;
    await navigator.clipboard.writeText(buildShareSummary(analysis));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (stage === "input") return <InputWorkspace onAnalyze={runPipeline} />;
  if (stage === "processing") return <ProcessingView phase={phase} />;
  if (!dataset || !analysis) return null;

  const errorCount = dataset.entries.filter((entry) => entry.level === "ERROR").length;
  const warningCount = dataset.entries.filter((entry) => entry.level === "WARN").length;

  return (
    <main className="result-shell">
      <header className="result-header">
        <div>
          <button type="button" className="back-button" onClick={() => setStage("input")}>
            ← 新しい解析
          </button>
          <h1>Incident Analysis</h1>
        </div>
        <div className="header-status">
          <span><span className="status-dot" />解析完了</span>
          <span>{sources.map((source) => source.name).join(" · ")}</span>
        </div>
      </header>

      <section className="stats-grid" aria-label="解析サマリー">
        <StatCard label="Total Logs" value={dataset.entries.length} />
        <StatCard label="Errors" value={errorCount} tone="danger" />
        <StatCard label="Warnings" value={warningCount} tone="warning" />
        <StatCard label="Error Groups" value={dataset.groups.length} />
        <StatCard label="Time Span" value={dataset.timeSpan} />
        <StatCard label="Masked Secrets" value={dataset.totalMasks} tone="secure" />
      </section>

      {dataset.totalMasks > 0 && (
        <div className="mask-banner">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>{dataset.totalMasks}件の機密情報をマスクしました</strong>
            <p>
              AI送信用コピーのみ置換。元ログは変更していません。
              {dataset.masks.map((mask) => ` ${mask.type} ${mask.count}件`).join(" ·")}
            </p>
          </div>
        </div>
      )}

      {dataset.anomaly && (
        <div className="anomaly-banner">
          <AlertCircle size={18} aria-hidden="true" />
          <div><strong>急増を検出</strong><p>{dataset.anomaly}</p></div>
        </div>
      )}

      <section className="group-strip" aria-labelledby="groups-heading">
        <div className="group-strip-heading">
          <div>
            <span className="step-label">PATTERN GROUPING</span>
            <h2 id="groups-heading">Error Groups</h2>
          </div>
          <button
            type="button"
            className={!selectedGroup ? "active" : ""}
            onClick={() => setSelectedGroup("")}
          >
            All events
          </button>
        </div>
        <div className="group-list">
          {dataset.groups.map((group) => (
            <button
              type="button"
              key={group.id}
              className={selectedGroup === group.id ? "active" : ""}
              onClick={() => {
                setSelectedGroup(group.id);
                setMobileTab("logs");
              }}
            >
              <span className={statusClass(group.level)}>{group.level}</span>
              <strong>{group.representativeMessage}</strong>
              <small>{group.sources.join(", ")}</small>
              <b>{group.count}×</b>
              <span>{group.frequencyLabel}</span>
            </button>
          ))}
        </div>
      </section>

      <nav className="mobile-tabs" aria-label="解析ビュー">
        {(
          [
            ["logs", "Log"],
            ["analysis", "Analysis"],
            ["timeline", "Timeline"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={mobileTab === value ? "active" : ""}
            onClick={() => setMobileTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="split-view">
        <div className={mobileTab === "logs" ? "mobile-visible" : "mobile-hidden"}>
          <LogViewer
            dataset={dataset}
            selectedEntry={selectedEntry}
            onSelectEntry={setSelectedEntry}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
          />
        </div>
        <div className={mobileTab === "analysis" ? "mobile-visible" : "mobile-hidden"}>
          <AnalysisPanel
            analysis={analysis}
            aiState={aiState}
            aiError={aiError}
            onRunAi={runAi}
            onEvidence={focusEvidence}
            onAnalysisChange={setAnalysis}
            onExport={exportReport}
            onCopy={copySummary}
          />
        </div>
        <div className={`timeline-slot ${mobileTab === "timeline" ? "mobile-visible" : "mobile-hidden"}`}>
          <TimelineView dataset={dataset} onEvidence={focusEvidence} />
        </div>
      </div>

      {selectedEntry && (
        <aside className="raw-detail" aria-label="選択中の元ログ">
          <div>
            <span>ORIGINAL LOG · {citationFor(dataset.entries.find((entry) => entry.id === selectedEntry) as LogEntry)}</span>
            <button type="button" aria-label="元ログ表示を閉じる" onClick={() => setSelectedEntry(null)}>
              <X size={15} />
            </button>
          </div>
          <pre>{dataset.entries.find((entry) => entry.id === selectedEntry)?.raw}</pre>
        </aside>
      )}

      {copied && (
        <div className="toast" role="status">
          <Check size={15} aria-hidden="true" />
          障害共有用Summaryをコピーしました
        </div>
      )}
    </main>
  );
}
