/**
 * The api for all stores
 * The api is autogenerated once the module importer has been set
 * ```
 *   api.aStore.get.something => vuex magic string for vuex getter
 * ```
 */
export const api = {};

// /**
//  * Set the importer that can read all stores via require.context
//  */
//
// export const generateAPI = (newImporter) => {
//   importer = newImporter;
//   const modules = importer.getModules();
//   Object.keys(modules).forEach((module) => {
//     const camelCasedName = toCamelCase(modules[module].name);
//     api[camelCasedName] = modules[module].$api;
//   });
// };

/**
 * Private method that modifies magics strings to contain their parents
 */
export function addModuleToNames(name, subapi) {
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

export function remapBaseStore(storeApi, baseStoreName, newStoreName) {
  newStoreName = newStoreName || baseStoreName;
  const result = {};
  Object.keys(storeApi).forEach((type) => {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      result[type] = {};
      Object.keys(storeApi[type]).forEach((pathName) => {
        result[type][pathName] = storeApi[type][pathName].replace(baseStoreName, newStoreName);
      });
    } else {
      result[type] = remapBaseStore(storeApi[type], baseStoreName, newStoreName);
    }
  });

  return result;
}
