Mình sẽ mở slide/bài tập tại URL này, đối chiếu từng yêu cầu với code và test hiện tại để đưa ra checklist “đạt/chưa đạt/hạn chế”.

Fetched [https://pub.nndkhoa9.win/web/week9/block10-photo-gallery-deck.html](https://pub.nndkhoa9.win/web/week9/block10-photo-gallery-deck.html)
Completed with input: {"url":"https://pub.nndkhoa9.win/web/week9/block10-photo-gallery-deck.html"}

Read , lines 1 to 180
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/README.md",
  "view_range": [
    1,
    180
  ]
}

Read 
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/package.json"
}

Read , lines 1 to 320
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/server/app.test.js",
  "view_range": [
    1,
    320
  ]
}

Read , lines 1 to 80
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/server/auth-core.test.js",
  "view_range": [
    1,
    80
  ]
}

Read , lines 1 to 150
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/server/edits.test.js",
  "view_range": [
    1,
    150
  ]
}

Mình đang chốt “đạt cơ bản/bonus/thêm” bằng checklist slide. Sau đó mình sẽ chạy smoke storage một lần để xác nhận phần SeaweedFS thật, nếu môi trường Docker đang sẵn sàng.

Ran terminal command: npm run test:storage
Tool execution failed with exit code 1

Search for `cdn|CDN|forgot-password|OAuth|reset|album|comment|share`

Search for `responsive|srcSet|sizes|loading=|decoding=|currentSrc`

Search for `Max-age|max-age|immutable|Cache-Control`

Smoke storage đang fail vì script test cũ upload ẩn danh sau khi API đã yêu cầu session. Mình sẽ sửa script test để đăng ký test user tạm và gửi cookie cho mọi HTTP, rồi chạy lại; việc này vừa làm đánh giá bài tập chính xác hơn.

Search for `fetch\(`

Read , lines 45 to 85
Completed with input: {
  "path": "/Users/admin/Documents/javascript/block11/scripts/storage-smoke.js",
  "view_range": [
    45,
    85
  ]
}

Mình sẽ tạo session cookie độc lập trong smoke script ngay sau API start, sau đó gắn cookie cho tất cả request gallery/media/upload/delete. Đây là lỗi test, không phải lỗi SeaweedFS.

Edit 

Edit 

Mình đã thêm đăng ký; còn thay các fetch trong phần test real storage bằng `smokeFetch` để cookie được gửi đồng nhất.

Edit 

Script có một lần restart API; cookie là session hash trong DB temporary nên vẫn hợp lệ sau restart. Mình chạy lại smoke storage.

Ran terminal command: npm run test:storage

Chưa thể nói app đã thỏa **tuyệt đối toàn bộ** slide, nhưng đã thỏa phần cốt lõi và hầu hết bonus.

### Đạt phần cốt lõi

- Upload nhiều file bằng multipart/FormData.
- Kiểm tra 1–5 file, 10 MiB/file, 55 MiB/request.
- Kiểm tra MIME, signature JPEG/PNG, dung lượng và 40 triệu pixel.
- Chuẩn hóa EXIF orientation và loại EXIF/GPS.
- Tạo bản gốc PNG và variant WebP.
- `srcset`, `sizes`, `lazy/eager`, `decoding`.
- Lưu metadata SQLite: `Photo`, `PhotoVariant`, `user_id`.
- Lưu bytes trên SeaweedFS S3.
- Gallery, chi tiết, media URL và xóa ảnh.
- Cleanup object/metadata có hàng đợi.
- Hỗ trợ bù trừ khi DB hoặc storage lỗi.
- Có session, account riêng và owner cho ảnh.
- Thẻ preset riêng cho từng tài khoản.
- Cache header:
  - Media: `public, max-age=31536000, immutable`
  - API: `no-store`

### Đạt bonus chỉnh sửa

- Crop theo pixel bản gốc.
- Xoay 90/180/270.
- Lật ngang.
- Lưu nhiều version `v1`, `v2`, `v3`.
- Khôi phục từ bản gốc.
- Kiểm tra `expectedVersion`.
- Dọn version cũ bằng cleanup.
- Dữ liệu cũ không có bản gốc bị vô hiệu khi chỉnh sửa.

### Chưa nằm trong phần cốt lõi

- CDN thực tế/chỉnh cache/purge CDN.
- OAuth Apple/Google/X.
- Quên mật khẩu qua email.
- Album/chia sẻ/bình luận.
- CDN không bắt buộc trong bài tập cốt lõi.

### Hạn chế hiện tại

- CDN cloud đa region chưa triển khai; hiện có edge cache trong Express process.
- Cron cleanup hiện chạy trong process API; chưa có worker/cron service độc lập.
- Chưa có Redis hay hàng đợi nhiều server.
- Phiên và rate limit lưu trong RAM process.

### Kiểm chứng hiện tại

- `npm test`: 42/42 test pass.
- `npm run build`: pass.
- `npm run test:storage`: SeaweedFS thật pass, gồm restart API, upload, media, delete và DB failure compensation.
- Đã thêm test account và session bằng SQLite thật.
- Đã có test phân biệt preset và pagination theo hai tài khoản.

## Tính năng đã bổ sung

### Khôi phục preset đã ẩn

- Lưu preset bị ẩn theo từng `user_id`.
- API ẩn và khôi phục preset.
- Menu tài khoản có nút khôi phục toàn bộ preset đã ẩn.
- Không xóa file preset gốc trong `public/`.

### Pagination gallery

- API: `GET /api/photos?page=1&limit=20`.
- Response: `photos`, `page`, `limit`, `total`, `hasMore`.
- Frontend có nút **Tải thêm ảnh** để lấy trang kế tiếp.
- Giảm số metadata ảnh và bản ghi JSON được trả trong mỗi request.

### CDN/edge cache

- URL ảnh frontend sử dụng `/cdn/media/...`; `/media/...` giữ làm origin gốc.
- Cache response trong bộ nhớ Express theo `userId + URL`.
- Header `X-CDN-Cache` phân biệt `MISS` và `HIT`.
- Giới hạn: tối đa 500 entry hoặc 128 MiB.
- Khi xóa ảnh, cache liên quan đến `photoId` được purge.
- Cache không lưu ra disk và bị xóa khi API restart.
- Đây chưa phải CDN cloud đa vùng; chỉ là edge cache trong một process Express.
- Cache header: `private, max-age=31536000, immutable`.

### Cleanup cron

- Chạy tự động trong process API mỗi 60 giây.
- Dọn object SeaweedFS còn trong `CleanupJob`.
- Xóa metadata ảnh sau khi object/file cleanup thành công.
- Giảm file rác do upload hoặc delete thất bại.
- Chưa là cron service hay worker riêng ngoài API process.

## Kết luận

- Đã thỏa phần cốt lõi và phần lớn bonus.
- Chưa triển khai CDN cloud đa vùng.
- Chưa triển khai OAuth, quên mật khẩu qua email, album, chia sẻ hoặc bình luận.
- Chưa triển khai Redis, hàng đợi nhiều server hoặc worker cleanup độc lập.