# syntax=docker/dockerfile:1

# AVN Hub runs its Next.js dev server as its ACTUAL runtime — this is deliberate,
# not a build shortcut. The NutBot widget creator writes real .tsx into the source
# tree at runtime and depends on three things a slim standalone prod build does
# not have:
#   1. the dev server's file-watcher / HMR, to load a new widget with no rebuild
#   2. the TypeScript toolchain (`tsc`), to validate generated widgets
#   3. the full source tree, which the agent reads and writes
# A `next build` + `next start` image would break the headline feature. Because
# this is a single-user, self-hosted, full-trust instance (your own box / tailnet),
# the usual "never run next dev in prod" rule — a multi-tenant perf+security rule —
# does not apply. See docs/AVN_HUB.md › Runtime model and the CHANGELOG (2.1.0).
#
# NOTE: the widget creator also shells out to an agent CLI (claude / codex /
# opencode). Those are NOT installed here — provide them to the container (mount
# in / extend this image / install + authenticate), or run the hub directly on a
# host that already has them (`npm run dev`). See README › Self-hosting.

FROM node:20-alpine
WORKDIR /app

# Install deps first so this layer caches; the source itself is bind-mounted at
# runtime (see docker-compose.yml) so the agent's widget writes land on the host.
COPY package.json package-lock.json ./
RUN npm ci

ENV NODE_ENV=development
ENV PORT=3000
EXPOSE 3000

# bind to 0.0.0.0 so the port is reachable outside the container (next dev
# defaults to localhost)
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]
