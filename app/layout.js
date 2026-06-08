import "./globals.css";

export const metadata = {
  title: "AI Website Intelligence Platform",
  description:
    "Premium SaaS dashboard for AI readiness, crawlability, and website intelligence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
