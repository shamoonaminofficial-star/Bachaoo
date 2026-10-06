import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel, WhatsappChannel } from './channels/sms-whatsapp.channel';
import { DispatchService } from './channels/dispatch.service';
import { requiredSecret } from '../../common/utils/required-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: requiredSecret('JWT_SECRET', 'dev-secret-change-me'),
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    EmailChannel,
    SmsChannel,
    WhatsappChannel,
    DispatchService,
  ],
  exports: [AuthService, DispatchService, EmailChannel, SmsChannel, WhatsappChannel],
})
export class AuthModule {}
