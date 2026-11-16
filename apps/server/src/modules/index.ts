/**
 * Feature modules, registered in order after the core (settings, storage,
 * system). A module is a function that adds its routes and puts its service on
 * `ctx.services`. Later modules may use the services of earlier ones.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/context.ts";
import { registerAnswers } from "./answers/index.ts";
import { registerBackup } from "./backup/index.ts";
import { registerBooks } from "./books/index.ts";
import { registerCatalog } from "./catalog/index.ts";
import { registerCollections } from "./collections/index.ts";
import { registerDocuments } from "./documents/index.ts";
import { registerDownloads } from "./downloads/index.ts";
import { registerHttps } from "./https/index.ts";
import { registerImports } from "./imports/index.ts";
import { registerKiwix } from "./kiwix/index.ts";
import { registerLinks } from "./links/index.ts";
import { registerManage } from "./manage/index.ts";
import { registerMaps } from "./maps/index.ts";
import { registerMerge } from "./merge/index.ts";
import { registerNotes } from "./notes/index.ts";
import { registerPortable } from "./portable/index.ts";
import { registerRetrieval } from "./retrieval/index.ts";
import { registerSearch } from "./search/index.ts";
import { registerSemantic } from "./semantic/index.ts";

export type ModuleRegister = (app: FastifyInstance, ctx: AppContext) => Promise<void>;

export const modules: ModuleRegister[] = [
  registerSearch,
  registerSemantic,
  registerRetrieval,
  registerAnswers,
  registerDocuments,
  registerNotes,
  registerImports,
  registerCollections,
  registerBooks,
  registerKiwix,
  registerDownloads,
  registerLinks,
  registerCatalog,
  registerMaps,
  registerBackup,
  registerPortable,
  registerMerge,
  registerManage,
  registerHttps,
];
