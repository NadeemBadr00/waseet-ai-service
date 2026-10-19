import { AsyncLocalStorage } from "node:async_hooks";
/** Propagates cancellation into existing domain services without accepting executable client fields. */
export const inferenceSignalStorage = new AsyncLocalStorage<AbortSignal>();
