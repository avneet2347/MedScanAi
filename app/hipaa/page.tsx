import InfoPage from "@/components/InfoPage";

export default function HipaaPage() {
  return (
    <InfoPage
      title="HIPAA"
      intro="The landing page highlights HIPAA-aware handling, but production compliance always depends on how the system is configured and operated."
      sections={[
        {
          title: "What the project supports",
          paragraphs: [
            "The workspace is structured around authenticated access, account-scoped history, and server-side report processing so teams can build toward stronger handling of sensitive report data.",
            "Those foundations can help reduce accidental exposure, but they are only one part of a compliant healthcare workflow.",
          ],
        },
        {
          title: "What still needs verification",
          paragraphs: [
            "HIPAA readiness depends on your deployment details, including Business Associate Agreements, audit controls, encryption posture, access reviews, backup policy, and incident response processes.",
            "Before handling protected health information in production, confirm that every connected vendor, storage system, and model provider is approved for your use case.",
          ],
        },
        {
          title: "Practical guidance",
          paragraphs: [
            "Use the app with least-privilege credentials, keep environment variables out of client bundles, and verify that reports are retained only as long as your policy requires.",
            "If you are evaluating the project for healthcare operations, involve your security, legal, and compliance teams before uploading real patient data.",
          ],
        },
      ]}
    />
  );
}
