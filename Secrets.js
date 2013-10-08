(function(global, Object, String, Error, TypeError) {

	'use strict';

	if (Object(global) !== global)
		throw new Error('Expected global object');

	var DEFAULT_STORAGE_TYPE = 'WeakKeyedStore';

	function Secrets(config) {

		if (config === undefined) {
			config = Object.create(null);
		} else if (Object(config) !== config) {
			throw new TypeError('Object expected');
		}

		var storageType = 'storageType' in config ? String(config.storageType) : DEFAULT_STORAGE_TYPE,

			// We capture the built-in functions and methods as they are now and store them as references so that we can
			// maintain some integrity. This is done to prevent scripts which run later from mischievously trying to get
			// details about or alter the secrets stored on an object.
			lazyBind = Function.prototype.bind.bind(Function.prototype.call),

			create = Object.create,
			getPrototypeOf = Object.getPrototypeOf,
			keys = Object.keys,
			getOwnPropertyNames = Object.getOwnPropertyNames,
			getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
			isExtensible = Object.isExtensible,
			freeze = Object.freeze,

			hasOwn = lazyBind(Object.prototype.hasOwnProperty),

			push = lazyBind(Array.prototype.push),
			forEach = lazyBind(Array.prototype.forEach),
			map = lazyBind(Array.prototype.map),
			join = lazyBind(Array.prototype.join),
			splice = lazyBind(Array.prototype.splice),
			ArrayIndexOf = lazyBind(Array.prototype.indexOf),

			fromCharCode = String.fromCharCode,

			apply = lazyBind(Function.prototype.apply),
			bind = lazyBind(Function.prototype.bind),

			// We only want to define with own properties of the descriptor.
			define = (function(defineProperty) {
				return function define(obj, name, desc) {
					if ('value' in desc && !hasOwn(desc, 'value')
						|| 'get' in desc && !hasOwn(desc, 'get')
						|| 'set' in desc && !hasOwn(desc, 'set')
						|| 'enumerable' in desc && !hasOwn(desc, 'enumerable')
						|| 'writable' in desc && !hasOwn(desc, 'writable')
						|| 'configurable' in desc && !hasOwn(desc, 'configurable'))
						desc = createSafeDescriptor(desc);
					return defineProperty(obj, name, desc);
				};
				function createSafeDescriptor(obj) {
					if (obj == null) {
						locked = true;
						throw new TypeError('Argument cannot be null or undefined.');
					}
					obj = Object(obj);
					var O = create(null),
						k = keys(obj);
					for (var i = 0, key = k[i]; key = k[i], i < k.length; i++)
						O[key] = obj[key];
					return O;
				}
			})(Object.defineProperty);

		var CouplerFactory = (function() {
	
	var createStore = function() {
			throw new Error('No store has been configured.');
		},

		mixin = function mixin(target, source) {
			forEach(getOwnPropertyNames(source), function(name) {
				define(target, name, getOwnPropertyDescriptor(source, name));
			});
			return target;
		},

		protoIsMutable = (function() {
			// TODO: Keep up-to-date with whether ES6 goes with __proto__ or Reflect.setPrototypeOf.
			var A = { },
				A2 = { },
				B = create(A);
			B.__proto__ = A2;
			return getPrototypeOf(B) === A2;
		})(),
		setPrototypeOf = Object.setPrototypeOf || (function() {

			if (!protoIsMutable)
				return;

			// It is now believed ES6 will allow the setter on `__proto__` to work on any object form any realm.
			var protoDesc = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
				_setProto = protoDesc && protoDesc.set;
			if (typeof _setProto == 'function')
				return lazyBind(_setProto);

			// If the implementation supports mutable proto but doesn't have a __proto__ setter, see if
			// mutable proto is possible on objects which don't inherit from Object.prototype.
			// This behavior has been observed on Chrome 25-27 but is believed to be fixed on a later V8.
			// https://mail.mozilla.org/pipermail/es-discuss/2013-March/029244.html
			// However, the version of V8 mentioned in the above post does not support __proto__ setter.
			// It is believed a later version of V8 will support a __proto__ setter, but for interim
			// implementations it may be impossible to mutate [[Prototype]] on an object which doesn't
			// inherit from `Object.prototype`.
			var A = create(null),
				B = create(null);
			A.test = 5;
			try {
				B.__proto__ = A;
			} catch(x) { }
			if (B.test === 5)
				return function(obj, proto) {
					obj.__proto__ = proto;
				};

			return function() {
				locked = true;
				throw new Error(
					'Mutable prototype is supported by this implementation, but it does not support mutating the prototype '
					+ 'of an object which doesn\'t inherit from Object.prototype.'
				);
			};

		})(),

		configureStorage = function configureStorage(storeGenerator) {
			if (typeof storeGenerator != 'function')
				throw new TypeError('Function expected for argument `storeGenerator`.');
			createStore = storeGenerator;
			return createStore;
		},

		createCoupler = function createCoupler() {

			var store = createStore();

			return function coupler(obj) {
				var S = store.get(obj),
					proto, protoS, protoSTest;
				if (!S) {
					proto = getPrototypeOf(obj);
					store.set(obj, S = create(proto ? coupler(proto) : null));
				} else if (protoIsMutable) {
					proto = getPrototypeOf(obj);
					protoS = getPrototypeOf(S);
					protoSTest = proto == null ? null : coupler(proto);
					// If the prototype on the object has changed, then change the secret's
					// prototype to reflect this.
					if (protoSTest !== protoS)
						try {
							setPrototypeOf(S, protoSTest);
						} catch(x) {
							// This could occur under some circumstances. For ES6 compliant implementations, it should not
							// occur (assuming the __proto__ setter is allowed to work cross-realm, as is expected).
							// Likewise, in ES5 implementations without the __proto__ extension, there's no problem because
							// mutable proto is not supported.
							// However, many of the ES5 browsers which have the __proto__ extension have implemented it in
							// ways that may not provide a __proto__ setter or may not support cross-realm setting or setting
							// on objects which don't inherit from Object.prototype.
							// The fallback is to generate a new object which has the same properties as `S` and
							// then return that.  This is a little hacky because we don't actually end up preserving
							// object identity across the same secrets, and it could cause certain situations to
							// break, such as using secrets as keys in a WeakMap, or some other place where object
							// identity of secrets matters.  However, it is so unlikely that the two conditions
							// necessary to cause problems here will occur together (since both are by themselves
							// edge-case scenarios), we are happy enough with this solution, since it is the best
							// we can do given the direction ES6 is going.
							store.set(S = mixin(create(protoSTest), S));
						}
				}
				return S;
			};

		};

	return {
		configureStorage: configureStorage,
		create: createCoupler
	};

})();
var WeakKeyedStoreFactory = (function() {

	var locked = true,
		valid = false,

		// ES6? TODO: Keep up with this.
		getPropertyNames = Object.getPropertyNames,
		getPropertyDescriptors = Object.getPropertyDescriptors,
		getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors,
		_Proxy = typeof Proxy == 'undefined' ? undefined : Proxy,

		MIN_PRECISION = -Math.pow(2, 53),
		MAX_PRECISION = -MIN_PRECISION,
		// idNum will ensure identifiers are unique.
		idNum = (function() {
			// Use an Array-like rather than a true array to protect against setters defined on Array.prototype indices.
			var idNum = create(null);
			idNum[0] = MIN_PRECISION;
			idNum.length = 1;
			return idNum;
		})(),

		random = getRandomGenerator(),

		PARALLEL_KEY = '||:' + getIdentifier();

	function StoreGet(obj, parallelId) {
		if (Object(obj) !== obj)
			throw new TypeError('Object expected for `obj`. Received "' + obj + '"');
		var P = getParallels(obj);
		return P[parallelId];
	}

	function StoreSet(obj, parallelId, value) {
		if (Object(obj) !== obj)
			throw new TypeError('Object expected for `obj`. Received "' + obj + '"');
		var P = getParallels(obj);
		return P[parallelId] = value;
	}

	function getParallels(obj) {

		var D = getOwnPropertyDescriptor(obj, PARALLEL_KEY),
			F, P;

		if (!D)
			return setupParallels(obj);
		else if (!hasOwn(D, 'value') || typeof D.value != 'function')
			throw new Error('Parallel object support has been compromised.');

		F = D.value;
		
		locked = false;
		try {
			P = F();
			locked = true;
		} catch(x) {
			locked = true;
			valid = false;
			throw new Error('Parallel object support has been compromised');
		}

		if (!valid)
			throw new Error('Parallel object support has been compromised');
		valid = false;

		return P;

	}

	function setupParallels(obj) {
		var P = create(null);
		define(obj, PARALLEL_KEY, {
			value: function() {
				if (locked) {
					valid = false;
					throw new Error('Parallel object locked.');
				}
				valid = true;
				locked = true;
				return P;
			},
			enumerable: false,
			writable: false,
			configurable: false
		});
		return P;
	}

	function getRandStrs(count, length) {
		var r = create(null);
		r.length = 0;
		for(var i = 0; i < count; i++) {
			push(r, getRandStr(length));
		}
		return r;
	}

	function getRandStr(length) {
		var s = '';
		for (var i = 0; i < length; i++) {
			s += encodeStr(random() * (125 - 65 + 1));
		}
		return s;
	}

	function encodeStr(num) {
		return fromCharCode(num + 65);
	}

	function nextUniqueId() {
		idNum[0]++;
		for(var i = 0; idNum[i] >= MAX_PRECISION && i < idNum.length; i++) {
			idNum[i] = MIN_PRECISION;
			if (i < idNum.length) idNum[i + 1]++;
			else {
				// Reset and add a digit.
				idNum = map(idNum, function() { return MIN_PRECISION; });
				push(idNum, MIN_PRECISION);
				break;
			}
		}
		return '{' + join(idNum, ',') + '}';
	}

	function createStore() {
		var store = create(null),
			id = nextUniqueId();
		store.get = function(key) {
			return StoreGet(key, id);
		};
		store.set = function(key, value) {
			return StoreSet(key, id, value);
		};
		return freeze(store);
	}

	function getIdentifier() {
		return getRandStr(7) + '1:' + join(getRandStrs(8, 11), '/') + ':' + nextUniqueId();
	}

	function getRandomGenerator() {
		var getRandomValues
			= typeof crypto != 'undefined' && crypto != null
				? (function() {
					var f = crypto.random || crypto.getRandomValues;
					if (f) return f.bind(crypto);
					return undefined;
				})()
				: undefined;
		if (getRandomValues) {
			// Firefox (15 & 16) seems to be throwing a weird "not implemented" error on getRandomValues.
			// Not sure why?
			try { getRandomValues(new Uint8Array(4)); }
			catch(x) { getRandomValues = undefined }
		}
		if (typeof getRandomValues == 'function' && typeof Uint8Array == 'function') {
			return (function() {
				var values = new Uint8Array(16), index = values.length;
				return function random() {
					if (index >= values.length) {
						getRandomValues(values);
						index = 0;
					}
					return values[index++] / 256;
				};
			})();
		} else return Math.random;
	}

	(function() {
		// Override get(Own)PropertyNames and get(Own)PropertyDescriptors to hide PARALLEL_KEY.

		var overrides = create(null);

		overrides.getOwnPropertyNames = getOwnPropertyNames
		if (getPropertyNames) overrides.getPropertyNames = getPropertyNames;

		keys(overrides).forEach(function(u) {
			var original = overrides[u];
			define(Object, u, {
				value: function(obj) {
					var names = apply(original, this, arguments);
					if (u === 'getOwnPropertyNames' && !hasOwn(obj, PARALLEL_KEY))
						return names;
					var index = ArrayIndexOf(names, PARALLEL_KEY);
					if (~index)
						splice(names, index, 1);
					return names;
				},
				enumerable: false,
				writable: true,
				configurable: true
			});
		});

		overrides = create(null);

		if (getPropertyDescriptors) overrides.getPropertyDescriptors = getPropertyDescriptors;
		if (getOwnPropertyDescriptors) overrides.getOwnPropertyDescriptors = getOwnPropertyDescriptors;

		keys(overrides).forEach(function(u) {
			var original = overrides[u];
			define(Object, u, {
				value: function(obj) {
					var desc = apply(original, this, arguments);
					delete desc[PARALLEL_KEY];
					return desc;
				},
				enumerable: false,
				writable: true,
				configurable: true
			});
		});

	})();

	// Override functions which prevent extensions on objects to go ahead and add a parallel map first.
	[ 'preventExtensions', 'seal', 'freeze' ].forEach(function(u) {
		var original = Object[u];
		define(Object, u, {
			value: function(obj) {
				setupParallels(obj);
				return apply(original, this, arguments);
			}
		});
	});

	if (typeof _Proxy == 'function')
		Proxy = (function() {
			/* TODO: This works for "direct_proxies", the current ES6 draft; however, some browsers have
			 * support for an old draft (such as FF 17 and below) which uses Proxy.create(). Should this
			 * version be overridden to protect against discovery of PARALLEL_KEY on these browsers also?
			 */

			var trapBypasses = create(null);
			trapBypasses.defineProperty = Object.defineProperty;
			trapBypasses.hasOwn = hasOwn;
			trapBypasses.get = function(target, name) { return target[name]; };

			return function Proxy(target, traps) {

				if (!(this instanceof Proxy)) {
					// TODO: The new keyword wasn't used. What should be done?
					return new Proxy(target, traps);
				}

				var _traps = create(traps);

				forEach(keys(trapBypasses), function(trapName) {
					var bypass = trapBypasses[trapName];
					if (typeof traps[trapName] == 'function') {
						// Override traps which could discover PARALLEL_KEY.
						_traps[trapName] = function(target, name) {
							if (name === PARALLEL_KEY) {
								// Bypass any user defined trap when name === PARALLEL_KEY.
								return apply(bypass, null, arguments);
							}
							return apply(traps[trapName], this, arguments);
						};
					}
				});

				return new _Proxy(target, _traps);
			};

		})();
	else if (_Proxy && _Proxy.create) {

//		Proxy.create = (function() {
//
//			return function create(traps, proto) {
//				// TODO
//			};
//
//		})();

	}

	return {
		create: createStore
	};

})();
var WeakMapStoreFactory = (function(WeakMap) {

	if (WeakMap === undefined)
		return;

	var WeakMapGet = lazyBind(WeakMap.prototype.get),
		WeakMapSet = lazyBind(WeakMap.prototype.set);

	return {
		create: function createStore() {
			var wm = new WeakMap(),
				store = create(null);
			store.get = function(key) {
				return WeakMapGet(wm, key);
			};
			store.set = function(key, value) {
				return WeakMapSet(wm, key, value);
			};
			return freeze(store);
		}
	};

})(typeof WeakMap == 'function' ? WeakMap : undefined);

		return (function() {

			var storageGenerators = Object.create(null);
			storageGenerators.WeakKeyedStore = WeakKeyedStoreFactory.create
			if (WeakMapStoreFactory)
				storageGenerators.WeakMap = WeakMapStoreFactory.create;

			configureStorage(storageType);

			function configureStorage(storageType) {
				var storageGenerator = storageGenerators[storageType];
				if (!storageGenerator)
					throw new TypeError('Storage configuration not found for storage type "' + storageType + '".');
				CouplerFactory.configureStorage(storageGenerator);
			}

			function create() {
				var coupler = CouplerFactory.create();
				coupler.toString = function() { return 'function SecretCoupler(object) { return secret; }'; };
				return coupler;
			}

			return {
				create: create,
				configureStorage: configureStorage
			};

		})();

	}

	// Export for Node.
	if (typeof module == 'object' && typeof module.exports == 'object')
		module.exports = Secrets;

	// Export for AMD
	else if (global && typeof global.define == 'function' && global.define.amd)
		global.define(function() { return Secrets; });

	// Export as a global
	else
		global.Secrets = Secrets;

})(typeof global == 'undefined' || Object(global) !== global ? this : global, Object, String, Error, TypeError);
