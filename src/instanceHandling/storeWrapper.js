/**
 * Private method that modifies magics strings to contain their parents
 */
function addModuleToNames(name, subapi) {
  const result = {};
  Object.keys(subapi).forEach((type) => {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      result[type] = {};
      Object.keys(subapi[type]).forEach((pathName) => {
        const path = subapi[type][pathName];
        result[type][pathName] = name + '/' + path;
      });
    } else {
      result[type] = addModuleToNames(name, subapi[type]);
    }
  });
  return result;
}


/**
 * Modify Vuex Module to contain an api with magic strings
 * Requirement: store.name has to be available
 * @param {Object} store - Vuex module store
 * @returns {Object} Store with added `api` parameter
 */
export default function (store) {
  store.api = {};
  store.namespaced = true;

  // Clone getters
  if (store.getters) {
    store.api.get = {};
    Object.keys(store.getters).forEach((name) => {
      store.api.get[name] = store.name + '/' + name;
    });
  }

  // Clone actions
  if (store.actions) {
    store.api.act = {};
    Object.keys(store.actions).forEach((name) => {
      store.api.act[name] = store.name + '/' + name;
    });
  }

  // Clone mutations
  if (store.mutations) {
    store.api.mutate = {};
    Object.keys(store.mutations).forEach((name) => {
      store.api.mutate[name] = store.name + '/' + name;
    });
  }

  // Clone modules
  if (store.modules) {
    Object.keys(store.modules).forEach((name) => {
      store.api[name] = addModuleToNames(store.name, store.modules[name].api);
    });
  }

  return store;
}
