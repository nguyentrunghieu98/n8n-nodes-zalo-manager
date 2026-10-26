'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// n8n-workflow chỉ có trong môi trường n8n; stub để test được ngoài n8n.
const stub = path.join(__dirname, 'stub-n8n-workflow.js');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...args) {
  if (request === 'n8n-workflow') return stub;
  return originalResolve.call(this, request, ...args);
};

const pkg = require('../package.json');

function validateDisplayOptions(nodeName, property) {
  const displayOptions = property.displayOptions;
  if (!displayOptions) return;
  for (const key of ['show', 'hide']) {
    if (!displayOptions[key]) continue;
    const value = displayOptions[key];
    assert.strictEqual(
      typeof value,
      'object',
      `${nodeName}.${property.name}.displayOptions.${key} phải là object`,
    );
    assert.strictEqual(
      Array.isArray(value),
      false,
      `${nodeName}.${property.name}.displayOptions.${key} không được là array`,
    );
    for (const [param, list] of Object.entries(value)) {
      assert.ok(
        Array.isArray(list),
        `${nodeName}.${property.name}.displayOptions.${key}.${param} phải là array`,
      );
    }
  }
}

test('package.json khai báo node files tồn tại', () => {
  assert.ok(Array.isArray(pkg.n8n.nodes) && pkg.n8n.nodes.length > 0);
  for (const file of pkg.n8n.nodes) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', file)), `thiếu file ${file}`);
  }
});

for (const file of pkg.n8n.nodes) {
  test(`node ${file} có description hợp lệ`, () => {
    const moduleExports = require(path.join(__dirname, '..', file));
    const classes = Object.values(moduleExports).filter((value) => typeof value === 'function');
    assert.strictEqual(classes.length, 1, `${file} phải export đúng 1 class`);

    const node = new classes[0]();
    const description = node.description;
    assert.ok(description.displayName, `${file} thiếu displayName`);
    assert.ok(description.name, `${file} thiếu name`);
    assert.strictEqual(description.version, 1);
    assert.ok(Array.isArray(description.properties) && description.properties.length > 0);

    if (description.icon && description.icon.startsWith('file:')) {
      const iconPath = path.resolve(path.dirname(path.join(__dirname, '..', file)), description.icon.slice(5));
      assert.ok(fs.existsSync(iconPath), `${file} trỏ tới icon không tồn tại: ${iconPath}`);
      assert.ok(iconPath.endsWith('.svg'), `${file} icon phải là .svg`);
    }

    for (const property of description.properties) {
      assert.ok(property.name, `${file} có property thiếu name`);
      assert.ok(property.type, `${file}.${property.name} thiếu type`);
      validateDisplayOptions(file, property);
    }
  });
}
