/** The notes routes: `/notes` (home, trash, templates) and `/notes/:id` (a page). */
import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Page } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { NoteScreen } from "./note-screen";
import { useNoteActions } from "./notes-data";
import { NotesHome } from "./notes-home";
import { TemplatesView, TrashView } from "./notes-views";

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

  return (
    <Page width="reading" aria-busy>
      <Skeleton className="h-10 w-3/5" />
      <Skeleton className="mt-9 h-4 w-full" />
      <Skeleton className="mt-3.5 h-4 w-4/5" />
    </Page>
  );
}

export default function NotesPage() {
  const { id } = useParams();
  const [search] = useSearchParams();

  if (id) return <NoteScreen key={id} id={id} />;
  if (search.get("new") === "1") return <NewPage />;
  const view = search.get("view");
  if (view === "trash") return <TrashView />;
  if (view === "templates") return <TemplatesView />;
  return <NotesHome />;
}
