import { IsUUID } from 'class-validator';
import { UpdateTaskDto } from '../../tasks/dto/update-task.dto';
import { UpdateReminderDto } from '../../reminders/dto/update-reminder.dto';
import { UpdateMeetingDto } from '../../meetings/dto/update-meeting.dto';
import { UpdateNoteDto } from '../../notes/dto/update-note.dto';
import { UpdateFinanceTransactionDto } from '../../finance/dto/update-finance-transaction.dto';

export class EntityToolInput { @IsUUID('4') id!: string; }
export class UpdateTaskToolInput extends UpdateTaskDto { @IsUUID('4') id!: string; }
export class UpdateReminderToolInput extends UpdateReminderDto { @IsUUID('4') id!: string; }
export class UpdateMeetingToolInput extends UpdateMeetingDto { @IsUUID('4') id!: string; }
export class UpdateNoteToolInput extends UpdateNoteDto { @IsUUID('4') id!: string; }
export class UpdateTransactionToolInput extends UpdateFinanceTransactionDto { @IsUUID('4') id!: string; }
