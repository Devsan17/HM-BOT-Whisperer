import DashboardShell from "../components/dashboard-shell";
import { getLatestJobStatus, getReportData } from "../lib/report";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const report = getReportData();
  const latestJob = getLatestJobStatus();

  return <DashboardShell initialActiveJob={latestJob} initialReport={report} />;
}
