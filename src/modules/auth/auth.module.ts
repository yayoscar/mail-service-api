import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenCipher } from '../../common/crypto/token-cipher';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenCipher],
  exports: [AuthService, TokenCipher],
})
export class AuthModule {}
