# Decision Desk

Decision Desk is an open-source support-triage demo for **Jev-class decision models**. One model call turns an incoming ticket into four typed, confidence-bearing decisions: queue, priority, handling risk, and next action.

Unlike a chat demo, the output is designed to go straight into application logic. Every answer is one of the options the application supplied, includes probabilities, and shows the real model, provider, latency, and cost returned by the neutral [Jev Gateway](https://jev-router.app.mintapis.com).

## Why support triage?

Real ticket handling is not one yes/no classification. Teams need several related operational decisions at once, and they need to know when confidence is too low to automate. This demo makes that useful shape visible without pretending the model writes the customer reply.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open <http://localhost:3000>. No API key is required for gateway models that permit public demo traffic.

Configuration:

```bash
JEV_GATEWAY_URL=https://jev-router.app.mintapis.com \
RATE_LIMIT_PER_MINUTE=8 \
DAILY_SPEND_CAP_USD=2 \
npm start
```

To point the app at another compatible model gateway, set `JEV_GATEWAY_URL`. The gateway must accept TypeSafe-compatible `POST /v1/systemone`, expose `GET /models`, and return the selected model, provider, latency, and cost in the `X-Jev-*` response headers. To add a model identifier, extend the small allowlist in `server.js`; the browser never receives provider credentials.

## Privacy and limits

- Ticket text is forwarded for the decision and is not written to disk, a database, analytics, or server logs.
- The public deployment applies a per-IP rate limit and a server-side daily model-spend cap.
- Counters are deliberately in memory; a restart resets them. For a multi-instance production service, use a shared rate-limit store.
- The gateway publishes backend availability. Offline or legally unavailable models stay visible but disabled in the selector.

## Develop

```bash
npm test
docker build -t decision-desk .
docker run --rm -p 3000:3000 decision-desk
```

MIT licensed. Built by [Benchmark Heaven](https://benchmarkheaven.com) to accompany the public [Jev model comparison](https://benchmarkheaven.com/jev-models).
