import { Suspense } from "react";
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
import ReportWorkbench from "@/components/ReportWorkbench";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--workspace-font-sans",
});

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--workspace-font-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--workspace-font-mono",
});

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <div className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <ReportWorkbench />
      </div>
    </Suspense>
  );
}