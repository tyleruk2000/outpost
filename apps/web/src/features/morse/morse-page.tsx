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
import { lazy, type ReactNode, Suspense } from "react";
import { useSearchParams } from "react-router";
import { Page, PageHeader } from "@/components/page";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { useKochLesson, useSyncedMorse } from "./data";
import { CodeChartTab } from "./tabs/code-chart-tab";
import { ProgressTab } from "./tabs/progress-tab";
import { ReceiveTab } from "./tabs/receive-tab";

// Receive is the tab the screen opens on; each of the others is fetched when it is first opened.
const SendTab = lazy(() => import("./tabs/send-tab").then((module) => ({ default: module.SendTab })));
const QsoTab = lazy(() => import("./tabs/qso-tab").then((module) => ({ default: module.QsoTab })));
const OnTheAirTab = lazy(() => import("./tabs/on-the-air-tab"));

/** A tab's content, with a placeholder while its code is fetched the first time it is opened. */
const Later = ({ children }: { children: ReactNode }) => <Suspense fallback={<Skeleton className="h-64" />}>{children}</Suspense>;

export const MORSE_TABS = ["receive", "send", "qso", "rbn", "reference", "progress"] as const;
export type MorseTab = (typeof MORSE_TABS)[number];

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
        <TabsList className="mb-6" aria-label="Morse trainer">
          <TabsTrigger value="receive" aria-label={`Receive L${lesson}, Koch lesson ${lesson}`}>
            Receive{" "}
            <span className="tabular rounded-control bg-surface-strong px-1.5 text-micro font-normal text-ink-muted" aria-hidden>
              L{lesson}
            </span>
          </TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
          <TabsTrigger value="qso">QSO practice</TabsTrigger>
          <TabsTrigger value="rbn">On the air</TabsTrigger>
          <TabsTrigger value="reference">Code chart</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="receive">
          <ReceiveTab />
        </TabsContent>
        <TabsContent value="send">
          <Later>
            <SendTab />
          </Later>
        </TabsContent>
        <TabsContent value="qso">
          <Later>
            <QsoTab />
          </Later>
        </TabsContent>
        <TabsContent value="rbn">
          <Later>
            <OnTheAirTab />
          </Later>
        </TabsContent>
        <TabsContent value="reference">
          <Later>
            <CodeChartTab />
          </Later>
        </TabsContent>
        <TabsContent value="progress">
          <Later>
            <ProgressTab />
          </Later>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
