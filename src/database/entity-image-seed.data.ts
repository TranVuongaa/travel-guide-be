export enum EntityImageOwnerType {
  PROVINCE = 'province',
  CATEGORY = 'category',
  PLACE = 'place',
}

export interface EntityImageSeedRecord {
  ownerType: EntityImageOwnerType;
  ownerSlug: string;
  fileTitle: `File:${string}`;
  altText: string;
  sortOrder: number;
}

function cover(
  ownerType: EntityImageOwnerType,
  ownerSlug: string,
  fileTitle: `File:${string}`,
  altText: string,
): EntityImageSeedRecord {
  return { ownerType, ownerSlug, fileTitle, altText, sortOrder: 0 };
}

export const ENTITY_IMAGE_SEEDS: readonly EntityImageSeedRecord[] = [
  cover(
    EntityImageOwnerType.PROVINCE,
    'an-giang',
    'File:Miếu Bà Chúa Xứ Núi Sam.jpg',
    'Miếu Bà Chúa Xứ at Núi Sam in An Giang',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'bac-ninh',
    'File:Trung tâm văn hóa Kinh Bắc.jpg',
    'Kinh Bắc Cultural Center in Bắc Ninh',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'ca-mau',
    'File:Bạc Liêu windpower farm.jpg',
    'Coastal wind farm landscape in Cà Mau',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'can-tho',
    'File:Can-tho-tuonglamphotos.jpg',
    'Riverfront cityscape in Cần Thơ',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'cao-bang',
    'File:Ban Gioc - Detian Falls2.jpg',
    'Bản Giốc waterfalls in Cao Bằng',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'da-nang',
    'File:Dragon Bridge, Da Nang during day - 20230819 (cropped).jpg',
    'Dragon Bridge over the Hàn River in Đà Nẵng',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'dak-lak',
    'File:Muidienvaobinhminh.jpg',
    'Sunrise on the coast of Đắk Lắk',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'dien-bien',
    'File:Mường Lay skyline.jpg',
    'Mountain skyline of Mường Lay in Điện Biên',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'dong-nai',
    'File:Nhà thờ chính Văn miếu Trấn Biên.jpg',
    'Trấn Biên Temple of Literature in Đồng Nai',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'dong-thap',
    'File:Cầu Cao Lãnh.jpg',
    'Cao Lãnh Bridge over the Tiền River in Đồng Tháp',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'gia-lai',
    "File:Ho T'Nung (2).jpg",
    'T’Nưng Lake in Gia Lai',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'ha-noi',
    'File:Hanoi skyline with Ba Vi Mountain.jpg',
    'Hà Nội skyline with Ba Vì Mountain',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'ha-tinh',
    'File:Thiencambeach.jpg',
    'Thiên Cầm Beach in Hà Tĩnh',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'hai-phong',
    'File:Sông Cấm Hải Phòng Về Đêm năm 2025.jpg',
    'Cấm River waterfront in Hải Phòng at night',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'hue',
    'File:Đại nội.jpg',
    'Imperial City in Huế',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'hung-yen',
    'File:Văn miếu Xích Đằng 01.JPG',
    'Xích Đằng Temple of Literature in Hưng Yên',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'khanh-hoa',
    'File:PonNagarChamTowers.jpg',
    'Po Nagar Cham towers in Khánh Hòa',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'lai-chau',
    'File:Sunset on O Quy Ho pass.jpg',
    'Sunset over Ô Quy Hồ Pass in Lai Châu',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'lam-dong',
    'File:Da Lat, view to Xuan Huong lake 2.jpg',
    'Đà Lạt and Xuân Hương Lake in Lâm Đồng',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'lang-son',
    'File:Mẫu Sơn.jpg',
    'Mountain landscape at Mẫu Sơn in Lạng Sơn',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'lao-cai',
    'File:Cáp-treo-fan-12.jpg',
    'Fansipan cable car above the mountains of Lào Cai',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'nghe-an',
    'File:Bãi biển Cửa Lò..jpg',
    'Cửa Lò Beach in Nghệ An',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'ninh-binh',
    'File:Tam Coc by Tuan Mai "007" (8888350545).jpg',
    'Limestone karsts and river at Tam Cốc in Ninh Bình',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'phu-tho',
    'File:Đền Hùng.JPG',
    'Hùng Kings Temple in Phú Thọ',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'quang-ngai',
    'File:Ly Son Islands (14817868968).jpg',
    'Lý Sơn Islands in Quảng Ngãi',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'quang-ninh',
    'File:Ha Long Bay in 2019.jpg',
    'Limestone islands in Hạ Long Bay, Quảng Ninh',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'quang-tri',
    'File:Thành cổ Quảng Trị Foto.jpg',
    'Quảng Trị Citadel',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'son-la',
    'File:Sơn La Province.JPG',
    'Mountain valley landscape in Sơn La',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'tay-ninh',
    'File:Dau Tieng Lake - 50766650163.png',
    'Dầu Tiếng Lake in Tây Ninh',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'thai-nguyen',
    'File:Ba Be Lake 5.jpg',
    'Ba Bể Lake in Thái Nguyên',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'thanh-hoa',
    'File:Hòn Trống mái..jpg',
    'Hòn Trống Mái rocks in Thanh Hóa',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'ho-chi-minh',
    'File:Ho Chi Minh City, City Hall, 2020-01 CN-03.jpg',
    'City Hall in Hồ Chí Minh City',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'tuyen-quang',
    'File:Sông Nho Quế 2022 - NKS.jpg',
    'Nho Quế River canyon in Tuyên Quang',
  ),
  cover(
    EntityImageOwnerType.PROVINCE,
    'vinh-long',
    'File:Trung tâm Hành chính tỉnh Vĩnh Long.jpg',
    'Vĩnh Long provincial administrative center',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'bien-dao',
    'File:Beautiful beach on Phu Quoc island Vietnam (39543775721).jpg',
    'Tropical beach on Phú Quốc Island',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'nui-cao-nguyen',
    'File:Landscape in Sa Pa (Vietnam).jpg',
    'Mountain and highland landscape in Sa Pa',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'thien-nhien',
    'File:Bangioc9tam.jpg',
    'Bản Giốc waterfall surrounded by nature',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'di-tich-lich-su',
    'File:Thành cổ Quảng Trị 2.jpg',
    'Historic Quảng Trị Citadel',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'van-hoa',
    'File:Thang Long Water Puppet Theatre2.JPG',
    'Traditional Vietnamese water puppetry',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'tam-linh',
    'File:ThienMuPagoda.jpg',
    'Thiên Mụ Pagoda in Huế',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'am-thuc',
    'File:Pho Ha Noi.jpg',
    'A bowl of Hà Nội phở',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'sinh-thai',
    'File:Mekong Floating Market.jpg',
    'Floating market in the Mekong Delta',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'nghi-duong',
    'File:Nha Trang Beach 5.jpg',
    'Beach resort coast at Nha Trang',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'phieu-luu',
    'File:Son Doong Cave 5.jpg',
    'Expedition landscape inside Sơn Đoòng Cave',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'vui-choi-giai-tri',
    'File:Golden Bridge at Ba Na Hills 20250718.jpg',
    'Golden Bridge attraction at Bà Nà Hills',
  ),
  cover(
    EntityImageOwnerType.CATEGORY,
    'lang-nghe',
    'File:Bat Trang porcelain marketplace in 2014.jpg',
    'Traditional Bát Tràng pottery marketplace',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'vinh-ha-long',
    'File:Ha Long Bay in 2019.jpg',
    'Limestone islands in Hạ Long Bay',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'pho-co-hoi-an',
    'File:Hội An, Ancient Town, 2020-01 CN-06.jpg',
    'Lantern-lit street in Hội An Ancient Town',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'phong-nha-ke-bang',
    'File:Phongnhakebang6.jpg',
    'Karst landscape in Phong Nha–Kẻ Bàng National Park',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'da-lat',
    'File:Xuan Huong Lake 11.jpg',
    'Xuân Hương Lake in Đà Lạt',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'phu-quoc',
    'File:Bai-sao-phu-quoc-tuonglamphotos.jpg',
    'Sao Beach on Phú Quốc Island',
  ),
  cover(
    EntityImageOwnerType.PLACE,
    'dai-noi-hue',
    'File:Đại nội.jpg',
    'Imperial City of Huế',
  ),
];
