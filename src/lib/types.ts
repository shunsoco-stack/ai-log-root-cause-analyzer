export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "UNKNOWN";

export type LogEntry = {
  id: string;
  source: string;
  lineStart: number;
  lineEnd: number;
  timestamp: string | null;
  level: LogLevel;
  message: string;
  raw: string;
  requestId?: string;
  errorCode?: string;
  groupId?: string;
  isNoise: boolean;
};

export type MaskType =
  | "api-key"
  | "authorization"
  | "password"
  | "cookie"
  | "email"
  | "ip-address"
  | "credit-card"
  | "jwt"
  | "database-url";

export type MaskSummary = {
  type: MaskType;
  count: number;
};

export type ErrorGroup = {
  id: string;
  pattern: string;
  representativeMessage: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  level: LogLevel;
  sources: string[];
  entryIds: string[];
  frequencyLabel: string;
};

export type Evidence = {
  entryId: string;
  citation: string;
  reason: string;
};

export type Confidence = "High" | "Medium" | "Low";

export type RootCauseCandidate = {
  id: string;
  title: string;
  confidence: Confidence;
  rationale: string;
  evidence: Evidence[];
  reviewStatus: "未確認" | "確認済み" | "対応候補" | "対象外";
  note: string;
};

export type RecommendedAction = {
  category: "Immediate" | "Short-term" | "Preventive";
  action: string;
  status: "未確認" | "確認済み" | "対応候補" | "対象外";
};

export type AnalysisResult = {
  incidentSummary: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  impact: {
    services: string[];
    endpoints: string[];
    errorCount: number;
    duration: string;
    notes: string;
  };
  rootCauseCandidates: RootCauseCandidate[];
  investigationSteps: string[];
  recommendedActions: RecommendedAction[];
  limitations: string[];
};

export type AnalysisDataset = {
  entries: LogEntry[];
  groups: ErrorGroup[];
  sanitizedText: string;
  masks: MaskSummary[];
  totalMasks: number;
  timeSpan: string;
  anomaly: string | null;
};

export type LogSource = {
  name: string;
  content: string;
};
