export interface SourceQuestion {
  id: string
  text: string
  options: string[]
  /** Index into `options`. */
  correct: number
  /** Keep option order fixed, e.g. when the last option is "Tất cả các ý trên". */
  keepOrder?: boolean
}

// Sample set for previewing the UI. BTC's real questions replace this file.
export const SAMPLE_QUESTIONS: SourceQuestion[] = [
  { id: 'q01', text: 'Thông điệp của lễ kỷ niệm 23 năm VNGroup là gì?', options: ['Dấu ấn khát vọng', 'Vững bước tương lai', 'Kết nối thành công', 'Bứt phá giới hạn'], correct: 0 },
  { id: 'q02', text: 'Năm 2026, VNGroup kỷ niệm bao nhiêu năm thành lập?', options: ['20 năm', '23 năm', '25 năm', '30 năm'], correct: 1 },
  { id: 'q03', text: 'Trong logo VNGroup, biểu tượng hình học bên cạnh chữ là hình gì?', options: ['Hình tròn', 'Hình tam giác', 'Hình thoi', 'Hình lục giác'], correct: 2 },
  { id: 'q04', text: 'Hai màu chủ đạo của bộ nhận diện kỷ niệm 23 năm là?', options: ['Xanh và trắng', 'Đỏ và vàng', 'Tím và vàng kim', 'Đen và bạc'], correct: 2 },
  { id: 'q05', text: 'Đỉnh núi cao nhất Việt Nam là?', options: ['Fansipan', 'Bà Đen', 'Ngọc Linh', 'Pu Si Lung'], correct: 0 },
  { id: 'q06', text: 'Vịnh Hạ Long thuộc tỉnh nào?', options: ['Hải Phòng', 'Quảng Ninh', 'Ninh Bình', 'Thanh Hóa'], correct: 1 },
  { id: 'q07', text: 'Tác giả của “Truyện Kiều” là ai?', options: ['Nguyễn Trãi', 'Hồ Xuân Hương', 'Nguyễn Du', 'Nguyễn Đình Chiểu'], correct: 2 },
  { id: 'q08', text: 'Ngày Quốc khánh của Việt Nam là ngày nào?', options: ['30/4', '1/5', '19/8', '2/9'], correct: 3 },
  { id: 'q09', text: 'Một ngày có bao nhiêu phút?', options: ['1.240 phút', '1.440 phút', '1.640 phút', '2.400 phút'], correct: 1 },
  { id: 'q10', text: 'Hành tinh lớn nhất trong Hệ Mặt Trời là?', options: ['Sao Thổ', 'Sao Mộc', 'Trái Đất', 'Sao Hải Vương'], correct: 1 },
  { id: 'q11', text: 'Kim cương được tạo thành từ nguyên tố nào?', options: ['Silic', 'Cacbon', 'Sắt', 'Nhôm'], correct: 1 },
  { id: 'q12', text: 'Đơn vị đo cường độ dòng điện là?', options: ['Vôn', 'Oát', 'Ampe', 'Ôm'], correct: 2 },
  { id: 'q13', text: 'Đơn vị tiền tệ của Nhật Bản là?', options: ['Won', 'Nhân dân tệ', 'Yên', 'Baht'], correct: 2 },
  { id: 'q14', text: 'Quốc gia nào đăng cai FIFA World Cup 2022?', options: ['Qatar', 'Nga', 'Brazil', 'Mỹ'], correct: 0 },
  { id: 'q15', text: '“HTML” là viết tắt của cụm từ nào?', options: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink Text Mode Language'], correct: 0 },
  { id: 'q16', text: 'Ngôn ngữ lập trình nào mang tên một loài trăn?', options: ['Java', 'Python', 'Ruby', 'Go'], correct: 1 },
  { id: 'q17', text: 'Số Pi (π) xấp xỉ bằng bao nhiêu?', options: ['2,71', '3,14', '1,61', '1,41'], correct: 1 },
  { id: 'q18', text: 'Thành phố nào được mệnh danh là “thành phố ngàn hoa”?', options: ['Đà Lạt', 'Huế', 'Sa Pa', 'Hội An'], correct: 0 },
  { id: 'q19', text: 'Trong bóng đá, mỗi đội có bao nhiêu cầu thủ trên sân?', options: ['9', '10', '11', '12'], correct: 2 },
  {
    id: 'q20',
    text: 'Điều nào sau đây đúng về minigame “Thử thách 23 năm”?',
    options: ['Có 10 phút để làm bài', 'Cần đúng từ 80% để được xét Top 5', 'Thứ tự câu hỏi của mỗi người khác nhau', 'Tất cả các ý trên'],
    correct: 3,
    keepOrder: true,
  },
]
