# Container image for the site, so it can run on Coolify, on a plain Docker
# host, or locally — alongside the Render blueprint rather than instead of it.
# render.yaml still describes the Render services and is still what deploys
# arethebrewersontv.com; nothing here changes that.
#
# Debian slim rather than Alpine on purpose. @resvg/resvg-js ships prebuilt
# native binaries per libc, and the musl builds are the ones that go wrong; the
# social-card renderer is the only thing that would break, and it would break at
# request time on one route rather than at build time, which is the worst way to
# find out.
FROM node:24-slim AS deps
WORKDIR /app
# Only the manifest and lockfile, so this layer is rebuilt when dependencies
# change and not when a CSV does.
COPY package.json package-lock.json ./
# `ci`, not `install`: it fails on a lockfile that disagrees with package.json
# rather than quietly resolving something new. This repo has already shipped a
# lockfile that pinned vite and neither of the two native packages the social
# cards need, and `npm install` hid it by resolving them fresh every deploy.
RUN npm ci --omit=dev

FROM node:24-slim
WORKDIR /app

ENV NODE_ENV=production
# Matches render.yaml. The box-score indices need more heap than Node's default
# cap on a 512MB instance; leave the rest for native and system overhead.
ENV NODE_OPTIONS=--max-old-space-size=400

COPY --from=deps /app/node_modules ./node_modules
# .dockerignore decides what this actually copies — notably not the test suite,
# and on the baseball site not the 388MB play-by-play file, which is input to
# the index builder and is never read at runtime.
COPY . .

# server.js reads process.env.PORT and falls back to 3000. Coolify sets the port
# it expects; nothing here needs to know which.
EXPOSE 3000

# Node's own fetch rather than curl, which node:slim does not carry. The same
# path render.yaml uses as its health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Not `npm start`: npm sits between the signal and the process, so a container
# stop takes the full grace period instead of ending when the server does.
CMD ["node", "server.js"]
