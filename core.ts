import { useRef } from 'react';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { globalState } from './global';
import { ObserverContext } from './observer';

export interface IStoreApi<S> extends UseBoundStore<StoreApi<S>> {
  observers: Set<ObserverContext<S>>;
}

export const createStore = <S>(initValues?: S) => {
  const store = create<S>(() => initValues);
  Object.assign(store, { observers: new Set<ObserverContext<S>>() });
  return proxyStore(store as IStoreApi<S>);
};

export const createLocalStore = <S>(initValues?: S) => {
  const { store } = useRef({
    store: createStore(initValues),
  }).current;

  return store;
};

const SymbolProxyed = Symbol('proxyed');
const ProxyConstructor = new Proxy(Proxy, {
  construct: function (target, args) {
    // @ts-ignore
    const result = new target(...args);
    Object.defineProperty(result, SymbolProxyed, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    return result;
  },
});

const proxyStore = <S>(store: IStoreApi<S>) => {
  const state = store.getState();

  if (!state || typeof state != 'object') {
    throw Error(`initValues of createStore must be a non empty object`);
  }

  const getDepsFromGlobal = (store: IStoreApi<S>) => {
    const currentObserverContext = globalState.currentObserverContext;
    if (!currentObserverContext) {
      return null;
    }

    const { storeMap } = currentObserverContext.getState();
    if (!storeMap.has(store)) {
      storeMap.set(store, new Set());
      store.observers.add(currentObserverContext);
    }

    return storeMap.get(store);
  };

  const dispatch = path => {
    store.observers?.forEach(rc => {
      const deps = rc.getState()?.storeMap?.get(store);
      if (deps?.has(path)) {
        rc.prepareUpdate();
      }
    });
    store.setState({});
  };

  const build = (state, path) => {
    if (!state) {
      return state;
    }
    if (typeof state != 'object') {
      return state;
    }
    if (state.hasOwnProperty(SymbolProxyed)) {
      return state;
    }

    if (Array.isArray(state)) {
      const newState = state.map((el, idx) => build(el, `${path}[${idx}]`));
      return buildProxy(newState, path);
    }

    const newState = {};
    for (const [k, v] of Object.entries(state)) {
      const newPath = path ? `${path}.${k}` : k;
      Object.assign(newState, { [k]: build(v, newPath) });
    }
    return buildProxy(newState, path);
  };

  const buildProxy = (state, path) => {
    return new ProxyConstructor(state, {
      set: function (target, prop, value) {
        if (!target.hasOwnProperty(prop)) {
          return Reflect.set(target, prop, value);
        }

        const _set = () => {
          const newPath = path ? `${path}.${prop.toString()}` : prop.toString();
          const bool = Reflect.set(target, prop, build(value, newPath));
          dispatch(newPath);
          return bool;
        };

        if (globalState.currentObserverContext) {
          console.warn(`trigger rendering again during rendering`);
        }
        return _set();
      },

      get: function (target, prop) {
        if (!target.hasOwnProperty(prop)) {
          return Reflect.get(target, prop);
        }
        
        const newPath = path ? `${path}.${prop.toString()}` : prop.toString();
        const deps = getDepsFromGlobal(store);
        deps?.add(newPath);
        return Reflect.get(target, prop);
      },

      deleteProperty: function (target, prop) {
        if (!target.hasOwnProperty(prop)) {
          return Reflect.deleteProperty(target, prop);
        }

        const _deleteProperty = () => {
          const newPath = path ? `${path}.${prop.toString()}` : prop.toString();
          const bool = Reflect.deleteProperty(target, prop);
          dispatch(newPath);
          return bool;
        }

        if (globalState.currentObserverContext) {
          console.warn(`trigger rendering again during rendering`);
        }
        return _deleteProperty();
      },
    });
  };

  return build(state, '') as S;
};
