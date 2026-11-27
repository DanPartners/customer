/**
 * A small client for the shop server's live channel, speaking the standard
 * GraphQL WebSocket protocol (graphql-transport-ws). The same file is in the
 * dashboard and the customer site.
 *
 * It reconnects by itself, waiting a little longer each time (up to 15
 * seconds), and calls `onOpen` on every connection so the page can fetch the
 * full state and miss nothing that happened while it was away.
 */

export type LiveStatus = "connecting" | "live" | "offline";

export type LiveOptions<T> = {
  /** The API's base address, http(s)://…; the channel is at /graphql/ws. */
  base: string;
  /** Added to the channel's address, e.g. the shop a customer's channel is for (`shop`). */
  params?: Record<string, string>;
  /** Sent in connection_init. The dashboard sends its sign-in token here. */
  payload?: Record<string, unknown>;
  query: string;
  variables?: Record<string, unknown>;
  onData: (data: T) => void;
  /** Each time the subscription starts, including after a reconnect. */
  onOpen?: () => void;
  /** The server finished the subscription. No reconnect follows. */
  onDone?: () => void;
  /** The server refused: a bad sign-in or a bad request. No reconnect follows. */
  onRefused?: (code: string) => void;
  onStatus?: (status: LiveStatus) => void;
  WebSocketImpl?: typeof WebSocket;
};

type ServerMessage =
  | { type: "connection_ack" }
  | { type: "ping" | "pong" }
  | { type: "next"; id: string; payload: { data?: unknown; errors?: { message?: string; extensions?: { code?: string } }[] } }
  | { type: "error"; id: string; payload: { message?: string; extensions?: { code?: string } }[] }
  | { type: "complete"; id: string };

export function liveUrl(base: string, params?: Record<string, string>): string {
  const search = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";
  return `${base.replace(/\/+$/, "").replace(/^http/, "ws")}/graphql/ws${search}`;
}

/** Starts the channel. Returns a function that stops it for good. */
export function live<T>(options: LiveOptions<T>): () => void {
  const Impl = options.WebSocketImpl ?? WebSocket;
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const status = (value: LiveStatus) => options.onStatus?.(value);

  const finish = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close(1000, "done");
  };

  const connect = () => {
    if (stopped) return;
    status("connecting");
    let acknowledged = false;
    const ws = new Impl(liveUrl(options.base, options.params), "graphql-transport-ws");
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init", payload: options.payload ?? {} }));
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case "connection_ack":
          acknowledged = true;
          attempt = 0;
          ws.send(JSON.stringify({ type: "subscribe", id: "1", payload: { query: options.query, variables: options.variables ?? {} } }));
          status("live");
          options.onOpen?.();
          break;
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        case "next":
          if (message.payload.errors?.length) {
            finish();
            options.onRefused?.(message.payload.errors[0].extensions?.code ?? "error");
          } else {
            options.onData(message.payload.data as T);
          }
          break;
        case "error":
          finish();
          options.onRefused?.(message.payload[0]?.extensions?.code ?? "error");
          break;
        case "complete":
          finish();
          options.onDone?.();
          break;
      }
    };
    ws.onclose = (event) => {
      if (socket === ws) socket = null;
      if (stopped) return;
      // Closed before it was accepted, with a protocol refusal: the sign-in was not accepted.
      if (!acknowledged && event.code === 1002) {
        stopped = true;
        status("offline");
        options.onRefused?.("unauthorized");
        return;
      }
      status("offline");
      attempt += 1;
      const wait = Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() / 2);
      timer = setTimeout(connect, wait);
    };
    ws.onerror = () => ws.close();
  };

  connect();
  return finish;
}
