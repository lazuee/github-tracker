/**
 * @template {import('prettier').Config} T
 * @param {T} config - A generic parameter that flows through to the return type
 * @constraint {{import('prettier').Config}}
 */
function definePrettierConfig(config) {
	return config;
}

module.exports = definePrettierConfig({
	plugins: ["@trivago/prettier-plugin-sort-imports"],
	importOrder: ["<THIRD_PARTY_MODULES>", "^.?[./]"],
	importOrderSeparation: true,
	importOrderSortSpecifiers: true,
	jsxSingleQuote: false,
	bracketSpacing: true,
	bracketSameLine: true,
	useTabs: true,
	semi: true,
	tabWidth: 4,
	printWidth: 120,
	endOfLine: "lf",
});
