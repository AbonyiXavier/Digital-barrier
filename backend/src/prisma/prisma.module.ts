import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global so feature modules do not each have to import it. This is the one place
 * a global module is justified: every module needs the database, and threading
 * the import through twenty modules communicates nothing.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
