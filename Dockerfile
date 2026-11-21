FROM node:22-slim
# eMudhra CA distrust (Oct 2026): current CA bundle, and make Node trust it instead of its bundled root list
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_OPTIONS="--use-openssl-ca"
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY test ./test
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -fsS http://127.0.0.1:3000/health || exit 1
# Structured JSON logs + request ids (logging standard, AGENTS.md; logkit/README.md). No IPs or user agents.
COPY logkit ./logkit
ENV LOG_APP=decision-desk LOG_IP=0 LOG_UA=0
CMD ["node", "-r", "./logkit/logkit-preload.cjs", "server.js"]