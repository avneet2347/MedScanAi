import InfoPage from "@/components/InfoPage";

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms"
      intro="These terms summarize the intended use of the project and the limits users should keep in mind when working with medical content."
      sections={[
        {
          title: "Educational use",
          paragraphs: [
            "MediScan AI is intended to help people read reports, surface possible risks, and organize follow-up questions. It is not medical advice and should not be used as a standalone treatment decision system.",
            "Any AI-generated explanation, medicine summary, or condition suggestion should be checked against the original report and reviewed with a qualified clinician.",
          ],
        },
        {
          title: "Account and data responsibility",
          paragraphs: [
            "Anyone deploying or operating the app is responsible for securing credentials, reviewing storage access, and confirming that uploaded report data is handled appropriately for their setting.",
            "Users should only upload documents they are permitted to process and should avoid sharing access tokens, database keys, or protected health information in unsecured environments.",
          ],
        },
        {
          title: "Availability and limits",
          paragraphs: [
            "The project depends on third-party services and model outputs, so OCR quality, analysis coverage, and uptime can vary.",
            "The maintainers do not guarantee that every report, medicine name, or lab value will be parsed perfectly, especially when scans are incomplete, blurry, or ambiguous.",
          ],
        },
      ]}
    />
  );
}
