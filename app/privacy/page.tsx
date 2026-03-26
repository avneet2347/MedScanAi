import InfoPage from "@/components/InfoPage";

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      intro="This project is built around medical-report processing, so privacy expectations need to stay clear even in a demo environment."
      sections={[
        {
          title: "What the app stores",
          paragraphs: [
            "Authenticated uploads are linked to the signed-in account and can include the original file, extracted OCR text, AI analysis output, and report-grounded chat history.",
            "Storage and persistence are designed around Supabase so teams can keep uploads scoped to the right user and avoid mixing report data across accounts.",
          ],
        },
        {
          title: "How report data is used",
          paragraphs: [
            "Uploaded data is processed to generate OCR, structured report explanations, risk flags, and context-aware follow-up answers inside the workspace.",
            "The product should be treated as an educational and workflow support tool, not as a replacement for clinical review, diagnosis, or emergency care.",
          ],
        },
        {
          title: "Your controls",
          paragraphs: [
            "You can sign out, clear local demo history from the result viewer, and control which environment variables and backend services are connected in your own deployment.",
            "Before using this project with real patient information, verify your storage settings, retention rules, access controls, and compliance posture for the environment you deploy.",
          ],
        },
      ]}
    />
  );
}
