'use strict';

const { NodeOperationError } = require('n8n-workflow');
const zalo = require('../lib/zalo');
const store = require('../lib/session-store');

class ZaloSession {
  constructor() {
    this.description = {
      displayName: 'Zalo Session',
      name: 'zaloSession',
      group: ['transform'],
      icon: 'file:../icons/zalo.svg',
      version: 1,
      description:
        'Quản lý phiên Zalo cá nhân: kiểm tra trạng thái, tạo mã QR đăng nhập, liệt kê và kiểm tra toàn bộ phiên.',
      defaults: {
        name: 'Zalo Session',
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
            { name: 'Check Session Status', value: 'status' },
            { name: 'Generate Login QR', value: 'loginQr' },
            { name: 'List Sessions', value: 'list' },
            { name: 'Validate All Sessions', value: 'validateAll' },
            { name: 'Logout', value: 'logout' },
          ],
          default: 'status',
        },
        {
          displayName: 'Sale Code',
          name: 'saleCode',
          type: 'string',
          default: '',
          required: true,
          displayOptions: { show: { operation: ['status', 'loginQr', 'logout'] } },
          description: 'Mã định danh tài khoản Zalo (ví dụ: 108279)',
        },
        {
          displayName: 'Login Timeout (Seconds)',
          name: 'timeout',
          type: 'number',
          default: 20,
          typeOptions: { minValue: 5, maxValue: 120 },
          displayOptions: { show: { operation: ['loginQr'] } },
          description: 'Thời gian tối đa chờ tạo mã QR',
        },
        {
          displayName: 'Options',
          name: 'options',
          type: 'collection',
          placeholder: 'Thêm tùy chọn',
          default: {},
          options: [
            {
              displayName: 'Session Directory',
              name: 'sessionDir',
              type: 'string',
              default: '',
              description:
                'Thư mục lưu phiên. Để trống dùng mặc định (~/.n8n/zalo-sessions hoặc ZALO_SESSION_DIR).',
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
      const operation = this.getNodeParameter('operation', i);
      const options = this.getNodeParameter('options', i, {});
      const dir = options.sessionDir ? String(options.sessionDir) : undefined;

      try {
        if (operation === 'list') {
          for (const session of store.listSessions(dir)) {
            returnData.push({ json: session, pairedItem: { item: i } });
          }
          continue;
        }

        if (operation === 'validateAll') {
          for (const result of await zalo.validateAllSessions(dir)) {
            returnData.push({ json: result, pairedItem: { item: i } });
          }
          continue;
        }

        const code = String(this.getNodeParameter('saleCode', i, '')).trim();
        if (!code) {
          throw new Error('Thiếu Sale Code');
        }

        if (operation === 'status') {
          returnData.push({ json: await zalo.sessionStatus(code, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'logout') {
          returnData.push({ json: await zalo.logout(code, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'loginQr') {
          const timeout = Number(this.getNodeParameter('timeout', i, 20));
          const image = await zalo.startQr(code, { timeoutMs: timeout * 1000, dir });
          const binary = await this.helpers.prepareBinaryData(image, 'zalo-qr.png', 'image/png');
          returnData.push({
            json: {
              code,
              status: 'qr_ready',
              message: 'Mở ảnh QR và quét bằng ứng dụng Zalo trong vòng khoảng 100 giây.',
            },
            binary: { qr: binary },
            pairedItem: { item: i },
          });
          continue;
        }

        throw new Error(`Thao tác không hỗ trợ: ${operation}`);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: error && error.message ? error.message : String(error) },
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

module.exports = { ZaloSession };
