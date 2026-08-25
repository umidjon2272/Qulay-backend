import { Api } from "../tl";
import type { TelegramClient } from "./TelegramClient";
export interface UpdateState {
    pts: number;
    qts: number;
    date: number;
    seq: number;
}
export declare class UpdateManager {
    state?: UpdateState;
    lastUpdateTime: number;
    private readonly client;
    private readonly globalPts;
    private globalPtsTimer?;
    private readonly channels;
    private readonly pendingSeq;
    private readonly recentMessageKeys;
    private readonly recentMessageQueue;
    private fetchingDifference;
    private failTimeoutS;
    private failRetryTimer?;
    private readonly channelFailTimeoutS;
    private readonly channelFailRetryTimers;
    private running;
    constructor(client: TelegramClient);
    start(): void;
    stop(): void;
    onUpdates(update: Api.TypeUpdate | Api.TypeUpdates): void;
    catchUp(): Promise<void>;
    ensureState(): Promise<void>;
    refreshFromState(state: {
        pts: number;
        qts: number;
        date: number;
        seq: number;
    }): void;
    isStale(): boolean;
    recoverIfStale(): Promise<void>;
    private handleContainer;
    private handleShortMessage;
    private feedUpdate;
    private dispatch;
    private isDuplicateMessage;
    private saveEntities;
    private collectEntities;
    private makeGlobalWaiter;
    private getOrCreateChannel;
    private scheduleCommonDifference;
    private fetchCommonDifference;
    private fetchDifferenceLoop;
    private processDifference;
    private drainPendingSeq;
    private fetchChannelDifference;
    private resolveChannel;
    private bumpFailTimeout;
    private bumpChannelFailTimeout;
}
