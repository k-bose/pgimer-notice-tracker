export type NoticeSourceId = 'vacancies' | 'recall_global';

export interface NoticeAttachment {
  label: string;
  url: string;
  kind: 'title_file' | 'guidelines' | 'apply' | 'document';
}

export interface NoticeItem {
  id: string;
  recordId: string;
  referenceNo: string | null;
  sourceId: NoticeSourceId;
  sourceName: string;
  sourceUrl: string;
  detailUrl: string;
  serialNo: string;
  title: string;
  status: string;
  description: string;
  publishedDate: string;
  attachments: NoticeAttachment[];
  firstSeenAt: string;
  emailedAt: string | null;
  resendEmailId: string | null;
}

export interface PollerConfig {
  intervalMinutes: number;
  windowStartIst: string;
  windowEndIst: string;
  enabled: boolean;
  recipientEmail: string;
  senderEmail: string;
  resendConfigured?: boolean;
}

export interface SourcePollSummary {
  sourceId: NoticeSourceId;
  sourceName: string;
  targetUrl: string;
  httpStatus: number;
  durationMs: number;
  rowsParsed: number;
  newRecordsHydrated: number;
  transportMode: 'direct' | 'relay' | 'cached_snapshot';
  note?: string;
}

export interface PollRunLog {
  id: string;
  startedAt: string;
  completedAt: string;
  istTimeFormatted: string;
  trigger: 'scheduled' | 'manual' | 'simulated_upload';
  withinIstWindow: boolean;
  sourceResults: SourcePollSummary[];
  totalNoticesParsed: number;
  newNoticesCount: number;
  newNoticeIds: string[];
  emailSent: boolean;
  resendEmailId: string | null;
  emailError: string | null;
}

export interface SchedulerLiveStatus {
  currentIstTime: string;
  currentIstDate: string;
  isWithinWindow: boolean;
  lastPollAt: string | null;
  nextEligiblePollAtIst: string;
  minutesUntilNextPoll: number;
  isPollingNow: boolean;
}

export interface SentinelStateResponse {
  notices: NoticeItem[];
  config: PollerConfig;
  logs: PollRunLog[];
  scheduler: SchedulerLiveStatus;
}

export interface ParserInspectionResult {
  pageType: 'vacancies_index' | 'vacancy_detail' | 'recall_index' | 'recall_detail';
  parsedItems: Array<{
    recordId: string;
    serialNo?: string;
    title: string;
    referenceNo: string | null;
    status: string;
    publishedDate: string;
    description: string;
    detailUrl: string;
    attachments: NoticeAttachment[];
  }>;
  extractionNotes: string[];
}
