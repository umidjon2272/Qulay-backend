import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteQueryDto } from './dto/note-query.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
export declare class NotesService {
    private readonly prisma;
    private readonly activityLog;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
    listForUser(userId: string, query: NoteQueryDto): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            content: string;
            title: string;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        content: string;
        title: string;
    }>;
    createForUser(userId: string, dto: CreateNoteDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        content: string;
        title: string;
    }>;
    updateForUser(userId: string, id: string, dto: UpdateNoteDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        content: string;
        title: string;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
}
