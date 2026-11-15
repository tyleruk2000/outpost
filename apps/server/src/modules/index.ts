/**
 * Feature modules, registered in order after the core (settings, auth, storage,
 * system). A module is a function that adds its routes and puts its service on
 * `ctx.services`. Later modules may use the services of earlier ones.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/context.ts";

export type ModuleRegister = (app: FastifyInstance, ctx: AppContext) => Promise<void>;

export const modules: ModuleRegister[] = [];
