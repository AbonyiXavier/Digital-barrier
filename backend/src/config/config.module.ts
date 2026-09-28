import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service';
import { validateEnv } from './env';

/**
 * Global config. `validate` runs once at boot, so a missing or malformed variable
 * is a startup failure with a readable message rather than a 500 on first use.
 *
 * Global because every feature module reads configuration; requiring each to
 * import this module communicates nothing and fails at runtime when forgotten.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
