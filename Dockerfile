# Multi-stage build: one small production image containing the API
# and the built React app. Build tools and dev dependencies never reach
# the final image.

# ---- 1. Build the React app ----
FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. Build the API ----
FROM node:22-bookworm-slim AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

# ---- 3. Runtime ----
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST=/app/web/dist
WORKDIR /app/server
COPY --from=server-build /app/server/package.json ./
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/dist ./dist
COPY --from=web-build /app/web/dist /app/web/dist

# Don't run as root inside the container.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, optionally load demo data, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then node dist/seed.js; fi && exec node dist/index.js"]
