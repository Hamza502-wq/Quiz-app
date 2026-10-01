# DoorStep web apps (customer website, vendor dashboard, admin panel). Build one app per image:
#   docker build --build-arg APP=vendor-dashboard --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-vendor .
#   docker build --build-arg APP=admin-panel      --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-admin .
#   docker build --build-arg APP=customer-web     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t doorstep-web .
FROM node:22-bookworm-slim AS build
WORKDIR /web
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY vendor-dashboard/package.json vendor-dashboard/
COPY admin-panel/package.json admin-panel/
COPY customer-web/package.json customer-web/
RUN npm ci
COPY . .
ARG APP=vendor-dashboard
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @doorstep/$APP && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ARG APP=vendor-dashboard
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /web
COPY --from=build --chown=node:node /web /web
WORKDIR /web/$APP
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
