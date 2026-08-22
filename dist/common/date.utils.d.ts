export declare function parseDateTime(value: string): Date;
export declare function assertValidTimezone(timezone: string): void;
export declare function assertDateKey(value: string): void;
export declare function utcDayRange(dateKey: string): {
    start: Date;
    end: Date;
};
export declare function zonedDayRange(dateKey: string, timezone: string): {
    start: Date;
    end: Date;
};
export declare function dateKeyInTimezone(date: Date, timezone: string): string;
export declare function monthRangeUtc(date?: Date): {
    start: Date;
    end: Date;
};
