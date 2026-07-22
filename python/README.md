# Python study notes

Mỗi bài Python nằm trong một thư mục con và dùng cấu trúc giống nguồn C++:

```text
python/
  01_topic-name/
    knowledge.md   # bắt buộc
    main.py        # tùy chọn
```

`knowledge.md` cần có đúng một tiêu đề cấp 1 (`#`) và ít nhất một phần cấp 2
(`##`). Ví dụ:

```markdown
# Python iterators và generators

## Iterator protocol

Ghi chú của bài học...

## Generator functions

Ghi chú tiếp theo...
```

Khi thay đổi được merge vào `main`, GitHub Actions sẽ tự đăng ký bài học với ID
ổn định dạng `python-topic-name`, đồng bộ revision vào Supabase và tạo hai câu
hỏi nháp bằng AI để đưa vào Review Queue. Câu hỏi chưa được đưa vào lịch luyện
cho đến khi được duyệt.
