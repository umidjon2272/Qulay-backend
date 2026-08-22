import { MessageRole } from '@prisma/client';
export declare class CreateMessageDto {
    role?: MessageRole;
    content: string;
}
