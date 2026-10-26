'use strict';

const { NodeOperationError } = require('n8n-workflow');
const zalo = require('../lib/zalo');

class ZaloContact {
  constructor() {
    this.description = {
      displayName: 'Zalo Contact',
      name: 'zaloContact',
      group: ['transform'],
      icon: 'file:../icons/zalo.svg',
      version: 1,
      description:
        'Tra cứu người dùng Zalo, trạng thái bạn bè, danh sách bạn bè và quản lý lời mời kết bạn.',
      defaults: {
        name: 'Zalo Contact',
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
            { name: 'Find User by Phone', value: 'findUser' },
            { name: 'Get Profile', value: 'getProfile' },
            { name: 'Get Friend Request Status', value: 'friendStatus' },
            { name: 'Get Sent Friend Requests', value: 'sentRequests' },
            { name: 'Get All Friends', value: 'getAllFriends' },
            { name: 'Accept Friend Request', value: 'acceptFriendRequest' },
            { name: 'Remove Friend', value: 'removeFriend' },
            { name: 'Block User', value: 'blockUser' },
            { name: 'Unblock User', value: 'unblockUser' },
          ],
          default: 'findUser',
        },
        {
          displayName: 'Sale Code',
          name: 'saleCode',
          type: 'string',
          default: '',
          required: true,
          description: 'Mã tài khoản Zalo dùng để tra cứu',
        },
        {
          displayName: 'Phone Number',
          name: 'phone',
          type: 'string',
          default: '',
          required: true,
          displayOptions: { show: { operation: ['findUser'] } },
          description: 'Số điện thoại Việt Nam, ví dụ 0900000000',
        },
        {
          displayName: 'User ID (UID)',
          name: 'uid',
          type: 'string',
          default: '',
          required: true,
          displayOptions: {
            show: [
              'getProfile',
              'friendStatus',
              'acceptFriendRequest',
              'removeFriend',
              'blockUser',
              'unblockUser',
            ],
          },
          description: 'UID người dùng Zalo',
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
      const operation = this.getNodeParameter('operation', i);
      const code = String(this.getNodeParameter('saleCode', i, '')).trim();
      const options = this.getNodeParameter('options', i, {});
      const dir = options.sessionDir ? String(options.sessionDir) : undefined;

      try {
        if (!code) throw new Error('Thiếu Sale Code');

        if (operation === 'findUser') {
          const phone = String(this.getNodeParameter('phone', i, '')).trim();
          if (!phone) throw new Error('Thiếu số điện thoại');
          returnData.push({ json: await zalo.findUser(code, phone, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'getProfile') {
          const uid = String(this.getNodeParameter('uid', i, '')).trim();
          if (!uid) throw new Error('Thiếu UID');
          returnData.push({ json: await zalo.getProfile(code, uid, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'friendStatus') {
          const uid = String(this.getNodeParameter('uid', i, '')).trim();
          if (!uid) throw new Error('Thiếu UID');
          returnData.push({ json: await zalo.friendStatus(code, uid, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'getAllFriends') {
          const friends = await zalo.getAllFriends(code, dir);
          for (const friend of friends) {
            returnData.push({ json: friend, pairedItem: { item: i } });
          }
          continue;
        }

        if (
          operation === 'acceptFriendRequest' ||
          operation === 'removeFriend' ||
          operation === 'blockUser' ||
          operation === 'unblockUser'
        ) {
          const uid = String(this.getNodeParameter('uid', i, '')).trim();
          if (!uid) throw new Error('Thiếu UID');
          const fn =
            operation === 'acceptFriendRequest'
              ? zalo.acceptFriendRequest
              : operation === 'removeFriend'
                ? zalo.removeFriend
                : operation === 'blockUser'
                  ? zalo.blockUser
                  : zalo.unblockUser;
          returnData.push({ json: await fn(code, uid, dir), pairedItem: { item: i } });
          continue;
        }

        if (operation === 'sentRequests') {
          const sent = await zalo.sentRequests(code, dir);
          returnData.push({ json: { sent }, pairedItem: { item: i } });
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

module.exports = { ZaloContact };
