export declare class ExecuteToolDto {
    tool: string;
    input: Record<string, unknown>;
    confirmed: boolean;
    requestId?: string;
    idempotencyKey?: string;
}
