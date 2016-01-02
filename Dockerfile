FROM mhart/alpine-node:5

RUN apk add --update bash

RUN npm install -g babel-cli

COPY src /app/src
COPY .babelrc /app/.babelrc
COPY package.json /app/package.json
COPY package.bash /app/package.bash
COPY Dockerfile.run /app/Dockerfile

WORKDIR /app

CMD ["./package.bash"]
