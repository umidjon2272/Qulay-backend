"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
const public_user_type_1 = require("./types/public-user.type");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findById(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        return user ? (0, public_user_type_1.toPublicUser)(user) : null;
    }
    async findByEmail(email) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        return user ? (0, public_user_type_1.toPublicUser)(user) : null;
    }
    async findByEmailWithPassword(email) {
        return this.prisma.user.findUnique({ where: { email } });
    }
    async findByIdWithPassword(id) {
        return this.prisma.user.findUnique({ where: { id } });
    }
    async create(data) {
        try {
            const user = await this.prisma.user.create({ data });
            return (0, public_user_type_1.toPublicUser)(user);
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('Email is already registered');
            }
            throw new common_1.InternalServerErrorException('Unable to create user');
        }
    }
    async updateBasicProfile(id, data) {
        if (data.timezone) {
            (0, date_utils_1.assertValidTimezone)(data.timezone);
        }
        try {
            const user = await this.prisma.user.update({
                where: { id },
                data,
            });
            return (0, public_user_type_1.toPublicUser)(user);
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new common_1.NotFoundException('User was not found');
            }
            throw new common_1.InternalServerErrorException('Unable to update user profile');
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map