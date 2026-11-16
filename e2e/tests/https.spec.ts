import { createHash, X509Certificate } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { chromium } from "@playwright/test";
import { make, makeAuthority } from "../../apps/server/test/https-certs.ts";
import type { HttpsStatus } from "../../packages/shared/src/https.ts";
import { api, expect, test, watchForErrors } from "./fixtures";

const httpsPort = Number(process.env.OUTPOST_E2E_HTTPS_PORT);
const secure = `https://localhost:${httpsPort}`;

/** A GET that trusts the given certificate authority and nothing else. */
function getTrusting(url: string, ca: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { ca, agent: false }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

/** The public key the server presents, as Chromium's allow-list wants it: base64 of the SHA-256 of its SPKI. */
function presentedKey(ca: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: "localhost", port: httpsPort, servername: "localhost", ca }, () => {
      const certificate = socket.getPeerX509Certificate();
      socket.end();
      if (!certificate) return reject(new Error("the server presented no certificate"));
      resolve(
        createHash("sha256")
          .update(certificate.publicKey.export({ type: "spki", format: "der" }))
          .digest("base64"),
      );
    });
    socket.on("error", reject);
  });
}

/** The certificate the server presents to a client that trusts `ca` and nothing else. */
function presented(ca: string): Promise<X509Certificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: "localhost", port: httpsPort, servername: "localhost", ca }, () => {
      const certificate = socket.getPeerX509Certificate();
      socket.end();
      if (certificate) resolve(certificate);
      else reject(new Error("the server presented no certificate"));
    });
    socket.on("error", reject);
  });
}

test.describe("HTTPS on your network", () => {
  // The two tests share one server's HTTPS listener, so they take turns.
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ request }) => {
    const headers = { "X-Outpost-Request": "1" };
    await request.delete("/api/https/own", { headers });
    await request.patch("/api/settings", { headers, data: { "https.enabled": false, "https.certificate": "outpost", "https.names": "" } });
  });

  test("is turned on in Settings, hands out its certificate, and serves the app over HTTPS", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/settings#https");
    const section = page.locator("#https");
    await expect(section.getByRole("heading", { name: "HTTPS on your network" })).toBeInViewport();
    const toggle = section.getByRole("switch", { name: "Use HTTPS" });
    await expect(toggle).not.toBeChecked();
    await expect(section.getByText("Addresses to use")).toHaveCount(0);

    await toggle.click();
    // The first time, a key is made; then the listener opens.
    await expect(section.getByText(`On this computer itself: ${secure}`)).toBeVisible({ timeout: 30_000 });
    await expect(section.getByText(/Only this computer can reach Outpost at the moment/)).toBeVisible();
    await expect(section.getByRole("link", { name: "Open this page over HTTPS" })).toHaveAttribute("href", `${secure}/settings#https`);

    // The download is the public certificate of an authority, and only that.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      section.getByRole("link", { name: "Download certificate" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("outpost-authority.crt");
    const der = fs.readFileSync(await download.path());
    const authority = new X509Certificate(der);
    expect(authority.ca).toBe(true);
    expect(der.toString("latin1")).not.toContain("PRIVATE KEY");
    await expect(section.getByText(authority.fingerprint256)).toBeVisible();
    for (const device of ["iPhone and iPad", "Android", "Mac", "Windows", "Linux", "Firefox, on any computer"]) {
      await expect(section.locator("summary", { hasText: device })).toBeVisible();
    }
    // The steps come before the upkeep, and Linux gets the text form of the same certificate.
    const linux = section.locator("details", { has: page.locator("summary", { hasText: "Linux" }) });
    await linux.locator("summary").click();
    await expect(linux.getByText("sudo update-ca-certificates", { exact: false }).first()).toBeVisible();
    const [asText] = await Promise.all([
      page.waitForEvent("download"),
      linux.getByRole("link", { name: "Download the certificate" }).click(),
    ]);
    expect(asText.suggestedFilename()).toBe("outpost-authority.pem");
    expect(new X509Certificate(fs.readFileSync(await asText.path())).fingerprint256).toBe(authority.fingerprint256);

    // A client that trusts this authority, and nothing else, accepts the HTTPS address.
    const pem = authority.toString();
    const health = await getTrusting(`${secure}/api/health`, pem);
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body).status).toBe("ok");
    await expect(getTrusting(`${secure}/api/health`, "")).rejects.toThrow();
    // Plain HTTP still answers.
    expect((await api(page, "GET", "/api/health")).status).toBe("ok");

    // A browser that has not been told to trust the authority refuses the address.
    const stranger = await page.context().newPage();
    await expect(stranger.goto(`${secure}/`)).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/);
    await stranger.close();

    // A real browser over HTTPS. Playwright has no way to add a certificate authority to
    // its Chromium (on a Mac that would mean changing the keychain of whoever runs the
    // tests), so the browser is told instead to accept the exact key this server presents.
    // The chain itself was verified just above, by Node.
    const browser = await chromium.launch({ args: [`--ignore-certificate-errors-spki-list=${await presentedKey(pem)}`] });
    try {
      const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
      const over = await context.newPage();
      const external: string[] = [];
      await over.route("**/*", (route, request) => {
        const url = new URL(request.url());
        if (["localhost", "127.0.0.1"].includes(url.hostname) || ["data:", "blob:", "about:"].includes(url.protocol))
          return route.continue();
        external.push(request.url());
        return route.abort("internetdisconnected");
      });
      const overErrors = watchForErrors(over);

      const response = await over.goto(`${secure}/`);
      expect(response?.status()).toBe(200);
      const headers = response?.headers() ?? {};
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["strict-transport-security"]).toBeUndefined();
      await expect(over.getByRole("heading", { name: "Your library" })).toBeVisible();
      // Live events arrive over HTTPS: the lamp only says this once the stream is open.
      await expect(over.getByText("Ready offline")).toBeVisible();
      expect(await over.evaluate(() => ({ protocol: location.protocol, secure: window.isSecureContext }))).toEqual({
        protocol: "https:",
        secure: true,
      });

      // The request guard is the same here: the app's own requests pass, one without its header does not.
      const guard = await over.evaluate(async () => {
        const send = (headers: Record<string, string>) =>
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...headers },
            body: '{"downloads.concurrency":2}',
          });
        return { own: (await send({ "X-Outpost-Request": "1" })).status, bare: (await send({})).status };
      });
      expect(guard).toEqual({ own: 200, bare: 403 });

      await over.goto(`${secure}/settings#https`);
      const there = over.locator("#https");
      await expect(there.getByText("This browser is using the HTTPS address, and trusts the certificate.")).toBeVisible();

      // Turning it off from the HTTPS address itself asks first, and says where to carry on.
      await there.getByRole("switch", { name: "Use HTTPS" }).click();
      const dialog = over.getByRole("alertdialog", { name: "Turn HTTPS off?" });
      await expect(dialog).toContainText(`Carry on at http://localhost:${new URL(page.url()).port}`);
      await dialog.getByRole("button", { name: "Turn HTTPS off" }).click();
      expect(overErrors.filter((error) => !/Failed to load resource|ERR_|EventSource/i.test(error))).toEqual([]);
      expect(external, "the app tried to reach the internet over HTTPS").toEqual([]);
    } finally {
      await browser.close();
    }

    // Back on the plain address, which never stopped: HTTPS is off, and its address is closed.
    await expect(toggle).not.toBeChecked();
    await expect(section.getByText("Addresses to use")).toHaveCount(0);
    await expect(getTrusting(`${secure}/api/health`, pem)).rejects.toThrow();
    // The certificate is kept, so turning it on again asks nothing of any device.
    await expect(section.getByRole("link", { name: "Download certificate" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("uses a certificate of the person's own, takes a renewal from the folder, and goes back in one press", async ({ page }) => {
    const errors = watchForErrors(page);
    const house = makeAuthority("Hill House Root");
    const mine = make({ name: "localhost", issuer: house.intermediate, names: ["localhost", "127.0.0.1"], until: 90 });
    const pick = (name: string, text: string) => ({ name, mimeType: "application/x-pem-file", buffer: Buffer.from(text) });

    await page.goto("/settings#https");
    const section = page.locator("#https");
    // Outpost's own authority, from the test above, is what going back must find unchanged.
    const outposts = (await api<HttpsStatus>(page, "GET", "/api/https")).authority;
    expect(outposts).not.toBeNull();

    // One closed line until it is wanted.
    const choice = section.locator("details", { has: page.locator("summary", { hasText: "Use a certificate of your own instead" }) });
    await expect(choice.getByText("Choose the files here")).toBeHidden();
    await choice.locator("summary").click();
    await expect(choice.getByText("Offered here because you are at the computer Outpost runs on.")).toBeVisible();

    // A key that is not the certificate's own is refused in words, and nothing changes.
    await choice.getByLabel("Certificate file").setInputFiles(pick("fullchain.pem", mine.pem + house.intermediate.pem + house.root.pem));
    await choice.getByLabel("Key file").setInputFiles(pick("privkey.pem", make({ name: "elsewhere", names: ["elsewhere.lan"] }).keyPem));
    await choice.getByRole("button", { name: "Use this certificate" }).click();
    await expect(choice.getByRole("alert")).toContainText("This key does not belong to any certificate in the file");
    expect((await api<HttpsStatus>(page, "GET", "/api/https")).source).toBe("outpost");

    // The right key: HTTPS is on with it.
    await choice.getByLabel("Key file").setInputFiles(pick("privkey.pem", mine.keyPem));
    await choice.getByRole("button", { name: "Use this certificate" }).click();
    await expect(section.getByRole("heading", { name: "Your certificate" })).toBeVisible({ timeout: 30_000 });
    await expect(section.getByText(mine.certificate.fingerprint256)).toBeVisible();
    await expect(section.getByText(`On this computer itself: ${secure}`)).toBeVisible();
    // It says whose root devices must trust, and that it cannot see what they do trust.
    await expect(section.getByRole("heading", { name: "Each device has to trust your authority’s root" })).toBeVisible();
    await expect(section.getByText(/It is your authority’s root that devices must trust, not Outpost’s/)).toBeVisible();
    await expect(section.getByText(house.root.certificate.fingerprint256)).toBeVisible();
    await expect(section.getByRole("heading", { name: "Trust the certificate on each device" })).toHaveCount(0);

    // The listener really presents it, with a chain that verifies against the house root and nothing else.
    expect((await presented(house.root.pem)).fingerprint256).toBe(mine.certificate.fingerprint256);
    expect((await getTrusting(`${secure}/api/health`, house.root.pem)).status).toBe(200);
    await expect(getTrusting(`${secure}/api/health`, "")).rejects.toThrow();
    // The root it offers for download is the house's, public half only.
    const root = await page.request.get("/api/https/own-root.crt");
    expect(new X509Certificate(await root.body()).fingerprint256).toBe(house.root.certificate.fingerprint256);
    expect((await page.request.get("/api/https/own/privkey.pem")).status()).toBe(404);

    // A renewal arrives in the folder, as a script would leave it, and is taken up from there.
    const renewed = make({ name: "localhost", issuer: house.intermediate, names: ["localhost", "127.0.0.1"], until: 90 });
    // The folder is where the server says it is; the test runs on the same computer, so it can write there.
    const folder = (await api<HttpsStatus>(page, "GET", "/api/https")).own.folder;
    expect(folder).toMatch(/tls[\\/]own$/);
    fs.writeFileSync(path.join(folder, "fullchain.pem"), renewed.pem + house.intermediate.pem);
    fs.writeFileSync(path.join(folder, "privkey.pem"), renewed.keyPem);
    await section.getByRole("button", { name: "Give Outpost another certificate" }).click();
    await section.getByRole("button", { name: "Use them" }).click();
    await expect(section.getByText(renewed.certificate.fingerprint256)).toBeVisible();
    expect((await presented(house.root.pem)).fingerprint256).toBe(renewed.certificate.fingerprint256);
    // The root was not in the renewed file, so it is no longer Outpost's to offer.
    await expect(section.getByText(/The root was not in the files you gave/)).toBeVisible();

    // Back to Outpost's own: one press, the same authority as before, and the person's files still in the folder.
    await section.getByRole("button", { name: "Go back to Outpost’s own certificate" }).click();
    await expect(section.getByRole("heading", { name: "Trust the certificate on each device" })).toBeVisible({ timeout: 30_000 });
    await expect(section.getByText(outposts?.fingerprint ?? "")).toBeVisible();
    const outpostsPem = await (await page.request.get("/api/https/outpost-authority.pem")).text();
    await expect.poll(async () => (await getTrusting(`${secure}/api/health`, outpostsPem).catch(() => ({ status: 0 }))).status).toBe(200);
    await expect(getTrusting(`${secure}/api/health`, house.root.pem)).rejects.toThrow();
    expect(fs.existsSync(path.join(folder, "privkey.pem"))).toBe(true);
    expect(errors.filter((error) => !/Failed to load resource/.test(error))).toEqual([]);
  });

  test("from another device over plain http, takes the key only once the person ticks that they accept it", async ({ browser, baseURL }) => {
    const house = makeAuthority("Hill House Root");
    const mine = make({ name: "localhost", issuer: house.intermediate, names: ["localhost", "127.0.0.1"], until: 90 });
    const pick = (name: string, text: string) => ({ name, mimeType: "application/x-pem-file", buffer: Buffer.from(text) });
    // A phone. The test's browser runs on the server's own computer, so the header a proxy would add is
    // what makes the server see another device (`core/local.ts`); TEST-NET-1 is never a real device.
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.50" },
    });
    const page = await context.newPage();
    try {
      const errors = watchForErrors(page);
      await page.goto("/settings#https");
      const section = page.locator("#https");
      const choice = section.locator("details", { has: page.locator("summary", { hasText: "Use a certificate of your own instead" }) });
      await choice.locator("summary").click();

      // The trade, before any file is chosen, and the two better ways.
      const warning = choice.getByRole("status").filter({ hasText: "This page is open over plain http" });
      await expect(warning).toBeVisible();
      await expect(warning).toContainText("Anyone able to listen on this network could copy the key");
      await expect(warning).toContainText("so does the password of a .pfx or .p12 file");
      await expect(warning).toContainText("on the computer Outpost runs on");
      const folder = (await api<HttpsStatus>(page, "GET", "/api/https")).own.folder;
      await expect(warning).toContainText(folder);

      await choice.getByLabel("Certificate file").setInputFiles(pick("fullchain.pem", mine.pem + house.intermediate.pem + house.root.pem));
      await choice.getByLabel("Key file").setInputFiles(pick("privkey.pem", mine.keyPem));
      const use = choice.getByRole("button", { name: "Use this certificate" });
      await expect(use).toBeDisabled();
      // Without the box ticked the server refuses too, whatever a page sends.
      const bare = await page.evaluate(async () => {
        const form = new FormData();
        form.append("certificate", new Blob(["x"]), "fullchain.pem");
        return (await fetch("/api/https/own", { method: "POST", headers: { "X-Outpost-Request": "1" }, body: form })).status;
      });
      expect(bare).toBe(403);

      const tick = choice.getByRole("checkbox", { name: /I accept that my private key/ });
      const box = await choice.locator("label", { hasText: "I accept that my private key" }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await tick.click();
      await expect(use).toBeEnabled();
      await use.click();
      await expect(section.getByRole("heading", { name: "Your certificate" })).toBeVisible({ timeout: 30_000 });
      await expect(section.getByText(mine.certificate.fingerprint256)).toBeVisible();
      expect((await presented(house.root.pem)).fingerprint256).toBe(mine.certificate.fingerprint256);
      // Nothing wider than the phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      expect(errors.filter((error) => !/Failed to load resource/.test(error))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
