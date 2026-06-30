// ../lsp-core/src/request-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
var storage = new AsyncLocalStorage;
function runWithRequestContext(context, fn) {
  return storage.run(context, fn);
}
function contextCwd() {
  return storage.getStore()?.cwd ?? process.cwd();
}
function contextEnv(key) {
  const store = storage.getStore();
  if (store?.env)
    return store.env[key];
  return process.env[key];
}
export {
  runWithRequestContext,
  contextEnv,
  contextCwd
};
