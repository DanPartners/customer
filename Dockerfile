# The ordering site as a container: what the Dan cloud's compose.yaml ran
# before the site moved to Vercel (DAN-45), until DAN-48. Build it with
# NEXT_PUBLIC_DAN_API_URL, the Dan cloud's one address.
FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_DAN_API_URL=
# public/ may be empty, and git does not keep empty folders.
RUN mkdir -p public && npm run build

FROM node:22.23.5-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3001
CMD ["node", "server.js"]
