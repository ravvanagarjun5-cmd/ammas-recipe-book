FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data
# Mount a persistent volume at /data (SQLite database + audio recordings).
EXPOSE 8787
CMD ["node", "server/index.ts"]
