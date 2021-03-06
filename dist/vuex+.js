import contextHmr from 'webpack-context-vuex-hmr';
import clone from 'clone';

/**
 * The api for all stores
 * The api is autogenerated once the module importer has been set
 * ```
 *   api.aStore.get.something => vuex magic string for vuex getter
 * ```
 */
var api = {};

/**
 * Get subtree from map matching key
 * TODO -- verify --
 */
function extractSubstoreApi(map, key) {
  var submodules = Object.keys(map).filter(function (k) { return k !== 'get' && k !== 'act' && k !== 'mutate'; });
  var keyIsInMap = submodules.indexOf(key) >= 0;

  if (keyIsInMap) {
    return map[key];
  }

  // TODO Speed up with some nice algorithm
  var result;
  submodules.forEach(function (submodule) {
    var searchResult = extractSubstoreApi(map[submodule], key);
    if (searchResult) {
      result = searchResult;
    }
  });

  return result;
}


var getFullPath = function (config) {
  var suffix = config.instance ? '$' + config.instance : '';
  var key = config.subpath.slice(config.subpath.indexOf('/') + 1);
  var getterKey = config.subpath.match(/[a-zA-Z]*/)[0];
  var localApi = api[config.vuexPlus.storeInstanceName];
  if (getterKey !== config.vuexPlus.baseStoreName) {
    localApi = extractSubstoreApi(api[config.vuexPlus.storeInstanceName], getterKey + suffix);
  }

  while (key.split('/').length > 1) {
    localApi = localApi[key.split('/')[0]];
    key = key.slice(key.split('/')[0].length + 1);
  }

  if (!localApi || !localApi[config.method]) {
    var instance = config.subpath.split('/')[0] + '$' + config.instance;
    console.error('[Vuex+ warn]: Cant find substore instance "' + instance + '" in "' + config.container + '"' +
                  ', when looking for', config.subpath, '. Api is:', api);
    return undefined;
  }

  return localApi[config.method][key];
};

function remapBaseStore(storeApi, baseStoreName, newStoreName) {
  newStoreName = newStoreName || baseStoreName;
  var result = {};
  Object.keys(storeApi).forEach(function (type) {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      result[type] = {};
      Object.keys(storeApi[type]).forEach(function (pathName) {
        result[type][pathName] = storeApi[type][pathName].replace(baseStoreName, newStoreName);
      });
    } else {
      result[type] = remapBaseStore(storeApi[type], baseStoreName, newStoreName);
    }
  });

  return result;
}

var getStoreInstanceName = function (storeName, instance) {
  if (instance) {
    return storeName + '$' + instance;
  }
  return storeName;
};

var toCamelCase = function (str) { return str.replace(/(-|_)([a-z])/g, function (s) { return s[1].toUpperCase(); }); };

var vuexInstance = {};

var handlers = [];

var registerForHMR = function (newStore, baseStoreName, storeInstanceName) {
  handlers.push({
    storeName: baseStoreName + '-store',
    storeInstanceName: storeInstanceName,
    newStore: newStore,
  });
};

var unregisterForHMR = function (newStore) {
  handlers = handlers.filter(function (h) { return h.newStore !== newStore; });
};

var hmrHandler = function (updatedModules) {
  var modules = {};
  Object.keys(updatedModules).forEach(function (key) {
    var storeName = toCamelCase(key.replace('-store', '')) + '-store';
    handlers
      .filter(function (handler) { return handler.storeName === storeName; })
      .forEach(function (handler) {
        modules[handler.storeInstanceName] = handler.newStore(updatedModules[key]);
      });

    Object.keys(modules).forEach(function (m) {
      api[m] = remapBaseStore(modules[m].$api, modules[m].name, m);
    });
    vuexInstance.store.hotUpdate({ modules: modules });
  });
};

/**
 * Create new namespaced store instance
 * @param {string} storeInstanceName - The full instance name
 * @param {string} instance - Instance name, same as in `instance="my-counter"`
 * @param {string} baseStoreName - The base store name, same as in `store({ name })`
 * @param {Object} store - The base store name, same as in `store({ name })`
 * @returns {Object} Vuex module store with submodules
 */
function newStore(storeInstanceName, instance, baseStoreName, store) {
  var resultingStore = {
    namespaced: true,
  };

  Object.assign(resultingStore, store);
  resultingStore.state = {};
  if (store.state) {
    resultingStore.state = clone(store.state, false);
  }
  resultingStore.state['vuex+'] = {};
  if (instance) {
    resultingStore.state['vuex+'].instance = instance;
  }
  resultingStore.state['vuex+'].storeName = baseStoreName;
  ['actions', 'getters', 'mutations'].forEach(function (type) {
    if (store[type]) {
      resultingStore[type] = {};
      Object.keys(store[type]).forEach(function (name) {
        var newName = name.replace(baseStoreName, storeInstanceName);
        resultingStore[type][newName] = store[type][name];
      });
    }
  });
  if (resultingStore.modules) {
    resultingStore.modules = {};
    Object.keys(store.modules).forEach(function (subInstanceName) {
      resultingStore.modules[subInstanceName] = newStore(storeInstanceName, instance, baseStoreName, store.modules[subInstanceName]); // eslint-disable-line
    });
  }

  return resultingStore;
}

var importer;

function setup(newImporter) {
  importer = newImporter;
}

/**
 * Add a new store instance
 * The Vue component gets two props:
 * - instance {string}: Contains the instance name
 * - preserve {boolean}: If true, the store wont be discarded when the final instance is destroyed
 * @param {string} baseStoreName - The base store name, same as the store filename
 * @param {Object} loadedModule - The loaded javascript module containing the Vuex module store
 * @returns {mixin, api} api for the loaded module and a mixin
 */
function add(baseStoreName) {
  var loadedModule = importer.getModules()[baseStoreName];
  var counter = {};
  function HmrHandler(instanceName, getNewInstanceStore) {
    return function (newLoadedModule) { return getNewInstanceStore(newLoadedModule); };
  }

  return {
    api: loadedModule.api,
    mixin: {
      props: ['instance', 'preserve'],
      created: function created() {
        var this$1 = this;

        baseStoreName = toCamelCase(baseStoreName.replace(/-store$/, ''));
        this['$vuex+'] = {
          baseStoreName: baseStoreName,
          storeInstanceName: getStoreInstanceName(baseStoreName, this.instance),
        };
        counter[this['$vuex+'].storeInstanceName] = counter[this['$vuex+'].storeInstanceName] || 0;
        counter[this['$vuex+'].storeInstanceName]++;

        var getNewInstanceStore = function (newLoadedModule) { return newStore(this$1['$vuex+'].storeInstanceName, this$1.instance,
                                                                baseStoreName, newLoadedModule); };

        var store = getNewInstanceStore(loadedModule);
        if (!this.$store._modules.root._children[this['$vuex+'].storeInstanceName]) { // eslint-disable-line
          this.$store.registerModule(this['$vuex+'].storeInstanceName, store);

          var remappedApi = remapBaseStore(store.$api, this['$vuex+'].baseStoreName, this['$vuex+'].storeInstanceName);
          api[this['$vuex+'].baseStoreName] = store.$api;
          api[this['$vuex+'].storeInstanceName] = remappedApi;

          if (module.hot) {
            this.$hmrHandler = new HmrHandler(this['$vuex+'].storeInstanceName, getNewInstanceStore);
            registerForHMR(this.$hmrHandler, baseStoreName, this['$vuex+'].storeInstanceName);
          }
        }
      },

      destroyed: function destroyed() {
        counter[this['$vuex+'].storeInstanceName]--;

        if (!this.preserve && counter[this['$vuex+'].storeInstanceName] === 0) {
          this.$store.unregisterModule(this['$vuex+'].storeInstanceName);

          if (module.hot) {
            unregisterForHMR(this.$hmrHandler);
          }
        }
      },
    },
  };
}

function setupVuexPlus($store) {
  vuexInstance.store = $store;
  var importer = contextHmr.getNewInstance();
  setup(importer);
  importer.getModules();
  importer.setupHMR(hmrHandler);
}

var getTagName = function (self) {
  var tag = '-unknown-';
  if (self.$parent) {
    var vnode = self.$parent.$vnode || self.$parent._vnode; // eslint-disable-line

    if (vnode && vnode.componentOptions && vnode.componentOptions.tag) {
      tag = vnode.componentOptions.tag;
    }
  }
  return tag;
};

var _map = {
  getters: function getters(m) {
    var result = {};
    Object.keys(m).forEach(function (key) {
      result[key] = function get() {
        var path = getFullPath({
          method: 'get',
          key: key,
          subpath: m[key],
          instance: this.instance,
          vuexPlus: this['$vuex+'],
          container: getTagName(this),
        });
        return this.$store.getters[path];
      };
    });
    return result;
  },

  actions: function actions(m) {
    var result = {};
    Object.keys(m).forEach(function (key) {
      result[key] = function dispatch(payload) {
        var path = getFullPath({
          method: 'act',
          key: key,
          subpath: m[key],
          instance: this.instance,
          vuexPlus: this['$vuex+'],
          container: getTagName(this),
        });
        return this.$store.dispatch(path, payload);
      };
    });
    return result;
  },
};

var getLocalPath = function (path, state) {
  var storeName = state['vuex+'].storeName;
  var instance = state['vuex+'].instance;
  return path.replace(storeName, getStoreInstanceName(storeName, instance));
};

/**
 * Method that returns a getter from the same instance.
 * @param {string} - Path as as string, usually from api. Eg. `api.example.get.something`
 * @param {Context} - Vuex context
 * @returns {any} - Value from Vuex getter
 */
var _global = {
  get api() {
    return clone(api);
  },

  get: function get(ref) {
    var path = ref.path;
    var context = ref.context;
    var state = ref.state;
    var local = ref.local;

    if (!state && !context) {
      console.error('Cant global.get without `store` or `context`');
    }
    if (local) {
      var localPath = getLocalPath(path, state || context.state);
      if (context) {
        return context.rootGetters[localPath];
      }
      return vuexInstance.store.getters[localPath];
    }

    if (context) {
      return context.rootGetters[path];
    }
    return vuexInstance.store.getters[path];
  },

  dispatch: function dispatch(ref) {
    var path = ref.path;
    var data = ref.data;
    var context = ref.context;
    var local = ref.local;

    if (!context) {
      console.error('Cant global.dispatch without `context`');
    }
    if (local) {
      var localPath = getLocalPath(path, context.state);
      return context.dispatch(localPath, data, { root: true });
    }

    return context.dispatch(path, data, { root: true });
  },

  commit: function commit(ref) {
    var path = ref.path;
    var data = ref.data;
    var context = ref.context;
    var local = ref.local;

    if (!context) {
      console.error('Cant global.commit without `context`');
    }
    if (local) {
      var localPath = getLocalPath(path, context.state);
      return context.commit(localPath, data, { root: true });
    }

    return context.commit(path, data, { root: true });
  },
};

/**
 * Private method that modifies magics strings to contain their parents
 * @param {Object} api - object tree with magic strings
 * @param {string} parentName - parentName
 * @returns {Object} all tree nodes have been padded with parentName '/'
 */
function addParentToPath(subapi, parentName) {
  var result = {};
  Object.keys(subapi).forEach(function (type) {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      result[type] = {};
      Object.keys(subapi[type]).forEach(function (pathName) {
        var path = subapi[type][pathName];
        result[type][pathName] = parentName + '/' + path;
      });
    } else {
      result[type] = addParentToPath(subapi[type], parentName);
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
var _store = function (store) {
  store.api = {};
  store.namespaced = true;

  var camelCasedName = toCamelCase(store.name);

  // Clone getters
  if (store.getters) {
    store.api.get = {};
    Object.keys(store.getters).forEach(function (name) {
      store.api.get[name] = camelCasedName + '/' + name;
    });
  }

  // Clone actions
  if (store.actions) {
    store.api.act = {};
    Object.keys(store.actions).forEach(function (name) {
      store.api.act[name] = camelCasedName + '/' + name;
    });
  }

  // Clone mutations
  if (store.mutations) {
    store.api.mutate = {};
    Object.keys(store.mutations).forEach(function (name) {
      store.api.mutate[name] = camelCasedName + '/' + name;
    });
  }

  // Clone modules
  if (store.modules) {
    Object.keys(store.modules).forEach(function (name) {
      store.api[name] = addParentToPath(store.modules[name].api, camelCasedName);
    });
  }

  store.$api = clone(store.api, false);

  return store;
};

var _newInstance = function (substore, instance) {
  var result = clone(substore);
  Object.keys(result.api).forEach(function (type) {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      Object.keys(result.api[type]).forEach(function (key) {
        result.api[type][key] = result.api[type][key].split('/')[0] + '$' + instance + '/' + key;
      });
    }
  });

  return result;
};

var _vuePluginInstall = {
  install: function install(Vue) {
    Vue.mixin({
      props: ['instance'],
      created: function created() {
        var this$1 = this;

        var findModuleName = function (parent) {
          if (!this$1['$vuex+'] && parent.$parent) {
            if (!parent.$parent['$vuex+']) {
              findModuleName(parent.$parent, '/');
            } else {
              this$1['$vuex+'] = {
                baseStoreName: parent.$parent['$vuex+'].baseStoreName,
                storeInstanceName: parent.$parent['$vuex+'].storeInstanceName,
              };
            }
          }
        };

        findModuleName(this, '/');
      },
    });
  },
};

var map = _map;
var store = _store;
var global = _global;
var addStore = add;
var hmrCallback = hmrHandler;
var newInstance = _newInstance;

var $store = vuexInstance.store;

var vuex_ = {
  vuePlugin: _vuePluginInstall,
  vuexPlugin: setupVuexPlus,
};

export { map, store, global, addStore, hmrCallback, newInstance, $store };export default vuex_;
