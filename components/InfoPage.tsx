import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";
import styles from "./InfoPage.module.css";

type InfoSection = {
  title: string;
  paragraphs: string[];
};

type InfoPageProps = {
  title: string;
  intro: string;
  sections: InfoSection[];
};

export default function InfoPage({ title, intro, sections }: InfoPageProps) {
  return (
    <main className={styles.infoShell}>
      <div className={styles.infoCard}>
        <Link href="/" className={styles.backLink}>
          Back to home
        </Link>
        <p className={styles.eyebrow}>
          <BrandWordmark />
        </p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{intro}</p>

        <div className={styles.sectionList}>
          {sections.map((section) => (
            <section key={section.title} className={styles.sectionCard}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p
                  key={paragraph}
                  className={`${styles.paragraph} ${index === 0 ? styles.paragraphFirst : ""}`}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
