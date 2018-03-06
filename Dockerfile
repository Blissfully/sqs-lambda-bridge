FROM node:6.10

LABEL maintainer "jacob@blissfully.com"

WORKDIR /usr/src/app
COPY . /usr/src/app

RUN yarn install --production

ENTRYPOINT [ "/bin/sh", "-c" ]
CMD ["yarn start"]
