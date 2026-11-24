// A stand-in for Stripe's payment API, for end-to-end tests only.
//
//   PORT=12111 node e2e/fake-stripe.mjs
//
// Point the shop server at it with DAN_STRIPE_API_BASE=http://127.0.0.1:12111.
// A test marks a payment as paid with POST /__test/succeed/<id>.
import { createServer } from "node:http";

const intents = new Map();
let count = 0;

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    const url = new URL(request.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    if (request.method === "POST" && url.pathname === "/v1/payment_intents") {
      const form = new URLSearchParams(raw);
      count += 1;
      const id = `pi_fake${count}`;
      const intent = {
        id,
        client_secret: `${id}_secret_fake`,
        status: "requires_payment_method",
        amount: Number(form.get("amount")),
        amount_received: 0,
        currency: form.get("currency"),
        metadata: { pending_id: form.get("metadata[pending_id]") },
      };
      intents.set(id, intent);
      return send(response, 200, intent);
    }
    const intent = intents.get(parts[2] ?? parts[2]);
    if (request.method === "GET" && parts[0] === "v1" && intent) return send(response, 200, intent);
    if (request.method === "POST" && parts[3] === "cancel" && intent) {
      if (intent.status === "succeeded") return send(response, 400, { error: { code: "payment_intent_unexpected_state" } });
      intent.status = "canceled";
      return send(response, 200, intent);
    }
    if (request.method === "POST" && parts[0] === "__test" && parts[1] === "succeed") {
      const target = intents.get(parts[2]);
      if (!target) return send(response, 404, {});
      target.status = "succeeded";
      target.amount_received = target.amount;
      return send(response, 200, target);
    }
    if (request.method === "GET" && url.pathname === "/__test/latest") {
      return send(response, 200, [...intents.values()].at(-1) ?? null);
    }
    send(response, 404, { error: { code: "not_found" } });
  });
}).listen(Number(process.env.PORT ?? 12111), "127.0.0.1");
