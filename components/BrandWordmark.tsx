import { DM_Serif_Display } from "next/font/google";
import styles from "./BrandWordmark.module.css";

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
});

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export default function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={joinClassNames(styles.root, serif.className, className)}>
      <span>Medi</span>
      <span className={styles.accent}>Scan</span>
      <span className={styles.accent}>AI</span>
    </span>
  );
}
