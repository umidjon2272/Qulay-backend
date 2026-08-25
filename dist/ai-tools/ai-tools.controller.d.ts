import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AIToolExecutionService } from './ai-tool-execution.service';
import { AIToolRegistryService } from './ai-tool-registry.service';
import { ExecuteToolDto } from './dto/execute-tool.dto';
export declare class AIToolsController {
    private readonly registry;
    private readonly execution;
    constructor(registry: AIToolRegistryService, execution: AIToolExecutionService);
    list(): Pick<import("./types/ai-tool.types").AIToolMetadata, "name" | "category" | "requiresConfirmation" | "sideEffect">[];
    execute(user: AuthenticatedUser, request: ExecuteToolDto): Promise<import("./types/ai-tool.types").AIToolExecutionSuccess | import("./types/ai-tool.types").AIToolConfirmationRequired>;
}
