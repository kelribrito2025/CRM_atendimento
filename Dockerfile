# Node.js 22.22.0 Jod LTS, imagem oficial Debian Bookworm slim.
# Tag e digest verificados em nodejs.org e no registro oficial library/node.
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS build

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts

COPY vite.config.mjs server.js ./
COPY client ./client
COPY src ./src
COPY scripts/pos-build.js ./scripts/pos-build.js
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server.js ./server.js
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3100
CMD ["node", "dist/index.js"]
