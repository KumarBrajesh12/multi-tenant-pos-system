import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { assertRoleScope } from '../access/role-scope';
import { Role } from '../access/role.enum';
import { TenantContext } from '../access/tenant-context';
import { AuthService } from '../auth/auth.service';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { AppConfig } from '../config/configuration';
import { User } from '../users/entities/user.entity';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitation.dto';
import { Invitation } from './entities/invitation.entity';
import { InvitationsRepository } from './invitations.repository';
import { MembershipsRepository } from './memberships.repository';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface NewInvitation {
  merchantId: string;
  storeId: string | null;
  email: string;
  role: Role;
  invitedByUserId: string | null;
}

/**
 * How users join a merchant. An admin (or a manager, for cashiers in their own store)
 * creates an invitation; the response contains a one-time token. There is no mail
 * service in this project, so the token is returned to the caller - in production it
 * would be emailed as a link and never shown in the API.
 */
@Injectable()
export class InvitationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly invitations: InvitationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async invite(tenant: TenantContext, dto: CreateInvitationDto) {
    const storeId = dto.storeId ?? null;
    assertRoleScope(dto.role, storeId);

    if (tenant.role === Role.STORE_MANAGER) {
      const ownStore = storeId !== null && tenant.storeIds !== 'ALL' && tenant.storeIds.includes(storeId);
      if (dto.role !== Role.CASHIER || !ownStore) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'INSUFFICIENT_PERMISSION',
          'Store managers can only invite cashiers to their own store',
        );
      }
    }

    return this.db.transaction(async (em) => {
      if (storeId) await this.assertStoreInMerchant(em, tenant.merchantId, storeId);
      return this.createInvitation(em, {
        merchantId: tenant.merchantId,
        storeId,
        email: dto.email,
        role: dto.role,
        invitedByUserId: tenant.userId,
      });
    });
  }

  // also used by the platform API to invite the first owner of a new merchant
  async createInvitation(em: EntityManager, data: NewInvitation) {
    const existingUser = await em.getRepository(User).findOne({ where: { email: data.email } });
    if (existingUser && (await this.memberships.exists(em, existingUser.id, data.merchantId, data.storeId))) {
      throw new AppException(HttpStatus.CONFLICT, 'ALREADY_MEMBER', 'This user already has access with that scope');
    }

    await this.invitations.revokeOpen(em, data.merchantId, data.email, data.storeId);

    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.config.get('invitations.ttlHours', { infer: true });
    const invitation = await this.invitations.create(em, {
      ...data,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlHours * 3600_000),
    });

    return { ...this.toView(invitation), inviteToken: token };
  }

  async listOpen(tenant: TenantContext) {
    const rows = await this.invitations.listOpen(tenant.merchantId);
    return rows.map((i) => this.toView(i));
  }

  async revoke(tenant: TenantContext, invitationId: string): Promise<void> {
    const invitation = await this.invitations.findOpen(tenant.merchantId, invitationId);
    if (!invitation) throw new ResourceNotFoundException('Invitation');
    await this.invitations.revoke(invitation.id);
  }

  /**
   * Public endpoint. New email -> account is created with the given name/password.
   * Existing account -> the current password must be given, so a leaked token can't be
   * used to attach someone else's account. Either way the user is logged in afterwards.
   */
  async accept(dto: AcceptInvitationDto) {
    const result = await this.db.transaction(async (em) => {
      const invitation = await this.invitations.findOpenByTokenHashForUpdate(em, hashToken(dto.token));
      if (!invitation || !(await this.isTargetActive(em, invitation))) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'INVITATION_INVALID', 'Invitation is invalid or has expired');
      }

      const users = em.getRepository(User);
      let user = await users
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.email = :email', { email: invitation.email })
        .getOne();

      if (user) {
        if (!user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
          throw new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password');
        }
      } else {
        if (!dto.fullName) {
          throw new AppException(HttpStatus.BAD_REQUEST, 'FULL_NAME_REQUIRED', 'fullName is required for a new account');
        }
        user = await users.save(
          users.create({
            email: invitation.email,
            fullName: dto.fullName,
            passwordHash: await bcrypt.hash(dto.password, 10),
          }),
        );
      }

      await this.memberships.insertIfAbsent(em, {
        userId: user.id,
        merchantId: invitation.merchantId,
        storeId: invitation.storeId,
        role: invitation.role,
      });
      await this.invitations.markAccepted(em, invitation.id, user.id);

      return {
        user,
        membership: { merchantId: invitation.merchantId, storeId: invitation.storeId, role: invitation.role },
      };
    });

    return { ...(await this.auth.issueToken(result.user)), membership: result.membership };
  }

  private async assertStoreInMerchant(em: EntityManager, merchantId: string, storeId: string): Promise<void> {
    const rows = await em.query(`SELECT 1 FROM stores WHERE id = $1 AND merchant_id = $2 AND is_active`, [
      storeId,
      merchantId,
    ]);
    if (rows.length === 0) throw new ResourceNotFoundException('Store');
  }

  private async isTargetActive(em: EntityManager, invitation: Invitation): Promise<boolean> {
    const rows = await em.query(
      `SELECT 1 FROM merchants mer
         LEFT JOIN stores s ON s.id = $2
        WHERE mer.id = $1 AND mer.is_active AND ($2::uuid IS NULL OR s.is_active)`,
      [invitation.merchantId, invitation.storeId],
    );
    return rows.length > 0;
  }

  private toView(i: Invitation) {
    return {
      id: i.id,
      merchantId: i.merchantId,
      storeId: i.storeId,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    };
  }
}
