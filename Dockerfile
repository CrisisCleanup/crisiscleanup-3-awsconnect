FROM mhart/alpine-node:13
WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn install

FROM mhart/alpine-node:13
WORKDIR /app
COPY --from=0 /app .
COPY . .

ENTRYPOINT ["yarn"]
CMD ["deploy:dev"]
