# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci

FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@aethelgard/web", "--", "--host"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @aethelgard/web

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
