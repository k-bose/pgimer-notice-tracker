# PGIMER Notice Sentinel

PGIMER Notice Sentinel is a personal monitoring and automated alerting console that polls the Postgraduate Institute of Medical Education & Research (PGIMER) portals for newly uploaded recruitment vacancies and global notices, dispatching instant email notifications via the Resend API whenever new updates are posted.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and workflow choices reflect your confirmed preferences and our structural inspection of both PGIMER JSP endpoints:

- **Confirmed Decision 1 — Email Delivery via Resend API**: Outbound email notifications are dispatched server-side through the Resend REST API using `RESEND_API_KEY` configured in the environment secrets, with support for configuring the recipient email address (`0xkbose@gmail.com` by default) and sender identity.
- **Confirmed Decision 2 — Two-Dimensional Polling Schedule (Interval + IST Active Window)**: The background scheduler enforces two independent dimensions:
  1. **Polling Interval**: Configurable cadence in minutes (default: `60 minutes`).
  2. **Polling Window (IST / UTC+5:30)**: Configurable daily start and end hours in Indian Standard Time (default: `08:00` to `18:00` IST). Outside this window, automatic polling pauses automatically and resumes at the start of the next active window.
- **Confirmed Decision 3 — Unfiltered Full-Notice Capture with Two-Stage Detail Hydration**: Every newly discovered notice across both PGIMER target URLs is captured, enriched by fetching its linked child detail JSP page (`ViewAll.jsp` or `seerecone.jsp`), deduplicated by its portal record ID and content fingerprint, stored locally, and emailed without keyword gating.
- **Confirmed Decision 4 — Personal Single-User Console**: Designed exclusively as a private operational console without public sign-up forms or multi-tenant clutter.

---

### 1. Overview, Target Portal Inspection & Extraction Strategy

- **What It Does**: Continuously monitors two official PGIMER JSP endpoints—the **Vacancies Portal** (`VACANCIE_VIEW.jsp?countt=0`) and the **Global "See All Records" Notice Page** (`recallht.jsp?f=1&of=1&r=1`)—using a two-stage scraper (index table scan followed by child detail-page hydration for new entries) to extract notice titles, reference/record numbers, publication dates, status labels, and downloadable PDF/document links. When a previously unseen notice is detected, it records the notice and dispatches a formatted HTML alert email via Resend.

#### A. Target Portal 1: PGIMER Vacancies (`VACANCIE_VIEW.jsp?countt=0`)

- **How Notices Show Up on the Listing Page**:
  - The URL `https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/Vacancies/JSP/VACANCIE_VIEW.jsp?countt=0` renders a server-side HTML `<table>` listing recruitment notices in reverse-chronological order.
  - The listing table itself is a compact summary containing **two columns** per row (`<tr>`):
    1. **`S.No.`** (`<td>` 1): Sequential row index (`1`, `2`, `3`, ...), which shifts whenever a newer notice is inserted at the top.
    2. **`Title`** (`<td>` 2): An anchor tag `<a href="ViewAll.jsp?record=<RECORD_ID>">` wrapping the notice headline (e.g., *"RECRUITMENT NOTICE (Sr. Resident, SMO, Jr./Sr. Demonstrator)"* or *"Project Research Scientist-I in Dept. of Radiodiagnosis"*), often accompanied by an inline `new.gif` icon.
  - Crucially, the index page does **not** expose the PDF file links, status, or full description directly in the top-level table; those live on the linked detail page `ViewAll.jsp?record=<RECORD_ID>`.

- **How a Single Notice Looks (`ViewAll.jsp?record=<RECORD_ID>`)**:
  - Navigating to `https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/Vacancies/JSP/ViewAll.jsp?record=15669` renders a key-value HTML table representing a single vacancy record:
    ```
    ┌───────────────────────┬──────────────────────────────────────────────────────────────────────┐
    │ Field Label (Left TD) │ Extracted Value / DOM Content (Right TD)                             │
    ├───────────────────────┼──────────────────────────────────────────────────────────────────────┤
    │ Vacancy Title         │ Project Technical Support-I (Data Entry Operator) in Dept. of ...    │
    │ Status                │ Active   (or "Expired" / "Deleted")                                  │
    │ Description           │ Applications are invited on contractual basis vide Advt. No. ...     │
    │                       │ (or "--" when details are solely inside the attached PDF)            │
    │ Title File            │ <a href=".../Notice_15669.pdf">Click here for Notice</a>             │
    │ Detailed Guidelines   │ <a href=".../Guidelines.pdf">Click here for details</a> (optional)   │
    │ Online Application    │ <a href="...">Click here to Apply</a> (optional)                     │
    └───────────────────────┴──────────────────────────────────────────────────────────────────────┘
    ```

#### B. Target Portal 2: PGIMER Global Notices / "See All Records" (`recallht.jsp?f=1&of=1&r=1`)

- **How Notices Show Up on the Listing Page**:
  - The URL `https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/GlobalPages/JSP/recallht.jsp?f=1&of=1&r=1` renders PGIMER's institutional **"See All Records"** table covering examination results, interview notices, eligibility lists, admissions, and administrative circulars.
  - Each row (`<tr>`) in the listing table contains **three columns** (`<td>`):
    1. **`S.No.`** (`<td>` 1): Sequential row number (`1`, `2`, `3`, ...).
    2. **`Publish Date`** (`<td>` 2): Explicit publication date printed directly in the listing table (e.g., `21.10.2026` or `08.12.2025`).
    3. **`Title`** (`<td>` 3): An anchor tag `<a href="seerecone.jsp?id=<EVENT_ID>&tableid=1">` (where `<EVENT_ID>` is an identifier such as `ev4204`) containing the full announcement title (e.g., *"Result for the posts of Senior Administrative Assistant through LDCE vide notice No. PGI-EII(1)-2022/F-23 dated 08.12.2022"*).

- **How a Single Notice Looks (`seerecone.jsp?id=<EVENT_ID>&tableid=1`)**:
  - Navigating to `https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/GlobalPages/JSP/seerecone.jsp?id=ev4204&tableid=1` renders the **"See_one_full_record"** detail view:
    ```
    ┌───────────────────────┬──────────────────────────────────────────────────────────────────────┐
    │ Field Label (Left TD) │ Extracted Value / DOM Content (Right TD)                             │
    ├───────────────────────┼──────────────────────────────────────────────────────────────────────┤
    │ See_one_full_record   │ Header banner for the individual record                              │
    │ Title                 │ RESULT FOR THE ENTRANCE TEST OF B.SC. ALLIED AND HEALTHCARE ...      │
    │ Description / Content │ Detailed instructions, schedule notes, or embedded notice text       │
    │ Attached File / Link  │ <a href="...pdf">Click here</a> or portal login / scorecard link     │
    └───────────────────────┴──────────────────────────────────────────────────────────────────────┘
    ```
  - *Note on Legacy JSP Quirk*: Occasionally, older or malformed records on `seerecone.jsp` return a `java.lang.NullPointerException` in the JSP body. Our parser detects this and falls back cleanly to the `Title`, `Publish Date`, and `id` already captured from the `recallht.jsp` listing row so no notice is ever lost.

#### C. Field-by-Field Extraction & Normalization Rules

1. **Unique Identity & Reference Number (`referenceNo` & `recordId`)**:
   - **Portal Record Key**: Parsed from the row link query string (`record=< digits >` on `VACANCIE_VIEW.jsp`, e.g., `VAC-15669`; `id=< string >` on `recallht.jsp`, e.g., `REC-ev4204`). Because `S.No.` shifts whenever a new notice is added at row 1, deduplication **never** uses `S.No.`; it uses this immutable `record` / `id` parameter (with a SHA-256 hash of `sourceId + normalizedTitle + href` if a row link lacks query parameters).
   - **Document Reference / Advertisement Number**: Extracted by running a multi-pattern regex across the `Title` and `Description` text (`/(?:vide\s+notice\s+No\.?|Advt\.?\s*No\.?|Advertisement\s*No\.?|Notice\s*No\.?|Ref\.?\s*No\.?|Endst\.?\s*No\.?)\s*[:.-]?\s*([A-Za-z0-9\/()_.-]{4,35})/i`). If an explicit institutional number (like `PGI-EII(1)-2022/F-23`) is present, it is stored alongside the portal record ID (`#15669` or `#ev4204`).
2. **Notice Title (`title`)**:
   - Extracted from the anchor text `<a>` in Column 2 of `VACANCIE_VIEW.jsp` and Column 3 of `recallht.jsp`, stripped of decorative whitespace, `new.gif` alt text, and trailing line breaks, and cross-checked against the `Vacancy Title` / `Title` row on the child detail page.
3. **Publication Date (`publishedDate`)**:
   - **For `recallht.jsp`**: Extracted directly from Column 2 (`Publish Date` `<td>`) of the listing row.
   - **For `VACANCIE_VIEW.jsp`**: Because the vacancy index table omits a dedicated date column, the parser extracts dates mentioned in the `Title` or `Description` (matching `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, or `DD Month YYYY`, e.g., `dated 16.10.2026`), and records the exact IST timestamp (`firstSeenAt`) when Sentinel first detected the notice.
4. **Status Label (`categoryOrStatus`)**:
   - **For `VACANCIE_VIEW.jsp`**: Extracted from the `Status` row in `ViewAll.jsp?record=<ID>` (`Active`, `Expired`, or `Deleted`).
   - **For `recallht.jsp`**: Tagged as `Published Notice` (or sub-classified as `Result`, `Admission`, `Interview / Schedule`, or `Circular` based on title heading keywords for quick visual scanning while still emailing all notices unfiltered).
5. **Downloadable PDF & Document Links (`attachments`)**:
   - When a new row is detected in Stage 1, Stage 2 fetches its detail page (`ViewAll.jsp` or `seerecone.jsp`) and inspects all `<a>` elements inside the detail table (`Title File`, `Detailed Guidelines`, `Apply`, or any anchor whose `href` ends in `.pdf`, `.doc`, `.docx`, or points to an external registration portal).
   - All relative paths (e.g., `../Image/Notice123.pdf` or `ViewAll.jsp?record=15669`) are resolved against the base JSP directory URL using `new URL(relativeHref, pageBaseUrl).href` so that both the web console and the Resend email contain clickable, fully qualified `https://pgimer.edu.in/...` links.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Live Feed & Single-Notice Detail Inspection**: Upon opening the console, the user sees the unified **Notices Feed** table displaying all scraped entries from both PGIMER endpoints. Clicking any row expands or opens its structured inspection drawer showing the extracted **Vacancy/Notice Title**, **Portal Record ID & Reference No.**, **Publish / First-Seen Date (IST)**, **Status**, **Full Description**, direct **PDF / Title File / Guidelines** buttons, and a one-click **Send Alert Email** action.
  2. **Two-Dimensional Schedule & Resend Configuration**: Selecting **Poll Schedule** or **Alert Settings** opens the configuration workspace where the user adjusts the **Polling Interval** (default `60` minutes), sets the **IST Polling Window** (default `08:00` to `18:00` Asia/Kolkata), configures the recipient email (`0xkbose@gmail.com`) and Resend sender address, and triggers a **Send Test Email** verification call.
  3. **Poll Execution & Email Audit Log**: Selecting **Execution Logs** displays a chronological table of every scheduled and manual poll run (IST timestamp, per-portal HTTP status & latency, total rows parsed, child detail pages hydrated, new notices found, and Resend message receipt IDs).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density, utilitarian SaaS operational console with crisp structural hairlines, single-elevation surfaces, and zero decorative clutter.
  - *Color Palette & Mood*:
    - **60% Dominant Neutral Canvas**: Crisp cool alabaster (`#F8FAFC` / `slate-50`) background with pure white (`#FFFFFF`) primary workspace surfaces.
    - **30% Structural Surfaces**: Subtle `1px solid` hairline dividers (`#E2E8F0` / `slate-200`), muted slate secondary text (`#64748B` / `slate-500`), and deep slate primary ink (`#0F172A` / `slate-900`).
    - **10% Accent Budget**: Focused clinical indigo (`#2563EB` / `blue-600`) for primary actions and active states, paired with semantic state indicators accompanied by explicit text labels: Emerald (`#16A34A`) for active window / delivered emails, Amber (`#D97706`) for outside-window standby, and Crimson (`#DC2626`) for portal reachability or Resend errors.
  - *Typography & Hierarchy*:
    - **Display & Navigation**: `Plus Jakarta Sans` (SemiBold 600 / Bold 700) for the brand wordmark, section headers, and primary navigation.
    - **Body & Table Prose**: `Public Sans` (Regular 400 / Medium 500) for high legibility across long medical/recruitment notice titles at `13px–15px`.
    - **Timestamps, Record IDs & Telemetry**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for IST timestamps, portal record IDs (`VAC-15669`, `REC-ev4204`), countdown timers, and notice counters.
  - *Component Styling & Layout*:
    - **Top Bar Contract**: Strict 1-row, 3-zone header separated by `gap-8`:
      `PGIMER Sentinel` (Brand wordmark) — `Notices Feed · Poll Schedule · Alert Settings · Execution Logs` (4 single-line text links) — `Run Poll Now` (1 primary action button).
    - **Zero-Pill Metadata Discipline**: Source portal labels (`Vacancies Portal` · `Global Notices`), publication dates, status labels, and notice reference IDs are rendered as clean, unboxed inline text separated by middots (`·`), never wrapped in rounded pill capsules.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Two-Stage Scraping (Index Scan -> Child Detail Hydration for New Records)**
  - *Chosen Approach*: On each poll cycle, fetch the two index JSP pages first (`VACANCIE_VIEW.jsp?countt=0` and `recallht.jsp?f=1&of=1&r=1`), extract all row links (`ViewAll.jsp?record=...` and `seerecone.jsp?id=...`), and diff their record IDs against our stored index. Only rows whose record IDs are not yet in our database trigger a Stage 2 HTTP fetch to `ViewAll.jsp` or `seerecone.jsp` (with polite concurrency of 3 requests at a time) to scrape `Status`, `Description`, `Title File` PDF links, and `Detailed Guidelines`.
  - *Why*: Fetching 2 index pages takes ~1–2 seconds, whereas re-fetching 150 child detail pages on every hourly poll would overwhelm PGIMER's legacy JSP server and risk IP timeouts.
- **Decision 2: Server-Side Background Scheduler with IST Timezone Calculation**
  - *Chosen Approach*: An Express server-side scheduler evaluates the current time in `Asia/Kolkata` (`UTC+5:30`) every minute. If the current IST time falls within `[windowStartIst, windowEndIst]` (default `08:00` to `18:00`) and at least `pollingIntervalMinutes` (default `60`) have elapsed since the last poll, it triggers the two-stage scraper pipeline.
  - *Why*: Guarantees accurate adherence to Indian Standard Time regardless of the cloud container's host timezone.
- **Decision 3: Resilient Network & TLS Handling for NIC/PGIMER Servers**
  - *Chosen Approach*: PGIMER (`14.139.56.210`, hosted on India's National Knowledge Network) uses legacy TLS configurations and occasionally exhibits high initial handshake latency from non-Indian cloud regions. The server scraper configures a dedicated HTTPS agent with legacy TLS cipher/renegotiation compatibility, realistic browser headers, configurable request timeouts (`20s`), automatic retry with backoff, and an HTML Diagnostic / Snapshot Inspector tool so you can also test or paste raw JSP HTML if NKN geo-throttles a cloud IP.
- **Decision 4: Baseline Seeding vs. Live New-Update Emailing**
  - *Chosen Approach*: On the very first initial sync, existing notices on both portals are indexed as the baseline (with child detail hydration for the latest top records) without triggering dozens of retroactive emails. Every subsequent poll that discovers one or more new record IDs immediately sends a Resend email listing each new notice's title, reference number, status, publish date, description, and direct clickable links to the `Title File` PDF, `Detailed Guidelines` PDF, and `ViewAll.jsp` / `seerecone.jsp` page.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Two-Stage Extraction Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT CONSOLE (React 19)                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Top Bar: [PGIMER Sentinel] ── [Feed · Schedule · Alerts · Logs] ── [CTA]│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│         │                        │                        │                  │
│         ▼                        ▼                        ▼                  │
│  ┌──────────────────┐   ┌────────────────────┐   ┌────────────────────────┐  │
│  │ Notices Feed View│   │ Schedule & Resend  │   │ Execution & Email      │  │
│  │ - Source Filter  │   │ Config View        │   │ Audit Logs View        │  │
│  │ - Detail Drawer  │   │ - Interval (60m)   │   │ - Poll Run History     │  │
│  │ - PDF/Title File │   │ - IST Window (8-18)│   │ - Per-Source Status    │  │
│  │ - "Send Email"   │   │ - Recipient Email  │   │ - Resend Message IDs   │  │
│  └──────────────────┘   └────────────────────┘   └────────────────────────┘  │
└─────────┬────────────────────────┬────────────────────────┬──────────────────┘
          │ REST (/api/notices)    │ REST (/api/config)     │ REST (/api/poll)
          ▼                        ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       NODE / EXPRESS SERVER RUNTIME                          │
│                                                                              │
│  ┌──────────────────────────────┐      ┌──────────────────────────────────┐  │
│  │ 2D IST Scheduler Engine      │─────▶│ STAGE 1: Index Table Scraper     │  │
│  │ - Checks Asia/Kolkata clock  │      │ 1. VACANCIE_VIEW.jsp?countt=0    │  │
│  │   (08:00 - 18:00 IST window) │      │    -> parses S.No, Title,        │  │
│  │ - Enforces 60m interval      │      │       href="ViewAll.jsp?record=" │  │
│  └──────────────────────────────┘      │ 2. recallht.jsp?f=1&of=1&r=1     │  │
│                                        │    -> parses S.No, Publish Date, │  │
│                                        │       Title, href="seerecone.jsp"│  │
│                                        └─────────────────┬────────────────┘  │
│                                                          │                   │
│                                        Diff recordId vs. Local Store         │
│                                                          ▼                   │
│  ┌──────────────────────────────┐      ┌──────────────────────────────────┐  │
│  │ Resend Email Dispatcher      │◀─────│ STAGE 2: Child Detail Hydration  │  │
│  │ - POST api.resend.com/emails │      │ - Fetches ViewAll.jsp?record=ID  │  │
│  │ - Sends HTML alert with      │      │   -> Status, Description,        │  │
│  │   Title, Ref No, Status,     │      │      Title File PDF, Guidelines  │  │
│  │   Publish Date & PDF links   │      │ - Fetches seerecone.jsp?id=ID    │  │
│  └──────────────────────────────┘      │   -> Full Text & Attachment URLs │  │
│                                        └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `NoticeItem`:
    - `id`: Deterministic key (`"vacancies:15669"` or `"recall_global:ev4204"`, or SHA-256 fallback)
    - `recordId`: Portal query ID (`"15669"` or `"ev4204"`)
    - `referenceNo`: Regex-extracted official notice/advt number (e.g., `"PGI-EII(1)-2022/F-23"`) or `null`
    - `sourceId`: `"vacancies"` | `"recall_global"`
    - `sourceName`: `"Vacancies Portal"` | `"Global Notices (See All Records)"`
    - `title`: Full notice title string
    - `status`: `"Active"` | `"Expired"` | `"Published"`
    - `description`: Full description text from detail page
    - `publishedDate`: Extracted date string (`"21.10.2026"`)
    - `detailUrl`: Absolute URL to `ViewAll.jsp?record=...` or `seerecone.jsp?id=...`
    - `attachments`: Array of `{ label: string, url: string, kind: "title_file" | "guidelines" | "apply" | "document" }`
    - `firstSeenAt`: ISO timestamp
    - `emailedAt`: ISO timestamp | `null`
  - `PollerConfig`: `intervalMinutes` (default `60`), `windowStartIst` (`"08:00"`), `windowEndIst` (`"18:00"`), `enabled` (default `true`), `recipientEmail` (`"0xkbose@gmail.com"`), `senderEmail` (`"PGIMER Sentinel <onboarding@resend.dev>"`).
  - `PollRunLog`: `id`, `startedAt`, `completedAt`, `trigger` (`"scheduled"` | `"manual"`), `istTimeFormatted`, `sourceResults` (per-URL status, latency, rows parsed, new records hydrated, error details), `newNoticesCount`, `emailSent`, `resendEmailId`, `error`.

- **Interactive Component & State Mapping**:
  - **Top Bar `Run Poll Now` Button**: Triggers `POST /api/poll/run`, executes Stage 1 & Stage 2 scraping across both PGIMER endpoints, dispatches Resend alert emails if new notices are found, and updates the feed and logs.
  - **Notices Feed & Detail Inspection Drawer**: Supports filtering by source (`All Sources`, `Vacancies Portal`, `Global Notices`), searching by title/reference number, inspecting the full detail fields (`Vacancy Title`, `Status`, `Description`, `Title File`, `Detailed Guidelines`), and clicking `Send Alert Email` (`POST /api/notices/:id/email`) on any row to test or re-send that notice's formatted HTML alert via Resend.
  - **Schedule & Alert Settings View**: Persists the 2D schedule (`intervalMinutes` + `windowStartIst`/`windowEndIst` in IST) and Resend settings via `PUT /api/config`, shows live IST clock and current window status (`Active Window` vs `Standby Outside Window`), and provides a `Send Test Email` action (`POST /api/email/test`).
