import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getMine(user: AuthenticatedUser): Promise<import("./types/public-user.type").PublicUser | null>;
    updateMine(user: AuthenticatedUser, dto: UpdateProfileDto): Promise<import("./types/public-user.type").PublicUser>;
}
