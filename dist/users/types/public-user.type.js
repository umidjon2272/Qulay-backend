"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatus = exports.UserRole = void 0;
exports.toPublicUser = toPublicUser;
const client_1 = require("@prisma/client");
Object.defineProperty(exports, "UserRole", { enumerable: true, get: function () { return client_1.UserRole; } });
Object.defineProperty(exports, "UserStatus", { enumerable: true, get: function () { return client_1.UserStatus; } });
function toPublicUser(user) {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
}
//# sourceMappingURL=public-user.type.js.map