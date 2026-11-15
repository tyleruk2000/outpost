/**
 * Feature modules, registered in order after the core (settings, auth, storage,
 * system). A module is a function that adds its routes and puts its service on
 * `ctx.services`. Later modules may use the services of earlier ones.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/context.ts";
import { registerCatalog } from "./catalog/index.ts";
import { registerCollections } from "./collections/index.ts";
import { registerDocuments } from "./documents/index.ts";
import { registerDownloads } from "./downloads/index.ts";
import { registerMaps } from "./maps/index.ts";
import { registerNotes } from "./notes/index.ts";
import { registerRetrieval } from "./retrieval/index.ts";
import { registerSearch } from "./search/index.ts";
import { registerSemantic } from "./semantic/index.ts";

export type ModuleRegister = (app: FastifyInstance, ctx: AppContext) => Promise<void>;

export const modules: ModuleRegister[] = [
  registerSearch,
  registerSemantic,
  registerRetrieval,
  registerDocuments,
  registerNotes,
  registerCollections,
  registerDownloads,
  registerCatalog,
  registerMaps,
];
