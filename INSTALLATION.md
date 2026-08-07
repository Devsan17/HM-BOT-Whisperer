# BotWhisper Installation Guide

BotWhisper is a Next.js dashboard that audits a website's SEO, security, performance, and accessibility to AI crawlers. Its audit worker uses Playwright and a headless Chromium browser.

## Prerequisites

Install the following before continuing:

- [Node.js](https://nodejs.org/) 20 LTS or newer
- npm (included with Node.js)
- An internet connection for dependency installation, browser installation, and website audits

Check that Node.js and npm are available:

```bash
node --version
npm --version
```

## Install

1. Open a terminal in the project directory:

   ```bash
   cd BotWhisper
   ```

2. Install the exact dependency versions recorded in `package-lock.json`:

   ```bash
   npm ci
   ```

3. Download the Chromium browser used by Playwright:

   ```bash
   npx playwright install chromium
   ```

   On Linux, if Chromium reports missing operating-system libraries, install the browser and its dependencies with:

   ```bash
   npx playwright install --with-deps chromium
   ```

No `.env` file or database setup is currently required.

## Run in development

Start the development server:

```bash
npm run dev
```

The project attempts to open the app automatically. If it does not, visit [http://localhost:3000](http://localhost:3000).

Enter a public website URL in the dashboard and start a scan. The application writes generated reports, job status files, logs, screenshots, and HTML snapshots into these directories:

- `reports/`
- `screenshots/`
- `html-snapshots/`

The user running BotWhisper must have write permission for those directories.

## Run an audit from the command line

The audit engine can also run without the dashboard:

```bash
node robot-can.js https://example.com
```

The combined JSON result is written to `reports/report.json`.

## Production build

Create and run an optimized Next.js build:

```bash
npm run build
npm run start
```

The production server listens on port 3000 by default. To use another port:

```bash
npm run start -- -p 8080
```

Keep the application on a host with a persistent, writable filesystem because audit jobs and their results are stored locally. A read-only or serverless filesystem is not suitable without changing the storage layer.

## Troubleshooting

### Playwright cannot find Chromium

Run:

```bash
npx playwright install chromium
```

Make sure this command runs under the same operating-system user that runs BotWhisper.

### Port 3000 is already in use

Start development on a different port:

```bash
npm run dev -- -p 3001
```

Then open `http://localhost:3001`.

### A scan fails or times out

- Confirm the machine can access the target URL and Google PageSpeed/CrUX services.
- Check the relevant `reports/jobs/<job-id>/audit.log` file.
- Some websites block automated browsers or specific bot user agents; these failures may be expected audit findings.
- Only one dashboard scan can run at a time.

### Clean reinstall

Remove `node_modules`, then repeat the install steps:

```bash
npm ci
npx playwright install chromium
```

