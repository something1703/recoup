# Multi-stage: compile TypeScript in a full-dependency stage, ship only the
# compiled output + production deps in the runtime image.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

RUN groupadd --gid 10001 recoup \
  && useradd --uid 10001 --gid recoup --shell /usr/sbin/nologin recoup
USER 10001:10001

EXPOSE 8890
CMD ["node", "dist/index.js"]
