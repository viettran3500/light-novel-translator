# 📖 Light Novel Translator — Web Version

Công cụ đọc và dịch **Light Novel Nhật Bản sang tiếng Việt** chạy hoàn toàn trên trình duyệt, sử dụng **Gemini AI**.

🔗 **Demo trực tiếp:** `https://<your-username>.github.io/<repo-name>/`

---

## ✨ Tính Năng

- 🌐 **Tải nội dung** từ bất kỳ URL nào (syosetu, kakuyomu, ...)
- 🤖 **Dịch tự động** bằng Gemini AI (2.0 Flash, 2.5 Flash, 1.5 Pro...)
- 📱 **Responsive** — hoạt động trên điện thoại, máy tính bảng, desktop
- 🔖 **Bookmark** trang yêu thích
- ⚡ **Quick Links** truy cập nhanh các trang phổ biến
- 🔄 **Tự động dịch** khi tải trang
- 📋 **Copy** nội dung gốc & bản dịch
- 💾 **Lưu cài đặt** tự động vào trình duyệt (localStorage)
- ⌨️ **Phím tắt**: `Ctrl+Enter` = Dịch, `Esc` = Đóng/Hủy

---

## 🚀 Cài Đặt & Sử Dụng

### Bước 1: Lấy Gemini API Key
1. Truy cập [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Tạo API Key miễn phí
3. Copy key

### Bước 2: Nhập API Key
1. Mở app, click **menu ☰** góc trái
2. Dán API Key vào ô và nhấn **Lưu**

### Bước 3: Dịch truyện
1. Nhập URL trang truyện vào thanh địa chỉ (ví dụ: `https://ncode.syosetu.com/n5375cy/1/`)
2. Nhấn nút **Tải nội dung** (↓)
3. Nhấn nút **Dịch** hoặc `Ctrl+Enter`
4. Đọc bản dịch ở panel phải

---

## 📁 Cấu Trúc File

```
web-translator/
├── index.html    # Giao diện chính
├── style.css     # Styles (dark theme)
├── app.js        # Logic (fetch, dịch, bookmarks...)
└── README.md     # Tài liệu này
```

---

## ⚙️ Deploy Lên GitHub Pages

1. Push code lên GitHub
2. Vào **Settings** → **Pages**
3. Source: `main` branch, folder `/web-translator` (hoặc root)
4. Nhấn **Save** → Chờ ~1 phút

---

## 🔒 Bảo Mật

- API Key lưu trong **localStorage** của trình duyệt, **không gửi** lên bất kỳ server nào
- Mọi request gọi thẳng đến **Google Gemini API**
- CORS Proxy chỉ dùng để đọc trang web (không xử lý API Key)

---

## 🐛 Lưu Ý

- Một số trang web chặn CORS proxy → dán nội dung trực tiếp vào panel trái
- Giới hạn dịch: **30.000 ký tự** / lần (giới hạn token)
- Nếu gặp lỗi `SAFETY`, thử chọn model khác

---

## 📄 License

MIT License
