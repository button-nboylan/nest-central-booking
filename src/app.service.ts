import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  conseguirMundo(): string {
    return 'hola mundo.';
  }
}
