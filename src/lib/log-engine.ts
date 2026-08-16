import type {
  AnalysisDataset,
  ErrorGroup,
  LogEntry,
  LogLevel,
  LogSource,
  MaskSummary,
  MaskType,
} from "./types";

const LEVEL_PATTERN = /\b(ERROR|ERR|WARN(?:ING)?|INFO|DEBUG|FATAL|TRACE)\b/i;
const TIMESTAMP_PATTERN =
  /(?:\d{4}-\d{2}-\d{2}[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)|(?:[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d{1,6})?)/;
const REQUEST_ID_PATTERN =
  /\b(?:request[-_ ]?id|req[-_ ]?id|trace[-_ ]?id)[=: ]+([a-z0-9-]{6,})/i;
const ERROR_CODE_PATTERN =
  /\b(?:error[-_ ]?code|code)[=: ]+([A-Z][A-Z0-9_-]{2,})\b/i;
const STACK_CONTINUATION = /^\s+(?:at |File "|Caused by:|\.{3} \d+ more)/;
const NOISE_PATTERNS = [
  /health(?:check|z)?/i,
  /\/health\b/i,
  /heartbeat/i,
  /poll(?:ing)? completed/i,
  /static asset/i,
];

const MASK_RULES: Array<{
  type: MaskType;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    type: "authorization",
    pattern: /\b(?:authorization\s*[:=]\s*)bearer\s+[^\s,;]+/gi,
    replacement: "Authorization: Bearer [REDACTED]",
  },
  {
    type: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED_JWT]",
  },
  {
    type: "database-url",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi,
    replacement: "[REDACTED_DATABASE_URL]",
  },
  {
    type: "api-key",
    pattern:
      /\b(?:api[-_ ]?key|x-api-key)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{12,}["']?/gi,
    replacement: "api_key=[REDACTED]",
  },
  {
    type: "password",
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s,"';}]+["']?/gi,
    replacement: "password=[REDACTED]",
  },
  {
    type: "cookie",
    pattern: /\b(?:set-)?cookie\s*[:=]\s*[^\r\n]+/gi,
    replacement: "Cookie: [REDACTED]",
  },
  {
    type: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    type: "ip-address",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    replacement: "[REDACTED_IP]",
  },
  {
    type: "credit-card",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_CARD]",
  },
];

function toLevel(value: string | undefined): LogLevel {
  const normalized = value?.toUpperCase();
  if (normalized === "ERROR" || normalized === "ERR" || normalized === "FATAL")
    return "ERROR";
  if (normalized === "WARN" || normalized === "WARNING") return "WARN";
  if (normalized === "INFO") return "INFO";
  if (normalized === "DEBUG" || normalized === "TRACE") return "DEBUG";
  return "UNKNOWN";
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function parseJsonLine(line: string) {
  if (!line.trim().startsWith("{")) return null;
  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    const level = valueAsString(value.level ?? value.severity ?? value.logLevel);
    const timestamp = valueAsString(
      value.timestamp ?? value.time ?? value.ts ?? value["@timestamp"],
    );
    const message = valueAsString(
      value.message ?? value.msg ?? value.error ?? value.event,
    );
    if (!message) return null;
    return {
      timestamp: timestamp ?? null,
      level: toLevel(level),
      message,
      requestId: valueAsString(
        value.requestId ?? value.request_id ?? value.traceId,
      ),
      errorCode: valueAsString(value.errorCode ?? value.error_code ?? value.code),
    };
  } catch {
    return null;
  }
}

export function timestampToMs(timestamp: string | null): number | null {
  if (!timestamp) return null;
  if (/^\d{2}:\d{2}:\d{2}/.test(timestamp)) {
    const [hours, minutes, seconds] = timestamp.split(/[:.]/).map(Number);
    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

export function filterLogEntries(
  entries: LogEntry[],
  filters: {
    query?: string;
    level?: LogLevel | "ALL";
    source?: string;
    groupId?: string;
    showNoise?: boolean;
    from?: number | null;
    to?: number | null;
  },
): LogEntry[] {
  const query = filters.query?.toLowerCase().trim() ?? "";
  return entries.filter((entry) => {
    const time = timestampToMs(entry.timestamp);
    return (
      (filters.showNoise || !entry.isNoise) &&
      (!filters.level ||
        filters.level === "ALL" ||
        entry.level === filters.level) &&
      (!filters.source ||
        filters.source === "ALL" ||
        entry.source === filters.source) &&
      (!filters.groupId || entry.groupId === filters.groupId) &&
      (!query ||
        entry.raw.toLowerCase().includes(query) ||
        entry.source.toLowerCase().includes(query)) &&
      (filters.from === null ||
        filters.from === undefined ||
        (time !== null && time >= filters.from)) &&
      (filters.to === null ||
        filters.to === undefined ||
        (time !== null && time <= filters.to))
    );
  });
}

export function parseLogSources(sources: LogSource[]): LogEntry[] {
  const entries: LogEntry[] = [];

  for (const source of sources) {
    const lines = source.content.replace(/\r\n/g, "\n").split("\n");
    let current: LogEntry | null = null;

    const commit = () => {
      if (current) entries.push(current);
      current = null;
    };

    lines.forEach((raw, index) => {
      if (!raw.trim()) return;
      const lineNumber = index + 1;
      const json = parseJsonLine(raw);
      const timestampMatch = raw.match(TIMESTAMP_PATTERN);
      const levelMatch = raw.match(LEVEL_PATTERN);
      const startsEntry = Boolean(json || timestampMatch || levelMatch);

      if (current && (STACK_CONTINUATION.test(raw) || !startsEntry)) {
        current.raw += `\n${raw}`;
        current.message += `\n${raw.trim()}`;
        current.lineEnd = lineNumber;
        return;
      }

      commit();
      const timestamp = json?.timestamp ?? timestampMatch?.[0] ?? null;
      const level = json?.level ?? toLevel(levelMatch?.[1]);
      const message =
        json?.message ??
        raw
          .replace(TIMESTAMP_PATTERN, "")
          .replace(LEVEL_PATTERN, "")
          .replace(/^[\s[\]():-]+/, "")
          .trim();

      current = {
        id: `${source.name}:L${lineNumber}`,
        source: source.name,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        timestamp,
        level,
        message: message || raw.trim(),
        raw,
        requestId: json?.requestId ?? raw.match(REQUEST_ID_PATTERN)?.[1],
        errorCode: json?.errorCode ?? raw.match(ERROR_CODE_PATTERN)?.[1],
        isNoise:
          NOISE_PATTERNS.some((pattern) => pattern.test(raw)) ||
          (level === "DEBUG" && !/error|fail|exception/i.test(raw)),
      };
    });
    commit();
  }

  return entries.sort((a, b) => {
    const aTime = timestampToMs(a.timestamp);
    const bTime = timestampToMs(b.timestamp);
    if (aTime === null || bTime === null) return 0;
    return aTime - bTime;
  });
}

export function sanitizeText(input: string): {
  text: string;
  masks: MaskSummary[];
  total: number;
} {
  const counts = new Map<MaskType, number>();
  let text = input;
  for (const rule of MASK_RULES) {
    text = text.replace(rule.pattern, () => {
      counts.set(rule.type, (counts.get(rule.type) ?? 0) + 1);
      return rule.replacement;
    });
  }
  const masks = [...counts.entries()].map(([type, count]) => ({ type, count }));
  return { text, masks, total: masks.reduce((sum, item) => sum + item.count, 0) };
}

export function normalizeMessage(input: string): string {
  return input
    .toLowerCase()
    .replace(TIMESTAMP_PATTERN, "<timestamp>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "<uuid>",
    )
    .replace(/\b(?:req|request|trace|user)[-_ ]?id[=: ]+[a-z0-9-]+\b/gi, "<id>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<address>")
    .replace(/:\d{2,5}\b/g, ":<port>")
    .replace(/\b\d{5,}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `grp-${(hash >>> 0).toString(16)}`;
}

function frequencyLabel(entries: LogEntry[]): string {
  if (entries.length < 2) return "1 occurrence";
  const times = entries
    .map((entry) => timestampToMs(entry.timestamp))
    .filter((time): time is number => time !== null);
  if (times.length < 2) return `${entries.length} occurrences`;
  const duration = Math.max(...times) - Math.min(...times);
  const minutes = Math.max(1, Math.ceil(duration / 60_000));
  return `${entries.length} occurrences / ${minutes} min`;
}

export function groupErrors(entries: LogEntry[]): ErrorGroup[] {
  const grouped = new Map<string, LogEntry[]>();
  entries
    .filter((entry) => entry.level === "ERROR" || entry.level === "WARN")
    .forEach((entry) => {
      const pattern = normalizeMessage(entry.message.split("\n")[0]);
      const key = stableHash(`${entry.level}:${pattern}`);
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    });

  return [...grouped.entries()]
    .map(([id, members]) => {
      members.forEach((member) => {
        member.groupId = id;
      });
      return {
        id,
        pattern: normalizeMessage(members[0].message.split("\n")[0]),
        representativeMessage: members[0].message.split("\n")[0],
        count: members.length,
        firstSeen: members[0].timestamp,
        lastSeen: members[members.length - 1].timestamp,
        level: members.some((entry) => entry.level === "ERROR")
          ? "ERROR"
          : "WARN",
        sources: [...new Set(members.map((entry) => entry.source))],
        entryIds: members.map((entry) => entry.id),
        frequencyLabel: frequencyLabel(members),
      } satisfies ErrorGroup;
    })
    .sort((a, b) => b.count - a.count);
}

function calculateTimeSpan(entries: LogEntry[]): string {
  const times = entries
    .map((entry) => timestampToMs(entry.timestamp))
    .filter((time): time is number => time !== null);
  if (times.length < 2) return "確認できません";
  const seconds = Math.round((Math.max(...times) - Math.min(...times)) / 1000);
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.ceil(seconds / 60)}分`;
}

function detectAnomaly(entries: LogEntry[]): string | null {
  const errors = entries.filter(
    (entry) => entry.level === "ERROR" && timestampToMs(entry.timestamp) !== null,
  );
  if (errors.length < 5) return null;
  const buckets = new Map<number, number>();
  errors.forEach((entry) => {
    const minute = Math.floor((timestampToMs(entry.timestamp) ?? 0) / 60_000);
    buckets.set(minute, (buckets.get(minute) ?? 0) + 1);
  });
  const counts = [...buckets.values()];
  const peak = Math.max(...counts);
  const baseline =
    counts.length > 1
      ? (counts.reduce((sum, count) => sum + count, 0) - peak) /
        (counts.length - 1)
      : 0;
  return peak >= Math.max(5, baseline * 3)
    ? `エラーが1分間に${peak}件まで増加（他時間帯平均 ${baseline.toFixed(1)}件）`
    : null;
}

export function buildDataset(sources: LogSource[]): AnalysisDataset {
  const entries = parseLogSources(sources);
  const groups = groupErrors(entries);
  const joined = sources
    .map((source) => `--- ${source.name} ---\n${source.content}`)
    .join("\n");
  const sanitized = sanitizeText(joined);
  return {
    entries,
    groups,
    sanitizedText: sanitized.text,
    masks: sanitized.masks,
    totalMasks: sanitized.total,
    timeSpan: calculateTimeSpan(entries),
    anomaly: detectAnomaly(entries),
  };
}

export function citationFor(entry: LogEntry): string {
  return `${entry.source}:L${entry.lineStart}${
    entry.lineEnd > entry.lineStart ? `-L${entry.lineEnd}` : ""
  }`;
}
