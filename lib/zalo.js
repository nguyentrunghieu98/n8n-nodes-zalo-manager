'use strict';

const { Zalo, LoginQRCallbackEventType, ThreadType } = require('zca-js');
const store = require('./session-store');
const stateStore = require('./state-store');
const policy = require('./policy');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

const apiCache = new Map();
const qrPending = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  if (!error) return 'Lỗi không xác định';
  if (typeof error === 'string') return error;
  return String(error.message || error);
}

function cacheKey(code, dir) {
  return `${dir || ''}::${code}`;
}

async function getApi(code, dir) {
  const key = cacheKey(code, dir);
  if (apiCache.has(key)) return apiCache.get(key);

  const credentials = store.readSession(code, dir);
  if (!credentials) {
    throw new Error('Chưa có phiên Zalo cho mã Sale này. Hãy tạo QR và đăng nhập trước.');
  }

  const zalo = new Zalo({ logging: false });
  const api = await zalo.login({
    cookie: credentials.cookie,
    imei: credentials.imei,
    userAgent: credentials.userAgent || DEFAULT_USER_AGENT,
    language: 'vi',
  });
  apiCache.set(key, api);
  return api;
}

function clearApi(code, dir) {
  apiCache.delete(cacheKey(code, dir));
}

async function sessionStatus(code, dir) {
  if (!store.hasSession(code, dir)) {
    return { status: 'missing', code, error: 'Chưa có phiên Zalo' };
  }
  try {
    const api = await getApi(code, dir);
    const info = await api.fetchAccountInfo();
    const profile = info?.profile || {};
    return {
      status: 'ok',
      code,
      uid: profile.userId ? String(profile.userId) : '',
      name: profile.displayName || profile.zaloName || '',
    };
  } catch (error) {
    clearApi(code, dir);
    return { status: 'expired', code, error: errorMessage(error) };
  }
}

async function validateAllSessions(dir) {
  const results = [];
  for (const session of store.listSessions(dir)) {
    results.push(await sessionStatus(session.code, dir));
  }
  return results;
}

async function startQr(code, options = {}) {
  const saleCode = store.safeCode(code);
  const dir = options.dir;
  const timeoutMs = Number(options.timeoutMs || 20000);
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const key = cacheKey(saleCode, dir);

  if (qrPending.has(key) && qrPending.get(key).image) {
    return qrPending.get(key).image;
  }

  const state = { image: null, startedAt: Date.now() };
  qrPending.set(key, state);

  const zalo = new Zalo({ logging: false });
  zalo
    .loginQR({ userAgent, language: 'vi' }, (event) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        const base64 = String(event.data.image).replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        state.image = Buffer.from(base64, 'base64');
      } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        store.saveSession(
          saleCode,
          {
            cookie: event.data.cookie,
            imei: event.data.imei,
            userAgent: event.data.userAgent || userAgent,
          },
          dir,
        );
      }
    })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => qrPending.delete(key), 1000);
    });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !state.image) {
    await sleep(50);
  }

  if (!state.image) {
    qrPending.delete(key);
    throw new Error('Không tạo được mã QR. Kiểm tra kết nối mạng của n8n và thử lại.');
  }

  return state.image;
}

async function logout(code, dir) {
  const saleCode = store.safeCode(code);
  clearApi(saleCode, dir);
  store.deleteSession(saleCode, dir);
  return { status: 'logged_out', code: saleCode };
}

function firstProfile(info) {
  const profiles = info?.changed_profiles || (info?.data && info.data.changed_profiles) || {};
  const key = Object.keys(profiles)[0];
  return key ? profiles[key] : null;
}

async function findUser(code, phone, dir) {
  const api = await getApi(code, dir);
  const user = await api.findUser(String(phone));
  if (!user || !user.uid) {
    return { found: false, phone: String(phone) };
  }
  return {
    found: true,
    uid: String(user.uid),
    name: user.display_name || '',
    globalId: user.globalId || '',
  };
}

async function getProfile(code, uid, dir) {
  const api = await getApi(code, dir);
  const info = await api.getUserInfo(String(uid));
  const profile = firstProfile(info);
  if (!profile) return { found: false, uid: String(uid) };
  return {
    found: true,
    uid: String(profile.userId || uid),
    name: profile.displayName || '',
    isFriend: Number(profile.isFr || 0),
    isBlocked: Number(profile.isBlocked || 0),
  };
}

async function friendStatus(code, uid, dir) {
  const api = await getApi(code, dir);
  const status = await api.getFriendRequestStatus(String(uid));
  return {
    uid: String(uid),
    isFriend: Number(status?.is_friend || 0),
    isRequested: Number(status?.is_requested || 0),
    isRequesting: Number(status?.is_requesting || 0),
    addFriendPrivacy: Number(status?.addFriendPrivacy || 0),
  };
}

async function sentRequests(code, dir) {
  const api = await getApi(code, dir);
  return (await api.getSentFriendRequest()) || {};
}

async function getAllFriends(code, dir) {
  const api = await getApi(code, dir);
  const friends = await api.getAllFriends();
  return (friends || []).map((friend) => ({
    uid: String(friend.userId || friend.uid || ''),
    name: friend.displayName || friend.zaloName || friend.display_name || '',
    isFriend: 1,
  }));
}

async function acceptFriendRequest(code, uid, dir) {
  const api = await getApi(code, dir);
  await api.acceptFriendRequest(String(uid));
  return { status: 'ACCEPTED', uid: String(uid) };
}

async function removeFriend(code, uid, dir) {
  const api = await getApi(code, dir);
  await api.removeFriend(String(uid));
  return { status: 'REMOVED', uid: String(uid) };
}

async function blockUser(code, uid, dir) {
  const api = await getApi(code, dir);
  await api.blockUser(String(uid));
  return { status: 'BLOCKED', uid: String(uid) };
}

async function unblockUser(code, uid, dir) {
  const api = await getApi(code, dir);
  await api.unblockUser(String(uid));
  return { status: 'UNBLOCKED', uid: String(uid) };
}

async function undoInvite(code, uid, dir) {
  const api = await getApi(code, dir);
  await api.undoFriendRequest(String(uid));
  return { status: 'UNDONE', uid: String(uid) };
}

async function sendMessage(code, { uid, phone, text, templateVars }, options = {}) {
  const dir = options.dir;
  const dryRun = Boolean(options.dryRun);

  let targetUid = uid ? String(uid) : '';
  let targetName = '';
  if (!targetUid && phone) {
    const found = await findUser(code, phone, dir);
    if (!found.found) return { status: 'NOT_FOUND', phone: String(phone) };
    targetUid = found.uid;
    targetName = found.name;
  }
  if (!targetUid) throw new Error('Cần UID hoặc số điện thoại người nhận');

  const content = policy.renderTemplate(text, {
    ...(templateVars || {}),
    uid: targetUid,
    name: targetName,
    phone: phone ? String(phone) : '',
    sale: String(code),
  });

  if (dryRun) {
    return { status: 'WOULD_SEND', uid: targetUid, name: targetName, text: content };
  }

  const api = await getApi(code, dir);
  const result = await api.sendMessage({ text: content }, targetUid, ThreadType.User);
  return {
    status: 'SENT',
    uid: targetUid,
    name: targetName,
    msgId: result?.message?.msgId ?? null,
  };
}

async function invite(code, phone, message, requestId, options = {}) {
  const saleCode = store.safeCode(code);
  const dir = options.dir;
  const dryRun = Boolean(options.dryRun);
  const now = Date.now();
  const phoneText = String(phone || '');

  const state = stateStore.readState(saleCode, dir);
  const decision = policy.checkInvitePolicy({ state, phone: phoneText, requestId, options, now });

  if (decision.action === 'blocked' || decision.action === 'cached' || decision.action === 'rate_limited') {
    return decision.result;
  }

  const nextDelaySeconds = decision.nextDelaySeconds;

  let found;
  try {
    found = await findUser(saleCode, phoneText, dir);
  } catch (error) {
    found = { found: false, phone: phoneText, error: errorMessage(error) };
  }
  if (!found.found) {
    const result = {
      status: 'NOT_FOUND',
      phone: phoneText,
      error: found.error || '',
      nextDelaySeconds,
    };
    if (requestId) stateStore.writeState(saleCode, withIdempotency(state, requestId, result, now), dir);
    return result;
  }

  const profile = await getProfile(saleCode, found.uid, dir);
  if (profile.isFriend) {
    const result = {
      status: 'ALREADY_FRIENDS',
      uid: found.uid,
      name: profile.name,
      nextDelaySeconds,
    };
    if (requestId) stateStore.writeState(saleCode, withIdempotency(state, requestId, result, now), dir);
    return result;
  }

  const status = await friendStatus(saleCode, found.uid, dir);
  if (status.isRequested || status.isRequesting) {
    const result = {
      status: 'ALREADY_INVITED',
      uid: found.uid,
      name: profile.name,
      nextDelaySeconds,
    };
    if (requestId) stateStore.writeState(saleCode, withIdempotency(state, requestId, result, now), dir);
    return result;
  }

  const content = policy.renderTemplate(message, {
    ...(options.templateVars || {}),
    name: profile.name,
    phone: phoneText,
    uid: found.uid,
    sale: saleCode,
  });

  if (dryRun) {
    return {
      status: 'WOULD_INVITE',
      uid: found.uid,
      name: profile.name,
      message: content,
      nextDelaySeconds,
    };
  }

  const api = await getApi(saleCode, dir);
  let result;
  try {
    await api.sendFriendRequest(content, found.uid);
    await sleep(1200);
    const after = await api.getFriendRequestStatus(found.uid);
    result = {
      status: Number(after?.is_requested || 0) ? 'INVITED' : 'UNKNOWN',
      uid: found.uid,
      name: profile.name,
      isRequested: Number(after?.is_requested || 0),
      nextDelaySeconds,
    };
  } catch (error) {
    result = {
      status: 'SEND_ERROR',
      uid: found.uid,
      name: profile.name,
      errorCode: error?.code ?? null,
      error: errorMessage(error),
      nextDelaySeconds,
    };
  }

  const nextState = withIdempotency(
    {
      ...state,
      sends: [...state.sends, { ts: now, phone: phoneText, kind: 'invite' }],
      lastInviteAt: now,
    },
    requestId,
    result,
    now,
  );
  stateStore.writeState(saleCode, nextState, dir);
  return result;
}

function withIdempotency(state, requestId, result, now) {
  if (!requestId) return state;
  return {
    ...state,
    idempotency: {
      ...state.idempotency,
      [requestId]: { ts: now, result },
    },
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  sessionStatus,
  validateAllSessions,
  startQr,
  logout,
  findUser,
  getProfile,
  friendStatus,
  sentRequests,
  getAllFriends,
  acceptFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  undoInvite,
  sendMessage,
  invite,
  clearApi,
};
