# syntax=docker/dockerfile:experimental
FROM 157504463466.dkr.ecr.us-west-2.amazonaws.com/base-images/node:16.13.1-git-1ccfdff

WORKDIR /app/central-booking

COPY yarn.lock /app/central-booking/yarn.lock
COPY package.json /app/central-booking/package.json
RUN --mount=type=ssh yarn install --frozen-lockfile

COPY ./ /app/central-booking

CMD ["/usr/local/bin/yarn", "start"]
