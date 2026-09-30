# 🎓 Meet Random Picker — Chrome Extension cho Google Meet

Tiện ích mở rộng Google Chrome (Manifest V3) chuyên dụng dành cho Giáo viên / Giảng viên để **gọi ngẫu nhiên học sinh trong Google Meet không bao giờ bị trùng lặp**, tự động nhận diện danh sách học sinh theo thời gian thực và hoạt động hoàn toàn offline, bảo mật tuyệt đối.

---

## ✨ TÍNH NĂNG NỔI BẬT

1. **🎲 Không bao giờ gọi trùng trong cùng một vòng (No Duplicates)**:
   - Quản lý tách biệt giữa tập `availableStudents` (chưa gọi) và `selectedStudents` (đã gọi).
   - Khi đã gọi hết cả lớp, hiển thị thông báo rõ ràng và chỉ reset khi giáo viên chủ động bấm `RESET`.
2. **👥 Tự động nhận diện học sinh qua Google Meet DOM (Multi-Tier Resilient)**:
   - **Tầng 1**: Khung bên "Mọi người" (People Side Panel).
   - **Tầng 2**: Ô camera người tham gia (Video Grid Tiles).
   - **Tầng 3**: Accessible ARIA listitem.
   - Sử dụng `MutationObserver` kết hợp debounce 300ms, CPU khi chờ (idle) gần như bằng **0%**.
3. **🛡️ Loại bỏ văn bản rác & Stopwords của Google Meet**:
   - Tự động bỏ qua các nút điều khiển, phụ đề, "(Bạn)", "(Trình bày)", "(Host)", nút bật/tắt micro.
4. **👨‍🏫 Tự động loại trừ Giáo viên / Host**:
   - Không đưa tài khoản giáo viên vào danh sách quay số.
   - Hỗ trợ loại trừ thủ công (Manual exclude) bất kỳ học sinh nào xin phép vắng hoặc đã phát biểu.
5. **🎯 2 Giao diện linh hoạt**:
   - **Popup Extension** (Góc phải trình duyệt Chrome).
   - **Widget nổi trực tiếp trong Google Meet** (Draggable, có thể kéo thả, thu nhỏ, bấm nhanh không cần mở popup).
6. **🔔 Âm thanh & Hiệu ứng ăn mừng nhẹ nhàng**:
   - Chuông chúc mừng được tổng hợp trực tiếp bằng Web Audio API (không load file ngoài, 0 latency, không giật lag).
7. **🔒 Bảo mật & Riêng tư (Local-First)**:
   - 100% dữ liệu được xử lý tại trình duyệt của bạn, không gửi bất kỳ tên học sinh nào ra máy chủ bên ngoài.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT VÀO GOOGLE CHROME (CHỈ MẤT 30 GIÂY)

1. Tải về thư mục extension hoặc file `.zip` (bấm nút **"Tải Extension (.ZIP)"** trên giao diện ứng dụng).
2. Nếu tải file `.zip`, hãy giải nén ra một thư mục (ví dụ: `meet-random-picker`).
3. Mở trình duyệt Google Chrome, truy cập vào đường dẫn:
   ```
   chrome://extensions
   ```
4. Ở góc trên cùng bên phải, bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)**.
5. Nhấn vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trái.
6. Chọn thư mục `extension` (thư mục chứa file `manifest.json`).
7. Tiện ích **Meet Random Picker** sẽ xuất hiện trên thanh công cụ của Chrome! Hãy ghim (Pin) biểu tượng 🎓 lên để tiện sử dụng.

---

## 📖 CÁCH SỬ DỤNG KHI DẠY HỌC GOOGLE MEET

1. Tham gia phòng học Google Meet bất kỳ (`https://meet.google.com/xxx-xxxx-xxx`).
2. Mở bảng **"Mọi người" (People / Participants)** ở góc dưới bên phải Google Meet để extension quét được đầy đủ 100% danh sách học sinh.
3. Khi cần gọi học sinh:
   - Bấm vào widget nổi 🎲 trực tiếp trên màn hình Meet, HOẶC
   - Nhấn vào biểu tượng extension 🎓 trên thanh công cụ, HOẶC
   - Sử dụng phím tắt nhanh: `Alt + Shift + R` (trên Mac: `Option + Shift + R`).
4. Khi đã gọi hết toàn bộ học sinh trong lớp, bấm **"RESET VÒNG"** để bắt đầu một vòng gọi mới.

---

## ⌨️ PHÍM TẮT MẶC ĐỊNH
- **`Alt + Shift + R`** (`Option + Shift + R`): Gọi ngẫu nhiên 1 học sinh tiếp theo.
- **`Alt + Shift + W`** (`Option + Shift + W`): Ẩn/Hiện widget nổi trong Meet.
