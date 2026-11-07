# Boo AI Agent · Trang chia sẻ skill Claude

Web tĩnh chạy trên GitHub Pages, dùng Supabase để quản lý tài khoản và giữ file skill.

- Người dùng phải **đăng nhập** mới nhận được skill. Chưa đăng nhập mà bấm "Nhận skill" thì web tự chuyển sang trang đăng nhập, đăng nhập xong quay lại đúng skill đó.
- Lần đầu nhận mỗi skill phải nhập **mật khẩu nhận skill**. Mật khẩu này được kiểm tra trên máy chủ Supabase, không nằm trong code web.
- File skill nằm trong kho **riêng tư** trên Supabase. Người dùng chỉ nhận được link tải tạm thời (5 phút) sau khi nhập đúng mật khẩu.
- Nhập sai quá 8 lần trong 15 phút sẽ bị chặn tạm thời.

## Cấu trúc

```
index.html            Danh sách skill (Tất cả / Đã nhận)
skill.html            Trang chi tiết + hướng dẫn cài
login.html            Đăng nhập + quên mật khẩu
signup.html           Tạo tài khoản
reset.html            Đặt mật khẩu mới (mở từ email)
assets/config.js      URL + khóa công khai Supabase   <-- cần điền
assets/skills.js      Danh sách skill hiển thị trên web
assets/covers/        Ảnh bìa skill
supabase/setup.sql    Tạo bảng + kho file (chạy 1 lần)
supabase/functions/claim-skill/index.ts   Hàm kiểm tra mật khẩu và cấp link tải
```

## Cài đặt Supabase (một lần)

1. **Chạy SQL:** SQL Editor → New query → dán nội dung `supabase/setup.sql` → Run.
2. **Upload file skill:** Storage → bucket `skills` → Upload file `kich-ban-squire.zip`, `lam-video-squire.zip`.
   Tên file phải trùng `id` trong `assets/skills.js`.
3. **Tạo Edge Function:** Edge Functions → Deploy a new function → Via Editor.
   Đặt tên `claim-skill`, dán nội dung `supabase/functions/claim-skill/index.ts`, rồi Deploy.
   Trong phần cài đặt của function, **tắt "Verify JWT"** (function đã tự kiểm tra đăng nhập).
4. **Đặt mật khẩu nhận skill:** Edge Functions → Secrets → Add new secret:
   tên `SKILL_PASSWORD`, giá trị là mật khẩu bạn muốn. Đổi mật khẩu sau này chỉ cần sửa secret này.
5. **Cấu hình đăng nhập:** Authentication → URL Configuration
   - Site URL: `https://dinhtanphuc.github.io/boo-ai-agent/`
   - Redirect URLs: thêm `https://dinhtanphuc.github.io/boo-ai-agent/**`
6. **Xác nhận email (nên đọc):** email mặc định của Supabase chỉ gửi được vài email mỗi giờ.
   Nếu để bật "Confirm email", nhiều người đăng ký cùng lúc sẽ không nhận được email kích hoạt.
   Cách đơn giản: Authentication → Sign In / Providers → Email → tắt **Confirm email**.
   Cách chuẩn hơn: giữ bật và cấu hình SMTP riêng (Authentication → Emails → SMTP Settings).
7. **Lấy khóa công khai:** Project Settings → API Keys, chép **Project URL** và khóa **anon** (hoặc **publishable**)
   vào `assets/config.js`. Không bao giờ dán khóa `service_role` / `secret` vào web.

## Đưa web lên GitHub Pages

1. Upload toàn bộ nội dung thư mục này vào repo `dinhtanphuc/boo-ai-agent` (nhánh `main`, ở thư mục gốc).
2. Repo → Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → Save.
3. Sau 1–2 phút, web chạy tại `https://dinhtanphuc.github.io/boo-ai-agent/`.

## Thêm skill mới

1. Nén thư mục skill thành `<ten-skill>.zip` (bên trong là thư mục `<ten-skill>/SKILL.md`), upload vào bucket `skills`.
2. Thêm một khối vào `assets/skills.js` với `id` trùng tên file, thêm ảnh bìa vào `assets/covers/`.
3. Commit lên GitHub. Không cần sửa Edge Function.

## Xem ai đã nhận skill

SQL Editor:

```sql
select c.skill, u.email, c.created_at
from public.claims c join auth.users u on u.id = c.user_id
order by c.created_at desc;
```
