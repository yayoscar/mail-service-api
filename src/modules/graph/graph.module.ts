import { Module } from '@nestjs/common';
import { GraphMailService } from './graph-mail.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [GraphMailService],
  exports: [GraphMailService],
})
export class GraphModule {}
