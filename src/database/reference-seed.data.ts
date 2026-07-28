import { toSlug } from '../common/utils/slug.util';

export interface ReferenceSeedRecord {
  name: string;
  slug: string;
}

const provinceNames = [
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cần Thơ',
  'Cao Bằng',
  'Đà Nẵng',
  'Đắk Lắk',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Phòng',
  'Huế',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Hồ Chí Minh',
  'Tuyên Quang',
  'Vĩnh Long',
] as const;

const categoryNames = [
  'Biển & đảo',
  'Núi & cao nguyên',
  'Thiên nhiên',
  'Di tích lịch sử',
  'Văn hóa',
  'Tâm linh',
  'Ẩm thực',
  'Sinh thái',
  'Nghỉ dưỡng',
  'Phiêu lưu',
  'Vui chơi & giải trí',
  'Làng nghề',
] as const;

export const PROVINCE_SEEDS: readonly ReferenceSeedRecord[] = provinceNames.map(
  (name) => ({
    name,
    slug: toSlug(name, 'province'),
  }),
);

export const CATEGORY_SEEDS: readonly ReferenceSeedRecord[] = categoryNames.map(
  (name) => ({
    name,
    slug: toSlug(name, 'category'),
  }),
);
