import { useQueryClient } from "@tanstack/react-query";
import { lazy, useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router";
import { AppShell } from "./components/app-shell";
import { Page } from "./components/page";
import { Skeleton } from "./components/ui/misc";
import { ServerDown, SignIn } from "./features/auth/auth-screens";
import { NotesTree } from "./features/notes/notes-tree";
import { EventsProvider } from "./lib/events";
import { useSession } from "./lib/queries";

const HomePage = lazy(() => import("./features/home/home-page"));
const LibraryPage = lazy(() => import("./features/library/library-page"));
const DocumentPage = lazy(() => import("./features/library/document-page"));
const CollectionPage = lazy(() => import("./features/library/collection-page"));
const ReaderPage = lazy(() => import("./features/reader/reader-page"));
const NotesPage = lazy(() => import("./features/notes/notes-page"));
const ImportPage = lazy(() => import("./features/imports/import-page"));
const ExplorePage = lazy(() => import("./features/explore/explore-page"));
const DownloadsPage = lazy(() => import("./features/downloads/downloads-page"));
const MapsPage = lazy(() => import("./features/maps/maps-page"));
const SearchPage = lazy(() => import("./features/search/search-page"));
const StoragePage = lazy(() => import("./features/storage/storage-page"));
const SettingsPage = lazy(() => import("./features/settings/settings-page"));

function NotFound() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title">There is nothing at this address</h1>
      <p className="mt-2 text-ink-muted">The page may have been moved or deleted. Use the sidebar or search to find your way.</p>
    </Page>
  );
}

export function App() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();

  // A request anywhere came back 401: the session ended. Re-read it so the sign-in screen shows.
  useEffect(() => {
    const onUnauthenticated = () => void client.invalidateQueries({ queryKey: ["session"] });
    window.addEventListener("outpost:unauthenticated", onUnauthenticated);
    return () => window.removeEventListener("outpost:unauthenticated", onUnauthenticated);
  }, [client]);

  if (session.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-spine" aria-busy>
        <Skeleton className="h-2 w-40 opacity-30" />
      </div>
    );
  }
  if (session.isError) return <ServerDown onRetry={() => session.refetch()} />;
  if (session.data.authRequired && !session.data.user) return <SignIn session={session.data} />;

  return (
    <EventsProvider enabled>
      <Routes>
        <Route element={<AppShell notesTree={<NotesTree />} onNewPage={() => navigate("/notes?new=1")} />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/documents/:id" element={<DocumentPage />} />
          <Route path="library/collections/:id" element={<CollectionPage />} />
          <Route path="library/read/:collectionId/*" element={<ReaderPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="notes/:id" element={<NotesPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </EventsProvider>
  );
}
