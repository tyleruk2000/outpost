/** The notes routes: `/notes` (home, trash, templates), `/notes/:id` (a page) and `/notes/:id/versions`. */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ErrorState, Page } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { useNoteActions } from "./notes-data";
import { NotesHome } from "./notes-home";
import { TemplatesView, TrashView } from "./notes-views";

// The editor is most of the weight of Notes, and the lists of pages do not need it: it
// is fetched when a page is first opened. Not `React.lazy`: an editor first made in the
// render that ends a suspension was left unmounted by Tiptap, and the page went blank.
type ScreenModule = typeof import("./note-screen");
let screenModule: ScreenModule | null = null;
let screenLoading: Promise<ScreenModule> | null = null;
function loadNoteScreen(): Promise<ScreenModule> {
  if (screenLoading) return screenLoading;
  // The failure is handled apart from the import: Vite moves a `.then` chained on an import() inside its
  // preloading, and when a style sheet the editor needs fails to load that `.then` never runs.
  const loading = import("./note-screen").then((module) => (screenModule = module));
  screenLoading = loading;
  loading.catch(() => {
    if (screenLoading === loading) screenLoading = null;
  });
  return loading;
}

function useNoteScreen(wanted: boolean): { module: ScreenModule | null; error: unknown; retry(): void } {
  const [module, setModule] = useState(screenModule);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks for another try
  useEffect(() => {
    if (module || !wanted) return;
    let live = true;
    loadNoteScreen().then(
      (loaded) => live && setModule(loaded),
      (failure: unknown) => live && setError(failure),
    );
    return () => {
      live = false;
    };
  }, [module, wanted, attempt]);
  return {
    module,
    error,
    retry: () => {
      setError(null);
      setAttempt((count) => count + 1);
    },
  };
}

function OpeningSkeleton() {
  return (
    <Page width="reading" aria-busy>
      <Skeleton className="h-10 w-3/5" />
      <Skeleton className="mt-9 h-4 w-full" />
      <Skeleton className="mt-3.5 h-4 w-4/5" />
    </Page>
  );
}

/** `/notes?new=1`: make a page and go straight to it. The command palette links here. */
function NewPage() {
  const actions = useNoteActions();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Effects run twice in development; one page is enough.
    if (started.current) return;
    started.current = true;
    void (async () => {
      const page = await actions.create({}, { open: false });
      navigate(page ? `/notes/${page.id}` : "/notes", { replace: true });
    })();
  }, [actions, navigate]);

  return <OpeningSkeleton />;
}

/** `versions`: the route of a page's earlier versions, `/notes/:id/versions`. */
export default function NotesPage({ versions = false }: { versions?: boolean }) {
  const { id } = useParams();
  const [search] = useSearchParams();
  const screen = useNoteScreen(Boolean(id));

  if (id) {
    if (screen.module && versions) return <screen.module.NoteVersionsScreen key={id} id={id} />;
    if (screen.module) return <screen.module.NoteScreen key={id} id={id} />;
    if (screen.error) {
      return (
        <Page width="reading">
          <ErrorState error={screen.error} onRetry={screen.retry} />
        </Page>
      );
    }
    return <OpeningSkeleton />;
  }
  if (search.get("new") === "1") return <NewPage />;
  const view = search.get("view");
  if (view === "trash") return <TrashView />;
  if (view === "templates") return <TemplatesView />;
  return <NotesHome />;
}
