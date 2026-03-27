import "./globals.css";
import { DEFAULT_THEME, getThemeBootstrapScript } from "@/lib/theme";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      style={{ colorScheme: DEFAULT_THEME }}
    >
      <body className={DEFAULT_THEME} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }} />
        {children}
      </body>
    </html>
  );
}
