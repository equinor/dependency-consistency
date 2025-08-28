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
		/^(?<name>@?[a-z-/.0-9[\]]+)((@|==)(?<version>.+))?$/i.exec(dependency)
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
	 * @import {YAMLSeq, Scalar, YAMLMap} from 'yaml/types'
	 * @typedef {YAMLSeq | YAMLMap | Scalar} YamlNode
	 * */

	/**
	 *  @type {ProxyHandler<YamlNode>}
	 *  */
	const handler = {
		get: getter,
		set: setter,
		has: (target, prop) => {
			if (target.type === 'SEQ') {
				return Reflect.has(target.items, prop);
			}
			return Reflect.has(target, prop);
		},
	};
	/**
	 * @template {YamlNode} T
	 * @param {T} target
	 * @param {string | symbol} prop
	 * */
	function getter(target, prop) {
		/**
		 * @param {YamlNode} value
		 * @returns {boolean}
		 * */
		function isString(value) {
			return (
				'type' in value &&
				!!value.type &&
				['QUOTE_DOUBLE', 'PLAIN'].includes(value.type)
			);
		}

		if (target.type === 'MAP') {
			const value = target.get(prop);
			if (typeof value !== 'object') return value;
			return new Proxy(value, handler);
		} else if (target.type === 'SEQ') {
			const value = Reflect.get(target.items, prop);
			if (['number', 'function'].includes(typeof value)) return value;
			if (isString(value)) return value.value;
			return new Proxy(value, handler);
		} else {
			throw new Error(
				`Cannot get property ${String(prop)} of type ${target.type}`,
			);
		}
	}

	/**
	 * @template T
	 * @param {YamlNode} target
	 * @param {string} prop
	 * @param {T} value
	 * @returns {boolean}
	 * */
	function setter(target, prop, value) {
		if (target.type === 'MAP') {
			target.set(prop, value);
		} else if (target.type === 'SEQ') {
			Reflect.set(target.items, prop, value);
		} else {
			throw new Error(
				`Cannot set property ${String(prop)} of type ${target.type}`,
			);
		}
		return true;
	}

	const document = yaml.parseDocument(readFile(filePath), {
		version: '1.2',
	});
	if (!document.contents) {
		throw new Error('YAML document is empty');
	}

	const content = new Proxy(
		document.contents,
		/** @type {ProxyHandler<YamlNode>} */ handler,
	);

	callback(/** @type {T} */ (content));

	fs.writeFileSync(filePath, yaml.stringify(document.contents, {}));
}

module.exports = {
	readFile,
	parseVersion,
	escapeRegex,
	updateYamlFile,
};
