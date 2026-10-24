import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminSessionConfig } from './admin-session.config';
import { AdminSessionController } from './admin-session.controller';
import { AdminSessionService } from './admin-session.service';

@Module({
  imports: [
    // The secret is passed on each sign/verify call because it comes from AdminSessionConfig
    JwtModule.register({}),
    // In-memory storage is enough for a single process; only the login route uses ThrottlerGuard
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AdminSessionController],
  providers: [AdminSessionConfig, AdminSessionService],
  exports: [AdminSessionService],
})
export class AdminSessionModule {}
