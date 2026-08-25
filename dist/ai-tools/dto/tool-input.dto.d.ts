import { FinanceCurrency, FinanceTransactionType, MemoryType, MeetingStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { CreateContactDto } from '../../contacts/dto/create-contact.dto';
export declare class EmptyToolInput {
}
export declare class TodayPlanInput {
    date?: string;
}
export declare class TasksToolInput {
    status?: TaskStatus;
    priority?: TaskPriority;
    date?: string;
    search?: string;
    limit?: number;
}
export declare class RemindersToolInput {
    priority?: TaskPriority;
    date?: string;
    search?: string;
    limit?: number;
}
export declare class MeetingsToolInput {
    date?: string;
    from?: string;
    to?: string;
    status?: MeetingStatus;
    limit?: number;
}
export declare class NotesToolInput {
    search?: string;
    limit?: number;
}
export declare class SearchContactsToolInput {
    query: string;
    limit?: number;
}
export declare class ContactHistoryToolInput {
    contactId: string;
}
export declare class RelevantMemoriesToolInput {
    query: string;
    type?: MemoryType;
    limit?: number;
}
export declare class FinanceSummaryToolInput {
    from: string;
    to: string;
    currency: FinanceCurrency;
}
export declare class TodayFinanceToolInput {
    currency?: FinanceCurrency;
}
export declare class SearchTelegramChatsToolInput {
    query: string;
    limit?: number;
}
export declare class SendTelegramMessageToolInput {
    peerId: string;
    text: string;
}
export declare class GetGoogleCalendarEventsToolInput {
    from: string;
    to: string;
    calendarId?: string;
}
export declare class CreateGoogleCalendarEventToolInput {
    title: string;
    start: string;
    end: string;
    description?: string;
    attendees?: string[];
    location?: string;
    calendarId?: string;
}
export declare class UpdateGoogleCalendarEventToolInput {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    description?: string;
    attendees?: string[];
    location?: string;
    calendarId?: string;
}
export declare class DeleteGoogleCalendarEventToolInput {
    eventId: string;
    calendarId?: string;
}
export declare class SearchGoogleDriveFilesToolInput {
    query: string;
    mimeType?: string;
    limit?: number;
}
export declare class SearchFilesToolInput {
    query: string;
    mimeType?: string;
    folderId?: string;
    source?: 'UPLOAD' | 'GOOGLE_DRIVE' | 'TELEGRAM' | 'SYSTEM';
    limit?: number;
}
export declare class GetFileMetadataToolInput {
    fileId: string;
}
export declare class CompareFinancePeriodsToolInput {
    currentFrom: string;
    currentTo: string;
    previousFrom: string;
    previousTo: string;
    currency: FinanceCurrency;
}
export declare class CreateTaskToolInput {
    title: string;
    description?: string;
    dueAt?: string;
    priority?: TaskPriority;
}
export declare class CreateReminderToolInput {
    title: string;
    remindAt: string;
    note?: string;
}
export declare class CreateMeetingToolInput {
    title: string;
    startAt: string;
    endAt?: string;
    contactId?: string;
    location?: string;
    notes?: string;
}
export declare class CreateNoteToolInput {
    title?: string;
    content: string;
    contactId?: string;
}
export declare class CreateContactToolInput extends CreateContactDto {
}
export declare class SaveMemoryToolInput {
    type: MemoryType;
    key: string;
    value: string;
    importance?: number;
    contactId?: string;
}
export declare class CreateFinanceTransactionToolInput {
    type: FinanceTransactionType;
    amount: string;
    currency: FinanceCurrency;
    title: string;
    categoryId?: string;
    contactId?: string;
    transactionDate?: string;
    description?: string;
}
