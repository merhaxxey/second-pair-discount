FROM node:20-alpine

EXPOSE 3000
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

CMD ["npm", "run", "docker-start"]
