FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY test ./test
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node","server.js"]
