'use strict';

const { NodeOperationError } = require('n8n-workflow');
const zalo = require('../lib/zalo');

class ZaloMessage {
  constructor() {
    this.description = {
      displayName: 'Zalo Message',
      name: 'zaloMessage',
      group: ['transform'],
      icon: 'file:../icons/zalo.svg',
      version: 1,
      description: 'Gửi tin nhắn văn bản tới một người dùng Zalo (theo UID hoặc số điện thoại).',
      defaults: {
        name: 'Zalo Message',
      },
      inputs: ['main'],
      outputs: ['main'],
      properties: [
        {
          displayName: 'Sale Code',
          name: 'saleCode',
          type: 'string',
          default: '',
          required: true,
          description: 'Mã tài khoản Zalo dùng để gửi tin nhắn',
        },
        {
          displayName: 'User ID (UID)',
          name: 'uid',
          type: 'string',
          default: '',
          description: 'UID người nhận. Để trống nếu dùng số điện thoại.',
        },
        {
          displayName: 'Phone Number',
          name: 'phone',
          type: 'string',
          default: '',
          description: 'Số điện thoại người nhận. Chỉ dùng khi để trống UID.',
        },
        {
          displayName: 'Text',
          name: 'text',
          type: 'string',
          typeOptions: { rows: 4 },
          default: '',
          required: true,
          description: 'Nội dung tin nhắn. Dùng được placeholder: {name}, {uid}, {phone}, {sale}.',
        },
        {
          displayName: 'Options',
          name: 'options',
          type: 'collection',
          placeholder: 'Thêm tùy chọn',
          default: {},
          options: [
            {
              displayName: 'Dry Run',
              name: 'dryRun',
              type: 'boolean',
              default: false,
              description: 'Bật để chỉ dựng nội dung tin nhắn mà KHÔNG gửi thật.',
            },
            {
              displayName: 'Session Directory',
              name: 'sessionDir',
              type: 'string',
              default: '',
              description: 'Thư mục phiên. Để trống dùng mặc định.',
            },
          ],
        },
      ],
    };
  }

  async execute() {
    const items = this.getInputData();
    const returnData = [];

    for (let i = 0; i < items.length; i++) {
      const saleCode = String(this.getNodeParameter('saleCode', i, '')).trim();
      const uid = String(this.getNodeParameter('uid', i, '') || '').trim();
      const phone = String(this.getNodeParameter('phone', i, '') || '').trim();
      const text = String(this.getNodeParameter('text', i, ''));
      const options = this.getNodeParameter('options', i, {});
      const dir = options.sessionDir ? String(options.sessionDir) : undefined;

      try {
        if (!saleCode) throw new Error('Thiếu Sale Code');
        if (!uid && !phone) throw new Error('Cần UID hoặc số điện thoại người nhận');
        if (!text) throw new Error('Thiếu nội dung tin nhắn');

        const result = await zalo.sendMessage(
          saleCode,
          { uid, phone, text },
          { dir, dryRun: Boolean(options.dryRun) },
        );
        returnData.push({ json: result, pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { status: 'ERROR', error: error && error.message ? error.message : String(error) },
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

module.exports = { ZaloMessage };
