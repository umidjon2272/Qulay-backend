"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIToolCategory = void 0;
exports.assertToolObject = assertToolObject;
const common_1 = require("@nestjs/common");
var AIToolCategory;
(function (AIToolCategory) {
    AIToolCategory["TASK"] = "TASK";
    AIToolCategory["REMINDER"] = "REMINDER";
    AIToolCategory["MEETING"] = "MEETING";
    AIToolCategory["NOTE"] = "NOTE";
    AIToolCategory["CONTACT"] = "CONTACT";
    AIToolCategory["MEMORY"] = "MEMORY";
    AIToolCategory["FINANCE"] = "FINANCE";
    AIToolCategory["TODAY"] = "TODAY";
    AIToolCategory["SYSTEM"] = "SYSTEM";
    AIToolCategory["GOOGLE"] = "GOOGLE";
    AIToolCategory["FILE"] = "FILE";
})(AIToolCategory || (exports.AIToolCategory = AIToolCategory = {}));
function assertToolObject(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new common_1.BadRequestException('Tool input must be an object');
    }
}
//# sourceMappingURL=ai-tool.types.js.map