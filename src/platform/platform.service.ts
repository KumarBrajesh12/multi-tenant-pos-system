import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from '../access/role.enum';
import { AuthUser } from '../auth/auth.types';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { isUniqueViolation } from '../common/utils/db';
import { InvitationsService } from '../members/invitations.service';
import { Merchant } from '../merchants/entities/merchant.entity';
import { CreateMerchantDto, UpdateMerchantDto } from './dto/merchant.dto';

const toMerchantView = (m: Merchant) => ({
  id: m.id,
  name: m.name,
  slug: m.slug,
  currency: m.currency,
  isActive: m.isActive,
  createdAt: m.createdAt,
});

@Injectable()
export class PlatformService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly invitations: InvitationsService,
  ) {}

  // creates the merchant and invites its first admin in one transaction
  async createMerchant(admin: AuthUser, dto: CreateMerchantDto) {
    try {
      return await this.db.transaction(async (em) => {
        const repo = em.getRepository(Merchant);
        const merchant = await repo.save(
          repo.create({ name: dto.name, slug: dto.slug, currency: dto.currency ?? 'USD' }),
        );
        const ownerInvitation = await this.invitations.createInvitation(em, {
          merchantId: merchant.id,
          storeId: null,
          email: dto.ownerEmail,
          role: Role.MERCHANT_ADMIN,
          invitedByUserId: admin.id,
        });
        return { ...toMerchantView(merchant), ownerInvitation };
      });
    } catch (err) {
      if (isUniqueViolation(err, 'uq_merchants_slug')) {
        throw new AppException(HttpStatus.CONFLICT, 'MERCHANT_SLUG_EXISTS', `Slug ${dto.slug} is already taken`);
      }
      throw err;
    }
  }

  async listMerchants(query: PaginationQueryDto) {
    const [rows, [{ count }]] = await Promise.all([
      this.db.query(
        `SELECT m.id, m.name, m.slug, m.currency, m.is_active AS "isActive", m.created_at AS "createdAt",
                (SELECT count(*)::int FROM stores s WHERE s.merchant_id = m.id) AS "storeCount",
                (SELECT count(DISTINCT user_id)::int FROM memberships ms WHERE ms.merchant_id = m.id) AS "memberCount"
           FROM merchants m
          ORDER BY m.name, m.id
          LIMIT $1 OFFSET $2`,
        [query.limit, query.offset],
      ),
      this.db.query(`SELECT count(*)::int AS count FROM merchants`),
    ]);
    return paginate(rows, count, query);
  }

  async updateMerchant(merchantId: string, dto: UpdateMerchantDto) {
    const repo = this.db.getRepository(Merchant);
    const merchant = await repo.findOne({ where: { id: merchantId } });
    if (!merchant) throw new ResourceNotFoundException('Merchant');
    Object.assign(merchant, dto);
    return toMerchantView(await repo.save(merchant));
  }
}
