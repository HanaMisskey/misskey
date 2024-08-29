// vite.config.ts
import path from "path";
import pluginReplace from "file:///workspace/node_modules/.pnpm/@rollup+plugin-replace@5.0.7_rollup@4.19.1/node_modules/@rollup/plugin-replace/dist/es/index.js";
import pluginVue from "file:///workspace/node_modules/.pnpm/@vitejs+plugin-vue@5.1.0_vite@5.3.5_@types+node@20.14.12_sass@1.77.8_terser@5.31.3__vue@3.4.37_typescript@5.5.4_/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { defineConfig } from "file:///workspace/node_modules/.pnpm/vite@5.3.5_@types+node@20.14.12_sass@1.77.8_terser@5.31.3/node_modules/vite/dist/node/index.js";

// ../../locales/index.js
import * as fs from "node:fs";
import * as yaml from "file:///workspace/node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/dist/js-yaml.mjs";
var __vite_injected_original_import_meta_url = "file:///workspace/locales/index.js";
var merge = (...args) => args.reduce((a, c) => ({
  ...a,
  ...c,
  ...Object.entries(a).filter(([k]) => c && typeof c[k] === "object").reduce((a2, [k, v]) => (a2[k] = merge(v, c[k]), a2), {})
}), {});
var languages = [
  "ar-SA",
  "cs-CZ",
  "da-DK",
  "de-DE",
  "en-US",
  "es-ES",
  "fr-FR",
  "id-ID",
  "it-IT",
  "ja-JP",
  "ja-KS",
  "kab-KAB",
  "kn-IN",
  "ko-KR",
  "nl-NL",
  "no-NO",
  "pl-PL",
  "pt-PT",
  "ru-RU",
  "sk-SK",
  "th-TH",
  "ug-CN",
  "uk-UA",
  "vi-VN",
  "zh-CN",
  "zh-TW"
];
var primaries = {
  "en": "US",
  "ja": "JP",
  "zh": "CN"
};
var clean = (text) => text.replace(new RegExp(String.fromCodePoint(8), "g"), "");
function build() {
  const metaUrl = __vite_injected_original_import_meta_url;
  const locales = languages.reduce((a, c) => (a[c] = yaml.load(clean(fs.readFileSync(new URL(`${c}.yml`, metaUrl), "utf-8"))) || {}, a), {});
  const removeEmpty = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v === "") {
        delete obj[k];
      } else if (typeof v === "object") {
        removeEmpty(v);
      }
    }
    return obj;
  };
  removeEmpty(locales);
  return Object.entries(locales).reduce((a, [k, v]) => (a[k] = (() => {
    const [lang] = k.split("-");
    switch (k) {
      case "ja-JP":
        return v;
      case "ja-KS":
      case "en-US":
        return merge(locales["ja-JP"], v);
      default:
        return merge(
          locales["ja-JP"],
          locales["en-US"],
          locales[`${lang}-${primaries[lang]}`] ?? {},
          v
        );
    }
  })(), a), {});
}
var locales_default = build();

// ../../package.json
var package_default = {
  name: "misskey",
  version: "2024.8.0",
  codename: "nasubi",
  repository: {
    type: "git",
    url: "https://github.com/misskey-dev/misskey.git"
  },
  packageManager: "pnpm@9.6.0",
  workspaces: [
    "packages/frontend",
    "packages/backend",
    "packages/sw",
    "packages/misskey-js",
    "packages/misskey-reversi",
    "packages/misskey-bubble-game"
  ],
  private: true,
  scripts: {
    "build-pre": "node ./scripts/build-pre.js",
    "build-assets": "node ./scripts/build-assets.mjs",
    build: "pnpm build-pre && pnpm -r build && pnpm build-assets",
    "build-storybook": "pnpm --filter frontend build-storybook",
    "build-misskey-js-with-types": "pnpm build-pre && pnpm --filter backend... --filter=!misskey-js build && pnpm --filter backend generate-api-json --no-build && ncp packages/backend/built/api.json packages/misskey-js/generator/api.json && pnpm --filter misskey-js update-autogen-code && pnpm --filter misskey-js build && pnpm --filter misskey-js api",
    start: "pnpm check:connect && cd packages/backend && node ./built/boot/entry.js",
    "start:test": "cd packages/backend && cross-env NODE_ENV=test node ./built/boot/entry.js",
    init: "pnpm migrate",
    migrate: "cd packages/backend && pnpm migrate",
    revert: "cd packages/backend && pnpm revert",
    "check:connect": "cd packages/backend && pnpm check:connect",
    migrateandstart: "pnpm migrate && pnpm start",
    watch: "pnpm dev",
    dev: "node scripts/dev.mjs",
    lint: "pnpm -r lint",
    "cy:open": "pnpm cypress open --browser --e2e --config-file=cypress.config.ts",
    "cy:run": "pnpm cypress run",
    e2e: "pnpm start-server-and-test start:test http://localhost:61812 cy:run",
    jest: "cd packages/backend && pnpm jest",
    "jest-and-coverage": "cd packages/backend && pnpm jest-and-coverage",
    test: "pnpm -r test",
    "test-and-coverage": "pnpm -r test-and-coverage",
    clean: "node ./scripts/clean.js",
    "clean-all": "node ./scripts/clean-all.js",
    cleanall: "pnpm clean-all"
  },
  resolutions: {
    chokidar: "3.5.3",
    lodash: "4.17.21"
  },
  dependencies: {
    cssnano: "6.1.2",
    execa: "8.0.1",
    "fast-glob": "3.3.2",
    "ignore-walk": "6.0.5",
    "js-yaml": "4.1.0",
    postcss: "8.4.40",
    tar: "6.2.1",
    terser: "5.31.3",
    typescript: "5.5.4",
    esbuild: "0.23.0",
    glob: "11.0.0"
  },
  devDependencies: {
    "@misskey-dev/eslint-plugin": "2.0.3",
    "@types/node": "20.14.12",
    "@typescript-eslint/eslint-plugin": "7.17.0",
    "@typescript-eslint/parser": "7.17.0",
    "cross-env": "7.0.3",
    cypress: "13.13.1",
    eslint: "9.8.0",
    globals: "15.8.0",
    ncp: "2.0.0",
    "start-server-and-test": "2.0.4"
  },
  optionalDependencies: {
    "@tensorflow/tfjs-core": "4.4.0"
  }
};

// package.json
var package_default2 = {
  name: "frontend",
  private: true,
  type: "module",
  scripts: {
    watch: "vite",
    dev: "vite --config vite.config.local-dev.ts --debug hmr",
    build: "vite build",
    "storybook-dev": 'nodemon --verbose --watch src --ext "mdx,ts,vue" --ignore "*.stories.ts" --exec "pnpm build-storybook-pre && pnpm exec storybook dev -p 6006 --ci"',
    "build-storybook-pre": "(tsc -p .storybook || echo done.) && node .storybook/generate.js && node .storybook/preload-locale.js && node .storybook/preload-theme.js",
    "build-storybook": "pnpm build-storybook-pre && storybook build --webpack-stats-json storybook-static",
    chromatic: "chromatic",
    test: "vitest --run --globals",
    "test-and-coverage": "vitest --run --coverage --globals",
    typecheck: "vue-tsc --noEmit",
    eslint: 'eslint --quiet "src/**/*.{ts,vue}"',
    lint: "pnpm typecheck && pnpm eslint"
  },
  dependencies: {
    "@discordapp/twemoji": "15.0.3",
    "@github/webauthn-json": "2.1.1",
    "@mcaptcha/vanilla-glue": "0.1.0-alpha-3",
    "@misskey-dev/browser-image-resizer": "2024.1.0",
    "@rollup/plugin-json": "6.1.0",
    "@rollup/plugin-replace": "5.0.7",
    "@rollup/pluginutils": "5.1.0",
    "@syuilo/aiscript": "0.19.0",
    "@tabler/icons-webfont": "3.3.0",
    "@twemoji/parser": "15.1.1",
    "@vitejs/plugin-vue": "5.1.0",
    "@vue/compiler-sfc": "3.4.37",
    "aiscript-vscode": "github:aiscript-dev/aiscript-vscode#v0.1.11",
    astring: "1.8.6",
    "broadcast-channel": "7.0.0",
    buraha: "0.0.1",
    "canvas-confetti": "1.9.3",
    "chart.js": "4.4.3",
    "chartjs-adapter-date-fns": "3.0.0",
    "chartjs-chart-matrix": "2.0.1",
    "chartjs-plugin-gradient": "0.6.1",
    "chartjs-plugin-zoom": "2.0.1",
    chromatic: "11.5.6",
    "compare-versions": "6.1.1",
    cropperjs: "2.0.0-rc.1",
    "date-fns": "2.30.0",
    "escape-regexp": "0.0.1",
    "estree-walker": "3.0.3",
    eventemitter3: "5.0.1",
    "idb-keyval": "6.2.1",
    "insert-text-at-cursor": "0.3.0",
    "is-file-animated": "1.0.2",
    json5: "2.2.3",
    "matter-js": "0.19.0",
    "mfm-js": "0.24.0",
    "misskey-bubble-game": "workspace:*",
    "misskey-js": "workspace:*",
    "misskey-reversi": "workspace:*",
    photoswipe: "5.4.4",
    punycode: "2.3.1",
    rollup: "4.19.1",
    "sanitize-html": "2.13.0",
    sass: "1.77.8",
    shiki: "1.12.0",
    "strict-event-emitter-types": "2.0.0",
    "textarea-caret": "3.1.0",
    three: "0.167.0",
    "throttle-debounce": "5.0.2",
    tinycolor2: "1.6.0",
    "tsc-alias": "1.8.10",
    "tsconfig-paths": "4.2.0",
    typescript: "5.5.4",
    uuid: "10.0.0",
    "v-code-diff": "1.12.0",
    vite: "5.3.5",
    vue: "3.4.37",
    vuedraggable: "next"
  },
  devDependencies: {
    "@misskey-dev/summaly": "5.1.0",
    "@storybook/addon-actions": "8.2.6",
    "@storybook/addon-essentials": "8.2.6",
    "@storybook/addon-interactions": "8.2.6",
    "@storybook/addon-links": "8.2.6",
    "@storybook/addon-mdx-gfm": "8.2.6",
    "@storybook/addon-storysource": "8.2.6",
    "@storybook/blocks": "8.2.6",
    "@storybook/components": "8.2.6",
    "@storybook/core-events": "8.2.6",
    "@storybook/manager-api": "8.2.6",
    "@storybook/preview-api": "8.2.6",
    "@storybook/react": "8.2.6",
    "@storybook/react-vite": "8.2.6",
    "@storybook/test": "8.2.6",
    "@storybook/theming": "8.2.6",
    "@storybook/types": "8.2.6",
    "@storybook/vue3": "8.2.6",
    "@storybook/vue3-vite": "8.1.11",
    "@testing-library/vue": "8.1.0",
    "@types/canvas-confetti": "^1.6.4",
    "@types/escape-regexp": "0.0.3",
    "@types/estree": "1.0.5",
    "@types/matter-js": "0.19.7",
    "@types/micromatch": "4.0.9",
    "@types/node": "20.14.12",
    "@types/punycode": "2.1.4",
    "@types/sanitize-html": "2.11.0",
    "@types/seedrandom": "3.0.8",
    "@types/throttle-debounce": "5.0.2",
    "@types/tinycolor2": "1.4.6",
    "@types/uuid": "10.0.0",
    "@types/ws": "8.5.11",
    "@typescript-eslint/eslint-plugin": "7.17.0",
    "@typescript-eslint/parser": "7.17.0",
    "@vitest/coverage-v8": "1.6.0",
    "@vue/runtime-core": "3.4.37",
    acorn: "8.12.1",
    "cross-env": "7.0.3",
    cypress: "13.13.1",
    "eslint-plugin-import": "2.29.1",
    "eslint-plugin-vue": "9.27.0",
    "fast-glob": "3.3.2",
    "happy-dom": "10.0.3",
    "intersection-observer": "0.12.2",
    micromatch: "4.0.7",
    msw: "2.3.4",
    "msw-storybook-addon": "2.0.3",
    nodemon: "3.1.4",
    prettier: "3.3.3",
    react: "18.3.1",
    "react-dom": "18.3.1",
    seedrandom: "3.0.5",
    "start-server-and-test": "2.0.4",
    storybook: "8.2.6",
    "storybook-addon-misskey-theme": "github:misskey-dev/storybook-addon-misskey-theme",
    "vite-plugin-turbosnap": "1.0.3",
    vitest: "1.6.0",
    "vitest-fetch-mock": "0.2.2",
    "vue-component-type-helpers": "2.0.29",
    "vue-eslint-parser": "9.4.3",
    "vue-tsc": "2.0.29"
  }
};

// lib/rollup-plugin-unwind-css-module-class-name.ts
import { generate } from "file:///workspace/node_modules/.pnpm/astring@1.8.6/node_modules/astring/dist/astring.mjs";

// ../../node_modules/.pnpm/estree-walker@3.0.3/node_modules/estree-walker/src/walker.js
var WalkerBase = class {
  constructor() {
    this.should_skip = false;
    this.should_remove = false;
    this.replacement = null;
    this.context = {
      skip: () => this.should_skip = true,
      remove: () => this.should_remove = true,
      replace: (node) => this.replacement = node
    };
  }
  /**
   * @template {Node} Parent
   * @param {Parent | null | undefined} parent
   * @param {keyof Parent | null | undefined} prop
   * @param {number | null | undefined} index
   * @param {Node} node
   */
  replace(parent, prop, index, node) {
    if (parent && prop) {
      if (index != null) {
        parent[prop][index] = node;
      } else {
        parent[prop] = node;
      }
    }
  }
  /**
   * @template {Node} Parent
   * @param {Parent | null | undefined} parent
   * @param {keyof Parent | null | undefined} prop
   * @param {number | null | undefined} index
   */
  remove(parent, prop, index) {
    if (parent && prop) {
      if (index !== null && index !== void 0) {
        parent[prop].splice(index, 1);
      } else {
        delete parent[prop];
      }
    }
  }
};

// ../../node_modules/.pnpm/estree-walker@3.0.3/node_modules/estree-walker/src/sync.js
var SyncWalker = class extends WalkerBase {
  /**
   *
   * @param {SyncHandler} [enter]
   * @param {SyncHandler} [leave]
   */
  constructor(enter, leave) {
    super();
    this.should_skip = false;
    this.should_remove = false;
    this.replacement = null;
    this.context = {
      skip: () => this.should_skip = true,
      remove: () => this.should_remove = true,
      replace: (node) => this.replacement = node
    };
    this.enter = enter;
    this.leave = leave;
  }
  /**
   * @template {Node} Parent
   * @param {Node} node
   * @param {Parent | null} parent
   * @param {keyof Parent} [prop]
   * @param {number | null} [index]
   * @returns {Node | null}
   */
  visit(node, parent, prop, index) {
    if (node) {
      if (this.enter) {
        const _should_skip = this.should_skip;
        const _should_remove = this.should_remove;
        const _replacement = this.replacement;
        this.should_skip = false;
        this.should_remove = false;
        this.replacement = null;
        this.enter.call(this.context, node, parent, prop, index);
        if (this.replacement) {
          node = this.replacement;
          this.replace(parent, prop, index, node);
        }
        if (this.should_remove) {
          this.remove(parent, prop, index);
        }
        const skipped = this.should_skip;
        const removed = this.should_remove;
        this.should_skip = _should_skip;
        this.should_remove = _should_remove;
        this.replacement = _replacement;
        if (skipped) return node;
        if (removed) return null;
      }
      let key;
      for (key in node) {
        const value = node[key];
        if (value && typeof value === "object") {
          if (Array.isArray(value)) {
            const nodes = (
              /** @type {Array<unknown>} */
              value
            );
            for (let i = 0; i < nodes.length; i += 1) {
              const item = nodes[i];
              if (isNode(item)) {
                if (!this.visit(item, node, key, i)) {
                  i--;
                }
              }
            }
          } else if (isNode(value)) {
            this.visit(value, node, key, null);
          }
        }
      }
      if (this.leave) {
        const _replacement = this.replacement;
        const _should_remove = this.should_remove;
        this.replacement = null;
        this.should_remove = false;
        this.leave.call(this.context, node, parent, prop, index);
        if (this.replacement) {
          node = this.replacement;
          this.replace(parent, prop, index, node);
        }
        if (this.should_remove) {
          this.remove(parent, prop, index);
        }
        const removed = this.should_remove;
        this.replacement = _replacement;
        this.should_remove = _should_remove;
        if (removed) return null;
      }
    }
    return node;
  }
};
function isNode(value) {
  return value !== null && typeof value === "object" && "type" in value && typeof value.type === "string";
}

// ../../node_modules/.pnpm/estree-walker@3.0.3/node_modules/estree-walker/src/index.js
function walk(ast, { enter, leave }) {
  const instance = new SyncWalker(enter, leave);
  return instance.visit(ast, null);
}

// lib/rollup-plugin-unwind-css-module-class-name.ts
function isFalsyIdentifier(identifier) {
  return identifier.name === "undefined" || identifier.name === "NaN";
}
function normalizeClassWalker(tree, stack) {
  if (tree.type === "Identifier") return isFalsyIdentifier(tree) ? "" : null;
  if (tree.type === "Literal") return typeof tree.value === "string" ? tree.value : "";
  if (tree.type === "BinaryExpression") {
    if (tree.operator !== "+") return null;
    const left = normalizeClassWalker(tree.left, stack);
    const right = normalizeClassWalker(tree.right, stack);
    if (left === null || right === null) return null;
    return `${left}${right}`;
  }
  if (tree.type === "TemplateLiteral") {
    if (tree.expressions.some((x) => x.type !== "Literal" && (x.type !== "Identifier" || !isFalsyIdentifier(x)))) return null;
    return tree.quasis.reduce((a, c, i) => {
      const v = i === tree.quasis.length - 1 ? "" : tree.expressions[i].value;
      return a + c.value.raw + (typeof v === "string" ? v : "");
    }, "");
  }
  if (tree.type === "ArrayExpression") {
    const values = tree.elements.map((treeNode) => {
      if (treeNode === null) return "";
      if (treeNode.type === "SpreadElement") return normalizeClassWalker(treeNode.argument, stack);
      return normalizeClassWalker(treeNode, stack);
    });
    if (values.some((x) => x === null)) return null;
    return values.join(" ");
  }
  if (tree.type === "ObjectExpression") {
    const values = tree.properties.map((treeNode) => {
      if (treeNode.type === "SpreadElement") return normalizeClassWalker(treeNode.argument, stack);
      let x = treeNode.value;
      let inveted = false;
      while (x.type === "UnaryExpression" && x.operator === "!") {
        x = x.argument;
        inveted = !inveted;
      }
      if (x.type === "Literal") {
        if (inveted === !x.value) {
          return treeNode.key.type === "Identifier" ? treeNode.computed ? null : treeNode.key.name : treeNode.key.type === "Literal" ? treeNode.key.value : "";
        } else {
          return "";
        }
      }
      if (x.type === "Identifier") {
        if (inveted !== isFalsyIdentifier(x)) {
          return "";
        } else {
          return null;
        }
      }
      return null;
    });
    if (values.some((x) => x === null)) return null;
    return values.join(" ");
  }
  if (tree.type !== "CallExpression" && tree.type !== "ChainExpression" && tree.type !== "ConditionalExpression" && tree.type !== "LogicalExpression" && tree.type !== "MemberExpression") {
    console.error(stack ? `Unexpected node type: ${tree.type} (in ${stack})` : `Unexpected node type: ${tree.type}`);
  }
  return null;
}
function normalizeClass(tree, stack) {
  const walked = normalizeClassWalker(tree, stack);
  return walked && walked.replace(/^\s+|\s+(?=\s)|\s+$/g, "");
}
function unwindCssModuleClassName(ast) {
  walk(ast, {
    enter(node, parent) {
      if (parent?.type !== "Program") return;
      if (node.type !== "VariableDeclaration") return;
      if (node.declarations.length !== 1) return;
      if (node.declarations[0].id.type !== "Identifier") return;
      const name = node.declarations[0].id.name;
      if (node.declarations[0].init?.type !== "CallExpression") return;
      if (node.declarations[0].init.callee.type !== "Identifier") return;
      if (node.declarations[0].init.callee.name !== "_export_sfc") return;
      if (node.declarations[0].init.arguments.length !== 2) return;
      if (node.declarations[0].init.arguments[0].type !== "Identifier") return;
      const ident = node.declarations[0].init.arguments[0].name;
      if (!ident.startsWith("_sfc_main")) return;
      if (node.declarations[0].init.arguments[1].type !== "ArrayExpression") return;
      if (node.declarations[0].init.arguments[1].elements.length === 0) return;
      const __cssModulesIndex = node.declarations[0].init.arguments[1].elements.findIndex((x) => {
        if (x?.type !== "ArrayExpression") return false;
        if (x.elements.length !== 2) return false;
        if (x.elements[0]?.type !== "Literal") return false;
        if (x.elements[0].value !== "__cssModules") return false;
        if (x.elements[1]?.type !== "Identifier") return false;
        return true;
      });
      if (!~__cssModulesIndex) return;
      const cssModuleForestName = node.declarations[0].init.arguments[1].elements[__cssModulesIndex].elements[1].name;
      const cssModuleForestNode = parent.body.find((x) => {
        if (x.type !== "VariableDeclaration") return false;
        if (x.declarations.length !== 1) return false;
        if (x.declarations[0].id.type !== "Identifier") return false;
        if (x.declarations[0].id.name !== cssModuleForestName) return false;
        if (x.declarations[0].init?.type !== "ObjectExpression") return false;
        return true;
      });
      const moduleForest = new Map(cssModuleForestNode.declarations[0].init.properties.flatMap((property) => {
        if (property.type !== "Property") return [];
        if (property.key.type !== "Literal") return [];
        if (property.value.type !== "Identifier") return [];
        return [[property.key.value, property.value.name]];
      }));
      const sfcMain = parent.body.find((x) => {
        if (x.type !== "VariableDeclaration") return false;
        if (x.declarations.length !== 1) return false;
        if (x.declarations[0].id.type !== "Identifier") return false;
        if (x.declarations[0].id.name !== ident) return false;
        return true;
      });
      if (sfcMain.declarations[0].init?.type !== "CallExpression") return;
      if (sfcMain.declarations[0].init.callee.type !== "Identifier") return;
      if (sfcMain.declarations[0].init.callee.name !== "defineComponent") return;
      if (sfcMain.declarations[0].init.arguments.length !== 1) return;
      if (sfcMain.declarations[0].init.arguments[0].type !== "ObjectExpression") return;
      const setup = sfcMain.declarations[0].init.arguments[0].properties.find((x) => {
        if (x.type !== "Property") return false;
        if (x.key.type !== "Identifier") return false;
        if (x.key.name !== "setup") return false;
        return true;
      });
      if (setup.value.type !== "FunctionExpression") return;
      const render = setup.value.body.body.find((x) => {
        if (x.type !== "ReturnStatement") return false;
        return true;
      });
      if (render.argument?.type !== "ArrowFunctionExpression") return;
      if (render.argument.params.length !== 2) return;
      const ctx = render.argument.params[0];
      if (ctx.type !== "Identifier") return;
      if (ctx.name !== "_ctx") return;
      if (render.argument.body.type !== "BlockStatement") return;
      for (const [key, value] of moduleForest) {
        const cssModuleTreeNode = parent.body.find((x) => {
          if (x.type !== "VariableDeclaration") return false;
          if (x.declarations.length !== 1) return false;
          if (x.declarations[0].id.type !== "Identifier") return false;
          if (x.declarations[0].id.name !== value) return false;
          return true;
        });
        if (cssModuleTreeNode.declarations[0].init?.type !== "ObjectExpression") return;
        const moduleTree = new Map(cssModuleTreeNode.declarations[0].init.properties.flatMap((property) => {
          if (property.type !== "Property") return [];
          const actualKey = property.key.type === "Identifier" ? property.key.name : property.key.type === "Literal" ? property.key.value : null;
          if (typeof actualKey !== "string") return [];
          if (property.value.type === "Literal") return [[actualKey, property.value.value]];
          if (property.value.type !== "Identifier") return [];
          const labelledValue = property.value.name;
          const actualValue = parent.body.find((x) => {
            if (x.type !== "VariableDeclaration") return false;
            if (x.declarations.length !== 1) return false;
            if (x.declarations[0].id.type !== "Identifier") return false;
            if (x.declarations[0].id.name !== labelledValue) return false;
            return true;
          });
          if (actualValue.declarations[0].init?.type !== "Literal") return [];
          return [[actualKey, actualValue.declarations[0].init.value]];
        }));
        walk(render.argument.body, {
          enter(childNode) {
            if (childNode.type !== "MemberExpression") return;
            if (childNode.object.type !== "MemberExpression") return;
            if (childNode.object.object.type !== "Identifier") return;
            if (childNode.object.object.name !== ctx.name) return;
            if (childNode.object.property.type !== "Identifier") return;
            if (childNode.object.property.name !== key) return;
            if (childNode.property.type !== "Identifier") return;
            const actualValue = moduleTree.get(childNode.property.name);
            if (actualValue === void 0) return;
            this.replace({
              type: "Literal",
              value: actualValue
            });
          }
        });
        walk(render.argument.body, {
          enter(childNode) {
            if (childNode.type !== "MemberExpression") return;
            if (childNode.object.type !== "MemberExpression") return;
            if (childNode.object.object.type !== "Identifier") return;
            if (childNode.object.object.name !== ctx.name) return;
            if (childNode.object.property.type !== "Identifier") return;
            if (childNode.object.property.name !== key) return;
            if (childNode.property.type !== "Identifier") return;
            console.error(`Undefined style detected: ${key}.${childNode.property.name} (in ${name})`);
            this.replace({
              type: "Identifier",
              name: "undefined"
            });
          }
        });
        walk(render.argument.body, {
          enter(childNode) {
            if (childNode.type !== "CallExpression") return;
            if (childNode.callee.type !== "Identifier") return;
            if (childNode.callee.name !== "normalizeClass") return;
            if (childNode.arguments.length !== 1) return;
            const normalized = normalizeClass(childNode.arguments[0], name);
            if (normalized === null) return;
            this.replace({
              type: "Literal",
              value: normalized
            });
          }
        });
      }
      if (node.declarations[0].init.arguments[1].elements.length === 1) {
        walk(ast, {
          enter(childNode) {
            if (childNode.type !== "Identifier") return;
            if (childNode.name !== ident) return;
            this.replace({
              type: "Identifier",
              name: node.declarations[0].id.name
            });
          }
        });
        this.remove();
      } else {
        this.replace({
          type: "VariableDeclaration",
          declarations: [{
            type: "VariableDeclarator",
            id: {
              type: "Identifier",
              name: node.declarations[0].id.name
            },
            init: {
              type: "CallExpression",
              callee: {
                type: "Identifier",
                name: "_export_sfc"
              },
              arguments: [{
                type: "Identifier",
                name: ident
              }, {
                type: "ArrayExpression",
                elements: node.declarations[0].init.arguments[1].elements.slice(0, __cssModulesIndex).concat(node.declarations[0].init.arguments[1].elements.slice(__cssModulesIndex + 1))
              }]
            }
          }],
          kind: "const"
        });
      }
    }
  });
}
function pluginUnwindCssModuleClassName() {
  return {
    name: "UnwindCssModuleClassName",
    renderChunk(code) {
      const ast = this.parse(code);
      unwindCssModuleClassName(ast);
      return { code: generate(ast) };
    }
  };
}

// vite.json5.ts
import JSON5 from "file:///workspace/node_modules/.pnpm/json5@2.2.3/node_modules/json5/lib/index.js";
import { createFilter, dataToEsm } from "file:///workspace/node_modules/.pnpm/@rollup+pluginutils@5.1.0_rollup@4.19.1/node_modules/@rollup/pluginutils/dist/es/index.js";
function json5(options = {}) {
  const filter = createFilter(options.include, options.exclude);
  const indent = "indent" in options ? options.indent : "	";
  return {
    name: "json5",
    // eslint-disable-next-line no-shadow
    transform(json, id) {
      if (id.slice(-6) !== ".json5" || !filter(id)) return null;
      try {
        const parsed = JSON5.parse(json);
        return {
          code: dataToEsm(parsed, {
            preferConst: options.preferConst,
            compact: options.compact,
            namedExports: options.namedExports,
            indent
          }),
          map: { mappings: "" }
        };
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err;
        }
        const message = "Could not parse JSON5 file";
        const { lineNumber, columnNumber } = err;
        this.warn({ message, id, loc: { line: lineNumber, column: columnNumber } });
        return null;
      }
    }
  };
}

// vite.config.ts
var __vite_injected_original_dirname = "/workspace/packages/frontend";
var extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".json5", ".svg", ".sass", ".scss", ".css", ".vue"];
var externalPackages = [
  // shiki（コードブロックのシンタックスハイライトで使用中）はテーマ・言語の定義の容量が大きいため、それらはCDNから読み込む
  {
    name: "shiki",
    match: /^shiki\/(?<subPkg>(langs|themes))$/,
    path(id, pattern) {
      const match = pattern.exec(id)?.groups;
      return match ? `https://esm.sh/shiki@${package_default2.dependencies.shiki}/${match["subPkg"]}` : id;
    }
  }
];
var hash = (str, seed = 0) => {
  let h1 = 3735928559 ^ seed, h2 = 1103547991 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
var BASE62_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function toBase62(n) {
  if (n === 0) {
    return "0";
  }
  let result = "";
  while (n > 0) {
    result = BASE62_DIGITS[n % BASE62_DIGITS.length] + result;
    n = Math.floor(n / BASE62_DIGITS.length);
  }
  return result;
}
function getConfig() {
  return {
    base: "/vite/",
    server: {
      port: 5173
    },
    plugins: [
      pluginVue(),
      pluginUnwindCssModuleClassName(),
      json5(),
      ...process.env.NODE_ENV === "production" ? [
        pluginReplace({
          preventAssignment: true,
          values: {
            "isChromatic()": JSON.stringify(false)
          }
        })
      ] : []
    ],
    resolve: {
      extensions,
      alias: {
        "@/": __vite_injected_original_dirname + "/src/",
        "/client-assets/": __vite_injected_original_dirname + "/assets/",
        "/static-assets/": __vite_injected_original_dirname + "/../backend/assets/",
        "/fluent-emojis/": __vite_injected_original_dirname + "/../../fluent-emojis/dist/",
        "/fluent-emoji/": __vite_injected_original_dirname + "/../../fluent-emojis/dist/"
      }
    },
    css: {
      modules: {
        generateScopedName(name, filename, _css) {
          const id = (path.relative(__vite_injected_original_dirname, filename.split("?")[0]) + "-" + name).replace(/[\\\/\.\?&=]/g, "-").replace(/(src-|vue-)/g, "");
          if (process.env.NODE_ENV === "production") {
            return "x" + toBase62(hash(id)).substring(0, 4);
          } else {
            return id;
          }
        }
      }
    },
    define: {
      _VERSION_: JSON.stringify(package_default.version),
      _LANGS_: JSON.stringify(Object.entries(locales_default).map(([k, v]) => [k, v._lang_])),
      _ENV_: JSON.stringify(process.env.NODE_ENV),
      _DEV_: process.env.NODE_ENV !== "production",
      _PERF_PREFIX_: JSON.stringify("Misskey:"),
      _DATA_TRANSFER_DRIVE_FILE_: JSON.stringify("mk_drive_file"),
      _DATA_TRANSFER_DRIVE_FOLDER_: JSON.stringify("mk_drive_folder"),
      _DATA_TRANSFER_DECK_COLUMN_: JSON.stringify("mk_deck_column"),
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false
    },
    build: {
      target: [
        "chrome116",
        "firefox116",
        "safari16"
      ],
      manifest: "manifest.json",
      rollupOptions: {
        input: {
          app: "./src/_boot_.ts"
        },
        external: externalPackages.map((p) => p.match),
        output: {
          manualChunks: {
            vue: ["vue"],
            photoswipe: ["photoswipe", "photoswipe/lightbox", "photoswipe/style.css"]
          },
          chunkFileNames: process.env.NODE_ENV === "production" ? "[hash:8].js" : "[name]-[hash:8].js",
          assetFileNames: process.env.NODE_ENV === "production" ? "[hash:8][extname]" : "[name]-[hash:8][extname]",
          paths(id) {
            for (const p of externalPackages) {
              if (p.match.test(id)) {
                return p.path(id, p.match);
              }
            }
            return id;
          }
        }
      },
      cssCodeSplit: true,
      outDir: __vite_injected_original_dirname + "/../../built/_vite_",
      assetsDir: ".",
      emptyOutDir: false,
      sourcemap: process.env.NODE_ENV === "development",
      reportCompressedSize: false,
      // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
      commonjsOptions: {
        include: [/misskey-js/, /misskey-reversi/, /misskey-bubble-game/, /node_modules/]
      }
    },
    worker: {
      format: "es"
    },
    test: {
      environment: "happy-dom",
      deps: {
        optimizer: {
          web: {
            include: [
              // XXX: misskey-dev/browser-image-resizer has no "type": "module"
              "browser-image-resizer"
            ]
          }
        }
      },
      includeSource: ["src/**/*.ts"]
    }
  };
}
var config = defineConfig(({ command, mode }) => getConfig());
var vite_config_default = config;
export {
  vite_config_default as default,
  getConfig
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAiLi4vLi4vbG9jYWxlcy9pbmRleC5qcyIsICIuLi8uLi9wYWNrYWdlLmpzb24iLCAicGFja2FnZS5qc29uIiwgImxpYi9yb2xsdXAtcGx1Z2luLXVud2luZC1jc3MtbW9kdWxlLWNsYXNzLW5hbWUudHMiLCAiLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL2VzdHJlZS13YWxrZXJAMy4wLjMvbm9kZV9tb2R1bGVzL2VzdHJlZS13YWxrZXIvc3JjL3dhbGtlci5qcyIsICIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vZXN0cmVlLXdhbGtlckAzLjAuMy9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmMvc3luYy5qcyIsICIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vZXN0cmVlLXdhbGtlckAzLjAuMy9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmMvaW5kZXguanMiLCAidml0ZS5qc29uNS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi93b3Jrc3BhY2UvcGFja2FnZXMvZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi93b3Jrc3BhY2UvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3dvcmtzcGFjZS9wYWNrYWdlcy9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHBsdWdpblJlcGxhY2UgZnJvbSAnQHJvbGx1cC9wbHVnaW4tcmVwbGFjZSc7XG5pbXBvcnQgcGx1Z2luVnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSc7XG5pbXBvcnQgeyB0eXBlIFVzZXJDb25maWcsIGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuXG5pbXBvcnQgbG9jYWxlcyBmcm9tICcuLi8uLi9sb2NhbGVzL2luZGV4LmpzJztcbmltcG9ydCBtZXRhIGZyb20gJy4uLy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQgcGFja2FnZUluZm8gZnJvbSAnLi9wYWNrYWdlLmpzb24nIHdpdGggeyB0eXBlOiAnanNvbicgfTtcbmltcG9ydCBwbHVnaW5VbndpbmRDc3NNb2R1bGVDbGFzc05hbWUgZnJvbSAnLi9saWIvcm9sbHVwLXBsdWdpbi11bndpbmQtY3NzLW1vZHVsZS1jbGFzcy1uYW1lLmpzJztcbmltcG9ydCBwbHVnaW5Kc29uNSBmcm9tICcuL3ZpdGUuanNvbjUuanMnO1xuXG5jb25zdCBleHRlbnNpb25zID0gWycudHMnLCAnLnRzeCcsICcuanMnLCAnLmpzeCcsICcubWpzJywgJy5qc29uJywgJy5qc29uNScsICcuc3ZnJywgJy5zYXNzJywgJy5zY3NzJywgJy5jc3MnLCAnLnZ1ZSddO1xuXG4vKipcbiAqIE1pc3NrZXlcdTMwNkVcdTMwRDVcdTMwRURcdTMwRjNcdTMwQzhcdTMwQThcdTMwRjNcdTMwQzlcdTMwNkJcdTMwRDBcdTMwRjNcdTMwQzlcdTMwRUJcdTMwNUJcdTMwNUFcdTMwMDFDRE5cdTMwNkFcdTMwNjlcdTMwNEJcdTMwODlcdTUyMjVcdTkwMTRcdThBQURcdTMwN0ZcdThGQkNcdTMwODBcdTMwRUFcdTMwQkRcdTMwRkNcdTMwQjlcdTMwOTJcdThBMThcdThGRjBcdTMwNTlcdTMwOEJcdTMwMDJcbiAqIENETlx1MzA5Mlx1NEY3Rlx1MzA4Rlx1MzA1QVx1MzA2Qlx1MzBEMFx1MzBGM1x1MzBDOVx1MzBFQlx1MzA1N1x1MzA1Rlx1MzA0NFx1NTgzNFx1NTQwOFx1MzAwMVx1NEVFNVx1NEUwQlx1MzA2RVx1OTE0RFx1NTIxN1x1MzA0Qlx1MzA4OVx1OEE3Mlx1NUY1M1x1ODk4MVx1N0QyMFx1MzA5Mlx1NTI0QVx1OTY2NG9yXHUzMEIzXHUzMEUxXHUzMEYzXHUzMEM4XHUzMEEyXHUzMEE2XHUzMEM4XHUzMDU5XHUzMDhDXHUzMDcwT0tcbiAqL1xuY29uc3QgZXh0ZXJuYWxQYWNrYWdlcyA9IFtcblx0Ly8gc2hpa2lcdUZGMDhcdTMwQjNcdTMwRkNcdTMwQzlcdTMwRDZcdTMwRURcdTMwQzNcdTMwQUZcdTMwNkVcdTMwQjdcdTMwRjNcdTMwQkZcdTMwQzNcdTMwQUZcdTMwQjlcdTMwQ0ZcdTMwQTRcdTMwRTlcdTMwQTRcdTMwQzhcdTMwNjdcdTRGN0ZcdTc1MjhcdTRFMkRcdUZGMDlcdTMwNkZcdTMwQzZcdTMwRkNcdTMwREVcdTMwRkJcdThBMDBcdThBOUVcdTMwNkVcdTVCOUFcdTdGQTlcdTMwNkVcdTVCQjlcdTkxQ0ZcdTMwNENcdTU5MjdcdTMwNERcdTMwNDRcdTMwNUZcdTMwODFcdTMwMDFcdTMwNURcdTMwOENcdTMwODlcdTMwNkZDRE5cdTMwNEJcdTMwODlcdThBQURcdTMwN0ZcdThGQkNcdTMwODBcblx0e1xuXHRcdG5hbWU6ICdzaGlraScsXG5cdFx0bWF0Y2g6IC9ec2hpa2lcXC8oPzxzdWJQa2c+KGxhbmdzfHRoZW1lcykpJC8sXG5cdFx0cGF0aChpZDogc3RyaW5nLCBwYXR0ZXJuOiBSZWdFeHApOiBzdHJpbmcge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoaWQpPy5ncm91cHM7XG5cdFx0XHRyZXR1cm4gbWF0Y2hcblx0XHRcdFx0PyBgaHR0cHM6Ly9lc20uc2gvc2hpa2lAJHtwYWNrYWdlSW5mby5kZXBlbmRlbmNpZXMuc2hpa2l9LyR7bWF0Y2hbJ3N1YlBrZyddfWBcblx0XHRcdFx0OiBpZDtcblx0XHR9LFxuXHR9LFxuXTtcblxuY29uc3QgaGFzaCA9IChzdHI6IHN0cmluZywgc2VlZCA9IDApOiBudW1iZXIgPT4ge1xuXHRsZXQgaDEgPSAweGRlYWRiZWVmIF4gc2VlZCxcblx0XHRoMiA9IDB4NDFjNmNlNTcgXiBzZWVkO1xuXHRmb3IgKGxldCBpID0gMCwgY2g7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcblx0XHRjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXHRcdGgxID0gTWF0aC5pbXVsKGgxIF4gY2gsIDI2NTQ0MzU3NjEpO1xuXHRcdGgyID0gTWF0aC5pbXVsKGgyIF4gY2gsIDE1OTczMzQ2NzcpO1xuXHR9XG5cblx0aDEgPSBNYXRoLmltdWwoaDEgXiAoaDEgPj4+IDE2KSwgMjI0NjgyMjUwNykgXiBNYXRoLmltdWwoaDIgXiAoaDIgPj4+IDEzKSwgMzI2NjQ4OTkwOSk7XG5cdGgyID0gTWF0aC5pbXVsKGgyIF4gKGgyID4+PiAxNiksIDIyNDY4MjI1MDcpIF4gTWF0aC5pbXVsKGgxIF4gKGgxID4+PiAxMyksIDMyNjY0ODk5MDkpO1xuXG5cdHJldHVybiA0Mjk0OTY3Mjk2ICogKDIwOTcxNTEgJiBoMikgKyAoaDEgPj4+IDApO1xufTtcblxuY29uc3QgQkFTRTYyX0RJR0lUUyA9ICcwMTIzNDU2Nzg5YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XG5cbmZ1bmN0aW9uIHRvQmFzZTYyKG46IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChuID09PSAwKSB7XG5cdFx0cmV0dXJuICcwJztcblx0fVxuXHRsZXQgcmVzdWx0ID0gJyc7XG5cdHdoaWxlIChuID4gMCkge1xuXHRcdHJlc3VsdCA9IEJBU0U2Ml9ESUdJVFNbbiAlIEJBU0U2Ml9ESUdJVFMubGVuZ3RoXSArIHJlc3VsdDtcblx0XHRuID0gTWF0aC5mbG9vcihuIC8gQkFTRTYyX0RJR0lUUy5sZW5ndGgpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZygpOiBVc2VyQ29uZmlnIHtcblx0cmV0dXJuIHtcblx0XHRiYXNlOiAnL3ZpdGUvJyxcblxuXHRcdHNlcnZlcjoge1xuXHRcdFx0cG9ydDogNTE3Myxcblx0XHR9LFxuXG5cdFx0cGx1Z2luczogW1xuXHRcdFx0cGx1Z2luVnVlKCksXG5cdFx0XHRwbHVnaW5VbndpbmRDc3NNb2R1bGVDbGFzc05hbWUoKSxcblx0XHRcdHBsdWdpbkpzb241KCksXG5cdFx0XHQuLi5wcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nXG5cdFx0XHRcdD8gW1xuXHRcdFx0XHRcdHBsdWdpblJlcGxhY2Uoe1xuXHRcdFx0XHRcdFx0cHJldmVudEFzc2lnbm1lbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHR2YWx1ZXM6IHtcblx0XHRcdFx0XHRcdFx0J2lzQ2hyb21hdGljKCknOiBKU09OLnN0cmluZ2lmeShmYWxzZSksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdXG5cdFx0XHRcdDogW10sXG5cdFx0XSxcblxuXHRcdHJlc29sdmU6IHtcblx0XHRcdGV4dGVuc2lvbnMsXG5cdFx0XHRhbGlhczoge1xuXHRcdFx0XHQnQC8nOiBfX2Rpcm5hbWUgKyAnL3NyYy8nLFxuXHRcdFx0XHQnL2NsaWVudC1hc3NldHMvJzogX19kaXJuYW1lICsgJy9hc3NldHMvJyxcblx0XHRcdFx0Jy9zdGF0aWMtYXNzZXRzLyc6IF9fZGlybmFtZSArICcvLi4vYmFja2VuZC9hc3NldHMvJyxcblx0XHRcdFx0Jy9mbHVlbnQtZW1vamlzLyc6IF9fZGlybmFtZSArICcvLi4vLi4vZmx1ZW50LWVtb2ppcy9kaXN0LycsXG5cdFx0XHRcdCcvZmx1ZW50LWVtb2ppLyc6IF9fZGlybmFtZSArICcvLi4vLi4vZmx1ZW50LWVtb2ppcy9kaXN0LycsXG5cdFx0XHR9LFxuXHRcdH0sXG5cblx0XHRjc3M6IHtcblx0XHRcdG1vZHVsZXM6IHtcblx0XHRcdFx0Z2VuZXJhdGVTY29wZWROYW1lKG5hbWUsIGZpbGVuYW1lLCBfY3NzKTogc3RyaW5nIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IChwYXRoLnJlbGF0aXZlKF9fZGlybmFtZSwgZmlsZW5hbWUuc3BsaXQoJz8nKVswXSkgKyAnLScgKyBuYW1lKS5yZXBsYWNlKC9bXFxcXFxcL1xcLlxcPyY9XS9nLCAnLScpLnJlcGxhY2UoLyhzcmMtfHZ1ZS0pL2csICcnKTtcblx0XHRcdFx0XHRpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuICd4JyArIHRvQmFzZTYyKGhhc2goaWQpKS5zdWJzdHJpbmcoMCwgNCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBpZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cblx0XHRkZWZpbmU6IHtcblx0XHRcdF9WRVJTSU9OXzogSlNPTi5zdHJpbmdpZnkobWV0YS52ZXJzaW9uKSxcblx0XHRcdF9MQU5HU186IEpTT04uc3RyaW5naWZ5KE9iamVjdC5lbnRyaWVzKGxvY2FsZXMpLm1hcCgoW2ssIHZdKSA9PiBbaywgdi5fbGFuZ19dKSksXG5cdFx0XHRfRU5WXzogSlNPTi5zdHJpbmdpZnkocHJvY2Vzcy5lbnYuTk9ERV9FTlYpLFxuXHRcdFx0X0RFVl86IHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicsXG5cdFx0XHRfUEVSRl9QUkVGSVhfOiBKU09OLnN0cmluZ2lmeSgnTWlzc2tleTonKSxcblx0XHRcdF9EQVRBX1RSQU5TRkVSX0RSSVZFX0ZJTEVfOiBKU09OLnN0cmluZ2lmeSgnbWtfZHJpdmVfZmlsZScpLFxuXHRcdFx0X0RBVEFfVFJBTlNGRVJfRFJJVkVfRk9MREVSXzogSlNPTi5zdHJpbmdpZnkoJ21rX2RyaXZlX2ZvbGRlcicpLFxuXHRcdFx0X0RBVEFfVFJBTlNGRVJfREVDS19DT0xVTU5fOiBKU09OLnN0cmluZ2lmeSgnbWtfZGVja19jb2x1bW4nKSxcblx0XHRcdF9fVlVFX09QVElPTlNfQVBJX186IHRydWUsXG5cdFx0XHRfX1ZVRV9QUk9EX0RFVlRPT0xTX186IGZhbHNlLFxuXHRcdH0sXG5cblx0XHRidWlsZDoge1xuXHRcdFx0dGFyZ2V0OiBbXG5cdFx0XHRcdCdjaHJvbWUxMTYnLFxuXHRcdFx0XHQnZmlyZWZveDExNicsXG5cdFx0XHRcdCdzYWZhcmkxNicsXG5cdFx0XHRdLFxuXHRcdFx0bWFuaWZlc3Q6ICdtYW5pZmVzdC5qc29uJyxcblx0XHRcdHJvbGx1cE9wdGlvbnM6IHtcblx0XHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0XHRhcHA6ICcuL3NyYy9fYm9vdF8udHMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleHRlcm5hbDogZXh0ZXJuYWxQYWNrYWdlcy5tYXAocCA9PiBwLm1hdGNoKSxcblx0XHRcdFx0b3V0cHV0OiB7XG5cdFx0XHRcdFx0bWFudWFsQ2h1bmtzOiB7XG5cdFx0XHRcdFx0XHR2dWU6IFsndnVlJ10sXG5cdFx0XHRcdFx0XHRwaG90b3N3aXBlOiBbJ3Bob3Rvc3dpcGUnLCAncGhvdG9zd2lwZS9saWdodGJveCcsICdwaG90b3N3aXBlL3N0eWxlLmNzcyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2h1bmtGaWxlTmFtZXM6IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicgPyAnW2hhc2g6OF0uanMnIDogJ1tuYW1lXS1baGFzaDo4XS5qcycsXG5cdFx0XHRcdFx0YXNzZXRGaWxlTmFtZXM6IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicgPyAnW2hhc2g6OF1bZXh0bmFtZV0nIDogJ1tuYW1lXS1baGFzaDo4XVtleHRuYW1lXScsXG5cdFx0XHRcdFx0cGF0aHMoaWQpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBleHRlcm5hbFBhY2thZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChwLm1hdGNoLnRlc3QoaWQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHAucGF0aChpZCwgcC5tYXRjaCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0Y3NzQ29kZVNwbGl0OiB0cnVlLFxuXHRcdFx0b3V0RGlyOiBfX2Rpcm5hbWUgKyAnLy4uLy4uL2J1aWx0L192aXRlXycsXG5cdFx0XHRhc3NldHNEaXI6ICcuJyxcblx0XHRcdGVtcHR5T3V0RGlyOiBmYWxzZSxcblx0XHRcdHNvdXJjZW1hcDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcsXG5cdFx0XHRyZXBvcnRDb21wcmVzc2VkU2l6ZTogZmFsc2UsXG5cblx0XHRcdC8vIGh0dHBzOi8vdml0ZWpzLmRldi9ndWlkZS9kZXAtcHJlLWJ1bmRsaW5nLmh0bWwjbW9ub3JlcG9zLWFuZC1saW5rZWQtZGVwZW5kZW5jaWVzXG5cdFx0XHRjb21tb25qc09wdGlvbnM6IHtcblx0XHRcdFx0aW5jbHVkZTogWy9taXNza2V5LWpzLywgL21pc3NrZXktcmV2ZXJzaS8sIC9taXNza2V5LWJ1YmJsZS1nYW1lLywgL25vZGVfbW9kdWxlcy9dLFxuXHRcdFx0fSxcblx0XHR9LFxuXG5cdFx0d29ya2VyOiB7XG5cdFx0XHRmb3JtYXQ6ICdlcycsXG5cdFx0fSxcblxuXHRcdHRlc3Q6IHtcblx0XHRcdGVudmlyb25tZW50OiAnaGFwcHktZG9tJyxcblx0XHRcdGRlcHM6IHtcblx0XHRcdFx0b3B0aW1pemVyOiB7XG5cdFx0XHRcdFx0d2ViOiB7XG5cdFx0XHRcdFx0XHRpbmNsdWRlOiBbXG5cdFx0XHRcdFx0XHRcdC8vIFhYWDogbWlzc2tleS1kZXYvYnJvd3Nlci1pbWFnZS1yZXNpemVyIGhhcyBubyBcInR5cGVcIjogXCJtb2R1bGVcIlxuXHRcdFx0XHRcdFx0XHQnYnJvd3Nlci1pbWFnZS1yZXNpemVyJyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRpbmNsdWRlU291cmNlOiBbJ3NyYy8qKi8qLnRzJ10sXG5cdFx0fSxcblx0fTtcbn1cblxuY29uc3QgY29uZmlnID0gZGVmaW5lQ29uZmlnKCh7IGNvbW1hbmQsIG1vZGUgfSkgPT4gZ2V0Q29uZmlnKCkpO1xuXG5leHBvcnQgZGVmYXVsdCBjb25maWc7XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi93b3Jrc3BhY2UvbG9jYWxlc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3dvcmtzcGFjZS9sb2NhbGVzL2luZGV4LmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy93b3Jrc3BhY2UvbG9jYWxlcy9pbmRleC5qc1wiOy8qKlxuICogTGFuZ3VhZ2VzIExvYWRlclxuICovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ25vZGU6ZnMnO1xuaW1wb3J0ICogYXMgeWFtbCBmcm9tICdqcy15YW1sJztcblxuY29uc3QgbWVyZ2UgPSAoLi4uYXJncykgPT4gYXJncy5yZWR1Y2UoKGEsIGMpID0+ICh7XG5cdC4uLmEsXG5cdC4uLmMsXG5cdC4uLk9iamVjdC5lbnRyaWVzKGEpXG5cdFx0LmZpbHRlcigoW2tdKSA9PiBjICYmIHR5cGVvZiBjW2tdID09PSAnb2JqZWN0Jylcblx0XHQucmVkdWNlKChhLCBbaywgdl0pID0+IChhW2tdID0gbWVyZ2UodiwgY1trXSksIGEpLCB7fSlcbn0pLCB7fSk7XG5cbmNvbnN0IGxhbmd1YWdlcyA9IFtcblx0J2FyLVNBJyxcblx0J2NzLUNaJyxcblx0J2RhLURLJyxcblx0J2RlLURFJyxcblx0J2VuLVVTJyxcblx0J2VzLUVTJyxcblx0J2ZyLUZSJyxcblx0J2lkLUlEJyxcblx0J2l0LUlUJyxcblx0J2phLUpQJyxcblx0J2phLUtTJyxcblx0J2thYi1LQUInLFxuXHQna24tSU4nLFxuXHQna28tS1InLFxuXHQnbmwtTkwnLFxuXHQnbm8tTk8nLFxuXHQncGwtUEwnLFxuXHQncHQtUFQnLFxuXHQncnUtUlUnLFxuXHQnc2stU0snLFxuXHQndGgtVEgnLFxuXHQndWctQ04nLFxuXHQndWstVUEnLFxuXHQndmktVk4nLFxuXHQnemgtQ04nLFxuXHQnemgtVFcnLFxuXTtcblxuY29uc3QgcHJpbWFyaWVzID0ge1xuXHQnZW4nOiAnVVMnLFxuXHQnamEnOiAnSlAnLFxuXHQnemgnOiAnQ04nLFxufTtcblxuLy8gXHU0RjU1XHU2NTQ1XHUzMDRCXHU2NTg3XHU1QjU3XHU1MjE3XHUzMDZCXHUzMEQwXHUzMEMzXHUzMEFGXHUzMEI5XHUzMERBXHUzMEZDXHUzMEI5XHU2NTg3XHU1QjU3XHUzMDRDXHU2REY3XHU1MTY1XHUzMDU5XHUzMDhCXHUzMDUzXHUzMDY4XHUzMDRDXHUzMDQyXHUzMDhBXHUzMDAxWUFNTFx1MzA0Q1x1NThDQVx1MzA4Q1x1MzA4Qlx1MzA2RVx1MzA2N1x1NTNENlx1MzA4QVx1OTY2NFx1MzA0RlxuY29uc3QgY2xlYW4gPSAodGV4dCkgPT4gdGV4dC5yZXBsYWNlKG5ldyBSZWdFeHAoU3RyaW5nLmZyb21Db2RlUG9pbnQoMHgwOCksICdnJyksICcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkKCkge1xuXHQvLyB2aXRlc3RcdTMwNkVcdTYzMTlcdTUyRDVcdTMwOTJcdThBQkZcdTY1NzRcdTMwNTlcdTMwOEJcdTMwNUZcdTMwODFcdTMwMDFcdTRFMDBcdTVFQTZcdTMwRURcdTMwRkNcdTMwQUJcdTMwRUJcdTU5MDlcdTY1NzBcdTUzMTZcdTMwNTlcdTMwOEJcdTVGQzVcdTg5ODFcdTMwNENcdTMwNDJcdTMwOEJcblx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL3ZpdGVzdC1kZXYvdml0ZXN0L2lzc3Vlcy8zOTg4I2lzc3VlY29tbWVudC0xNjg2NTk5NTc3XG5cdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taXNza2V5LWRldi9taXNza2V5L3B1bGwvMTQwNTcjaXNzdWVjb21tZW50LTIxOTI4MzM3ODVcblx0Y29uc3QgbWV0YVVybCA9IGltcG9ydC5tZXRhLnVybDtcblx0Y29uc3QgbG9jYWxlcyA9IGxhbmd1YWdlcy5yZWR1Y2UoKGEsIGMpID0+IChhW2NdID0geWFtbC5sb2FkKGNsZWFuKGZzLnJlYWRGaWxlU3luYyhuZXcgVVJMKGAke2N9LnltbGAsIG1ldGFVcmwpLCAndXRmLTgnKSkpIHx8IHt9LCBhKSwge30pO1xuXG5cdC8vIFx1N0E3QVx1NjU4N1x1NUI1N1x1NTIxN1x1MzA0Q1x1NTE2NVx1MzA4Qlx1MzA1M1x1MzA2OFx1MzA0Q1x1MzA0Mlx1MzA4QVx1MzAwMVx1MzBENVx1MzBBOVx1MzBGQ1x1MzBFQlx1MzBEMFx1MzBDM1x1MzBBRlx1MzA0Q1x1NTJENVx1NEY1Q1x1MzA1N1x1MzA2QVx1MzA0Rlx1MzA2QVx1MzA4Qlx1MzA2RVx1MzA2N1x1MzBEN1x1MzBFRFx1MzBEMVx1MzBDNlx1MzBBM1x1MzA1NFx1MzA2OFx1NkQ4OFx1MzA1OVxuXHRjb25zdCByZW1vdmVFbXB0eSA9IChvYmopID0+IHtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XG5cdFx0XHRpZiAodiA9PT0gJycpIHtcblx0XHRcdFx0ZGVsZXRlIG9ialtrXTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHYgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJlbW92ZUVtcHR5KHYpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb2JqO1xuXHR9O1xuXHRyZW1vdmVFbXB0eShsb2NhbGVzKTtcblxuXHRyZXR1cm4gT2JqZWN0LmVudHJpZXMobG9jYWxlcylcblx0XHQucmVkdWNlKChhLCBbaywgdl0pID0+IChhW2tdID0gKCgpID0+IHtcblx0XHRcdGNvbnN0IFtsYW5nXSA9IGsuc3BsaXQoJy0nKTtcblx0XHRcdHN3aXRjaCAoaykge1xuXHRcdFx0XHRjYXNlICdqYS1KUCc6IHJldHVybiB2O1xuXHRcdFx0XHRjYXNlICdqYS1LUyc6XG5cdFx0XHRcdGNhc2UgJ2VuLVVTJzogcmV0dXJuIG1lcmdlKGxvY2FsZXNbJ2phLUpQJ10sIHYpO1xuXHRcdFx0XHRkZWZhdWx0OiByZXR1cm4gbWVyZ2UoXG5cdFx0XHRcdFx0bG9jYWxlc1snamEtSlAnXSxcblx0XHRcdFx0XHRsb2NhbGVzWydlbi1VUyddLFxuXHRcdFx0XHRcdGxvY2FsZXNbYCR7bGFuZ30tJHtwcmltYXJpZXNbbGFuZ119YF0gPz8ge30sXG5cdFx0XHRcdFx0dlxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKCksIGEpLCB7fSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGJ1aWxkKCk7XG4iLCAie1xuXHRcIm5hbWVcIjogXCJtaXNza2V5XCIsXG5cdFwidmVyc2lvblwiOiBcIjIwMjQuOC4wXCIsXG5cdFwiY29kZW5hbWVcIjogXCJuYXN1YmlcIixcblx0XCJyZXBvc2l0b3J5XCI6IHtcblx0XHRcInR5cGVcIjogXCJnaXRcIixcblx0XHRcInVybFwiOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9taXNza2V5LWRldi9taXNza2V5LmdpdFwiXG5cdH0sXG5cdFwicGFja2FnZU1hbmFnZXJcIjogXCJwbnBtQDkuNi4wXCIsXG5cdFwid29ya3NwYWNlc1wiOiBbXG5cdFx0XCJwYWNrYWdlcy9mcm9udGVuZFwiLFxuXHRcdFwicGFja2FnZXMvYmFja2VuZFwiLFxuXHRcdFwicGFja2FnZXMvc3dcIixcblx0XHRcInBhY2thZ2VzL21pc3NrZXktanNcIixcblx0XHRcInBhY2thZ2VzL21pc3NrZXktcmV2ZXJzaVwiLFxuXHRcdFwicGFja2FnZXMvbWlzc2tleS1idWJibGUtZ2FtZVwiXG5cdF0sXG5cdFwicHJpdmF0ZVwiOiB0cnVlLFxuXHRcInNjcmlwdHNcIjoge1xuXHRcdFwiYnVpbGQtcHJlXCI6IFwibm9kZSAuL3NjcmlwdHMvYnVpbGQtcHJlLmpzXCIsXG5cdFx0XCJidWlsZC1hc3NldHNcIjogXCJub2RlIC4vc2NyaXB0cy9idWlsZC1hc3NldHMubWpzXCIsXG5cdFx0XCJidWlsZFwiOiBcInBucG0gYnVpbGQtcHJlICYmIHBucG0gLXIgYnVpbGQgJiYgcG5wbSBidWlsZC1hc3NldHNcIixcblx0XHRcImJ1aWxkLXN0b3J5Ym9va1wiOiBcInBucG0gLS1maWx0ZXIgZnJvbnRlbmQgYnVpbGQtc3Rvcnlib29rXCIsXG5cdFx0XCJidWlsZC1taXNza2V5LWpzLXdpdGgtdHlwZXNcIjogXCJwbnBtIGJ1aWxkLXByZSAmJiBwbnBtIC0tZmlsdGVyIGJhY2tlbmQuLi4gLS1maWx0ZXI9IW1pc3NrZXktanMgYnVpbGQgJiYgcG5wbSAtLWZpbHRlciBiYWNrZW5kIGdlbmVyYXRlLWFwaS1qc29uIC0tbm8tYnVpbGQgJiYgbmNwIHBhY2thZ2VzL2JhY2tlbmQvYnVpbHQvYXBpLmpzb24gcGFja2FnZXMvbWlzc2tleS1qcy9nZW5lcmF0b3IvYXBpLmpzb24gJiYgcG5wbSAtLWZpbHRlciBtaXNza2V5LWpzIHVwZGF0ZS1hdXRvZ2VuLWNvZGUgJiYgcG5wbSAtLWZpbHRlciBtaXNza2V5LWpzIGJ1aWxkICYmIHBucG0gLS1maWx0ZXIgbWlzc2tleS1qcyBhcGlcIixcblx0XHRcInN0YXJ0XCI6IFwicG5wbSBjaGVjazpjb25uZWN0ICYmIGNkIHBhY2thZ2VzL2JhY2tlbmQgJiYgbm9kZSAuL2J1aWx0L2Jvb3QvZW50cnkuanNcIixcblx0XHRcInN0YXJ0OnRlc3RcIjogXCJjZCBwYWNrYWdlcy9iYWNrZW5kICYmIGNyb3NzLWVudiBOT0RFX0VOVj10ZXN0IG5vZGUgLi9idWlsdC9ib290L2VudHJ5LmpzXCIsXG5cdFx0XCJpbml0XCI6IFwicG5wbSBtaWdyYXRlXCIsXG5cdFx0XCJtaWdyYXRlXCI6IFwiY2QgcGFja2FnZXMvYmFja2VuZCAmJiBwbnBtIG1pZ3JhdGVcIixcblx0XHRcInJldmVydFwiOiBcImNkIHBhY2thZ2VzL2JhY2tlbmQgJiYgcG5wbSByZXZlcnRcIixcblx0XHRcImNoZWNrOmNvbm5lY3RcIjogXCJjZCBwYWNrYWdlcy9iYWNrZW5kICYmIHBucG0gY2hlY2s6Y29ubmVjdFwiLFxuXHRcdFwibWlncmF0ZWFuZHN0YXJ0XCI6IFwicG5wbSBtaWdyYXRlICYmIHBucG0gc3RhcnRcIixcblx0XHRcIndhdGNoXCI6IFwicG5wbSBkZXZcIixcblx0XHRcImRldlwiOiBcIm5vZGUgc2NyaXB0cy9kZXYubWpzXCIsXG5cdFx0XCJsaW50XCI6IFwicG5wbSAtciBsaW50XCIsXG5cdFx0XCJjeTpvcGVuXCI6IFwicG5wbSBjeXByZXNzIG9wZW4gLS1icm93c2VyIC0tZTJlIC0tY29uZmlnLWZpbGU9Y3lwcmVzcy5jb25maWcudHNcIixcblx0XHRcImN5OnJ1blwiOiBcInBucG0gY3lwcmVzcyBydW5cIixcblx0XHRcImUyZVwiOiBcInBucG0gc3RhcnQtc2VydmVyLWFuZC10ZXN0IHN0YXJ0OnRlc3QgaHR0cDovL2xvY2FsaG9zdDo2MTgxMiBjeTpydW5cIixcblx0XHRcImplc3RcIjogXCJjZCBwYWNrYWdlcy9iYWNrZW5kICYmIHBucG0gamVzdFwiLFxuXHRcdFwiamVzdC1hbmQtY292ZXJhZ2VcIjogXCJjZCBwYWNrYWdlcy9iYWNrZW5kICYmIHBucG0gamVzdC1hbmQtY292ZXJhZ2VcIixcblx0XHRcInRlc3RcIjogXCJwbnBtIC1yIHRlc3RcIixcblx0XHRcInRlc3QtYW5kLWNvdmVyYWdlXCI6IFwicG5wbSAtciB0ZXN0LWFuZC1jb3ZlcmFnZVwiLFxuXHRcdFwiY2xlYW5cIjogXCJub2RlIC4vc2NyaXB0cy9jbGVhbi5qc1wiLFxuXHRcdFwiY2xlYW4tYWxsXCI6IFwibm9kZSAuL3NjcmlwdHMvY2xlYW4tYWxsLmpzXCIsXG5cdFx0XCJjbGVhbmFsbFwiOiBcInBucG0gY2xlYW4tYWxsXCJcblx0fSxcblx0XCJyZXNvbHV0aW9uc1wiOiB7XG5cdFx0XCJjaG9raWRhclwiOiBcIjMuNS4zXCIsXG5cdFx0XCJsb2Rhc2hcIjogXCI0LjE3LjIxXCJcblx0fSxcblx0XCJkZXBlbmRlbmNpZXNcIjoge1xuXHRcdFwiY3NzbmFub1wiOiBcIjYuMS4yXCIsXG5cdFx0XCJleGVjYVwiOiBcIjguMC4xXCIsXG5cdFx0XCJmYXN0LWdsb2JcIjogXCIzLjMuMlwiLFxuXHRcdFwiaWdub3JlLXdhbGtcIjogXCI2LjAuNVwiLFxuXHRcdFwianMteWFtbFwiOiBcIjQuMS4wXCIsXG5cdFx0XCJwb3N0Y3NzXCI6IFwiOC40LjQwXCIsXG5cdFx0XCJ0YXJcIjogXCI2LjIuMVwiLFxuXHRcdFwidGVyc2VyXCI6IFwiNS4zMS4zXCIsXG5cdFx0XCJ0eXBlc2NyaXB0XCI6IFwiNS41LjRcIixcblx0XHRcImVzYnVpbGRcIjogXCIwLjIzLjBcIixcblx0XHRcImdsb2JcIjogXCIxMS4wLjBcIlxuXHR9LFxuXHRcImRldkRlcGVuZGVuY2llc1wiOiB7XG5cdFx0XCJAbWlzc2tleS1kZXYvZXNsaW50LXBsdWdpblwiOiBcIjIuMC4zXCIsXG5cdFx0XCJAdHlwZXMvbm9kZVwiOiBcIjIwLjE0LjEyXCIsXG5cdFx0XCJAdHlwZXNjcmlwdC1lc2xpbnQvZXNsaW50LXBsdWdpblwiOiBcIjcuMTcuMFwiLFxuXHRcdFwiQHR5cGVzY3JpcHQtZXNsaW50L3BhcnNlclwiOiBcIjcuMTcuMFwiLFxuXHRcdFwiY3Jvc3MtZW52XCI6IFwiNy4wLjNcIixcblx0XHRcImN5cHJlc3NcIjogXCIxMy4xMy4xXCIsXG5cdFx0XCJlc2xpbnRcIjogXCI5LjguMFwiLFxuXHRcdFwiZ2xvYmFsc1wiOiBcIjE1LjguMFwiLFxuXHRcdFwibmNwXCI6IFwiMi4wLjBcIixcblx0XHRcInN0YXJ0LXNlcnZlci1hbmQtdGVzdFwiOiBcIjIuMC40XCJcblx0fSxcblx0XCJvcHRpb25hbERlcGVuZGVuY2llc1wiOiB7XG5cdFx0XCJAdGVuc29yZmxvdy90ZmpzLWNvcmVcIjogXCI0LjQuMFwiXG5cdH1cbn1cbiIsICJ7XG5cdFwibmFtZVwiOiBcImZyb250ZW5kXCIsXG5cdFwicHJpdmF0ZVwiOiB0cnVlLFxuXHRcInR5cGVcIjogXCJtb2R1bGVcIixcblx0XCJzY3JpcHRzXCI6IHtcblx0XHRcIndhdGNoXCI6IFwidml0ZVwiLFxuXHRcdFwiZGV2XCI6IFwidml0ZSAtLWNvbmZpZyB2aXRlLmNvbmZpZy5sb2NhbC1kZXYudHMgLS1kZWJ1ZyBobXJcIixcblx0XHRcImJ1aWxkXCI6IFwidml0ZSBidWlsZFwiLFxuXHRcdFwic3Rvcnlib29rLWRldlwiOiBcIm5vZGVtb24gLS12ZXJib3NlIC0td2F0Y2ggc3JjIC0tZXh0IFxcXCJtZHgsdHMsdnVlXFxcIiAtLWlnbm9yZSBcXFwiKi5zdG9yaWVzLnRzXFxcIiAtLWV4ZWMgXFxcInBucG0gYnVpbGQtc3Rvcnlib29rLXByZSAmJiBwbnBtIGV4ZWMgc3Rvcnlib29rIGRldiAtcCA2MDA2IC0tY2lcXFwiXCIsXG5cdFx0XCJidWlsZC1zdG9yeWJvb2stcHJlXCI6IFwiKHRzYyAtcCAuc3Rvcnlib29rIHx8IGVjaG8gZG9uZS4pICYmIG5vZGUgLnN0b3J5Ym9vay9nZW5lcmF0ZS5qcyAmJiBub2RlIC5zdG9yeWJvb2svcHJlbG9hZC1sb2NhbGUuanMgJiYgbm9kZSAuc3Rvcnlib29rL3ByZWxvYWQtdGhlbWUuanNcIixcblx0XHRcImJ1aWxkLXN0b3J5Ym9va1wiOiBcInBucG0gYnVpbGQtc3Rvcnlib29rLXByZSAmJiBzdG9yeWJvb2sgYnVpbGQgLS13ZWJwYWNrLXN0YXRzLWpzb24gc3Rvcnlib29rLXN0YXRpY1wiLFxuXHRcdFwiY2hyb21hdGljXCI6IFwiY2hyb21hdGljXCIsXG5cdFx0XCJ0ZXN0XCI6IFwidml0ZXN0IC0tcnVuIC0tZ2xvYmFsc1wiLFxuXHRcdFwidGVzdC1hbmQtY292ZXJhZ2VcIjogXCJ2aXRlc3QgLS1ydW4gLS1jb3ZlcmFnZSAtLWdsb2JhbHNcIixcblx0XHRcInR5cGVjaGVja1wiOiBcInZ1ZS10c2MgLS1ub0VtaXRcIixcblx0XHRcImVzbGludFwiOiBcImVzbGludCAtLXF1aWV0IFxcXCJzcmMvKiovKi57dHMsdnVlfVxcXCJcIixcblx0XHRcImxpbnRcIjogXCJwbnBtIHR5cGVjaGVjayAmJiBwbnBtIGVzbGludFwiXG5cdH0sXG5cdFwiZGVwZW5kZW5jaWVzXCI6IHtcblx0XHRcIkBkaXNjb3JkYXBwL3R3ZW1vamlcIjogXCIxNS4wLjNcIixcblx0XHRcIkBnaXRodWIvd2ViYXV0aG4tanNvblwiOiBcIjIuMS4xXCIsXG5cdFx0XCJAbWNhcHRjaGEvdmFuaWxsYS1nbHVlXCI6IFwiMC4xLjAtYWxwaGEtM1wiLFxuXHRcdFwiQG1pc3NrZXktZGV2L2Jyb3dzZXItaW1hZ2UtcmVzaXplclwiOiBcIjIwMjQuMS4wXCIsXG5cdFx0XCJAcm9sbHVwL3BsdWdpbi1qc29uXCI6IFwiNi4xLjBcIixcblx0XHRcIkByb2xsdXAvcGx1Z2luLXJlcGxhY2VcIjogXCI1LjAuN1wiLFxuXHRcdFwiQHJvbGx1cC9wbHVnaW51dGlsc1wiOiBcIjUuMS4wXCIsXG5cdFx0XCJAc3l1aWxvL2Fpc2NyaXB0XCI6IFwiMC4xOS4wXCIsXG5cdFx0XCJAdGFibGVyL2ljb25zLXdlYmZvbnRcIjogXCIzLjMuMFwiLFxuXHRcdFwiQHR3ZW1vamkvcGFyc2VyXCI6IFwiMTUuMS4xXCIsXG5cdFx0XCJAdml0ZWpzL3BsdWdpbi12dWVcIjogXCI1LjEuMFwiLFxuXHRcdFwiQHZ1ZS9jb21waWxlci1zZmNcIjogXCIzLjQuMzdcIixcblx0XHRcImFpc2NyaXB0LXZzY29kZVwiOiBcImdpdGh1YjphaXNjcmlwdC1kZXYvYWlzY3JpcHQtdnNjb2RlI3YwLjEuMTFcIixcblx0XHRcImFzdHJpbmdcIjogXCIxLjguNlwiLFxuXHRcdFwiYnJvYWRjYXN0LWNoYW5uZWxcIjogXCI3LjAuMFwiLFxuXHRcdFwiYnVyYWhhXCI6IFwiMC4wLjFcIixcblx0XHRcImNhbnZhcy1jb25mZXR0aVwiOiBcIjEuOS4zXCIsXG5cdFx0XCJjaGFydC5qc1wiOiBcIjQuNC4zXCIsXG5cdFx0XCJjaGFydGpzLWFkYXB0ZXItZGF0ZS1mbnNcIjogXCIzLjAuMFwiLFxuXHRcdFwiY2hhcnRqcy1jaGFydC1tYXRyaXhcIjogXCIyLjAuMVwiLFxuXHRcdFwiY2hhcnRqcy1wbHVnaW4tZ3JhZGllbnRcIjogXCIwLjYuMVwiLFxuXHRcdFwiY2hhcnRqcy1wbHVnaW4tem9vbVwiOiBcIjIuMC4xXCIsXG5cdFx0XCJjaHJvbWF0aWNcIjogXCIxMS41LjZcIixcblx0XHRcImNvbXBhcmUtdmVyc2lvbnNcIjogXCI2LjEuMVwiLFxuXHRcdFwiY3JvcHBlcmpzXCI6IFwiMi4wLjAtcmMuMVwiLFxuXHRcdFwiZGF0ZS1mbnNcIjogXCIyLjMwLjBcIixcblx0XHRcImVzY2FwZS1yZWdleHBcIjogXCIwLjAuMVwiLFxuXHRcdFwiZXN0cmVlLXdhbGtlclwiOiBcIjMuMC4zXCIsXG5cdFx0XCJldmVudGVtaXR0ZXIzXCI6IFwiNS4wLjFcIixcblx0XHRcImlkYi1rZXl2YWxcIjogXCI2LjIuMVwiLFxuXHRcdFwiaW5zZXJ0LXRleHQtYXQtY3Vyc29yXCI6IFwiMC4zLjBcIixcblx0XHRcImlzLWZpbGUtYW5pbWF0ZWRcIjogXCIxLjAuMlwiLFxuXHRcdFwianNvbjVcIjogXCIyLjIuM1wiLFxuXHRcdFwibWF0dGVyLWpzXCI6IFwiMC4xOS4wXCIsXG5cdFx0XCJtZm0tanNcIjogXCIwLjI0LjBcIixcblx0XHRcIm1pc3NrZXktYnViYmxlLWdhbWVcIjogXCJ3b3Jrc3BhY2U6KlwiLFxuXHRcdFwibWlzc2tleS1qc1wiOiBcIndvcmtzcGFjZToqXCIsXG5cdFx0XCJtaXNza2V5LXJldmVyc2lcIjogXCJ3b3Jrc3BhY2U6KlwiLFxuXHRcdFwicGhvdG9zd2lwZVwiOiBcIjUuNC40XCIsXG5cdFx0XCJwdW55Y29kZVwiOiBcIjIuMy4xXCIsXG5cdFx0XCJyb2xsdXBcIjogXCI0LjE5LjFcIixcblx0XHRcInNhbml0aXplLWh0bWxcIjogXCIyLjEzLjBcIixcblx0XHRcInNhc3NcIjogXCIxLjc3LjhcIixcblx0XHRcInNoaWtpXCI6IFwiMS4xMi4wXCIsXG5cdFx0XCJzdHJpY3QtZXZlbnQtZW1pdHRlci10eXBlc1wiOiBcIjIuMC4wXCIsXG5cdFx0XCJ0ZXh0YXJlYS1jYXJldFwiOiBcIjMuMS4wXCIsXG5cdFx0XCJ0aHJlZVwiOiBcIjAuMTY3LjBcIixcblx0XHRcInRocm90dGxlLWRlYm91bmNlXCI6IFwiNS4wLjJcIixcblx0XHRcInRpbnljb2xvcjJcIjogXCIxLjYuMFwiLFxuXHRcdFwidHNjLWFsaWFzXCI6IFwiMS44LjEwXCIsXG5cdFx0XCJ0c2NvbmZpZy1wYXRoc1wiOiBcIjQuMi4wXCIsXG5cdFx0XCJ0eXBlc2NyaXB0XCI6IFwiNS41LjRcIixcblx0XHRcInV1aWRcIjogXCIxMC4wLjBcIixcblx0XHRcInYtY29kZS1kaWZmXCI6IFwiMS4xMi4wXCIsXG5cdFx0XCJ2aXRlXCI6IFwiNS4zLjVcIixcblx0XHRcInZ1ZVwiOiBcIjMuNC4zN1wiLFxuXHRcdFwidnVlZHJhZ2dhYmxlXCI6IFwibmV4dFwiXG5cdH0sXG5cdFwiZGV2RGVwZW5kZW5jaWVzXCI6IHtcblx0XHRcIkBtaXNza2V5LWRldi9zdW1tYWx5XCI6IFwiNS4xLjBcIixcblx0XHRcIkBzdG9yeWJvb2svYWRkb24tYWN0aW9uc1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL2FkZG9uLWVzc2VudGlhbHNcIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay9hZGRvbi1pbnRlcmFjdGlvbnNcIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay9hZGRvbi1saW5rc1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL2FkZG9uLW1keC1nZm1cIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay9hZGRvbi1zdG9yeXNvdXJjZVwiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL2Jsb2Nrc1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL2NvbXBvbmVudHNcIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay9jb3JlLWV2ZW50c1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL21hbmFnZXItYXBpXCI6IFwiOC4yLjZcIixcblx0XHRcIkBzdG9yeWJvb2svcHJldmlldy1hcGlcIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay9yZWFjdFwiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL3JlYWN0LXZpdGVcIjogXCI4LjIuNlwiLFxuXHRcdFwiQHN0b3J5Ym9vay90ZXN0XCI6IFwiOC4yLjZcIixcblx0XHRcIkBzdG9yeWJvb2svdGhlbWluZ1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL3R5cGVzXCI6IFwiOC4yLjZcIixcblx0XHRcIkBzdG9yeWJvb2svdnVlM1wiOiBcIjguMi42XCIsXG5cdFx0XCJAc3Rvcnlib29rL3Z1ZTMtdml0ZVwiOiBcIjguMS4xMVwiLFxuXHRcdFwiQHRlc3RpbmctbGlicmFyeS92dWVcIjogXCI4LjEuMFwiLFxuXHRcdFwiQHR5cGVzL2NhbnZhcy1jb25mZXR0aVwiOiBcIl4xLjYuNFwiLFxuXHRcdFwiQHR5cGVzL2VzY2FwZS1yZWdleHBcIjogXCIwLjAuM1wiLFxuXHRcdFwiQHR5cGVzL2VzdHJlZVwiOiBcIjEuMC41XCIsXG5cdFx0XCJAdHlwZXMvbWF0dGVyLWpzXCI6IFwiMC4xOS43XCIsXG5cdFx0XCJAdHlwZXMvbWljcm9tYXRjaFwiOiBcIjQuMC45XCIsXG5cdFx0XCJAdHlwZXMvbm9kZVwiOiBcIjIwLjE0LjEyXCIsXG5cdFx0XCJAdHlwZXMvcHVueWNvZGVcIjogXCIyLjEuNFwiLFxuXHRcdFwiQHR5cGVzL3Nhbml0aXplLWh0bWxcIjogXCIyLjExLjBcIixcblx0XHRcIkB0eXBlcy9zZWVkcmFuZG9tXCI6IFwiMy4wLjhcIixcblx0XHRcIkB0eXBlcy90aHJvdHRsZS1kZWJvdW5jZVwiOiBcIjUuMC4yXCIsXG5cdFx0XCJAdHlwZXMvdGlueWNvbG9yMlwiOiBcIjEuNC42XCIsXG5cdFx0XCJAdHlwZXMvdXVpZFwiOiBcIjEwLjAuMFwiLFxuXHRcdFwiQHR5cGVzL3dzXCI6IFwiOC41LjExXCIsXG5cdFx0XCJAdHlwZXNjcmlwdC1lc2xpbnQvZXNsaW50LXBsdWdpblwiOiBcIjcuMTcuMFwiLFxuXHRcdFwiQHR5cGVzY3JpcHQtZXNsaW50L3BhcnNlclwiOiBcIjcuMTcuMFwiLFxuXHRcdFwiQHZpdGVzdC9jb3ZlcmFnZS12OFwiOiBcIjEuNi4wXCIsXG5cdFx0XCJAdnVlL3J1bnRpbWUtY29yZVwiOiBcIjMuNC4zN1wiLFxuXHRcdFwiYWNvcm5cIjogXCI4LjEyLjFcIixcblx0XHRcImNyb3NzLWVudlwiOiBcIjcuMC4zXCIsXG5cdFx0XCJjeXByZXNzXCI6IFwiMTMuMTMuMVwiLFxuXHRcdFwiZXNsaW50LXBsdWdpbi1pbXBvcnRcIjogXCIyLjI5LjFcIixcblx0XHRcImVzbGludC1wbHVnaW4tdnVlXCI6IFwiOS4yNy4wXCIsXG5cdFx0XCJmYXN0LWdsb2JcIjogXCIzLjMuMlwiLFxuXHRcdFwiaGFwcHktZG9tXCI6IFwiMTAuMC4zXCIsXG5cdFx0XCJpbnRlcnNlY3Rpb24tb2JzZXJ2ZXJcIjogXCIwLjEyLjJcIixcblx0XHRcIm1pY3JvbWF0Y2hcIjogXCI0LjAuN1wiLFxuXHRcdFwibXN3XCI6IFwiMi4zLjRcIixcblx0XHRcIm1zdy1zdG9yeWJvb2stYWRkb25cIjogXCIyLjAuM1wiLFxuXHRcdFwibm9kZW1vblwiOiBcIjMuMS40XCIsXG5cdFx0XCJwcmV0dGllclwiOiBcIjMuMy4zXCIsXG5cdFx0XCJyZWFjdFwiOiBcIjE4LjMuMVwiLFxuXHRcdFwicmVhY3QtZG9tXCI6IFwiMTguMy4xXCIsXG5cdFx0XCJzZWVkcmFuZG9tXCI6IFwiMy4wLjVcIixcblx0XHRcInN0YXJ0LXNlcnZlci1hbmQtdGVzdFwiOiBcIjIuMC40XCIsXG5cdFx0XCJzdG9yeWJvb2tcIjogXCI4LjIuNlwiLFxuXHRcdFwic3Rvcnlib29rLWFkZG9uLW1pc3NrZXktdGhlbWVcIjogXCJnaXRodWI6bWlzc2tleS1kZXYvc3Rvcnlib29rLWFkZG9uLW1pc3NrZXktdGhlbWVcIixcblx0XHRcInZpdGUtcGx1Z2luLXR1cmJvc25hcFwiOiBcIjEuMC4zXCIsXG5cdFx0XCJ2aXRlc3RcIjogXCIxLjYuMFwiLFxuXHRcdFwidml0ZXN0LWZldGNoLW1vY2tcIjogXCIwLjIuMlwiLFxuXHRcdFwidnVlLWNvbXBvbmVudC10eXBlLWhlbHBlcnNcIjogXCIyLjAuMjlcIixcblx0XHRcInZ1ZS1lc2xpbnQtcGFyc2VyXCI6IFwiOS40LjNcIixcblx0XHRcInZ1ZS10c2NcIjogXCIyLjAuMjlcIlxuXHR9XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi93b3Jrc3BhY2UvcGFja2FnZXMvZnJvbnRlbmQvbGliXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvd29ya3NwYWNlL3BhY2thZ2VzL2Zyb250ZW5kL2xpYi9yb2xsdXAtcGx1Z2luLXVud2luZC1jc3MtbW9kdWxlLWNsYXNzLW5hbWUudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3dvcmtzcGFjZS9wYWNrYWdlcy9mcm9udGVuZC9saWIvcm9sbHVwLXBsdWdpbi11bndpbmQtY3NzLW1vZHVsZS1jbGFzcy1uYW1lLnRzXCI7LypcbiAqIFNQRFgtRmlsZUNvcHlyaWdodFRleHQ6IHN5dWlsbyBhbmQgbWlzc2tleS1wcm9qZWN0XG4gKiBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogQUdQTC0zLjAtb25seVxuICovXG5cbmltcG9ydCB7IGdlbmVyYXRlIH0gZnJvbSAnYXN0cmluZyc7XG5pbXBvcnQgKiBhcyBlc3RyZWUgZnJvbSAnZXN0cmVlJztcbmltcG9ydCB7IHdhbGsgfSBmcm9tICcuLi9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmMvaW5kZXguanMnO1xuaW1wb3J0IHR5cGUgKiBhcyBlc3RyZWVXYWxrZXIgZnJvbSAnZXN0cmVlLXdhbGtlcic7XG5pbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gJ3ZpdGUnO1xuXG5mdW5jdGlvbiBpc0ZhbHN5SWRlbnRpZmllcihpZGVudGlmaWVyOiBlc3RyZWUuSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaWRlbnRpZmllci5uYW1lID09PSAndW5kZWZpbmVkJyB8fCBpZGVudGlmaWVyLm5hbWUgPT09ICdOYU4nO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVDbGFzc1dhbGtlcih0cmVlOiBlc3RyZWUuTm9kZSwgc3RhY2s6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuXHRpZiAodHJlZS50eXBlID09PSAnSWRlbnRpZmllcicpIHJldHVybiBpc0ZhbHN5SWRlbnRpZmllcih0cmVlKSA/ICcnIDogbnVsbDtcblx0aWYgKHRyZWUudHlwZSA9PT0gJ0xpdGVyYWwnKSByZXR1cm4gdHlwZW9mIHRyZWUudmFsdWUgPT09ICdzdHJpbmcnID8gdHJlZS52YWx1ZSA6ICcnO1xuXHRpZiAodHJlZS50eXBlID09PSAnQmluYXJ5RXhwcmVzc2lvbicpIHtcblx0XHRpZiAodHJlZS5vcGVyYXRvciAhPT0gJysnKSByZXR1cm4gbnVsbDtcblx0XHRjb25zdCBsZWZ0ID0gbm9ybWFsaXplQ2xhc3NXYWxrZXIodHJlZS5sZWZ0LCBzdGFjayk7XG5cdFx0Y29uc3QgcmlnaHQgPSBub3JtYWxpemVDbGFzc1dhbGtlcih0cmVlLnJpZ2h0LCBzdGFjayk7XG5cdFx0aWYgKGxlZnQgPT09IG51bGwgfHwgcmlnaHQgPT09IG51bGwpIHJldHVybiBudWxsO1xuXHRcdHJldHVybiBgJHtsZWZ0fSR7cmlnaHR9YDtcblx0fVxuXHRpZiAodHJlZS50eXBlID09PSAnVGVtcGxhdGVMaXRlcmFsJykge1xuXHRcdGlmICh0cmVlLmV4cHJlc3Npb25zLnNvbWUoKHgpID0+IHgudHlwZSAhPT0gJ0xpdGVyYWwnICYmICh4LnR5cGUgIT09ICdJZGVudGlmaWVyJyB8fCAhaXNGYWxzeUlkZW50aWZpZXIoeCkpKSkgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIHRyZWUucXVhc2lzLnJlZHVjZSgoYSwgYywgaSkgPT4ge1xuXHRcdFx0Y29uc3QgdiA9IGkgPT09IHRyZWUucXVhc2lzLmxlbmd0aCAtIDEgPyAnJyA6ICh0cmVlLmV4cHJlc3Npb25zW2ldIGFzIFBhcnRpYWw8ZXN0cmVlLkxpdGVyYWw+KS52YWx1ZTtcblx0XHRcdHJldHVybiBhICsgYy52YWx1ZS5yYXcgKyAodHlwZW9mIHYgPT09ICdzdHJpbmcnID8gdiA6ICcnKTtcblx0XHR9LCAnJyk7XG5cdH1cblx0aWYgKHRyZWUudHlwZSA9PT0gJ0FycmF5RXhwcmVzc2lvbicpIHtcblx0XHRjb25zdCB2YWx1ZXMgPSB0cmVlLmVsZW1lbnRzLm1hcCgodHJlZU5vZGUpID0+IHtcblx0XHRcdGlmICh0cmVlTm9kZSA9PT0gbnVsbCkgcmV0dXJuICcnO1xuXHRcdFx0aWYgKHRyZWVOb2RlLnR5cGUgPT09ICdTcHJlYWRFbGVtZW50JykgcmV0dXJuIG5vcm1hbGl6ZUNsYXNzV2Fsa2VyKHRyZWVOb2RlLmFyZ3VtZW50LCBzdGFjayk7XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplQ2xhc3NXYWxrZXIodHJlZU5vZGUsIHN0YWNrKTtcblx0XHR9KTtcblx0XHRpZiAodmFsdWVzLnNvbWUoKHgpID0+IHggPT09IG51bGwpKSByZXR1cm4gbnVsbDtcblx0XHRyZXR1cm4gdmFsdWVzLmpvaW4oJyAnKTtcblx0fVxuXHRpZiAodHJlZS50eXBlID09PSAnT2JqZWN0RXhwcmVzc2lvbicpIHtcblx0XHRjb25zdCB2YWx1ZXMgPSB0cmVlLnByb3BlcnRpZXMubWFwKCh0cmVlTm9kZSkgPT4ge1xuXHRcdFx0aWYgKHRyZWVOb2RlLnR5cGUgPT09ICdTcHJlYWRFbGVtZW50JykgcmV0dXJuIG5vcm1hbGl6ZUNsYXNzV2Fsa2VyKHRyZWVOb2RlLmFyZ3VtZW50LCBzdGFjayk7XG5cdFx0XHRsZXQgeCA9IHRyZWVOb2RlLnZhbHVlO1xuXHRcdFx0bGV0IGludmV0ZWQgPSBmYWxzZTtcblx0XHRcdHdoaWxlICh4LnR5cGUgPT09ICdVbmFyeUV4cHJlc3Npb24nICYmIHgub3BlcmF0b3IgPT09ICchJykge1xuXHRcdFx0XHR4ID0geC5hcmd1bWVudDtcblx0XHRcdFx0aW52ZXRlZCA9ICFpbnZldGVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHgudHlwZSA9PT0gJ0xpdGVyYWwnKSB7XG5cdFx0XHRcdGlmIChpbnZldGVkID09PSAheC52YWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiB0cmVlTm9kZS5rZXkudHlwZSA9PT0gJ0lkZW50aWZpZXInID8gdHJlZU5vZGUuY29tcHV0ZWQgPyBudWxsIDogdHJlZU5vZGUua2V5Lm5hbWUgOiB0cmVlTm9kZS5rZXkudHlwZSA9PT0gJ0xpdGVyYWwnID8gdHJlZU5vZGUua2V5LnZhbHVlIDogJyc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoeC50eXBlID09PSAnSWRlbnRpZmllcicpIHtcblx0XHRcdFx0aWYgKGludmV0ZWQgIT09IGlzRmFsc3lJZGVudGlmaWVyKHgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9KTtcblx0XHRpZiAodmFsdWVzLnNvbWUoKHgpID0+IHggPT09IG51bGwpKSByZXR1cm4gbnVsbDtcblx0XHRyZXR1cm4gdmFsdWVzLmpvaW4oJyAnKTtcblx0fVxuXHRpZiAoXG5cdFx0dHJlZS50eXBlICE9PSAnQ2FsbEV4cHJlc3Npb24nICYmXG5cdFx0dHJlZS50eXBlICE9PSAnQ2hhaW5FeHByZXNzaW9uJyAmJlxuXHRcdHRyZWUudHlwZSAhPT0gJ0NvbmRpdGlvbmFsRXhwcmVzc2lvbicgJiZcblx0XHR0cmVlLnR5cGUgIT09ICdMb2dpY2FsRXhwcmVzc2lvbicgJiZcblx0XHR0cmVlLnR5cGUgIT09ICdNZW1iZXJFeHByZXNzaW9uJykge1xuXHRcdGNvbnNvbGUuZXJyb3Ioc3RhY2sgPyBgVW5leHBlY3RlZCBub2RlIHR5cGU6ICR7dHJlZS50eXBlfSAoaW4gJHtzdGFja30pYCA6IGBVbmV4cGVjdGVkIG5vZGUgdHlwZTogJHt0cmVlLnR5cGV9YCk7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVDbGFzcyh0cmVlOiBlc3RyZWUuTm9kZSwgc3RhY2s/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0Y29uc3Qgd2Fsa2VkID0gbm9ybWFsaXplQ2xhc3NXYWxrZXIodHJlZSwgc3RhY2spO1xuXHRyZXR1cm4gd2Fsa2VkICYmIHdhbGtlZC5yZXBsYWNlKC9eXFxzK3xcXHMrKD89XFxzKXxcXHMrJC9nLCAnJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bndpbmRDc3NNb2R1bGVDbGFzc05hbWUoYXN0OiBlc3RyZWUuTm9kZSk6IHZvaWQge1xuXHQod2FsayBhcyB0eXBlb2YgZXN0cmVlV2Fsa2VyLndhbGspKGFzdCwge1xuXHRcdGVudGVyKG5vZGUsIHBhcmVudCk6IHZvaWQge1xuXHRcdFx0Ly8jcmVnaW9uXG5cdFx0XHRpZiAocGFyZW50Py50eXBlICE9PSAnUHJvZ3JhbScpIHJldHVybjtcblx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdWYXJpYWJsZURlY2xhcmF0aW9uJykgcmV0dXJuO1xuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkgcmV0dXJuO1xuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zWzBdLmlkLnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuO1xuXHRcdFx0Y29uc3QgbmFtZSA9IG5vZGUuZGVjbGFyYXRpb25zWzBdLmlkLm5hbWU7XG5cdFx0XHRpZiAobm9kZS5kZWNsYXJhdGlvbnNbMF0uaW5pdD8udHlwZSAhPT0gJ0NhbGxFeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zWzBdLmluaXQuY2FsbGVlLnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuO1xuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zWzBdLmluaXQuY2FsbGVlLm5hbWUgIT09ICdfZXhwb3J0X3NmYycpIHJldHVybjtcblx0XHRcdGlmIChub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50cy5sZW5ndGggIT09IDIpIHJldHVybjtcblx0XHRcdGlmIChub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50c1swXS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdGNvbnN0IGlkZW50ID0gbm9kZS5kZWNsYXJhdGlvbnNbMF0uaW5pdC5hcmd1bWVudHNbMF0ubmFtZTtcblx0XHRcdGlmICghaWRlbnQuc3RhcnRzV2l0aCgnX3NmY19tYWluJykpIHJldHVybjtcblx0XHRcdGlmIChub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50c1sxXS50eXBlICE9PSAnQXJyYXlFeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zWzBdLmluaXQuYXJndW1lbnRzWzFdLmVsZW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXHRcdFx0Y29uc3QgX19jc3NNb2R1bGVzSW5kZXggPSBub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50c1sxXS5lbGVtZW50cy5maW5kSW5kZXgoKHgpID0+IHtcblx0XHRcdFx0aWYgKHg/LnR5cGUgIT09ICdBcnJheUV4cHJlc3Npb24nKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmVsZW1lbnRzLmxlbmd0aCAhPT0gMikgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRpZiAoeC5lbGVtZW50c1swXT8udHlwZSAhPT0gJ0xpdGVyYWwnKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmVsZW1lbnRzWzBdLnZhbHVlICE9PSAnX19jc3NNb2R1bGVzJykgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRpZiAoeC5lbGVtZW50c1sxXT8udHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIX5fX2Nzc01vZHVsZXNJbmRleCkgcmV0dXJuO1xuXHRcdFx0LyogVGhpcyByZWdpb24gYXNzdW1lZWQgdGhhdCB0aGUgZW50ZXJlZCBub2RlIGxvb2tzIGxpa2UgdGhlIGZvbGxvd2luZyBjb2RlLlxuXHRcdFx0ICpcblx0XHRcdCAqIGBgYHRzXG5cdFx0XHQgKiBjb25zdCBTb21lQ29tcG9uZW50ID0gX2V4cG9ydF9zZmMoX3NmY19tYWluLCBbW1wiZm9vXCIsIGJhcl0sIFtcIl9fY3NzTW9kdWxlc1wiLCBjc3NNb2R1bGVzXV0pO1xuXHRcdFx0ICogYGBgXG5cdFx0XHQgKi9cblx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdFx0Ly8jcmVnaW9uXG5cdFx0XHRjb25zdCBjc3NNb2R1bGVGb3Jlc3ROYW1lID0gKChub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50c1sxXS5lbGVtZW50c1tfX2Nzc01vZHVsZXNJbmRleF0gYXMgZXN0cmVlLkFycmF5RXhwcmVzc2lvbikuZWxlbWVudHNbMV0gYXMgZXN0cmVlLklkZW50aWZpZXIpLm5hbWU7XG5cdFx0XHRjb25zdCBjc3NNb2R1bGVGb3Jlc3ROb2RlID0gcGFyZW50LmJvZHkuZmluZCgoeCkgPT4ge1xuXHRcdFx0XHRpZiAoeC50eXBlICE9PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRpZiAoeC5kZWNsYXJhdGlvbnNbMF0uaWQudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmRlY2xhcmF0aW9uc1swXS5pZC5uYW1lICE9PSBjc3NNb2R1bGVGb3Jlc3ROYW1lKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmRlY2xhcmF0aW9uc1swXS5pbml0Py50eXBlICE9PSAnT2JqZWN0RXhwcmVzc2lvbicpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KSBhcyB1bmtub3duIGFzIGVzdHJlZS5WYXJpYWJsZURlY2xhcmF0aW9uO1xuXHRcdFx0Y29uc3QgbW9kdWxlRm9yZXN0ID0gbmV3IE1hcCgoY3NzTW9kdWxlRm9yZXN0Tm9kZS5kZWNsYXJhdGlvbnNbMF0uaW5pdCBhcyBlc3RyZWUuT2JqZWN0RXhwcmVzc2lvbikucHJvcGVydGllcy5mbGF0TWFwKChwcm9wZXJ0eSkgPT4ge1xuXHRcdFx0XHRpZiAocHJvcGVydHkudHlwZSAhPT0gJ1Byb3BlcnR5JykgcmV0dXJuIFtdO1xuXHRcdFx0XHRpZiAocHJvcGVydHkua2V5LnR5cGUgIT09ICdMaXRlcmFsJykgcmV0dXJuIFtdO1xuXHRcdFx0XHRpZiAocHJvcGVydHkudmFsdWUudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm4gW107XG5cdFx0XHRcdHJldHVybiBbW3Byb3BlcnR5LmtleS52YWx1ZSBhcyBzdHJpbmcsIHByb3BlcnR5LnZhbHVlLm5hbWUgYXMgc3RyaW5nXV07XG5cdFx0XHR9KSk7XG5cdFx0XHQvKiBUaGlzIHJlZ2lvbiBjb2xsZWN0ZWQgYSBWYXJpYWJsZURlY2xhcmF0aW9uIG5vZGUgaW4gdGhlIG1vZHVsZSB0aGF0IGxvb2tzIGxpa2UgdGhlIGZvbGxvd2luZyBjb2RlLlxuXHRcdFx0ICpcblx0XHRcdCAqIGBgYHRzXG5cdFx0XHQgKiBjb25zdCBjc3NNb2R1bGVzID0ge1xuXHRcdFx0ICogICBcIiRzdHlsZVwiOiBzdHlsZTAsXG5cdFx0XHQgKiB9O1xuXHRcdFx0ICogYGBgXG5cdFx0XHQgKi9cblx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdFx0Ly8jcmVnaW9uXG5cdFx0XHRjb25zdCBzZmNNYWluID0gcGFyZW50LmJvZHkuZmluZCgoeCkgPT4ge1xuXHRcdFx0XHRpZiAoeC50eXBlICE9PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRpZiAoeC5kZWNsYXJhdGlvbnNbMF0uaWQudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmRlY2xhcmF0aW9uc1swXS5pZC5uYW1lICE9PSBpZGVudCkgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pIGFzIHVua25vd24gYXMgZXN0cmVlLlZhcmlhYmxlRGVjbGFyYXRpb247XG5cdFx0XHRpZiAoc2ZjTWFpbi5kZWNsYXJhdGlvbnNbMF0uaW5pdD8udHlwZSAhPT0gJ0NhbGxFeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0aWYgKHNmY01haW4uZGVjbGFyYXRpb25zWzBdLmluaXQuY2FsbGVlLnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuO1xuXHRcdFx0aWYgKHNmY01haW4uZGVjbGFyYXRpb25zWzBdLmluaXQuY2FsbGVlLm5hbWUgIT09ICdkZWZpbmVDb21wb25lbnQnKSByZXR1cm47XG5cdFx0XHRpZiAoc2ZjTWFpbi5kZWNsYXJhdGlvbnNbMF0uaW5pdC5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSByZXR1cm47XG5cdFx0XHRpZiAoc2ZjTWFpbi5kZWNsYXJhdGlvbnNbMF0uaW5pdC5hcmd1bWVudHNbMF0udHlwZSAhPT0gJ09iamVjdEV4cHJlc3Npb24nKSByZXR1cm47XG5cdFx0XHRjb25zdCBzZXR1cCA9IHNmY01haW4uZGVjbGFyYXRpb25zWzBdLmluaXQuYXJndW1lbnRzWzBdLnByb3BlcnRpZXMuZmluZCgoeCkgPT4ge1xuXHRcdFx0XHRpZiAoeC50eXBlICE9PSAnUHJvcGVydHknKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdGlmICh4LmtleS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0aWYgKHgua2V5Lm5hbWUgIT09ICdzZXR1cCcpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KSBhcyB1bmtub3duIGFzIGVzdHJlZS5Qcm9wZXJ0eTtcblx0XHRcdGlmIChzZXR1cC52YWx1ZS50eXBlICE9PSAnRnVuY3Rpb25FeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0Y29uc3QgcmVuZGVyID0gc2V0dXAudmFsdWUuYm9keS5ib2R5LmZpbmQoKHgpID0+IHtcblx0XHRcdFx0aWYgKHgudHlwZSAhPT0gJ1JldHVyblN0YXRlbWVudCcpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KSBhcyB1bmtub3duIGFzIGVzdHJlZS5SZXR1cm5TdGF0ZW1lbnQ7XG5cdFx0XHRpZiAocmVuZGVyLmFyZ3VtZW50Py50eXBlICE9PSAnQXJyb3dGdW5jdGlvbkV4cHJlc3Npb24nKSByZXR1cm47XG5cdFx0XHRpZiAocmVuZGVyLmFyZ3VtZW50LnBhcmFtcy5sZW5ndGggIT09IDIpIHJldHVybjtcblx0XHRcdGNvbnN0IGN0eCA9IHJlbmRlci5hcmd1bWVudC5wYXJhbXNbMF07XG5cdFx0XHRpZiAoY3R4LnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuO1xuXHRcdFx0aWYgKGN0eC5uYW1lICE9PSAnX2N0eCcpIHJldHVybjtcblx0XHRcdGlmIChyZW5kZXIuYXJndW1lbnQuYm9keS50eXBlICE9PSAnQmxvY2tTdGF0ZW1lbnQnKSByZXR1cm47XG5cdFx0XHQvKiBUaGlzIHJlZ2lvbiBhc3N1bWVkIHRoYXQgYHNmY01haW5gIGxvb2tzIGxpa2UgdGhlIGZvbGxvd2luZyBjb2RlLlxuXHRcdFx0ICpcblx0XHRcdCAqIGBgYHRzXG5cdFx0XHQgKiBjb25zdCBfc2ZjX21haW4gPSBkZWZpbmVDb21wb25lbnQoe1xuXHRcdFx0ICogICBzZXR1cChfcHJvcHMpIHtcblx0XHRcdCAqICAgICAuLi5cblx0XHRcdCAqICAgICByZXR1cm4gKF9jdHgsIF9jYWNoZSkgPT4ge1xuXHRcdFx0ICogICAgICAgLi4uXG5cdFx0XHQgKiAgICAgfTtcblx0XHRcdCAqICAgfSxcblx0XHRcdCAqIH0pO1xuXHRcdFx0ICogYGBgXG5cdFx0XHQgKi9cblx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgbW9kdWxlRm9yZXN0KSB7XG5cdFx0XHRcdC8vI3JlZ2lvblxuXHRcdFx0XHRjb25zdCBjc3NNb2R1bGVUcmVlTm9kZSA9IHBhcmVudC5ib2R5LmZpbmQoKHgpID0+IHtcblx0XHRcdFx0XHRpZiAoeC50eXBlICE9PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRpZiAoeC5kZWNsYXJhdGlvbnMubGVuZ3RoICE9PSAxKSByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zWzBdLmlkLnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdGlmICh4LmRlY2xhcmF0aW9uc1swXS5pZC5uYW1lICE9PSB2YWx1ZSkgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KSBhcyB1bmtub3duIGFzIGVzdHJlZS5WYXJpYWJsZURlY2xhcmF0aW9uO1xuXHRcdFx0XHRpZiAoY3NzTW9kdWxlVHJlZU5vZGUuZGVjbGFyYXRpb25zWzBdLmluaXQ/LnR5cGUgIT09ICdPYmplY3RFeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0XHRjb25zdCBtb2R1bGVUcmVlID0gbmV3IE1hcChjc3NNb2R1bGVUcmVlTm9kZS5kZWNsYXJhdGlvbnNbMF0uaW5pdC5wcm9wZXJ0aWVzLmZsYXRNYXAoKHByb3BlcnR5KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5LnR5cGUgIT09ICdQcm9wZXJ0eScpIHJldHVybiBbXTtcblx0XHRcdFx0XHRjb25zdCBhY3R1YWxLZXkgPSBwcm9wZXJ0eS5rZXkudHlwZSA9PT0gJ0lkZW50aWZpZXInID8gcHJvcGVydHkua2V5Lm5hbWUgOiBwcm9wZXJ0eS5rZXkudHlwZSA9PT0gJ0xpdGVyYWwnID8gcHJvcGVydHkua2V5LnZhbHVlIDogbnVsbDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGFjdHVhbEtleSAhPT0gJ3N0cmluZycpIHJldHVybiBbXTtcblx0XHRcdFx0XHRpZiAocHJvcGVydHkudmFsdWUudHlwZSA9PT0gJ0xpdGVyYWwnKSByZXR1cm4gW1thY3R1YWxLZXksIHByb3BlcnR5LnZhbHVlLnZhbHVlIGFzIHN0cmluZ11dO1xuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eS52YWx1ZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybiBbXTtcblx0XHRcdFx0XHRjb25zdCBsYWJlbGxlZFZhbHVlID0gcHJvcGVydHkudmFsdWUubmFtZTtcblx0XHRcdFx0XHRjb25zdCBhY3R1YWxWYWx1ZSA9IHBhcmVudC5ib2R5LmZpbmQoKHgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh4LnR5cGUgIT09ICdWYXJpYWJsZURlY2xhcmF0aW9uJykgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zWzBdLmlkLnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0aWYgKHguZGVjbGFyYXRpb25zWzBdLmlkLm5hbWUgIT09IGxhYmVsbGVkVmFsdWUpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH0pIGFzIHVua25vd24gYXMgZXN0cmVlLlZhcmlhYmxlRGVjbGFyYXRpb247XG5cdFx0XHRcdFx0aWYgKGFjdHVhbFZhbHVlLmRlY2xhcmF0aW9uc1swXS5pbml0Py50eXBlICE9PSAnTGl0ZXJhbCcpIHJldHVybiBbXTtcblx0XHRcdFx0XHRyZXR1cm4gW1thY3R1YWxLZXksIGFjdHVhbFZhbHVlLmRlY2xhcmF0aW9uc1swXS5pbml0LnZhbHVlIGFzIHN0cmluZ11dO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdC8qIFRoaXMgcmVnaW9uIGNvbGxlY3RlZCBWYXJpYWJsZURlY2xhcmF0aW9uIG5vZGVzIGluIHRoZSBtb2R1bGUgdGhhdCBsb29rcyBsaWtlIHRoZSBmb2xsb3dpbmcgY29kZS5cblx0XHRcdFx0ICpcblx0XHRcdFx0ICogYGBgdHNcblx0XHRcdFx0ICogY29uc3QgZm9vID0gXCJiYXJcIjtcblx0XHRcdFx0ICogY29uc3QgYmF6ID0gXCJxdXhcIjtcblx0XHRcdFx0ICogY29uc3Qgc3R5bGUwID0ge1xuXHRcdFx0XHQgKiAgIGZvbzogZm9vLFxuXHRcdFx0XHQgKiAgIGJhejogYmF6LFxuXHRcdFx0XHQgKiB9O1xuXHRcdFx0XHQgKiBgYGBcblx0XHRcdFx0ICovXG5cdFx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdFx0XHQvLyNyZWdpb25cblx0XHRcdFx0KHdhbGsgYXMgdHlwZW9mIGVzdHJlZVdhbGtlci53YWxrKShyZW5kZXIuYXJndW1lbnQuYm9keSwge1xuXHRcdFx0XHRcdGVudGVyKGNoaWxkTm9kZSkge1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS50eXBlICE9PSAnTWVtYmVyRXhwcmVzc2lvbicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUub2JqZWN0LnR5cGUgIT09ICdNZW1iZXJFeHByZXNzaW9uJykgcmV0dXJuO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS5vYmplY3Qub2JqZWN0LnR5cGUgIT09ICdJZGVudGlmaWVyJykgcmV0dXJuO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS5vYmplY3Qub2JqZWN0Lm5hbWUgIT09IGN0eC5uYW1lKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGROb2RlLm9iamVjdC5wcm9wZXJ0eS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUub2JqZWN0LnByb3BlcnR5Lm5hbWUgIT09IGtleSkgcmV0dXJuO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS5wcm9wZXJ0eS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbFZhbHVlID0gbW9kdWxlVHJlZS5nZXQoY2hpbGROb2RlLnByb3BlcnR5Lm5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKGFjdHVhbFZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybjtcblx0XHRcdFx0XHRcdHRoaXMucmVwbGFjZSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdMaXRlcmFsJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGFjdHVhbFZhbHVlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8qIFRoaXMgcmVnaW9uIGlubGluZWQgdGhlIHJlZmVyZW5jZSBpZGVudGlmaWVyIG9mIHRoZSBjbGFzcyBuYW1lIGluIHRoZSByZW5kZXIgZnVuY3Rpb24gaW50byB0aGUgYWN0dWFsIGxpdGVyYWwsIGFzIGluIHRoZSBmb2xsb3dpbmcgY29kZS5cblx0XHRcdFx0ICpcblx0XHRcdFx0ICogYGBgdHNcblx0XHRcdFx0ICogY29uc3QgX3NmY19tYWluID0gZGVmaW5lQ29tcG9uZW50KHtcblx0XHRcdFx0ICogICBzZXR1cChfcHJvcHMpIHtcblx0XHRcdFx0ICogICAgIC4uLlxuXHRcdFx0XHQgKiAgICAgcmV0dXJuIChfY3R4LCBfY2FjaGUpID0+IHtcblx0XHRcdFx0ICogICAgICAgLi4uXG5cdFx0XHRcdCAqICAgICAgIHJldHVybiBvcGVuQmxvY2soKSwgY3JlYXRlRWxlbWVudEJsb2NrKFwiZGl2XCIsIHtcblx0XHRcdFx0ICogICAgICAgICBjbGFzczogbm9ybWFsaXplQ2xhc3MoX2N0eC4kc3R5bGUuZm9vKSxcblx0XHRcdFx0ICogICAgICAgfSwgbnVsbCk7XG5cdFx0XHRcdCAqICAgICB9O1xuXHRcdFx0XHQgKiAgIH0sXG5cdFx0XHRcdCAqIH0pO1xuXHRcdFx0XHQgKiBgYGBcblx0XHRcdFx0ICpcblx0XHRcdFx0ICogXHUyMTkzXG5cdFx0XHRcdCAqXG5cdFx0XHRcdCAqIGBgYHRzXG5cdFx0XHRcdCAqIGNvbnN0IF9zZmNfbWFpbiA9IGRlZmluZUNvbXBvbmVudCh7XG5cdFx0XHRcdCAqICAgc2V0dXAoX3Byb3BzKSB7XG5cdFx0XHRcdCAqICAgICAuLi5cblx0XHRcdFx0ICogICAgIHJldHVybiAoX2N0eCwgX2NhY2hlKSA9PiB7XG5cdFx0XHRcdCAqICAgICAgIC4uLlxuXHRcdFx0XHQgKiAgICAgICByZXR1cm4gb3BlbkJsb2NrKCksIGNyZWF0ZUVsZW1lbnRCbG9jayhcImRpdlwiLCB7XG5cdFx0XHRcdCAqICAgICAgICAgY2xhc3M6IG5vcm1hbGl6ZUNsYXNzKFwiYmFyXCIpLFxuXHRcdFx0XHQgKiAgICAgICB9LCBudWxsKTtcblx0XHRcdFx0ICogICAgIH07XG5cdFx0XHRcdCAqICAgfSxcblx0XHRcdFx0ICogfSk7XG5cdFx0XHRcdCAqL1xuXHRcdFx0XHQvLyNlbmRyZWdpb25cblx0XHRcdFx0Ly8jcmVnaW9uXG5cdFx0XHRcdCh3YWxrIGFzIHR5cGVvZiBlc3RyZWVXYWxrZXIud2FsaykocmVuZGVyLmFyZ3VtZW50LmJvZHksIHtcblx0XHRcdFx0XHRlbnRlcihjaGlsZE5vZGUpIHtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUudHlwZSAhPT0gJ01lbWJlckV4cHJlc3Npb24nKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGROb2RlLm9iamVjdC50eXBlICE9PSAnTWVtYmVyRXhwcmVzc2lvbicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUub2JqZWN0Lm9iamVjdC50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUub2JqZWN0Lm9iamVjdC5uYW1lICE9PSBjdHgubmFtZSkgcmV0dXJuO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS5vYmplY3QucHJvcGVydHkudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGROb2RlLm9iamVjdC5wcm9wZXJ0eS5uYW1lICE9PSBrZXkpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUucHJvcGVydHkudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm47XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBVbmRlZmluZWQgc3R5bGUgZGV0ZWN0ZWQ6ICR7a2V5fS4ke2NoaWxkTm9kZS5wcm9wZXJ0eS5uYW1lfSAoaW4gJHtuYW1lfSlgKTtcblx0XHRcdFx0XHRcdHRoaXMucmVwbGFjZSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdJZGVudGlmaWVyJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogJ3VuZGVmaW5lZCcsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0LyogVGhpcyByZWdpb24gcmVwbGFjZWQgdGhlIHJlZmVyZW5jZSBpZGVudGlmaWVyIG9mIG1pc3NpbmcgY2xhc3MgbmFtZXMgaW4gdGhlIHJlbmRlciBmdW5jdGlvbiB3aXRoIGB1bmRlZmluZWRgLCBhcyBpbiB0aGUgZm9sbG93aW5nIGNvZGUuXG5cdFx0XHRcdCAqXG5cdFx0XHRcdCAqIGBgYHRzXG5cdFx0XHRcdCAqIGNvbnN0IF9zZmNfbWFpbiA9IGRlZmluZUNvbXBvbmVudCh7XG5cdFx0XHRcdCAqICAgc2V0dXAoX3Byb3BzKSB7XG5cdFx0XHRcdCAqICAgICAuLi5cblx0XHRcdFx0ICogICAgIHJldHVybiAoX2N0eCwgX2NhY2hlKSA9PiB7XG5cdFx0XHRcdCAqICAgICAgIC4uLlxuXHRcdFx0XHQgKiAgICAgICByZXR1cm4gb3BlbkJsb2NrKCksIGNyZWF0ZUVsZW1lbnRCbG9jayhcImRpdlwiLCB7XG5cdFx0XHRcdCAqICAgICAgICAgY2xhc3M6IG5vcm1hbGl6ZUNsYXNzKF9jdHguJHN0eWxlLmhvZ2UpLFxuXHRcdFx0XHQgKiAgICAgICB9LCBudWxsKTtcblx0XHRcdFx0ICogICAgIH07XG5cdFx0XHRcdCAqICAgfSxcblx0XHRcdFx0ICogfSk7XG5cdFx0XHRcdCAqIGBgYFxuXHRcdFx0XHQgKlxuXHRcdFx0XHQgKiBcdTIxOTNcblx0XHRcdFx0ICpcblx0XHRcdFx0ICogYGBgdHNcblx0XHRcdFx0ICogY29uc3QgX3NmY19tYWluID0gZGVmaW5lQ29tcG9uZW50KHtcblx0XHRcdFx0ICogICBzZXR1cChfcHJvcHMpIHtcblx0XHRcdFx0ICogICAgIC4uLlxuXHRcdFx0XHQgKiAgICAgcmV0dXJuIChfY3R4LCBfY2FjaGUpID0+IHtcblx0XHRcdFx0ICogICAgICAgLi4uXG5cdFx0XHRcdCAqICAgICAgIHJldHVybiBvcGVuQmxvY2soKSwgY3JlYXRlRWxlbWVudEJsb2NrKFwiZGl2XCIsIHtcblx0XHRcdFx0ICogICAgICAgICBjbGFzczogbm9ybWFsaXplQ2xhc3ModW5kZWZpbmVkKSxcblx0XHRcdFx0ICogICAgICAgfSwgbnVsbCk7XG5cdFx0XHRcdCAqICAgICB9O1xuXHRcdFx0XHQgKiAgIH0sXG5cdFx0XHRcdCAqIH0pO1xuXHRcdFx0XHQgKiBgYGBcblx0XHRcdFx0ICovXG5cdFx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdFx0XHQvLyNyZWdpb25cblx0XHRcdFx0KHdhbGsgYXMgdHlwZW9mIGVzdHJlZVdhbGtlci53YWxrKShyZW5kZXIuYXJndW1lbnQuYm9keSwge1xuXHRcdFx0XHRcdGVudGVyKGNoaWxkTm9kZSkge1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS50eXBlICE9PSAnQ2FsbEV4cHJlc3Npb24nKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGROb2RlLmNhbGxlZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUuY2FsbGVlLm5hbWUgIT09ICdub3JtYWxpemVDbGFzcycpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUuYXJndW1lbnRzLmxlbmd0aCAhPT0gMSkgcmV0dXJuO1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUNsYXNzKGNoaWxkTm9kZS5hcmd1bWVudHNbMF0sIG5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKG5vcm1hbGl6ZWQgPT09IG51bGwpIHJldHVybjtcblx0XHRcdFx0XHRcdHRoaXMucmVwbGFjZSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdMaXRlcmFsJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IG5vcm1hbGl6ZWQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0LyogVGhpcyByZWdpb24gY29tcGlsZWQgdGhlIGBub3JtYWxpemVDbGFzc2AgY2FsbCBpbnRvIGEgcHNldWRvLUFPVCBjb21waWxhdGlvbiwgYXMgaW4gdGhlIGZvbGxvd2luZyBjb2RlLlxuXHRcdFx0XHQgKlxuXHRcdFx0XHQgKiBgYGB0c1xuXHRcdFx0XHQgKiBjb25zdCBfc2ZjX21haW4gPSBkZWZpbmVDb21wb25lbnQoe1xuXHRcdFx0XHQgKiAgIHNldHVwKF9wcm9wcykge1xuXHRcdFx0XHQgKiAgICAgLi4uXG5cdFx0XHRcdCAqICAgICByZXR1cm4gKF9jdHgsIF9jYWNoZSkgPT4ge1xuXHRcdFx0XHQgKiAgICAgICAuLi5cblx0XHRcdFx0ICogICAgICAgcmV0dXJuIG9wZW5CbG9jaygpLCBjcmVhdGVFbGVtZW50QmxvY2soXCJkaXZcIiwge1xuXHRcdFx0XHQgKiAgICAgICAgIGNsYXNzOiBub3JtYWxpemVDbGFzcyhcImJhclwiKSxcblx0XHRcdFx0ICogICAgICAgfSwgbnVsbCk7XG5cdFx0XHRcdCAqICAgICB9O1xuXHRcdFx0XHQgKiAgIH0sXG5cdFx0XHRcdCAqIH0pO1xuXHRcdFx0XHQgKiBgYGBcblx0XHRcdFx0ICpcblx0XHRcdFx0ICogXHUyMTkzXG5cdFx0XHRcdCAqXG5cdFx0XHRcdCAqIGBgYHRzXG5cdFx0XHRcdCAqIGNvbnN0IF9zZmNfbWFpbiA9IGRlZmluZUNvbXBvbmVudCh7XG5cdFx0XHRcdCAqICAgc2V0dXAoX3Byb3BzKSB7XG5cdFx0XHRcdCAqICAgICAuLi5cblx0XHRcdFx0ICogICAgIHJldHVybiAoX2N0eCwgX2NhY2hlKSA9PiB7XG5cdFx0XHRcdCAqICAgICAgIC4uLlxuXHRcdFx0XHQgKiAgICAgICByZXR1cm4gb3BlbkJsb2NrKCksIGNyZWF0ZUVsZW1lbnRCbG9jayhcImRpdlwiLCB7XG5cdFx0XHRcdCAqICAgICAgICAgY2xhc3M6IFwiYmFyXCIsXG5cdFx0XHRcdCAqICAgICAgIH0sIG51bGwpO1xuXHRcdFx0XHQgKiAgICAgfTtcblx0XHRcdFx0ICogICB9LFxuXHRcdFx0XHQgKiB9KTtcblx0XHRcdFx0ICogYGBgXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHQvLyNlbmRyZWdpb25cblx0XHRcdH1cblx0XHRcdC8vI3JlZ2lvblxuXHRcdFx0aWYgKG5vZGUuZGVjbGFyYXRpb25zWzBdLmluaXQuYXJndW1lbnRzWzFdLmVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQod2FsayBhcyB0eXBlb2YgZXN0cmVlV2Fsa2VyLndhbGspKGFzdCwge1xuXHRcdFx0XHRcdGVudGVyKGNoaWxkTm9kZSkge1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkTm9kZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChjaGlsZE5vZGUubmFtZSAhPT0gaWRlbnQpIHJldHVybjtcblx0XHRcdFx0XHRcdHRoaXMucmVwbGFjZSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdJZGVudGlmaWVyJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogbm9kZS5kZWNsYXJhdGlvbnNbMF0uaWQubmFtZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnJlbW92ZSgpO1xuXHRcdFx0XHQvKiBOT1RFOiBUaGUgYWJvdmUgbG9naWMgaXMgdmFsaWQgYXMgbG9uZyBhcyB0aGUgZm9sbG93aW5nIHR3byBjb25kaXRpb25zIGFyZSBtZXQuXG5cdFx0XHRcdCAqXG5cdFx0XHRcdCAqIC0gdGhlIHVuaXF1ZW5lc3Mgb2YgYGlkZW50YCBpcyBrZXB0IHRocm91Z2hvdXQgdGhlIG1vZHVsZVxuXHRcdFx0XHQgKiAtIGBfZXhwb3J0X3NmY2AgaXMgbm9vcCB3aGVuIHRoZSBzZWNvbmQgYXJndW1lbnQgaXMgYW4gZW1wdHkgYXJyYXlcblx0XHRcdFx0ICpcblx0XHRcdFx0ICogT3RoZXJ3aXNlLCB0aGUgYmVsb3cgbG9naWMgc2hvdWxkIGJlIHVzZWQgaW5zdGVhZC5cblxuXHRcdFx0XHR0aGlzLnJlcGxhY2Uoe1xuXHRcdFx0XHRcdHR5cGU6ICdWYXJpYWJsZURlY2xhcmF0aW9uJyxcblx0XHRcdFx0XHRkZWNsYXJhdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnVmFyaWFibGVEZWNsYXJhdG9yJyxcblx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdJZGVudGlmaWVyJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogbm9kZS5kZWNsYXJhdGlvbnNbMF0uaWQubmFtZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRpbml0OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdJZGVudGlmaWVyJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogaWRlbnQsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGtpbmQ6ICdjb25zdCcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQgKi9cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVwbGFjZSh7XG5cdFx0XHRcdFx0dHlwZTogJ1ZhcmlhYmxlRGVjbGFyYXRpb24nLFxuXHRcdFx0XHRcdGRlY2xhcmF0aW9uczogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICdWYXJpYWJsZURlY2xhcmF0b3InLFxuXHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ0lkZW50aWZpZXInLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBub2RlLmRlY2xhcmF0aW9uc1swXS5pZC5uYW1lLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGluaXQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ0NhbGxFeHByZXNzaW9uJyxcblx0XHRcdFx0XHRcdFx0Y2FsbGVlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ0lkZW50aWZpZXInLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdfZXhwb3J0X3NmYycsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnSWRlbnRpZmllcicsXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogaWRlbnQsXG5cdFx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnQXJyYXlFeHByZXNzaW9uJyxcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50czogbm9kZS5kZWNsYXJhdGlvbnNbMF0uaW5pdC5hcmd1bWVudHNbMV0uZWxlbWVudHMuc2xpY2UoMCwgX19jc3NNb2R1bGVzSW5kZXgpLmNvbmNhdChub2RlLmRlY2xhcmF0aW9uc1swXS5pbml0LmFyZ3VtZW50c1sxXS5lbGVtZW50cy5zbGljZShfX2Nzc01vZHVsZXNJbmRleCArIDEpKSxcblx0XHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGtpbmQ6ICdjb25zdCcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0LyogVGhpcyByZWdpb24gcmVtb3ZlZCB0aGUgYF9fY3NzTW9kdWxlc2AgcmVmZXJlbmNlIGZyb20gdGhlIHNlY29uZCBhcmd1bWVudCBvZiBgX2V4cG9ydF9zZmNgLCBhcyBpbiB0aGUgZm9sbG93aW5nIGNvZGUuXG5cdFx0XHQgKlxuXHRcdFx0ICogYGBgdHNcblx0XHRcdCAqIGNvbnN0IFNvbWVDb21wb25lbnQgPSBfZXhwb3J0X3NmYyhfc2ZjX21haW4sIFtbXCJmb29cIiwgYmFyXSwgW1wiX19jc3NNb2R1bGVzXCIsIGNzc01vZHVsZXNdXSk7XG5cdFx0XHQgKiBgYGBcblx0XHRcdCAqXG5cdFx0XHQgKiBcdTIxOTNcblx0XHRcdCAqXG5cdFx0XHQgKiBgYGB0c1xuXHRcdFx0ICogY29uc3QgU29tZUNvbXBvbmVudCA9IF9leHBvcnRfc2ZjKF9zZmNfbWFpbiwgW1tcImZvb1wiLCBiYXJdXSk7XG5cdFx0XHQgKiBgYGBcblx0XHRcdCAqXG5cdFx0XHQgKiBXaGVuIHRoZSBkZWNsYXJhdGlvbiBiZWNvbWVzIG5vb3AsIGl0IGlzIHJlbW92ZWQgYXMgZm9sbG93cy5cblx0XHRcdCAqXG5cdFx0XHQgKiBgYGB0c1xuXHRcdFx0ICogY29uc3QgX3NmY19tYWluID0gZGVmaW5lQ29tcG9uZW50KHtcblx0XHRcdCAqICAgLi4uXG5cdFx0XHQgKiB9KTtcblx0XHRcdCAqIGNvbnN0IFNvbWVDb21wb25lbnQgPSBfZXhwb3J0X3NmYyhfc2ZjX21haW4sIFtdKTtcblx0XHRcdCAqIGBgYFxuXHRcdFx0ICpcblx0XHRcdCAqIFx1MjE5M1xuXHRcdFx0ICpcblx0XHRcdCAqIGBgYHRzXG5cdFx0XHQgKiBjb25zdCBTb21lQ29tcG9uZW50ID0gZGVmaW5lQ29tcG9uZW50KHtcblx0XHRcdCAqICAgLi4uXG5cdFx0XHQgKiB9KTtcblx0XHRcdCAqL1xuXHRcdFx0Ly8jZW5kcmVnaW9uXG5cdFx0fSxcblx0fSk7XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBpbXBvcnQvbm8tZGVmYXVsdC1leHBvcnRcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBsdWdpblVud2luZENzc01vZHVsZUNsYXNzTmFtZSgpOiBQbHVnaW4ge1xuXHRyZXR1cm4ge1xuXHRcdG5hbWU6ICdVbndpbmRDc3NNb2R1bGVDbGFzc05hbWUnLFxuXHRcdHJlbmRlckNodW5rKGNvZGUpOiB7IGNvZGU6IHN0cmluZyB9IHtcblx0XHRcdGNvbnN0IGFzdCA9IHRoaXMucGFyc2UoY29kZSkgYXMgdW5rbm93biBhcyBlc3RyZWUuTm9kZTtcblx0XHRcdHVud2luZENzc01vZHVsZUNsYXNzTmFtZShhc3QpO1xuXHRcdFx0cmV0dXJuIHsgY29kZTogZ2VuZXJhdGUoYXN0KSB9O1xuXHRcdH0sXG5cdH07XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi93b3Jrc3BhY2Uvbm9kZV9tb2R1bGVzLy5wbnBtL2VzdHJlZS13YWxrZXJAMy4wLjMvbm9kZV9tb2R1bGVzL2VzdHJlZS13YWxrZXIvc3JjXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvd29ya3NwYWNlL25vZGVfbW9kdWxlcy8ucG5wbS9lc3RyZWUtd2Fsa2VyQDMuMC4zL25vZGVfbW9kdWxlcy9lc3RyZWUtd2Fsa2VyL3NyYy93YWxrZXIuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3dvcmtzcGFjZS9ub2RlX21vZHVsZXMvLnBucG0vZXN0cmVlLXdhbGtlckAzLjAuMy9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmMvd2Fsa2VyLmpzXCI7LyoqXG4gKiBAdHlwZWRlZiB7IGltcG9ydCgnZXN0cmVlJykuTm9kZX0gTm9kZVxuICogQHR5cGVkZWYge3tcbiAqICAgc2tpcDogKCkgPT4gdm9pZDtcbiAqICAgcmVtb3ZlOiAoKSA9PiB2b2lkO1xuICogICByZXBsYWNlOiAobm9kZTogTm9kZSkgPT4gdm9pZDtcbiAqIH19IFdhbGtlckNvbnRleHRcbiAqL1xuXG5leHBvcnQgY2xhc3MgV2Fsa2VyQmFzZSB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdC8qKiBAdHlwZSB7Ym9vbGVhbn0gKi9cblx0XHR0aGlzLnNob3VsZF9za2lwID0gZmFsc2U7XG5cblx0XHQvKiogQHR5cGUge2Jvb2xlYW59ICovXG5cdFx0dGhpcy5zaG91bGRfcmVtb3ZlID0gZmFsc2U7XG5cblx0XHQvKiogQHR5cGUge05vZGUgfCBudWxsfSAqL1xuXHRcdHRoaXMucmVwbGFjZW1lbnQgPSBudWxsO1xuXG5cdFx0LyoqIEB0eXBlIHtXYWxrZXJDb250ZXh0fSAqL1xuXHRcdHRoaXMuY29udGV4dCA9IHtcblx0XHRcdHNraXA6ICgpID0+ICh0aGlzLnNob3VsZF9za2lwID0gdHJ1ZSksXG5cdFx0XHRyZW1vdmU6ICgpID0+ICh0aGlzLnNob3VsZF9yZW1vdmUgPSB0cnVlKSxcblx0XHRcdHJlcGxhY2U6IChub2RlKSA9PiAodGhpcy5yZXBsYWNlbWVudCA9IG5vZGUpXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAdGVtcGxhdGUge05vZGV9IFBhcmVudFxuXHQgKiBAcGFyYW0ge1BhcmVudCB8IG51bGwgfCB1bmRlZmluZWR9IHBhcmVudFxuXHQgKiBAcGFyYW0ge2tleW9mIFBhcmVudCB8IG51bGwgfCB1bmRlZmluZWR9IHByb3Bcblx0ICogQHBhcmFtIHtudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkfSBpbmRleFxuXHQgKiBAcGFyYW0ge05vZGV9IG5vZGVcblx0ICovXG5cdHJlcGxhY2UocGFyZW50LCBwcm9wLCBpbmRleCwgbm9kZSkge1xuXHRcdGlmIChwYXJlbnQgJiYgcHJvcCkge1xuXHRcdFx0aWYgKGluZGV4ICE9IG51bGwpIHtcblx0XHRcdFx0LyoqIEB0eXBlIHtBcnJheTxOb2RlPn0gKi8gKHBhcmVudFtwcm9wXSlbaW5kZXhdID0gbm9kZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8qKiBAdHlwZSB7Tm9kZX0gKi8gKHBhcmVudFtwcm9wXSkgPSBub2RlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAdGVtcGxhdGUge05vZGV9IFBhcmVudFxuXHQgKiBAcGFyYW0ge1BhcmVudCB8IG51bGwgfCB1bmRlZmluZWR9IHBhcmVudFxuXHQgKiBAcGFyYW0ge2tleW9mIFBhcmVudCB8IG51bGwgfCB1bmRlZmluZWR9IHByb3Bcblx0ICogQHBhcmFtIHtudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkfSBpbmRleFxuXHQgKi9cblx0cmVtb3ZlKHBhcmVudCwgcHJvcCwgaW5kZXgpIHtcblx0XHRpZiAocGFyZW50ICYmIHByb3ApIHtcblx0XHRcdGlmIChpbmRleCAhPT0gbnVsbCAmJiBpbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8qKiBAdHlwZSB7QXJyYXk8Tm9kZT59ICovIChwYXJlbnRbcHJvcF0pLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZWxldGUgcGFyZW50W3Byb3BdO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvd29ya3NwYWNlL25vZGVfbW9kdWxlcy8ucG5wbS9lc3RyZWUtd2Fsa2VyQDMuMC4zL25vZGVfbW9kdWxlcy9lc3RyZWUtd2Fsa2VyL3NyY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3dvcmtzcGFjZS9ub2RlX21vZHVsZXMvLnBucG0vZXN0cmVlLXdhbGtlckAzLjAuMy9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmMvc3luYy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vd29ya3NwYWNlL25vZGVfbW9kdWxlcy8ucG5wbS9lc3RyZWUtd2Fsa2VyQDMuMC4zL25vZGVfbW9kdWxlcy9lc3RyZWUtd2Fsa2VyL3NyYy9zeW5jLmpzXCI7aW1wb3J0IHsgV2Fsa2VyQmFzZSB9IGZyb20gJy4vd2Fsa2VyLmpzJztcblxuLyoqXG4gKiBAdHlwZWRlZiB7IGltcG9ydCgnZXN0cmVlJykuTm9kZX0gTm9kZVxuICogQHR5cGVkZWYgeyBpbXBvcnQoJy4vd2Fsa2VyLmpzJykuV2Fsa2VyQ29udGV4dH0gV2Fsa2VyQ29udGV4dFxuICogQHR5cGVkZWYgeyhcbiAqICAgIHRoaXM6IFdhbGtlckNvbnRleHQsXG4gKiAgICBub2RlOiBOb2RlLFxuICogICAgcGFyZW50OiBOb2RlIHwgbnVsbCxcbiAqICAgIGtleTogc3RyaW5nIHwgbnVtYmVyIHwgc3ltYm9sIHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAqICAgIGluZGV4OiBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkXG4gKiApID0+IHZvaWR9IFN5bmNIYW5kbGVyXG4gKi9cblxuZXhwb3J0IGNsYXNzIFN5bmNXYWxrZXIgZXh0ZW5kcyBXYWxrZXJCYXNlIHtcblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3luY0hhbmRsZXJ9IFtlbnRlcl1cblx0ICogQHBhcmFtIHtTeW5jSGFuZGxlcn0gW2xlYXZlXVxuXHQgKi9cblx0Y29uc3RydWN0b3IoZW50ZXIsIGxlYXZlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8qKiBAdHlwZSB7Ym9vbGVhbn0gKi9cblx0XHR0aGlzLnNob3VsZF9za2lwID0gZmFsc2U7XG5cblx0XHQvKiogQHR5cGUge2Jvb2xlYW59ICovXG5cdFx0dGhpcy5zaG91bGRfcmVtb3ZlID0gZmFsc2U7XG5cblx0XHQvKiogQHR5cGUge05vZGUgfCBudWxsfSAqL1xuXHRcdHRoaXMucmVwbGFjZW1lbnQgPSBudWxsO1xuXG5cdFx0LyoqIEB0eXBlIHtXYWxrZXJDb250ZXh0fSAqL1xuXHRcdHRoaXMuY29udGV4dCA9IHtcblx0XHRcdHNraXA6ICgpID0+ICh0aGlzLnNob3VsZF9za2lwID0gdHJ1ZSksXG5cdFx0XHRyZW1vdmU6ICgpID0+ICh0aGlzLnNob3VsZF9yZW1vdmUgPSB0cnVlKSxcblx0XHRcdHJlcGxhY2U6IChub2RlKSA9PiAodGhpcy5yZXBsYWNlbWVudCA9IG5vZGUpXG5cdFx0fTtcblxuXHRcdC8qKiBAdHlwZSB7U3luY0hhbmRsZXIgfCB1bmRlZmluZWR9ICovXG5cdFx0dGhpcy5lbnRlciA9IGVudGVyO1xuXG5cdFx0LyoqIEB0eXBlIHtTeW5jSGFuZGxlciB8IHVuZGVmaW5lZH0gKi9cblx0XHR0aGlzLmxlYXZlID0gbGVhdmU7XG5cdH1cblxuXHQvKipcblx0ICogQHRlbXBsYXRlIHtOb2RlfSBQYXJlbnRcblx0ICogQHBhcmFtIHtOb2RlfSBub2RlXG5cdCAqIEBwYXJhbSB7UGFyZW50IHwgbnVsbH0gcGFyZW50XG5cdCAqIEBwYXJhbSB7a2V5b2YgUGFyZW50fSBbcHJvcF1cblx0ICogQHBhcmFtIHtudW1iZXIgfCBudWxsfSBbaW5kZXhdXG5cdCAqIEByZXR1cm5zIHtOb2RlIHwgbnVsbH1cblx0ICovXG5cdHZpc2l0KG5vZGUsIHBhcmVudCwgcHJvcCwgaW5kZXgpIHtcblx0XHRpZiAobm9kZSkge1xuXHRcdFx0aWYgKHRoaXMuZW50ZXIpIHtcblx0XHRcdFx0Y29uc3QgX3Nob3VsZF9za2lwID0gdGhpcy5zaG91bGRfc2tpcDtcblx0XHRcdFx0Y29uc3QgX3Nob3VsZF9yZW1vdmUgPSB0aGlzLnNob3VsZF9yZW1vdmU7XG5cdFx0XHRcdGNvbnN0IF9yZXBsYWNlbWVudCA9IHRoaXMucmVwbGFjZW1lbnQ7XG5cdFx0XHRcdHRoaXMuc2hvdWxkX3NraXAgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5zaG91bGRfcmVtb3ZlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMucmVwbGFjZW1lbnQgPSBudWxsO1xuXG5cdFx0XHRcdHRoaXMuZW50ZXIuY2FsbCh0aGlzLmNvbnRleHQsIG5vZGUsIHBhcmVudCwgcHJvcCwgaW5kZXgpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0bm9kZSA9IHRoaXMucmVwbGFjZW1lbnQ7XG5cdFx0XHRcdFx0dGhpcy5yZXBsYWNlKHBhcmVudCwgcHJvcCwgaW5kZXgsIG5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkX3JlbW92ZSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlKHBhcmVudCwgcHJvcCwgaW5kZXgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2tpcHBlZCA9IHRoaXMuc2hvdWxkX3NraXA7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLnNob3VsZF9yZW1vdmU7XG5cblx0XHRcdFx0dGhpcy5zaG91bGRfc2tpcCA9IF9zaG91bGRfc2tpcDtcblx0XHRcdFx0dGhpcy5zaG91bGRfcmVtb3ZlID0gX3Nob3VsZF9yZW1vdmU7XG5cdFx0XHRcdHRoaXMucmVwbGFjZW1lbnQgPSBfcmVwbGFjZW1lbnQ7XG5cblx0XHRcdFx0aWYgKHNraXBwZWQpIHJldHVybiBub2RlO1xuXHRcdFx0XHRpZiAocmVtb3ZlZCkgcmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdC8qKiBAdHlwZSB7a2V5b2YgTm9kZX0gKi9cblx0XHRcdGxldCBrZXk7XG5cblx0XHRcdGZvciAoa2V5IGluIG5vZGUpIHtcblx0XHRcdFx0LyoqIEB0eXBlIHt1bmtub3dufSAqL1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IG5vZGVba2V5XTtcblxuXHRcdFx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9kZXMgPSAvKiogQHR5cGUge0FycmF5PHVua25vd24+fSAqLyAodmFsdWUpO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpdGVtID0gbm9kZXNbaV07XG5cdFx0XHRcdFx0XHRcdGlmIChpc05vZGUoaXRlbSkpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMudmlzaXQoaXRlbSwgbm9kZSwga2V5LCBpKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gcmVtb3ZlZFxuXHRcdFx0XHRcdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNOb2RlKHZhbHVlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy52aXNpdCh2YWx1ZSwgbm9kZSwga2V5LCBudWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubGVhdmUpIHtcblx0XHRcdFx0Y29uc3QgX3JlcGxhY2VtZW50ID0gdGhpcy5yZXBsYWNlbWVudDtcblx0XHRcdFx0Y29uc3QgX3Nob3VsZF9yZW1vdmUgPSB0aGlzLnNob3VsZF9yZW1vdmU7XG5cdFx0XHRcdHRoaXMucmVwbGFjZW1lbnQgPSBudWxsO1xuXHRcdFx0XHR0aGlzLnNob3VsZF9yZW1vdmUgPSBmYWxzZTtcblxuXHRcdFx0XHR0aGlzLmxlYXZlLmNhbGwodGhpcy5jb250ZXh0LCBub2RlLCBwYXJlbnQsIHByb3AsIGluZGV4KTtcblxuXHRcdFx0XHRpZiAodGhpcy5yZXBsYWNlbWVudCkge1xuXHRcdFx0XHRcdG5vZGUgPSB0aGlzLnJlcGxhY2VtZW50O1xuXHRcdFx0XHRcdHRoaXMucmVwbGFjZShwYXJlbnQsIHByb3AsIGluZGV4LCBub2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLnNob3VsZF9yZW1vdmUpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZShwYXJlbnQsIHByb3AsIGluZGV4KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLnNob3VsZF9yZW1vdmU7XG5cblx0XHRcdFx0dGhpcy5yZXBsYWNlbWVudCA9IF9yZXBsYWNlbWVudDtcblx0XHRcdFx0dGhpcy5zaG91bGRfcmVtb3ZlID0gX3Nob3VsZF9yZW1vdmU7XG5cblx0XHRcdFx0aWYgKHJlbW92ZWQpIHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBub2RlO1xuXHR9XG59XG5cbi8qKlxuICogRHVja3R5cGUgYSBub2RlLlxuICpcbiAqIEBwYXJhbSB7dW5rbm93bn0gdmFsdWVcbiAqIEByZXR1cm5zIHt2YWx1ZSBpcyBOb2RlfVxuICovXG5mdW5jdGlvbiBpc05vZGUodmFsdWUpIHtcblx0cmV0dXJuIChcblx0XHR2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICd0eXBlJyBpbiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUudHlwZSA9PT0gJ3N0cmluZydcblx0KTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL3dvcmtzcGFjZS9ub2RlX21vZHVsZXMvLnBucG0vZXN0cmVlLXdhbGtlckAzLjAuMy9ub2RlX21vZHVsZXMvZXN0cmVlLXdhbGtlci9zcmNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi93b3Jrc3BhY2Uvbm9kZV9tb2R1bGVzLy5wbnBtL2VzdHJlZS13YWxrZXJAMy4wLjMvbm9kZV9tb2R1bGVzL2VzdHJlZS13YWxrZXIvc3JjL2luZGV4LmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy93b3Jrc3BhY2Uvbm9kZV9tb2R1bGVzLy5wbnBtL2VzdHJlZS13YWxrZXJAMy4wLjMvbm9kZV9tb2R1bGVzL2VzdHJlZS13YWxrZXIvc3JjL2luZGV4LmpzXCI7aW1wb3J0IHsgU3luY1dhbGtlciB9IGZyb20gJy4vc3luYy5qcyc7XG5pbXBvcnQgeyBBc3luY1dhbGtlciB9IGZyb20gJy4vYXN5bmMuanMnO1xuXG4vKipcbiAqIEB0eXBlZGVmIHtpbXBvcnQoJ2VzdHJlZScpLk5vZGV9IE5vZGVcbiAqIEB0eXBlZGVmIHtpbXBvcnQoJy4vc3luYy5qcycpLlN5bmNIYW5kbGVyfSBTeW5jSGFuZGxlclxuICogQHR5cGVkZWYge2ltcG9ydCgnLi9hc3luYy5qcycpLkFzeW5jSGFuZGxlcn0gQXN5bmNIYW5kbGVyXG4gKi9cblxuLyoqXG4gKiBAcGFyYW0ge05vZGV9IGFzdFxuICogQHBhcmFtIHt7XG4gKiAgIGVudGVyPzogU3luY0hhbmRsZXJcbiAqICAgbGVhdmU/OiBTeW5jSGFuZGxlclxuICogfX0gd2Fsa2VyXG4gKiBAcmV0dXJucyB7Tm9kZSB8IG51bGx9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWxrKGFzdCwgeyBlbnRlciwgbGVhdmUgfSkge1xuXHRjb25zdCBpbnN0YW5jZSA9IG5ldyBTeW5jV2Fsa2VyKGVudGVyLCBsZWF2ZSk7XG5cdHJldHVybiBpbnN0YW5jZS52aXNpdChhc3QsIG51bGwpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7Tm9kZX0gYXN0XG4gKiBAcGFyYW0ge3tcbiAqICAgZW50ZXI/OiBBc3luY0hhbmRsZXJcbiAqICAgbGVhdmU/OiBBc3luY0hhbmRsZXJcbiAqIH19IHdhbGtlclxuICogQHJldHVybnMge1Byb21pc2U8Tm9kZSB8IG51bGw+fVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXN5bmNXYWxrKGFzdCwgeyBlbnRlciwgbGVhdmUgfSkge1xuXHRjb25zdCBpbnN0YW5jZSA9IG5ldyBBc3luY1dhbGtlcihlbnRlciwgbGVhdmUpO1xuXHRyZXR1cm4gYXdhaXQgaW5zdGFuY2UudmlzaXQoYXN0LCBudWxsKTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL3dvcmtzcGFjZS9wYWNrYWdlcy9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3dvcmtzcGFjZS9wYWNrYWdlcy9mcm9udGVuZC92aXRlLmpzb241LnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy93b3Jrc3BhY2UvcGFja2FnZXMvZnJvbnRlbmQvdml0ZS5qc29uNS50c1wiOy8vIE9yaWdpbmFsOiBodHRwczovL2dpdGh1Yi5jb20vcm9sbHVwL3BsdWdpbnMvdHJlZS84ODM1ZGQyYWVkOTJmNDA4ZDdkYzcyZDdjYzI1YTk3MjhlMTZmYWNlL3BhY2thZ2VzL2pzb25cblxuaW1wb3J0IEpTT041IGZyb20gJ2pzb241JztcbmltcG9ydCB7IFBsdWdpbiB9IGZyb20gJ3JvbGx1cCc7XG5pbXBvcnQgeyBjcmVhdGVGaWx0ZXIsIGRhdGFUb0VzbSB9IGZyb20gJ0Byb2xsdXAvcGx1Z2ludXRpbHMnO1xuaW1wb3J0IHsgUm9sbHVwSnNvbk9wdGlvbnMgfSBmcm9tICdAcm9sbHVwL3BsdWdpbi1qc29uJztcblxuLy8ganNvbjUgZXh0ZW5kcyBTeW50YXhFcnJvciB3aXRoIGFkZGl0aW9uYWwgZmllbGRzICh3aXRob3V0IHN1YmNsYXNzaW5nKVxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2pzb241L2pzb241L2Jsb2IvZGUzNDRmMDYxOWJkYTE0NjVhNmUyNWM3NmYxYzBjM2RkYTgxMDhkOS9saWIvcGFyc2UuanMjTDExMTEtTDExMTJcbmludGVyZmFjZSBKc29uNVN5bnRheEVycm9yIGV4dGVuZHMgU3ludGF4RXJyb3Ige1xuXHRsaW5lTnVtYmVyOiBudW1iZXI7XG5cdGNvbHVtbk51bWJlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uNShvcHRpb25zOiBSb2xsdXBKc29uT3B0aW9ucyA9IHt9KTogUGx1Z2luIHtcblx0Y29uc3QgZmlsdGVyID0gY3JlYXRlRmlsdGVyKG9wdGlvbnMuaW5jbHVkZSwgb3B0aW9ucy5leGNsdWRlKTtcblx0Y29uc3QgaW5kZW50ID0gJ2luZGVudCcgaW4gb3B0aW9ucyA/IG9wdGlvbnMuaW5kZW50IDogJ1xcdCc7XG5cblx0cmV0dXJuIHtcblx0XHRuYW1lOiAnanNvbjUnLFxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXNoYWRvd1xuXHRcdHRyYW5zZm9ybShqc29uLCBpZCkge1xuXHRcdFx0aWYgKGlkLnNsaWNlKC02KSAhPT0gJy5qc29uNScgfHwgIWZpbHRlcihpZCkpIHJldHVybiBudWxsO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09ONS5wYXJzZShqc29uKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb2RlOiBkYXRhVG9Fc20ocGFyc2VkLCB7XG5cdFx0XHRcdFx0XHRwcmVmZXJDb25zdDogb3B0aW9ucy5wcmVmZXJDb25zdCxcblx0XHRcdFx0XHRcdGNvbXBhY3Q6IG9wdGlvbnMuY29tcGFjdCxcblx0XHRcdFx0XHRcdG5hbWVkRXhwb3J0czogb3B0aW9ucy5uYW1lZEV4cG9ydHMsXG5cdFx0XHRcdFx0XHRpbmRlbnQsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0bWFwOiB7IG1hcHBpbmdzOiAnJyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmICghKGVyciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSkge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gJ0NvdWxkIG5vdCBwYXJzZSBKU09ONSBmaWxlJztcblx0XHRcdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW5OdW1iZXIgfSA9IGVyciBhcyBKc29uNVN5bnRheEVycm9yO1xuXHRcdFx0XHR0aGlzLndhcm4oeyBtZXNzYWdlLCBpZCwgbG9jOiB7IGxpbmU6IGxpbmVOdW1iZXIsIGNvbHVtbjogY29sdW1uTnVtYmVyIH0gfSk7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNRLE9BQU8sVUFBVTtBQUN2UixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLGVBQWU7QUFDdEIsU0FBMEIsb0JBQW9COzs7QUNDOUMsWUFBWSxRQUFRO0FBQ3BCLFlBQVksVUFBVTtBQUxnSCxJQUFNLDJDQUEyQztBQU92TCxJQUFNLFFBQVEsSUFBSSxTQUFTLEtBQUssT0FBTyxDQUFDLEdBQUcsT0FBTztBQUFBLEVBQ2pELEdBQUc7QUFBQSxFQUNILEdBQUc7QUFBQSxFQUNILEdBQUcsT0FBTyxRQUFRLENBQUMsRUFDakIsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssT0FBTyxFQUFFLENBQUMsTUFBTSxRQUFRLEVBQzdDLE9BQU8sQ0FBQ0EsSUFBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPQSxHQUFFLENBQUMsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBR0EsS0FBSSxDQUFDLENBQUM7QUFDdkQsSUFBSSxDQUFDLENBQUM7QUFFTixJQUFNLFlBQVk7QUFBQSxFQUNqQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFB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NEJBQTRCO0FBQUEsSUFDNUIsK0JBQStCO0FBQUEsSUFDL0IsaUNBQWlDO0FBQUEsSUFDakMsMEJBQTBCO0FBQUEsSUFDMUIsNEJBQTRCO0FBQUEsSUFDNUIsZ0NBQWdDO0FBQUEsSUFDaEMscUJBQXFCO0FBQUEsSUFDckIseUJBQXlCO0FBQUEsSUFDekIsMEJBQTBCO0FBQUEsSUFDMUIsMEJBQTBCO0FBQUEsSUFDMUIsMEJBQTBCO0FBQUEsSUFDMUIsb0JBQW9CO0FBQUEsSUFDcEIseUJBQXlCO0FBQUEsSUFDekIsbUJBQW1CO0FBQUEsSUFDbkIsc0JBQXNCO0FBQUEsSUFDdEIsb0JBQW9CO0FBQUEsSUFDcEIsbUJBQW1CO0FBQUEsSUFDbkIsd0JBQXdCO0FBQUEsSUFDeEIsd0JBQXdCO0FBQUEsSUFDeEIsMEJBQTBCO0FBQUEsSUFDMUIsd0JBQXdCO0FBQUEsSUFDeEIsaUJBQWlCO0FBQUEsSUFDakIsb0JBQW9CO0FBQUEsSUFDcEIscUJBQXFCO0FBQUEsSUFDckIsZUFBZTtBQUFBLElBQ2YsbUJBQW1CO0FBQUEsSUFDbkIsd0JBQXdCO0FBQUEsSUFDeEIscUJBQXFCO0FBQUEsSUFDckIsNEJBQTRCO0FBQUEsSUFDNUIscUJBQXFCO0FBQUEsSUFDckIsZUFBZTtBQUFBLElBQ2YsYUFBYTtBQUFBLElBQ2Isb0NBQW9DO0FBQUEsSUFDcEMsNkJBQTZCO0FBQUEsSUFDN0IsdUJBQXVCO0FBQUEsSUFDdkIscUJBQXFCO0FBQUEsSUFDckIsT0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBVztBQUFBLElBQ1gsd0JBQXdCO0FBQUEsSUFDeEIscUJBQXFCO0FBQUEsSUFDckIsYUFBYTtBQUFBLElBQ2IsYUFBYTtBQUFBLElBQ2IseUJBQXlCO0FBQUEsSUFDekIsWUFBYztBQUFBLElBQ2QsS0FBTztBQUFBLElBQ1AsdUJBQXVCO0FBQUEsSUFDdkIsU0FBVztBQUFBLElBQ1gsVUFBWTtBQUFBLElBQ1osT0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsWUFBYztBQUFBLElBQ2QseUJBQXlCO0FB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QVk7QUFBQSxNQUNwQixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixXQUFXLFFBQVEsSUFBSSxhQUFhO0FBQUEsTUFDcEMsc0JBQXNCO0FBQUE7QUFBQSxNQUd0QixpQkFBaUI7QUFBQSxRQUNoQixTQUFTLENBQUMsY0FBYyxtQkFBbUIsdUJBQXVCLGNBQWM7QUFBQSxNQUNqRjtBQUFBLElBQ0Q7QUFBQSxJQUVBLFFBQVE7QUFBQSxNQUNQLFFBQVE7QUFBQSxJQUNUO0FBQUEsSUFFQSxNQUFNO0FBQUEsTUFDTCxhQUFhO0FBQUEsTUFDYixNQUFNO0FBQUEsUUFDTCxXQUFXO0FBQUEsVUFDVixLQUFLO0FBQUEsWUFDSixTQUFTO0FBQUE7QUFBQSxjQUVSO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxDQUFDLGFBQWE7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLElBQU0sU0FBUyxhQUFhLENBQUMsRUFBRSxTQUFTLEtBQUssTUFBTSxVQUFVLENBQUM7QUFFOUQsSUFBTyxzQkFBUTsiLAogICJuYW1lcyI6IFsiYSIsICJwYWNrYWdlX2RlZmF1bHQiLCAicGFja2FnZV9kZWZhdWx0Il0KfQo=
