export declare const MAX_PAGE_SIZE = 100;
export declare class PaginationQueryDto {
    page: number;
    limit: number;
}
export type PaginationMeta = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};
export declare function paginationMeta(page: number, limit: number, total: number): PaginationMeta;
export declare function paginationSkip(page: number, limit: number): number;
