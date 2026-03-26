import InfoPage from "@/components/InfoPage";

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact"
      intro="The quickest way to reach the project maintainer is through the repository linked from the landing page footer."
      sections={[
        {
          title: "Project support",
          paragraphs: [
            "For bug reports, implementation questions, or deployment issues, use the GitHub repository and issue tracker so the discussion stays attached to the code and its history.",
            "That route is also the best place to document reproduction steps, screenshots, environment details, and proposed fixes.",
          ],
        },
        {
          title: "What to include",
          paragraphs: [
            "Include the page or component involved, the exact interaction you clicked, what happened, and what you expected instead.",
            "If the issue involves medical-report processing, mention whether the problem appeared during upload, OCR, analysis generation, feature drill-down, or report chat.",
          ],
        },
        {
          title: "Repository link",
          paragraphs: [
            "Repository: https://github.com/avneet2347/MedScanAi",
            "Issue tracker: https://github.com/avneet2347/MedScanAi/issues",
          ],
        },
      ]}
    />
  );
}
