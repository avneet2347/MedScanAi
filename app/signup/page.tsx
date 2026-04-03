import { Suspense } from "react";
import { Cormorant_Garamond, DM_Mono, Outfit } from "next/font/google";
import AuthPageClient from "@/components/AuthPageClient";

const sans = Outfit({
  subsets: ["latin"],
  variable: "--workspace-font-sans",
});

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--workspace-font-serif",
  weight: ["400", "500", "600", "700"],
});

const mono = DM_Mono({
  subsets: ["latin"],
  variable: "--workspace-font-mono",
  weight: ["400", "500"],
});

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <div className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <AuthPageClient mode="signup" />
      </div>
    </Suspense>
  );
}
