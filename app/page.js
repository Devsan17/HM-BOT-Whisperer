import DashboardShell from "../components/dashboard-shell";
import { getReportData } from "../lib/report";

export default function HomePage() {
  const report = getReportData();

  return <DashboardShell initialReport={report} />;
}
