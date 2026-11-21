import { Duplex } from "node:stream";
import { describe, expect, it } from "vitest";
import { CMD, encodeFrame, FROM_RADIO, FrameReader, PUSH, RESP, TO_RADIO } from "../src/modules/mesh/meshcore/frames.ts";
import { CompanionSession } from "../src/modules/mesh/meshcore/session.ts";

/** A companion radio on the other end of a stream, answering as `answer` says. */
function fakeRadio(answer: (command: Buffer, reply: (payload: Buffer, afterMs?: number) => void) => void) {
  const reader = new FrameReader(TO_RADIO);
  const commands: number[] = [];
  const stream: Duplex = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, done) {
      for (const command of reader.push(chunk)) {
        commands.push(command[0] ?? -1);
        answer(command, (payload, afterMs = 0) =>
          setTimeout(() => {
            if (!stream.destroyed) stream.push(encodeFrame(payload, FROM_RADIO));
          }, afterMs),
        );
      }
      done();
    },
  });
  return { stream, commands };
}

const selfInfo = () => Buffer.concat([Buffer.from([RESP.selfInfo]), Buffer.alloc(57), Buffer.from("Base", "utf8")]);
const channelInfo = (index: number, name: string) => {
  const frame = Buffer.alloc(50);
  frame[0] = RESP.channelInfo;
  frame[1] = index;
  frame.write(name, 2, "utf8");
  return frame;
};
const channelMessage = (index: number, text: string) => {
  const head = Buffer.alloc(8);
  head[0] = RESP.channelMessage;
  head[1] = index;
  head[2] = 0;
  head[3] = 0;
  head.writeUInt32LE(1_700_000_000, 4);
  return Buffer.concat([head, Buffer.from(text, "utf8")]);
};

describe("a MeshCore companion session", () => {
  it("does not take a late answer to one command for the answer to the next", async () => {
    // The radio is slow to say what it is (the session gives up waiting, as start-up allows), then answers everything else at once.
    const radio = fakeRadio((command, reply) => {
      if (command[0] === CMD.appStart) reply(selfInfo());
      else if (command[0] === CMD.deviceQuery) reply(Buffer.from([RESP.deviceInfo, 9, 0, 0]), 80);
      else if (command[0] === CMD.getChannel) {
        const index = command[1] ?? 0;
        reply(index < 2 ? channelInfo(index, index === 0 ? "Public" : "Family") : Buffer.from([RESP.err, 2]));
      } else if (command[0] === CMD.syncNextMessage) reply(Buffer.from([RESP.noMoreMessages]));
    });
    const session = new CompanionSession({ stream: radio.stream, onMessage: () => {}, onClose: () => {}, answerMs: 40 });
    const info = await session.start();
    expect(info.radioName).toBe("Base");
    expect(info.channels).toEqual([
      { index: 0, name: "Public" },
      { index: 1, name: "Family" },
    ]);
    session.close();
  });

  it("still takes the messages a radio holds after a slow answer, and sends", async () => {
    const heard: string[] = [];
    let held = ["Family: one", "Family: two"];
    const radio = fakeRadio((command, reply) => {
      if (command[0] === CMD.getChannel) reply(Buffer.from([RESP.err, 2]));
      else if (command[0] === CMD.appStart) reply(selfInfo());
      else if (command[0] === CMD.deviceQuery) reply(Buffer.from([RESP.deviceInfo, 9]), 80);
      else if (command[0] === CMD.syncNextMessage) {
        const next = held[0];
        held = held.slice(1);
        reply(next ? channelMessage(1, next) : Buffer.from([RESP.noMoreMessages]));
      } else if (command[0] === CMD.sendChannelText) {
        const sent = Buffer.alloc(10);
        sent[0] = RESP.sent;
        sent[1] = 1;
        reply(sent);
      }
    });
    const session = new CompanionSession({
      stream: radio.stream,
      onMessage: (message) => heard.push(message.text),
      onClose: () => {},
      answerMs: 40,
    });
    await session.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(heard).toEqual(["Family: one", "Family: two"]);
    await expect(session.sendChannelText(1, "hello")).resolves.toEqual({ flood: true });
    radio.stream.push(encodeFrame(Buffer.from([PUSH.messagesWaiting]), FROM_RADIO));
    session.close();
  });
});
