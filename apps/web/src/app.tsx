import { useQuery } from "@tanstack/react-query";
import { lazy } from "react";
import { Link, Route, Routes, useNavigate } from "react-router";
import { AppShell } from "./components/app-shell";
import { Page } from "./components/page";
import { ServerDown } from "./components/server-down";
import { Button } from "./components/ui/button";
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
const CalibrePage = lazy(() => import("./features/library/calibre/calibre-page"));
const ReaderPage = lazy(() => import("./features/reader/reader-page"));
const NotesPage = lazy(() => import("./features/notes/notes-page"));
const ChatPage = lazy(() => import("./features/chat/chat-page"));
const ContactsPage = lazy(() => import("./features/contacts/contacts-page"));
const BoardPage = lazy(() => import("./features/board/board-page"));
const ImportPage = lazy(() => import("./features/imports/import-page"));
const EncryptionPage = lazy(() => import("./features/encryption/encryption-page"));
const ExplorePage = lazy(() => import("./features/explore/explore-page"));
const DownloadsPage = lazy(() => import("./features/downloads/downloads-page"));
const DownloadPage = lazy(() => import("./features/downloads/download-page"));
const UnderstandPage = lazy(() => import("./features/understand/understand-page"));
const MapsPage = lazy(() => import("./features/maps/maps-page"));
const RepeatersPage = lazy(() => import("./features/repeaters/repeaters-page"));
const RepeaterPage = lazy(() => import("./features/repeaters/repeater-page"));
const MorsePage = lazy(() => import("./features/morse/morse-page"));
const FrequenciesPage = lazy(() => import("./features/frequencies/frequencies-page"));
const SatellitesPage = lazy(() => import("./features/satellites/satellites-page"));
const LicencesPage = lazy(() => import("./features/radio/licences-page"));
const SearchPage = lazy(() => import("./features/search/search-page"));
const StoragePage = lazy(() => import("./features/storage/storage-page"));
const ManagePage = lazy(() => import("./features/manage/manage-page"));
const MergePage = lazy(() => import("./features/merge/merge-page"));
const SettingsPage = lazy(() => import("./features/settings/settings-page"));
const StatusPage = lazy(() => import("./features/device/status-page"));
const SetupGuidePage = lazy(() => import("./features/help/setup-guide-page"));
const HelpPage = lazy(() => import("./features/help/help-page"));
const GuidePage = lazy(() => import("./features/help/guide-page"));
const KeptPage = lazy(() => import("./features/kept/kept-page"));
const RadioPage = lazy(() => import("./features/radio/radio-page"));
const HeardPage = lazy(() => import("./features/heard/heard-page"));
const ToolsPage = lazy(() => import("./features/tools/tools-page"));
const PreparePage = lazy(() => import("./features/prepare/prepare-page"));
// The household's papers (Preparedness), on lines of their own so that other additions merge cleanly.
const MedicalPage = lazy(() => import("./features/household-papers/medical-page"));
const MedicalSheetPage = lazy(() => import("./features/household-papers/medical-sheet-page"));
const CommsPage = lazy(() => import("./features/household-papers/comms-page"));
const GrabCardsPage = lazy(() => import("./features/household-papers/grab-cards-page"));
const BinderPage = lazy(() => import("./features/household-papers/binder-page"));
const HouseholdBookPage = lazy(() => import("./features/household-book/book-page"));
const CheckInPage = lazy(() => import("./features/readiness/check-in-page"));
const EventLogPage = lazy(() => import("./features/readiness/log-page"));
const ChecksPage = lazy(() => import("./features/readiness/checks-page"));
const DrillPage = lazy(() => import("./features/readiness/drill-page"));
const GamesPage = lazy(() => import("./features/games/games-page"));
const AllotmentPage = lazy(() => import("./features/games/allotment/allotment-page"));
const SolitairePage = lazy(() => import("./features/games/solitaire/solitaire-page"));
const PegSolitairePage = lazy(() => import("./features/games/peg-solitaire/peg-solitaire-page"));
const SudokuPage = lazy(() => import("./features/games/sudoku/sudoku-page"));
const DraughtsPage = lazy(() => import("./features/games/draughts/draughts-page"));
const ChessPage = lazy(() => import("./features/games/chess/chess-page"));
const PairsPage = lazy(() => import("./features/games/pairs/pairs-page"));
const SnakePage = lazy(() => import("./features/games/snake/snake-page"));
const SkerryPage = lazy(() => import("./features/games/skerry/skerry-page"));
const SteadingPage = lazy(() => import("./features/games/steading/steading-page"));
const PowerPage = lazy(() => import("./features/power/power-page"));
const PowerPlanPage = lazy(() => import("./features/power/plan-page"));
const SuppliesPage = lazy(() => import("./features/supplies/supplies-page"));
const SupplyItemPage = lazy(() => import("./features/supplies/item-page"));
const WeatherPage = lazy(() => import("./features/weather/weather-page"));
const EmergencyPlansPage = lazy(() => import("./features/emergency-plans/plans-page"));
const EmergencyPlanPage = lazy(() => import("./features/emergency-plans/plan-page"));
const UseEmergencyPlanPage = lazy(() => import("./features/emergency-plans/use-page"));
const EmergencyCardsPage = lazy(() => import("./features/emergency-plans/cards-page"));
const WaterToolsPage = lazy(() => import("./features/tools/water/water-page"));
const RationsToolsPage = lazy(() => import("./features/tools/rations/rations-page"));
const OutdoorsToolsPage = lazy(() => import("./features/tools/outdoors/outdoors-page"));
const RadioToolsPage = lazy(() => import("./features/tools/radio/radio-tools-page"));
const BuildingToolsPage = lazy(() => import("./features/tools/building/building-page"));
const CookingToolsPage = lazy(() => import("./features/tools/cooking/cooking-page"));
const NuclearPage = lazy(() => import("./features/nuclear/nuclear-page"));
const QrPage = lazy(() => import("./features/qr/qr-page"));
const NetworkPage = lazy(() => import("./features/network/network-page"));
const SolarClockPage = lazy(() => import("./features/solar-clock/solar-clock-page"));
const CompassPage = lazy(() => import("./features/compass/compass-page"));
const TidesPage = lazy(() => import("./features/tides/tides-page"));
const GardenPage = lazy(() => import("./features/garden/garden-page"));
const NightSkyPage = lazy(() => import("./features/night-sky/night-sky-page"));
const CelestialNavigationPage = lazy(() => import("./features/celestial-navigation/celnav-page"));
const PropagationPage = lazy(() => import("./features/propagation/propagation-page"));
const PlansPage = lazy(() => import("./features/propagation/plans/plans-page"));
const PlanPage = lazy(() => import("./features/propagation/plans/plan-page"));
const LogPage = lazy(() => import("./features/propagation/log/log-page"));
const CoveragePage = lazy(() => import("./features/propagation/coverage-map/coverage-page"));

function NotFound() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title">There is nothing at this address</h1>
      <p className="mt-2 text-ink-muted">The page may have been moved or deleted, or the address was typed with a mistake in it.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" asChild>
          <Link to="/">Go to Home</Link>
        </Button>
        <Button asChild>
          <Link to="/search">Search</Link>
        </Button>
      </div>
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
          <Route path="library/calibre" element={<CalibrePage />} />
          <Route path="library/documents/:id" element={<DocumentPage />} />
          <Route path="library/collections/:id" element={<CollectionPage />} />
          <Route path="library/read/:collectionId/*" element={<ReaderPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="radio/repeaters" element={<RepeatersPage />} />
          <Route path="radio/repeaters/:id" element={<RepeaterPage />} />
          <Route path="radio/morse" element={<MorsePage />} />
          <Route path="radio/frequencies" element={<FrequenciesPage />} />
          <Route path="radio/satellites" element={<SatellitesPage />} />
          <Route path="radio/licences" element={<LicencesPage />} />
          <Route path="radio/heard" element={<HeardPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="notes/:id" element={<NotesPage />} />
          <Route path="notes/:id/versions" element={<NotesPage versions />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="contacts/*" element={<ContactsPage />} />
          <Route path="messages" element={<BoardPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="encryption" element={<EncryptionPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="downloads/:id" element={<DownloadPage />} />
          <Route path="search/how-it-works" element={<UnderstandPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="storage/manage" element={<ManagePage />} />
          <Route path="storage/merge" element={<MergePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/status" element={<StatusPage />} />
          <Route path="help/search-and-answers" element={<SetupGuidePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="help/:slug" element={<GuidePage />} />
          <Route path="kept" element={<KeptPage />} />
          <Route path="radio" element={<RadioPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/water" element={<WaterToolsPage />} />
          <Route path="tools/rations" element={<RationsToolsPage />} />
          <Route path="tools/outdoors" element={<OutdoorsToolsPage />} />
          <Route path="tools/radio" element={<RadioToolsPage />} />
          <Route path="tools/building" element={<BuildingToolsPage />} />
          <Route path="tools/cooking" element={<CookingToolsPage />} />
          <Route path="prepare" element={<PreparePage />} />
          <Route path="tools/power" element={<PowerPage />} />
          <Route path="tools/power/plans/:id" element={<PowerPlanPage />} />
          <Route path="prepare/supplies" element={<SuppliesPage />} />
          <Route path="prepare/supplies/items/:id" element={<SupplyItemPage />} />
          <Route path="prepare/nuclear" element={<NuclearPage />} />
          <Route path="tools/qr" element={<QrPage />} />
          <Route path="tools/network" element={<NetworkPage />} />
          <Route path="tools/solar-clock" element={<SolarClockPage />} />
          <Route path="tools/compass" element={<CompassPage />} />
          <Route path="tools/tides" element={<TidesPage />} />
          <Route path="tools/garden" element={<GardenPage />} />
          <Route path="tools/night-sky" element={<NightSkyPage />} />
          <Route path="tools/celestial-navigation" element={<CelestialNavigationPage />} />
          <Route path="prepare/weather" element={<WeatherPage />} />
          <Route path="prepare/plans" element={<EmergencyPlansPage />} />
          <Route path="prepare/plans/:id" element={<EmergencyPlanPage />} />
          <Route path="prepare/plans/:id/use" element={<UseEmergencyPlanPage />} />
          <Route path="prepare/plans/:id/cards" element={<EmergencyCardsPage />} />
          <Route path="prepare/medical" element={<MedicalPage />} />
          <Route path="prepare/medical/:id" element={<MedicalSheetPage />} />
          <Route path="prepare/keeping-in-touch" element={<CommsPage />} />
          <Route path="prepare/grab-cards" element={<GrabCardsPage />} />
          <Route path="prepare/binder" element={<BinderPage />} />
          <Route path="prepare/book" element={<HouseholdBookPage />} />
          <Route path="prepare/check-in" element={<CheckInPage />} />
          <Route path="prepare/log" element={<EventLogPage />} />
          <Route path="prepare/checks" element={<ChecksPage />} />
          <Route path="prepare/offline-drill" element={<DrillPage />} />
          <Route path="radio/propagation" element={<PropagationPage />} />
          <Route path="radio/coverage" element={<CoveragePage />} />
          <Route path="radio/log" element={<LogPage />} />
          <Route path="radio/plans" element={<PlansPage />} />
          <Route path="radio/plans/:id" element={<PlanPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="games/allotment" element={<AllotmentPage />} />
          <Route path="games/solitaire" element={<SolitairePage />} />
          <Route path="games/peg-solitaire" element={<PegSolitairePage />} />
          <Route path="games/sudoku" element={<SudokuPage />} />
          <Route path="games/draughts" element={<DraughtsPage />} />
          <Route path="games/chess" element={<ChessPage />} />
          <Route path="games/pairs" element={<PairsPage />} />
          <Route path="games/snake" element={<SnakePage />} />
          <Route path="games/skerry" element={<SkerryPage />} />
          <Route path="games/steading" element={<SteadingPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </EventsProvider>
  );
}
