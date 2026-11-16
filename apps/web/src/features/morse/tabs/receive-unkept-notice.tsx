/** Says plainly that practice sessions were not kept on the server, on the tab that tried to keep them. */
import { CloudOff } from "lucide-react";
import { Notice } from "@/components/page";
import { plural } from "@/lib/utils";

export function UnkeptNotice({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <Notice
      tone="warning"
      icon={<CloudOff />}
      title={`${count === 1 ? "A practice session was" : `${plural(count, "practice session")} were`} not kept`}
      className={className}
    >
      The server could not be reached, so {count === 1 ? "it is" : "they are"} not on the Progress tab. Until this page is closed{" "}
      {count === 1 ? "it still counts" : "they still count"} towards which characters come up more often.
    </Notice>
  );
}
