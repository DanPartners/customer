import { describe, expect, it, vi } from "vitest";
import { live, liveUrl } from "./live";

/** A stand-in WebSocket that records what is sent and lets a test play the server. */
class FakeSocket {
  static all: FakeSocket[] = [];
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocol: string,
  ) {
    FakeSocket.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
  server(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function start(overrides: Partial<Parameters<typeof live>[0]> = {}) {
  FakeSocket.all = [];
  const events = { data: [] as unknown[], opened: 0, done: 0, refused: [] as string[] };
  const stop = live({
    base: "https://api.shop.example/",
    payload: { token: "t" },
    query: "subscription { x }",
    onData: (data) => events.data.push(data),
    onOpen: () => (events.opened += 1),
    onDone: () => (events.done += 1),
    onRefused: (code) => events.refused.push(code),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    ...overrides,
  });
  return { events, stop, socket: () => FakeSocket.all[FakeSocket.all.length - 1] };
}

describe("live channel", () => {
  it("connects with the protocol, signs in, then subscribes", () => {
    const { events, socket } = start();
    expect(socket().url).toBe("wss://api.shop.example/graphql/ws");
    expect(socket().protocol).toBe("graphql-transport-ws");
    socket().onopen?.();
    expect(socket().sent[0]).toEqual({ type: "connection_init", payload: { token: "t" } });
    socket().server({ type: "connection_ack" });
    expect(socket().sent[1]).toMatchObject({ type: "subscribe", id: "1", payload: { query: "subscription { x }" } });
    expect(events.opened).toBe(1);
    socket().server({ type: "next", id: "1", payload: { data: { x: 1 } } });
    socket().server({ type: "ping" });
    expect(socket().sent[2]).toEqual({ type: "pong" });
    expect(events.data).toEqual([{ x: 1 }]);
  });

  it("reconnects after a drop and opens again, so the page can resync", () => {
    vi.useFakeTimers();
    const { events, socket } = start();
    socket().onopen?.();
    socket().server({ type: "connection_ack" });
    socket().onclose?.({ code: 1006 });
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(2);
    socket().onopen?.();
    socket().server({ type: "connection_ack" });
    expect(events.opened).toBe(2);
    vi.useRealTimers();
  });

  it("stops for good on a refused sign-in, an error or a finished subscription", () => {
    vi.useFakeTimers();
    const refused = start();
    refused.socket().onopen?.();
    refused.socket().onclose?.({ code: 1002 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(refused.events.refused).toEqual(["unauthorized"]);

    const errored = start();
    errored.socket().server({ type: "connection_ack" });
    errored.socket().server({ type: "next", id: "1", payload: { errors: [{ extensions: { code: "not_found" } }] } });
    expect(errored.events.refused).toEqual(["not_found"]);

    const done = start();
    done.socket().server({ type: "connection_ack" });
    done.socket().server({ type: "complete", id: "1" });
    vi.advanceTimersByTime(60_000);
    expect(done.events.done).toBe(1);
    expect(FakeSocket.all).toHaveLength(1);
    vi.useRealTimers();
  });

  it("turns an http address into a ws one", () => {
    expect(liveUrl("http://192.168.1.20:2283")).toBe("ws://192.168.1.20:2283/graphql/ws");
    expect(liveUrl("https://shop.example/dan/")).toBe("wss://shop.example/dan/graphql/ws");
  });
});
