# n8n-nodes-zalo-manager

Bộ node cộng đồng cho n8n để quản lý **nhiều tài khoản Zalo cá nhân**: đăng nhập bằng QR, tra cứu danh bạ, gửi tin nhắn và gửi/thu hồi lời mời kết bạn.

> ⚠️ **Không chính thức.** Package hoạt động bằng cách mô phỏng Zalo Web qua thư viện [`zca-js`](https://www.npmjs.com/package/zca-js). Zalo không cung cấp API cho tài khoản cá nhân, nên việc sử dụng có thể khiến tài khoản bị hạn chế hoặc khoá. Đọc kỹ phần **Miễn trừ trách nhiệm** trước khi dùng.

---

## Tính năng

Package gồm 4 node:

| Node | Thao tác |
| --- | --- |
| **Zalo Session** | `Check Session Status`, `Generate Login QR`, `List Sessions`, `Logout` |
| **Zalo Contact** | `Find User by Phone`, `Get Profile`, `Get Friend Request Status`, `Get Sent Friend Requests`, `Get All Friends`, `Accept Friend Request`, `Remove Friend`, `Block User`, `Unblock User` |
| **Zalo Message** | Gửi tin nhắn văn bản tới người dùng (theo UID hoặc SĐT) |
| **Zalo Invite** | `Send Friend Request` (tự kiểm tra đã là bạn / đã mời), `Undo Friend Request` |

Điểm chính:

- Quản lý **nhiều tài khoản Zalo** trong cùng một node: mỗi tài khoản định danh bằng `Sale Code`.
- Không cần khai báo credential trong n8n: phiên lưu thành file riêng, quyền `0600`.
- QR đăng nhập trả về **binary PNG**, gửi thẳng được qua Telegram.
- `Zalo Invite` trả trạng thái rõ ràng: `INVITED`, `ALREADY_FRIENDS`, `ALREADY_INVITED`, `NOT_FOUND`, `SEND_ERROR`, `UNKNOWN`.
- **Dry Run**: chạy thử toàn bộ luồng mà không gửi thật.
- **Allowlist**: chỉ cho phép gửi tới danh sách SĐT đã khai báo.
- **Giới hạn thông minh**: tối đa N lời mời/ngày, giãn cách tối thiểu, trả `nextDelaySeconds` để workflow dùng node Wait.
- **Chống trùng bền**: Request ID được lưu theo từng tài khoản với TTL cấu hình.
- **Placeholder trong nội dung**: `{name}`, `{phone}`, `{sale}`, `{uid}`.
- **Kiểm tra toàn bộ phiên** bằng một thao tác.

---

## Yêu cầu

- n8n tự host (đã kiểm thử với n8n 2.44.6).
- Node.js >= 18.
- Một hoặc nhiều tài khoản Zalo cá nhân.
- Quyền cài community node trên instance n8n.

---

## Cài đặt

### Cách 1 — Qua giao diện n8n (khuyến nghị)

1. **Settings → Community nodes → Install**.
2. Nhập tên package:

```text
n8n-nodes-zalo-manager
```

3. Đồng ý cảnh báo và chờ cài.

### Cách 2 — Cài thủ công (Docker)

```bash
docker exec -u node <container_n8n> sh -c \
  "cd /home/node/.n8n/nodes && npm install n8n-nodes-zalo-manager --omit=dev --legacy-peer-deps --ignore-scripts"
docker restart <container_n8n>
```

Sau khi cài, tìm **Zalo Session** trong danh sách node để kiểm tra.

---

## Cấu hình phiên Zalo

Phiên lưu tại:

```text
~/.n8n/zalo-sessions/<sale-code>.json
```

Đổi thư mục bằng biến môi trường:

```text
ZALO_SESSION_DIR=/duong/dan/khac
```

- Thư mục nên đặt quyền `0700`, file phiên `0600`.
- **Không** commit, không đưa lên Google Sheets, không gửi qua chat.
- File phiên tương đương quyền truy cập tài khoản Zalo — sao lưu an toàn.

### Luồng đăng nhập QR

```text
Zalo Session (Generate Login QR)
   → trả binary "qr" (PNG)
   → gửi ảnh cho người dùng (Telegram, email, ...)
   → người dùng quét bằng Zalo và xác nhận trên điện thoại
   → Zalo Session (Check Session Status) trả status = ok
```

Mã QR có hiệu lực khoảng **100 giây**; hết hạn thì chạy lại thao tác tạo QR.

---

## Tham chiếu node

### Zalo Session

| Tham số | Mô tả |
| --- | --- |
| `Operation` | `Check Session Status`, `Generate Login QR`, `List Sessions`, `Validate All Sessions`, `Logout` |
| `Sale Code` | Mã tài khoản (chữ, số, `-`, `_`) |
| `Login Timeout (Seconds)` | Thời gian chờ tạo QR (mặc định 20) |

Kết quả:

- `status`: `{ code, status: ok | expired | missing, uid, name }`
- `loginQr`: `{ code, status: "qr_ready" }` kèm binary `qr`
- `list`: `{ code, updatedAt }`
- `logout`: `{ status: "logged_out", code }` — xoá file phiên

### Zalo Contact

| Tham số | Mô tả |
| --- | --- |
| `Operation` | 9 thao tác như bảng trên |
| `Sale Code` | Tài khoản dùng để tra cứu |
| `Phone Number` | Cho `Find User by Phone` |
| `User ID (UID)` | Cho các thao tác theo UID |

Kết quả tiêu biểu:

```json
{ "found": true, "uid": "123456789", "name": "Tên hiển thị" }
{ "uid": "123456789", "isFriend": 0, "isRequested": 1, "isRequesting": 0 }
{ "status": "ACCEPTED", "uid": "123456789" }
```

### Zalo Message

| Tham số | Mô tả |
| --- | --- |
| `Sale Code` | Tài khoản gửi |
| `User ID (UID)` | Người nhận (ưu tiên) |
| `Phone Number` | Dùng khi để trống UID |
| `Text` | Nội dung tin nhắn, hỗ trợ `{name}`, `{uid}`, `{phone}`, `{sale}` |
| `Options → Dry Run` | Không gửi thật, chỉ trả nội dung đã dựng |
| `Options → Session Directory` | Thư mục phiên riêng |

Kết quả:

```json
{ "status": "SENT", "uid": "123456789", "msgId": 1234567890 }
```

### Zalo Invite

Tùy chọn nâng cao (mục **Options**):

| Tùy chọn | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `Dry Run` | `false` | Chỉ kiểm tra, không gửi thật |
| `Allowlist` | rỗng | Danh sách SĐT được phép gửi, cách nhau dấu phẩy |
| `Daily Limit` | `29` | Số lời mời tối đa/ngày/tài khoản (`0` = không giới hạn) |
| `Min Interval (Seconds)` | `120` | Giãn cách tối thiểu giữa hai lời mời |
| `Max Interval (Seconds)` | `180` | Trần để tính `nextDelaySeconds` ngẫu nhiên |
| `Request ID TTL (Hours)` | `168` | Thời gian ghi nhớ Request ID |
| `Session Directory` | mặc định | Thư mục phiên riêng |

Kết quả `RATE_LIMITED` có thêm `retryAfterSeconds` để workflow biết chờ bao lâu.
Kết quả thành công có `nextDelaySeconds` (ngẫu nhiên trong khoảng Min–Max).

| Tham số | Mô tả |
| --- | --- |
| `Operation` | `Send Friend Request`, `Undo Friend Request` |
| `Sale Code` | Tài khoản gửi/thu hồi |
| `Phone Number` | Cho thao tác gửi |
| `Message` | Nội dung lời mời |
| `Request ID` | Mã chống gửi trùng |
| `User ID (UID)` | Cho thao tác thu hồi |

Kết quả:

| Trạng thái | Ý nghĩa |
| --- | --- |
| `INVITED` | Đã gửi và xác minh `is_requested = 1` |
| `ALREADY_FRIENDS` | Đã là bạn |
| `ALREADY_INVITED` | Đã mời trước đó |
| `NOT_FOUND` | Không tìm thấy theo SĐT |
| `SEND_ERROR` | Zalo trả lỗi |
| `UNKNOWN` | Gửi xong nhưng chưa xác minh được |
| `BLOCKED` | SĐT không nằm trong allowlist |
| `RATE_LIMITED` | Chạm giới hạn ngày hoặc chưa đủ giãn cách |
| `WOULD_INVITE` | Dry run: sẽ gửi nếu tắt Dry Run |
| `UNDONE` | Đã thu hồi lời mời |

---

## Ví dụ workflow

```text
Manual Trigger
  → Zalo Session (Check Session Status, Sale Code = 108279)
  → Zalo Contact (Find User by Phone, Sale Code = 108279, Phone = 0900000000)
  → Zalo Invite (Send Friend Request, Sale Code = 108279, Phone = 0900000000,
                 Message = "Xin chào...", Request ID = RUN-001)
  → Zalo Message (Sale Code = 108279, UID = {{ $json.uid }}, Text = "Cảm ơn anh/chị!")
```

Mẫu JSON: [`examples/workflow.example.json`](examples/workflow.example.json).

> Thay `Sale Code`, UID và số điện thoại bằng giá trị thật khi dùng.

---

## Bảo mật

- Không đưa cookie/IMEI/User-Agent vào workflow, Google Sheets, log hay chat.
- Phiên lưu trên máy chủ n8n; giới hạn quyền truy cập thư mục.
- Nhân viên nghỉ việc: xoá file phiên tương ứng và đăng xuất Zalo trên điện thoại.
- Chạy n8n trong mạng nội bộ, không public endpoint quản trị.
- Chỉ gửi lời mời/tin nhắn cho người đã đồng ý.

---

## Giới hạn đã biết

- API không chính thức; hành vi có thể thay đổi khi Zalo cập nhật.
- Mỗi tài khoản chỉ nên chạy một phiên tại một thời điểm.
- QR hết hạn sau khoảng 100 giây.
- Giới hạn ngày/giãn cách được lưu trong `~/.n8n/zalo-state/<ma>.json` (quyền `0600`), không phải trong database giao dịch; chạy song song nhiều workflow trên cùng tài khoản vẫn có thể vượt giới hạn.
- Node trả `nextDelaySeconds` nhưng **không tự chờ**; workflow cần dùng node Wait để giãn cách.
- `Request ID` chống trùng chỉ có hiệu lực trong thời gian tiến trình n8n còn chạy; chống trùng lâu dài cần log bên ngoài.
- Gửi tin nhắn cho người chưa phải bạn có thể bị Zalo hạn chế.
- Chưa hỗ trợ quản lý nhóm, sticker, file hoặc nhận sự kiện realtime.

---

## Phát triển cục bộ

```bash
git clone https://github.com/your-username/n8n-nodes-zalo-manager.git
cd n8n-nodes-zalo-manager
npm install
npm test
```

Thử trong n8n Docker:

```bash
npm pack
docker cp n8n-nodes-zalo-manager-0.3.2.tgz <container>:/tmp/
docker exec -u node <container> sh -c "cd /home/node/.n8n/nodes && npm install /tmp/n8n-nodes-zalo-manager-0.3.2.tgz --legacy-peer-deps --ignore-scripts"
docker restart <container>
```

---

## Đẩy lên GitHub

Trước khi push, sửa `author.name` và `repository.url` trong `package.json`, cùng `your-username` trong README.

```bash
cd n8n-nodes-zalo-manager
git init
git add .
git commit -m "feat: bộ node quản lý Zalo cá nhân cho n8n"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/n8n-nodes-zalo-manager.git
git push -u origin main
```

Kiểm tra không có file phiên, cookie, token hay dữ liệu thật trước khi push.

---

## Đăng lên npm

```bash
npm login
npm view n8n-nodes-zalo-manager     # 404 = tên còn trống
npm publish --access public
npm view n8n-nodes-zalo-manager version
```

- Mỗi lần sửa code phải tăng `version` trước khi publish lại.
- Nếu dùng scope, vẫn cần `--access public`.
- Sau khi publish, cài trong n8n qua **Settings → Community nodes**.

---

## Giấy phép và logo

Mã nguồn theo giấy phép MIT — xem [LICENSE](LICENSE).

Logo Zalo trong `icons/zalo.svg` được dùng để nhận diện tích hợp; nhãn hiệu Zalo thuộc về Zalo/VNG. Package này không liên kết với Zalo.

## Miễn trừ trách nhiệm

Package không liên kết với Zalo. Dùng API không chính thức có thể vi phạm điều khoản của Zalo và có rủi ro khoá tài khoản. Người dùng tự chịu trách nhiệm về tính hợp pháp của dữ liệu, sự đồng ý của người nhận và mọi thiệt hại phát sinh. Tác giả không chịu trách nhiệm cho bất kỳ hậu quả nào.
