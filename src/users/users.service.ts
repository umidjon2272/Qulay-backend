import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { assertValidTimezone } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, toPublicUser, UserProfileUpdate } from './types/public-user.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toPublicUser(user) : null;
  }

  async findByEmail(email: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? toPublicUser(user) : null;
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    timezone?: string;
    language?: string;
  }): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.create({ data });
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException('Unable to create user');
    }
  }

  async updateBasicProfile(id: string, data: UserProfileUpdate): Promise<PublicUser> {
    if (data.timezone) {
      assertValidTimezone(data.timezone);
    }
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('User was not found');
      }
      throw new InternalServerErrorException('Unable to update user profile');
    }
  }
}
