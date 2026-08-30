FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_TRUEFORGE_BASE_URL
ARG VITE_RECOUP_ACTIONS_BASE_URL
ENV VITE_TRUEFORGE_BASE_URL=$VITE_TRUEFORGE_BASE_URL
ENV VITE_RECOUP_ACTIONS_BASE_URL=$VITE_RECOUP_ACTIONS_BASE_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
