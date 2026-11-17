/**
 * The mesh radio link end to end, at phone width: Outpost is the MQTT broker, a stand-in
 * Meshtastic radio (an MQTT client speaking the JSON its documentation describes)
 * connects to it, and a phone on the Messages screen exchanges a message with it both
 * ways without reloading. No real radio is involved.
 */
import { createClient, type MqttClient } from "../../apps/server/src/modules/mesh/mqtt/client.ts";
import { api, expect, test, watchForErrors } from "./fixtures";

const BROKER_PORT = Number(process.env.OUTPOST_E2E_MESH_PORT ?? Number(process.env.OUTPOST_E2E_PORT ?? 8471) + 6);
const PASSWORD = "e2e-radio-password-31";
const ROOT = "msh/EU_868";
const RADIO_ID = "!a1b2c3d4";
const quiet = { info() {}, warn() {}, debug() {} };

test.describe("the board on a mesh radio channel", () => {
  let radio: MqttClient | null = null;

  test.afterEach(async ({ page }) => {
    await radio?.stop();
    radio = null;
    await page.goto("/");
    await api(page, "PUT", "/api/mesh/meshtastic", { mode: "off" });
    await api(page, "POST", "/api/manage/leftovers/clear", { ids: ["board:all"] });
  });

  test("a message from the radio appears on the phone, and the phone's reply goes to the radio", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.addInitScript(() => localStorage.setItem("outpost.board.name", "Sam"));
    await page.goto("/");
    await api(page, "PUT", "/api/mesh/meshtastic", {
      mode: "broker",
      broker: { port: BROKER_PORT, userName: "radio", password: PASSWORD },
      channels: [{ name: "LongFast", index: 0 }],
    });

    const downlinks: string[] = [];
    radio = createClient({
      host: "127.0.0.1",
      port: BROKER_PORT,
      clientId: RADIO_ID,
      userName: "radio",
      password: PASSWORD,
      subscriptions: [{ filter: `${ROOT}/2/json/mqtt/#`, qos: 1 }],
      log: quiet,
    });
    radio.onMessage((_topic, payload) => downlinks.push(payload.toString()));
    radio.start();
    await expect.poll(() => radio?.status().state).toBe("connected");
    const topic = `${ROOT}/2/json/LongFast/${RADIO_ID}`;
    await radio.publish(
      topic,
      Buffer.from(
        JSON.stringify({
          channel: 0,
          from: 0x0badcafe,
          id: 1,
          type: "nodeinfo",
          payload: { id: "!0badcafe", longname: "Hilltop Jo", shortname: "JO" },
          sender: RADIO_ID,
          to: -1,
        }),
      ),
      1,
    );

    await page.goto("/messages");
    await page.getByRole("radio", { name: "LongFast" }).click();
    await expect(page.getByText(/Anyone with a radio in range may read a public channel/)).toBeVisible();

    // Heard by the radio: on the phone without reloading.
    await page.evaluate(() => {
      (window as unknown as { stayed: boolean }).stayed = true;
    });
    await radio.publish(
      topic,
      Buffer.from(
        JSON.stringify({
          channel: 0,
          from: 0x0badcafe,
          id: 4242,
          type: "text",
          payload: { text: "Snow on the top road" },
          sender: RADIO_ID,
          to: -1,
        }),
      ),
      1,
    );
    const list = page.getByRole("list", { name: "Messages, oldest first" });
    const heard = list.getByRole("listitem").filter({ hasText: "Snow on the top road" });
    await expect(heard).toBeVisible();
    await expect(heard).toContainText("Hilltop Jo");
    await expect(heard).toContainText("by radio");
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);

    // Written on the phone: counted in bytes, then handed to the radio.
    const box = page.getByLabel(/Write a message on LongFast as Sam/);
    await box.fill("Roads clear by noon?");
    await expect(page.getByText(/25 of 200 bytes/)).toBeVisible();
    await page.getByRole("button", { name: "Send by radio" }).click();
    await expect.poll(() => downlinks.length).toBe(1);
    expect(JSON.parse(downlinks[0]!)).toMatchObject({ type: "sendtext", payload: "Sam: Roads clear by noon?", channel: 0 });
    await expect(list.getByRole("listitem").filter({ hasText: "Roads clear by noon?" })).toContainText("Handed to the radio");

    // Home is the household's board as before, without the radio's messages.
    await page.getByRole("radio", { name: "Home" }).click();
    await expect(page.getByText("Snow on the top road")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
