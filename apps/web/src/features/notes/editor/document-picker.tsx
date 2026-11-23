/** Chooses a document from the library to embed in the page. */
import type { DocumentDto, DocumentListResponse } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { searchRowFocus } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { pickerItemClass } from "../move-dialog";

export function DocumentPicker({ onPick, onClose }: { onPick(document: DocumentDto): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 160);
    return () => window.clearTimeout(timer);
  }, [query]);

  const documents = useQuery({
    queryKey: ["documents", "picker", debounced],
    queryFn: ({ signal }) => api.get<DocumentListResponse>("/api/documents", { q: debounced, limit: 20 }, signal),
    placeholderData: keepPreviousData,
  });
  const found = documents.data?.documents ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Embed a document"
        description="The document appears in the page as a row that opens it in the library."
        size="md"
        data-editor-popup
      >
        <Command shouldFilter={false} loop label="Embed a document">
          <div className={`flex items-center gap-3 border-b border-border px-5 ${searchRowFocus}`}>
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              enterKeyHint="search"
              autoCapitalize="none"
              placeholder="Find a document by title"
              className="h-11 flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
            />
            {documents.isFetching ? <Spinner delay /> : null}
          </div>
          <Command.List className="scroll-quiet max-h-[min(50dvh,22rem)] overflow-y-auto p-1.5">
            {found.map((document) => (
              <Command.Item key={document.id} value={document.id} onSelect={() => onPick(document)} className={pickerItemClass}>
                <FileText aria-hidden />
                <span className="min-w-0 flex-1 truncate">{document.title || document.originalName}</span>
                <span className="shrink-0 font-mono text-micro text-ink-muted uppercase">{document.ext}</span>
              </Command.Item>
            ))}
            {documents.isError ? (
              <p className="px-3 py-6 text-small text-danger">The library could not be read. {errorMessage(documents.error)}</p>
            ) : documents.isSuccess && found.length === 0 ? (
              <p className="px-3 py-6 text-small text-ink-muted">
                {debounced ? (
                  <>No document in the library matches “{debounced}”.</>
                ) : (
                  <>
                    There are no documents in the library yet.{" "}
                    <Link to="/library?upload=1" className="text-primary underline underline-offset-2">
                      Add documents
                    </Link>
                    , then embed them here.
                  </>
                )}
              </p>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
