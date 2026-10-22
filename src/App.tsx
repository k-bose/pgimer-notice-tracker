import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  ExternalLink,
  FileText,
  Mail,
  Play,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Terminal,
} from 'lucide-react';
import type {
  NoticeItem,
  NoticeSourceId,
  ParserInspectionResult,
  PollerConfig,
  PollRunLog,
  SchedulerLiveStatus,
  SentinelStateResponse,
} from './types.ts';

type ActiveSection = 'feed' | 'inspector' | 'schedule' | 'logs';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('feed');
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [config, setConfig] = useState<PollerConfig>({
    intervalMinutes: 60,
    windowStartIst: '08:00',
    windowEndIst: '18:00',
    enabled: true,
    recipientEmail: '0xkbose@gmail.com',
    senderEmail: 'PGIMER Sentinel <onboarding@resend.dev>',
    resendConfigured: false,
  });
  const [logs, setLogs] = useState<PollRunLog[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerLiveStatus | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Feed Filter & Selection State
  const [sourceFilter, setSourceFilter] = useState<'all' | NoticeSourceId>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [emailingNoticeId, setEmailingNoticeId] = useState<string | null>(null);

  // Feedback Banner State
  const [banner, setBanner] = useState<{
    tone: 'info' | 'success' | 'warning' | 'error';
    message: string;
    detail?: string;
  } | null>(null);

  // Schedule & Alert Form State
  const [draftConfig, setDraftConfig] = useState<PollerConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<boolean>(false);

  // Parser Inspector State
  const [fixtures, setFixtures] = useState<Record<string, string>>({});
  const [inspectorPageType, setInspectorPageType] =
    useState<ParserInspectionResult['pageType']>('vacancies_index');
  const [inspectorHtml, setInspectorHtml] = useState<string>('');
  const [inspectionResult, setInspectionResult] =
    useState<ParserInspectionResult | null>(null);
  const [runningInspector, setRunningInspector] = useState<boolean>(false);

  const fetchSentinelState = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingInitial(true);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SentinelStateResponse;
      setNotices(data.notices);
      setConfig(data.config);
      setDraftConfig((prev) => prev || data.config);
      setLogs(data.logs);
      setScheduler(data.scheduler);
      if (data.notices.length > 0) {
        setSelectedNoticeId((prev) => prev || data.notices[0].id);
      }
    } catch (err: any) {
      setBanner({
        tone: 'error',
        message: 'Failed to load server state',
        detail: err?.message || String(err),
      });
    } finally {
      if (!quiet) setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    fetchSentinelState(false);
    const interval = setInterval(() => {
      fetchSentinelState(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSentinelState]);

  // Load HTML fixtures when opening Inspector
  useEffect(() => {
    async function loadFixtures() {
      try {
        const res = await fetch('/api/parser/fixtures');
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, string>;
        setFixtures(data);
        if (data.vacancies_index) {
          setInspectorHtml(data.vacancies_index);
        }
      } catch {
        // Ignore fixture fetch error
      }
    }
    loadFixtures();
  }, []);

  const handleRunPoll = async (
    simulateUpload = false,
    simulatePortal?: NoticeSourceId
  ) => {
    if (isPolling) return;
    setIsPolling(true);
    setBanner({
      tone: 'info',
      message: simulateUpload
        ? 'Simulating new PGIMER notice upload and running two-stage scraper...'
        : 'Polling VACANCIE_VIEW.jsp and recallht.jsp and checking for new notices...',
    });

    try {
      const res = await fetch('/api/poll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateUpload, simulatePortal }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const runLog = data.log as PollRunLog;
      setNotices(data.notices);
      setLogs(data.logs);
      setScheduler(data.scheduler);

      if (runLog.newNoticesCount > 0 && data.notices.length > 0) {
        setSelectedNoticeId(data.notices[0].id);
      }

      if (runLog.newNoticesCount > 0) {
        const emailNote = runLog.emailSent
          ? `Resend alert dispatched to ${config.recipientEmail} (ID: ${runLog.resendEmailId}).`
          : runLog.emailError || 'Email not sent.';
        setBanner({
          tone: runLog.emailSent ? 'success' : 'warning',
          message: `Detected ${runLog.newNoticesCount} new PGIMER notice(s) across ${runLog.totalNoticesParsed} rows scanned.`,
          detail: emailNote,
        });
      } else {
        setBanner({
          tone: 'info',
          message: `Poll complete (${runLog.istTimeFormatted}). Scanned ${runLog.totalNoticesParsed} rows across both portals — no new notices since last sync.`,
        });
      }
    } catch (err: any) {
      setBanner({
        tone: 'error',
        message: 'Poll execution failed',
        detail: err?.message || String(err),
      });
    } finally {
      setIsPolling(false);
    }
  };

  const handleSendSingleNoticeEmail = async (notice: NoticeItem) => {
    if (emailingNoticeId) return;
    setEmailingNoticeId(notice.id);
    try {
      const res = await fetch(`/api/notices/${encodeURIComponent(notice.id)}/email`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.sent) {
        setNotices((prev) =>
          prev.map((item) => (item.id === notice.id ? data.notice : item))
        );
        setBanner({
          tone: 'success',
          message: `Alert email sent via Resend to ${config.recipientEmail}`,
          detail: `Resend Message ID: ${data.resendId}`,
        });
      } else {
        setBanner({
          tone: 'warning',
          message: `Could not dispatch email for Record #${notice.recordId}`,
          detail: data.error || 'Verify RESEND_API_KEY in secrets.',
        });
      }
    } catch (err: any) {
      setBanner({
        tone: 'error',
        message: 'Error calling email endpoint',
        detail: err?.message || String(err),
      });
    } finally {
      setEmailingNoticeId(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftConfig || savingConfig) return;
    setSavingConfig(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save settings');
      setConfig(data.config);
      setDraftConfig(data.config);
      setScheduler(data.scheduler);
      setBanner({
        tone: 'success',
        message: 'Saved 2D polling schedule and Resend alert preferences',
        detail: `Polling every ${data.config.intervalMinutes}m between ${data.config.windowStartIst} and ${data.config.windowEndIst} IST.`,
      });
    } catch (err: any) {
      setBanner({
        tone: 'error',
        message: 'Could not save configuration',
        detail: err?.message || String(err),
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (sendingTestEmail) return;
    setSendingTestEmail(true);
    const targetConfig = draftConfig || config;
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: targetConfig.recipientEmail,
          senderEmail: targetConfig.senderEmail,
        }),
      });
      const data = await res.json();
      if (data.sent) {
        setBanner({
          tone: 'success',
          message: `Verification email delivered to ${targetConfig.recipientEmail}`,
          detail: `Resend Receipt ID: ${data.resendId}`,
        });
      } else {
        setBanner({
          tone: 'warning',
          message: 'Test email could not be dispatched via Resend',
          detail: data.error,
        });
      }
    } catch (err: any) {
      setBanner({
        tone: 'error',
        message: 'Test email request failed',
        detail: err?.message || String(err),
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleRunInspector = useCallback(
    async (
      pageType: ParserInspectionResult['pageType'],
      htmlToParse: string
    ) => {
      setRunningInspector(true);
      try {
        const res = await fetch('/api/parser/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageType, html: htmlToParse }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ParserInspectionResult;
        setInspectionResult(data);
      } catch (err: any) {
        setBanner({
          tone: 'error',
          message: 'Parser inspection failed',
          detail: err?.message || String(err),
        });
      } finally {
        setRunningInspector(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeSection === 'inspector' && inspectorHtml && !inspectionResult) {
      handleRunInspector(inspectorPageType, inspectorHtml);
    }
  }, [activeSection, inspectorHtml, inspectionResult, inspectorPageType, handleRunInspector]);

  const filteredNotices = useMemo(() => {
    return notices.filter((item) => {
      if (sourceFilter !== 'all' && item.sourceId !== sourceFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${item.title} ${item.recordId} ${item.referenceNo || ''} ${
          item.description
        } ${item.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notices, sourceFilter, searchQuery]);

  const selectedNotice = useMemo(() => {
    return (
      filteredNotices.find((n) => n.id === selectedNoticeId) ||
      filteredNotices[0] ||
      null
    );
  }, [filteredNotices, selectedNoticeId]);

  const vacanciesCount = useMemo(
    () => notices.filter((n) => n.sourceId === 'vacancies').length,
    [notices]
  );
  const recallCount = useMemo(
    () => notices.filter((n) => n.sourceId === 'recall_global').length,
    [notices]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#feed"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('feed');
          }}
          className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          PGIMER Sentinel
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection('feed')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'feed'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Notices Feed
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('inspector')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'inspector'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Extraction Inspector
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftConfig(config);
              setActiveSection('schedule');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'schedule'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Schedule &amp; Alerts
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('logs')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'logs'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Execution Logs
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => handleRunPoll(false)}
            disabled={isPolling}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`}
            />
            {isPolling ? 'Polling Portals...' : 'Run Poll Now'}
          </button>
        </div>
      </header>

      {/* Full-Width Telemetry & Schedule Strip */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
          <div className="sm:pr-4">
            <div className="text-slate-500">Monitored PGIMER Portals</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
              {notices.length} Indexed ({vacanciesCount} Vacancies · {recallCount}{' '}
              Global)
            </div>
          </div>

          <div className="pt-2 sm:pt-0 sm:px-4">
            <div className="text-slate-500">
              IST Polling Window ({config.windowStartIst}–{config.windowEndIst}{' '}
              IST)
            </div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold flex items-center gap-2">
              <span className="text-slate-900">
                {scheduler?.currentIstTime || 'Loading IST...'}
              </span>
              <span className="text-slate-400">·</span>
              <span
                className={
                  scheduler?.isWithinWindow
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }
              >
                {scheduler?.isWithinWindow
                  ? 'Active Window'
                  : 'Standby (Outside Window)'}
              </span>
            </div>
          </div>

          <div className="pt-2 sm:pt-0 sm:px-4">
            <div className="text-slate-500">Polling Cadence &amp; Next Run</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
              Every {config.intervalMinutes}m ·{' '}
              <span className="font-normal text-slate-600">
                {scheduler?.nextEligiblePollAtIst || 'Scheduled'}
              </span>
            </div>
          </div>

          <div className="pt-2 sm:pt-0 sm:pl-4">
            <div className="text-slate-500">Resend Email Alert Target</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900 truncate">
              {config.recipientEmail}{' '}
              <span className="text-slate-400">·</span>{' '}
              <span
                className={
                  config.resendConfigured
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }
              >
                {config.resendConfigured ? 'API Key Ready' : 'Set RESEND_API_KEY'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Action / Status Notification Banner */}
      {banner && (
        <div className="border-b border-slate-200 bg-slate-100/80">
          <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-semibold ${
                  banner.tone === 'error'
                    ? 'text-red-700'
                    : banner.tone === 'warning'
                    ? 'text-amber-700'
                    : banner.tone === 'success'
                    ? 'text-emerald-700'
                    : 'text-blue-700'
                }`}
              >
                {banner.tone === 'error'
                  ? 'Error'
                  : banner.tone === 'warning'
                  ? 'Notice'
                  : banner.tone === 'success'
                  ? 'Completed'
                  : 'Status'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-medium text-slate-900">{banner.message}</span>
              {banner.detail && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 font-mono tabular-nums">
                    {banner.detail}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-slate-500 hover:text-slate-900 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
        {/* ================================================================ */}
        {/* VIEW 1: NOTICES FEED & SINGLE-RECORD INSPECTOR                   */}
        {/* ================================================================ */}
        {activeSection === 'feed' && (
          <div className="space-y-5">
            {/* Workspace Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  PGIMER Notices &amp; Vacancies Feed
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Live two-stage extraction from{' '}
                  <span className="font-mono text-slate-800">
                    VACANCIE_VIEW.jsp?countt=0
                  </span>{' '}
                  (iframe <span className="font-mono">VIEW_CALL.jsp?aflag=0</span>{' '}
                  &rarr; <span className="font-mono">ViewAll.jsp?record=ID</span>)
                  and{' '}
                  <span className="font-mono text-slate-800">
                    recallht.jsp?f=1&amp;of=1&amp;r=1
                  </span>{' '}
                  (iframe <span className="font-mono">allrec.jsp</span> &rarr;{' '}
                  <span className="font-mono">seerecone.jsp?id=ID&amp;tableid=1</span>).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Interactive Segmented Filter Controls */}
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                  <button
                    type="button"
                    onClick={() => setSourceFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sourceFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Notices ({notices.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('vacancies')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sourceFilter === 'vacancies'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Vacancies ({vacanciesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('recall_global')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sourceFilter === 'recall_global'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Global Notices ({recallCount})
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter title, record ID, ref no..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 w-56"
                  />
                </div>

                {/* Simulate New Upload & Alert Trigger */}
                <button
                  type="button"
                  onClick={() =>
                    handleRunPoll(
                      true,
                      sourceFilter === 'recall_global'
                        ? 'recall_global'
                        : 'vacancies'
                    )
                  }
                  disabled={isPolling}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Inject a newly uploaded notice row into the JSP table and test end-to-end diffing + Resend email alerting"
                >
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  Simulate New Upload
                </button>
              </div>
            </div>

            {/* 2-Column Split: High-Density Table (Left 7 cols) + Single Notice Detail Panel (Right 5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Notices Table */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 pl-4 pr-2 w-24">Record ID</th>
                        <th className="py-2.5 px-3">Notice Title &amp; Source Metadata</th>
                        <th className="py-2.5 px-3 w-28 text-right">Publish Date</th>
                        <th className="py-2.5 pl-2 pr-4 w-24 text-right">Alert State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {loadingInitial ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="py-3.5 pl-4 pr-2">
                              <div className="h-3.5 bg-slate-200 rounded w-16" />
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="h-3.5 bg-slate-200 rounded w-3/4 mb-1.5" />
                              <div className="h-3 bg-slate-100 rounded w-1/2" />
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <div className="h-3.5 bg-slate-200 rounded w-16 ml-auto" />
                            </td>
                            <td className="py-3.5 pl-2 pr-4 text-right">
                              <div className="h-3.5 bg-slate-200 rounded w-14 ml-auto" />
                            </td>
                          </tr>
                        ))
                      ) : filteredNotices.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-10 px-6 text-center text-slate-500"
                          >
                            <p className="text-sm font-medium text-slate-800">
                              No matching PGIMER notices found
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Clear your search query or trigger an immediate poll cycle.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setSourceFilter('all');
                              }}
                              className="mt-3 px-3 py-1.5 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                            >
                              Reset Filters
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredNotices.map((notice) => {
                          const isSelected = selectedNotice?.id === notice.id;
                          return (
                            <tr
                              key={notice.id}
                              onClick={() => setSelectedNoticeId(notice.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/70'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3 pl-4 pr-2 align-top font-mono tabular-nums text-[11px] font-medium text-slate-700 whitespace-nowrap">
                                #{notice.recordId}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <div className="font-medium text-slate-900 leading-snug line-clamp-2">
                                  {notice.title}
                                </div>
                                {/* Zero-Pill Metadata Discipline: Clean unboxed inline text with middots */}
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  <span>
                                    {notice.sourceId === 'vacancies'
                                      ? 'VACANCIE_VIEW.jsp'
                                      : 'recallht.jsp'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      notice.status.toLowerCase() === 'expired'
                                        ? 'text-amber-700 font-medium'
                                        : 'text-emerald-700 font-medium'
                                    }
                                  >
                                    {notice.status}
                                  </span>
                                  {notice.referenceNo && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono tabular-nums text-slate-600">
                                        {notice.referenceNo}
                                      </span>
                                    </>
                                  )}
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {notice.attachments.length} file
                                    {notice.attachments.length === 1 ? '' : 's'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3 align-top text-right font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                                {notice.publishedDate}
                              </td>
                              <td className="py-3 pl-2 pr-4 align-top text-right font-mono tabular-nums text-[11px] whitespace-nowrap">
                                {notice.emailedAt ? (
                                  <span className="text-emerald-700 font-medium">
                                    Emailed
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Indexed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Single-Notice Detail Inspection Panel */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5">
                {selectedNotice ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span>{selectedNotice.sourceName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            {selectedNotice.sourceId === 'vacancies'
                              ? `ViewAll.jsp?record=${selectedNotice.recordId}`
                              : `seerecone.jsp?id=${selectedNotice.recordId}&tableid=1`}
                          </span>
                        </div>
                        <h2 className="font-display text-sm font-bold text-slate-900 mt-1 leading-snug">
                          {selectedNotice.title}
                        </h2>
                      </div>
                    </div>

                    {/* Extracted Single-Notice Key-Value Table (Mirroring ViewAll.jsp / seerecone.jsp) */}
                    <dl className="divide-y divide-slate-200 border-t border-b border-slate-200 text-xs">
                      <div className="py-2 grid grid-cols-3 gap-2">
                        <dt className="text-slate-500 font-medium">
                          Portal Record ID
                        </dt>
                        <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                          #{selectedNotice.recordId} (Row S.No.{' '}
                          {selectedNotice.serialNo})
                        </dd>
                      </div>
                      <div className="py-2 grid grid-cols-3 gap-2">
                        <dt className="text-slate-500 font-medium">
                          Extracted Ref / Advt No.
                        </dt>
                        <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                          {selectedNotice.referenceNo || 'Not specified in text'}
                        </dd>
                      </div>
                      <div className="py-2 grid grid-cols-3 gap-2">
                        <dt className="text-slate-500 font-medium">Status</dt>
                        <dd className="col-span-2 font-medium text-emerald-700">
                          {selectedNotice.status}
                        </dd>
                      </div>
                      <div className="py-2 grid grid-cols-3 gap-2">
                        <dt className="text-slate-500 font-medium">
                          Publish Date
                        </dt>
                        <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                          {selectedNotice.publishedDate}
                        </dd>
                      </div>
                      <div className="py-2.5 grid grid-cols-3 gap-2">
                        <dt className="text-slate-500 font-medium">
                          Description
                        </dt>
                        <dd className="col-span-2 text-slate-700 leading-relaxed">
                          {selectedNotice.description}
                        </dd>
                      </div>
                    </dl>

                    {/* Extracted Title File / Guidelines / Document Links */}
                    <div>
                      <div className="text-xs font-semibold text-slate-800 mb-2">
                        Extracted Document &amp; Portal Links (
                        {selectedNotice.attachments.length})
                      </div>
                      <div className="space-y-1.5">
                        {selectedNotice.attachments.map((att, index) => (
                          <a
                            key={`${att.url}-${index}`}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-800 transition-colors"
                          >
                            <span className="flex items-center gap-2 font-medium truncate">
                              <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{att.label}</span>
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </a>
                        ))}

                        <a
                          href={selectedNotice.detailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition-colors"
                        >
                          <span className="font-mono text-[11px] truncate">
                            Official JSP Detail: {selectedNotice.detailUrl}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </a>
                      </div>
                    </div>

                    {/* Direct Resend Email Action for this Single Notice */}
                    <div className="pt-2 flex items-center justify-between gap-3">
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {selectedNotice.emailedAt
                          ? `Last emailed: ${new Date(
                              selectedNotice.emailedAt
                            ).toLocaleTimeString()}`
                          : 'Not yet emailed individually'}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendSingleNoticeEmail(selectedNotice)
                        }
                        disabled={emailingNoticeId === selectedNotice.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {emailingNoticeId === selectedNotice.id
                          ? 'Sending via Resend...'
                          : 'Send Alert Email'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Select any notice row on the left to inspect its extracted
                    ViewAll.jsp / seerecone.jsp fields and PDF attachments.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* VIEW 2: TWO-STAGE EXTRACTION & DOM PARSER INSPECTOR              */}
        {/* ================================================================ */}
        {activeSection === 'inspector' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200">
              <h1 className="font-display text-xl font-bold text-slate-900">
                PGIMER Portal Structure &amp; Two-Stage Extraction Inspector
              </h1>
              <p className="text-xs text-slate-600 mt-1 max-w-3xl">
                Inspect how notices are structured on both PGIMER JSP URLs, how a
                single notice is represented on its child detail JSP page, and
                verify the live Cheerio extraction rules for titles, record IDs,
                reference numbers, dates, statuses, and PDF attachments.
              </p>
            </div>

            {/* Structural Comparison of Both Portals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
                <div className="text-xs text-slate-500 font-mono">
                  ENDPOINT 1 · VACANCIES PORTAL
                </div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  VACANCIE_VIEW.jsp?countt=0 &rarr; ViewAll.jsp?record=ID
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The listing page renders a 2-column HTML table:{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    S.No.
                  </code>{' '}
                  and{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    Title
                  </code>
                  . Each row wraps the title in{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    &lt;a href=&quot;ViewAll.jsp?record=15714&quot;&gt;
                  </code>
                  . Because the listing table does not include PDF links or status,
                  Stage 2 fetches <code className="text-slate-800">ViewAll.jsp</code>{' '}
                  for newly discovered record IDs to extract{' '}
                  <strong>Vacancy Title</strong>, <strong>Status</strong> (Active /
                  Expired), <strong>Description</strong>,{' '}
                  <strong>Title File (PDF)</strong>, and{' '}
                  <strong>Detailed Guidelines (PDF)</strong>.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
                <div className="text-xs text-slate-500 font-mono">
                  ENDPOINT 2 · GLOBAL NOTICES (&quot;SEE ALL RECORDS&quot;)
                </div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  recallht.jsp?f=1&amp;of=1&amp;r=1 &rarr;
                  seerecone.jsp?id=ID&amp;tableid=1
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The listing page renders PGIMER&apos;s 3-column{' '}
                  <strong>See All Records</strong> table:{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    S.No.
                  </code>
                  ,{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    Publish Date
                  </code>{' '}
                  (e.g. <code className="text-slate-800">21.10.2026</code>), and{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    Title
                  </code>{' '}
                  linking to{' '}
                  <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                    seerecone.jsp?id=ev4982&amp;tableid=1
                  </code>
                  . Stage 2 fetches{' '}
                  <code className="text-slate-800">seerecone.jsp</code>{' '}
                  (&quot;See_one_full_record&quot;) to extract full text and
                  attached PDFs, with fallback protection if a legacy record
                  throws <code className="text-slate-800">NullPointerException</code>.
                </p>
              </div>
            </div>

            {/* Interactive Live HTML Parser Workbench */}
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Live JSP HTML Parser &amp; Regex Extraction Workbench
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-md">
                  {(
                    [
                      {
                        id: 'vacancies_index',
                        label: '1. VACANCIE_VIEW.jsp (Index)',
                      },
                      {
                        id: 'vacancy_detail',
                        label: '2. ViewAll.jsp (Single Vacancy)',
                      },
                      {
                        id: 'recall_index',
                        label: '3. recallht.jsp (Index)',
                      },
                      {
                        id: 'recall_detail',
                        label: '4. seerecone.jsp (Single Notice)',
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setInspectorPageType(tab.id);
                        const nextHtml = fixtures[tab.id] || '';
                        setInspectorHtml(nextHtml);
                        handleRunInspector(tab.id, nextHtml);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        inspectorPageType === tab.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-6 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Input PGIMER JSP HTML Markup (Editable)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunInspector(inspectorPageType, inspectorHtml)
                      }
                      disabled={runningInspector}
                      className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {runningInspector ? 'Parsing...' : 'Run Cheerio Parser'}
                    </button>
                  </div>
                  <textarea
                    value={inspectorHtml}
                    onChange={(e) => setInspectorHtml(e.target.value)}
                    rows={14}
                    className="w-full p-3 font-mono text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded border border-slate-300 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="lg:col-span-6 space-y-3">
                  <div className="text-xs font-medium text-slate-700">
                    Extracted Structured Output ({inspectionResult?.parsedItems.length || 0}{' '}
                    record(s))
                  </div>

                  {inspectionResult?.extractionNotes.map((note, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2"
                    >
                      {note}
                    </div>
                  ))}

                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                    {inspectionResult?.parsedItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                          <span className="font-semibold text-slate-900">
                            Record #{item.recordId}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Ref: {item.referenceNo || 'None'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Status: {item.status}</span>
                          <span aria-hidden="true">·</span>
                          <span>Date: {item.publishedDate}</span>
                        </div>
                        <div className="font-semibold text-slate-900">
                          {item.title}
                        </div>
                        <div className="text-slate-600">{item.description}</div>
                        <div className="text-[11px] font-mono text-blue-700 break-all">
                          Resolved Detail URL: {item.detailUrl}
                        </div>
                        {item.attachments.length > 0 && (
                          <div className="pt-1 space-y-1">
                            {item.attachments.map((att, i) => (
                              <div
                                key={i}
                                className="text-[11px] font-mono text-emerald-800 break-all"
                              >
                                [{att.kind}] {att.label} &rarr; {att.url}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* VIEW 3: 2D SCHEDULE & RESEND EMAIL ALERT CONFIGURATION           */}
        {/* ================================================================ */}
        {activeSection === 'schedule' && draftConfig && (
          <div className="max-w-4xl space-y-6">
            <div className="pb-4 border-b border-slate-200">
              <h1 className="font-display text-xl font-bold text-slate-900">
                Two-Dimensional Polling Schedule &amp; Resend Email Settings
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Configure your polling cadence (Dimension 1) and active Indian
                Standard Time window (Dimension 2), along with your personal
                Resend delivery address.
              </p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dimension 1: Polling Interval */}
                <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        1. Polling Interval
                      </h2>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftConfig.enabled}
                        onChange={(e) =>
                          setDraftConfig({
                            ...draftConfig,
                            enabled: e.target.checked,
                          })
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      Auto-Polling Enabled
                    </label>
                  </div>

                  <p className="text-xs text-slate-600">
                    Frequency at which Sentinel polls both PGIMER portals while
                    inside the active IST window (default: 60 minutes).
                  </p>

                  <div className="flex items-center gap-2">
                    {[15, 30, 60, 120].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setDraftConfig({
                            ...draftConfig,
                            intervalMinutes: preset,
                          })
                        }
                        className={`px-3 py-1.5 text-xs font-mono tabular-nums font-medium rounded border transition-colors cursor-pointer ${
                          draftConfig.intervalMinutes === preset
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {preset} min
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Custom Interval (Minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={draftConfig.intervalMinutes}
                      onChange={(e) =>
                        setDraftConfig({
                          ...draftConfig,
                          intervalMinutes: Number(e.target.value) || 60,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Dimension 2: IST Polling Window */}
                <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-blue-600" />
                      <h2 className="font-display text-sm font-bold text-slate-900">
                        2. Polling Window (IST / UTC+5:30)
                      </h2>
                    </div>
                    <span className="font-mono tabular-nums text-xs text-slate-600">
                      Now: {scheduler?.currentIstTime}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    Daily operational hours in Indian Standard Time (default:
                    08:00 to 18:00 IST). Outside this window, automatic polling
                    stands by.
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Window Start (IST)
                      </label>
                      <input
                        type="time"
                        value={draftConfig.windowStartIst}
                        onChange={(e) =>
                          setDraftConfig({
                            ...draftConfig,
                            windowStartIst: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Window End (IST)
                      </label>
                      <input
                        type="time"
                        value={draftConfig.windowEndIst}
                        onChange={(e) =>
                          setDraftConfig({
                            ...draftConfig,
                            windowEndIst: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 pt-1">
                    Filter policy: All newly detected notices across both PGIMER
                    portals trigger email notifications without keyword gating.
                  </div>
                </div>
              </div>

              {/* Resend Email Delivery Settings */}
              <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Resend API Email Delivery
                    </h2>
                  </div>
                  <div className="text-xs font-mono tabular-nums">
                    Server Secret Status:{' '}
                    <span
                      className={
                        config.resendConfigured
                          ? 'text-emerald-700 font-semibold'
                          : 'text-amber-700 font-semibold'
                      }
                    >
                      {config.resendConfigured
                        ? 'RESEND_API_KEY Configured'
                        : 'RESEND_API_KEY Not Set in Secrets Panel'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Alert Recipient Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={draftConfig.recipientEmail}
                      onChange={(e) =>
                        setDraftConfig({
                          ...draftConfig,
                          recipientEmail: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resend Sender Identity (From)
                    </label>
                    <input
                      type="text"
                      required
                      value={draftConfig.senderEmail}
                      onChange={(e) =>
                        setDraftConfig({
                          ...draftConfig,
                          senderEmail: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-blue-600" />
                    {sendingTestEmail
                      ? 'Sending Test Email...'
                      : 'Send Verification Email via Resend'}
                  </button>

                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {savingConfig
                      ? 'Saving Settings...'
                      : 'Save Schedule & Alert Settings'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ================================================================ */}
        {/* VIEW 4: POLL EXECUTION & EMAIL AUDIT LOGS                        */}
        {/* ================================================================ */}
        {activeSection === 'logs' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Poll Execution &amp; Resend Audit Logs
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Chronological record of scheduled and manual poll runs,
                  per-portal row counts, and outbound Resend delivery receipts.
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 pl-4 pr-3">IST Timestamp</th>
                      <th className="py-2.5 px-3">Trigger &amp; Window</th>
                      <th className="py-2.5 px-3">Per-Portal Scrape Summary</th>
                      <th className="py-2.5 px-3 text-right">Rows Scanned</th>
                      <th className="py-2.5 px-3 text-right">New Notices</th>
                      <th className="py-2.5 pl-3 pr-4">Resend Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-3 pl-4 pr-3 align-top font-mono tabular-nums text-[11px] text-slate-800 whitespace-nowrap">
                          {log.istTimeFormatted}
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <span className="font-medium text-slate-900">
                            {log.trigger === 'simulated_upload'
                              ? 'Simulated Upload'
                              : log.trigger === 'manual'
                              ? 'Manual Trigger'
                              : 'Scheduled Poll'}
                          </span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-500">
                            {log.withinIstWindow
                              ? 'In IST Window'
                              : 'Outside Window'}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top space-y-1">
                          {log.sourceResults.map((sr) => (
                            <div
                              key={sr.sourceId}
                              className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5"
                            >
                              <span className="font-medium text-slate-800">
                                {sr.sourceId === 'vacancies'
                                  ? 'VACANCIE_VIEW.jsp'
                                  : 'recallht.jsp'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                HTTP {sr.httpStatus} ({sr.durationMs}ms)
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {sr.rowsParsed} rows ({sr.newRecordsHydrated}{' '}
                                new hydrated)
                              </span>
                            </div>
                          ))}
                        </td>
                        <td className="py-3 px-3 align-top text-right font-mono tabular-nums text-slate-800">
                          {log.totalNoticesParsed}
                        </td>
                        <td className="py-3 px-3 align-top text-right font-mono tabular-nums font-semibold text-slate-900">
                          {log.newNoticesCount}
                        </td>
                        <td className="py-3 pl-3 pr-4 align-top text-[11px]">
                          {log.newNoticesCount === 0 ? (
                            <span className="text-slate-500">
                              No new notices to email
                            </span>
                          ) : log.emailSent ? (
                            <span className="text-emerald-700 font-mono tabular-nums font-medium">
                              Delivered ({log.resendEmailId})
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              {log.emailError || 'Pending RESEND_API_KEY'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
