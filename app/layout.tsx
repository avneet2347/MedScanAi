import "./globals.css";
import AutoAnalyzer from "@/components/AutoAnalyzer";
import ResultViewer from "@/components/ResultViewer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="dark">
        <AutoAnalyzer />
        <ResultViewer />
        {children}
      </body>
    </html>
  );
}