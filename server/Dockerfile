FROM node:22-alpine
WORKDIR /srv
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY race-server.mjs ./
EXPOSE 8787
USER node
CMD ["node", "race-server.mjs"]
