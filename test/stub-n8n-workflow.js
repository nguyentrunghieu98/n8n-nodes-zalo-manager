'use strict';

class NodeOperationError extends Error {
  constructor(node, error, options = {}) {
    super(error && error.message ? error.message : String(error));
    this.name = 'NodeOperationError';
    this.node = node;
    this.itemIndex = options.itemIndex;
  }
}

module.exports = { NodeOperationError };
