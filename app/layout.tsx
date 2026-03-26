import "./globals.css";
import { getThemeBootstrapScript } from "@/lib/theme";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="dark" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }} />
        {children}
      </body>
    </html>
  );
}
