'use strict';

const { NodeOperationError } = require('n8n-workflow');
const zalo = require('../lib/zalo');

class ZaloInvite {
  constructor() {
    this.description = {
      displayName: 'Zalo Invite',
      name: 'zaloInvite',
      group: ['transform'],
      icon: 'file:../icons/zalo.svg',
      version: 1,
      description:
        'Gửi hoặc thu hồi lời mời kết bạn Zalo. Tự kiểm tra đã là bạn / đã mời trước đó, giới hạn số lượng, giãn cách và chống gửi trùng.',
      defaults: {
        name: 'Zalo Invite',
      },
      inputs: ['main'],
      outputs: ['main'],
      properties: [
        {
          displayName: 'Operation',
          name: 'operation',
          type: 'options',
          noDataExpression: true,
          options: [
            { name: 'Send Friend Request', value: 'send' },
            { name: 'Undo Friend Request', value: 'undo' },
          ],
          default: 'send',
        },
        {
          displayName: 'Sale Code',
          name: 'saleCode',
          type: 'string',
          default: '',
          required: true,
          description: 'Mã tài khoản Zalo dùng để gửi lời mời',
        },
        {
          displayName: 'Phone Number',
          name: 'phone',
          type: 'string',
          default: '',
          required: true,
          displayOptions: { show: { operation: ['send'] } },
          description: 'Số điện thoại khách hàng, ví dụ 0900000000',
        },
        {
          displayName: 'User ID (UID)',
          name: 'uid',
          type: 'string',
          default: '',
          required: true,
          displayOptions: { show: { operation: ['undo'] } },
          description: 'UID người nhận lời mời cần thu hồi',
        },
        {
          displayName: 'Message',
          name: 'message',
          type: 'string',
          typeOptions: { rows: 3 },
          default: '',
          required: true,
          displayOptions: { show: { operation: ['send'] } },
          description:
            'Nội dung lời mời. Dùng được placeholder: {name} (tên khách), {phone}, {sale}.',
        },
        {
          displayName: 'Request ID',
          name: 'requestId',
          type: 'string',
          default: '',
          displayOptions: { show: { operation: ['send'] } },
          description:
            'Mã chống gửi trùng, lưu bền theo từng tài khoản (ví dụ RUN-20260101-001). Để trống nếu không cần.',
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
              description:
                'Bật để chỉ kiểm tra (tra cứu, bạn bè, giới hạn) mà KHÔNG gửi lời mời thật.',
            },
            {
              displayName: 'Allowlist',
              name: 'allowlist',
              type: 'string',
              default: '',
              description:
                'Danh sách SĐT được phép gửi, cách nhau dấu phẩy. Để trống = không giới hạn.',
            },
            {
              displayName: 'Daily Limit',
              name: 'dailyLimit',
              type: 'number',
              default: 29,
              typeOptions: { minValue: 0 },
              description: 'Số lời mời tối đa mỗi ngày cho tài khoản này. 0 = không giới hạn.',
            },
            {
              displayName: 'Min Interval (Seconds)',
              name: 'minIntervalSec',
              type: 'number',
              default: 120,
              typeOptions: { minValue: 0 },
              description: 'Khoảng cách tối thiểu giữa hai lời mời của cùng tài khoản.',
            },
            {
              displayName: 'Max Interval (Seconds)',
              name: 'maxIntervalSec',
              type: 'number',
              default: 180,
              typeOptions: { minValue: 0 },
              description: 'Trần khoảng cách gợi ý. Node trả về nextDelaySeconds ngẫu nhiên trong khoảng.',
            },
            {
              displayName: 'Request ID TTL (Hours)',
              name: 'requestIdTtlHours',
              type: 'number',
              default: 168,
              typeOptions: { minValue: 1 },
              description: 'Thời gian ghi nhớ Request ID để chống gửi trùng.',
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
      const operation = this.getNodeParameter('operation', i, 'send');
      const saleCode = String(this.getNodeParameter('saleCode', i, '')).trim();
      const options = this.getNodeParameter('options', i, {});
      const dir = options.sessionDir ? String(options.sessionDir) : undefined;

      try {
        if (!saleCode) throw new Error('Thiếu Sale Code');

        if (operation === 'undo') {
          const uid = String(this.getNodeParameter('uid', i, '')).trim();
          if (!uid) throw new Error('Thiếu UID');
          returnData.push({ json: await zalo.undoInvite(saleCode, uid, dir), pairedItem: { item: i } });
          continue;
        }

        const phone = String(this.getNodeParameter('phone', i, '')).trim();
        const message = String(this.getNodeParameter('message', i, ''));
        const requestId = String(this.getNodeParameter('requestId', i, '') || '').trim();
        if (!phone) throw new Error('Thiếu số điện thoại');
        if (!message) throw new Error('Thiếu nội dung lời mời');

        const result = await zalo.invite(saleCode, phone, message, requestId, {
          dir,
          dryRun: Boolean(options.dryRun),
          allowlist: options.allowlist,
          dailyLimit: options.dailyLimit,
          minIntervalSec: options.minIntervalSec,
          maxIntervalSec: options.maxIntervalSec,
          requestIdTtlHours: options.requestIdTtlHours,
        });
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

module.exports = { ZaloInvite };
