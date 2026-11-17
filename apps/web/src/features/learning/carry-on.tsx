/**
 * On a reference collection's page in the Library: "Carry on where Sam left off", for
 * whoever is learning on this device. Nothing at all when no one is, or nothing has been
 * recorded for them in this collection.
 */
import { learnerLabel } from "@outpost/shared";
import { BookMarked } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { readerAt, useProgress } from "./data";
import { useLearningDevice } from "./device";

export function CarryOn({ collectionId, className }: { collectionId: string; className?: string }) {
  const device = useLearningDevice();
  const learner = device.recording ? device.learner : null;
  const progress = useProgress(learner === null ? null : { learner }, collectionId);
  const course = progress.data?.courses[0];
  if (learner === null || !course) return null;
  const who = learner === "" ? "you" : learnerLabel(learner);
  return (
    <div className={className}>
      <Button asChild variant="soft" className="h-auto justify-start py-2 text-left">
        <Link to={readerAt(collectionId, course.last.path)}>
          <BookMarked aria-hidden />
          <span>
            Carry on where {who} left off: <span className="font-semibold">{course.last.title}</span>
          </span>
        </Link>
      </Button>
      <p className="mt-1.5 text-small text-ink-muted">
        Opened {timeAgo(course.last.at)}. {course.pagesDone} of the {course.pagesOpened} pages opened are done.{" "}
        <Link to="/library?tab=learning" className="text-primary underline underline-offset-2">
          Learning progress
        </Link>
      </p>
    </div>
  );
}
