import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import createRedisClient from "./lib/redis";
import { FingerprintingModule } from "./fingerprinting";

// FIXME :: abstract all thios logic to various services

const { readFileSync } = require('fs');
const path = require('path');
const config = require('config');
// const Application = require('@button/libbtn/web/app');
// const nodeRedis = require('redis');

// const fingerprinting = require('./routes/fingerprinting');
// const createRedisClient = require('./lib/redis');

const luaPath = name => path.join(__dirname, 'lua', name);

// const app = new Application({
//   port: config.get('port'),
//   sentryDsn: config.get('sentryDsn'),
// });

// console.log("config: ", config); // FIXME ::: why empty? need to config.start()?

// const nodeRedisClient = nodeRedis.createClient({
//   host: config.get('redisHost'),
//   port: config.get('redisPort'),
//   retry_strategy: () => 1000,
// });

// const redisScripts = { lpopwhile: readFileSync(luaPath('lpopwhile.lua')) };

// const { errorLogger, metrics } = app;

export class ErrorLogger {
  constructor() {}
  public log(){
    console.log('error logged!');
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000); // FIXME :: abstract to configuration service (.env files best 12-factor approach --> store config in env it's runing (local, dev, staging, prod...))

  // FIXME :: migrate all logic from server.js to here (setup index.js) like the olden days...
  // const redisClient = await createRedisClient(
  //   nodeRedisClient,
  //   redisScripts,
  //   new ErrorLogger(), // errorLogger
  // );

}
bootstrap();
