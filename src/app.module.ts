import { Module } from '@nestjs/common';
import { RouterModule, Routes } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FingerprintingController } from './fingerprinting';
import { FingerprintingModule } from './fingerprinting/fingerprinting.module';

// FICME :: BP --> abstract to separate file
// const routes: Routes = [

// ]

@Module({
  imports: [
    FingerprintingModule, // FIXME :: tenes que asurate: importarse el module antes
    RouterModule.register([
      {
        path: '', // FIXME :: update routing structure
        module: FingerprintingModule,
        // children routes may not be necessary
        // children: [
          //   path: 'metrics',
          //   module: MetricsModule,
          // ]
        },
    ]),
  ],
  controllers: [AppController], // FIXME :: fingerinting module here or elsewhere?
  providers: [AppService],
})
export class AppModule {}
