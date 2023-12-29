import { useSyncExternalStore } from 'use-sync-external-store/shim';
import { useEffect, useRef } from 'react';
import { endBatch, globalState, startBatch } from './global';
import { IStoreApi } from "./core";

export class ObserverContext<S> {
  private state = {
    storeMap: new Map<IStoreApi<S>, Set<string>>(),
  };

  public startTrack = () => {
    this.destory();
    this.state.storeMap = new Map<IStoreApi<S>, Set<string>>();
  };

  public subscribe = listener => {
    const stores = Array.from(this.state.storeMap.keys());
    const unSubscribes = stores.map(api => api.subscribe(listener));
    return () => unSubscribes.map(f => f());
  };

  public getState = () => this.state;

  public prepareUpdate = () => {
    this.state = { ...this.state };
  };

  public destory = () => {
    this.state.storeMap.forEach((_, store) => {
      store.observers?.delete(this);
    });
  }
}

export const Observer = ({ children, ...props }, ref) => {
  return observer(children)(props, ref);
};

export const observer = render => {
  return (props: any, ref: any) => {
    const observerContext = useRef(new ObserverContext()).current;

    useEffect(() => () => observerContext.destory(), []);

    const prev = startBatch(observerContext)
    const renderResult = render(props, ref);
    endBatch(prev);

    useSyncExternalStore(
      observerContext.subscribe, 
      observerContext.getState, 
      observerContext.getState
    );

    return renderResult;
  };
};

