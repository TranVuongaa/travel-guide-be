-- Development-only full database seed for the current Prisma schema.
--
-- WARNING: The credentials and identities below are public development fixtures.
-- Never run this script against a production database.
--
-- Administrator login:
--   Email:    admin@example.com
--   Password: Admin@123456
--
-- Apply all Prisma migrations before running this file.
--
-- Bash:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f prisma/seed-all.sql
--
-- PowerShell:
--   psql $env:DATABASE_URL -X -v ON_ERROR_STOP=1 -f prisma/seed-all.sql
--
-- Prisma CLI (uses DATABASE_URL from the project environment):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/seed-all.sql

SET client_encoding = 'UTF8';

BEGIN;

-- Users
--
-- The administrator hash is Argon2id for the documented development password.
-- Other sample users intentionally have no local password. One has a synthetic
-- OAuth identity below so oauth_accounts also receives a relational fixture.
INSERT INTO "users" (
    "id",
    "email",
    "passwordHash",
    "displayName",
    "avatarUrl",
    "role",
    "isActive",
    "createdAt",
    "updatedAt"
)
VALUES
    (
        '00000000-0000-4000-8000-000000000001',
        'admin@example.com',
        '$argon2id$v=19$m=19456,p=1,t=2$JbF1Kkl/KfsaKt4kxYJSmQ$dNPH8qE6YQai5ufQUU88wThm1eyrmvfQyeV2YsGCeXo',
        'Travel Guide Admin',
        NULL,
        'ADMIN'::"Role",
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '00000000-0000-4000-8000-000000000002',
        'editor@example.com',
        NULL,
        'Minh Anh',
        'https://images.example.com/avatars/editor.jpg',
        'EDITOR'::"Role",
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '00000000-0000-4000-8000-000000000003',
        'traveler@example.com',
        NULL,
        'Lan Phương',
        'https://images.example.com/avatars/traveler.jpg',
        'USER'::"Role",
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '00000000-0000-4000-8000-000000000004',
        'foodie@example.com',
        NULL,
        'Quang Huy',
        'https://images.example.com/avatars/foodie.jpg',
        'USER'::"Role",
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("email") DO UPDATE
SET
    "passwordHash" = EXCLUDED."passwordHash",
    "displayName" = EXCLUDED."displayName",
    "avatarUrl" = EXCLUDED."avatarUrl",
    "role" = EXCLUDED."role",
    "isActive" = EXCLUDED."isActive",
    "updatedAt" = CURRENT_TIMESTAMP;

-- An expired and revoked synthetic session covers refresh_tokens without
-- creating a reusable active credential.
INSERT INTO "refresh_tokens" (
    "id",
    "userId",
    "tokenHash",
    "expiresAt",
    "revokedAt",
    "createdAt"
)
SELECT
    '80000000-0000-4000-8000-000000000001',
    "id",
    '$argon2id$v=19$m=19456,p=1,t=2$oALNhb9dzaVVPHkE9yQ80A$gOlU8daUl1ywX0PVBWrcxHNOhYw15ohGT9iNpdddoD0',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM "users"
WHERE "email" = 'admin@example.com'
ON CONFLICT ("id") DO UPDATE
SET
    "userId" = EXCLUDED."userId",
    "tokenHash" = EXCLUDED."tokenHash",
    "expiresAt" = EXCLUDED."expiresAt",
    "revokedAt" = EXCLUDED."revokedAt";

-- Synthetic fixture only; it is not a working third-party account.
INSERT INTO "oauth_accounts" (
    "id",
    "userId",
    "provider",
    "providerAccountId",
    "providerEmail",
    "createdAt",
    "updatedAt"
)
SELECT
    '90000000-0000-4000-8000-000000000001',
    "id",
    'GOOGLE'::"OAuthProvider",
    'seed-google-foodie',
    'foodie@example.com',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users"
WHERE "email" = 'foodie@example.com'
ON CONFLICT ("provider", "providerAccountId") DO UPDATE
SET
    "userId" = EXCLUDED."userId",
    "providerEmail" = EXCLUDED."providerEmail",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Canonical Province reference data from src/database/reference-seed.data.ts.
INSERT INTO "provinces" ("id", "name", "slug")
VALUES
    ('10000000-0000-4000-8000-000000000001', 'An Giang', 'an-giang'),
    ('10000000-0000-4000-8000-000000000002', 'Bắc Ninh', 'bac-ninh'),
    ('10000000-0000-4000-8000-000000000003', 'Cà Mau', 'ca-mau'),
    ('10000000-0000-4000-8000-000000000004', 'Cần Thơ', 'can-tho'),
    ('10000000-0000-4000-8000-000000000005', 'Cao Bằng', 'cao-bang'),
    ('10000000-0000-4000-8000-000000000006', 'Đà Nẵng', 'da-nang'),
    ('10000000-0000-4000-8000-000000000007', 'Đắk Lắk', 'dak-lak'),
    ('10000000-0000-4000-8000-000000000008', 'Điện Biên', 'dien-bien'),
    ('10000000-0000-4000-8000-000000000009', 'Đồng Nai', 'dong-nai'),
    ('10000000-0000-4000-8000-000000000010', 'Đồng Tháp', 'dong-thap'),
    ('10000000-0000-4000-8000-000000000011', 'Gia Lai', 'gia-lai'),
    ('10000000-0000-4000-8000-000000000012', 'Hà Nội', 'ha-noi'),
    ('10000000-0000-4000-8000-000000000013', 'Hà Tĩnh', 'ha-tinh'),
    ('10000000-0000-4000-8000-000000000014', 'Hải Phòng', 'hai-phong'),
    ('10000000-0000-4000-8000-000000000015', 'Huế', 'hue'),
    ('10000000-0000-4000-8000-000000000016', 'Hưng Yên', 'hung-yen'),
    ('10000000-0000-4000-8000-000000000017', 'Khánh Hòa', 'khanh-hoa'),
    ('10000000-0000-4000-8000-000000000018', 'Lai Châu', 'lai-chau'),
    ('10000000-0000-4000-8000-000000000019', 'Lâm Đồng', 'lam-dong'),
    ('10000000-0000-4000-8000-000000000020', 'Lạng Sơn', 'lang-son'),
    ('10000000-0000-4000-8000-000000000021', 'Lào Cai', 'lao-cai'),
    ('10000000-0000-4000-8000-000000000022', 'Nghệ An', 'nghe-an'),
    ('10000000-0000-4000-8000-000000000023', 'Ninh Bình', 'ninh-binh'),
    ('10000000-0000-4000-8000-000000000024', 'Phú Thọ', 'phu-tho'),
    ('10000000-0000-4000-8000-000000000025', 'Quảng Ngãi', 'quang-ngai'),
    ('10000000-0000-4000-8000-000000000026', 'Quảng Ninh', 'quang-ninh'),
    ('10000000-0000-4000-8000-000000000027', 'Quảng Trị', 'quang-tri'),
    ('10000000-0000-4000-8000-000000000028', 'Sơn La', 'son-la'),
    ('10000000-0000-4000-8000-000000000029', 'Tây Ninh', 'tay-ninh'),
    ('10000000-0000-4000-8000-000000000030', 'Thái Nguyên', 'thai-nguyen'),
    ('10000000-0000-4000-8000-000000000031', 'Thanh Hóa', 'thanh-hoa'),
    ('10000000-0000-4000-8000-000000000032', 'Hồ Chí Minh', 'ho-chi-minh'),
    ('10000000-0000-4000-8000-000000000033', 'Tuyên Quang', 'tuyen-quang'),
    ('10000000-0000-4000-8000-000000000034', 'Vĩnh Long', 'vinh-long')
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name";

-- Canonical Category reference data from src/database/reference-seed.data.ts.
INSERT INTO "categories" ("id", "name", "slug")
VALUES
    ('20000000-0000-4000-8000-000000000001', 'Biển & đảo', 'bien-dao'),
    ('20000000-0000-4000-8000-000000000002', 'Núi & cao nguyên', 'nui-cao-nguyen'),
    ('20000000-0000-4000-8000-000000000003', 'Thiên nhiên', 'thien-nhien'),
    ('20000000-0000-4000-8000-000000000004', 'Di tích lịch sử', 'di-tich-lich-su'),
    ('20000000-0000-4000-8000-000000000005', 'Văn hóa', 'van-hoa'),
    ('20000000-0000-4000-8000-000000000006', 'Tâm linh', 'tam-linh'),
    ('20000000-0000-4000-8000-000000000007', 'Ẩm thực', 'am-thuc'),
    ('20000000-0000-4000-8000-000000000008', 'Sinh thái', 'sinh-thai'),
    ('20000000-0000-4000-8000-000000000009', 'Nghỉ dưỡng', 'nghi-duong'),
    ('20000000-0000-4000-8000-000000000010', 'Phiêu lưu', 'phieu-luu'),
    ('20000000-0000-4000-8000-000000000011', 'Vui chơi & giải trí', 'vui-choi-giai-tri'),
    ('20000000-0000-4000-8000-000000000012', 'Làng nghề', 'lang-nghe')
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name";

-- Places use natural-key lookups for Province and creator records so this
-- script also works after the existing Prisma reference seed generated IDs.
INSERT INTO "places" (
    "id",
    "name",
    "slug",
    "description",
    "address",
    "latitude",
    "longitude",
    "provinceId",
    "avgRating",
    "reviewCount",
    "status",
    "createdById",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    fixture."name",
    fixture."slug",
    fixture."description",
    fixture."address",
    fixture."latitude",
    fixture."longitude",
    province."id",
    0,
    0,
    'PUBLISHED'::"ContentStatus",
    creator."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        (
            '30000000-0000-4000-8000-000000000001',
            'Vịnh Hạ Long',
            'vinh-ha-long',
            'Di sản thiên nhiên thế giới nổi tiếng với hàng nghìn đảo đá vôi và mặt nước xanh ngọc.',
            'Thành phố Hạ Long, Quảng Ninh',
            20.9101::double precision,
            107.1839::double precision,
            'quang-ninh',
            'admin@example.com'
        ),
        (
            '30000000-0000-4000-8000-000000000002',
            'Phố cổ Hội An',
            'pho-co-hoi-an',
            'Khu phố cổ bên sông Hoài với kiến trúc giao thoa và không gian đèn lồng đặc trưng.',
            'Phường Hội An, Đà Nẵng',
            15.8801::double precision,
            108.3380::double precision,
            'da-nang',
            'editor@example.com'
        ),
        (
            '30000000-0000-4000-8000-000000000003',
            'Phong Nha - Kẻ Bàng',
            'phong-nha-ke-bang',
            'Vườn quốc gia có hệ thống hang động kỳ vĩ, rừng nguyên sinh và nhiều tuyến khám phá.',
            'Quảng Trị',
            17.5904::double precision,
            106.2837::double precision,
            'quang-tri',
            'editor@example.com'
        ),
        (
            '30000000-0000-4000-8000-000000000004',
            'Đà Lạt',
            'da-lat',
            'Thành phố cao nguyên có khí hậu mát mẻ, rừng thông, hồ nước và nhiều nông trại hoa.',
            'Lâm Đồng',
            11.9404::double precision,
            108.4583::double precision,
            'lam-dong',
            'admin@example.com'
        ),
        (
            '30000000-0000-4000-8000-000000000005',
            'Phú Quốc',
            'phu-quoc',
            'Đảo du lịch với bãi biển dài, rừng nguyên sinh, làng chài và nhiều hoạt động nghỉ dưỡng.',
            'Đặc khu Phú Quốc, An Giang',
            10.2899::double precision,
            103.9840::double precision,
            'an-giang',
            'editor@example.com'
        ),
        (
            '30000000-0000-4000-8000-000000000006',
            'Đại Nội Huế',
            'dai-noi-hue',
            'Quần thể cung điện và thành quách triều Nguyễn nằm bên bờ sông Hương.',
            'Phú Hậu, Huế',
            16.4695::double precision,
            107.5780::double precision,
            'hue',
            'admin@example.com'
        )
) AS fixture (
    "id",
    "name",
    "slug",
    "description",
    "address",
    "latitude",
    "longitude",
    "provinceSlug",
    "creatorEmail"
)
JOIN "provinces" AS province
    ON province."slug" = fixture."provinceSlug"
JOIN "users" AS creator
    ON creator."email" = fixture."creatorEmail"
ON CONFLICT ("slug") DO UPDATE
SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "address" = EXCLUDED."address",
    "latitude" = EXCLUDED."latitude",
    "longitude" = EXCLUDED."longitude",
    "provinceId" = EXCLUDED."provinceId",
    "status" = EXCLUDED."status",
    "createdById" = EXCLUDED."createdById",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Many-to-many Place categories.
INSERT INTO "place_categories" ("placeId", "categoryId")
SELECT place."id", category."id"
FROM (
    VALUES
        ('vinh-ha-long', 'bien-dao'),
        ('vinh-ha-long', 'thien-nhien'),
        ('vinh-ha-long', 'nghi-duong'),
        ('pho-co-hoi-an', 'di-tich-lich-su'),
        ('pho-co-hoi-an', 'van-hoa'),
        ('pho-co-hoi-an', 'am-thuc'),
        ('phong-nha-ke-bang', 'thien-nhien'),
        ('phong-nha-ke-bang', 'sinh-thai'),
        ('phong-nha-ke-bang', 'phieu-luu'),
        ('da-lat', 'nui-cao-nguyen'),
        ('da-lat', 'thien-nhien'),
        ('da-lat', 'nghi-duong'),
        ('phu-quoc', 'bien-dao'),
        ('phu-quoc', 'nghi-duong'),
        ('phu-quoc', 'vui-choi-giai-tri'),
        ('dai-noi-hue', 'di-tich-lich-su'),
        ('dai-noi-hue', 'van-hoa'),
        ('dai-noi-hue', 'tam-linh')
) AS fixture ("placeSlug", "categorySlug")
JOIN "places" AS place
    ON place."slug" = fixture."placeSlug"
JOIN "categories" AS category
    ON category."slug" = fixture."categorySlug"
ON CONFLICT ("placeId", "categoryId") DO NOTHING;

-- Representative Commons image fixtures. Run `npm run db:seed:images` after
-- this SQL to resolve and upsert the complete 52-image curated manifest.
INSERT INTO "entity_images" (
    "id",
    "url",
    "sourcePageUrl",
    "altText",
    "author",
    "licenseName",
    "licenseUrl",
    "width",
    "height",
    "sortOrder",
    "provinceId",
    "categoryId",
    "placeId",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    fixture."url",
    fixture."sourcePageUrl",
    fixture."altText",
    fixture."author",
    fixture."licenseName",
    fixture."licenseUrl",
    fixture."width",
    fixture."height",
    0,
    CASE WHEN fixture."ownerType" = 'province' THEN province."id" END,
    CASE WHEN fixture."ownerType" = 'category' THEN category."id" END,
    CASE WHEN fixture."ownerType" = 'place' THEN place."id" END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        (
            '80000000-0000-4000-8000-000000000001',
            'province',
            'quang-ninh',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Ha_Long_Bay_in_2019.jpg/1920px-Ha_Long_Bay_in_2019.jpg',
            'https://commons.wikimedia.org/wiki/File%3AHa_Long_Bay_in_2019.jpg',
            'Limestone islands in Hạ Long Bay, Quảng Ninh',
            'Taewangkorea',
            'CC BY-SA 4.0',
            'https://creativecommons.org/licenses/by-sa/4.0',
            1600,
            1122
        ),
        (
            '80000000-0000-4000-8000-000000000002',
            'category',
            'bien-dao',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Beautiful_beach_on_Phu_Quoc_island_Vietnam_%2839543775721%29.jpg/1920px-Beautiful_beach_on_Phu_Quoc_island_Vietnam_%2839543775721%29.jpg',
            'https://commons.wikimedia.org/wiki/File%3ABeautiful_beach_on_Phu_Quoc_island_Vietnam_(39543775721).jpg',
            'Tropical beach on Phú Quốc Island',
            'dronepicr',
            'CC BY 2.0',
            'https://creativecommons.org/licenses/by/2.0',
            1600,
            1067
        ),
        (
            '80000000-0000-4000-8000-000000000003',
            'place',
            'vinh-ha-long',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Ha_Long_Bay_in_2019.jpg/1920px-Ha_Long_Bay_in_2019.jpg',
            'https://commons.wikimedia.org/wiki/File%3AHa_Long_Bay_in_2019.jpg',
            'Limestone islands in Hạ Long Bay',
            'Taewangkorea',
            'CC BY-SA 4.0',
            'https://creativecommons.org/licenses/by-sa/4.0',
            1600,
            1122
        ),
        (
            '80000000-0000-4000-8000-000000000004',
            'place',
            'pho-co-hoi-an',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/H%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg/1920px-H%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg',
            'https://commons.wikimedia.org/wiki/File%3AH%E1%BB%99i_An%2C_Ancient_Town%2C_2020-01_CN-06.jpg',
            'Lantern-lit street in Hội An Ancient Town',
            'Steffen Schmitz',
            'CC BY-SA 4.0',
            'https://creativecommons.org/licenses/by-sa/4.0',
            1600,
            1029
        ),
        (
            '80000000-0000-4000-8000-000000000005',
            'place',
            'phong-nha-ke-bang',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Phongnhakebang6.jpg/1920px-Phongnhakebang6.jpg',
            'https://commons.wikimedia.org/wiki/File%3APhongnhakebang6.jpg',
            'Karst landscape in Phong Nha–Kẻ Bàng National Park',
            'Genghiskhanviet',
            'Public domain',
            NULL,
            1600,
            1200
        ),
        (
            '80000000-0000-4000-8000-000000000006',
            'place',
            'da-lat',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Xuan_Huong_Lake_11.jpg/1920px-Xuan_Huong_Lake_11.jpg',
            'https://commons.wikimedia.org/wiki/File%3AXuan_Huong_Lake_11.jpg',
            'Xuân Hương Lake in Đà Lạt',
            'Diane Selwyn',
            'CC BY-SA 3.0',
            'https://creativecommons.org/licenses/by-sa/3.0',
            1600,
            1200
        ),
        (
            '80000000-0000-4000-8000-000000000007',
            'place',
            'phu-quoc',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Bai-sao-phu-quoc-tuonglamphotos.jpg/1920px-Bai-sao-phu-quoc-tuonglamphotos.jpg',
            'https://commons.wikimedia.org/wiki/File%3ABai-sao-phu-quoc-tuonglamphotos.jpg',
            'Sao Beach on Phú Quốc Island',
            'Trantuonglam',
            'CC BY-SA 4.0',
            'https://creativecommons.org/licenses/by-sa/4.0',
            1600,
            900
        ),
        (
            '80000000-0000-4000-8000-000000000008',
            'place',
            'dai-noi-hue',
            'https://upload.wikimedia.org/wikipedia/commons/b/b9/%C4%90%E1%BA%A1i_n%E1%BB%99i.jpg',
            'https://commons.wikimedia.org/wiki/File%3A%C4%90%E1%BA%A1i_n%E1%BB%99i.jpg',
            'Imperial City of Huế',
            'NguyenThanhBac123',
            'CC0',
            'https://creativecommons.org/publicdomain/zero/1.0/deed.en',
            900,
            531
        )
) AS fixture (
    "id",
    "ownerType",
    "ownerSlug",
    "url",
    "sourcePageUrl",
    "altText",
    "author",
    "licenseName",
    "licenseUrl",
    "width",
    "height"
)
LEFT JOIN "provinces" AS province
    ON fixture."ownerType" = 'province'
    AND province."slug" = fixture."ownerSlug"
LEFT JOIN "categories" AS category
    ON fixture."ownerType" = 'category'
    AND category."slug" = fixture."ownerSlug"
LEFT JOIN "places" AS place
    ON fixture."ownerType" = 'place'
    AND place."slug" = fixture."ownerSlug"
ON CONFLICT DO NOTHING;

-- Published Posts from system and user sources.
INSERT INTO "posts" (
    "id",
    "authorId",
    "placeId",
    "title",
    "description",
    "content",
    "source",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    author."id",
    place."id",
    fixture."title",
    fixture."description",
    fixture."content",
    fixture."source"::"PostSource",
    'PUBLISHED'::"ContentStatus",
    NULL,
    fixture."createdAt",
    fixture."createdAt"
FROM (
    VALUES
        (
            '40000000-0000-4000-8000-000000000001',
            'admin@example.com',
            'vinh-ha-long',
            'Cẩm nang khám phá Vịnh Hạ Long',
            'Lịch trình hai ngày với những trải nghiệm đáng nhớ nhất trên Vịnh Hạ Long.',
            '<p>Vịnh Hạ Long đẹp nhất khi bạn dành đủ thời gian để đi sâu vào vùng lõi di sản.</p><h2>Ngày đầu trên vịnh</h2><p>Khởi hành từ Tuần Châu, nhận phòng trên tàu và ngắm các đảo đá vôi từ boong tàu.</p><h2>Trải nghiệm nên thử</h2><ul><li>Chèo kayak vào buổi chiều.</li><li>Ngắm hoàng hôn trên boong tàu.</li><li>Thăm hang động vào sáng hôm sau.</li></ul><blockquote>Hãy mang theo kem chống nắng và một áo khoác mỏng cho buổi tối.</blockquote>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '20 days'
        ),
        (
            '40000000-0000-4000-8000-000000000002',
            'editor@example.com',
            'pho-co-hoi-an',
            'Một ngày đi bộ trong phố cổ Hội An',
            'Gợi ý lịch trình đi bộ từ chợ Hội An đến phố đèn lồng bên sông Hoài.',
            '<p>Phố cổ Hội An phù hợp để khám phá chậm rãi bằng cách đi bộ trong một ngày.</p><h2>Buổi sáng</h2><p>Ghé chợ Hội An, thưởng thức một bữa sáng địa phương rồi đi dọc các tuyến phố cổ.</p><h2>Buổi chiều và buổi tối</h2><p>Tham quan các hội quán, nghỉ chân tại một quán cà phê và chờ phố lên đèn bên sông Hoài.</p><p><strong>Lưu ý:</strong> nên mua vé tham quan khu phố cổ tại quầy chính thức.</p>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '16 days'
        ),
        (
            '40000000-0000-4000-8000-000000000003',
            'traveler@example.com',
            'phong-nha-ke-bang',
            'Lần đầu khám phá Phong Nha',
            'Những chuẩn bị cần thiết cho chuyến khám phá hang động đầu tiên tại Phong Nha.',
            '<p>Phong Nha mang đến một hành trình hang động ấn tượng nhưng đòi hỏi sự chuẩn bị phù hợp.</p><h2>Đồ dùng cần mang</h2><ul><li>Giày có độ bám tốt.</li><li>Túi chống nước cho điện thoại.</li><li>Quần áo nhẹ và nhanh khô.</li></ul><h2>An toàn trong hành trình</h2><p>Luôn đi cùng hướng dẫn viên và tuân thủ giới hạn của từng tuyến tham quan.</p>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '12 days'
        ),
        (
            '40000000-0000-4000-8000-000000000004',
            'foodie@example.com',
            'da-lat',
            'Ăn gì trong một cuối tuần ở Đà Lạt',
            'Thực đơn cuối tuần từ bánh căn buổi sáng đến sữa đậu nành nóng buổi tối.',
            '<p>Một cuối tuần ở Đà Lạt sẽ trọn vẹn hơn khi mỗi buổi trong ngày gắn với một món ăn đặc trưng.</p><h2>Bữa sáng</h2><p>Bắt đầu bằng bánh căn nóng, dùng cùng nước chấm và xíu mại.</p><h2>Bữa trưa và buổi tối</h2><p>Ưu tiên rau củ địa phương vào bữa trưa, sau đó kết thúc ngày bằng một ly sữa đậu nành nóng.</p><p>Chọn quán đông khách địa phương và hỏi giá trước khi gọi món.</p>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '8 days'
        ),
        (
            '40000000-0000-4000-8000-000000000005',
            'traveler@example.com',
            'phu-quoc',
            'Lịch trình ba ngày ở Phú Quốc',
            'Lịch trình cân bằng giữa phía bắc đảo, bãi biển và làng chài Phú Quốc.',
            '<p>Ba ngày là khoảng thời gian vừa đủ để kết hợp thiên nhiên, biển và đời sống địa phương ở Phú Quốc.</p><h2>Ngày 1: phía bắc đảo</h2><p>Khám phá rừng và các điểm tham quan ở phía bắc.</p><h2>Ngày 2: biển</h2><p>Dành trọn ngày cho bãi biển, lặn ngắm san hô hoặc nghỉ ngơi.</p><h2>Ngày 3: làng chài</h2><p>Ghé làng chài vào buổi sáng và thưởng thức hải sản trước khi trở về.</p>',
            'USER',
            CURRENT_TIMESTAMP - INTERVAL '4 days'
        ),
        (
            '40000000-0000-4000-8000-000000000006',
            'editor@example.com',
            'dai-noi-hue',
            'Những lưu ý khi tham quan Đại Nội Huế',
            'Cách chọn thời gian, trang phục và lộ trình phù hợp khi tham quan Đại Nội Huế.',
            '<p>Đại Nội Huế có khuôn viên rộng, vì vậy một kế hoạch đơn giản sẽ giúp chuyến tham quan thoải mái hơn.</p><h2>Thời gian phù hợp</h2><p>Nên bắt đầu vào buổi sáng để tránh nắng khi đi qua các sân và khu điện.</p><h2>Trang phục và vật dụng</h2><ul><li>Mặc trang phục lịch sự.</li><li>Mang theo nước uống.</li><li>Chuẩn bị mũ hoặc ô nhỏ.</li></ul><p>Luôn tuân thủ biển hướng dẫn tại các khu vực bảo tồn.</p>',
            'SYSTEM',
            CURRENT_TIMESTAMP - INTERVAL '2 days'
        )
) AS fixture (
    "id",
    "authorEmail",
    "placeSlug",
    "title",
    "description",
    "content",
    "source",
    "createdAt"
)
JOIN "users" AS author
    ON author."email" = fixture."authorEmail"
JOIN "places" AS place
    ON place."slug" = fixture."placeSlug"
ON CONFLICT ("id") DO UPDATE
SET
    "authorId" = EXCLUDED."authorId",
    "placeId" = EXCLUDED."placeId",
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "content" = EXCLUDED."content",
    "source" = EXCLUDED."source",
    "status" = EXCLUDED."status",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Reviews respect the one-review-per-user-per-Place unique constraint.
INSERT INTO "reviews" (
    "id",
    "placeId",
    "authorId",
    "rating",
    "content",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    place."id",
    author."id",
    fixture."rating",
    fixture."content",
    'PUBLISHED'::"ContentStatus",
    NULL,
    fixture."createdAt",
    fixture."createdAt"
FROM (
    VALUES
        (
            '50000000-0000-4000-8000-000000000001',
            'vinh-ha-long',
            'traveler@example.com',
            4,
            'Cảnh đẹp và nhiều hoạt động, nên tránh dịp quá đông khách.',
            CURRENT_TIMESTAMP - INTERVAL '18 days'
        ),
        (
            '50000000-0000-4000-8000-000000000002',
            'vinh-ha-long',
            'foodie@example.com',
            5,
            'Chuyến đi tàu qua đêm rất đáng nhớ và hải sản tươi.',
            CURRENT_TIMESTAMP - INTERVAL '17 days'
        ),
        (
            '50000000-0000-4000-8000-000000000003',
            'pho-co-hoi-an',
            'traveler@example.com',
            5,
            'Không gian buổi tối rất đẹp, dễ dàng khám phá bằng cách đi bộ.',
            CURRENT_TIMESTAMP - INTERVAL '15 days'
        ),
        (
            '50000000-0000-4000-8000-000000000004',
            'phong-nha-ke-bang',
            'traveler@example.com',
            5,
            'Thiên nhiên ngoạn mục, hướng dẫn viên chuyên nghiệp.',
            CURRENT_TIMESTAMP - INTERVAL '11 days'
        ),
        (
            '50000000-0000-4000-8000-000000000005',
            'da-lat',
            'foodie@example.com',
            4,
            'Thời tiết dễ chịu và đồ ăn đa dạng.',
            CURRENT_TIMESTAMP - INTERVAL '7 days'
        ),
        (
            '50000000-0000-4000-8000-000000000006',
            'phu-quoc',
            'traveler@example.com',
            4,
            'Biển đẹp, nên dành thời gian khám phá các khu vực ít đông hơn.',
            CURRENT_TIMESTAMP - INTERVAL '3 days'
        ),
        (
            '50000000-0000-4000-8000-000000000007',
            'phu-quoc',
            'foodie@example.com',
            5,
            'Hải sản phong phú và có nhiều lựa chọn nghỉ dưỡng.',
            CURRENT_TIMESTAMP - INTERVAL '2 days'
        ),
        (
            '50000000-0000-4000-8000-000000000008',
            'dai-noi-hue',
            'foodie@example.com',
            4,
            'Kiến trúc đẹp, cần nhiều thời gian để xem hết các khu vực.',
            CURRENT_TIMESTAMP - INTERVAL '1 day'
        )
) AS fixture (
    "id",
    "placeSlug",
    "authorEmail",
    "rating",
    "content",
    "createdAt"
)
JOIN "places" AS place
    ON place."slug" = fixture."placeSlug"
JOIN "users" AS author
    ON author."email" = fixture."authorEmail"
ON CONFLICT ("placeId", "authorId") DO UPDATE
SET
    "rating" = EXCLUDED."rating",
    "content" = EXCLUDED."content",
    "status" = EXCLUDED."status",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Root comments are inserted before replies.
INSERT INTO "comments" (
    "id",
    "authorId",
    "targetType",
    "targetId",
    "parentId",
    "content",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    author."id",
    fixture."targetType"::"CommentTargetType",
    fixture."targetId",
    NULL,
    fixture."content",
    'PUBLISHED'::"ContentStatus",
    NULL,
    fixture."createdAt",
    fixture."createdAt"
FROM (
    VALUES
        (
            '60000000-0000-4000-8000-000000000001',
            'traveler@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000001',
            'Tháng nào đi Hạ Long thì thời tiết ổn định nhất?',
            CURRENT_TIMESTAMP - INTERVAL '10 days'
        ),
        (
            '60000000-0000-4000-8000-000000000004',
            'foodie@example.com',
            'REVIEW',
            '50000000-0000-4000-8000-000000000001',
            'Mình cũng thấy ngày cuối tuần thường khá đông.',
            CURRENT_TIMESTAMP - INTERVAL '6 days'
        ),
        (
            '60000000-0000-4000-8000-000000000006',
            'foodie@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000002',
            'Buổi tối ở Hội An có món ăn nào nhất định phải thử không?',
            CURRENT_TIMESTAMP - INTERVAL '5 days'
        )
) AS fixture (
    "id",
    "authorEmail",
    "targetType",
    "targetId",
    "content",
    "createdAt"
)
JOIN "users" AS author
    ON author."email" = fixture."authorEmail"
ON CONFLICT ("id") DO UPDATE
SET
    "authorId" = EXCLUDED."authorId",
    "targetType" = EXCLUDED."targetType",
    "targetId" = EXCLUDED."targetId",
    "parentId" = NULL,
    "content" = EXCLUDED."content",
    "status" = EXCLUDED."status",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "comments" (
    "id",
    "authorId",
    "targetType",
    "targetId",
    "parentId",
    "content",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    author."id",
    fixture."targetType"::"CommentTargetType",
    fixture."targetId",
    fixture."parentId",
    fixture."content",
    'PUBLISHED'::"ContentStatus",
    NULL,
    fixture."createdAt",
    fixture."createdAt"
FROM (
    VALUES
        (
            '60000000-0000-4000-8000-000000000002',
            'editor@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000001',
            'Khoảng tháng 10 đến tháng 12 thường mát và ít mưa hơn.',
            CURRENT_TIMESTAMP - INTERVAL '9 days'
        ),
        (
            '60000000-0000-4000-8000-000000000003',
            'foodie@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000002',
            'Cảm ơn thông tin, mình sẽ lên lịch vào tháng 11.',
            CURRENT_TIMESTAMP - INTERVAL '8 days'
        ),
        (
            '60000000-0000-4000-8000-000000000005',
            'traveler@example.com',
            'REVIEW',
            '50000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000004',
            'Đi giữa tuần sẽ thoải mái hơn khá nhiều.',
            CURRENT_TIMESTAMP - INTERVAL '5 days'
        )
) AS fixture (
    "id",
    "authorEmail",
    "targetType",
    "targetId",
    "parentId",
    "content",
    "createdAt"
)
JOIN "users" AS author
    ON author."email" = fixture."authorEmail"
ON CONFLICT ("id") DO UPDATE
SET
    "authorId" = EXCLUDED."authorId",
    "targetType" = EXCLUDED."targetType",
    "targetId" = EXCLUDED."targetId",
    "parentId" = EXCLUDED."parentId",
    "content" = EXCLUDED."content",
    "status" = EXCLUDED."status",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Reactions exercise Post, Review, and Comment polymorphic targets.
INSERT INTO "reactions" (
    "id",
    "userId",
    "targetType",
    "targetId",
    "type",
    "createdAt",
    "updatedAt"
)
SELECT
    fixture."id",
    reactor."id",
    fixture."targetType"::"ReactionTargetType",
    fixture."targetId",
    fixture."type"::"ReactionType",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        (
            '70000000-0000-4000-8000-000000000001',
            'traveler@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000001',
            'LOVE'
        ),
        (
            '70000000-0000-4000-8000-000000000002',
            'foodie@example.com',
            'POST',
            '40000000-0000-4000-8000-000000000001',
            'LIKE'
        ),
        (
            '70000000-0000-4000-8000-000000000003',
            'editor@example.com',
            'COMMENT',
            '60000000-0000-4000-8000-000000000001',
            'WOW'
        ),
        (
            '70000000-0000-4000-8000-000000000004',
            'admin@example.com',
            'REVIEW',
            '50000000-0000-4000-8000-000000000001',
            'LIKE'
        ),
        (
            '70000000-0000-4000-8000-000000000005',
            'foodie@example.com',
            'REVIEW',
            '50000000-0000-4000-8000-000000000004',
            'LOVE'
        ),
        (
            '70000000-0000-4000-8000-000000000006',
            'traveler@example.com',
            'COMMENT',
            '60000000-0000-4000-8000-000000000004',
            'LIKE'
        )
) AS fixture (
    "id",
    "reactorEmail",
    "targetType",
    "targetId",
    "type"
)
JOIN "users" AS reactor
    ON reactor."email" = fixture."reactorEmail"
ON CONFLICT ("userId", "targetType", "targetId") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Direct SQL bypasses the Review queue, so synchronize the denormalized Place
-- aggregates for every seeded Place.
UPDATE "places" AS place
SET
    "avgRating" = COALESCE(
        (
            SELECT AVG(review."rating")::double precision
            FROM "reviews" AS review
            WHERE review."placeId" = place."id"
              AND review."status" = 'PUBLISHED'::"ContentStatus"
              AND review."deletedAt" IS NULL
        ),
        0::double precision
    ),
    "reviewCount" = (
        SELECT COUNT(*)::integer
        FROM "reviews" AS review
        WHERE review."placeId" = place."id"
          AND review."status" = 'PUBLISHED'::"ContentStatus"
          AND review."deletedAt" IS NULL
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE place."slug" IN (
    'vinh-ha-long',
    'pho-co-hoi-an',
    'phong-nha-ke-bang',
    'da-lat',
    'phu-quoc',
    'dai-noi-hue'
);

-- Fail the transaction if a future edit breaks an intended polymorphic link,
-- nested-comment invariant, administrator credential metadata, or aggregate.
DO $seed_validation$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "users"
        WHERE "email" = 'admin@example.com'
          AND "role" = 'ADMIN'::"Role"
          AND "isActive" = true
          AND "passwordHash" LIKE '$argon2id$%'
    ) THEN
        RAISE EXCEPTION 'Seed validation failed: administrator is missing or invalid';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "comments" AS comment
        WHERE comment."id" LIKE '60000000-0000-4000-8000-%'
          AND (
              (
                  comment."targetType" = 'POST'::"CommentTargetType"
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "posts" AS post
                      WHERE post."id" = comment."targetId"
                  )
              )
              OR (
                  comment."targetType" = 'REVIEW'::"CommentTargetType"
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "reviews" AS review
                      WHERE review."id" = comment."targetId"
                  )
              )
              OR (
                  comment."parentId" IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "comments" AS parent
                      WHERE parent."id" = comment."parentId"
                        AND parent."targetType" = comment."targetType"
                        AND parent."targetId" = comment."targetId"
                  )
              )
          )
    ) THEN
        RAISE EXCEPTION 'Seed validation failed: invalid Comment target or parent';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "reactions" AS reaction
        WHERE reaction."id" LIKE '70000000-0000-4000-8000-%'
          AND (
              (
                  reaction."targetType" = 'POST'::"ReactionTargetType"
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "posts" AS post
                      WHERE post."id" = reaction."targetId"
                  )
              )
              OR (
                  reaction."targetType" = 'REVIEW'::"ReactionTargetType"
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "reviews" AS review
                      WHERE review."id" = reaction."targetId"
                  )
              )
              OR (
                  reaction."targetType" = 'COMMENT'::"ReactionTargetType"
                  AND NOT EXISTS (
                      SELECT 1
                      FROM "comments" AS comment
                      WHERE comment."id" = reaction."targetId"
                  )
              )
          )
    ) THEN
        RAISE EXCEPTION 'Seed validation failed: invalid Reaction target';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "places" AS place
        WHERE place."slug" IN (
            'vinh-ha-long',
            'pho-co-hoi-an',
            'phong-nha-ke-bang',
            'da-lat',
            'phu-quoc',
            'dai-noi-hue'
        )
          AND (
              place."reviewCount" <> (
                  SELECT COUNT(*)::integer
                  FROM "reviews" AS review
                  WHERE review."placeId" = place."id"
                    AND review."status" = 'PUBLISHED'::"ContentStatus"
                    AND review."deletedAt" IS NULL
              )
              OR ABS(
                  place."avgRating" - COALESCE(
                      (
                          SELECT AVG(review."rating")::double precision
                          FROM "reviews" AS review
                          WHERE review."placeId" = place."id"
                            AND review."status" = 'PUBLISHED'::"ContentStatus"
                            AND review."deletedAt" IS NULL
                      ),
                      0::double precision
                  )
              ) > 0.000001
          )
    ) THEN
        RAISE EXCEPTION 'Seed validation failed: Place rating aggregate mismatch';
    END IF;
END
$seed_validation$;

COMMIT;

-- Read-only summary. Counts include any pre-existing application data.
SELECT *
FROM (
    VALUES
        ('users', (SELECT COUNT(*) FROM "users")),
        ('refresh_tokens', (SELECT COUNT(*) FROM "refresh_tokens")),
        ('oauth_accounts', (SELECT COUNT(*) FROM "oauth_accounts")),
        ('provinces', (SELECT COUNT(*) FROM "provinces")),
        ('categories', (SELECT COUNT(*) FROM "categories")),
        ('places', (SELECT COUNT(*) FROM "places")),
        ('place_categories', (SELECT COUNT(*) FROM "place_categories")),
        ('entity_images', (SELECT COUNT(*) FROM "entity_images")),
        ('posts', (SELECT COUNT(*) FROM "posts")),
        ('reviews', (SELECT COUNT(*) FROM "reviews")),
        ('comments', (SELECT COUNT(*) FROM "comments")),
        ('reactions', (SELECT COUNT(*) FROM "reactions"))
) AS seeded_table_summary ("table", "rowCount")
ORDER BY "table";
