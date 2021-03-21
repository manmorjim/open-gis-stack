FROM node:14

WORKDIR /usr/src/app

VOLUME [ "/usr/src/app" ]

COPY package*.json ./

RUN npm install


CMD ["npm", "run", "start"]