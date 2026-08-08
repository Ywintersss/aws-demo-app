# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 3000 9229
CMD ["npm", "run", "dev", "-w", "@aethelgard/api"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/shared \
 && npm run build -w @aethelgard/api \
 && npm run build -w @aethelgard/web

FROM node:22-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=@aethelgard/shared --workspace=@aethelgard/api
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/api/migrations packages/api/migrations
COPY --from=build /app/packages/web/dist packages/web/dist
USER app
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "packages/api/dist/index.js"]
