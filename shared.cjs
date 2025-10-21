const fs = require('node:fs');
const yaml = require('yaml');

/** @import {ChangeYaml} from './types' */

/**
 * @function
 * @param {string} path
 * @returns {string}
 */
const readFile = path => fs.readFileSync(path, 'utf8');

/**
 * Simple function which implements Python normalization of package names
 * https://packaging.python.org/en/latest/specifications/name-normalization/#name-normalization
 *
 * @param {string} name
 * @returns {string}
 */
function normalizePythonPackage(name) {
	return name.replace(/[-_.]+/g, '-').toLowerCase();
}

/**
 * @typedef Dependency
 * @property {string} name
 * @property {string | null} version
 */

/**
 * @param {string} dependency
 * @returns {Dependency}
 */
function parseVersion(dependency) {
	const {name, version} =
		/^(?<name>@?[a-z-_/.0-9[\]]+)((@|==)(?<version>.+))?$/i.exec(dependency)
			?.groups ?? {name: '', version: null};
	return {
		name,
		version: version ?? null,
	};
}

/**
 * Simple function to escape regular expressions so that they can be used as regular strings in a (different)
 * regular expression
 *
 * @param {string} string
 * @returns {string}
 */
function escapeRegex(string) {
	/** @type {function(string): string} */
	let _escape;
	if ('escape' in RegExp && typeof RegExp.escape === 'function') {
		// @ts-expect-error TypeScript is not aware of the new escape function
		({escape: _escape} = RegExp);
	} else {
		_escape = string => string.replace(/\[/g, '\\[').replace(/]/g, '\\]');
	}

	return _escape(string);
}

/**
 * @template T
 * @param {string} filePath
 * @param {ChangeYaml<T>} callback
 * @returns {void}
 */
function updateYamlFile(filePath, callback) {
	/**
	 * @import {YAMLSeq, Scalar, YAMLMap, Alias, Node} from 'yaml'
	 *
	 * @template [T=unknown]
	 * @typedef {Exclude<Node<T>, Alias>} _YAMLNode
	 * @typedef {_YAMLNode<T> & Required<Pick<_YAMLNode<T>, 'srcToken'>>} YamlNode
	 * */

	/**
	 * @template T
	 * @param {YamlNode<T>} node
	 * @return {node is YAMLSeq}
	 * */
	function isYamlSequence(node) {
		return node.srcToken.type === 'block-seq';
	}

	/**
	 * @template T
	 * @param {YamlNode<T>} node
	 * @return {node is YAMLMap<string, T>}
	 * */
	function isYamlMap(node) {
		return node.srcToken.type === 'block-map';
	}

	/**
	 * @template T
	 * @type {ProxyHandler<YamlNode<T>>}
	 *  */
	const handler = {
		get: getter,
		set: setter,
		has: (target, prop) => {
			if (isYamlSequence(target)) {
				return Reflect.has(target.items, prop);
			}
			return Reflect.has(target, prop);
		},
	};
	/**
	 * @template Node
	 * @template {YamlNode<Node>} T
	 * @param {T} target
	 * @param {string | symbol} prop
	 * */
	function getter(target, prop) {
		/**
		 * @template  T
		 * @param {YamlNode<T>} value
		 * @returns {value is Scalar<string>}
		 * */
		function isString(value) {
			return (
				'srcToken' in value &&
				!!value.srcToken.type &&
				['double-quoted-scalar', 'scalar'].includes(value.srcToken.type)
			);
		}

		if (isYamlMap(target)) {
			const value = target.get(prop);
			if (typeof value !== 'object') return value;
			return new Proxy(
				/** @type {YamlNode<T>} */ (/** @type {unknown} */ (value)),
				handler,
			);
		} else if (isYamlSequence(target)) {
			const value = Reflect.get(target.items, prop);
			if (['number', 'function'].includes(typeof value)) return value;
			if (isString(value)) return value.value;
			return new Proxy(value, handler);
		} else {
			throw new Error(
				`Cannot get property ${String(prop)} of type ${target.srcToken.type}`,
			);
		}
	}

	/**
	 * @template T
	 * @param {YamlNode<T>} target
	 * @param {string} prop
	 * @param {T} value
	 * @returns {boolean}
	 * */
	function setter(target, prop, value) {
		if (isYamlMap(target)) {
			target.set(prop, value);
		} else if (isYamlSequence(target)) {
			Reflect.set(target.items, prop, value);
		} else {
			throw new Error(
				`Cannot set property ${String(prop)} of type ${target.srcToken.type}`,
			);
		}
		return true;
	}

	const document = yaml.parseDocument(readFile(filePath), {
		version: '1.2',
		keepSourceTokens: true,
	});
	if (!document.contents) {
		throw new Error('YAML document is empty');
	}

	const content = new Proxy(
		/** @type {YamlNode} */ (document.contents),
		handler,
	);

	callback(/** @type {T} */ (content));

	fs.writeFileSync(filePath, yaml.stringify(document.contents, {}));
}

module.exports = {
	readFile,
	parseVersion,
	escapeRegex,
	updateYamlFile,
	normalizePythonPackage,
};
