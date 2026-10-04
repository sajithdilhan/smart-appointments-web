# syntax=docker/dockerfile:1
ARG NODE_VERSION=24
ARG NGINX_TAG=1.29-alpine

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN corepack enable
# Dependencies first: only the manifest and lock file invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch && pnpm install --frozen-lockfile --offline --ignore-scripts
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:${NGINX_TAG}
COPY --from=build /app/dist/smart-appointments-web/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security.conf /etc/nginx/snippets/security.conf
COPY docker/config.json.template /etc/nginx/runtime/config.json.template
COPY --chmod=0755 docker/40-config.sh /docker-entrypoint.d/40-config.sh
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
