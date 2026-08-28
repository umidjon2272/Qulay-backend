"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = void 0;
const bcrypt = require("bcryptjs");
const hashPassword = (password, saltRounds) => bcrypt.hash(password, saltRounds);
exports.hashPassword = hashPassword;
//# sourceMappingURL=password-hash.js.map