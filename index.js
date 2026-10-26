'use strict';

/**
 * Điểm vào cho việc dùng package như thư viện (không bắt buộc với n8n).
 * n8n tự nạp các node theo khai báo "n8n.nodes" trong package.json.
 */
const { ZaloSession } = require('./nodes/ZaloSession.node.js');
const { ZaloContact } = require('./nodes/ZaloContact.node.js');
const { ZaloMessage } = require('./nodes/ZaloMessage.node.js');
const { ZaloInvite } = require('./nodes/ZaloInvite.node.js');

module.exports = {
  ZaloSession,
  ZaloContact,
  ZaloMessage,
  ZaloInvite,
};
