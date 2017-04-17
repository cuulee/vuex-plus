'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

exports.default = function (store) {
  store.api = {};
  store.namespaced = true;

  if (store.getters) {
    store.api.get = {};
    (0, _keys2.default)(store.getters).forEach(function (name) {
      store.api.get[name] = store.name + '/' + name;
    });
  }

  if (store.actions) {
    store.api.act = {};
    (0, _keys2.default)(store.actions).forEach(function (name) {
      store.api.act[name] = store.name + '/' + name;
    });
  }

  if (store.mutations) {
    store.api.mutate = {};
    (0, _keys2.default)(store.mutations).forEach(function (name) {
      store.api.mutate[name] = store.name + '/' + name;
    });
  }

  if (store.modules) {
    (0, _keys2.default)(store.modules).forEach(function (name) {
      store.api[name] = addModuleToNames(store.name, store.modules[name].api);
    });
  }

  return store;
};

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function addModuleToNames(name, subapi) {
  var result = {};
  (0, _keys2.default)(subapi).forEach(function (type) {
    if (type === 'get' || type === 'act' || type === 'mutate') {
      result[type] = {};
      (0, _keys2.default)(subapi[type]).forEach(function (pathName) {
        var path = subapi[type][pathName];
        result[type][pathName] = name + '/' + path;
      });
    } else {
      result[type] = addModuleToNames(name, subapi[type]);
    }
  });
  return result;
}