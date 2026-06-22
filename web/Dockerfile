FROM node:18-alpine
WORKDIR /app
COPY . /app
RUN npm ci --only=production
RUN npm install -g serve
EXPOSE 3000
CMD ["serve","-s",".","-l","3000"]
