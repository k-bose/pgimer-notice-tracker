# PGIMER Notice Sentinel

> Automated monitoring and real-time email alert console for PGIMER recruitment vacancies and institutional notices.

PGIMER Notice Sentinel continuously scans the Postgraduate Institute of Medical Education & Research (PGIMER) web portals, extracts newly published vacancies and public notices with attached PDF documents, and dispatches formatted alerts via the Resend API within configured Indian Standard Time (IST) business windows.

---

## Key Features

- **Dual-Portal Tracking**: Simultaneously tracks both the [Vacancies Portal](https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/Vacancies/JSP/VACANCIE_VIEW.jsp?countt=0) and the [Global "See All Records" Portal](https://pgimer.edu.in/PGIMER_PORTAL/PGIMERPORTAL/GlobalPages/JSP/recallht.jsp?f=1&of=1&r=1).
- **Two-Stage Detail Hydration**:
  - *Stage 1*: Lightweight scan of index tables to detect unseen record IDs without hammering servers.
  - *Stage 2*: On-demand hydration of child detail pages (`ViewAll.jsp`, `seerecone.jsp`) to extract full descriptions, reference/advertisement numbers, and direct PDF attachments.
- **Two-Dimensional IST Scheduler**:
  - **Cadence**: Configurable polling interval (default: every 60 minutes).
  - **Active Window**: Time-fenced to Indian Standard Time (`UTC+05:30`, default: `08:00` to `18:00` IST). Automatically enters standby outside the window.
- **Resend Email Alerts**: Sends clean HTML alerts for every newly detected notice containing title, reference number, publication date, description, and direct links to attached PDFs and guidelines.
- **Multi-Mode Transport Resilience**: Handles legacy NIC/NKN server latency and cloud geo-blocking via direct connection, fallback HTML relay (`r.jina.ai`), and cached snapshot fixtures.
- **Unified Web Console**: High-density operational interface featuring a searchable notice feed, live IST countdown status, HTML parser sandbox/inspector, and execution audit logs.

---

## Monitored Portals

| Portal | Source ID | Listing Endpoint | Child Detail Page |
| :--- | :--- | :--- | :--- |
| **Vacancies Portal** | `vacancies` | `VACANCIE_VIEW.jsp` / `VIEW_CALL.jsp` | `ViewAll.jsp?record=<ID>` |
| **Global Notices** | `recall_global` | `recallht.jsp` / `allrec.jsp` | `seerecone.jsp?id=<ID>` |

---

## Architecture Flow

```
┌────────────────────────────────┐       ┌────────────────────────────────┐
│      PGIMER Vacancies JSP      │       │     PGIMER Global Notices      │
│     (VIEW_CALL.jsp?aflag=0)    │       │        (allrec.jsp?...)        │
└───────────────┬────────────────┘       └───────────────┬────────────────┘
                │                                        │
                └───────────────────┬────────────────────┘
                                    ▼
                     Stage 1: Index Table Scraper
                                    │
                                    ▼
                      Diff Record IDs vs Local Store
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
             [Unseen Records]              [Already Indexed]
                     │                             │
                     ▼                             ▼
        Stage 2: Child Detail Hydration         (Skip)
      (ViewAll.jsp / seerecone.jsp)
                     │
                     ├─────────────────────────────┐
                     ▼                             ▼
         Local State Persistence          Resend Email Dispatch
       (`data/sentinel-state.json`)     (HTML Alert with PDF Links)
                     │
                     ▼
           React 19 Web Console
       (Feed · Scheduler · Logs)
```

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Node.js, Express, TypeScript (`tsx`)
- **Scraper & Parser**: Cheerio, native HTTPS agent with legacy TLS compatibility
- **Email Delivery**: [Resend REST API](https://resend.com)
- **Timezone Engine**: Native `Intl.DateTimeFormat` configured for `Asia/Kolkata`

---

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18+ or v20+
- npm, pnpm, or [Bun](https://bun.sh/)

### 2. Installation

```bash
git clone https://github.com/k-bose/pgimer-notice-tracker.git
cd pgimer-notice-tracker
npm install
```

### 3. Environment Configuration

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Resend API key for outbound notice alert emails
RESEND_API_KEY="re_123456789_your_resend_api_key"

# Verified sender identity in Resend
RESEND_FROM_EMAIL="PGIMER Sentinel <onboarding@resend.dev>"

# Destination email for alerts
ALERT_RECIPIENT_EMAIL="your-email@example.com"
```

### 4. Running the Application

```bash
# Start development server (API server + Vite HMR on port 3000)
npm run dev
```

Visit `http://localhost:3000` to access the console.

To build and run in production mode:

```bash
npm run build
npm start
```

---

## Configuration & Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `RESEND_API_KEY` | No* | `""` | Resend API key for automated email delivery. |
| `RESEND_FROM_EMAIL` | No | `PGIMER Sentinel <onboarding@resend.dev>` | Sender email address verified in Resend. |
| `ALERT_RECIPIENT_EMAIL` | No | `0xkbose@gmail.com` | Primary recipient for notice alert notifications. |
| `PORT` | No | `3000` | HTTP server port. |

*\* Note: When `RESEND_API_KEY` is omitted, the scraper and dashboard operate fully; outbound email dispatch will simply be skipped.*

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/state` | Returns indexed notices, active scheduler config, and recent execution logs. |
| `POST` | `/api/poll/run` | Triggers an immediate scrape cycle across both PGIMER portals. |
| `PUT` | `/api/config` | Updates poller settings (interval, IST active window, recipient/sender emails). |
| `POST` | `/api/notices/:id/email` | Manually sends or re-dispatches an alert email for a specific notice. |
| `POST` | `/api/email/test` | Dispatches a test email to verify Resend delivery. |
| `GET` | `/api/parser/fixtures` | Retrieves verified PGIMER HTML fixtures for test parsing. |
| `POST` | `/api/parser/inspect` | Parses provided raw HTML or fixtures to test DOM extraction rules. |

---

## State Persistence

All discovered notices, run logs, and configuration overrides are saved in:

```
data/sentinel-state.json
```

This file preserves notice deduplication history across runs and server restarts.

---

## 100% Free GitHub Deployment (Actions + Pages)

You can run PGIMER Notice Sentinel completely for free without keeping your computer on. Scheduled scraping runs autonomously via **GitHub Actions** and the web console is hosted via **GitHub Pages**.

### 1. Push to Main Branch

```bash
git push origin main
```

### 2. Configure GitHub Repository Secrets

Go to your repository on GitHub:
1. Navigate to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret** and add:
   - `RESEND_API_KEY`: Your Resend API key (e.g. `re_123456...`).
   - `ALERT_RECIPIENT_EMAIL`: *(Optional)* Email address to receive alerts (e.g. `your-email@gmail.com`).
   - `RESEND_FROM_EMAIL`: *(Optional)* Verified sender (defaults to `PGIMER Sentinel <onboarding@resend.dev>`).

### 3. Grant Workflow Read & Write Permissions

To allow GitHub Actions to commit newly detected notices back to `data/sentinel-state.json`:
1. Navigate to **Settings** > **Actions** > **General**.
2. Scroll to **Workflow permissions**.
3. Select **"Read and write permissions"** and click **Save**.

### 4. Enable GitHub Pages

1. Navigate to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **"GitHub Actions"**.

### 5. Run & Monitor

- **Scheduled Polling**: Runs automatically every hour during Indian Standard Time working hours (`08:00` to `18:00` IST).
- **Manual Trigger**: Go to the **Actions** tab > select **PGIMER Sentinel Notice Poller & Dashboard** > click **Run workflow**.
- **Live Web Console**: Once deployed, visit `https://<username>.github.io/pgimer-notice-tracker/` to view indexed notices, logs, and attachments.

---

## License

MIT © [K Bose](https://github.com/k-bose)

