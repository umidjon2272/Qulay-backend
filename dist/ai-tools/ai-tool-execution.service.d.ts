import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AIToolRegistryService } from './ai-tool-registry.service';
import { AIToolConfirmationRequired, AIToolExecutionSuccess } from './types/ai-tool.types';
export declare class AIToolExecutionService {
    private readonly registry;
    constructor(registry: AIToolRegistryService);
    execute(userId: string, request: ExecuteToolDto, contextOptions?: {
        locale?: string;
        timezone?: string;
        requestId?: string;
    }): Promise<AIToolExecutionSuccess | AIToolConfirmationRequired>;
}
