FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Empty on purpose: the browser talks to the proxy on its own origin
# (server.mjs forwards /api/* to TRUEFORGE_BASE_URL server-side), since
# TrueForge's hosted-mode API sends no CORS headers for a cross-origin caller.
ENV VITE_TRUEFORGE_BASE_URL=""
ARG VITE_RECOUP_ACTIONS_BASE_URL
ENV VITE_RECOUP_ACTIONS_BASE_URL=$VITE_RECOUP_ACTIONS_BASE_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
