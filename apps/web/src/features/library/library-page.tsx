import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";
import { Page, PageHeader } from "@/components/page";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";

const DocumentsPanel = lazy(() => import("./documents-panel"));
const CollectionsPanel = lazy(() => import("./collections-panel"));
const LearningPanel = lazy(() => import("@/features/learning/learning-panel"));

const fallback = (
  <div className="mt-6 grid gap-3" aria-busy>
    <Skeleton className="h-12" />
    <Skeleton className="h-12" />
    <Skeleton className="h-12" />
  </div>
);

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab = asked === "collections" || asked === "learning" ? asked : "documents";
  return (
    <Page>
      <PageHeader
        title="Library"
        under="/library"
        description="Everything you keep: your own documents, and the reference collections and maps you have installed."
      />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          setParams((current) => {
            const updated = new URLSearchParams(current);
            if (next === "documents") updated.delete("tab");
            else updated.set("tab", next);
            return updated;
          })
        }
      >
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <DocumentsPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="collections" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <CollectionsPanel />
          </Suspense>
        </TabsContent>
        <TabsContent value="learning" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <LearningPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
