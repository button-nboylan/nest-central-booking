import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);

  // FIXME :: migrate all logic from server.js to here (setup index.js) like the olden days...

}
bootstrap();
