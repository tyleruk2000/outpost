import { useQuery } from "@tanstack/react-query";
import { lazy } from "react";
import { Route, Routes, useNavigate } from "react-router";
import { AppShell } from "./components/app-shell";
import { Page } from "./components/page";
import { ServerDown } from "./components/server-down";
import { Skeleton } from "./components/ui/misc";
import { giveUpAfter, OutOfReach, PROBE_TIMEOUT_MS, ReachGate } from "./features/kept/reach";
import { canOpenOutOfReach } from "./features/kept/register";
import { NotesTree } from "./features/notes/notes-tree";
import { ApiError, api } from "./lib/api";
import { EventsProvider } from "./lib/events";

const HomePage = lazy(() => import("./features/home/home-page"));
const LibraryPage = lazy(() => import("./features/library/library-page"));
const DocumentPage = lazy(() => import("./features/library/document-page"));
const CollectionPage = lazy(() => import("./features/library/collection-page"));
const ReaderPage = lazy(() => import("./features/reader/reader-page"));
const NotesPage = lazy(() => import("./features/notes/notes-page"));
const ChatPage = lazy(() => import("./features/chat/chat-page"));
const ContactsPage = lazy(() => import("./features/contacts/contacts-page"));
const ImportPage = lazy(() => import("./features/imports/import-page"));
const EncryptionPage = lazy(() => import("./features/encryption/encryption-page"));
const ExplorePage = lazy(() => import("./features/explore/explore-page"));
const DownloadsPage = lazy(() => import("./features/downloads/downloads-page"));
const DownloadPage = lazy(() => import("./features/downloads/download-page"));
const UnderstandPage = lazy(() => import("./features/understand/understand-page"));
const MapsPage = lazy(() => import("./features/maps/maps-page"));
const RepeatersPage = lazy(() => import("./features/repeaters/repeaters-page"));
const RepeaterPage = lazy(() => import("./features/repeaters/repeater-page"));
const SearchPage = lazy(() => import("./features/search/search-page"));
const StoragePage = lazy(() => import("./features/storage/storage-page"));
const ManagePage = lazy(() => import("./features/manage/manage-page"));
const MergePage = lazy(() => import("./features/merge/merge-page"));
const SettingsPage = lazy(() => import("./features/settings/settings-page"));
const SetupGuidePage = lazy(() => import("./features/help/setup-guide-page"));
const KeptPage = lazy(() => import("./features/kept/kept-page"));
const RadioPage = lazy(() => import("./features/radio/radio-page"));
const ToolsPage = lazy(() => import("./features/tools/tools-page"));
const PreparePage = lazy(() => import("./features/prepare/prepare-page"));
const NuclearPage = lazy(() => import("./features/nuclear/nuclear-page"));
const PropagationPage = lazy(() => import("./features/propagation/propagation-page"));
const PlansPage = lazy(() => import("./features/propagation/plans/plans-page"));
const PlanPage = lazy(() => import("./features/propagation/plans/plan-page"));
const LogPage = lazy(() => import("./features/propagation/log/log-page"));
const CoveragePage = lazy(() => import("./features/propagation/coverage-map/coverage-page"));

function NotFound() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title">There is nothing at this address</h1>
      <p className="mt-2 text-ink-muted">The page may have been moved or deleted. Use the sidebar or search to find your way.</p>
    </Page>
  );
}

export function App() {
  // There are no accounts: the only thing to find out before drawing the app is whether its server is there.
  // Where the app itself is kept on this device, it can open without the server: the question is then asked once,
  // with a limit on the wait, because a phone away from home may get no answer at all rather than a refusal.
  const keptHere = canOpenOutOfReach();
  const server = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ status: string }>("/api/health", undefined, keptHere ? giveUpAfter(PROBE_TIMEOUT_MS) : undefined),
    staleTime: Number.POSITIVE_INFINITY,
    ...(keptHere ? { retry: false } : {}),
  });
  const navigate = useNavigate();

  if (server.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-spine" aria-busy>
        <Skeleton className="h-2 w-40 opacity-30" />
      </div>
    );
  }
  if (server.isError) {
    const outOfReach = keptHere && server.error instanceof ApiError && server.error.isUnreachable;
    return outOfReach ? <OutOfReach onReachable={() => void server.refetch()} /> : <ServerDown onRetry={() => server.refetch()} />;
  }

  return (
    <EventsProvider enabled>
      <Routes>
        <Route
          element={
            // The gate swaps the whole shell for the kept copies when the server goes out of reach.
            <ReachGate>
              <AppShell notesTree={<NotesTree />} onNewPage={() => navigate("/notes?new=1")} />
            </ReachGate>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/documents/:id" element={<DocumentPage />} />
          <Route path="library/collections/:id" element={<CollectionPage />} />
          <Route path="library/read/:collectionId/*" element={<ReaderPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="radio/repeaters" element={<RepeatersPage />} />
          <Route path="radio/repeaters/:id" element={<RepeaterPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="notes/:id" element={<NotesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="contacts/*" element={<ContactsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="encryption" element={<EncryptionPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="downloads/:id" element={<DownloadPage />} />
          <Route path="search/how-it-works" element={<UnderstandPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="storage/manage" element={<ManagePage />} />
          <Route path="storage/merge" element={<MergePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help/search-and-answers" element={<SetupGuidePage />} />
          <Route path="kept" element={<KeptPage />} />
          <Route path="radio" element={<RadioPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="prepare" element={<PreparePage />} />
          <Route path="prepare/nuclear" element={<NuclearPage />} />
          <Route path="radio/propagation" element={<PropagationPage />} />
          <Route path="radio/coverage" element={<CoveragePage />} />
          <Route path="radio/log" element={<LogPage />} />
          <Route path="radio/plans" element={<PlansPage />} />
          <Route path="radio/plans/:id" element={<PlanPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </EventsProvider>
  );
}
