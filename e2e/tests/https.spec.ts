import { createHash, X509Certificate } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { chromium } from "@playwright/test";
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

test.describe("HTTPS on your network", () => {
  test.afterAll(async ({ request }) => {
    await request.patch("/api/settings", { headers: { "X-Outpost-Request": "1" }, data: { "https.enabled": false, "https.names": "" } });
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
    for (const device of ["iPhone and iPad", "Android", "Mac", "Windows", "Firefox on a computer"]) {
      await expect(section.locator("summary", { hasText: device })).toBeVisible();
    }

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
});
