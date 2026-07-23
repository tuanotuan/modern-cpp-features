# Python ngày 1: phép toán, giá trị và kiểu dữ liệu

## Chạy chương trình Python đầu tiên

Python thực thi chương trình từ trên xuống dưới. Hàm `print()` đưa một giá trị
ra màn hình:

```python
print("Hello, Python!")
print(3 + 4)
```

Chuỗi có thể được viết bằng dấu nháy đơn hoặc nháy kép:

```python
print('Tuan')
print("Viet Nam")
```

Hai cách trên tạo ra cùng kiểu dữ liệu `str`. Nên chọn một kiểu dấu nháy nhất
quán trong cùng một project.

## Các toán tử số học cơ bản

Python hỗ trợ các phép toán thông dụng:

```python
print(3 + 4)   # cộng: 7
print(3 - 4)   # trừ: -1
print(3 * 4)   # nhân: 12
print(3 / 4)   # chia thực: 0.75
print(3 // 4)  # chia lấy phần nguyên: 0
print(3 % 4)   # chia lấy dư: 3
print(3 ** 4)  # lũy thừa: 81
```

Điểm cần nhớ:

- `/` luôn trả về số thực `float`, kể cả khi phép chia không có phần dư.
- `//` là phép chia lấy sàn, không đơn giản chỉ là bỏ phần thập phân. Ví dụ,
  `-3 // 2` cho kết quả `-2`.
- `%` trả về phần dư và thường được dùng để kiểm tra số chẵn/lẻ hoặc xử lý chu
  kỳ.
- `**` là toán tử lũy thừa.

Thứ tự ưu tiên toán tử tương tự toán học: lũy thừa trước, sau đó nhân/chia, rồi
cộng/trừ. Dùng ngoặc tròn khi muốn biểu thức rõ ràng hơn:

```python
result = (3 + 4) * 2
```

## Giá trị và kiểu dữ liệu

Python là ngôn ngữ có kiểu động: biến không bị cố định vào một kiểu, nhưng mọi
giá trị tại runtime đều có kiểu cụ thể. Hàm `type()` cho biết kiểu của giá trị:

```python
print(type(10))       # int
print(type(9.8))      # float
print(type(4 - 4j))   # complex
print(type("Tuan"))   # str
print(type(True))     # bool
```

Các kiểu scalar xuất hiện trong bài:

- `int`: số nguyên có độ chính xác tùy ý, ví dụ `10`.
- `float`: số thực dấu phẩy động, ví dụ `3.14`.
- `complex`: số phức, dùng hậu tố `j`, ví dụ `4 - 4j`.
- `str`: chuỗi ký tự Unicode.
- `bool`: giá trị logic `True` hoặc `False`.

`True` và `False` phải viết hoa chữ cái đầu. Trong Python, `bool` là một kiểu
con của `int`, nhưng nên dùng nó để biểu diễn điều kiện thay vì coi như số.

## Các kiểu collection đầu tiên

Python có nhiều kiểu dùng để chứa nhiều giá trị:

```python
names = ["Asabeneh", "Python", "Finland"]  # list
point = (2, 3)                             # tuple
unique_ids = {1, 2, 3}                    # set
prices = {"a": 1, "b": 2, "c": 3}         # dict
```

Khác biệt chính:

- `list` có thứ tự, thay đổi được và cho phép phần tử trùng nhau.
- `tuple` có thứ tự nhưng không thay đổi được sau khi tạo.
- `set` lưu các phần tử duy nhất và không truy cập bằng chỉ số.
- `dict` lưu ánh xạ `key: value`; mỗi khóa phải là duy nhất.

Dấu ngoặc nhọn rỗng `{}` tạo một `dict`, không phải `set`. Muốn tạo set rỗng,
phải gọi `set()`.

## Biến và truy cập phần tử

Biến được tạo bằng phép gán:

```python
point_a = (2, 3)
point_b = (10, 8)
```

Tuple và list sử dụng chỉ số bắt đầu từ `0`:

```python
x1 = point_a[0]  # 2
y1 = point_a[1]  # 3
```

Tên biến nên mô tả đúng ý nghĩa dữ liệu và thường dùng `snake_case`, ví dụ
`point_a`, `total_price` hoặc `user_name`.

## Tính khoảng cách Euclid

Khoảng cách giữa hai điểm `(x1, y1)` và `(x2, y2)` được tính theo công thức:

```text
sqrt((x2 - x1)² + (y2 - y1)²)
```

Trong Python:

```python
import math

point_a = (2, 3)
point_b = (10, 8)

distance = math.sqrt(
    (point_b[0] - point_a[0]) ** 2
    + (point_b[1] - point_a[1]) ** 2
)

print(distance)
```

`import math` nạp module toán học chuẩn. `math.sqrt()` tính căn bậc hai, còn
`** 2` bình phương một giá trị.

Python cũng cung cấp cách viết ngắn hơn:

```python
distance = math.hypot(
    point_b[0] - point_a[0],
    point_b[1] - point_a[1],
)
```

## Những điều cần nhớ sau ngày 1

Sau bài này, cần tự trả lời được:

1. `/` khác `//` như thế nào?
2. `%` và `**` dùng để làm gì?
3. `type()` trả về thông tin gì?
4. `list`, `tuple`, `set` và `dict` khác nhau ở điểm nào?
5. Vì sao `{}` không tạo ra một set rỗng?
6. Chỉ số đầu tiên của list hoặc tuple là bao nhiêu?
7. Làm thế nào để tính khoảng cách giữa hai điểm bằng module `math`?
