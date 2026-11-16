/**
 * Contacts: the people and places to reach when the phone network and the internet are
 * down, with the routes that list them, change them, and move them in and out as vCard
 * files. The rules are in `service.ts`; reading and writing the files is in `vcard.ts`
 * and `card.ts`; `dav.ts` lets a phone subscribe to the address book.
 *
 * There are no accounts, so there is nothing here that decides who may see a contact:
 * everyone who can open Outpost can read, change and export every one of them. The
 * Contacts screen says so, and docs/security.md says what follows from it.
 */
import { CONTACT_LIMITS, type ContactsPhoneStatus } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { contentDisposition } from "../notes/attachments.ts";
import { DAV_PRINCIPAL_PATH, DAV_USER_NAME, registerContactsDav } from "./dav.ts";
import { contactCreateSchema, contactPatchSchema, createContactsService } from "./service.ts";

export type { ContactsService } from "./service.ts";

const idParams = z.object({ id: z.string().min(1).max(64) });
const flag = z
  .enum(["1", "true", "0", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

const listQuery = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(CONTACT_LIMITS.label).optional(),
  emergency: flag,
  limit: z.coerce.number().int().min(1).max(1000).default(300),
  offset: z.coerce.number().int().min(0).default(0),
});

const exportQuery = z.object({
  version: z.enum(["3.0", "4.0"]).default("3.0"),
  ids: z
    .string()
    .max(70_000)
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : undefined)),
  tag: z.string().max(CONTACT_LIMITS.label).optional(),
  emergency: flag,
});

const pickedBody = z.object({
  picked: z
    .array(
      z.object({
        name: z.array(z.string().max(1000)).max(10).optional(),
        tel: z.array(z.string().max(1000)).max(50).optional(),
        email: z.array(z.string().max(1000)).max(50).optional(),
        address: z
          .array(
            z.object({
              addressLine: z.array(z.string().max(1000)).max(10).optional(),
              city: z.string().max(1000).optional(),
              region: z.string().max(1000).optional(),
              postalCode: z.string().max(1000).optional(),
              country: z.string().max(1000).optional(),
            }),
          )
          .max(20)
          .optional(),
      }),
    )
    .min(1, "Choose at least one contact.")
    .max(2000, "Choose at most 2,000 contacts at a time."),
});

const applyBody = z.object({
  token: z.string().min(1).max(100),
  choices: z.record(z.string().regex(/^\d{1,6}$/), z.enum(["keep", "merge", "replace", "both"])).optional(),
  leaveOut: z.array(z.number().int().min(0)).max(CONTACT_LIMITS.cards).optional(),
});

export async function registerContacts(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createContactsService(ctx);
  ctx.services.contacts = service;

  // The limits are the routes' own, given with each request (see core/multipart.ts).
  await registerMultipart(app);

  app.get("/api/contacts", async (request) => service.list(listQuery.parse(request.query)));

  app.post("/api/contacts", async (request) => ({ contact: service.create(contactCreateSchema.parse(request.body)) }));

  /** The marked contacts, whole: what the emergency sheet prints. */
  app.get("/api/contacts/emergency", async () => ({ contacts: service.emergency() }));

  /**
   * Contacts as a vCard file: all of them, or the ones named, tagged or marked. A plain
   * GET so that a phone's browser saves it, and its own contacts app can open it.
   */
  app.get("/api/contacts/export.vcf", async (request, reply) => {
    const query = exportQuery.parse(request.query);
    const { filename, body } = service.exportCards({ ids: query.ids, tag: query.tag, emergency: query.emergency }, query.version);
    return reply
      .header("Content-Type", "text/vcard; charset=utf-8")
      .header("Content-Disposition", contentDisposition("attachment", filename))
      .send(body);
  });

  // ── Bringing contacts in: read first, change nothing; then do what was chosen ──

  app.post("/api/contacts/import/preview", async (request) => {
    if (!request.isMultipart()) return service.previewPicked(pickedBody.parse(request.body).picked);
    let file: { name: string; bytes: Buffer } | undefined;
    for await (const part of request.parts({ limits: { fileSize: CONTACT_LIMITS.fileBytes, files: 1 } })) {
      if (part.type !== "file") continue;
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw badRequest("That file is larger than Outpost reads as contacts (50 MB).");
      file = { name: part.filename || "contacts.vcf", bytes };
    }
    if (!file) throw badRequest("Choose a vCard (.vcf) file.");
    return service.previewFile(file);
  });

  app.post("/api/contacts/import/apply", async (request) => service.applyImport(applyBody.parse(request.body)));

  app.delete<{ Params: { token: string } }>("/api/contacts/import/:token", async (request) => {
    service.discardImport(z.string().max(100).parse(request.params.token));
    return { ok: true };
  });

  // ── Phones that subscribe ──

  app.get(
    "/api/contacts/phones",
    async (): Promise<ContactsPhoneStatus> => ({
      enabled: ctx.services.settings.get("contacts.carddav") && !ctx.config.portable,
      unavailable: ctx.config.portable ? "portable" : null,
      lanAccess: ctx.config.lanAccess,
      userName: DAV_USER_NAME,
      path: DAV_PRINCIPAL_PATH,
      contacts: service.count(),
    }),
  );

  // ── One contact ──

  app.get<{ Params: { id: string } }>("/api/contacts/:id", async (request) => ({
    contact: service.get(idParams.parse(request.params).id),
  }));

  app.patch<{ Params: { id: string } }>("/api/contacts/:id", async (request) => ({
    contact: service.update(idParams.parse(request.params).id, contactPatchSchema.parse(request.body)),
  }));

  app.delete<{ Params: { id: string } }>("/api/contacts/:id", async (request) => {
    service.remove(idParams.parse(request.params).id);
    return { ok: true };
  });

  await registerContactsDav(app, ctx, service);
}
