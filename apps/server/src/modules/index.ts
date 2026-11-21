/**
 * Feature modules, registered in order after the core (settings, storage,
 * system). A module is a function that adds its routes and puts its service on
 * `ctx.services`. Later modules may use the services of earlier ones.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/context.ts";
import { registerAnswers } from "./answers/index.ts";
import { registerAudiobooks } from "./audiobooks/index.ts";
import { registerBackup } from "./backup/index.ts";
import { registerBoard } from "./board/index.ts";
import { registerBooks } from "./books/index.ts";
import { registerCalibre } from "./calibre/index.ts";
import { registerCatalog } from "./catalog/index.ts";
import { registerChat } from "./chat/index.ts";
import { registerCollections } from "./collections/index.ts";
import { registerContacts } from "./contacts/index.ts";
import { registerDatabase } from "./database/index.ts";
import { registerDevice } from "./device/index.ts";
import { registerDocuments } from "./documents/index.ts";
import { registerDownloads } from "./downloads/index.ts";
import { registerEmergencyPlans } from "./emergency-plans/index.ts";
import { registerEncryption } from "./encryption/index.ts";
import { registerGames } from "./games/index.ts";
import { registerHouseholdPapers } from "./household-papers/index.ts";
import { registerHttps } from "./https/index.ts";
import { registerImports } from "./imports/index.ts";
import { registerKiwix } from "./kiwix/index.ts";
import { registerLayers } from "./layers/index.ts";
import { registerLearning } from "./learning/index.ts";
import { registerLinks } from "./links/index.ts";
import { registerManage } from "./manage/index.ts";
import { registerMaps } from "./maps/index.ts";
import { registerMerge } from "./merge/index.ts";
import { registerMesh } from "./mesh/index.ts";
import { registerMorse } from "./morse/index.ts";
import { registerNetwork } from "./network/index.ts";
import { registerNotes } from "./notes/index.ts";
import { registerNuclear } from "./nuclear/index.ts";
import { registerPortable } from "./portable/index.ts";
import { registerPower } from "./power/index.ts";
import { registerPropagation } from "./propagation/index.ts";
import { registerRepeaters } from "./repeaters/index.ts";
import { registerRetrieval } from "./retrieval/index.ts";
import { registerSearch } from "./search/index.ts";
import { registerSemantic } from "./semantic/index.ts";
import { registerSupplies } from "./supplies/index.ts";
import { registerTools } from "./tools/index.ts";
import { registerWeather } from "./weather/index.ts";
import { registerWebPages } from "./webpages/index.ts";

export type ModuleRegister = (app: FastifyInstance, ctx: AppContext) => Promise<void>;

export const modules: ModuleRegister[] = [
  // The device (status, clock, /metrics), first: its hooks time every request. It reads the other modules only when asked.
  registerDevice,
  registerSearch,
  registerSemantic,
  registerRetrieval,
  registerAnswers,
  registerDocuments,
  registerNotes,
  registerChat,
  registerImports,
  registerCollections,
  registerBooks,
  registerKiwix,
  registerDownloads,
  registerLinks,
  registerWebPages,
  registerCatalog,
  registerMaps,
  registerRepeaters,
  registerEncryption,
  registerBackup,
  registerDatabase,
  registerPortable,
  registerMerge,
  registerManage,
  registerHttps,
  registerContacts,
  registerPropagation,
  registerPower,
  registerSupplies,
  registerNuclear,
  registerNetwork,
  registerLayers,
  registerWeather,
  registerEmergencyPlans,
  // The Morse trainer (Radio), on a line of its own so that other additions merge cleanly.
  registerMorse,
  // Games, on a line of its own so that other additions merge cleanly.
  registerGames,
  // Audiobooks (Library), after books, on a line of its own so that other additions merge cleanly.
  registerAudiobooks,
  // Messages: the household board, on a line of its own so that other additions merge cleanly.
  registerBoard,
  // Learning progress in reference archives (the reader), on a line of its own so that other additions merge cleanly.
  registerLearning,
  // The mesh radio link, after the board it is a transport of, on a line of its own.
  registerMesh,
  // The household's papers (medical sheets, keeping in touch, the binder), after the mesh link, on a line of their own.
  registerHouseholdPapers,
  // Bringing in a Calibre library (Library), after documents, on a line of its own.
  registerCalibre,
  // Tools a language model may call (Chat, and /mcp), last: they read from every module above.
  registerTools,
];
