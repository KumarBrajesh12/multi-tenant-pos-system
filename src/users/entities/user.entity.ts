import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 320 })
  email: string;

  @Column({ name: 'password_hash', length: 100, select: false })
  passwordHash: string;

  @Column({ name: 'full_name', length: 200 })
  fullName: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // can create/suspend merchants; gives no access to any merchant's data by itself
  @Column({ name: 'is_platform_admin', default: false })
  isPlatformAdmin: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
