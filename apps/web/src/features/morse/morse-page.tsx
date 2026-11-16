/**
 * Radio → Morse trainer. Six tabs: Receive (the Koch method and drills) and Send (keys,
 * keyers and three ways to practise) to learn; QSO practice (a whole contact with a
 * made-up station) and On the air (a call a Reverse Beacon Network skimmer can spot)
 * to practise; the Code chart and Progress to look things up. The tab is in the
 * address (`?tab=`), so each can be linked to; the ids are LogBook73's and stay as
 * they are whatever the tabs are called.
 *
 * Everything works with no connection. Ported from LogBook73's Morse trainer.
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";
import { Page, PageHeader } from "@/components/page";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { useKochLesson, useSyncedMorse } from "./data";
import { CodeChartTab } from "./tabs/code-chart-tab";
import { ProgressTab } from "./tabs/progress-tab";
import { QsoTab } from "./tabs/qso-tab";
import { ReceiveTab } from "./tabs/receive-tab";
import { SendTab } from "./tabs/send-tab";

// Most visits never open it, so it loads when it is first opened.
const OnTheAirTab = lazy(() => import("./tabs/on-the-air-tab"));

export const MORSE_TABS = ["receive", "send", "qso", "rbn", "reference", "progress"] as const;
export type MorseTab = (typeof MORSE_TABS)[number];
const tab = "min-h-11 md:min-h-0";

export default function MorsePage() {
  useSyncedMorse();
  const lesson = useKochLesson();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const active: MorseTab = MORSE_TABS.includes(asked as MorseTab) ? (asked as MorseTab) : "receive";
  const setTab = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "receive") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      },
      { replace: true },
    );

  return (
    <Page width="wide">
      <PageHeader
        title="Morse trainer"
        description="Learn to read Morse by ear and to send it by hand. New to it? Start on Receive with lesson 1, then key it back on Send. Everything here works with no connection."
      />
      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="mb-6 flex-wrap gap-x-5 gap-y-1 overflow-visible" aria-label="Morse trainer">
          <TabsTrigger value="receive" className={tab} aria-label={`Receive, Koch lesson ${lesson}`}>
            Receive
            <span className="tabular rounded-control bg-surface-strong px-1.5 text-micro font-normal text-ink-muted" aria-hidden>
              L{lesson}
            </span>
          </TabsTrigger>
          <TabsTrigger value="send" className={tab}>
            Send
          </TabsTrigger>
          <TabsTrigger value="qso" className={tab}>
            QSO practice
          </TabsTrigger>
          <TabsTrigger value="rbn" className={tab}>
            On the air
          </TabsTrigger>
          <TabsTrigger value="reference" className={tab}>
            Code chart
          </TabsTrigger>
          <TabsTrigger value="progress" className={tab}>
            Progress
          </TabsTrigger>
        </TabsList>
        <TabsContent value="receive">
          <ReceiveTab />
        </TabsContent>
        <TabsContent value="send">
          <SendTab />
        </TabsContent>
        <TabsContent value="qso">
          <QsoTab />
        </TabsContent>
        <TabsContent value="rbn">
          <Suspense fallback={<Skeleton className="h-64" />}>
            <OnTheAirTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="reference">
          <CodeChartTab />
        </TabsContent>
        <TabsContent value="progress">
          <ProgressTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
