FROM node:24-bookworm-slim AS dev
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node . .
CMD ["npm", "run", "dev"]

FROM dev AS build
ARG APP_NAME="Voxel Game"
ARG APP_SLUG="voxel-game"
ENV APP_NAME=$APP_NAME APP_SLUG=$APP_SLUG
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production WEB_PORT=5173
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json ./
USER node
EXPOSE 5173
CMD ["node", "scripts/serve.mjs"]
