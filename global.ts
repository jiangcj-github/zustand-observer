import { ObserverContext } from './observer';

export interface IGlobalState {
  currentObserverContext: ObserverContext<any>;
}

export const globalState: IGlobalState = {
  currentObserverContext: null,
};

export function startBatch(observerContext: ObserverContext<any>) {
  const prevObserverContext = globalState.currentObserverContext;

  globalState.currentObserverContext = observerContext;
  observerContext.startTrack();
  return prevObserverContext;
}

export function endBatch(prevObserverContext: ObserverContext<any>) {
  globalState.currentObserverContext = prevObserverContext;
}
