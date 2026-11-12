import { HomeLink } from "../home-link";
import { KnowledgeBaseControls } from "./knowledge-base-controls";
import { UsageDashboard } from "./usage-dashboard";

export default function AdminPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <HomeLink />
      <KnowledgeBaseControls />
      <UsageDashboard />
    </div>
  );
}
