/**
 * Each household's papers, under Preparedness: medical sheets (medical.ts), the
 * communication plan, "Keeping in touch" (comms.ts), the record of the household
 * binder last made (binder.ts), and the household book's answers and the record of the
 * last book made (book.ts), with what the book reads round home (facts.ts). Grab cards and the binder itself are made in the
 * browser from these and from what other modules already answer. Every route is for the
 * current household (docs/development/households.md).
 *
 * All of it is the person's own: counted and erased with the rest by modules/manage,
 * counted in the database's figures, and in every backup. See docs/household-papers.md.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { type BinderService, createBinderService, madeSchema } from "./binder.ts";
import { type BookService, bookMadeSchema, bookSchema, createBookService } from "./book.ts";
import { type CommsService, commsSchema, createCommsService } from "./comms.ts";
import { createBookFacts } from "./facts.ts";
import { createFingerprints } from "./fingerprints.ts";
import { createMedicalService, type MedicalService, sheetSchema } from "./medical.ts";

export interface HouseholdPapersService {
  medical: MedicalService;
  comms: CommsService;
  binder: BinderService;
  book: BookService;
  kept: { count(): number; eraseAll(): number };
}

declare module "../../core/context.ts" {
  interface Services {
    householdPapers: HouseholdPapersService;
  }
}

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function registerHouseholdPapers(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const changed = () => ctx.events.publish({ type: "household-papers.changed" });
  const medical = createMedicalService(ctx, changed);
  const comms = createCommsService(ctx, changed);
  const fingerprints = createFingerprints(ctx);
  const binder = createBinderService(ctx, { medical: medical.changedAt, comms: comms.changedAt }, fingerprints, changed);
  const book = createBookService(
    ctx,
    fingerprints,
    () => ctx.events.publish({ type: "household-book.changed" }),
    () => binder.status(),
  );
  const bookFacts = createBookFacts(ctx);
  const service: HouseholdPapersService = {
    medical,
    comms,
    binder,
    book,
    kept: {
      count: () => medical.count() + comms.count() + binder.count() + book.count(),
      eraseAll: () => medical.eraseAll() + comms.eraseAll() + binder.eraseAll() + book.eraseAll(),
    },
  };
  ctx.services.householdPapers = service;

  const id = (request: { params: unknown }) => idParams.parse(request.params).id;

  // The current household's sheets: its people's, and its own for nobody in particular.
  app.get("/api/medical-sheets", async () => {
    const household = ctx.services.households.current();
    return {
      sheets: medical.list(household.id),
      inSearch: ctx.services.settings.get("medical.inSearch"),
      inTools: ctx.services.settings.get("tools.medical"),
      household: { id: household.id, name: household.name, several: ctx.services.households.list().length > 1 },
    };
  });
  app.post("/api/medical-sheets", async (request) => ({ sheet: medical.create(sheetSchema.parse(request.body)) }));
  app.get("/api/medical-sheets/:id", async (request) => ({ sheet: medical.get(id(request)) }));
  app.put("/api/medical-sheets/:id", async (request) => ({ sheet: medical.update(id(request), sheetSchema.parse(request.body)) }));
  app.delete("/api/medical-sheets/:id", async (request) => {
    medical.remove(id(request));
    return { ok: true };
  });

  app.get("/api/keeping-in-touch", async () => comms.get());
  app.put("/api/keeping-in-touch", async (request) => comms.save(commsSchema.parse(request.body)));

  app.get("/api/household-binder", async () => binder.status());
  /** Said by the browser once it has made the binder: a press, never a GET. */
  app.post("/api/household-binder/made", async (request) => binder.made(madeSchema.parse(request.body)));

  app.get("/api/household-book", async () => book.get());
  app.put("/api/household-book", async (request) => book.save(bookSchema.parse(request.body)));
  /** What the book reads round home, for the answers as saved: read from what is held, nothing fetched. */
  app.get("/api/household-book/facts", async () => bookFacts(book.answers()));
  /** Said by the browser once it has made the book: a press, never a GET. */
  app.post("/api/household-book/made", async (request) => book.made(bookMadeSchema.parse(request.body)));
}
