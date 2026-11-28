import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AccessService } from '../access/access.service';
import { AppException } from '../common/exceptions/app.exception';
import { AppConfig } from '../config/configuration';
import { User } from '../users/entities/user.entity';
import { UsersRepository } from '../users/users.repository';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';

// used when the email doesn't exist so the response time doesn't reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk || !user.isActive) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.issueToken(user);
  }

  async issueToken(user: Pick<User, 'id' | 'email' | 'fullName' | 'isPlatformAdmin'>) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('jwt.expiresIn', { infer: true }),
      user: { id: user.id, email: user.email, fullName: user.fullName, isPlatformAdmin: user.isPlatformAdmin },
    };
  }

  async me(user: AuthUser) {
    return {
      ...user,
      memberships: await this.access.listMemberships(user.id),
    };
  }
}
